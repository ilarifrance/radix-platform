-- RADIX Trasporti foundation: transport companies, members, vehicles, drivers, customers, trips, documents,
-- positions, costs and toll transits. Amounts in integer cents. Every table is scoped by company_id.
-- Applied on Neon radix-preview on 19/11/2026 with Francesco's OK ("ok per le tabelle");
-- production needs a separate OK. Requires public.users(id integer).
-- Positions: kept only while a trip is open (the app never sends them otherwise) and deleted after 90 days by
-- tr_purge_positions(), to respect art. 4 Statuto dei lavoratori and the Garante's limits on location data.
BEGIN;
CREATE TABLE tr_companies (
 id uuid PRIMARY KEY,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 vat text CHECK(vat ~ '^[A-Z]{2}[0-9A-Z]{2,28}$'),
 -- the company states it has the union agreement or the Ispettorato authorization covering location data
 location_basis text CHECK(location_basis IN('accordo_sindacale','autorizzazione_inl','reg_ce_1_2005')),
 location_basis_note text CHECK(length(location_basis_note)<=500),
 created_at timestamptz NOT NULL DEFAULT now(), created_by integer REFERENCES users(id), version integer NOT NULL DEFAULT 1);
CREATE TABLE tr_members (
 company_id uuid NOT NULL REFERENCES tr_companies(id) ON DELETE CASCADE, user_id integer NOT NULL REFERENCES users(id),
 role text NOT NULL CHECK(role IN('owner','admin','office','driver','viewer')), PRIMARY KEY(company_id,user_id));
CREATE INDEX tr_members_user ON tr_members(user_id);
CREATE TABLE tr_vehicles (
 company_id uuid NOT NULL REFERENCES tr_companies(id) ON DELETE CASCADE, id uuid NOT NULL,
 plate text NOT NULL CHECK(plate ~ '^[A-Z0-9]{4,10}$'), label text CHECK(length(label)<=80),
 kind text NOT NULL DEFAULT 'trattore' CHECK(kind IN('trattore','motrice','rimorchio','semirimorchio','furgone','bestiame','altro')),
 toll_devices text[] NOT NULL DEFAULT '{}', tracker text CHECK(length(tracker)<=80), active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(company_id,id), UNIQUE(company_id,plate));
CREATE TABLE tr_drivers (
 company_id uuid NOT NULL REFERENCES tr_companies(id) ON DELETE CASCADE, id uuid NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120), user_id integer REFERENCES users(id),
 default_vehicle uuid, active boolean NOT NULL DEFAULT true, PRIMARY KEY(company_id,id));
CREATE TABLE tr_customers (
 company_id uuid NOT NULL REFERENCES tr_companies(id) ON DELETE CASCADE, id uuid NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200), vat text CHECK(length(vat)<=30),
 rate_kind text CHECK(rate_kind IN('viaggio','km','ton','ora')), rate_cents bigint CHECK(rate_cents BETWEEN 0 AND 100000000),
 fuel_clause boolean NOT NULL DEFAULT false, PRIMARY KEY(company_id,id));
CREATE TABLE tr_trips (
 company_id uuid NOT NULL REFERENCES tr_companies(id) ON DELETE CASCADE, id uuid NOT NULL,
 vehicle_id uuid NOT NULL, driver_id uuid NOT NULL, customer_id uuid,
 status text NOT NULL DEFAULT 'aperto' CHECK(status IN('aperto','chiuso','fatturato')),
 started_at timestamptz NOT NULL, ended_at timestamptz CHECK(ended_at IS NULL OR ended_at>=started_at),
 origin text CHECK(length(origin)<=200), destination text CHECK(length(destination)<=200),
 km integer CHECK(km BETWEEN 0 AND 20000), revenue_cents bigint CHECK(revenue_cents BETWEEN 0 AND 100000000),
 notes text CHECK(length(notes)<=1000), created_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1,
 PRIMARY KEY(company_id,id),
 FOREIGN KEY(company_id,vehicle_id) REFERENCES tr_vehicles(company_id,id),
 FOREIGN KEY(company_id,driver_id) REFERENCES tr_drivers(company_id,id),
 FOREIGN KEY(company_id,customer_id) REFERENCES tr_customers(company_id,id));
