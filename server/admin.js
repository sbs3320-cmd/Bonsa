'use strict';
// 총관리자 화면의 서버 쪽. 게임과 분리된 주소(/admin)에서만 쓰이고, 게임의 로그인 토큰으로는 들어올 수 없다.
//  - 들어오려면: 총관리자 아이디 + 비밀번호 + 인증 앱의 6자리 코드(2단계 인증)
//  - 세션은 30분짜리 쿠키(HttpOnly, SameSite=Strict). 자바스크립트로 읽을 수 없고 다른 사이트에서 보낼 수 없다.
//  - 모든 요청에서 세션, 출처(Origin), 전용 헤더를 다시 확인하고, 한 일은 전부 감사 기록에 남긴다.
const crypto = require('crypto');
const config = require('./config');
const db = require('./db');
const auth = require('./auth');
const totp = require('./totp');
const World = require('../public/world.js');

const SESSION_MS = 30 * 60 * 1000;
const COOKIE = 'bonsa_admin';
const RANKS = ['intern', 'staff', 'deputy', 'lead', 'manager', 'ceo'];
const failIp = auth.limiter(5, 15 * 60 * 1000);       // IP당 15분 동안 5번 틀리면 잠금
const failAll = auth.limiter(30, 15 * 60 * 1000);     // 전체 합쳐 30번 틀리면 잠금 (여러 IP로 나눠 시도하는 경우)
const reqLimit = auth.limiter(120, 60 * 1000);
let pending = null;                                   // 2단계 인증을 처음 등록하는 동안의 임시 비밀값
let lastStep = 0;                                     // 마지막으로 쓴 코드의 시간 칸 (같은 코드 재사용 방지)

const key = crypto.createHash('sha256').update('bonsa-admin:' + config.sessionSecret).digest();
function sign(obj) {
  const body = Buffer.from(JSON.stringify(obj)).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', key).update(body).digest('base64url');
}
function unsign(token) {
  if (typeof token !== 'string' || token.length > 400) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const a = Buffer.from(parts[1]), b = Buffer.from(crypto.createHmac('sha256', key).update(parts[0]).digest('base64url'));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const d = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); return d && d.e > Date.now() ? d : null; } catch (e) { return null; }
}
// 인증 앱 비밀값은 DB에 암호화해서 둔다 (AES-256-GCM, 열쇠는 SESSION_SECRET 에서 만든다)
function seal(text) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
function unseal(b64) {
  try {
    const raw = Buffer.from(b64, 'base64'), d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch (e) { return null; }
}

function json(res, status, obj, cookie) {
  const head = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (cookie !== undefined) head['Set-Cookie'] = cookie;
  res.writeHead(status, head);
  res.end(JSON.stringify(obj));
}
function cookieFor(obj) {
  const v = obj ? sign(obj) : '';
  return COOKIE + '=' + v + '; Path=/admin; HttpOnly; SameSite=Strict' + (config.production ? '; Secure' : '') + '; Max-Age=' + (obj ? Math.floor(SESSION_MS / 1000) : 0);
}
function session(req) {
  const m = /(?:^|;\s*)bonsa_admin=([^;]+)/.exec(req.headers.cookie || '');
  return m ? unsign(m[1]) : null;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 16384) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function sameOrigin(req) {
  const o = req.headers.origin;
  if (!o) return false;
  try { return new URL(o).host === req.headers.host; } catch (e) { return false; }
}

async function login(req, res, ip) {
  const b = await readBody(req);
  const username = typeof b.username === 'string' ? b.username.slice(0, 32).toLowerCase() : '';
  const password = typeof b.password === 'string' ? b.password.slice(0, 72) : '';
  if (failIp.over(ip) || failAll.over('all')) return json(res, 429, { ok: false, error: '여러 번 틀렸습니다. 15분 뒤에 다시 시도해 주세요.' });
  const isAdmin = !!config.superAdmin && username === config.superAdmin;
  const user = isAdmin ? await db.findByUsername(username) : null;
  const ok = await auth.checkPassword(password, user ? user.pass_hash : auth.dummyHash);
  if (!user || !ok || user.banned) {
    failIp.hit(ip); failAll.hit('all');
    return json(res, 401, { ok: false, error: '아이디 또는 비밀번호가 맞지 않습니다.' });
  }
  const sealed = await db.getSetting('admin_totp');
  if (!sealed) {
    // 2단계 인증을 아직 등록하지 않았다: 비밀값을 만들어 보여 주고, 코드로 확인받은 뒤에야 저장한다
    pending = { secret: totp.newSecret(), uid: user.id, exp: Date.now() + 10 * 60 * 1000 };
    return json(res, 200, { ok: true, setup: { secret: pending.secret, uri: totp.uri(pending.secret, username) } },
      cookieFor({ u: user.id, s: 'setup', e: Date.now() + 10 * 60 * 1000 }));
  }
  const secret = unseal(sealed);
  if (!secret) return json(res, 500, { ok: false, error: '2단계 인증 정보를 읽을 수 없습니다. 안내서의 "2단계 인증 초기화"를 따라 주세요.' });
  if (typeof b.code !== 'string' || !b.code) return json(res, 200, { ok: false, need2fa: true });
  const step = totp.verify(secret, b.code.trim(), lastStep);
  if (!step) {
    failIp.hit(ip); failAll.hit('all');
    return json(res, 401, { ok: false, need2fa: true, error: '인증 코드가 맞지 않습니다.' });
  }
  lastStep = step; failIp.clear(ip);
  await db.audit(user.id, 'admin_login', ip);
  json(res, 200, { ok: true }, cookieFor({ u: user.id, s: 'full', e: Date.now() + SESSION_MS }));
}

async function setup2fa(req, res, ip) {
  const s = session(req), b = await readBody(req);
  if (!s || s.s !== 'setup' || !pending || pending.uid !== s.u || pending.exp < Date.now()) return json(res, 401, { ok: false, error: '처음부터 다시 로그인해 주세요.' });
  if (failIp.over(ip)) return json(res, 429, { ok: false, error: '여러 번 틀렸습니다. 15분 뒤에 다시 시도해 주세요.' });
  if (await db.getSetting('admin_totp')) return json(res, 409, { ok: false, error: '이미 등록되어 있습니다. 다시 로그인해 주세요.' });
  const step = totp.verify(pending.secret, typeof b.code === 'string' ? b.code.trim() : '', 0);
  if (!step) { failIp.hit(ip); return json(res, 401, { ok: false, error: '인증 코드가 맞지 않습니다. 앱에 보이는 6자리를 다시 넣어 주세요.' }); }
  await db.setSetting('admin_totp', seal(pending.secret));
  lastStep = step; const uid = pending.uid; pending = null;
  await db.audit(uid, 'admin_2fa', '등록');
  json(res, 200, { ok: true }, cookieFor({ u: uid, s: 'full', e: Date.now() + SESSION_MS }));
}

const text = (v, n) => String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, n);
const int = v => { const n = Number(v); return Number.isInteger(n) ? n : NaN; };

