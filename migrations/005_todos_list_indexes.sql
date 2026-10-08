CREATE INDEX todos_created_at_idx ON todos (created_at DESC);

CREATE INDEX todos_user_id_created_at_idx ON todos (user_id, created_at DESC);

DROP INDEX todos_user_id_idx;
