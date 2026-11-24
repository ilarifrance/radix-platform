-- Plancia (Trasporti) 004: listini, anagrafica from documents, electronic invoices, full cost items (Francesco 22/11/2026).
-- * tr_rate_cards: price lists per customer (or the company default): fixed, per km, zones, bands, per tonne,
--   per package/pallet, per head, per hour; minimum and supplements (fuel clause, ADR, waiting, drops, tail lift…).
-- * tr_customers: what the invoice needs (address, SdI code or PEC, VAT country, tax code) and the card in use.
-- * tr_consignees: consignees and places found on DDT/CMR (proposed from the documents, confirmed by the office).
-- * tr_invoices: FatturaPA built by Plancia (the XML is uploaded to the invoicing program / SdI by the company).
-- * tr_costs: the cost items of a haulage company (AdBlue, tyres, depreciation, subcontractors, driver allowances…).
-- Applied on Neon radix-preview on 22/11/2026 (tables approved by Francesco). Production needs a separate OK. After 003.
BEGIN;
CREATE TABLE tr_rate_cards (
 company_id uuid NOT NULL REFERENCES tr_companies(id) ON DELETE CASCADE, id uuid NOT NULL,
 customer_id uuid, name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
 method text NOT NULL CHECK(method IN('fisso','km','zone','fasce','tonnellata','collo','capo','ora')),
 rule jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(rule)='object' AND length(rule::text)<=50000), -- amounts, zones, bands, supplements
 valid_from date, valid_to date, active boolean NOT NULL DEFAULT true, CHECK(valid_to IS NULL OR valid_from IS NULL OR valid_to>=valid_from),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(company_id,id),
 FOREIGN KEY(company_id,customer_id) REFERENCES tr_customers(company_id,id) ON DELETE CASCADE);
CREATE INDEX tr_rate_cards_customer ON tr_rate_cards(company_id,customer_id);
ALTER TABLE tr_customers ADD COLUMN vat_country text CHECK(vat_country ~ '^[A-Z]{2}$'), ADD COLUMN tax_code text CHECK(length(tax_code)<=20),
 ADD COLUMN street text CHECK(length(street)<=120), ADD COLUMN cap text CHECK(length(cap)<=10), ADD COLUMN city text CHECK(length(city)<=80),
 ADD COLUMN province text CHECK(province ~ '^[A-Z]{2}$'), ADD COLUMN country text NOT NULL DEFAULT 'IT' CHECK(country ~ '^[A-Z]{2}$'),
 ADD COLUMN sdi_code text CHECK(sdi_code ~ '^[A-Z0-9]{6,7}$'), ADD COLUMN pec text CHECK(length(pec)<=120),
 ADD COLUMN payment_days integer CHECK(payment_days BETWEEN 0 AND 365), ADD COLUMN source text CHECK(source IN('manuale','documento'));
ALTER TABLE tr_companies ADD COLUMN tax_code text CHECK(length(tax_code)<=20), ADD COLUMN street text CHECK(length(street)<=120),
 ADD COLUMN cap text CHECK(length(cap)<=10), ADD COLUMN city text CHECK(length(city)<=80), ADD COLUMN province text CHECK(province ~ '^[A-Z]{2}$'),
 ADD COLUMN tax_regime text NOT NULL DEFAULT 'RF01' CHECK(tax_regime ~ '^RF[0-9]{2}$'), ADD COLUMN iban text CHECK(length(iban)<=34),
 ADD COLUMN ref_cost_km_cents integer CHECK(ref_cost_km_cents BETWEEN 0 AND 100000);
CREATE TABLE tr_consignees (
 company_id uuid NOT NULL REFERENCES tr_companies(id) ON DELETE CASCADE, id uuid NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200), kind text NOT NULL DEFAULT 'destinatario' CHECK(kind IN('destinatario','carico','scarico')),
 street text CHECK(length(street)<=120), cap text CHECK(length(cap)<=10), city text CHECK(length(city)<=80), province text, country text CHECK(country ~ '^[A-Z]{2}$'),
 lat double precision, lon double precision, source text CHECK(source IN('manuale','documento')), PRIMARY KEY(company_id,id));
CREATE TABLE tr_invoices (
 company_id uuid NOT NULL REFERENCES tr_companies(id) ON DELETE CASCADE, id uuid NOT NULL, customer_id uuid NOT NULL,
 number text NOT NULL CHECK(length(number) BETWEEN 1 AND 20), date date NOT NULL,
 taxable_cents bigint NOT NULL, vat_cents bigint NOT NULL, total_cents bigint NOT NULL,
 xml text CHECK(length(xml)<=2000000), status text NOT NULL DEFAULT 'bozza' CHECK(status IN('bozza','emessa','inviata','scartata','pagata')),
 trip_ids uuid[] NOT NULL DEFAULT '{}', shipment_ids uuid[] NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(), created_by integer REFERENCES users(id), PRIMARY KEY(company_id,id), UNIQUE(company_id,number,date),
 FOREIGN KEY(company_id,customer_id) REFERENCES tr_customers(company_id,id));
ALTER TABLE tr_trips ADD COLUMN rate_card_id uuid, ADD COLUMN price_detail jsonb CHECK(price_detail IS NULL OR length(price_detail::text)<=20000), ADD COLUMN invoice_id uuid;
ALTER TABLE tr_costs DROP CONSTRAINT tr_costs_kind_check;
ALTER TABLE tr_costs ADD CONSTRAINT tr_costs_kind_check CHECK(kind IN('carburante','adblue','pedaggio','subvettore','trasferte','stipendio','straordinari','autista_esterno',
 'manutenzione','pneumatici','leasing','noleggio','ammortamento','assicurazione','bollo','multe','generali','altro'));
COMMIT;
