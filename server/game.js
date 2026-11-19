'use strict';
// 게임 상태. 장소(야외, 1층 로비, 2~12층)마다 방을 나눠 같은 방 사람끼리만 위치와 채팅을 주고받는다.
// 클라이언트가 보낸 값은 믿지 않고, 이동 속도와 벽 통과, 문 위치를 서버가 다시 검사한다.
const World = require('../public/world.js');
const config = require('./config');
const weather = require('./weather');
const db = require('./db');
const auth = require('./auth');

const TICK_MS = 100;            // 위치 방송 주기 (초당 10번)
const MAX_MOVES_PER_SEC = 30;
const CHAT_MAX = 5, CHAT_WINDOW_MS = 5000, CHAT_LEN = 120;
const ACT_MAX = 14, ACT_WINDOW_MS = 10000;      // 엘리베이터, 층 등록 같은 요청 횟수 제한
// 직급 (낮은 순). 총관리자(owner)는 DB 직급과 별개로 환경 변수의 아이디로 정해지며 모든 직급 위에 있다.
const RANK_ORDER = ['intern', 'staff', 'deputy', 'lead', 'manager', 'ceo'];
const RANK_KO = { intern: '인턴', staff: '사원', deputy: '부팀장', lead: '팀장', manager: '부장', ceo: '사장', owner: '총관리자' };
const level = rank => rank === 'owner' ? RANK_ORDER.length : RANK_ORDER.indexOf(rank);
const rankOf = user => config.superAdmin && user.username === config.superAdmin ? 'owner' : user.rank;
const DECO_MAX = 40, DECO_WINDOW_MS = 10000;   // 꾸미기 요청 횟수 제한
const POST_TITLE = 40, POST_BODY = 500;
const RE_FLOOR_NAME = /^[가-힣a-zA-Z0-9 ]{0,12}$/;

class Game {
  constructor() {
    this.players = new Map();                       // uid -> player
    this.rooms = { out: new Set(), in: new Set() };
    this.furn = new Map();                          // 층 번호 -> 가구 목록
    this.furnCol = {};                              // 장소 -> 가구 충돌 영역 (이동 검사에 쓴다)
    this.pins = new Map();                          // 게시판 번호 -> 고정한 글 목록
    this.floors = new Map();                        // 층 번호 -> { name, count, hash }
    for (let n = World.FLOOR_MIN; n <= World.FLOOR_MAX; n++) {
      this.rooms['f' + n] = new Set();
      this.floors.set(n, { name: '', count: 0, hash: null, rep: 0, repName: '' });
      this.furn.set(n, []);
    }
    this.postLimit = auth.limiter(3, 60 * 1000);        // 글쓰기: 1분에 3개까지
    this.lockFail = auth.limiter(5, 10 * 60 * 1000);
    // 총관리자가 바꿀 수 있는 설정 (값표, 안내원 대사, 공지, 가입 받기). DB의 settings 에 저장된다.
    this.live = { prices: {}, npc: { hi: '', guide: [] }, notice: '', signupOpen: true, theme: 'christmas' };
    this.basePrices = {};
    for (const k of Object.keys(World.FURN)) this.basePrices[k] = World.FURN[k].price;
    for (const k of Object.keys(World.COSM)) if (!World.COSM[k].def) this.basePrices[k] = World.COSM[k].price;
    this.basePrices.megaphone = World.MEGA.price;
    this.megaQ = []; this.megaBusy = false; this.megaRecent = [];     // 확성기 차례 줄, 최근에 나간 것
    this.themeCols();   // 12층 비밀번호: 10분 동안 5번 틀리면 잠금
    this.ticks = 0; this.lastOnline = 0;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.timer.unref();
    // 날씨가 바뀌면 접속자 모두에게 알린다
    weather.onChange(wx => {
      const msg = JSON.stringify({ t: 'wx', wx });
      for (const p of this.players.values()) if (p.ws.readyState === 1) p.ws.send(msg);
    });
  }

  // 서버가 켜질 때 DB에서 층 이름, 등록 인원, 12층 비밀번호 해시를 읽어 온다
  async init() {
    const d = await db.loadFloors();
    d.floors.forEach(r => {
      const f = this.floors.get(r.floor);
      if (f) { f.name = r.name || ''; f.hash = r.pass_hash || null; if (r.floor <= World.FLOOR_REG_MAX && r.rep) { f.rep = r.rep; f.repName = r.rep_name || ''; } }
    });
    d.counts.forEach(r => { const f = this.floors.get(r.floor); if (f) f.count = r.n; });
    try {
      const saved = JSON.parse((await db.getSetting('live')) || '{}');
      if (saved && typeof saved === 'object') this.setLive(saved, true);
    } catch (e) { console.warn('저장된 설정을 읽지 못해 기본값을 씁니다:', e.message); }
    (await db.loadFurniture()).forEach(x => { if (this.furn.has(x.floor) && World.FURN[x.type]) this.furn.get(x.floor).push(x); });
    for (const n of this.furn.keys()) this.rebuildCol(n);
    (await db.listPinned()).forEach(x => { if (!this.pins.has(x.board)) this.pins.set(x.board, []); this.pins.get(x.board).push(x); });
  }
  floorList() {
    const list = [];
    for (const [n, f] of this.floors) list.push([n, f.name, f.count, f.hash ? 1 : 0, f.rep || 0, f.repName || '']);   // 해시 자체는 절대 보내지 않는다
    return list;
  }
  broadcastAll(obj) {
    const msg = JSON.stringify(obj);
    for (const p of this.players.values()) if (p.ws.readyState === 1) p.ws.send(msg);
  }
  toast(p, m) { this.send(p.ws, { t: 'toast', m }); }
  isTop(p) { return p.rank === 'owner' || p.rank === 'ceo'; }
  actOk(p) {
    const now = Date.now();
    p.actTimes = p.actTimes.filter(t => now - t < ACT_WINDOW_MS);
    if (p.actTimes.length >= ACT_MAX) { this.toast(p, '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'); return false; }
    p.actTimes.push(now);
    return true;
  }
  alive(p) { return this.players.get(p.id) === p; }

  send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
  broadcast(area, obj, except) {
    const msg = JSON.stringify(obj);
    for (const p of this.rooms[area]) if (p !== except && p.ws.readyState === 1) p.ws.send(msg);
  }
  pub(p) { return { id: p.id, n: p.name, r: p.rank, x: p.x, z: p.z, f: p.f, u: p.umb ? 1 : 0, s: p.sit ? 1 : 0, c: p.color || '', h: p.hat || '', j: p.jacket || '', pa: p.pants || '', ti: p.tie || '' }; }
  look(p) { return { c: p.color || '', h: p.hat || '', j: p.jacket || '', pa: p.pants || '', ti: p.tie || '' }; }
  roster(area, except) {
    const list = [];
    for (const p of this.rooms[area]) if (p !== except) list.push(this.pub(p));
    return list;
  }

