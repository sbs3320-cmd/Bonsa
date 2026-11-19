'use strict';
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { WebSocketServer } = require('ws');
const config = require('./config');
const db = require('./db');
const auth = require('./auth');
const Game = require('./game');
const World = require('../public/world');
const weather = require('./weather');
const admin = require('./admin');

const game = new Game();
const PUBLIC = path.join(__dirname, '..', 'public');
const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/game.js': ['game.js', 'text/javascript; charset=utf-8'],
  '/world.js': ['world.js', 'text/javascript; charset=utf-8'],
  '/fonts/Maplestory-Light.ttf': ['fonts/Maplestory-Light.ttf', 'font/ttf', true],
  '/fonts/Maplestory-Bold.ttf': ['fonts/Maplestory-Bold.ttf', 'font/ttf', true],
  // 홈 화면 앱 (PWA)
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json; charset=utf-8'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/icons/icon-96.png': ['icons/icon-96.png', 'image/png', true],
  '/icons/icon-192.png': ['icons/icon-192.png', 'image/png', true],
  '/icons/icon-512.png': ['icons/icon-512.png', 'image/png', true],
  '/icons/maskable-512.png': ['icons/maskable-512.png', 'image/png', true],
  '/icons/apple-touch-icon.png': ['icons/apple-touch-icon.png', 'image/png', true],
  '/apple-touch-icon.png': ['icons/apple-touch-icon.png', 'image/png', true]
};
const fontCache = new Map();          // 글꼴·아이콘은 한 번 압축해 두고 다시 쓴다
const CSP = "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; connect-src 'self' https://cdnjs.cloudflare.com; worker-src 'self'; manifest-src 'self'; " +
  "frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
// 관리자 화면은 외부 스크립트를 전혀 쓰지 않는다
const ADMIN_CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

const apiLimit = auth.limiter(config.apiPerMin, 60 * 1000);                  // IP당 1분 요청 수
const signupLimit = auth.limiter(config.signupPerHour, 60 * 60 * 1000);      // IP당 1시간 가입 수
const signupAll = auth.limiter(config.signupPerHourAll, 60 * 60 * 1000);     // 전체 합계 (IP를 바꿔 가며 가입하는 경우 대비)
const loginFailAll = auth.limiter(300, 10 * 60 * 1000);                     // 전체 합계 로그인 실패
const loginFailUser = auth.limiter(5, 10 * 60 * 1000);   // 아이디당 10분 동안 5번 틀리면 잠금
const loginFailIp = auth.limiter(20, 10 * 60 * 1000);
const wsLimit = auth.limiter(config.wsPerMin, 60 * 1000);

function clientIp(req) {
  if (config.production) {
    // Render 는 Cloudflare 뒤에 있다. X-Forwarded-For 의 앞쪽 값은 접속자가 마음대로 써넣을 수 있어서(IP 속이기),
    // Cloudflare 가 직접 덮어쓰는 CF-Connecting-IP 를 먼저 믿는다.
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf && cf.length < 64) return cf.trim();
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim().slice(0, 64);
  }
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

