-- 서버가 시작할 때 자동으로 실행됩니다. 직접 실행할 필요는 없습니다.
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  username    TEXT NOT NULL UNIQUE,
  nickname    TEXT NOT NULL UNIQUE,
  pass_hash   TEXT NOT NULL,
  rank        TEXT NOT NULL DEFAULT 'intern',
  money       INTEGER NOT NULL DEFAULT 0,
  banned      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3단계: 층 등록, 층 이름, 12층 비밀번호(해시로만 저장), 감사 기록
ALTER TABLE users ADD COLUMN IF NOT EXISTS floor INTEGER;
CREATE TABLE IF NOT EXISTS floors (
  floor      INTEGER PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  pass_hash  TEXT
);
CREATE TABLE IF NOT EXISTS audit_log (
  id      BIGSERIAL PRIMARY KEY,
  at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor   INTEGER,
  action  TEXT NOT NULL,
  detail  TEXT
);
