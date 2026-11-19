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
  rememberTtlMs: 30 * 24 * 60 * 60 * 1000,      // 자동 로그인: 30일, 접속할 때마다 다시 30일로 늘어난다
  maxUsers: Number(process.env.MAX_USERS) || 200,
  maxOnline: Number(process.env.MAX_ONLINE) || 100,
  // 횟수 제한. 같은 사무실·학교처럼 여러 사람이 한 IP를 같이 쓰는 경우를 생각해 넉넉히 잡고, 전체 합계 제한을 따로 둔다.
  apiPerMin: Number(process.env.API_PER_MIN) || 40,
  signupPerHour: Number(process.env.SIGNUP_PER_HOUR) || 30,
  signupPerHourAll: Number(process.env.SIGNUP_PER_HOUR_ALL) || 80,
  wsPerMin: Number(process.env.WS_PER_MIN) || 120,
  // 총관리자 계정의 로그인 아이디. 비밀번호는 여기에 두지 않는다 (가입할 때 정한 것이 해시로 DB에만 있다).
  superAdmin: (process.env.SUPERADMIN_USERNAME || '').trim().toLowerCase()
};
