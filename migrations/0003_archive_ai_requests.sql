CREATE TABLE IF NOT EXISTS archive_ai_requests (
  request_id UUID PRIMARY KEY,
  session_hash TEXT NOT NULL CHECK (char_length(session_hash) = 64),
  surface TEXT NOT NULL CHECK (surface IN ('search', 'persona')),
  client_version TEXT NOT NULL,
  payload_hash TEXT NOT NULL CHECK (char_length(payload_hash) = 64),
  requested_model TEXT NOT NULL,
  provider_model TEXT,
  state TEXT NOT NULL CHECK (
    state IN ('queued', 'running', 'unknown', 'succeeded', 'local', 'failed', 'expired', 'cancelled')
  ),
  encrypted_request TEXT,
  processing_context JSONB NOT NULL DEFAULT '{}'::JSONB,
  encrypted_result TEXT,
  provider_response_id TEXT,
  openai_request_id TEXT,
  provider_request_ids JSONB NOT NULL DEFAULT '[]'::JSONB,
  delivery_reason TEXT,
  retryable BOOLEAN NOT NULL DEFAULT FALSE,
  attempt_count SMALLINT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  lease_generation INTEGER NOT NULL DEFAULT 0 CHECK (lease_generation >= 0),
  lease_expires_at TIMESTAMPTZ,
  next_poll_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS archive_ai_requests_claim_idx
  ON archive_ai_requests (state, lease_expires_at, next_poll_at);

CREATE INDEX IF NOT EXISTS archive_ai_requests_expires_at_idx
  ON archive_ai_requests (expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS archive_ai_requests_provider_response_idx
  ON archive_ai_requests (provider_response_id)
  WHERE provider_response_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS archive_ai_rate_charges (
  request_id UUID PRIMARY KEY,
  allowed BOOLEAN NOT NULL,
  safety_identifier TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS archive_ai_rate_charges_expires_at_idx
  ON archive_ai_rate_charges (expires_at);

CREATE TABLE IF NOT EXISTS archive_ai_circuit_breakers (
  breaker_key TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'closed' CHECK (state IN ('closed', 'open', 'half_open')),
  failure_timestamps JSONB NOT NULL DEFAULT '[]'::JSONB,
  success_timestamps JSONB NOT NULL DEFAULT '[]'::JSONB,
  consecutive_opens SMALLINT NOT NULL DEFAULT 0,
  probe_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  probe_lease_expires_at TIMESTAMPTZ,
  opened_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
