-- CRM: «Calendari esterni». Each person can save the secret iCal links of their own calendars (Outlook / Microsoft 365
-- «Pubblica calendario» › link ICS, Google «Indirizzo segreto in formato iCal»), so the CRM shows their busy time in the
-- Calendario and suggests free slots in «Registra chiamata». One row per link; at most 5 per person and workspace (in code).
-- The link is a secret: it is stored only encrypted with AES-256-GCM (api/_calendar_sources_crypto.js, key MAILBOX_ENC_KEY
-- outside the database), bound to workspace, row id and user (additional authenticated data), and never returned to any
-- browser: the API shows only the host (url_host) and «salvato». Rows are private to their user_id: every read and write in
-- api/_sales_calendars.js filters on the caller, owners and admins included. The server fetches the link (https, allow-listed
-- hosts, no private addresses, size and time limits) and records only status, a short error and the time of the last fetch.
-- Apply after 001-017, first on Neon radix-preview; production only with the owner's OK. Idempotent: IF NOT EXISTS.
-- Not a sales_command entity: its own allowlisted actions in api/_sales_calendars.js. Needs PostgreSQL 15+ (as 016/017).
BEGIN;
DO $$ BEGIN
 IF current_setting('server_version_num')::integer<150000 THEN RAISE EXCEPTION 'sales 018 needs PostgreSQL 15 or later'; END IF;
END $$;
CREATE TABLE IF NOT EXISTS sales_calendar_sources(
 workspace_id uuid NOT NULL REFERENCES sales_workspaces(id),
 id uuid NOT NULL,
 -- The person whose calendar this is; the row goes with the account.
 user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 60),
 -- Hint for the UI and the checks of the link: outlook (office365.com, office.com, live.com) or google.
 provider text NOT NULL CHECK(provider IN ('outlook','google')),
 url_host text NOT NULL CHECK(length(url_host) BETWEEN 1 AND 253),
 -- AES-256-GCM of the full https link, base64; bound to workspace, id and user.
 url_ciphertext text NOT NULL CHECK(length(url_ciphertext) BETWEEN 1 AND 4000),
 url_iv text NOT NULL CHECK(length(url_iv) BETWEEN 1 AND 100),
 url_tag text NOT NULL CHECK(length(url_tag) BETWEEN 1 AND 100),
 -- false: the CRM shows «Occupato» only; true: also the titles of the events (only to this user).
 show_details boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ok','error')),
 last_error text CHECK(length(last_error)<=300),
 last_fetched_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id));
-- Every read is «the caller's links in this workspace».
CREATE INDEX IF NOT EXISTS sales_calendar_sources_user ON sales_calendar_sources(workspace_id,user_id,created_at);
COMMIT;