// 가입: 닉네임이 곧 로그인 이름이다 (사용자 결정). 내부 계정 이름(username)은 서버가 무작위로 만든다.
// 단, 닉네임이 총관리자 계정 이름(SUPERADMIN_USERNAME)과 같으면 그 계정 이름을 그대로 쓴다.
// 그 이름이 이미 있으면 '사용 중'이 되므로, 아무나 총관리자가 될 수는 없다 (예전 아이디 방식과 같은 규칙).
async function signup(req, res, ip) {
  const b = await readBody(req);
  const nickname = typeof b.nickname === 'string' ? b.nickname.trim() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  if (!RE_NICK.test(nickname)) return json(res, 400, { ok: false, error: '닉네임은 한글, 영문, 숫자로 2~10자여야 합니다.' });
  if (password.length < World.PASS_MIN || password.length > 72) return json(res, 400, { ok: false, error: '비밀번호는 ' + World.PASS_MIN + '자 이상이어야 합니다.' });
  if (!game.live.signupOpen) return json(res, 403, { ok: false, error: '지금은 새 가입을 받지 않습니다.' });
  if (!signupLimit.hit(ip) || !signupAll.hit('all')) return json(res, 429, { ok: false, error: '가입 시도가 너무 많습니다. 나중에 다시 시도해 주세요.' });
  if (await db.nicknameTaken(nickname)) return json(res, 409, { ok: false, error: '이미 사용 중인 닉네임입니다.' });
  const owner = !!config.superAdmin && nickname.toLowerCase() === config.superAdmin;
  const username = owner ? config.superAdmin : 'u' + crypto.randomBytes(6).toString('hex');
  const r = await db.createUser(username, nickname, await auth.hashPassword(password), config.maxUsers);
  if (r.error === 'full') return json(res, 403, { ok: false, error: '가입 정원(' + config.maxUsers + '명)이 모두 찼습니다. 더 이상 가입할 수 없습니다.' });
  if (r.error === 'username') return json(res, 409, { ok: false, error: owner ? '이미 사용 중인 닉네임입니다.' : '잠시 후 다시 시도해 주세요.' });
  if (r.error === 'nickname') return json(res, 409, { ok: false, error: '이미 사용 중인 닉네임입니다.' });
  json(res, 200, { ok: true, token: auth.signToken(r.id, 0, b.remember === true) });
}

async function login(req, res, ip) {
  const b = await readBody(req);
  // 닉네임으로 로그인한다. 예전 아이디를 넣어도 찾아 준다. 잠금은 실제 계정 단위로 센다.
  const name = typeof b.nickname === 'string' ? b.nickname.trim().slice(0, 32) : typeof b.username === 'string' ? b.username.trim().slice(0, 32) : '';
  const password = typeof b.password === 'string' ? b.password.slice(0, 72) : '';
  const valid = RE_NICK.test(name) || RE_USER.test(name.toLowerCase());
  const user = valid ? await db.findByLogin(name) : null;
  const key = user ? 'id:' + user.id : 'n:' + name.toLowerCase();
  if (loginFailUser.over(key) || loginFailIp.over(ip) || loginFailAll.over('all')) {
    return json(res, 429, { ok: false, error: '로그인을 여러 번 틀렸습니다. 10분 뒤에 다시 시도해 주세요.' });
  }
  const ok = await auth.checkPassword(password, user ? user.pass_hash : auth.dummyHash);
  if (!user || !ok) {
    loginFailUser.hit(key); loginFailIp.hit(ip); loginFailAll.hit('all');
    return json(res, 401, { ok: false, error: '닉네임 또는 비밀번호가 맞지 않습니다.' });
  }
  if (user.banned) return json(res, 403, { ok: false, error: '이용이 정지된 계정입니다.' });
  loginFailUser.clear(key);
  json(res, 200, { ok: true, token: auth.signToken(user.id, Number(user.token_ver) || 0, b.remember === true) });
}

