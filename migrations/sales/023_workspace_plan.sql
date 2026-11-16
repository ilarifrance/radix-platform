-- Sales Orbis plans (api/_sales_plan.js): «prova» (the trial, everything), «completo» (the CRM, no Copilota, no Lead
-- Intelligence), «avanzato» (CRM and Copilota), «extreme» (CRM, Copilota and Lead Intelligence).
-- Only the product (RADIX_PRODUCT=sales-orbis or its host) applies them; RADIX ignores the column.
-- Apply after 001-022, first on Neon radix-preview; production only with the owner's OK. Idempotent.
BEGIN;
ALTER TABLE sales_workspaces ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'prova';
ALTER TABLE sales_workspaces DROP CONSTRAINT IF EXISTS sales_workspaces_plan_check;
ALTER TABLE sales_workspaces ADD CONSTRAINT sales_workspaces_plan_check CHECK(plan IN ('prova','completo','avanzato','extreme'));
COMMIT;
