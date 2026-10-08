DROP INDEX todos_created_at_idx;
DROP INDEX todos_user_id_created_at_idx;

CREATE INDEX todos_created_at_idx ON todos (created_at DESC, id DESC);
CREATE INDEX todos_user_id_created_at_idx ON todos (user_id, created_at DESC, id DESC);