// 비밀번호 변경: 로그인 토큰 + 지금 비밀번호를 둘 다 확인한다 (토큰만 훔쳐서는 바꿀 수 없게)
async function changePassword(req, res, ip) {
  const b = await readBody(req);
  const tk = auth.readToken(b.token), uid = tk ? tk.u : null;
  const oldPw = typeof b.old === 'string' ? b.old.slice(0, 72) : '', newPw = typeof b.next === 'string' ? b.next : '';
  const user = uid ? await db.findById(uid) : null;
  if (!user || user.banned || !auth.tokenOk(tk, user)) return json(res, 401, { ok: false, error: '다시 로그인해 주세요.' });
  if (loginFailUser.over('id:' + user.id) || loginFailIp.over(ip)) return json(res, 429, { ok: false, error: '여러 번 틀렸습니다. 10분 뒤에 다시 시도해 주세요.' });
  if (newPw.length < World.PASS_MIN || newPw.length > 72) return json(res, 400, { ok: false, error: '새 비밀번호는 ' + World.PASS_MIN + '자 이상이어야 합니다.' });
  if (!(await auth.checkPassword(oldPw, user.pass_hash))) {
    loginFailUser.hit('id:' + user.id); loginFailIp.hit(ip);
    return json(res, 401, { ok: false, error: '지금 비밀번호가 맞지 않습니다.' });
  }
  if (newPw === oldPw) return json(res, 400, { ok: false, error: '지금과 다른 비밀번호를 넣어 주세요.' });
  const ver = await db.setPassword(user.id, await auth.hashPassword(newPw));
  await db.audit(user.id, 'password', '비밀번호 변경 (다른 기기 자동 로그인 해제)');
  json(res, 200, { ok: true, token: auth.signToken(user.id, ver, tk.r) });      // 지금 기기는 새 토큰으로 계속
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

  if (req.method === 'POST' && (url === '/api/signup' || url === '/api/login' || url === '/api/password')) {
    const ip = clientIp(req);
    if (!apiLimit.hit(ip)) return json(res, 429, { ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
    if (!/^application\/json/.test(req.headers['content-type'] || '')) return json(res, 400, { ok: false, error: '잘못된 요청입니다.' });
    (url === '/api/signup' ? signup : url === '/api/login' ? login : changePassword)(req, res, ip).catch(e => {
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
// 한 메시지는 4KB까지 (가장 긴 게시글이 한글 500자 = 약 1.6KB)
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
server.on('upgrade', (req, socket, head) => {
  const url = (req.url || '').split('?')[0];
  const origin = req.headers.origin;
  let originOk = !origin;
  if (origin) { try { originOk = new URL(origin).host === req.headers.host; } catch (e) { originOk = false; } }
  if (url !== '/ws' || !originOk || !wsLimit.hit(clientIp(req))) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
});

wss.on('connection', ws => {
  let player = null, authing = false, floodSec = 0, floodCount = 0, floodBad = 0;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  const authTimer = setTimeout(() => { if (!player) ws.close(4003); }, 5000);

  ws.on('message', async (data, isBinary) => {
    if (isBinary) return;
    // 메시지 폭주 막기: 1초에 60개가 넘으면 버리고, 그런 상태가 5초 이어지면 끊는다
    const sec = Math.floor(Date.now() / 1000);
    if (sec !== floodSec) { if (floodCount > 60) floodBad++; else floodBad = 0; floodSec = sec; floodCount = 0; }
    if (++floodCount > 60) { if (floodBad >= 5) ws.close(4008); return; }
    const raw = data.toString('utf8');
    if (player) return game.onMessage(player, raw);
    if (authing) return;
    authing = true;
    try {
      const m = JSON.parse(raw);
      const tk = m && m.t === 'auth' ? auth.readToken(m.token) : null;
      const user = tk ? await db.findById(tk.u) : null;
      if (!user || user.banned || !auth.tokenOk(tk, user)) {
        ws.send(JSON.stringify({ t: 'authfail', m: '다시 로그인해 주세요.' }));
        return ws.close(4004);
      }
      if (ws.readyState !== 1) return;
      player = game.add(ws, user);
      // 자동 로그인: 접속할 때마다 30일짜리 새 토큰으로 바꿔 준다 (계속 쓰면 로그인이 풀리지 않는다)
      if (tk.r) ws.send(JSON.stringify({ t: 'token', token: auth.signToken(user.id, Number(user.token_ver) || 0, true) }));
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

// 예상하지 못한 오류 하나로 서버 전체가 꺼지지 않게 기록만 하고 계속 돈다
process.on('unhandledRejection', e => console.error('처리되지 않은 오류(비동기):', e));
process.on('uncaughtException', e => console.error('처리되지 않은 오류:', e));

db.init().then(() => admin.start()).then(() => game.init()).then(() => {
  weather.start();
  server.listen(config.port, () => {
    console.log('본사 서버 시작: 포트 ' + config.port + ', 저장소 ' + db.kind);
    if (db.kind === 'memory') console.warn('[주의] DATABASE_URL 이 없어 연습용 저장소를 씁니다. 서버가 꺼지면 계정이 사라집니다.');
  });
}).catch(e => { console.error('DB 연결 실패:', e.message); process.exit(1); });

module.exports = { server, game };
