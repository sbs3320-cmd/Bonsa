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
