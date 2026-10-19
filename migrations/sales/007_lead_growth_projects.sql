-- RADIX SALES / GROWTH PROJECTS. MANUAL REVIEW ONLY.
-- Apply exclusively on isolated LEAD_DATABASE_URL Preview Neon branch.
-- DO NOT run on shared DATABASE_URL or Production.
BEGIN;
CREATE TABLE sales_lead_growth_projects (
 workspace_id uuid NOT NULL REFERENCES sales_workspaces(id),
 id uuid NOT NULL,
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 120),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=120000),
 version integer NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 2147483646),
 updated_by integer NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id)
);
CREATE INDEX sales_lead_growth_projects_recent ON sales_lead_growth_projects(workspace_id,updated_at DESC,id);
COMMIT;