CREATE INDEX tr_trips_vehicle ON tr_trips(company_id,vehicle_id,started_at);
CREATE TABLE tr_documents (
 company_id uuid NOT NULL REFERENCES tr_companies(id) ON DELETE CASCADE, id uuid NOT NULL, trip_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('ddt','cmr','giornale','contratto','pesata','certificato','carburante','consegna','altro')),
 file_url text CHECK(length(file_url)<=600), fields jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(fields)='object' AND length(fields::text)<=20000),
 read_fields jsonb CHECK(read_fields IS NULL OR length(read_fields::text)<=20000), -- what the AI read, kept to measure corrections
 confirmed_by integer REFERENCES users(id), confirmed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,id), FOREIGN KEY(company_id,trip_id) REFERENCES tr_trips(company_id,id) ON DELETE CASCADE);
CREATE TABLE tr_positions (
 company_id uuid NOT NULL REFERENCES tr_companies(id) ON DELETE CASCADE, vehicle_id uuid NOT NULL, at timestamptz NOT NULL,
 lat double precision NOT NULL CHECK(lat BETWEEN -90 AND 90), lon double precision NOT NULL CHECK(lon BETWEEN -180 AND 180),
 source text NOT NULL CHECK(source IN('telefono','webfleet','verizon','targa','rfms','file','localizzatore')), trip_id uuid,
 speed_kmh real, odometer_km numeric(10,1),
 PRIMARY KEY(company_id,vehicle_id,at,source));
CREATE TABLE tr_costs (
 company_id uuid NOT NULL REFERENCES tr_companies(id) ON DELETE CASCADE, id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('carburante','pedaggio','stipendio','manutenzione','leasing','assicurazione','altro')),
 date date NOT NULL, amount_cents bigint NOT NULL CHECK(amount_cents BETWEEN -100000000 AND 100000000),
 vehicle_id uuid, driver_id uuid, trip_id uuid, liters numeric(8,2), km integer,
 description text CHECK(length(description)<=300), source jsonb NOT NULL DEFAULT '{}' CHECK(length(source::text)<=4000),
 created_at timestamptz NOT NULL DEFAULT now(), created_by integer REFERENCES users(id), PRIMARY KEY(company_id,id));
CREATE INDEX tr_costs_date ON tr_costs(company_id,date);
CREATE TABLE tr_toll_transits (
 company_id uuid NOT NULL REFERENCES tr_companies(id) ON DELETE CASCADE, id uuid NOT NULL, import_id uuid NOT NULL,
 entry_at timestamp, exit_at timestamp, entry text, exit text, plate text, device text, amount_cents bigint NOT NULL,
 vehicle_id uuid, trip_id uuid, status text NOT NULL CHECK(status IN('abbinato','fuori_viaggio','mezzo_sconosciuto','da_controllare','confermato')),
 PRIMARY KEY(company_id,id), UNIQUE(company_id,device,plate,exit_at,amount_cents));
CREATE TABLE tr_audit (
 company_id uuid NOT NULL REFERENCES tr_companies(id) ON DELETE CASCADE, at timestamptz NOT NULL DEFAULT now(),
 actor_id integer REFERENCES users(id), action text NOT NULL, entity_id uuid, detail jsonb NOT NULL DEFAULT '{}');
CREATE FUNCTION tr_purge_positions() RETURNS integer LANGUAGE sql AS
 $$ WITH d AS (DELETE FROM tr_positions WHERE at < now() - interval '90 days' RETURNING 1) SELECT count(*)::integer FROM d $$;
COMMIT;
