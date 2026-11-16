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
    // 게시판: 최근 글 30개(고정한 글이 먼저). 글쓴이의 현재 닉네임과 직급을 함께 꺼낸다.
    async listPosts(board) {
      const r = await pool.query(
        `SELECT p.id, p.title, p.body, p.author, p.created_at, p.pinned, p.edited_at, u.username, u.nickname, u.rank
         FROM posts p JOIN users u ON u.id = p.author
         WHERE p.board = $1 AND NOT p.deleted ORDER BY p.pinned DESC, p.id DESC LIMIT 30`, [board]);
      return r.rows.map(x => ({ id: Number(x.id), title: x.title, body: x.body, author: x.author, at: new Date(x.created_at).getTime(),
        pinned: x.pinned, edited: !!x.edited_at, username: x.username, nickname: x.nickname, rank: x.rank }));
    },
    // 게시판에 종이로 붙는 글(고정한 글). board 를 주지 않으면 모든 게시판.
    async listPinned(board) {
      const r = await pool.query(
        `SELECT p.id, p.board, p.title, u.nickname FROM posts p JOIN users u ON u.id = p.author
         WHERE p.pinned AND NOT p.deleted AND ($1::int IS NULL OR p.board = $1) ORDER BY p.id`, [board === undefined ? null : board]);
      return r.rows.map(x => ({ id: Number(x.id), board: x.board, title: x.title, nickname: x.nickname }));
    },
    async addPost(board, author, title, body) {
      const r = await pool.query('INSERT INTO posts (board, author, title, body) VALUES ($1, $2, $3, $4) RETURNING id', [board, author, title, body]);
      return Number(r.rows[0].id);
    },
    async getPost(id) {
      const r = await pool.query('SELECT id, board, author, title, pinned FROM posts WHERE id = $1 AND NOT deleted', [id]);
      return r.rows[0] ? Object.assign(r.rows[0], { id: Number(r.rows[0].id) }) : null;
    },
    async updatePost(id, title, body) {
      await pool.query('UPDATE posts SET title = $2, body = $3, edited_at = now() WHERE id = $1 AND NOT deleted', [id, title, body]);
    },
    async deletePost(id) { await pool.query('UPDATE posts SET deleted = TRUE, pinned = FALSE WHERE id = $1', [id]); },
    // 고정: 그 게시판의 고정 글이 cap 개 미만일 때만 성공한다
    async pinPost(id, board, cap) {
      const r = await pool.query(
        `UPDATE posts SET pinned = TRUE WHERE id = $1 AND NOT deleted AND NOT pinned
         AND (SELECT count(*) FROM posts WHERE board = $2 AND pinned AND NOT deleted) < $3`, [id, board, cap]);
      return r.rowCount === 1;
    },
    async unpinPost(id) { await pool.query('UPDATE posts SET pinned = FALSE WHERE id = $1', [id]); },
    // 가구
    async loadFurniture() {
      const r = await pool.query('SELECT id, floor, type, x, z, rot FROM furniture ORDER BY id');
      return r.rows.map(x => ({ id: Number(x.id), floor: x.floor, type: x.type, x: Number(x.x), z: Number(x.z), rot: x.rot }));
    },
    async addFurniture(floor, type, x, z, rot, owner) {
      const r = await pool.query('INSERT INTO furniture (floor, type, x, z, rot, owner) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [floor, type, x, z, rot, owner]);
      return Number(r.rows[0].id);
    },
    async moveFurniture(id, x, z, rot) { await pool.query('UPDATE furniture SET x = $2, z = $3, rot = $4 WHERE id = $1', [id, x, z, rot]); },
    async deleteFurniture(id) { await pool.query('DELETE FROM furniture WHERE id = $1', [id]); },
    // 사원 명부 (비밀번호 해시는 꺼내지 않는다)
    async listUsers() {
      const r = await pool.query('SELECT id, username, nickname, rank, floor FROM users WHERE banned = FALSE ORDER BY id LIMIT 300');
      return r.rows;
    },
    // 직급 변경. 그 사이 다른 사람이 먼저 바꿨으면(from 이 다르면) 실패한다.
    async setRank(uid, from, to) {
      const r = await pool.query('UPDATE users SET rank = $3 WHERE id = $1 AND rank = $2', [uid, from, to]);
      return r.rowCount === 1;
    },
    // 사장은 한 명뿐: 새 사장을 뺀 기존 사장을 부장으로 내린다
    async demoteOtherCeos(uid) {
      const r = await pool.query("UPDATE users SET rank = 'manager' WHERE rank = 'ceo' AND id <> $1 RETURNING id", [uid]);
      return r.rows.map(x => x.id);
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
  const users = [], floors = [], log = [], posts = [], furn = [];
  let seq = 0, postSeq = 0, furnSeq = 0;
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
    async listPosts(board) {
      return posts.filter(x => x.board === board && !x.deleted).sort((x, y) => (y.pinned - x.pinned) || (y.id - x.id)).slice(0, 30).map(x => {
        const u = users.find(v => v.id === x.author);
        return { id: x.id, title: x.title, body: x.body, author: x.author, at: x.at, pinned: x.pinned, edited: x.edited,
          username: u.username, nickname: u.nickname, rank: u.rank };
      });
    },
    async listPinned(board) {
      return posts.filter(x => x.pinned && !x.deleted && (board === undefined || x.board === board))
        .map(x => ({ id: x.id, board: x.board, title: x.title, nickname: users.find(v => v.id === x.author).nickname }));
    },
    async addPost(board, author, title, body) { posts.push({ id: ++postSeq, board, author, title, body, at: Date.now(), deleted: false, pinned: false, edited: false }); return postSeq; },
    async getPost(id) { return posts.find(x => x.id === id && !x.deleted) || null; },
    async updatePost(id, title, body) { const x = posts.find(y => y.id === id); if (x) { x.title = title; x.body = body; x.edited = true; } },
    async deletePost(id) { const x = posts.find(y => y.id === id); if (x) { x.deleted = true; x.pinned = false; } },
    async pinPost(id, board, cap) {
      const x = posts.find(y => y.id === id && !y.deleted);
      if (!x || x.pinned || posts.filter(y => y.board === board && y.pinned && !y.deleted).length >= cap) return false;
      x.pinned = true; return true;
    },
    async unpinPost(id) { const x = posts.find(y => y.id === id); if (x) x.pinned = false; },
    async loadFurniture() { return furn.map(x => Object.assign({}, x)); },
    async addFurniture(floor, type, x, z, rot, owner) { furn.push({ id: ++furnSeq, floor, type, x, z, rot, owner }); return furnSeq; },
    async moveFurniture(id, x, z, rot) { const f = furn.find(y => y.id === id); if (f) { f.x = x; f.z = z; f.rot = rot; } },
    async deleteFurniture(id) { const i = furn.findIndex(y => y.id === id); if (i >= 0) furn.splice(i, 1); },
    async listUsers() { return users.filter(u => !u.banned).map(u => ({ id: u.id, username: u.username, nickname: u.nickname, rank: u.rank, floor: u.floor })); },
    async setRank(uid, from, to) { const u = users.find(x => x.id === uid); if (!u || u.rank !== from) return false; u.rank = to; return true; },
    async demoteOtherCeos(uid) { const ids = []; users.forEach(u => { if (u.rank === 'ceo' && u.id !== uid) { u.rank = 'manager'; ids.push(u.id); } }); return ids; },
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
