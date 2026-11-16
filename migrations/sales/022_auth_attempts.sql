-- Sign-in attempts, for the limit on /api/auth/login and /api/auth/forgot (api/_auth_guard.js).
-- Apply after 001-021, first on Neon radix-preview; production only with the owner's OK. Idempotent.
-- key: «login:<email>», «login-ip:<ip>», «forgot:<email>», «forgot-ip:<ip>». Rows older than a day are removed as new ones arrive.
BEGIN;
CREATE TABLE IF NOT EXISTS auth_attempts (
  key text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_attempts_key_at ON auth_attempts (key, at);
COMMIT;
