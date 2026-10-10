CREATE TABLE users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
	username TEXT NOT NULL UNIQUE,
	email TEXT NOT NULL UNIQUE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX users_username_idx ON users (lower(username));
CREATE INDEX users_email_idx ON users (lower(email));

