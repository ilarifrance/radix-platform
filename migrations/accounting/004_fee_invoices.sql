-- RADIX Accounting 004: the electronic invoice of the monthly fee. Each paid Stripe invoice becomes one numbered
-- record with a snapshot of the buyer's data, so the invoice keeps the data it was issued with. The XML (FatturaPA)
-- is built from this record and the seller data (ACCOUNTING_SELLER) when it is downloaded or sent.
-- Apply on radix-preview; production needs a separate OK.

ALTER TABLE acc_companies
 ADD COLUMN address text CHECK(length(address)<=200),
 ADD COLUMN zip text CHECK(zip ~ '^\d{5}$'),
 ADD COLUMN city text CHECK(length(city)<=80),
 ADD COLUMN province text CHECK(province ~ '^[A-Z]{2}$'),
 ADD COLUMN sdi_code text CHECK(sdi_code ~ '^[A-Z0-9]{7}$'),
 ADD COLUMN pec text CHECK(length(pec)<=254);

CREATE TABLE acc_fee_invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES acc_companies(id),   -- no cascade: issued invoices are kept for 10 years
 year integer NOT NULL CHECK(year BETWEEN 2000 AND 2100),
 number integer NOT NULL CHECK(number>0),
 issued_on date NOT NULL,
 description text NOT NULL CHECK(length(description) BETWEEN 1 AND 1000),
 net_cents integer NOT NULL CHECK(net_cents>0),
 vat_cents integer NOT NULL CHECK(vat_cents>=0),
 gross_cents integer NOT NULL CHECK(gross_cents=net_cents+vat_cents),
 stripe_invoice text NOT NULL UNIQUE,
 buyer jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(year,number));
CREATE INDEX acc_fee_invoices_company ON acc_fee_invoices(company_id,issued_on);
