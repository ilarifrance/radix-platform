-- Plancia (Trasporti) 002: what the real documents showed (CMR groupage Sassuolo→France, live-cattle bundles).
-- * A trip carries several shipments: one CMR or DDT each, often to different consignees, with several lines
--   (groupage: pallets and weight per original sender/DDT) and a delivery receipt (box 24 of the CMR).
-- * The office uploads whole scanned PDFs ("pratiche": contract, CMR, carnet de route, weighing ticket, copies of the
--   same CMR): one upload, many documents, each with its pages.
-- Applied on Neon radix-preview on 19/11/2026 with Francesco's OK. Production needs a separate OK. After 001.
BEGIN;
CREATE TABLE tr_uploads (
 company_id uuid NOT NULL REFERENCES tr_companies(id) ON DELETE CASCADE, id uuid NOT NULL, trip_id uuid,
 file_name text CHECK(length(file_name)<=200), file_url text CHECK(length(file_url)<=600), pages integer CHECK(pages BETWEEN 1 AND 200),
 status text NOT NULL DEFAULT 'in_lettura' CHECK(status IN('in_lettura','letto','confermato','errore')),
 result jsonb CHECK(result IS NULL OR length(result::text)<=200000), -- documents found: kind, pages, number, copy_of
 created_by integer REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,id), FOREIGN KEY(company_id,trip_id) REFERENCES tr_trips(company_id,id) ON DELETE SET NULL (trip_id));
ALTER TABLE tr_documents ADD COLUMN upload_id uuid, ADD COLUMN pages integer[], ADD COLUMN number text CHECK(length(number)<=80);
CREATE INDEX tr_documents_number ON tr_documents(company_id,kind,number);
CREATE TABLE tr_shipments (
 company_id uuid NOT NULL REFERENCES tr_companies(id) ON DELETE CASCADE, id uuid NOT NULL, trip_id uuid NOT NULL,
 document_id uuid, customer_id uuid, kind text NOT NULL CHECK(kind IN('cmr','ddt','altro')), number text CHECK(length(number)<=80),
 sender text CHECK(length(sender)<=300), consignee text CHECK(length(consignee)<=300),
 load_place text CHECK(length(load_place)<=300), load_date date, delivery_place text CHECK(length(delivery_place)<=300),
 delivered_at date, received_by text CHECK(length(received_by)<=200), reserves text CHECK(length(reserves)<=1000),
 pallets integer CHECK(pallets BETWEEN 0 AND 1000), packages integer CHECK(packages BETWEEN 0 AND 100000),
 animals integer CHECK(animals BETWEEN 0 AND 10000), weight_kg numeric(10,2) CHECK(weight_kg BETWEEN 0 AND 100000),
 lines jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(lines)='array' AND length(lines::text)<=50000),
 revenue_cents bigint CHECK(revenue_cents BETWEEN 0 AND 100000000),
 status text NOT NULL DEFAULT 'in_viaggio' CHECK(status IN('in_viaggio','consegnata','fatturata')),
 created_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1,
 PRIMARY KEY(company_id,id), FOREIGN KEY(company_id,trip_id) REFERENCES tr_trips(company_id,id) ON DELETE CASCADE,
 FOREIGN KEY(company_id,customer_id) REFERENCES tr_customers(company_id,id));
CREATE INDEX tr_shipments_trip ON tr_shipments(company_id,trip_id);
-- the driver's phone is a tracker like the others (and the default when the vehicle has none)
ALTER TABLE tr_vehicles ALTER COLUMN tracker SET DEFAULT 'telefono', ADD COLUMN tracker_ref text CHECK(length(tracker_ref)<=80), ADD COLUMN vin text CHECK(vin ~ '^[A-HJ-NPR-Z0-9]{11,17}$');
COMMIT;
