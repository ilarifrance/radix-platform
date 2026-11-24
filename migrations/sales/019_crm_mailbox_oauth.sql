-- CRM: caselle email con accesso Microsoft 365 (OAuth). A mailbox can now send through Microsoft Graph (permission
-- Mail.Send, delegated) instead of SMTP with an app password: it works even when the organisation has SMTP AUTH turned
-- off. The long-lived refresh token is stored only encrypted with AES-256-GCM (api/_mailbox_crypto.js, key MAILBOX_ENC_KEY
-- outside the database), bound to workspace and mailbox id, and never returned to a browser. SMTP mailboxes are unchanged.
-- Apply after 001-018, first on Neon radix-preview; production only with the owner's OK. Idempotent.
BEGIN;
ALTER TABLE sales_mailboxes ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'smtp' CHECK(provider IN ('smtp','microsoft'));
ALTER TABLE sales_mailboxes ADD COLUMN IF NOT EXISTS oauth_ciphertext text CHECK(length(oauth_ciphertext)<=8000);
ALTER TABLE sales_mailboxes ADD COLUMN IF NOT EXISTS oauth_iv text CHECK(length(oauth_iv)<=100);
ALTER TABLE sales_mailboxes ADD COLUMN IF NOT EXISTS oauth_tag text CHECK(length(oauth_tag)<=100);
ALTER TABLE sales_mailboxes ALTER COLUMN password_ciphertext DROP NOT NULL;
ALTER TABLE sales_mailboxes ALTER COLUMN password_iv DROP NOT NULL;
ALTER TABLE sales_mailboxes ALTER COLUMN password_tag DROP NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sales_mailboxes_credentials') THEN
  ALTER TABLE sales_mailboxes ADD CONSTRAINT sales_mailboxes_credentials CHECK (
   (provider='smtp' AND password_ciphertext IS NOT NULL AND password_iv IS NOT NULL AND password_tag IS NOT NULL)
   OR (provider='microsoft' AND oauth_ciphertext IS NOT NULL AND oauth_iv IS NOT NULL AND oauth_tag IS NOT NULL));
 END IF;
END $$;
COMMIT;
