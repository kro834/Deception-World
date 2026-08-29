CREATE TABLE IF NOT EXISTS archive_ai_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS archive_ai_rate_limits_expires_at_idx
  ON archive_ai_rate_limits (expires_at);
