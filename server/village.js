'use strict';
// 마을(무거·삼산·성남)과 그 안의 나무 회사, 플레이존.
// - 마을 이동: 본사 로비 엘리베이터와 삼산·성남의 마을 엘리베이터에서만
// - 나무 회사 1층: 큰 나무에 이름을 적으면 빨간 열매가 맺힌다 (나무에는 최근 20개, 기록은 모두 남는다)
// - 나무 회사 2층: 음악, 방석 20개(정원 20명), 방석에 앉으면 글을 써서 벽 화면에 띄운다
// - 출입명부: 본사·나무 회사·플레이존에 들어가면 자동으로 적힌다
// - 플레이존: 무료 게임 3가지. 판정과 시간 재기는 모두 서버가 한다. 주간 순위 1~3위에게 코인을 준다.
const World = require('../public/world.js');
const db = require('./db');

const KST = 9 * 3600 * 1000, DAY = 86400 * 1000;
// 그 주의 월요일(한국 시각) 날짜 'YYYY-MM-DD'
function weekKey(ms) {
  const d = new Date(ms + KST), day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * DAY).toISOString().slice(0, 10);
}
const clean = (t, n) => String(t || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const RE_FRUIT = /^[가-힣a-zA-Z0-9 ]{1,10}$/;
const FRUIT_GAP = 15000, PRAY_GAP = 20000, ENTRY_GAP = 3 * 60 * 1000;
const GAME_MSG_MAX = 40;                          // 게임 메시지: 1초에 40개까지 (1~25 누르기)

function rnd(n) { return Math.floor(Math.random() * n); }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

class Villages {
  constructor(game) {
    this.g = game;
    this.entrySeen = new Map();                   // "uid|장소" -> 마지막으로 적은 시각 (같은 곳을 들락날락해도 3분에 한 번만)
    this.prize = World.RANK_PRIZE.slice();
    this.payTimer = setInterval(() => this.payWeekly().catch(e => console.error('주간 보상 오류:', e.message)), 10 * 60 * 1000);
    this.payTimer.unref();
  }
  async init() {
    try {
      const p = JSON.parse((await db.getSetting('rank_prize')) || 'null');
      if (Array.isArray(p) && p.length === 3) this.prize = p.map(v => Math.max(0, Math.min(100000, Number(v) | 0)));
    } catch (e) {}
    await db.pruneEntries(180).catch(() => {});                    // 출입명부는 180일 동안 보관
    await this.payWeekly();
  }

  // 처리했으면 true
  handle(p, m) {
    const t = m.t;
    if (t === 'g_start' || t === 'g_ans' || t === 'g_quit') { this.onGame(p, m); return true; }
    if (t === 'sitc') { this.onSitCushion(p, m); return true; }
    if (!['travel', 'stairs', 'fruit', 'fruits', 'pray', 'entries', 'ranks'].includes(t)) return false;
    if (p.busy || !this.g.actOk(p)) return true;
    p.busy = true;
    const run = t === 'travel' ? this.onTravel(p, m) : t === 'stairs' ? this.onStairs(p) : t === 'fruit' ? this.onFruit(p, m)
      : t === 'fruits' ? this.sendFruitLog(p, m) : t === 'pray' ? this.onPray(p, m) : t === 'entries' ? this.sendEntries(p) : this.sendRanks(p);
    Promise.resolve(run).catch(e => { console.error(e); if (this.g.alive(p)) this.g.toast(p, '요청을 처리하지 못했습니다.'); })
      .then(() => { p.busy = false; });
    return true;
  }

  // ---- 장소에 들어갈 때 ----
  async onEnter(p, to) {
    const k = World.kindOf(to), v = World.villageOf(to);
    if (k === 'in' || k === 'nm1' || k === 'nm2' || k === 'pz') this.logEntry(p, to).catch(e => console.error('출입명부 오류:', e.message));
    if (k === 'nm1') this.g.send(p.ws, { t: 'fruitset', list: await this.fruitsShown(v) });
    if (k === 'nm2') this.g.send(p.ws, { t: 'prayset', list: await this.prayList(v) });
    if (k === 'pz') await this.sendRanks(p);
    if (p.game) this.endGame(p, true);
  }
  onLeave(p) { if (p.game) this.endGame(p, true); }

  // ---- 마을 이동 ----
  async onTravel(p, m) {
    const to = m.to, here = World.villageOf(p.area);
    if (!World.VILLAGES[to]) return;
    const atLobby = p.area === 'in' && World.nearElev('in', p.x, p.z, 0.8);
    const atBooth = (p.area === 'o_sa' || p.area === 'o_sn') && World.near(p.x, p.z, World.BOOTH, 5.2);
    if (!atLobby && !atBooth) return this.g.toast(p, '본사 1층 엘리베이터나 마을 엘리베이터에서 이동할 수 있습니다.');
    if (to === here) return this.g.toast(p, '이미 ' + World.VILLAGES[to].n + '입니다.');
    if (to === 'mu') return this.g.moveTo(p, 'in', World.ELEV_OUT.x + (Math.random() - 0.5), World.ELEV_OUT.z, 0);
    const area = World.VILLAGES[to].out, s = World.spawnOf('booth', area);
    this.g.moveTo(p, area, s.x + (Math.random() - 0.5) * 2, s.z, s.f);
  }
  // ---- 나무 회사 계단 (2층은 20명까지) ----
  async onStairs(p) {
    const k = World.kindOf(p.area), v = World.villageOf(p.area);
    if (k === 'nm1') {
      if (!World.near(p.x, p.z, World.NM_STAIRS1, 2.6)) return this.g.toast(p, '계단 앞에서 올라갈 수 있습니다.');
      const to = 'nm2_' + v;
      if (this.g.rooms[to].size >= World.NM2_CAP) return this.g.toast(p, '2층은 ' + World.NM2_CAP + '명까지 들어갈 수 있습니다. 잠시 후 다시 와 주세요.');
      const s = World.spawnOf(p.area, to);
      return this.g.moveTo(p, to, s.x, s.z, s.f);
    }
    if (k === 'nm2') {
      if (!World.near(p.x, p.z, World.NM_STAIRS2, 2.6)) return this.g.toast(p, '계단 앞에서 내려갈 수 있습니다.');
      const to = 'nm1_' + v, s = World.spawnOf(p.area, to);
      return this.g.moveTo(p, to, s.x, s.z, s.f);
    }
  }
  // ---- 2층 방석 ----
  onSitCushion(p, m) {
    const now = Date.now(), i = Number(m.i);
    if (World.kindOf(p.area) !== 'nm2' || p.sit || now - p.lastSit < 400) return;
    const c = Number.isInteger(i) ? World.CUSHIONS[i] : null;
    if (!c) return;
    p.lastSit = now;
    if (Math.hypot(c[0] - p.x, c[1] - p.z) > 2.2) return this.g.toast(p, '조금 더 가까이 가서 앉아 주세요.');
    const id = -1 - i;
    for (const q of this.g.rooms[p.area]) if (q.sit && q.sit.id === id) return this.g.toast(p, '이미 다른 사람이 앉아 있습니다.');
    p.sit = { id, slot: 0 }; p.sitFrom = { x: p.x, z: p.z };
    p.x = c[0]; p.z = c[1]; p.f = Math.PI; p.dirty = false;              // 앞의 화면을 바라본다
    this.g.broadcast(p.area, { t: 'sit', id: p.id, s: 1, x: p.x, z: p.z, f: p.f, c: 1 });
  }

  // ---- 열매 ----
  async fruitsShown(v) { return (await db.listFruits(v, World.FRUIT_SHOW, 0)).rows.map(f => [f.id, f.name]); }
  async onFruit(p, m) {
    const v = World.villageOf(p.area), name = clean(m.name, World.FRUIT_NAME);
    if (World.kindOf(p.area) !== 'nm1') return;
    if (!World.near(p.x, p.z, World.NM_TREE, 4.2)) return this.g.toast(p, '나무 가까이에서 열매를 맺을 수 있습니다.');
    if (!RE_FRUIT.test(name)) return this.g.toast(p, '이름은 한글, 영문, 숫자로 1~10자까지 쓸 수 있습니다.');
    const now = Date.now();
    if (p.fruitAt && now - p.fruitAt < FRUIT_GAP) return this.g.toast(p, '열매는 ' + Math.ceil((FRUIT_GAP - (now - p.fruitAt)) / 1000) + '초 뒤에 다시 맺을 수 있습니다.');
    p.fruitAt = now;
    const f = await db.addFruit(v, name, p.id);
    this.g.broadcast(p.area, { t: 'fruitnew', f: [f.id, f.name], by: p.name });
    if (this.g.alive(p)) this.g.toast(p, '"' + name + '" 열매가 맺혔습니다.');
  }
  async sendFruitLog(p, m) {
    const v = World.villageOf(p.area);
    if (World.kindOf(p.area) !== 'nm1') return;
    const page = Math.max(0, Math.min(1000, Number(m.page) | 0));
    const r = await db.listFruits(v, 50, page * 50);
    this.g.send(p.ws, { t: 'fruitlog', page, total: r.total, list: r.rows.map(f => [f.id, f.name, f.by || '', +new Date(f.created_at)]) });
  }

  // ---- 2층 기도 글 ----
  async prayList(v) { return (await db.listPrayers(v, 30)).map(x => [x.id, x.nickname, x.body, +new Date(x.created_at)]); }
  async onPray(p, m) {
    const v = World.villageOf(p.area), body = clean(m.m, World.PRAY_LEN);
    if (World.kindOf(p.area) !== 'nm2') return;
    if (!p.sit || p.sit.id >= 0) return this.g.toast(p, '방석에 앉아야 글을 쓸 수 있습니다.');
    if (!body) return;
    const now = Date.now();
    if (p.prayAt && now - p.prayAt < PRAY_GAP) return this.g.toast(p, Math.ceil((PRAY_GAP - (now - p.prayAt)) / 1000) + '초 뒤에 다시 쓸 수 있습니다.');
    p.prayAt = now;
    const r = await db.addPrayer(v, p.id, p.name, body);
    this.g.broadcast(p.area, { t: 'praynew', it: [r.id, p.name, body, +new Date(r.created_at)] });
  }
  // 관리자가 글을 숨기면 그 마을 2층 화면에서도 바로 지운다
  async refreshPrayers(v) { this.g.broadcast('nm2_' + v, { t: 'prayset', list: await this.prayList(v) }); }
  async refreshFruits(v) { this.g.broadcast('nm1_' + v, { t: 'fruitset', list: await this.fruitsShown(v) }); }

  // ---- 출입명부 ----
  async logEntry(p, area) {
    const key = p.id + '|' + area, now = Date.now(), last = this.entrySeen.get(key) || 0;
    if (now - last < ENTRY_GAP) return;
    this.entrySeen.set(key, now);
    if (this.entrySeen.size > 5000) for (const [k, t] of this.entrySeen) if (now - t > ENTRY_GAP) this.entrySeen.delete(k);
    await db.logEntry(p.id, p.name, area);
  }
  // 나무 회사 1층 출입명부: 그 회사(1층, 2층)에 들어온 기록
  async sendEntries(p) {
    const v = World.villageOf(p.area);
    if (World.kindOf(p.area) !== 'nm1') return;
    if (!World.near(p.x, p.z, World.NM_BOOK, 3)) return this.g.toast(p, '출입명부 책상 앞에서 볼 수 있습니다.');
    const rows = await db.listVisits(['nm1_' + v, 'nm2_' + v], 100);
    this.g.send(p.ws, { t: 'entries', list: rows.map(r => [r.nickname, r.place, +new Date(r.created_at)]) });
  }

  // ---- 플레이존 게임 (무료) ----
  gameOk(p) {
    const now = Date.now(), sec = Math.floor(now / 1000);
    if (p.gSec !== sec) { p.gSec = sec; p.gCount = 0; }
    return ++p.gCount <= GAME_MSG_MAX;
  }
  onGame(p, m) {
    if (!this.gameOk(p)) return;
    if (m.t === 'g_quit') return this.endGame(p, true);
    if (m.t === 'g_start') {
      if (World.kindOf(p.area) !== 'pz' || !World.GAMES[m.g]) return;
      const cab = World.CABINETS.find(c => c.g === m.g);
      if (!World.near(p.x, p.z, { x: cab.x, z: -6.3 }, 2.6)) return this.g.toast(p, '게임기 앞에서 시작할 수 있습니다.');
      const now = Date.now();
      p.gStarts = (p.gStarts || []).filter(t => now - t < 60000);
      if (p.gStarts.length >= 12) return this.g.toast(p, '잠시 쉬었다가 다시 시작해 주세요.');
      p.gStarts.push(now);
      if (p.game) this.endGame(p, true);
      const G = p.game = { g: m.g, t0: now, score: 0, sid: (p.gSid = (p.gSid || 0) + 1) };
      if (m.g === 'mem') { G.lv = 1; this.memNext(p); }
      else if (m.g === 'math') {
        G.end = now + 60000;
        G.timer = setTimeout(() => { if (p.game === G) this.endGame(p, false); }, 60500);
        this.mathNext(p);
      } else {
        G.next = 1; G.grid = shuffle(Array.from({ length: 25 }, (_, i) => i + 1));
        G.timer = setTimeout(() => { if (p.game === G) this.endGame(p, true); }, 180000);
        G.t0 = Date.now();
        this.g.send(p.ws, { t: 'g', g: 't25', st: 'grid', grid: G.grid, sid: G.sid });
      }
      return;
    }
    const G = p.game;
    if (!G || Number(m.sid) !== G.sid) return;
    if (G.g === 'mem') {
      const ok = typeof m.a === 'string' && m.a === G.seq;
      if (Date.now() - G.asked > 90000 || !ok) return this.endGame(p, false);
      G.score = G.lv; G.lv++;
      if (G.lv > 40) return this.endGame(p, false);
      this.memNext(p);
    } else if (G.g === 'math') {
      if (Date.now() > G.end) return this.endGame(p, false);
      const ok = Number(m.a) === G.ans && String(m.a).trim() !== '';
      if (ok) G.score++;
      this.mathNext(p, ok);
    } else if (G.g === 't25') {
      const n = Number(m.a);
      if (n === G.next) {
        G.next++;
        if (G.next > 25) { G.score = Date.now() - G.t0; return this.endGame(p, false, true); }
        this.g.send(p.ws, { t: 'g', g: 't25', st: 'ok', n, sid: G.sid });
      } else this.g.send(p.ws, { t: 'g', g: 't25', st: 'miss', n, sid: G.sid });
    }
  }
  memNext(p) {
    const G = p.game, len = G.lv + 2;
    let s = String(1 + rnd(9));
    while (s.length < len) s += rnd(10);
    G.seq = s; G.asked = Date.now();
    this.g.send(p.ws, { t: 'g', g: 'mem', st: 'q', lv: G.lv, seq: s, show: 800 + len * 450, score: G.score, sid: G.sid });
  }
  mathNext(p, last) {
    const G = p.game, step = Math.min(4, Math.floor(G.score / 5));
    const op = ['+', '-', '×'][rnd(step >= 2 ? 3 : 2)];
    let a, b;
    if (op === '×') { a = 2 + rnd(8 + step); b = 2 + rnd(8); }
    else { a = 2 + rnd(18 + step * 15); b = 2 + rnd(18 + step * 15); if (op === '-' && b > a) [a, b] = [b, a]; }
    G.ans = op === '+' ? a + b : op === '-' ? a - b : a * b;
    this.g.send(p.ws, { t: 'g', g: 'math', st: 'q', q: a + ' ' + op + ' ' + b, score: G.score, left: Math.max(0, G.end - Date.now()), last: last === undefined ? null : last ? 1 : 0, sid: G.sid });
  }
  // 게임 끝. 그만두거나 장소를 옮기면 기록하지 않는다(1~25는 끝까지 눌러야 기록).
  endGame(p, quit, finished) {
    const G = p.game;
    if (!G) return;
    p.game = null;
    if (G.timer) clearTimeout(G.timer);
    const valid = !quit && (G.g === 't25' ? finished : G.score > 0);
    const out = { t: 'g', g: G.g, st: 'end', score: G.score, quit: quit ? 1 : 0, sid: G.sid };
    if (!valid) { if (this.g.alive(p)) this.g.send(p.ws, out); return; }
    this.saveScore(p, G.g, G.score).then(r => {
      if (!this.g.alive(p)) return;
      out.best = r.best; out.rank = r.rank; out.newBest = r.improved ? 1 : 0;
      this.g.send(p.ws, out);
    }).catch(e => console.error('점수 저장 오류:', e.message));
  }
  async saveScore(p, g, score) {
    const week = weekKey(Date.now()), high = World.GAMES[g].high;
    const r = await db.saveScore(g, week, p.id, score, high);
    const rank = await db.scoreRank(g, week, r.best, high);
    if (r.improved) this.pushRanks();
    return { best: r.best, rank, improved: r.improved };
  }
  async ranksData(uid) {
    const now = Date.now(), week = weekKey(now), last = weekKey(now - 7 * DAY), out = { week, last, games: {}, prev: {}, mine: {}, prize: this.prize };
    for (const g of Object.keys(World.GAMES)) {
      const high = World.GAMES[g].high;
      out.games[g] = (await db.topScores(g, week, 10, high)).map(r => [r.nickname, r.score]);
      out.prev[g] = (await db.topScores(g, last, 3, high)).map(r => [r.nickname, r.score]);
      if (uid) out.mine[g] = await db.myScore(g, week, uid);
    }
    return out;
  }
  async sendRanks(p) { this.g.send(p.ws, { t: 'ranks', ...(await this.ranksData(p.id)) }); }
  // 순위가 바뀌면 플레이존에 있는 사람들의 랭킹판을 새로 그린다 (잦으면 3초에 한 번)
  pushRanks() {
    if (this.rankTimer) return;
    this.rankTimer = setTimeout(async () => {
      this.rankTimer = null;
      for (const v of World.VKEYS) for (const p of this.g.rooms['pz_' + v]) await this.sendRanks(p).catch(() => {});
    }, 3000);
  }
  // ---- 주간 보상: 지난주 게임마다 1~3위에게 코인. 서버가 여러 번 켜져도 한 번만 준다 ----
  async payWeekly() {
    const last = weekKey(Date.now() - 7 * DAY);
    if (!(await db.claimSetting('rankpay:' + last, String(Date.now())))) return;
    const lines = [];
    for (const g of Object.keys(World.GAMES)) {
      const top = await db.topScores(g, last, 3, World.GAMES[g].high);
      for (let i = 0; i < top.length; i++) {
        const amount = this.prize[i] || 0;
        if (!amount) continue;
        const money = await db.refund(top[i].uid, amount);
        await db.audit(top[i].uid, 'money', '주간 랭킹 보상 ' + World.GAMES[g].n + ' ' + (i + 1) + '위 +' + amount + '코인 (' + last + ' 주)');
        const q = this.g.players.get(top[i].uid);
        if (q && money !== null) { this.g.setMoney(q, money); this.g.toast(q, '지난주 ' + World.GAMES[g].n + ' ' + (i + 1) + '위 보상으로 ' + amount + '코인을 받았습니다.'); }
        lines.push(World.GAMES[g].n + ' ' + (i + 1) + '위 ' + top[i].nickname);
      }
    }
    if (lines.length) console.log('주간 랭킹 보상 지급 (' + last + '): ' + lines.join(', '));
  }
  async setPrize(list) {
    if (!Array.isArray(list) || list.length !== 3) throw new Error('1~3위 코인을 모두 넣어 주세요.');
    const v = list.map(x => Number(x));
    if (v.some(x => !Number.isInteger(x) || x < 0 || x > 100000)) throw new Error('코인은 0~100000 사이 정수여야 합니다.');
    this.prize = v;
    await db.setSetting('rank_prize', JSON.stringify(v));
  }
}

module.exports = { Villages, weekKey };
