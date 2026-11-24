-- Plancia: the data of a company shared between the office program and the drivers' phones.
-- tr_records keeps every record of the data set as the programs use it (trips, documents, costs, registers…),
-- numbered by tr_rev so that a device asks only for what changed. Drivers enter with a one-use code given by the
-- office (tr_driver_invites) and their phone keeps a token (tr_driver_devices). Codes and tokens only as SHA-256.
-- tr_positions.vehicle_id / driver_id keep pointing to the ids used in tr_records (uuid).
-- Applied on Neon radix-preview (branch br-tiny-wildflower-b1z4ib9y) on 24/11/2026; production needs a separate OK.
BEGIN;
CREATE SEQUENCE tr_rev;
CREATE TABLE tr_records (
 company_id uuid NOT NULL REFERENCES tr_companies(id) ON DELETE CASCADE,
 coll text NOT NULL CHECK(coll ~ '^[a-z_]{1,30}$'), id text NOT NULL CHECK(id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
 data jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(data)='object' AND length(data::text)<=2000000),
 deleted boolean NOT NULL DEFAULT false, rev bigint NOT NULL DEFAULT nextval('tr_rev'),
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by integer REFERENCES users(id), updated_by_driver text,
 PRIMARY KEY(company_id,coll,id));
CREATE INDEX tr_records_rev ON tr_records(company_id,rev);
CREATE TABLE tr_driver_invites (
 code_hash text PRIMARY KEY CHECK(code_hash ~ '^[a-f0-9]{64}$'),
 company_id uuid NOT NULL REFERENCES tr_companies(id) ON DELETE CASCADE, driver_id text NOT NULL,
 created_by integer REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL, used_at timestamptz);
CREATE TABLE tr_driver_devices (
 token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 company_id uuid NOT NULL REFERENCES tr_companies(id) ON DELETE CASCADE, driver_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz, revoked_at timestamptz);
CREATE INDEX tr_driver_devices_driver ON tr_driver_devices(company_id,driver_id);
COMMIT;
