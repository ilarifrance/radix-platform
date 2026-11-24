-- RADIX Accounting 005: connections to outside sources of documents, starting with Fatture in Cloud (API v2).
-- The access token is stored encrypted (AES-256-GCM with MAILBOX_ENC_KEY, bound to the company id) and never returned
-- to the page. acc_connection_items remembers which outside documents were already read, so a sync downloads only new
-- ones; the import itself still deduplicates files by their hash (acc_documents).
-- Apply on radix-preview; production needs a separate OK.

CREATE TABLE acc_connections (
 company_id uuid NOT NULL REFERENCES acc_companies(id) ON DELETE CASCADE,
 provider text NOT NULL CHECK(provider IN ('fattureincloud')),
 secret text NOT NULL CHECK(length(secret) BETWEEN 20 AND 8000),
 external_id text NOT NULL CHECK(length(external_id) BETWEEN 1 AND 40),
 external_name text CHECK(length(external_name)<=200),
 sync_from date NOT NULL,
 last_sync_at timestamptz,
 last_result jsonb,
 created_by integer,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,provider));

CREATE TABLE acc_connection_items (
 company_id uuid NOT NULL REFERENCES acc_companies(id) ON DELETE CASCADE,
 provider text NOT NULL,
 item_key text NOT NULL CHECK(length(item_key) BETWEEN 3 AND 60),
 outcome text NOT NULL CHECK(outcome IN ('imported','duplicate','no_xml','error')),
 at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,provider,item_key));