  // 접속. 같은 계정이 이미 들어와 있으면 먼저 접속한 쪽을 끊는다.
  add(ws, user) {
    const old = this.players.get(user.id);
    if (old) {
      this.send(old.ws, { t: 'kick', m: '다른 기기에서 접속해 연결이 종료되었습니다.' });
      this.remove(old);
      old.ws.close(4001);
    }
    if (this.players.size >= config.maxOnline) {
      this.send(ws, { t: 'full', m: '지금은 접속 인원이 가득 찼습니다. 잠시 후 다시 시도해 주세요.' });
      ws.close(4002);
      return null;
    }
    const p = {
      id: user.id, name: user.nickname, ws,
      rank: rankOf(user),
      area: 'out', x: World.SPAWN.start.x + (Math.random() * 4 - 2), z: World.SPAWN.start.z + Math.random() * 2,
      f: Math.PI, dirty: false, lastMove: Date.now(), moveSec: 0, moveCount: 0, chatTimes: [],
      money: Number(user.money) || 0, color: this.cosm(user.color, 'color'), hat: this.cosm(user.hat, 'hat'),
      jacket: this.cosm(user.jacket, 'jacket'), pants: this.cosm(user.pants, 'pants'), tie: this.cosm(user.tie, 'tie'),
      umb: false, lastUmb: 0, sit: null, sitFrom: null, lastSit: 0, decoTimes: [], floor: user.floor || null, actTimes: [], busy: false, unlocked12: false
    };
    this.players.set(p.id, p);
    this.rooms[p.area].add(p);
    this.send(ws, { t: 'hello', id: p.id, me: { n: p.name, r: p.rank, area: p.area, x: p.x, z: p.z, floor: p.floor, money: p.money, ...this.look(p) },
      floors: this.floorList(), pins: this.areaPins(p.area), cfg: this.liveForClient(),
      players: this.roster(p.area, p), online: this.players.size,
      now: Date.now(), wx: weather.get() });
    this.megaReplay(p);
    this.broadcast(p.area, { t: 'join', p: this.pub(p) }, p);
    return p;
  }

  remove(p) {
    if (this.players.get(p.id) !== p) return;
    this.players.delete(p.id);
    this.rooms[p.area].delete(p);
    this.broadcast(p.area, { t: 'leave', id: p.id });
  }

