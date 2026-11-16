'use strict';
// 2단계 인증(휴대폰 인증 앱의 6자리 코드, RFC 6238 TOTP). 외부 라이브러리 없이 Node 기본 기능만 쓴다.
const crypto = require('crypto');
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function toBase32(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function fromBase32(str) {
  let bits = 0, value = 0; const out = [];
  for (const ch of String(str).toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function codeAt(secretB32, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', fromBase32(secretB32)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, '0');
}
// 맞으면 그 코드의 시간 칸 번호를, 틀리면 0을 돌려준다. 앞뒤 30초까지는 시계 오차로 보고 받아 준다.
// after: 이미 쓴 칸 번호. 같은 코드를 다시 쓰는 것을 막는다.
function verify(secretB32, code, after, now) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return 0;
  const step = Math.floor((now || Date.now()) / 30000);
  for (const c of [step, step - 1, step + 1]) {
    if (c <= (after || 0)) continue;
    const a = Buffer.from(codeAt(secretB32, c)), b = Buffer.from(code);
    if (crypto.timingSafeEqual(a, b)) return c;
  }
  return 0;
}
const newSecret = () => toBase32(crypto.randomBytes(20));
const uri = (secret, account) => 'otpauth://totp/' + encodeURIComponent('본사 관리자:' + account) + '?secret=' + secret + '&issuer=' + encodeURIComponent('본사 관리자') + '&digits=6&period=30';

module.exports = { newSecret, uri, verify, codeAt, toBase32, fromBase32 };
