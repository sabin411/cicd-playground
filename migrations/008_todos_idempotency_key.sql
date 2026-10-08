UPDATE todos
SET idempotency_key = 'legacy-' || id::text
WHERE idempotency_key = '';

CREATE UNIQUE INDEX todos_user_idempotency_key_idx ON todos (user_id, idempotency_key);
