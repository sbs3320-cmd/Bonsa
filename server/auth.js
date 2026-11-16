'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('./config');

const hashPassword = pw => bcrypt.hash(pw, 10);
const checkPassword = (pw, hash) => bcrypt.compare(pw, hash);
// 없는 아이디로 로그인해도 응답 시간이 같도록 비교용 해시를 하나 만들어 둔다.
const dummyHash = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

function hmac(body) {
  return crypto.createHmac('sha256', config.sessionSecret).update(body).digest('base64url');
}
function signToken(uid) {
  const body = Buffer.from(JSON.stringify({ u: uid, e: Date.now() + config.sessionTtlMs })).toString('base64url');
  return body + '.' + hmac(body);
}
function verifyToken(token) {
  if (typeof token !== 'string' || token.length > 300) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const a = Buffer.from(parts[1]), b = Buffer.from(hmac(parts[0]));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!Number.isInteger(d.u) || typeof d.e !== 'number' || d.e < Date.now()) return null;
    return d.u;
  } catch (e) { return null; }
}

// 횟수 제한: windowMs 동안 max 번까지만 허용
function limiter(max, windowMs) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, 60000);
  timer.unref();
  return {
    hit(key) {
      const now = Date.now();
      let v = hits.get(key);
      if (!v || v.reset < now) { v = { n: 0, reset: now + windowMs }; hits.set(key, v); }
      v.n++;
      return v.n <= max;
    },
    over(key) { const v = hits.get(key); return !!v && v.reset >= Date.now() && v.n >= max; },
    clear(key) { hits.delete(key); }
  };
}

module.exports = { hashPassword, checkPassword, dummyHash, signToken, verifyToken, limiter };
