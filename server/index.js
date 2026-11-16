'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { WebSocketServer } = require('ws');
const config = require('./config');
const db = require('./db');
const auth = require('./auth');
const Game = require('./game');
const weather = require('./weather');
const admin = require('./admin');

const game = new Game();
const PUBLIC = path.join(__dirname, '..', 'public');
const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/game.js': ['game.js', 'text/javascript; charset=utf-8'],
  '/world.js': ['world.js', 'text/javascript; charset=utf-8'],
  '/fonts/Maplestory-Light.ttf': ['fonts/Maplestory-Light.ttf', 'font/ttf', true],
  '/fonts/Maplestory-Bold.ttf': ['fonts/Maplestory-Bold.ttf', 'font/ttf', true]
};
const fontCache = new Map();          // 글꼴은 크므로 한 번 압축해 두고 다시 쓴다
const CSP = "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
// 관리자 화면은 외부 스크립트를 전혀 쓰지 않는다
const ADMIN_CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

const apiLimit = auth.limiter(40, 60 * 1000);            // IP당 1분 40회
const signupLimit = auth.limiter(5, 60 * 60 * 1000);     // IP당 1시간 가입 5회
const loginFailUser = auth.limiter(5, 10 * 60 * 1000);   // 아이디당 10분 동안 5번 틀리면 잠금
const loginFailIp = auth.limiter(20, 10 * 60 * 1000);
const wsLimit = auth.limiter(30, 60 * 1000);

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (config.production && typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}
function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 2048) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const RE_USER = /^[a-z0-9_]{4,16}$/;
const RE_NICK = /^[가-힣a-zA-Z0-9_]{2,10}$/;

async function signup(req, res, ip) {
  const b = await readBody(req);
  const username = typeof b.username === 'string' ? b.username : '';
  const nickname = typeof b.nickname === 'string' ? b.nickname : '';
  const password = typeof b.password === 'string' ? b.password : '';
  if (!RE_USER.test(username)) return json(res, 400, { ok: false, error: '아이디는 영문 소문자, 숫자, 밑줄로 4~16자여야 합니다.' });
  if (!RE_NICK.test(nickname)) return json(res, 400, { ok: false, error: '닉네임은 한글, 영문, 숫자로 2~10자여야 합니다.' });
  if (password.length < 8 || password.length > 72) return json(res, 400, { ok: false, error: '비밀번호는 8자 이상이어야 합니다.' });
  if (!game.live.signupOpen) return json(res, 403, { ok: false, error: '지금은 새 가입을 받지 않습니다.' });
  if (!signupLimit.hit(ip)) return json(res, 429, { ok: false, error: '가입 시도가 너무 많습니다. 나중에 다시 시도해 주세요.' });
  const r = await db.createUser(username, nickname, await auth.hashPassword(password), config.maxUsers);
  if (r.error === 'full') return json(res, 403, { ok: false, error: '가입 정원(' + config.maxUsers + '명)이 모두 찼습니다. 더 이상 가입할 수 없습니다.' });
  if (r.error === 'username') return json(res, 409, { ok: false, error: '이미 사용 중인 아이디입니다.' });
  if (r.error === 'nickname') return json(res, 409, { ok: false, error: '이미 사용 중인 닉네임입니다.' });
  json(res, 200, { ok: true, token: auth.signToken(r.id) });
}

