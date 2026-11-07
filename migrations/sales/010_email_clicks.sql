-- Clicks on links in CRM campaign emails (api/_sales_clicks.js). Written only by the signed public
-- redirect; read by workspace members as a per-campaign report. Rows follow the contact on delete.
BEGIN;
CREATE TABLE IF NOT EXISTS sales_email_clicks (
 workspace_id uuid NOT NULL REFERENCES sales_workspaces(id),
 id bigint GENERATED ALWAYS AS IDENTITY,
 contact_id uuid NOT NULL,
 campaign text NOT NULL CHECK(length(btrim(campaign)) BETWEEN 1 AND 80),
 url text NOT NULL CHECK(length(url) BETWEEN 1 AND 2000),
 clicked_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id),
 FOREIGN KEY(workspace_id,contact_id) REFERENCES sales_contacts(workspace_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS sales_email_clicks_contact ON sales_email_clicks(workspace_id,contact_id,campaign);
CREATE INDEX IF NOT EXISTS sales_email_clicks_recent ON sales_email_clicks(workspace_id,clicked_at DESC);
COMMIT;
