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
const POST_TITLE = 40, POST_BODY = 500;
const RE_FLOOR_NAME = /^[가-힣a-zA-Z0-9 ]{0,12}$/;

class Game {
  constructor() {
    this.players = new Map();                       // uid -> player
    this.rooms = { out: new Set(), in: new Set() };
    this.pins = new Map();                          // 게시판 번호 -> 고정한 글 목록
    this.floors = new Map();                        // 층 번호 -> { name, count, hash }
    for (let n = World.FLOOR_MIN; n <= World.FLOOR_MAX; n++) {
      this.rooms['f' + n] = new Set();
      this.floors.set(n, { name: '', count: 0, hash: null });
    }
    this.postLimit = auth.limiter(3, 60 * 1000);        // 글쓰기: 1분에 3개까지
    this.lockFail = auth.limiter(5, 10 * 60 * 1000);   // 12층 비밀번호: 10분 동안 5번 틀리면 잠금
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
    d.floors.forEach(r => { const f = this.floors.get(r.floor); if (f) { f.name = r.name || ''; f.hash = r.pass_hash || null; } });
    d.counts.forEach(r => { const f = this.floors.get(r.floor); if (f) f.count = r.n; });
    (await db.listPinned()).forEach(x => { if (!this.pins.has(x.board)) this.pins.set(x.board, []); this.pins.get(x.board).push(x); });
  }
  floorList() {
    const list = [];
    for (const [n, f] of this.floors) list.push([n, f.name, f.count, f.hash ? 1 : 0]);   // 해시 자체는 절대 보내지 않는다
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
  pub(p) { return { id: p.id, n: p.name, r: p.rank, x: p.x, z: p.z, f: p.f, u: p.umb ? 1 : 0 }; }
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
      umb: false, lastUmb: 0, floor: user.floor || null, actTimes: [], busy: false, unlocked12: false
    };
    this.players.set(p.id, p);
    this.rooms[p.area].add(p);
    this.send(ws, { t: 'hello', id: p.id, me: { n: p.name, r: p.rank, area: p.area, x: p.x, z: p.z, floor: p.floor },
      floors: this.floorList(), pins: this.areaPins(p.area),
      players: this.roster(p.area, p), online: this.players.size,
      now: Date.now(), wx: weather.get() });
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
    else if (m.t === 'area') this.onArea(p, m);
    else if (m.t === 'umb') this.onUmbrella(p, m);
    else if (m.t === 'elev' || m.t === 'freg' || m.t === 'fname' || m.t === 'fpass' || m.t === 'who' || m.t === 'roster' || m.t === 'setrank'
      || m.t === 'posts' || m.t === 'post' || m.t === 'delpost' || m.t === 'editpost' || m.t === 'pin') {
      // DB를 쓰는 요청은 한 사람당 한 번에 하나씩만 처리한다
      if (p.busy || !this.actOk(p)) return;
      p.busy = true;
      const run = m.t === 'elev' ? this.onElev(p, m) : m.t === 'freg' ? this.onFloorReg(p, m)
        : m.t === 'fname' ? this.onFloorName(p, m) : m.t === 'fpass' ? this.onFloorPass(p, m)
        : m.t === 'who' ? this.onWho(p, m) : m.t === 'roster' ? this.onRoster(p) : m.t === 'setrank' ? this.onSetRank(p, m)
        : m.t === 'posts' ? this.sendPosts(p, m) : m.t === 'post' ? this.onPost(p, m) : m.t === 'delpost' ? this.onDelPost(p, m)
        : m.t === 'editpost' ? this.onEditPost(p, m) : this.onPin(p, m);
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

    const elapsed = Math.min(1, (now - p.lastMove) / 1000);
    const allowed = World.SPEED * elapsed * 1.35 + 0.5;
    const dist = Math.hypot(x - p.x, z - p.z);
    if (dist > allowed || World.blocked(p.area, x, z)) {
      // 순간이동이나 벽 통과: 받아들이지 않고 서버가 아는 위치로 되돌린다
      this.send(p.ws, { t: 'fix', x: p.x, z: p.z });
      return;
    }
    p.x = x; p.z = z; p.f = f; p.lastMove = now; p.dirty = true;
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
    p.area = to; p.x = x; p.z = z; p.f = f;
    p.lastMove = Date.now(); p.dirty = false;
    this.rooms[to].add(p);
    this.send(p.ws, { t: 'area', area: to, x: p.x, z: p.z, f: p.f, players: this.roster(to, p), pins: this.areaPins(to) });
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
    return author === p.id || level(p.rank) >= level('manager') || (board !== 1 && p.rank === 'lead' && p.floor === board);
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
      this.floors.get(was).count = Math.max(0, this.floors.get(was).count - 1);
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

  // 층 이름: 총관리자·사장·부장은 어느 층이든, 팀장은 자기가 등록한 층만 바꿀 수 있다. 12층은 총관리자·사장만.
  async onFloorName(p, m) {
    const floor = World.floorOf(p.area);
    if (floor < World.FLOOR_MIN) return;
    const allowed = this.isTop(p) || (floor !== 12 && (p.rank === 'manager' || (p.rank === 'lead' && p.floor === floor)));
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
        ps.push([p.id, Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100, Math.round(p.f * 100) / 100]);
      }
      if (ps.length) this.broadcast(area, { t: 'state', ps });
    }
  }
}

module.exports = Game;
