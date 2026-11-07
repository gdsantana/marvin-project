CREATE TABLE auth_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9][a-z0-9_.-]{2,63}$'),
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  owner boolean NOT NULL DEFAULT true CONSTRAINT auth_users_owner_only CHECK (owner = true),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX auth_users_single_owner ON auth_users (owner);
--> statement-breakpoint
CREATE TABLE auth_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions (expires_at);
--> statement-breakpoint
CREATE TABLE auth_login_attempts (
  key text PRIMARY KEY,
  count integer NOT NULL,
  reset_at timestamptz NOT NULL
);
