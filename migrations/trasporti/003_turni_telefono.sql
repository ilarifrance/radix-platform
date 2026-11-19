-- Plancia (Trasporti) 003: the driver's phone is the main tracker (Francesco, 19/11/2026).
-- * The native app (Android and iPhone, Capacitor) records the position in the background all the time, from the
--   driver's sign-in on the phone, not only during a trip. Francesco confirmed the agreements with the drivers are
--   already in place (Statuto dei lavoratori art. 4, GDPR). Positions are kept 90 days like the others (tr_purge).
-- * tr_shifts: one row per sign-in session of the driver on a phone (vehicle in use), optional; tr_positions gains the driver, the shift and the GPS accuracy.
-- Applied on Neon radix-preview on 19/11/2026 (tables approved by Francesco). Production needs a separate OK. After 002.
BEGIN;
CREATE TABLE tr_shifts (
 company_id uuid NOT NULL REFERENCES tr_companies(id) ON DELETE CASCADE, id uuid NOT NULL,
 driver_id uuid NOT NULL, vehicle_id uuid, started_at timestamptz NOT NULL, ended_at timestamptz,
 source text NOT NULL DEFAULT 'app' CHECK(source IN('app','ufficio')),
 CHECK(ended_at IS NULL OR ended_at>=started_at),
 PRIMARY KEY(company_id,id), FOREIGN KEY(company_id,driver_id) REFERENCES tr_drivers(company_id,id));
CREATE INDEX tr_shifts_driver ON tr_shifts(company_id,driver_id,started_at);
CREATE UNIQUE INDEX tr_shifts_one_open ON tr_shifts(company_id,driver_id) WHERE ended_at IS NULL;
ALTER TABLE tr_positions ADD COLUMN driver_id uuid, ADD COLUMN shift_id uuid,
 ADD COLUMN accuracy_m real CHECK(accuracy_m IS NULL OR accuracy_m BETWEEN 0 AND 100000);
CREATE INDEX tr_positions_shift ON tr_positions(company_id,shift_id) WHERE shift_id IS NOT NULL;
COMMIT;
