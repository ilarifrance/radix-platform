-- Plancia (Trasporti) 005 — costs loaded automatically: supplier e-invoices and payslips, period of competence.
-- * tr_costs: period_from/period_to (an insurance premium counts on the months it covers, a payslip on its month),
--   doc_key to recognise a document loaded twice (supplier VAT + number, employee + month).
-- * tr_drivers.tax_code to match payslips; tr_payslips keeps the figures of each payslip (gross, net, company cost).
-- * tr_supplier_rules: what the office chose for a supplier (cost item, vehicle) is proposed for its next invoices.
-- * tr_cost_documents: the loaded files (invoice XML/PDF, LUL PDF) with their status, for the audit trail.
ALTER TABLE tr_costs ADD COLUMN IF NOT EXISTS period_from date, ADD COLUMN IF NOT EXISTS period_to date,
 ADD COLUMN IF NOT EXISTS doc_key text CHECK(length(doc_key)<=200), ADD COLUMN IF NOT EXISTS document_id uuid;
ALTER TABLE tr_costs DROP CONSTRAINT IF EXISTS tr_costs_period_check;
ALTER TABLE tr_costs ADD CONSTRAINT tr_costs_period_check CHECK(period_from IS NULL OR period_to IS NULL OR period_to>=period_from);
CREATE INDEX IF NOT EXISTS tr_costs_doc ON tr_costs(company_id,doc_key) WHERE doc_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS tr_costs_period ON tr_costs(company_id,period_from,period_to) WHERE period_from IS NOT NULL;
ALTER TABLE tr_drivers ADD COLUMN IF NOT EXISTS tax_code text CHECK(tax_code ~ '^[A-Z0-9]{11,16}$');
CREATE TABLE IF NOT EXISTS tr_cost_documents (
 company_id uuid NOT NULL REFERENCES tr_companies(id) ON DELETE CASCADE, id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('fattura_xml','fattura_pdf','busta_paga')), file_name text CHECK(length(file_name)<=200),
 doc_key text CHECK(length(doc_key)<=200), supplier text, supplier_vat text, number text, date date,
 taxable_cents bigint, total_cents bigint, status text NOT NULL DEFAULT 'confermato' CHECK(status IN('da_controllare','confermato','scartato')),
 reading jsonb NOT NULL DEFAULT '{}' CHECK(length(reading::text)<=200000),
 created_at timestamptz NOT NULL DEFAULT now(), created_by integer REFERENCES users(id), PRIMARY KEY(company_id,id));
CREATE UNIQUE INDEX IF NOT EXISTS tr_cost_documents_key ON tr_cost_documents(company_id,doc_key) WHERE doc_key IS NOT NULL AND status<>'scartato';
CREATE TABLE IF NOT EXISTS tr_payslips (
 company_id uuid NOT NULL REFERENCES tr_companies(id) ON DELETE CASCADE, id uuid NOT NULL, document_id uuid,
 driver_id uuid, employee text NOT NULL, tax_code text, month text NOT NULL CHECK(month ~ '^\d{4}-\d{2}$'),
 gross_cents bigint, net_cents bigint, employer_contrib_cents bigint, tfr_cents bigint, overtime_cents bigint, allowances_cents bigint,
 company_cost_cents bigint NOT NULL, hours numeric(6,2), overtime_hours numeric(6,2),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(company_id,id), UNIQUE(company_id,employee,month));
CREATE TABLE IF NOT EXISTS tr_supplier_rules (
 company_id uuid NOT NULL REFERENCES tr_companies(id) ON DELETE CASCADE, supplier_vat text NOT NULL, supplier text,
 kind text NOT NULL, vehicle_id uuid, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(company_id,supplier_vat));
