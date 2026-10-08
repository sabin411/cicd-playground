CREATE TABLE idempotency_keys (
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

DROP INDEX IF EXISTS todos_user_idempotency_key_idx;
ALTER TABLE todos DROP COLUMN IF EXISTS idempotency_key;
