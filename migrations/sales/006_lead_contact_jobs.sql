-- MANUAL PREVIEW ONLY: isolated LEAD_DATABASE_URL, never DATABASE_URL or production.
BEGIN;
CREATE TABLE sales_lead_contact_jobs(
 workspace_id uuid NOT NULL REFERENCES sales_workspaces(id),
 id uuid NOT NULL,
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=1500000),
 version integer NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 2147483646),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by integer NOT NULL REFERENCES users(id),
 PRIMARY KEY(workspace_id,id)
);
CREATE INDEX sales_lead_contact_jobs_recent ON sales_lead_contact_jobs(workspace_id,updated_at DESC,id);
COMMIT;