async function login(req, res, ip) {
  const b = await readBody(req);
  const username = typeof b.username === 'string' ? b.username.slice(0, 32) : '';
  const password = typeof b.password === 'string' ? b.password.slice(0, 72) : '';
  if (loginFailUser.over(username) || loginFailIp.over(ip)) {
    return json(res, 429, { ok: false, error: '로그인을 여러 번 틀렸습니다. 10분 뒤에 다시 시도해 주세요.' });
  }
  const user = RE_USER.test(username) ? await db.findByUsername(username) : null;
  const ok = await auth.checkPassword(password, user ? user.pass_hash : auth.dummyHash);
  if (!user || !ok) {
    loginFailUser.hit(username); loginFailIp.hit(ip);
    return json(res, 401, { ok: false, error: '아이디 또는 비밀번호가 맞지 않습니다.' });
  }
  if (user.banned) return json(res, 403, { ok: false, error: '이용이 정지된 계정입니다.' });
  loginFailUser.clear(username);
  json(res, 200, { ok: true, token: auth.signToken(user.id) });
}

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (config.production) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    if (req.headers['x-forwarded-proto'] === 'http') {      // HTTPS만 사용
      res.writeHead(301, { Location: 'https://' + req.headers.host + url });
      return res.end();
    }
  }
  if (req.method === 'GET' && url === '/healthz') { res.writeHead(200); return res.end('ok'); }

  if (req.method === 'POST' && (url === '/api/signup' || url === '/api/login')) {
    const ip = clientIp(req);
    if (!apiLimit.hit(ip)) return json(res, 429, { ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
    if (!/^application\/json/.test(req.headers['content-type'] || '')) return json(res, 400, { ok: false, error: '잘못된 요청입니다.' });
    (url === '/api/signup' ? signup : login)(req, res, ip).catch(e => {
      if (!(e instanceof SyntaxError) && e.message !== 'too large') console.error(e);
      if (!res.headersSent) json(res, 400, { ok: false, error: '요청을 처리하지 못했습니다.' });
    });
    return;
  }

  if (admin.handle(req, res, url, clientIp(req), game, (name, type) => {
    fs.readFile(path.join(PUBLIC, name), (err, data) => {
      if (err) { res.writeHead(500); return res.end(); }
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Security-Policy': ADMIN_CSP, 'X-Frame-Options': 'DENY' });
      res.end(data);
    });
  })) return;

  const file = req.method === 'GET' ? FILES[url] : null;
  if (!file) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
  if (file[2]) {
    let buf = fontCache.get(file[0]);
    if (!buf) {
      try { buf = zlib.gzipSync(fs.readFileSync(path.join(PUBLIC, file[0]))); } catch (e) { res.writeHead(500); return res.end(); }
      fontCache.set(file[0], buf);
    }
    const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    const head = { 'Content-Type': file[1], 'Cache-Control': 'public, max-age=604800', 'Vary': 'Accept-Encoding' };
    if (gz) head['Content-Encoding'] = 'gzip';
    res.writeHead(200, head);
    return res.end(gz ? buf : zlib.gunzipSync(buf));
  }
  fs.readFile(path.join(PUBLIC, file[0]), (err, data) => {
    if (err) { res.writeHead(500); return res.end(); }
    res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-cache', 'Content-Security-Policy': CSP });
    res.end(data);
  });
});

// 실시간 통신. 접속하면 5초 안에 로그인 토큰을 보내야 한다.
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
server.on('upgrade', (req, socket, head) => {
  const url = (req.url || '').split('?')[0];
  const origin = req.headers.origin;
  let originOk = !origin;
  if (origin) { try { originOk = new URL(origin).host === req.headers.host; } catch (e) { originOk = false; } }
  if (url !== '/ws' || !originOk || !wsLimit.hit(clientIp(req))) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
});

wss.on('connection', ws => {
  let player = null, authing = false;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  const authTimer = setTimeout(() => { if (!player) ws.close(4003); }, 5000);

  ws.on('message', async (data, isBinary) => {
    if (isBinary) return;
    const raw = data.toString('utf8');
    if (player) return game.onMessage(player, raw);
    if (authing) return;
    authing = true;
    try {
      const m = JSON.parse(raw);
      const uid = m && m.t === 'auth' ? auth.verifyToken(m.token) : null;
      const user = uid ? await db.findById(uid) : null;
      if (!user || user.banned) {
        ws.send(JSON.stringify({ t: 'authfail', m: '다시 로그인해 주세요.' }));
        return ws.close(4004);
      }
      if (ws.readyState !== 1) return;
      player = game.add(ws, user);
    } catch (e) { ws.close(4004); }
  });
  ws.on('close', () => { clearTimeout(authTimer); if (player) game.remove(player); });
  ws.on('error', () => {});
});

// 응답 없는 연결 정리
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 25000).unref();

db.init().then(() => admin.start()).then(() => game.init()).then(() => {
  weather.start();
  server.listen(config.port, () => {
    console.log('본사 서버 시작: 포트 ' + config.port + ', 저장소 ' + db.kind);
    if (db.kind === 'memory') console.warn('[주의] DATABASE_URL 이 없어 연습용 저장소를 씁니다. 서버가 꺼지면 계정이 사라집니다.');
  });
}).catch(e => { console.error('DB 연결 실패:', e.message); process.exit(1); });

module.exports = { server, game };
