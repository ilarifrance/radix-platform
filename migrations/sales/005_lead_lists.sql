-- MANUAL REVIEW ONLY. DO NOT execute on a shared/production database.
-- Requires sales_workspaces, sales_memberships, users (001-004) on an ISOLATED Preview Neon branch.
BEGIN;
CREATE TABLE sales_lead_lists(
 workspace_id uuid NOT NULL REFERENCES sales_workspaces(id),
 id uuid NOT NULL,
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=190000),
 version integer NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 2147483646),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by integer NOT NULL,
 PRIMARY KEY(workspace_id,id),
 FOREIGN KEY(updated_by) REFERENCES users(id)
);
CREATE INDEX sales_lead_lists_recent ON sales_lead_lists(workspace_id,updated_at DESC,id);
-- No account, membership or example prospect seeded. Authorization is enforced in
-- each server query and in the shared RADIX session/membership gate.
COMMIT;