  onMessage(p, raw) {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'move') this.onMove(p, m);
    else if (m.t === 'chat') this.onChat(p, m);
    else if (m.t === 'mega') this.onMegaphone(p, m).catch(e => console.error('확성기 오류:', e.message));
    else if (m.t === 'area') this.onArea(p, m);
    else if (m.t === 'umb') this.onUmbrella(p, m);
    else if (m.t === 'sit') this.onSit(p, m);
    else if (m.t === 'stand') this.onStand(p);
    else if (m.t === 'elev' || m.t === 'freg' || m.t === 'fname' || m.t === 'fpass' || m.t === 'who' || m.t === 'roster' || m.t === 'setrank'
      || m.t === 'posts' || m.t === 'post' || m.t === 'delpost' || m.t === 'editpost' || m.t === 'pin' || m.t === 'deco'
      || m.t === 'shop' || m.t === 'buy' || m.t === 'equip' || m.t === 'events' || m.t === 'evnew' || m.t === 'evclose'
      || m.t === 'evjoin' || m.t === 'evok' || m.t === 'evno' || m.t === 'frep' || m.t === 'fmembers') {
      // DB를 쓰는 요청은 한 사람당 한 번에 하나씩만 처리한다
      if (p.busy || !(m.t === 'deco' ? this.decoOk(p) : this.actOk(p))) return;
      p.busy = true;
      const run = m.t === 'elev' ? this.onElev(p, m) : m.t === 'freg' ? this.onFloorReg(p, m)
        : m.t === 'fname' ? this.onFloorName(p, m) : m.t === 'fpass' ? this.onFloorPass(p, m)
        : m.t === 'who' ? this.onWho(p, m) : m.t === 'roster' ? this.onRoster(p) : m.t === 'setrank' ? this.onSetRank(p, m)
        : m.t === 'posts' ? this.sendPosts(p, m) : m.t === 'post' ? this.onPost(p, m) : m.t === 'delpost' ? this.onDelPost(p, m)
        : m.t === 'editpost' ? this.onEditPost(p, m) : m.t === 'pin' ? this.onPin(p, m) : m.t === 'deco' ? this.onDeco(p, m)
        : m.t === 'shop' ? this.sendShop(p) : m.t === 'buy' ? this.onBuy(p, m) : m.t === 'equip' ? this.onEquip(p, m)
        : m.t === 'events' ? this.sendEvents(p) : m.t === 'evnew' ? this.onEventNew(p, m) : m.t === 'evclose' ? this.onEventClose(p, m)
        : m.t === 'evjoin' ? this.onEventJoin(p, m) : m.t === 'frep' ? this.onFloorRep(p, m) : m.t === 'fmembers' ? this.sendMembers(p)
        : this.onEventJudge(p, m);
      run.catch(e => { console.error(e); if (this.alive(p)) this.toast(p, '요청을 처리하지 못했습니다.'); })
        .then(() => { p.busy = false; });
    }
  }

  onMove(p, m) {
    const now = Date.now();
    const sec = Math.floor(now / 1000);
    if (sec !== p.moveSec) { p.moveSec = sec; p.moveCount = 0; }
    if (++p.moveCount > MAX_MOVES_PER_SEC) return;
    const x = Number(m.x), z = Number(m.z), f = Number(m.f);
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(f)) return;
    if (p.sit) return;                                // 앉아 있는 동안은 움직이지 않는다 (먼저 일어서야 한다)

    const elapsed = Math.min(1, (now - p.lastMove) / 1000);
    const allowed = World.SPEED * elapsed * 1.35 + 0.5;
    const dist = Math.hypot(x - p.x, z - p.z);
    if (dist > allowed || World.blocked(p.area, x, z, this.furnCol[p.area])) {
      // 순간이동이나 벽 통과: 받아들이지 않고 서버가 아는 위치로 되돌린다
      this.send(p.ws, { t: 'fix', x: p.x, z: p.z });
      return;
    }
    p.x = x; p.z = z; p.f = f; p.lastMove = now; p.dirty = true;
  }

  // ---- 확성기 ----
  // 코인을 내고 쓰면 모든 접속자의 화면 위쪽에 5초 동안 뜬다. 여러 개면 서버가 줄을 세워 5초 간격으로 내보낸다.
  // 방금 들어온 사람에게도 1분 안에 나간 확성기를 다시 보여 준다.
  async onMegaphone(p, m) {
    if (typeof m.m !== 'string') return;
    const text = m.m.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, World.MEGA.len);
    if (!text) return;
    const now = Date.now();
    if (p.megaAt && now - p.megaAt < World.MEGA.cooldown) {
      return this.toast(p, '확성기는 ' + Math.round(World.MEGA.cooldown / 1000) + '초에 한 번 쓸 수 있습니다. ' + Math.ceil((World.MEGA.cooldown - (now - p.megaAt)) / 1000) + '초 남았습니다.');
    }
    if (this.megaQ.length >= World.MEGA.queue) return this.toast(p, '확성기가 많이 밀려 있습니다. 잠시 후 다시 써 주세요.');
    const price = World.MEGA.price;
    p.megaAt = now;                                          // 돈을 빼는 동안 두 번 눌러도 한 번만 나가게 먼저 표시
    let money = p.money;
    if (price > 0) {
      money = await db.spend(p.id, price);
      if (money === null) { p.megaAt = 0; return this.alive(p) && this.toast(p, '코인이 모자랍니다. 확성기는 한 번에 ' + price + '코인입니다.'); }
      this.setMoney(p, money);
    }
    await db.audit(p.id, 'megaphone', (price ? '-' + price + '코인 ' : '') + text);
    this.megaQ.push({ id: p.id, n: p.name, r: p.rank, m: text });
    const ahead = this.megaQ.length - 1 + (this.megaBusy ? 1 : 0);
    if (this.alive(p)) this.toast(p, ahead ? '확성기를 썼습니다. 앞에 ' + ahead + '개가 있어 차례대로 나옵니다.' : '확성기를 썼습니다.');
    this.pumpMega();
  }
  pumpMega() {
    if (this.megaBusy || !this.megaQ.length) return;
    const it = this.megaQ.shift();
    it.at = Date.now(); this.megaBusy = true;
    this.megaRecent = this.megaRecent.filter(x => it.at - x.at < World.MEGA.replay).concat([it]).slice(-3);
    this.broadcastAll({ t: 'mega', id: it.id, n: it.n, r: it.r, m: it.m });
    setTimeout(() => { this.megaBusy = false; this.pumpMega(); }, World.MEGA.show);
  }
  megaReplay(p) {                                            // 방금 들어온 사람에게 최근 확성기
    const now = Date.now();
    for (const it of this.megaRecent) if (now - it.at < World.MEGA.replay && it.id !== p.id) this.send(p.ws, { t: 'mega', id: it.id, n: it.n, r: it.r, m: it.m, late: 1 });
  }

  onChat(p, m) {
    if (typeof m.m !== 'string') return;
    const text = m.m.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, CHAT_LEN);
    if (!text) return;
    const now = Date.now();
    p.chatTimes = p.chatTimes.filter(t => now - t < CHAT_WINDOW_MS);
    if (p.chatTimes.length >= CHAT_MAX) {
      this.send(p.ws, { t: 'sys', m: '채팅을 너무 빨리 보내고 있습니다. 잠시 후 다시 시도해 주세요.' });
      return;
    }
    p.chatTimes.push(now);
    this.broadcast(p.area, { t: 'chat', id: p.id, n: p.name, r: p.rank, m: text });
  }

  // 우산 펴기/접기. 꾸밈 요소라 판정할 것은 없지만 연타는 막는다.
  onUmbrella(p, m) {
    const now = Date.now();
    if (now - p.lastUmb < 400) return;
    p.lastUmb = now;
    p.umb = m.on === true;
    this.broadcast(p.area, { t: 'umb', id: p.id, on: p.umb ? 1 : 0 });
  }

  onArea(p, m) {
    const to = World.door(p.area, p.x, p.z, 0.8);
    if (!to || m.to !== to) { this.send(p.ws, { t: 'fix', x: p.x, z: p.z }); return; }
    this.moveTo(p, to, World.SPAWN[to].x, World.SPAWN[to].z, to === 'in' ? Math.PI : 0);
  }

  moveTo(p, to, x, z, f) {
    this.rooms[p.area].delete(p);
    this.broadcast(p.area, { t: 'leave', id: p.id });
    p.area = to; p.x = x; p.z = z; p.f = f; p.sit = null; p.sitFrom = null;
    p.lastMove = Date.now(); p.dirty = false;
    this.rooms[to].add(p);
    this.send(p.ws, { t: 'area', area: to, x: p.x, z: p.z, f: p.f, players: this.roster(to, p), pins: this.areaPins(to),
      furn: this.furnList(to) });
    this.broadcast(to, { t: 'join', p: this.pub(p) }, p);
  }

  // 엘리베이터: 층 사이를 오가는 유일한 방법. 엘리베이터 앞에 서 있는지 서버가 확인한다.
  async onElev(p, m) {
    const to = Number(m.to), cur = World.floorOf(p.area);
    if (!Number.isInteger(to) || to < 1 || to > World.FLOOR_MAX || to === cur) return;
    if (!World.nearElev(p.area, p.x, p.z, 0.8)) return this.toast(p, '엘리베이터 앞에서 이용해 주세요.');
    const f12 = this.floors.get(12);
    if (to === 12 && f12.hash && !this.isTop(p) && !p.unlocked12) {
      if (typeof m.pw !== 'string' || !m.pw) return this.send(p.ws, { t: 'needpw' });
      if (this.lockFail.over(p.id)) return this.toast(p, '비밀번호를 여러 번 틀렸습니다. 10분 뒤에 다시 시도해 주세요.');
      const ok = await auth.checkPassword(m.pw.slice(0, 72), f12.hash);
      if (!this.alive(p)) return;
      if (!ok) { this.lockFail.hit(p.id); return this.toast(p, '비밀번호가 맞지 않습니다.'); }
      this.lockFail.clear(p.id);
      p.unlocked12 = true;
      if (!World.nearElev(p.area, p.x, p.z, 0.8)) return;      // 확인하는 사이 자리를 떴으면 태우지 않는다
    }
    this.moveTo(p, World.areaOf(to), World.ELEV_OUT.x + (Math.random() - 0.5), World.ELEV_OUT.z, 0);
  }

  // ---- 총관리자 화면에서 부르는 것들 (권한 확인은 admin.js 가 끝낸 뒤에만 불린다) ----
  liveForClient() { return { prices: this.live.prices, npc: this.live.npc, notice: this.live.notice, theme: this.live.theme }; }
  // 크리스마스 소품은 꾸미기가 켜져 있을 때만 길을 막는다
  themeCols() {
    const on = this.live.theme === 'christmas';
    this.furnCol.out = on ? World.XMAS_OUT : [];
    this.furnCol.in = on ? World.XMAS_IN : [];
  }
  // 설정을 검사해서 적용한다. 값표는 서버가 가진 가구·치장 표에 바로 반영된다.
  setLive(next, quiet) {
    const L = this.live;
    if (next.prices && typeof next.prices === 'object') {
      for (const k of Object.keys(this.basePrices)) {
        const v = Number(next.prices[k]);
        if (Number.isInteger(v) && v >= 0 && v <= 100000) L.prices[k] = v;
      }
    }
    if (next.npc && typeof next.npc === 'object') {
      const clean = (t, n) => String(t || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
      L.npc = { hi: clean(next.npc.hi, 60), guide: (Array.isArray(next.npc.guide) ? next.npc.guide : []).map(x => clean(x, 200)).filter(Boolean).slice(0, 12) };
    }
    if (typeof next.notice === 'string') L.notice = next.notice.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200);
    if (typeof next.signupOpen === 'boolean') L.signupOpen = next.signupOpen;
    if (next.theme === 'christmas' || next.theme === 'none') { L.theme = next.theme; this.themeCols(); }
    for (const k of Object.keys(this.basePrices)) {
      const price = Object.prototype.hasOwnProperty.call(L.prices, k) ? L.prices[k] : this.basePrices[k];
      (World.FURN[k] || World.COSM[k] || (k === 'megaphone' ? World.MEGA : {})).price = price;
    }
    if (!quiet) this.broadcastAll({ t: 'cfg', cfg: this.liveForClient() });
  }
  async saveLive() { await db.setSetting('live', JSON.stringify(this.live)); }
  async adminRank(uid, rank) {
    if (!RANK_ORDER.includes(rank) || !(await db.setRankForce(uid, rank))) return false;
    this.applyRank(uid, rank, '관리자가 직급을 ' + RANK_KO[rank] + '(으)로 바꿨습니다.');
    if (rank === 'ceo') for (const old of await db.demoteOtherCeos(uid)) this.applyRank(old, 'manager', '새 사장이 임명되어 부장이 되었습니다.');
    return true;
  }
  adminMoney(uid, money, note) { const q = this.players.get(uid); if (q) { this.setMoney(q, money); if (note) this.toast(q, note); } }
  adminKick(uid) {
    const q = this.players.get(uid);
    if (!q) return;
    this.send(q.ws, { t: 'authfail', m: '이용이 정지된 계정입니다.' });
    q.ws.close(4004);
  }
  async adminFloorName(floor, name) {
    const f = this.floors.get(floor);
    if (!f || !RE_FLOOR_NAME.test(name)) return false;
    await db.setFloorName(floor, name); f.name = name;
    this.broadcastAll({ t: 'floors', floors: this.floorList() });
    return true;
  }
  async adminUnlock12() {
    await db.setFloorPass(12, null); this.floors.get(12).hash = null;
    this.broadcastAll({ t: 'floors', floors: this.floorList() });
  }
  onlineIds() { return Array.from(this.players.keys()); }

  // ---- 돈, 상점, 치장 ----
  cosm(key, slot) { return typeof key === 'string' && Object.prototype.hasOwnProperty.call(World.COSM, key) && World.COSM[key].slot === slot ? key : null; }
  setMoney(p, v) { if (typeof v !== 'number') return; p.money = v; if (this.alive(p)) this.send(p.ws, { t: 'money', v }); }
  async sendShop(p) {
    const items = await db.listItems(p.id);
    if (this.alive(p)) this.send(p.ws, { t: 'shop', money: p.money, own: items, ...this.look(p) });
  }
  async onBuy(p, m) {
    const key = m.item;
    if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(World.COSM, key)) return;
    const it = World.COSM[key];
    if (it.def) return this.wear(p, it.slot, null).then(() => this.sendShop(p));     // 기본 옷은 사지 않아도 입는다
    const r = await db.buyItem(p.id, key, it.price);      // 값은 서버가 가진 표에서만 읽는다
    if (r.error === 'owned') return this.alive(p) && this.toast(p, '이미 가지고 있습니다.');
    if (r.error) return this.alive(p) && this.toast(p, '코인이 모자랍니다. ' + it.n + '은(는) ' + it.price + '코인입니다.');
    this.setMoney(p, r.money);
    if (this.alive(p)) this.toast(p, it.n + '을(를) 샀습니다.');
    await this.wear(p, it.slot, key);
    await this.sendShop(p);
  }
  async onEquip(p, m) {
    const slot = World.LOOK_SLOTS.includes(m.slot) ? m.slot : null;
    if (!slot) return;
    let key = null;
    if (m.item) {                                           // 빈 값이면 벗기(기본 모습)
      key = this.cosm(m.item, slot);
      if (!key) return this.alive(p) && this.toast(p, '가지고 있지 않은 아이템입니다.');
      if (World.COSM[key].def) key = null;                  // 기본 옷은 빈 값으로 저장한다
      else if (!(await db.listItems(p.id)).includes(key)) return this.alive(p) && this.toast(p, '가지고 있지 않은 아이템입니다.');
    }
    await this.wear(p, slot, key);
    await this.sendShop(p);
  }
  async wear(p, slot, key) {
    if (!World.LOOK_SLOTS.includes(slot)) return;
    p[slot] = key;
    await db.setLook(p.id, { color: p.color, hat: p.hat, jacket: p.jacket, pants: p.pants, tie: p.tie });
    if (this.alive(p)) this.broadcast(p.area, { t: 'look', id: p.id, ...this.look(p) });
  }

  // ---- 이벤트 ----
  // 만들기: 부장·사장·총관리자. 성공 판정: 부팀장부터 사장까지(와 총관리자). 보상은 서버가 한 사람에게 한 번만 준다.
  canMakeEvent(p) { return level(p.rank) >= level('manager'); }
  canJudge(p) { return level(p.rank) >= level('deputy'); }
  async sendEvents(p) {
    const [evs, ents] = await Promise.all([db.listEvents(), db.listEntries()]);
    if (!this.alive(p)) return;
    const judge = this.canJudge(p);
    this.send(p.ws, { t: 'events', mk: this.canMakeEvent(p) ? 1 : 0, j: judge ? 1 : 0, max: World.EVENT_REWARD_MAX,
      // [번호, 제목, 내용, 보상, 만든 사람, 내 상태(0 없음, 1 신청, 2 받음), 종료할 수 있나, 신청자 목록(판정자에게만)]
      list: evs.map(e => {
        const mine = ents.find(n => n.event === e.id && n.user === p.id);
        return [e.id, e.title, e.body, e.reward, e.nickname, mine ? (mine.status === 'paid' ? 2 : 1) : 0,
          e.creator === p.id || this.isTop(p) ? 1 : 0,
          judge ? ents.filter(n => n.event === e.id && n.status === 'applied' && n.user !== p.id).map(n => [n.user, n.nickname]) : []];
      }) });
  }
  eventsChanged() { this.broadcastAll({ t: 'evdirty' }); }
  async onEventNew(p, m) {
    if (!this.canMakeEvent(p)) return this.toast(p, '이벤트는 사장과 부장만 만들 수 있습니다.');
    if (typeof m.title !== 'string' || typeof m.body !== 'string') return;
    const title = m.title.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    const body = m.body.replace(/\r/g, '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    const reward = Number(m.reward);
    if (!title || title.length > 40) return this.toast(p, '제목은 1~40자로 써 주세요.');
    if (!body || body.length > 300) return this.toast(p, '내용은 1~300자로 써 주세요.');
    if (!Number.isInteger(reward) || reward < 1 || reward > World.EVENT_REWARD_MAX) return this.toast(p, '보상은 1~' + World.EVENT_REWARD_MAX + '코인으로 정해 주세요.');
    if ((await db.countOpenEvents()) >= World.EVENT_OPEN_MAX) return this.alive(p) && this.toast(p, '진행 중인 이벤트는 ' + World.EVENT_OPEN_MAX + '개까지입니다. 끝난 이벤트를 먼저 종료해 주세요.');
    const id = await db.addEvent(title, body, reward, p.id);
    await db.audit(p.id, 'event_new', '#' + id + ' ' + title + ' 보상 ' + reward);
    if (this.alive(p)) this.toast(p, '이벤트를 만들었습니다.');
    this.eventsChanged();
  }
  async openEvent(p, m) {
    const id = Number(m.id);
    if (!Number.isInteger(id) || id < 1) return null;
    const ev = await db.getEvent(id);
    if (!ev && this.alive(p)) this.toast(p, '이미 끝났거나 없는 이벤트입니다.');
    return this.alive(p) ? ev : null;
  }
  async onEventClose(p, m) {
    const ev = await this.openEvent(p, m);
    if (!ev) return;
    if (ev.creator !== p.id && !this.isTop(p)) return this.toast(p, '만든 사람과 사장만 종료할 수 있습니다.');
    await db.closeEvent(ev.id);
    await db.audit(p.id, 'event_close', '#' + ev.id + ' ' + ev.title);
    this.eventsChanged();
  }
  async onEventJoin(p, m) {
    const ev = await this.openEvent(p, m);
    if (!ev) return;
    if (!(await db.joinEvent(ev.id, p.id))) return this.alive(p) && this.toast(p, '이미 신청했거나 보상을 받은 이벤트입니다.');
    if (this.alive(p)) this.toast(p, '참가 신청했습니다. 판정을 기다려 주세요.');
    this.eventsChanged();
  }
  async onEventJudge(p, m) {
    if (!this.canJudge(p)) return this.toast(p, '성공 판정은 부팀장 이상만 할 수 있습니다.');
    const uid = Number(m.uid);
    if (!Number.isInteger(uid) || uid < 1) return;
    if (uid === p.id) return this.toast(p, '자기 자신은 판정할 수 없습니다.');
    const ev = await this.openEvent(p, m);
    if (!ev) return;
    const q = this.players.get(uid);
    if (m.t === 'evno') {
      if (!(await db.rejectEntry(ev.id, uid))) return this.alive(p) && this.toast(p, '이미 처리된 신청입니다.');
      if (q) this.toast(q, '"' + ev.title + '" 참가 신청이 반려되었습니다.');
    } else {
      const r = await db.awardEvent(ev.id, uid, p.id);
      if (!r) return this.alive(p) && this.toast(p, '이미 처리된 신청입니다.');
      if (q) { this.setMoney(q, r.money); this.toast(q, '"' + ev.title + '" 성공! ' + r.reward + '코인을 받았습니다.'); }
      if (this.alive(p)) this.toast(p, '성공 처리하고 ' + r.reward + '코인을 지급했습니다.');
    }
    this.eventsChanged();
  }

  // ---- 꾸미기 ----
  furnList(area) { return (this.furn.get(World.floorOf(area)) || []).map(x => [x.id, x.type, x.x, x.z, x.rot]); }
  rebuildCol(floor) {
    this.furnCol[World.areaOf(floor)] = this.furn.get(floor).filter(x => World.FURN[x.type].solid).map(World.furnRect);
  }
  // 꾸밀 수 있는 사람: 2~11층은 그 층에 등록한 사원(과 총관리자), 12층은 사장과 총관리자
  canDeco(p, floor) {
    if (floor === 12) return this.isTop(p);
    return floor >= World.FLOOR_MIN && (p.floor === floor || p.rank === 'owner');
  }
  decoOk(p) {
    const now = Date.now();
    p.decoTimes = p.decoTimes.filter(t => now - t < DECO_WINDOW_MS);
    if (p.decoTimes.length >= DECO_MAX) { this.toast(p, '꾸미기 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'); return false; }
    p.decoTimes.push(now);
    return true;
  }
  // 그 자리에 사람이 서 있으면 가구에 갇히므로 놓지 못하게 한다
  someoneIn(area, rect) {
    for (const q of this.rooms[area]) {
      if (q.sit) continue;
      if (q.x > rect.x0 - World.R && q.x < rect.x1 + World.R && q.z > rect.z0 - World.R && q.z < rect.z1 + World.R) return true;
    }
    return false;
  }
  seated(area, id) { for (const q of this.rooms[area]) if (q.sit && q.sit.id === id) return true; return false; }
  async onDeco(p, m) {
    const floor = World.floorOf(p.area), area = p.area;
    if (floor < World.FLOOR_MIN) return;
    if (!this.canDeco(p, floor)) return this.toast(p, floor === 12 ? '사장실은 사장만 꾸밀 수 있습니다.' : '이 층에 등록한 사원만 꾸밀 수 있습니다.');
    if (p.sit) return this.toast(p, '먼저 자리에서 일어나 주세요.');
    const list = this.furn.get(floor);
    if (m.op === 'del') {
      const it = list.find(x => x.id === Number(m.id));
      if (!it) return;
      if (this.seated(area, it.id)) return this.toast(p, '누가 앉아 있어서 치울 수 없습니다.');
      const gone = await db.deleteFurniture(it.id);
      const i = list.indexOf(it);
      if (i >= 0) list.splice(i, 1);
      this.rebuildCol(floor);
      this.broadcast(area, { t: 'furn', op: 'del', id: it.id });
      // 치우면 놓을 때 낸 값을 놓은 사람에게 돌려준다
      if (gone && it.paid > 0 && it.owner) {
        const money = await db.refund(it.owner, it.paid);
        await db.audit(p.id, 'money', '가구 ' + it.type + ' 환불 +' + it.paid + ' -> ' + it.owner);
        const q = this.players.get(it.owner);
        if (q) this.setMoney(q, money);
        if (this.alive(p)) this.toast(p, it.owner === p.id ? it.paid + '코인을 돌려받았습니다.' : '치웠습니다. ' + it.paid + '코인은 놓은 사람에게 돌려주었습니다.');
        else if (q && q !== p) this.toast(q, '내가 놓은 ' + World.FURN[it.type].n + '이(가) 치워져 ' + it.paid + '코인을 돌려받았습니다.');
      }
      return;
    }
    if (m.op !== 'add' && m.op !== 'mv') return;
    const old = m.op === 'mv' ? list.find(x => x.id === Number(m.id)) : null;
    if (m.op === 'mv' && !old) return;
    const type = old ? old.type : m.type, rot = Number(m.rot);
    if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(World.FURN, type)) return;
    if (!Number.isInteger(rot) || rot < 0 || rot > 3 || !Number.isFinite(Number(m.x)) || !Number.isFinite(Number(m.z))) return;
    if (!old && list.length >= World.FURN_CAP) return this.toast(p, '이 층에는 가구를 ' + World.FURN_CAP + '개까지만 놓을 수 있습니다.');
    if (old && this.seated(area, old.id)) return this.toast(p, '누가 앉아 있어서 옮길 수 없습니다.');
    const size = World.furnSize(type, rot);                 // 좌표는 서버가 다시 격자에 맞춘다
    const it = { id: old ? old.id : 0, type, rot, x: World.snap(Math.max(-20, Math.min(20, Number(m.x))), size.w), z: World.snap(Math.max(-20, Math.min(20, Number(m.z))), size.d) };
    if (!World.furnOk(floor, it, list)) return this.toast(p, '그 자리에는 놓을 수 없습니다.');
    if (World.FURN[type].solid && this.someoneIn(area, World.furnRect(it))) return this.toast(p, '사람이 서 있는 자리에는 놓을 수 없습니다.');
    if (old) {
      await db.moveFurniture(old.id, it.x, it.z, it.rot);
      old.x = it.x; old.z = it.z; old.rot = it.rot;
    } else {
      // 새로 놓을 때 값을 치른다. 돈이 모자라면 놓이지 않고, 저장에 실패하면 돌려준다.
      const price = World.FURN[type].price, left = await db.spend(p.id, price);
      if (left === null) return this.alive(p) && this.toast(p, '코인이 모자랍니다. ' + World.FURN[type].n + '은(는) ' + price + '코인입니다.');
      try { it.id = await db.addFurniture(floor, type, it.x, it.z, it.rot, p.id, price); }
      catch (e) { this.setMoney(p, await db.refund(p.id, price)); throw e; }
      await db.audit(p.id, 'money', '가구 ' + type + ' -' + price);
      this.setMoney(p, left);
      it.floor = floor; it.owner = p.id; it.paid = price;
      list.push(it);
    }
    this.rebuildCol(floor);
    this.broadcast(area, { t: 'furn', op: old ? 'mv' : 'add', it: [it.id, type, it.x, it.z, it.rot] });
  }

  // 앉기: 의자나 소파 가까이에서, 빈 자리에만
  onSit(p, m) {
    const now = Date.now(), floor = World.floorOf(p.area);
    if (now - p.lastSit < 400 || p.sit || floor < World.FLOOR_MIN) return;
    p.lastSit = now;
    const it = this.furn.get(floor).find(x => x.id === Number(m.id)), slot = Number(m.slot);
    const pos = it && Number.isInteger(slot) ? World.seatPos(it, slot) : null;
    if (!pos) return;
    if (Math.hypot(pos.x - p.x, pos.z - p.z) > 2.6) return this.toast(p, '조금 더 가까이 가서 앉아 주세요.');
    for (const q of this.rooms[p.area]) if (q.sit && q.sit.id === it.id && q.sit.slot === slot) return this.toast(p, '이미 다른 사람이 앉아 있습니다.');
    p.sit = { id: it.id, slot }; p.sitFrom = { x: p.x, z: p.z };
    p.x = pos.x; p.z = pos.z; p.f = pos.f; p.dirty = false;
    this.broadcast(p.area, { t: 'sit', id: p.id, s: 1, x: p.x, z: p.z, f: p.f });
  }
  onStand(p) {
    const now = Date.now();
    if (!p.sit || now - p.lastSit < 400) return;
    p.lastSit = now;
    const col = this.furnCol[p.area], free = (x, z) => !World.blocked(p.area, x, z, col);
    let spot = p.sitFrom && free(p.sitFrom.x, p.sitFrom.z) ? p.sitFrom : null;
    // 앉기 전 자리가 그 사이 막혔으면 주변에서 빈 곳을 찾는다
    for (let r = 1; !spot && r <= 4; r += 0.5) {
      for (let a = 0; a < 8 && !spot; a++) {
        const x = p.x + Math.cos(a * Math.PI / 4) * r, z = p.z + Math.sin(a * Math.PI / 4) * r;
        if (free(x, z)) spot = { x, z };
      }
    }
    if (!spot) spot = { x: World.ELEV_OUT.x, z: World.ELEV_OUT.z };
    p.sit = null; p.sitFrom = null;
    p.x = spot.x; p.z = spot.z; p.lastMove = now; p.dirty = false;
    this.broadcast(p.area, { t: 'sit', id: p.id, s: 0, x: p.x, z: p.z, f: p.f });
  }

  // ---- 게시판 ----
  // 볼 수 있는 게시판: 전체 게시판(1)은 어디서나, 내가 등록한 층 게시판도 어디서나, 그 밖의 층 게시판은 그 층에 가 있을 때만.
  hereBoard(p) { const n = World.floorOf(p.area); return n >= 1 && n <= World.FLOOR_REG_MAX ? n : 0; }
  canSee(p, board) {
    return Number.isInteger(board) && board >= 1 && board <= World.FLOOR_REG_MAX && (board === 1 || board === p.floor || board === this.hereBoard(p));
  }
  // 쓰기: 전체 게시판은 부장·사장·총관리자, 층 게시판은 그 층에 등록한 사원(과 총관리자)
  canWrite(p, board) { return board === 1 ? level(p.rank) >= level('manager') : (p.floor === board || p.rank === 'owner'); }
  // 고정 해제만은 관리 차원에서 부장 이상과 그 층 팀장도 할 수 있다 (수정·삭제는 글쓴이만)
  canUnpin(p, board, author) {
    return author === p.id || level(p.rank) >= level('manager') || (board !== 1 && p.floor === board && (p.rank === 'lead' || this.isRep(p, board)));
  }
  pinCap(board) { return board === 1 ? 10 : 5; }
  pinsOf(board) { return (this.pins.get(board) || []).map(x => [x.id, x.title, x.nickname]); }
  areaPins(area) { const b = World.floorOf(area); return b >= 1 && b <= World.FLOOR_REG_MAX ? this.pinsOf(b) : []; }
  // 게시판에 붙은 종이가 바뀌면 그 게시판이 있는 곳 사람들에게 알리고, 목록을 보고 있을 사람들도 새로 받아 가게 한다
  async boardChanged(board, pinsToo) {
    if (pinsToo) {
      this.pins.set(board, await db.listPinned(board));
      this.broadcast(World.areaOf(board), { t: 'pins', b: board, list: this.pinsOf(board) });
    }
    this.broadcastAll({ t: 'bnew', b: board });
  }
  cleanPost(p, m) {
    if (typeof m.title !== 'string' || typeof m.body !== 'string') return null;
    const title = m.title.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    const body = m.body.replace(/\r/g, '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (!title || title.length > POST_TITLE) { this.toast(p, '제목은 1~' + POST_TITLE + '자로 써 주세요.'); return null; }
    if (!body || body.length > POST_BODY) { this.toast(p, '내용은 1~' + POST_BODY + '자로 써 주세요.'); return null; }
    return { title, body };
  }
  async sendPosts(p, m) {
    const board = Number(m.b);
    if (!this.canSee(p, board)) return;
    const rows = await db.listPosts(board);
    if (!this.alive(p) || !this.canSee(p, board)) return;
    this.send(p.ws, { t: 'posts', b: board, w: this.canWrite(p, board) ? 1 : 0, cap: this.pinCap(board),
      // [번호, 제목, 내용, 글쓴이, 직급, 시각, 내 글인가, 고정됐나, 고정을 풀 수 있나, 수정됐나]
      list: rows.map(x => [x.id, x.title, x.body, x.nickname, rankOf(x), x.at, x.author === p.id ? 1 : 0, x.pinned ? 1 : 0,
        this.canUnpin(p, board, x.author) ? 1 : 0, x.edited ? 1 : 0]) });
  }
  async onPost(p, m) {
    const board = Number(m.b);
    if (!this.canSee(p, board)) return;
    if (!this.canWrite(p, board)) {
      return this.toast(p, board === 1 ? '전체 게시판은 사장과 부장만 쓸 수 있습니다.' : '그 층에 등록한 사원만 쓸 수 있습니다.');
    }
    const c = this.cleanPost(p, m);
    if (!c) return;
    if (!this.postLimit.hit(p.id)) return this.toast(p, '글을 너무 자주 올리고 있습니다. 1분 뒤에 다시 시도해 주세요.');
    const id = await db.addPost(board, p.id, c.title, c.body);
    let pinned = false;
    if (m.pin === true) pinned = await db.pinPost(id, board, this.pinCap(board));
    if (this.alive(p)) {
      this.send(p.ws, { t: 'posted' });
      if (m.pin === true && !pinned) this.toast(p, '글은 올렸지만 고정 자리(' + this.pinCap(board) + '개)가 다 차서 게시판에 붙이지 못했습니다.');
    }
    await this.boardChanged(board, pinned);
  }
  // 글 하나를 다루는 요청의 공통 확인: 글이 있고, 내가 볼 수 있는 게시판의 글이어야 한다
  async myPost(p, m) {
    const id = Number(m.id);
    if (!Number.isInteger(id) || id < 1) return null;
    const post = await db.getPost(id);
    if (!this.alive(p)) return null;
    if (!post || !this.canSee(p, post.board)) { this.toast(p, '이미 지워졌거나 없는 글입니다.'); return null; }
    return post;
  }
  async onEditPost(p, m) {
    const post = await this.myPost(p, m);
    if (!post) return;
    if (post.author !== p.id) return this.toast(p, '글쓴이만 수정할 수 있습니다.');
    const c = this.cleanPost(p, m);
    if (!c) return;
    await db.updatePost(post.id, c.title, c.body);
    if (this.alive(p)) this.send(p.ws, { t: 'posted', edit: 1 });
    await this.boardChanged(post.board, post.pinned);
  }
  async onDelPost(p, m) {
    const post = await this.myPost(p, m);
    if (!post) return;
    if (post.author !== p.id) return this.toast(p, '글쓴이만 지울 수 있습니다.');
    const wasPinned = post.pinned;
    await db.deletePost(post.id);
    await this.boardChanged(post.board, wasPinned);
  }
  async onPin(p, m) {
    const post = await this.myPost(p, m);
    if (!post) return;
    if (m.on === true) {
      if (post.author !== p.id) return this.toast(p, '글쓴이만 고정할 수 있습니다.');
      if (post.pinned) return;
      if (!(await db.pinPost(post.id, post.board, this.pinCap(post.board)))) {
        return this.alive(p) && this.toast(p, '고정 자리(' + this.pinCap(post.board) + '개)가 다 찼습니다. 다른 글의 고정을 풀어야 합니다.');
      }
    } else {
      if (!this.canUnpin(p, post.board, post.author)) return this.toast(p, '이 글의 고정을 풀 권한이 없습니다.');
      if (!post.pinned) return;
      await db.unpinPost(post.id);
      if (post.author !== p.id) await db.audit(p.id, 'post_unpin', 'board ' + post.board + ' #' + post.id + ' ' + post.title);
    }
    await this.boardChanged(post.board, true);
  }

  // 프로필 카드에 보여 줄 정보
  card(u) { return { t: 'who', id: u.id, n: u.nickname, r: rankOf(u), floor: u.floor || null, on: this.players.has(u.id) ? 1 : 0 }; }
  async onWho(p, m) {
    const id = Number(m.id);
    if (!Number.isInteger(id) || id < 1) return;
    const u = await db.findById(id);
    if (u && !u.banned && this.alive(p)) this.send(p.ws, this.card(u));
  }
  async onRoster(p) {
    const list = (await db.listUsers()).map(u => [u.id, u.nickname, rankOf(u), u.floor || 0, this.players.has(u.id) ? 1 : 0]);
    if (this.alive(p)) this.send(p.ws, { t: 'roster', list });
  }

  // 승진·강등. 팀장 이상이, 자기보다 낮은 사람을, 자기보다 낮은 직급까지만 바꿀 수 있다.
  // 사장 임명은 총관리자만 할 수 있고(사장보다 높은 직급이 총관리자뿐이므로), 사장은 한 명만 둔다.
  async onSetRank(p, m) {
    const id = Number(m.id), to = m.r;
    if (!Number.isInteger(id) || id < 1 || !RANK_ORDER.includes(to)) return;
    const a = level(p.rank);
    if (a < level('lead')) return this.toast(p, '팀장 이상만 직급을 바꿀 수 있습니다.');
    if (id === p.id) return this.toast(p, '자기 자신의 직급은 바꿀 수 없습니다.');
    const u = await db.findById(id);
    if (!this.alive(p)) return;
    if (!u || u.banned) return this.toast(p, '찾을 수 없는 사원입니다.');
    const cur = rankOf(u);
    if (cur === 'owner') return this.toast(p, '총관리자의 직급은 바꿀 수 없습니다.');
    if (level(cur) >= a) return this.toast(p, '자신보다 낮은 직급의 사원만 바꿀 수 있습니다.');
    if (level(to) >= a) return this.toast(p, '자신보다 낮은 직급까지만 줄 수 있습니다.');
    if (to === cur) return;
    if (!(await db.setRank(id, u.rank, to))) return this.alive(p) && this.toast(p, '방금 다른 사람이 직급을 바꿨습니다. 다시 확인해 주세요.');
    await db.audit(p.id, 'rank', u.nickname + '(' + id + ') ' + cur + ' -> ' + to);
    const up = level(to) > level(cur);
    this.applyRank(id, to, RANK_KO[to] + '(으)로 ' + (up ? '승진했습니다.' : '직급이 바뀌었습니다.'));
    if (to === 'ceo') {
      for (const old of await db.demoteOtherCeos(id)) {
        await db.audit(p.id, 'rank', '사장 교체로 ' + old + ' ceo -> manager');
        this.applyRank(old, 'manager', '새 사장이 임명되어 부장이 되었습니다.');
      }
    }
    if (this.alive(p)) {
      this.toast(p, u.nickname + ' 님을 ' + RANK_KO[to] + '(으)로 ' + (up ? '승진' : '변경') + '했습니다.');
      u.rank = to;
      this.send(p.ws, this.card(u));
    }
  }
  // 접속 중이면 이름표가 모든 사람 화면에서 바로 바뀐다
  applyRank(uid, rank, note) {
    const q = this.players.get(uid);
    if (!q) return;
    q.rank = rank;
    this.broadcast(q.area, { t: 'rank', id: uid, r: rank });
    this.toast(q, note);
  }

  // 층 등록/해제. 한 사람은 한 층에만, 한 층에는 20명까지.
  async onFloorReg(p, m) {
    if (m.on !== true) {
      if (!p.floor) return;
      const was = p.floor;
      await db.unregisterFloor(p.id);
      p.floor = null;
      const fw = this.floors.get(was);
      fw.count = Math.max(0, fw.count - 1);
      if (fw.rep === p.id) { fw.rep = 0; fw.repName = ''; await db.audit(p.id, 'floor_rep', was + '층 대표자 등록 해제로 내려놓음'); }
      if (this.alive(p)) { this.send(p.ws, { t: 'me', floor: null }); this.toast(p, was + '층 등록을 해제했습니다.'); }
      return this.broadcastAll({ t: 'floors', floors: this.floorList() });
    }
    const floor = World.floorOf(p.area);
    if (floor < World.FLOOR_MIN || floor > World.FLOOR_REG_MAX) return this.toast(p, '2~11층에서만 등록할 수 있습니다.');
    if (p.floor) return this.toast(p, '이미 ' + p.floor + '층에 등록되어 있습니다. 먼저 등록을 해제해 주세요.');
    const r = await db.registerFloor(p.id, floor, World.FLOOR_CAP);
    if (r.error === 'full') return this.alive(p) && this.toast(p, '이 층은 정원(' + World.FLOOR_CAP + '명)이 모두 찼습니다.');
    if (r.error) return this.alive(p) && this.toast(p, '이미 다른 층에 등록되어 있습니다.');
    p.floor = floor;
    this.floors.get(floor).count++;
    if (this.alive(p)) { this.send(p.ws, { t: 'me', floor }); this.toast(p, floor + '층에 등록했습니다.'); }
    this.broadcastAll({ t: 'floors', floors: this.floorList() });
  }

  // 층 이름: 총관리자·사장·부장은 어느 층이든, 팀장과 층 대표자는 자기가 등록한 층만 바꿀 수 있다. 12층은 총관리자·사장만.
  async onFloorName(p, m) {
    const floor = World.floorOf(p.area);
    if (floor < World.FLOOR_MIN) return;
    const allowed = this.isTop(p) || (floor !== 12 && (p.rank === 'manager' || (p.floor === floor && (p.rank === 'lead' || this.isRep(p, floor)))));
    if (!allowed) return this.toast(p, '이 층의 이름을 바꿀 권한이 없습니다.');
    const name = typeof m.name === 'string' ? m.name.replace(/\s+/g, ' ').trim() : null;
    if (name === null || !RE_FLOOR_NAME.test(name)) return this.toast(p, '층 이름은 한글, 영문, 숫자로 12자까지입니다.');
    await db.setFloorName(floor, name);
    await db.audit(p.id, 'floor_name', floor + '층 -> ' + name);
    this.floors.get(floor).name = name;
    if (this.alive(p)) this.toast(p, name ? floor + '층 이름을 "' + name + '"(으)로 바꿨습니다.' : floor + '층 이름을 지웠습니다.');
    this.broadcastAll({ t: 'floors', floors: this.floorList() });
  }

  // 12층 비밀번호 설정/해제 (총관리자·사장만). 해시로만 저장한다.
  async onFloorPass(p, m) {
    if (!this.isTop(p)) return this.toast(p, '12층 비밀번호는 사장만 정할 수 있습니다.');
    if (typeof m.pw !== 'string') return;
    const f12 = this.floors.get(12);
    if (m.pw === '') {
      await db.setFloorPass(12, null);
      await db.audit(p.id, 'floor12_pass', '해제');
      f12.hash = null;
      if (this.alive(p)) this.toast(p, '12층 비밀번호를 해제했습니다.');
    } else {
      if (m.pw.length < 4 || m.pw.length > 32) return this.toast(p, '비밀번호는 4~32자로 정해 주세요.');
      const hash = await auth.hashPassword(m.pw);
      await db.setFloorPass(12, hash);
      await db.audit(p.id, 'floor12_pass', '설정');
      f12.hash = hash;
      for (const q of this.players.values()) q.unlocked12 = false;     // 바뀐 비밀번호로 다시 확인받게 한다
      if (this.alive(p)) this.toast(p, '12층 비밀번호를 설정했습니다.');
    }
    this.broadcastAll({ t: 'floors', floors: this.floorList() });
  }

  // ---- 층 대표자 (2~11층마다 한 명) ----
  // 정하기: 부장·사장·총관리자는 그 층 등록자 누구든 대표자로 정하거나 해제할 수 있다.
  // 지금 대표자는 같은 층 등록자에게 물려주거나 스스로 내려놓을 수 있다. 층 등록을 해제하면 대표자도 내려놓는다.
  isRep(p, floor) { const f = this.floors.get(floor); return !!f && f.rep === p.id; }
  async sendMembers(p) {
    const floor = World.floorOf(p.area);
    if (floor < World.FLOOR_MIN || floor > World.FLOOR_REG_MAX) return;
    const list = (await db.floorMembers(floor)).map(u => [u.id, u.nickname, rankOf(u), this.players.has(u.id) ? 1 : 0]);
    if (this.alive(p)) this.send(p.ws, { t: 'fmembers', floor, list });
  }
  async onFloorRep(p, m) {
    const floor = World.floorOf(p.area), f = this.floors.get(floor), id = Number(m.id);
    if (floor < World.FLOOR_MIN || floor > World.FLOOR_REG_MAX || !f) return this.toast(p, '2~11층의 층 안내판에서만 대표자를 정할 수 있습니다.');
    if (!Number.isInteger(id) || id < 0) return;
    const boss = level(p.rank) >= level('manager'), self = f.rep === p.id;
    if (!boss && !self) return this.toast(p, '대표자는 부장 이상이 정하거나, 지금 대표자가 물려줄 수 있습니다.');
    if (id === f.rep) return this.toast(p, id ? '이미 이 층의 대표자입니다.' : '지금은 대표자가 없습니다.');
    const r = await this.setRep(floor, id, p.id);
    if (!this.alive(p)) return;
    if (r.error) return this.toast(p, '이 층에 등록된 사원만 대표자가 될 수 있습니다.');
    this.toast(p, id ? floor + '층 대표자를 ' + r.name + ' 님으로 정했습니다.' : floor + '층 대표자를 비웠습니다.');
    await this.sendMembers(p);
  }
  // 대표자 바꾸기 (게임과 관리자 화면이 함께 쓴다). id 0 이면 비운다.
  async setRep(floor, id, actor) {
    const f = this.floors.get(floor), old = f.rep;
    const r = await db.setFloorRep(floor, id || null);
    if (r.error) return r;
    f.rep = id || 0; f.repName = r.name || '';
    await db.audit(actor, 'floor_rep', floor + '층 대표자 ' + (id ? '-> ' + r.name + '(' + id + ')' : '해제'));
    const was = old && this.players.get(old), now = id && this.players.get(id);
    if (was && old !== id) this.toast(was, floor + '층 대표자에서 물러났습니다.');
    if (now && old !== id) this.toast(now, floor + '층 대표자가 되었습니다. 층 이름을 바꾸고 층 게시판의 고정을 풀 수 있고, 다른 등록자에게 대표를 물려줄 수 있습니다.');
    this.broadcastAll({ t: 'floors', floors: this.floorList() });
    return r;
  }
  // 정지된 계정이 대표자였으면 비운다
  async dropRep(uid, actor) {
    for (const [n, f] of this.floors) if (f.rep === uid) await this.setRep(n, 0, actor);
  }

  tick() {
    // 접속 인원이 바뀌면 5초에 한 번 전체에 알린다
    if (++this.ticks % 50 === 0 && this.players.size !== this.lastOnline) {
      this.lastOnline = this.players.size;
      const msg = JSON.stringify({ t: 'online', n: this.lastOnline });
      for (const p of this.players.values()) if (p.ws.readyState === 1) p.ws.send(msg);
    }
    for (const area of Object.keys(this.rooms)) {
      const ps = [];
      for (const p of this.rooms[area]) {
        if (!p.dirty) continue;
        p.dirty = false;
        // 전송량을 줄이려고 정수로 보낸다: 위치는 cm, 방향은 0.1라디안 단위
        ps.push([p.id, Math.round(p.x * 100), Math.round(p.z * 100), Math.round(p.f * 10)]);
      }
      if (!ps.length) continue;
      // 위치 방송은 받는 쪽이 밀려 있으면 건너뛴다(다음 것이 곧 또 가므로). 너무 많이 밀린 연결은 끊어서 서버 메모리를 지킨다.
      const msg = JSON.stringify({ t: 'state', ps });
      for (const p of this.rooms[area]) {
        if (p.ws.readyState !== 1) continue;
        const backlog = p.ws.bufferedAmount;
        if (backlog > 4 * 1024 * 1024) p.ws.terminate();
        else if (backlog < 256 * 1024) p.ws.send(msg);
      }
    }
  }
}

module.exports = Game;
