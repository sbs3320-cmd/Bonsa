'use strict';
// 게임 상태. 장소(야외, 1층 로비)마다 방을 나눠 같은 방 사람끼리만 위치와 채팅을 주고받는다.
// 클라이언트가 보낸 값은 믿지 않고, 이동 속도와 벽 통과, 문 위치를 서버가 다시 검사한다.
const World = require('../public/world.js');
const config = require('./config');
const weather = require('./weather');

const TICK_MS = 100;            // 위치 방송 주기 (초당 10번)
const MAX_MOVES_PER_SEC = 30;
const CHAT_MAX = 5, CHAT_WINDOW_MS = 5000, CHAT_LEN = 120;

class Game {
  constructor() {
    this.players = new Map();                       // uid -> player
    this.rooms = { out: new Set(), in: new Set() };
    this.ticks = 0; this.lastOnline = 0;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.timer.unref();
    // 날씨가 바뀌면 접속자 모두에게 알린다
    weather.onChange(wx => {
      const msg = JSON.stringify({ t: 'wx', wx });
      for (const p of this.players.values()) if (p.ws.readyState === 1) p.ws.send(msg);
    });
  }

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
      rank: config.superAdmin && user.username === config.superAdmin ? 'owner' : user.rank,
      area: 'out', x: World.SPAWN.start.x + (Math.random() * 4 - 2), z: World.SPAWN.start.z + Math.random() * 2,
      f: Math.PI, dirty: false, lastMove: Date.now(), moveSec: 0, moveCount: 0, chatTimes: [],
      umb: false, lastUmb: 0
    };
    this.players.set(p.id, p);
    this.rooms[p.area].add(p);
    this.send(ws, { t: 'hello', id: p.id, me: { n: p.name, r: p.rank, area: p.area, x: p.x, z: p.z },
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
    this.rooms[p.area].delete(p);
    this.broadcast(p.area, { t: 'leave', id: p.id });
    p.area = to; p.x = World.SPAWN[to].x; p.z = World.SPAWN[to].z; p.f = to === 'in' ? Math.PI : 0;
    p.lastMove = Date.now(); p.dirty = false;
    this.rooms[to].add(p);
    this.send(p.ws, { t: 'area', area: to, x: p.x, z: p.z, players: this.roster(to, p) });
    this.broadcast(to, { t: 'join', p: this.pub(p) }, p);
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
