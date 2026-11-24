-- Plancia: the photos of the documents taken by the drivers (DDT, CMR, receipts) and the files loaded by the office,
-- kept with the company and read only through the API (office, or the driver who took the photo).
-- A document record (tr_records, coll documents) points to its file with data.file_id.
CREATE TABLE tr_files (
 company_id uuid NOT NULL REFERENCES tr_companies(id) ON DELETE CASCADE, id text NOT NULL CHECK(id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
 media_type text NOT NULL CHECK(media_type IN('image/jpeg','image/png','image/webp','application/pdf')),
 bytes bytea NOT NULL CHECK(octet_length(bytes) BETWEEN 1 AND 3500000), trip_id text,
 created_at timestamptz NOT NULL DEFAULT now(), created_by integer REFERENCES users(id), created_by_driver text,
 PRIMARY KEY(company_id,id));
