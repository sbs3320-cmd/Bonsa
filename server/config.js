'use strict';
const crypto = require('crypto');

const production = process.env.NODE_ENV === 'production';
let secret = process.env.SESSION_SECRET || '';
if (secret.length < 32) {
  if (production) {
    console.error('SESSION_SECRET 환경 변수를 32자 이상으로 설정해야 합니다.');
    process.exit(1);
  }
  secret = crypto.randomBytes(32).toString('hex');
  console.warn('[주의] SESSION_SECRET 이 없어 임시 값을 씁니다. 서버를 다시 켜면 모두 로그아웃됩니다.');
}

module.exports = {
  production,
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL || '',
  sessionSecret: secret,
  sessionTtlMs: 24 * 60 * 60 * 1000,
  maxUsers: Number(process.env.MAX_USERS) || 200,
  maxOnline: Number(process.env.MAX_ONLINE) || 100
};
