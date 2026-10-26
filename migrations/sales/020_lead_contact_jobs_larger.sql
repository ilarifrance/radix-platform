-- Lead Intelligence: a LinkedIn import of 1000 contacts is about 2.8 MB (records + batch signatures), above the old 1.5 MB
-- cap of one contact job. The cap goes to 3.8 MB (the Vercel request body limit is 4.5 MB). Only the CHECK changes.
-- Apply after 001-019, first on Neon radix-preview; production only with the owner's OK. Idempotent.
BEGIN;
ALTER TABLE sales_lead_contact_jobs DROP CONSTRAINT IF EXISTS sales_lead_contact_jobs_payload_check;
ALTER TABLE sales_lead_contact_jobs ADD CONSTRAINT sales_lead_contact_jobs_payload_check CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=3800000);
COMMIT;
