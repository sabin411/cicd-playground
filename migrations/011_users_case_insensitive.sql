ALTER TABLE users DROP CONSTRAINT users_username_key;
ALTER TABLE users DROP CONSTRAINT users_email_key;
DROP INDEX users_username_idx;
DROP INDEX users_email_idx;

UPDATE users SET username = lower(username), email = lower(email);

CREATE UNIQUE INDEX users_username_lower_idx ON users (lower(username));
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));