// 관리 기능. 여기까지 온 요청은 2단계 인증을 통과한 총관리자의 것이다.
const OPS = {
  async overview(game) {
    const users = await db.adminUsers();
    return { users: users.length, banned: users.filter(u => u.banned).length, online: game.onlineIds().length,
      maxUsers: config.maxUsers, maxOnline: config.maxOnline, openEvents: await db.countOpenEvents(),
      signupOpen: game.live.signupOpen, notice: game.live.notice, storage: db.kind };
  },
  async users(game) {
    const on = new Set(game.onlineIds());
    return { list: (await db.adminUsers()).map(u => [u.id, u.username, u.nickname, u.username === config.superAdmin ? 'owner' : u.rank, u.floor || 0, u.money, u.banned ? 1 : 0, on.has(u.id) ? 1 : 0, u.created_at]) };
  },
  async 'user.rank'(game, b, actor) {
    const id = int(b.id), u = await db.findById(id);
    if (!u || !RANKS.includes(b.rank)) throw new Error('잘못된 값입니다.');
    if (u.username === config.superAdmin) throw new Error('총관리자의 직급은 바꿀 수 없습니다.');
    await game.adminRank(id, b.rank);
    await db.audit(actor, 'admin_rank', u.nickname + '(' + id + ') ' + u.rank + ' -> ' + b.rank);
    return {};
  },
  async 'user.money'(game, b, actor) {
    const id = int(b.id), delta = int(b.delta), u = await db.findById(id);
    if (!u || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100000) throw new Error('코인은 -100000에서 100000 사이의 0이 아닌 정수로 넣어 주세요.');
    const money = await db.adjustMoney(id, delta);
    await db.audit(actor, 'admin_money', u.nickname + '(' + id + ') ' + (delta > 0 ? '+' : '') + delta + ' = ' + money + ' / ' + text(b.reason, 100));
    game.adminMoney(id, money, '관리자가 코인을 ' + (delta > 0 ? delta + ' 지급' : -delta + ' 회수') + '했습니다.');
    return { money };
  },
  async 'user.ban'(game, b, actor) {
    const id = int(b.id), u = await db.findById(id), on = b.on === true;
    if (!u) throw new Error('없는 사용자입니다.');
    if (u.username === config.superAdmin) throw new Error('총관리자는 정지할 수 없습니다.');
    await db.setBanned(id, on);
    if (on) game.adminKick(id);
    await db.audit(actor, 'admin_ban', u.nickname + '(' + id + ') ' + (on ? '정지' : '정지 해제') + ' / ' + text(b.reason, 100));
    return {};
  },
  async floors(game) { return { list: game.floorList() }; },
  async 'floor.name'(game, b, actor) {
    const floor = int(b.floor), name = text(b.name, 12).replace(/\s+/g, ' ');
    if (!(await game.adminFloorName(floor, name))) throw new Error('층 이름은 한글, 영문, 숫자로 12자까지입니다.');
    await db.audit(actor, 'admin_floor', floor + '층 이름 -> ' + name);
    return {};
  },
  async 'floor.unlock'(game, b, actor) { await game.adminUnlock12(); await db.audit(actor, 'admin_floor', '12층 비밀번호 해제'); return {}; },
  async posts() { return { list: (await db.adminPosts()).map(p => [p.id, p.board, p.title, p.body, p.nickname, p.at, p.pinned ? 1 : 0]) }; },
  async 'post.del'(game, b, actor) {
    const post = await db.getPost(int(b.id));
    if (!post) throw new Error('이미 지워졌거나 없는 글입니다.');
    await db.deletePost(post.id);
    await db.audit(actor, 'admin_post', '삭제 board ' + post.board + ' #' + post.id + ' ' + post.title);
    await game.boardChanged(post.board, true);
    return {};
  },
  async 'post.unpin'(game, b, actor) {
    const post = await db.getPost(int(b.id));
    if (!post) throw new Error('이미 지워졌거나 없는 글입니다.');
    await db.unpinPost(post.id);
    await db.audit(actor, 'admin_post', '고정 해제 board ' + post.board + ' #' + post.id + ' ' + post.title);
    await game.boardChanged(post.board, true);
    return {};
  },
  async events() {
    const [evs, ents] = await Promise.all([db.listEvents(), db.listEntries()]);
    return { list: evs.map(e => [e.id, e.title, e.body, e.reward, e.nickname, ents.filter(n => n.event === e.id && n.status === 'applied').length, ents.filter(n => n.event === e.id && n.status === 'paid').length]) };
  },
  async 'event.close'(game, b, actor) {
    const ev = await db.getEvent(int(b.id));
    if (!ev) throw new Error('이미 끝났거나 없는 이벤트입니다.');
    await db.closeEvent(ev.id);
    await db.audit(actor, 'admin_event', '종료 #' + ev.id + ' ' + ev.title);
    game.eventsChanged();
    return {};
  },
  async shop(game) {
    const row = (k, it, kind) => [k, kind, it.n, it.price, game.basePrices[k]];
    return { list: Object.keys(World.FURN).map(k => row(k, World.FURN[k], '가구'))
      .concat(Object.keys(World.COSM).map(k => row(k, World.COSM[k], World.COSM[k].slot === 'color' ? '털 색' : '모자'))) };
  },
  async 'shop.price'(game, b, actor) {
    const k = String(b.item), price = int(b.price);
    if (!Object.prototype.hasOwnProperty.call(game.basePrices, k) || !(price >= 0 && price <= 100000)) throw new Error('값은 0에서 100000 사이의 정수로 넣어 주세요.');
    const prices = {}; prices[k] = price;
    game.setLive({ prices }); await game.saveLive();
    await db.audit(actor, 'admin_shop', k + ' 값 -> ' + price);
    return {};
  },
  async config(game) { return { npc: game.live.npc, notice: game.live.notice, signupOpen: game.live.signupOpen, theme: game.live.theme }; },
  async 'config.set'(game, b, actor) {
    const next = {};
    if (b.npc && typeof b.npc === 'object') next.npc = { hi: b.npc.hi, guide: Array.isArray(b.npc.guide) ? b.npc.guide : [] };
    if (typeof b.notice === 'string') next.notice = b.notice;
    if (typeof b.signupOpen === 'boolean') next.signupOpen = b.signupOpen;
    if (b.theme === 'christmas' || b.theme === 'none') next.theme = b.theme;
    game.setLive(next); await game.saveLive();
    await db.audit(actor, 'admin_config', Object.keys(next).join(', '));
    return {};
  },
  // 백업 파일. 비밀번호 해시가 들어 있으므로 받은 파일은 안전한 곳에 보관해야 한다.
  async backup(game, b, actor) {
    await db.audit(actor, 'admin_backup', '전체 내려받기');
    return { backup: { made_at: new Date().toISOString(), version: 1, data: await db.exportAll() } };
  },
  async logs(game, b) {
    const action = typeof b.action === 'string' && /^[a-z0-9_]{1,30}$/.test(b.action) ? b.action : null;
    return { list: (await db.listAudit(action)).map(x => [x.id, x.at, x.action, x.detail, x.nickname || '']) };
  }
};

