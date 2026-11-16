'use strict';
// 저장소. DATABASE_URL 이 있으면 PostgreSQL, 없으면 연습용 메모리 저장소를 쓴다.
// 모든 SQL은 파라미터 바인딩($1, $2 ...)만 사용한다.
const fs = require('fs');
const path = require('path');
const config = require('./config');

function pgStore() {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: config.databaseUrl, max: 5 });
  return {
    kind: 'postgres',
    async init() {
      await pool.query(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
    },
    async createUser(username, nickname, passHash, maxUsers) {
      try {
        const r = await pool.query(
          `INSERT INTO users (username, nickname, pass_hash)
           SELECT $1, $2, $3 WHERE (SELECT count(*) FROM users) < $4
           RETURNING id`,
          [username, nickname, passHash, maxUsers]);
        if (!r.rows.length) return { error: 'full' };
        return { id: r.rows[0].id };
      } catch (e) {
        if (e.code === '23505') return { error: /nickname/.test(e.constraint || '') ? 'nickname' : 'username' };
        throw e;
      }
    },
    async findByUsername(username) {
      const r = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
      return r.rows[0] || null;
    },
    async findById(id) {
      const r = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      return r.rows[0] || null;
    },
    // 층 정보: 이름, 12층 비밀번호 해시, 층별 등록 인원
    async loadFloors() {
      const f = await pool.query('SELECT floor, name, pass_hash FROM floors');
      const c = await pool.query('SELECT floor, count(*)::int AS n FROM users WHERE floor IS NOT NULL GROUP BY floor');
      return { floors: f.rows, counts: c.rows };
    },
    // 층 등록. 같은 층에 동시에 몰려도 정원을 넘지 않도록 층마다 잠금을 걸고 센다.
    async registerFloor(uid, floor, cap) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT pg_advisory_xact_lock($1)', [7000 + floor]);
        const me = await c.query('SELECT floor FROM users WHERE id = $1 FOR UPDATE', [uid]);
        if (!me.rows.length || me.rows[0].floor !== null) { await c.query('ROLLBACK'); return { error: 'already' }; }
        const n = await c.query('SELECT count(*)::int AS n FROM users WHERE floor = $1', [floor]);
        if (n.rows[0].n >= cap) { await c.query('ROLLBACK'); return { error: 'full' }; }
        await c.query('UPDATE users SET floor = $2 WHERE id = $1', [uid, floor]);
        await c.query('COMMIT');
        return { ok: true };
      } catch (e) { try { await c.query('ROLLBACK'); } catch (e2) {} throw e; } finally { c.release(); }
    },
    async unregisterFloor(uid) {
      await pool.query('UPDATE users SET floor = NULL WHERE id = $1', [uid]);
    },
    async setFloorName(floor, name) {
      await pool.query('INSERT INTO floors (floor, name) VALUES ($1, $2) ON CONFLICT (floor) DO UPDATE SET name = $2', [floor, name]);
    },
    async setFloorPass(floor, hash) {
      await pool.query('INSERT INTO floors (floor, pass_hash) VALUES ($1, $2) ON CONFLICT (floor) DO UPDATE SET pass_hash = $2', [floor, hash]);
    },
    async audit(actor, action, detail) {
      await pool.query('INSERT INTO audit_log (actor, action, detail) VALUES ($1, $2, $3)', [actor, action, String(detail || '').slice(0, 300)]);
    }
  };
}

function memoryStore() {
  const users = [], floors = [], log = [];
  let seq = 0;
  function row(floor) {
    let f = floors.find(x => x.floor === floor);
    if (!f) { f = { floor, name: '', pass_hash: null }; floors.push(f); }
    return f;
  }
  return {
    kind: 'memory',
    async init() {},
    async createUser(username, nickname, passHash, maxUsers) {
      if (users.length >= maxUsers) return { error: 'full' };
      if (users.some(u => u.username === username)) return { error: 'username' };
      if (users.some(u => u.nickname === nickname)) return { error: 'nickname' };
      const u = { id: ++seq, username, nickname, pass_hash: passHash, rank: 'intern', money: 0, banned: false, floor: null };
      users.push(u);
      return { id: u.id };
    },
    async findByUsername(username) { return users.find(u => u.username === username) || null; },
    async findById(id) { return users.find(u => u.id === id) || null; },
    async loadFloors() {
      const counts = {};
      users.forEach(u => { if (u.floor) counts[u.floor] = (counts[u.floor] || 0) + 1; });
      return { floors: floors.slice(), counts: Object.keys(counts).map(k => ({ floor: Number(k), n: counts[k] })) };
    },
    async registerFloor(uid, floor, cap) {
      const u = users.find(x => x.id === uid);
      if (!u || u.floor !== null) return { error: 'already' };
      if (users.filter(x => x.floor === floor).length >= cap) return { error: 'full' };
      u.floor = floor; return { ok: true };
    },
    async unregisterFloor(uid) { const u = users.find(x => x.id === uid); if (u) u.floor = null; },
    async setFloorName(floor, name) { row(floor).name = name; },
    async setFloorPass(floor, hash) { row(floor).pass_hash = hash; },
    async audit(actor, action, detail) { log.push({ at: Date.now(), actor, action, detail }); if (log.length > 500) log.shift(); }
  };
}

module.exports = config.databaseUrl ? pgStore() : memoryStore();
