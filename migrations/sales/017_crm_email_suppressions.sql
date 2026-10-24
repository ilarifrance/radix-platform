-- CRM: «Indirizzi disiscritti», the permanent list of addresses that never get a campaign email again. Until 016 an opt-out
-- lived only on the contact (a «Disiscrizione…» note and a timeline note, api/_sales_optout.js): deleting the contact or
-- importing it again lost it. One row per address and workspace, by hash only: email_hash is the SHA-256 (hex) of the
-- address trimmed and lower-cased (api/_sales_optout.js emailHash; in SQL encode(sha256(convert_to(lower(btrim(email)),'UTF8')),'hex')).
-- The clear address is never stored here. Written by the unsubscribe link («unsubscribe»), by owners/admins in
-- Impostazioni › Caselle email › Indirizzi disiscritti («manual», «bounce», «complaint»), and by the triggers below when a
-- contact gets an opt-out note by hand. Read by every send path (OPTED_OUT in api/_sales_optout.js: queue plan and worker,
-- campaign and newsletter unsubscribe links, «Trova email»; /api/send-email). Existing opt-outs are copied in once (below).
-- Apply after 001-016, first on Neon radix-preview; production only with the owner's OK. Idempotent: IF NOT EXISTS,
-- CREATE OR REPLACE, ON CONFLICT DO NOTHING. sales_command is unchanged (no full replacement of 015): suppressions are not a
-- sales_command entity, they have their own allowlisted actions in api/_sales_suppressions.js (owner/admin only).
-- Needs PostgreSQL 15+ (as 016; CREATE OR REPLACE TRIGGER needs 14+, sha256() 11+).
BEGIN;
DO $$ BEGIN
 IF current_setting('server_version_num')::integer<150000 THEN RAISE EXCEPTION 'sales 017 needs PostgreSQL 15 or later'; END IF;
END $$;
CREATE TABLE IF NOT EXISTS sales_email_suppressions(
 workspace_id uuid NOT NULL REFERENCES sales_workspaces(id),
 -- SHA-256 hex of lower(btrim(email)): 64 lowercase hex characters, never the address itself.
 email_hash text NOT NULL CHECK(email_hash ~ '^[0-9a-f]{64}$'),
 reason text NOT NULL CHECK(reason IN ('unsubscribe','bounce','complaint','manual')),
 source text CHECK(length(source)<=80),
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by integer REFERENCES users(id) ON DELETE SET NULL,
 PRIMARY KEY(workspace_id,email_hash));
-- Export and count of the panel, newest first.
CREATE INDEX IF NOT EXISTS sales_email_suppressions_recent ON sales_email_suppressions(workspace_id,created_at DESC);

-- An opt-out written by hand (a contact note with «Disiscrizione…», a timeline note titled «Disiscrizione…») becomes
-- permanent too, like the unsubscribe link. Same rule as OPTED_OUT; the row stays when the note or the contact goes.
CREATE OR REPLACE FUNCTION sales_email_suppress_optout() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e text;
BEGIN
 IF TG_TABLE_NAME='sales_contacts' THEN
  IF coalesce(NEW.notes,'') ILIKE '%disiscrizione%' THEN e:=NEW.email; END IF;
 ELSIF NEW.contact_id IS NOT NULL AND coalesce(NEW.title,'') ILIKE 'Disiscrizione%' THEN
  SELECT c.email INTO e FROM sales_contacts c WHERE c.workspace_id=NEW.workspace_id AND c.id=NEW.contact_id;
 END IF;
 IF nullif(btrim(e),'') IS NOT NULL THEN
  INSERT INTO sales_email_suppressions(workspace_id,email_hash,reason,source)
  VALUES(NEW.workspace_id,encode(sha256(convert_to(lower(btrim(e)),'UTF8')),'hex'),'unsubscribe','nota sul contatto')
  ON CONFLICT (workspace_id,email_hash) DO NOTHING;
 END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER sales_contacts_optout_suppress AFTER INSERT OR UPDATE OF notes,email ON sales_contacts
 FOR EACH ROW EXECUTE FUNCTION sales_email_suppress_optout();
CREATE OR REPLACE TRIGGER sales_interactions_optout_suppress AFTER INSERT OR UPDATE OF title ON sales_interactions
 FOR EACH ROW EXECUTE FUNCTION sales_email_suppress_optout();

-- Opt-outs recorded before this migration (same rule as OPTED_OUT), once.
INSERT INTO sales_email_suppressions(workspace_id,email_hash,reason,source)
SELECT t.workspace_id,encode(sha256(convert_to(lower(btrim(t.email)),'UTF8')),'hex'),'unsubscribe','migrazione 017'
 FROM sales_contacts t
 WHERE nullif(btrim(t.email),'') IS NOT NULL
  AND (coalesce(t.notes,'') ILIKE '%disiscrizione%'
   OR EXISTS(SELECT 1 FROM sales_interactions i WHERE i.workspace_id=t.workspace_id AND i.contact_id=t.id AND i.title ILIKE 'Disiscrizione%'))
ON CONFLICT (workspace_id,email_hash) DO NOTHING;
COMMIT;
