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
    // 로그인 이름(닉네임)으로 찾기: 똑같은 닉네임 → 대소문자만 다른 닉네임(하나뿐일 때) → 예전 아이디 순서
    async findByLogin(name) {
      let r = await pool.query('SELECT * FROM users WHERE nickname = $1', [name]);
      if (r.rows.length) return r.rows[0];
      r = await pool.query('SELECT * FROM users WHERE lower(nickname) = lower($1) LIMIT 2', [name]);
      if (r.rows.length === 1) return r.rows[0];
      r = await pool.query('SELECT * FROM users WHERE username = $1', [name.toLowerCase()]);
      return r.rows[0] || null;
    },
    async nicknameTaken(nickname) {
      return (await pool.query('SELECT 1 FROM users WHERE lower(nickname) = lower($1) OR username = lower($1) LIMIT 1', [nickname])).rows.length > 0;
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
    // ---- 돈 ----
    // 쓰기: 잔액이 모자라면 한 푼도 빠지지 않는다. 성공하면 남은 돈, 실패하면 null.
    async spend(uid, amount) {
      const r = await pool.query('UPDATE users SET money = money - $2 WHERE id = $1 AND money >= $2 RETURNING money', [uid, amount]);
      return r.rows.length ? r.rows[0].money : null;
    },
    async refund(uid, amount) {
      const r = await pool.query('UPDATE users SET money = money + $2 WHERE id = $1 RETURNING money', [uid, amount]);
      return r.rows.length ? r.rows[0].money : null;
    },
    // ---- 상점 ----
    async listItems(uid) {
      const r = await pool.query('SELECT item FROM user_items WHERE user_id = $1', [uid]);
      return r.rows.map(x => x.item);
    },
    // 구매: 아이템 기록과 돈 차감을 한 묶음으로 처리한다 (둘 중 하나만 되는 일이 없게)
    async buyItem(uid, item, price) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const ins = await c.query('INSERT INTO user_items (user_id, item) VALUES ($1, $2) ON CONFLICT DO NOTHING', [uid, item]);
        if (ins.rowCount !== 1) { await c.query('ROLLBACK'); return { error: 'owned' }; }
        const pay = await c.query('UPDATE users SET money = money - $2 WHERE id = $1 AND money >= $2 RETURNING money', [uid, price]);
        if (!pay.rows.length) { await c.query('ROLLBACK'); return { error: 'poor' }; }
        await c.query('INSERT INTO audit_log (actor, action, detail) VALUES ($1, $2, $3)', [uid, 'money', '구매 ' + item + ' -' + price]);
        await c.query('COMMIT');
        return { money: pay.rows[0].money };
      } catch (e) { try { await c.query('ROLLBACK'); } catch (e2) {} throw e; } finally { c.release(); }
    },
    async setLook(uid, L) { await pool.query('UPDATE users SET color = $2, hat = $3, jacket = $4, pants = $5, tie = $6 WHERE id = $1', [uid, L.color, L.hat, L.jacket, L.pants, L.tie]); },
    // ---- 이벤트 ----
    async listEvents() {
      const r = await pool.query(
        `SELECT e.id, e.title, e.body, e.reward, e.creator, u.nickname FROM events e JOIN users u ON u.id = e.creator
         WHERE NOT e.closed ORDER BY e.id DESC LIMIT 20`);
      return r.rows.map(x => ({ id: Number(x.id), title: x.title, body: x.body, reward: x.reward, creator: x.creator, nickname: x.nickname }));
    },
    async listEntries() {
      const r = await pool.query(
        `SELECT n.event_id, n.user_id, n.status, u.nickname FROM event_entries n
         JOIN events e ON e.id = n.event_id JOIN users u ON u.id = n.user_id WHERE NOT e.closed ORDER BY n.event_id, u.nickname`);
      return r.rows.map(x => ({ event: Number(x.event_id), user: x.user_id, status: x.status, nickname: x.nickname }));
    },
    async countOpenEvents() { return (await pool.query('SELECT count(*)::int AS n FROM events WHERE NOT closed')).rows[0].n; },
    async addEvent(title, body, reward, creator) {
      const r = await pool.query('INSERT INTO events (title, body, reward, creator) VALUES ($1, $2, $3, $4) RETURNING id', [title, body, reward, creator]);
      return Number(r.rows[0].id);
    },
    async getEvent(id) {
      const r = await pool.query('SELECT id, title, reward, creator FROM events WHERE id = $1 AND NOT closed', [id]);
      return r.rows[0] ? Object.assign(r.rows[0], { id: Number(r.rows[0].id) }) : null;
    },
    async closeEvent(id) { await pool.query('UPDATE events SET closed = TRUE WHERE id = $1', [id]); },
    async joinEvent(eid, uid) {
      const r = await pool.query('INSERT INTO event_entries (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [eid, uid]);
      return r.rowCount === 1;
    },
    async rejectEntry(eid, uid) {
      const r = await pool.query("DELETE FROM event_entries WHERE event_id = $1 AND user_id = $2 AND status = 'applied'", [eid, uid]);
      return r.rowCount === 1;
    },
    // 성공 판정과 보상 지급을 한 묶음으로. '신청' 상태인 것만 '지급'으로 바꿀 수 있어서 두 번 눌러도 한 번만 나간다.
    async awardEvent(eid, uid, judge) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const ev = await c.query('SELECT reward FROM events WHERE id = $1 AND NOT closed FOR UPDATE', [eid]);
        if (!ev.rows.length) { await c.query('ROLLBACK'); return null; }
        const up = await c.query("UPDATE event_entries SET status = 'paid', judge = $3, paid_at = now() WHERE event_id = $1 AND user_id = $2 AND status = 'applied'", [eid, uid, judge]);
        if (up.rowCount !== 1) { await c.query('ROLLBACK'); return null; }
        const pay = await c.query('UPDATE users SET money = money + $2 WHERE id = $1 RETURNING money', [uid, ev.rows[0].reward]);
        await c.query('INSERT INTO audit_log (actor, action, detail) VALUES ($1, $2, $3)', [judge, 'money', '이벤트 ' + eid + ' 보상 +' + ev.rows[0].reward + ' -> ' + uid]);
        await c.query('COMMIT');
        return { money: pay.rows[0].money, reward: ev.rows[0].reward };
      } catch (e) { try { await c.query('ROLLBACK'); } catch (e2) {} throw e; } finally { c.release(); }
    },
    // 가구
    async loadFurniture() {
      const r = await pool.query('SELECT id, floor, type, x, z, rot, owner, paid FROM furniture ORDER BY id');
      return r.rows.map(x => ({ id: Number(x.id), floor: x.floor, type: x.type, x: Number(x.x), z: Number(x.z), rot: x.rot, owner: x.owner, paid: x.paid }));
    },
    async addFurniture(floor, type, x, z, rot, owner, paid) {
      const r = await pool.query('INSERT INTO furniture (floor, type, x, z, rot, owner, paid) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [floor, type, x, z, rot, owner, paid]);
      return Number(r.rows[0].id);
    },
    async moveFurniture(id, x, z, rot) { await pool.query('UPDATE furniture SET x = $2, z = $3, rot = $4 WHERE id = $1', [id, x, z, rot]); },
    // 치우기: 지워진 줄이 있을 때만 true (두 사람이 동시에 치워도 환불은 한 번만 나가게)
    async deleteFurniture(id) { return (await pool.query('DELETE FROM furniture WHERE id = $1', [id])).rowCount === 1; },
    async setPassword(uid, hash) { await pool.query('UPDATE users SET pass_hash = $2 WHERE id = $1', [uid, hash]); },
    // ---- 총관리자 화면용 ----
    async getSetting(key) { const r = await pool.query('SELECT value FROM settings WHERE key = $1', [key]); return r.rows.length ? r.rows[0].value : null; },
    async setSetting(key, value) { await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [key, value]); },
    async delSetting(key) { await pool.query('DELETE FROM settings WHERE key = $1', [key]); },
    async adminUsers() {
      const r = await pool.query('SELECT id, username, nickname, rank, floor, money, banned, created_at FROM users ORDER BY id LIMIT 500');
      return r.rows.map(x => Object.assign(x, { created_at: new Date(x.created_at).getTime() }));
    },
    async setRankForce(uid, rank) { return (await pool.query('UPDATE users SET rank = $2 WHERE id = $1', [uid, rank])).rowCount === 1; },
    async adjustMoney(uid, delta) {
      const r = await pool.query('UPDATE users SET money = GREATEST(0, money + $2) WHERE id = $1 RETURNING money', [uid, delta]);
      return r.rows.length ? r.rows[0].money : null;
    },
    async setBanned(uid, on) { return (await pool.query('UPDATE users SET banned = $2 WHERE id = $1', [uid, on])).rowCount === 1; },
    // 백업: 복구에 필요한 것을 모두 담는다 (비밀번호 해시 포함. 관리자 2단계 인증 비밀값은 뺀다)
    async exportAll() {
      const q = async sql => (await pool.query(sql)).rows;
      return {
        users: await q('SELECT * FROM users ORDER BY id'), floors: await q('SELECT * FROM floors ORDER BY floor'),
        posts: await q('SELECT * FROM posts ORDER BY id'), furniture: await q('SELECT * FROM furniture ORDER BY id'),
        events: await q('SELECT * FROM events ORDER BY id'), event_entries: await q('SELECT * FROM event_entries ORDER BY event_id, user_id'),
        user_items: await q('SELECT * FROM user_items ORDER BY user_id, item'),
        settings: await q("SELECT * FROM settings WHERE key <> 'admin_totp' ORDER BY key"),
        audit_log: await q('SELECT * FROM (SELECT * FROM audit_log ORDER BY id DESC LIMIT 5000) t ORDER BY id')
      };
    },
    async adminPosts() {
      const r = await pool.query(
        `SELECT p.id, p.board, p.title, p.body, p.pinned, p.created_at, u.nickname FROM posts p JOIN users u ON u.id = p.author
         WHERE NOT p.deleted ORDER BY p.id DESC LIMIT 150`);
      return r.rows.map(x => ({ id: Number(x.id), board: x.board, title: x.title, body: x.body, pinned: x.pinned, at: new Date(x.created_at).getTime(), nickname: x.nickname }));
    },
    async listAudit(action) {
      const r = await pool.query(
        `SELECT a.id, a.at, a.action, a.detail, u.nickname FROM audit_log a LEFT JOIN users u ON u.id = a.actor
         WHERE ($1::text IS NULL OR a.action = $1) ORDER BY a.id DESC LIMIT 200`, [action || null]);
      return r.rows.map(x => ({ id: Number(x.id), at: new Date(x.at).getTime(), action: x.action, detail: x.detail, nickname: x.nickname }));
    },
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
      // 대표자는 그 층에 등록되어 있고 정지되지 않은 사람만 인정한다
      const f = await pool.query('SELECT f.floor, f.name, f.pass_hash, u.id AS rep, u.nickname AS rep_name FROM floors f '
        + 'LEFT JOIN users u ON u.id = f.rep AND u.floor = f.floor AND NOT u.banned');
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
      await pool.query('UPDATE floors SET rep = NULL WHERE rep = $1', [uid]);      // 층을 떠나면 대표자도 내려놓는다
    },
    // 층 대표자 지정(uid) 또는 해제(null). 지정할 사람은 그 층 등록자여야 한다. 층마다 잠금을 걸어 등록 해제와 엇갈리지 않게 한다.
    async setFloorRep(floor, uid) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT pg_advisory_xact_lock($1)', [7000 + floor]);
        let name = null;
        if (uid) {
          const u = await c.query('SELECT nickname FROM users WHERE id = $1 AND floor = $2 AND NOT banned', [uid, floor]);
          if (!u.rows.length) { await c.query('ROLLBACK'); return { error: 'notmember' }; }
          name = u.rows[0].nickname;
        }
        await c.query('INSERT INTO floors (floor, rep) VALUES ($1, $2) ON CONFLICT (floor) DO UPDATE SET rep = $2', [floor, uid || null]);
        await c.query('COMMIT');
        return { ok: true, name };
      } catch (e) { try { await c.query('ROLLBACK'); } catch (e2) {} throw e; } finally { c.release(); }
    },
    async floorMembers(floor) {
      const r = await pool.query('SELECT id, username, nickname, rank FROM users WHERE floor = $1 AND NOT banned ORDER BY id LIMIT 50', [floor]);
      return r.rows;
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
  const users = [], floors = [], log = [], posts = [], furn = [], events = [], entries = [], settings = {};
  let seq = 0, postSeq = 0, furnSeq = 0, eventSeq = 0;
  function row(floor) {
    let f = floors.find(x => x.floor === floor);
    if (!f) { f = { floor, name: '', pass_hash: null, rep: null }; floors.push(f); }
    return f;
  }
  return {
    kind: 'memory',
    async init() {},
    async createUser(username, nickname, passHash, maxUsers) {
      if (users.length >= maxUsers) return { error: 'full' };
      if (users.some(u => u.username === username)) return { error: 'username' };
      if (users.some(u => u.nickname === nickname)) return { error: 'nickname' };
      const u = { id: ++seq, username, nickname, pass_hash: passHash, rank: 'intern', money: 200, banned: false, floor: null, color: null, hat: null, jacket: null, pants: null, tie: null, items: [] };
      users.push(u);
      return { id: u.id };
    },
    async findByUsername(username) { return users.find(u => u.username === username) || null; },
    async findByLogin(name) {
      const ex = users.find(u => u.nickname === name); if (ex) return ex;
      const ci = users.filter(u => u.nickname.toLowerCase() === name.toLowerCase()); if (ci.length === 1) return ci[0];
      return users.find(u => u.username === name.toLowerCase()) || null;
    },
    async nicknameTaken(nickname) { const l = nickname.toLowerCase(); return users.some(u => u.nickname.toLowerCase() === l || u.username === l); },
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
    async spend(uid, amount) { const u = users.find(x => x.id === uid); if (!u || u.money < amount) return null; u.money -= amount; return u.money; },
    async refund(uid, amount) { const u = users.find(x => x.id === uid); if (!u) return null; u.money += amount; return u.money; },
    async listItems(uid) { const u = users.find(x => x.id === uid); return u ? u.items.slice() : []; },
    async buyItem(uid, item, price) {
      const u = users.find(x => x.id === uid);
      if (u.items.includes(item)) return { error: 'owned' };
      if (u.money < price) return { error: 'poor' };
      u.money -= price; u.items.push(item); log.push({ actor: uid, action: 'money', detail: '구매 ' + item + ' -' + price });
      return { money: u.money };
    },
    async setLook(uid, L) { const u = users.find(x => x.id === uid); if (u) { u.color = L.color; u.hat = L.hat; u.jacket = L.jacket; u.pants = L.pants; u.tie = L.tie; } },
    async listEvents() {
      return events.filter(e => !e.closed).slice(-20).reverse().map(e => ({ id: e.id, title: e.title, body: e.body, reward: e.reward, creator: e.creator, nickname: users.find(u => u.id === e.creator).nickname }));
    },
    async listEntries() {
      return entries.filter(n => events.some(e => e.id === n.event && !e.closed)).map(n => ({ event: n.event, user: n.user, status: n.status, nickname: users.find(u => u.id === n.user).nickname }));
    },
    async countOpenEvents() { return events.filter(e => !e.closed).length; },
    async addEvent(title, body, reward, creator) { events.push({ id: ++eventSeq, title, body, reward, creator, closed: false }); return eventSeq; },
    async getEvent(id) { return events.find(e => e.id === id && !e.closed) || null; },
    async closeEvent(id) { const e = events.find(x => x.id === id); if (e) e.closed = true; },
    async joinEvent(eid, uid) { if (entries.some(n => n.event === eid && n.user === uid)) return false; entries.push({ event: eid, user: uid, status: 'applied' }); return true; },
    async rejectEntry(eid, uid) { const i = entries.findIndex(n => n.event === eid && n.user === uid && n.status === 'applied'); if (i < 0) return false; entries.splice(i, 1); return true; },
    async awardEvent(eid, uid, judge) {
      const e = events.find(x => x.id === eid && !x.closed), n = entries.find(x => x.event === eid && x.user === uid && x.status === 'applied');
      if (!e || !n) return null;
      n.status = 'paid'; n.judge = judge;
      const u = users.find(x => x.id === uid); u.money += e.reward;
      log.push({ actor: judge, action: 'money', detail: '이벤트 ' + eid + ' 보상 +' + e.reward + ' -> ' + uid });
      return { money: u.money, reward: e.reward };
    },
    async loadFurniture() { return furn.map(x => Object.assign({}, x)); },
    async addFurniture(floor, type, x, z, rot, owner, paid) { furn.push({ id: ++furnSeq, floor, type, x, z, rot, owner, paid }); return furnSeq; },
    async moveFurniture(id, x, z, rot) { const f = furn.find(y => y.id === id); if (f) { f.x = x; f.z = z; f.rot = rot; } },
    async deleteFurniture(id) { const i = furn.findIndex(y => y.id === id); if (i < 0) return false; furn.splice(i, 1); return true; },
    async setPassword(uid, hash) { const u = users.find(x => x.id === uid); if (u) u.pass_hash = hash; },
    async getSetting(key) { return Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : null; },
    async setSetting(key, value) { settings[key] = value; },
    async delSetting(key) { delete settings[key]; },
    async adminUsers() { return users.map(u => ({ id: u.id, username: u.username, nickname: u.nickname, rank: u.rank, floor: u.floor, money: u.money, banned: u.banned, created_at: u.created_at || 0 })); },
    async setRankForce(uid, rank) { const u = users.find(x => x.id === uid); if (!u) return false; u.rank = rank; return true; },
    async adjustMoney(uid, delta) { const u = users.find(x => x.id === uid); if (!u) return null; u.money = Math.max(0, u.money + delta); return u.money; },
    async setBanned(uid, on) { const u = users.find(x => x.id === uid); if (!u) return false; u.banned = on; return true; },
    async exportAll() {
      const s = {}; Object.keys(settings).forEach(k => { if (k !== 'admin_totp') s[k] = settings[k]; });
      return { users, floors, posts, furniture: furn, events, event_entries: entries, user_items: users.map(u => ({ user_id: u.id, items: u.items })), settings: s, audit_log: log.slice(-5000) };
    },
    async adminPosts() {
      return posts.filter(x => !x.deleted).slice(-150).reverse().map(x => ({ id: x.id, board: x.board, title: x.title, body: x.body, pinned: x.pinned, at: x.at, nickname: users.find(v => v.id === x.author).nickname }));
    },
    async listAudit(action) {
      return log.filter(x => !action || x.action === action).slice(-200).reverse().map((x, i) => ({ id: log.length - i, at: x.at || Date.now(), action: x.action, detail: x.detail, nickname: (users.find(u => u.id === x.actor) || {}).nickname || null }));
    },
    async listUsers() { return users.filter(u => !u.banned).map(u => ({ id: u.id, username: u.username, nickname: u.nickname, rank: u.rank, floor: u.floor })); },
    async setRank(uid, from, to) { const u = users.find(x => x.id === uid); if (!u || u.rank !== from) return false; u.rank = to; return true; },
    async demoteOtherCeos(uid) { const ids = []; users.forEach(u => { if (u.rank === 'ceo' && u.id !== uid) { u.rank = 'manager'; ids.push(u.id); } }); return ids; },
    async loadFloors() {
      const counts = {};
      users.forEach(u => { if (u.floor) counts[u.floor] = (counts[u.floor] || 0) + 1; });
      return { floors: floors.map(f => {
        const u = users.find(x => x.id === f.rep && x.floor === f.floor && !x.banned);
        return { floor: f.floor, name: f.name, pass_hash: f.pass_hash, rep: u ? u.id : null, rep_name: u ? u.nickname : null };
      }), counts: Object.keys(counts).map(k => ({ floor: Number(k), n: counts[k] })) };
    },
    async registerFloor(uid, floor, cap) {
      const u = users.find(x => x.id === uid);
      if (!u || u.floor !== null) return { error: 'already' };
      if (users.filter(x => x.floor === floor).length >= cap) return { error: 'full' };
      u.floor = floor; return { ok: true };
    },
    async unregisterFloor(uid) { const u = users.find(x => x.id === uid); if (u) u.floor = null; floors.forEach(f => { if (f.rep === uid) f.rep = null; }); },
    async setFloorRep(floor, uid) {
      let name = null;
      if (uid) { const u = users.find(x => x.id === uid && x.floor === floor && !x.banned); if (!u) return { error: 'notmember' }; name = u.nickname; }
      row(floor).rep = uid || null; return { ok: true, name };
    },
    async floorMembers(floor) { return users.filter(u => u.floor === floor && !u.banned).slice(0, 50).map(u => ({ id: u.id, username: u.username, nickname: u.nickname, rank: u.rank })); },
    async setFloorName(floor, name) { row(floor).name = name; },
    async setFloorPass(floor, hash) { row(floor).pass_hash = hash; },
    async audit(actor, action, detail) { log.push({ at: Date.now(), actor, action, detail }); if (log.length > 500) log.shift(); }
  };
}

module.exports = config.databaseUrl ? pgStore() : memoryStore();
