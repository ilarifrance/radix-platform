-- Impostazioni › CRM › Valuta: the currency of a workspace (ISO 4217 code), euro by default. Amounts stay as stored
-- (amount_cents): the code only says which currency they are in and how pages show them (lib/radix-i18n.js).
-- Apply after 001-020, first on Neon radix-preview; production only with the owner's OK. Idempotent.
BEGIN;
ALTER TABLE sales_workspaces ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR';
ALTER TABLE sales_workspaces DROP CONSTRAINT IF EXISTS sales_workspaces_currency_check;
ALTER TABLE sales_workspaces ADD CONSTRAINT sales_workspaces_currency_check CHECK(currency ~ '^[A-Z]{3}$');
COMMIT;