// /admin 아래 요청을 처리한다. 처리했으면 true.
function handle(req, res, url, ip, game, serveFile) {
  if (url !== '/admin' && url.indexOf('/admin/') !== 0) return false;
  if (req.method === 'GET') {
    if (url === '/admin' || url === '/admin/') return serveFile('admin.html', 'text/html; charset=utf-8'), true;
    if (url === '/admin/admin.js') return serveFile('admin.js', 'text/javascript; charset=utf-8'), true;
    res.writeHead(404); res.end('Not found'); return true;
  }
  const fail = e => {
    if (!(e instanceof SyntaxError) && e.message !== 'too large') console.error(e);
    if (!res.headersSent) json(res, 400, { ok: false, error: '요청을 처리하지 못했습니다.' });
  };
  // 다른 사이트가 대신 보낸 요청이 아닌지 확인: 같은 출처 + 전용 헤더 + JSON
  if (req.method !== 'POST' || !sameOrigin(req) || req.headers['x-admin'] !== '1' || !/^application\/json/.test(req.headers['content-type'] || '')) {
    json(res, 400, { ok: false, error: '잘못된 요청입니다.' }); return true;
  }
  if (!reqLimit.hit(ip)) { json(res, 429, { ok: false, error: '요청이 너무 많습니다.' }); return true; }
  if (url === '/admin/api/login') { login(req, res, ip).catch(fail); return true; }
  if (url === '/admin/api/2fa') { setup2fa(req, res, ip).catch(fail); return true; }
  if (url === '/admin/api/logout') { json(res, 200, { ok: true }, cookieFor(null)); return true; }
  if (url === '/admin/api/do') {
    (async () => {
      const s = session(req);
      const user = s && s.s === 'full' ? await db.findById(s.u) : null;
      // 요청마다 다시 확인: 세션이 살아 있고, 그 계정이 지금도 총관리자이며 정지되지 않았는지
      if (!user || user.banned || !config.superAdmin || user.username !== config.superAdmin) return json(res, 401, { ok: false, error: '다시 로그인해 주세요.', relogin: true });
      const b = await readBody(req);
      const op = typeof b.op === 'string' && Object.prototype.hasOwnProperty.call(OPS, b.op) ? OPS[b.op] : null;
      if (!op) return json(res, 400, { ok: false, error: '없는 기능입니다.' });
      try { json(res, 200, Object.assign({ ok: true }, await op(game, b, user.id))); }
      catch (e) { if (!res.headersSent) json(res, 400, { ok: false, error: e.message || '처리하지 못했습니다.' }); if (!/[가-힣]/.test(e.message || '')) console.error(e); }
    })().catch(fail);
    return true;
  }
  json(res, 404, { ok: false, error: '없는 주소입니다.' });
  return true;
}

// 인증 앱을 잃어버렸을 때: 환경 변수 ADMIN_2FA_RESET=yes 를 넣고 서버를 다시 켜면 등록이 지워진다 (그 뒤 변수는 지운다)
async function start() {
  if (process.env.ADMIN_2FA_RESET === 'yes') {
    await db.delSetting('admin_totp');
    console.warn('[주의] ADMIN_2FA_RESET 으로 관리자 2단계 인증을 초기화했습니다. 다시 등록한 뒤 이 환경 변수를 지워 주세요.');
  }
}

module.exports = { handle, start };
