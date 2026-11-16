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
    }
  };
}

function memoryStore() {
  const users = [];
  let seq = 0;
  return {
    kind: 'memory',
    async init() {},
    async createUser(username, nickname, passHash, maxUsers) {
      if (users.length >= maxUsers) return { error: 'full' };
      if (users.some(u => u.username === username)) return { error: 'username' };
      if (users.some(u => u.nickname === nickname)) return { error: 'nickname' };
      const u = { id: ++seq, username, nickname, pass_hash: passHash, rank: 'intern', money: 0, banned: false };
      users.push(u);
      return { id: u.id };
    },
    async findByUsername(username) { return users.find(u => u.username === username) || null; },
    async findById(id) { return users.find(u => u.id === id) || null; }
  };
}

module.exports = config.databaseUrl ? pgStore() : memoryStore();
