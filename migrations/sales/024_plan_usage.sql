-- Monthly use of the Sales Orbis plan limits (api/_sales_plan.js): per workspace, user and calendar month (Europe/Rome).
-- metric: «ai» requests to the Copilota, «lead» contacts sent to a paid email provider, «send» emails queued.
-- Apply after 001-023, first on Neon radix-preview; production only with the owner's OK. Idempotent.
BEGIN;
CREATE TABLE IF NOT EXISTS sales_plan_usage (
  workspace_id uuid NOT NULL REFERENCES sales_workspaces(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month date NOT NULL,
  metric text NOT NULL CHECK(metric IN ('ai','lead','send')),
  used integer NOT NULL DEFAULT 0 CHECK(used >= 0),
  PRIMARY KEY(workspace_id, user_id, month, metric)
);
COMMIT;
