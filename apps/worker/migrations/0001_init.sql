CREATE TABLE IF NOT EXISTS users (
  student_id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  failed_login INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS redeem_codes (
  code TEXT PRIMARY KEY,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'unused',
  used_by TEXT NULL,
  used_at TEXT NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  exp_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  image_key TEXT NULL,
  plot_key TEXT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_artifacts_student_expires
  ON artifacts(student_id, expires_at);

CREATE TABLE IF NOT EXISTS usage_logs (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  action TEXT NOT NULL,
  delta INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  meta TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_student_created
  ON usage_logs(student_id, created_at);

