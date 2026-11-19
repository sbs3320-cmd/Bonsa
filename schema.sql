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

-- 5단계: 게시판. board 1 = 로비 전체 게시판, 2~11 = 층 게시판. 지운 글은 표시만 해 두고 남긴다.
CREATE TABLE IF NOT EXISTS posts (
  id          BIGSERIAL PRIMARY KEY,
  board       INTEGER NOT NULL,
  author      INTEGER NOT NULL REFERENCES users(id),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted     BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS posts_board_idx ON posts (board, id DESC) WHERE NOT deleted;

-- 게시판 개편: 고정한 글만 게시판에 종이로 붙는다. 수정 시각도 남긴다.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- 6단계: 꾸미기. 층마다 놓인 가구 (위치는 격자에 맞춘 값, rot 은 90도 단위 0~3)
CREATE TABLE IF NOT EXISTS furniture (
  id      BIGSERIAL PRIMARY KEY,
  floor   INTEGER NOT NULL,
  type    TEXT NOT NULL,
  x       REAL NOT NULL,
  z       REAL NOT NULL,
  rot     INTEGER NOT NULL DEFAULT 0,
  owner   INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS furniture_floor_idx ON furniture (floor);

-- 7단계: 이벤트, 돈, 상점, 치장
-- 시작 자금: 새로 가입하면 200코인. 이 단계 이전에 가입한 사람에게도 한 번만 200코인을 준다.
ALTER TABLE users ALTER COLUMN money SET DEFAULT 200;
ALTER TABLE users ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hat TEXT;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
WITH first AS (INSERT INTO settings (key, value) VALUES ('starter_v1', 'done') ON CONFLICT DO NOTHING RETURNING key)
UPDATE users SET money = money + 200 WHERE EXISTS (SELECT 1 FROM first);

CREATE TABLE IF NOT EXISTS events (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  reward      INTEGER NOT NULL CHECK (reward > 0),
  creator     INTEGER NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed      BOOLEAN NOT NULL DEFAULT FALSE
);
-- 참가 신청과 보상. (event_id, user_id) 가 기본 키라서 한 사람이 같은 이벤트 보상을 두 번 받을 수 없다.
CREATE TABLE IF NOT EXISTS event_entries (
  event_id  BIGINT NOT NULL REFERENCES events(id),
  user_id   INTEGER NOT NULL REFERENCES users(id),
  status    TEXT NOT NULL DEFAULT 'applied',
  judge     INTEGER,
  paid_at   TIMESTAMPTZ,
  PRIMARY KEY (event_id, user_id)
);
-- 산 치장 아이템
CREATE TABLE IF NOT EXISTS user_items (
  user_id  INTEGER NOT NULL REFERENCES users(id),
  item     TEXT NOT NULL,
  PRIMARY KEY (user_id, item)
);

-- 가구를 놓을 때 낸 값. 치우면 이 값만큼 놓은 사람에게 돌려준다 (값을 받기 전에 놓인 가구는 0).
ALTER TABLE furniture ADD COLUMN IF NOT EXISTS paid INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS audit_log_id_idx ON audit_log (id DESC);

-- 1.4.0: 정장 치장(자켓, 바지, 넥타이)과 층 대표자
ALTER TABLE users ADD COLUMN IF NOT EXISTS jacket TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pants TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tie TEXT;
ALTER TABLE floors ADD COLUMN IF NOT EXISTS rep INTEGER REFERENCES users(id);

-- 1.7.0: 자동 로그인. 비밀번호를 바꾸면 token_ver 가 올라가 예전 로그인 토큰이 모두 무효가 된다
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_ver INTEGER NOT NULL DEFAULT 0;

-- 1.8.0: 마을 (나무 회사 열매, 2층 기도 글, 출입명부, 플레이존 게임 점수)
CREATE TABLE IF NOT EXISTS fruits (
  id SERIAL PRIMARY KEY,
  village TEXT NOT NULL,
  name TEXT NOT NULL,
  uid INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fruits_village_idx ON fruits (village, id DESC);
CREATE TABLE IF NOT EXISTS prayers (
  id SERIAL PRIMARY KEY,
  village TEXT NOT NULL,
  uid INTEGER REFERENCES users(id) ON DELETE SET NULL,
  nickname TEXT NOT NULL,
  body TEXT NOT NULL,
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prayers_village_idx ON prayers (village, id DESC);
CREATE TABLE IF NOT EXISTS entry_log (
  id BIGSERIAL PRIMARY KEY,
  uid INTEGER,
  nickname TEXT NOT NULL,
  place TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS entry_log_place_idx ON entry_log (place, id DESC);
CREATE TABLE IF NOT EXISTS game_scores (
  game TEXT NOT NULL,
  week TEXT NOT NULL,
  uid INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (game, week, uid)
);
