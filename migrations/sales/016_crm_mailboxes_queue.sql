-- CRM: «Caselle email» and «Coda invii». Up to 5 sending mailboxes per workspace (SMTP with an app
-- password, stored encrypted by api/_mailbox_crypto.js: the database never sees the clear password), and a
-- queue of campaign emails sent by the worker (api/_sales_send_worker.js, Vercel Cron every 10 minutes)
-- at staggered times in working hours, within each mailbox's daily limit (max 50, lower while warming up).
-- Queue rows are written only by «Metti in coda» after the user's confirmation; consent and unsubscribe are
-- checked again at send time. Apply after 001-015, first on Neon radix-preview; production only with the
-- owner's OK. Idempotent: IF NOT EXISTS everywhere. sales_command is unchanged (no full replacement of 015):
-- mailboxes and queue are not sales_command entities, they have their own allowlisted actions in api/_sales_mailboxes.js.
-- The limit of 5 mailboxes per workspace is enforced in code. Needs PostgreSQL 15+ for ON DELETE SET NULL (column).
BEGIN;
DO $$ BEGIN
 IF current_setting('server_version_num')::integer<150000 THEN RAISE EXCEPTION 'sales 016 needs PostgreSQL 15 or later'; END IF;
END $$;
CREATE TABLE IF NOT EXISTS sales_mailboxes(
 workspace_id uuid NOT NULL REFERENCES sales_workspaces(id), id uuid NOT NULL,
 label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 60),
 from_name text CHECK(length(from_name)<=80),
 from_email text NOT NULL CHECK(length(from_email) BETWEEN 3 AND 254),
 smtp_host text NOT NULL CHECK(length(smtp_host) BETWEEN 1 AND 253),
 smtp_port integer NOT NULL DEFAULT 465 CHECK(smtp_port BETWEEN 1 AND 65535),
 smtp_secure boolean NOT NULL DEFAULT true,
 smtp_user text NOT NULL CHECK(length(smtp_user) BETWEEN 1 AND 254),
 -- AES-256-GCM (key MAILBOX_ENC_KEY, outside the database), base64; bound to workspace and mailbox id.
 password_ciphertext text NOT NULL CHECK(length(password_ciphertext) BETWEEN 1 AND 1000),
 password_iv text NOT NULL CHECK(length(password_iv) BETWEEN 1 AND 100),
 password_tag text NOT NULL CHECK(length(password_tag) BETWEEN 1 AND 100),
 daily_limit integer NOT NULL DEFAULT 50 CHECK(daily_limit BETWEEN 1 AND 50),
 warmup_start date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Rome')::date,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','error')),
 last_error text CHECK(length(last_error)<=500),
 auth_failures integer NOT NULL DEFAULT 0 CHECK(auth_failures BETWEEN 0 AND 1000),
 created_by integer REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id));
-- One mailbox per sender address in a workspace.
CREATE UNIQUE INDEX IF NOT EXISTS sales_mailboxes_from ON sales_mailboxes(workspace_id,lower(from_email));

CREATE TABLE IF NOT EXISTS sales_send_queue(
 workspace_id uuid NOT NULL REFERENCES sales_workspaces(id),
 id bigint GENERATED ALWAYS AS IDENTITY,
 campaign text NOT NULL CHECK(length(btrim(campaign)) BETWEEN 1 AND 80),
 contact_id uuid NOT NULL,
 mailbox_id uuid,
 subject text NOT NULL CHECK(length(btrim(subject)) BETWEEN 1 AND 200),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
 unsubscribe_url text NOT NULL CHECK(length(unsubscribe_url) BETWEEN 1 AND 2000),
 -- «sending»: claimed by one worker run; never sent twice (a stale claim becomes «failed», not «queued»).
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','failed','cancelled','skipped')),
 scheduled_at timestamptz NOT NULL CHECK(isfinite(scheduled_at)),
 sent_at timestamptz,
 locked_at timestamptz,
 error text CHECK(length(error)<=500),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 100),
 created_by integer REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id),
 -- Like sales_email_clicks: the rows follow the contact on delete.
 FOREIGN KEY(workspace_id,contact_id) REFERENCES sales_contacts(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,mailbox_id) REFERENCES sales_mailboxes(workspace_id,id) ON DELETE SET NULL (mailbox_id));
-- One email per contact and campaign, whatever happens to it.
CREATE UNIQUE INDEX IF NOT EXISTS sales_send_queue_once ON sales_send_queue(workspace_id,campaign,contact_id);
-- Worker: due rows across workspaces, oldest first.
CREATE INDEX IF NOT EXISTS sales_send_queue_due ON sales_send_queue(scheduled_at) WHERE status='queued';
-- Worker: stale claims.
CREATE INDEX IF NOT EXISTS sales_send_queue_sending ON sales_send_queue(locked_at) WHERE status='sending';
-- Daily capacity of each mailbox (planned and sent).
CREATE INDEX IF NOT EXISTS sales_send_queue_mailbox ON sales_send_queue(workspace_id,mailbox_id,scheduled_at) WHERE status IN ('queued','sending','sent');
-- Per-campaign status in the CRM.
CREATE INDEX IF NOT EXISTS sales_send_queue_campaign ON sales_send_queue(workspace_id,campaign,status);
COMMIT;
