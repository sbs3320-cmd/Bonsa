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
// 로그인 토큰: u 사용자, e 만료 시각, v 토큰 세대(비밀번호를 바꾸면 올라가 예전 토큰이 모두 무효), r 자동 로그인
function signToken(uid, ver, remember) {
  const body = Buffer.from(JSON.stringify({ u: uid, e: Date.now() + (remember ? config.rememberTtlMs : config.sessionTtlMs), v: ver || 0, r: remember ? 1 : 0 })).toString('base64url');
  return body + '.' + hmac(body);
}
// 서명과 만료를 확인하고 내용을 돌려준다. 세대(v)는 DB 값과 비교해야 하므로 tokenOk 로 따로 확인한다.
function readToken(token) {
  if (typeof token !== 'string' || token.length > 300) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const a = Buffer.from(parts[1]), b = Buffer.from(hmac(parts[0]));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!Number.isInteger(d.u) || typeof d.e !== 'number' || d.e < Date.now()) return null;
    return { u: d.u, v: Number.isInteger(d.v) ? d.v : 0, r: d.r === 1 };
  } catch (e) { return null; }
}
function tokenOk(t, user) { return !!t && !!user && t.u === user.id && t.v === (Number(user.token_ver) || 0); }
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

module.exports = { hashPassword, checkPassword, dummyHash, signToken, readToken, tokenOk, verifyToken, limiter };
