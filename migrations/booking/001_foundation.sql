-- Ciuffo 001: shops (hair salons and similar), staff, services, closures, customers and appointments.
-- The database refuses two overlapping appointments for the same staff member (exclusion constraint on the time
-- range, buffer included), so two customers booking the same slot at the same second cannot both win.
-- Apply on radix-preview first (Francesco's «procedi con la fase 1», 18/11/2026); production needs a separate OK.
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE bk_shops (
 id uuid PRIMARY KEY,
 slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 phone text, email text, address text, city text,
 kind text NOT NULL DEFAULT 'parrucchiere' CHECK(kind IN('parrucchiere','barbiere','estetista','unghie','altro')),
 timezone text NOT NULL DEFAULT 'Europe/Rome',
 hours jsonb NOT NULL DEFAULT '{}',
 step_min integer NOT NULL DEFAULT 15 CHECK(step_min IN(5,10,15,20,30,60)),
 min_notice_min integer NOT NULL DEFAULT 60 CHECK(min_notice_min BETWEEN 0 AND 10080),
 max_days_ahead integer NOT NULL DEFAULT 60 CHECK(max_days_ahead BETWEEN 1 AND 365),
 cancel_notice_min integer NOT NULL DEFAULT 240 CHECK(cancel_notice_min BETWEEN 0 AND 10080),
 booking_open boolean NOT NULL DEFAULT true,
 welcome text CHECK(length(welcome)<=500),
 created_by integer REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now());

-- Ciuffo accounts are rows of users listed here: they sign in only with the Ciuffo session cookie.
CREATE TABLE bk_members (
 shop_id uuid NOT NULL REFERENCES bk_shops(id) ON DELETE CASCADE,
 user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN('owner','staff')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(shop_id,user_id));
CREATE INDEX bk_members_user ON bk_members(user_id);

CREATE TABLE bk_staff (
 shop_id uuid NOT NULL REFERENCES bk_shops(id) ON DELETE CASCADE,
 id uuid NOT NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
 color text CHECK(color ~ '^#[0-9a-fA-F]{6}$'),
 hours jsonb,                                  -- null: the shop's hours
 active boolean NOT NULL DEFAULT true,
 position integer NOT NULL DEFAULT 0,
 PRIMARY KEY(shop_id,id), UNIQUE(id));

CREATE TABLE bk_services (
 shop_id uuid NOT NULL REFERENCES bk_shops(id) ON DELETE CASCADE,
 id uuid NOT NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
 description text CHECK(length(description)<=300),
 duration_min integer NOT NULL CHECK(duration_min BETWEEN 5 AND 480),
 buffer_min integer NOT NULL DEFAULT 0 CHECK(buffer_min BETWEEN 0 AND 120),
 price_cents integer CHECK(price_cents BETWEEN 0 AND 10000000),
 staff_ids uuid[] NOT NULL DEFAULT '{}',       -- empty: every staff member
 active boolean NOT NULL DEFAULT true,
 position integer NOT NULL DEFAULT 0,
 PRIMARY KEY(shop_id,id), UNIQUE(id));

CREATE TABLE bk_closures (
 shop_id uuid NOT NULL REFERENCES bk_shops(id) ON DELETE CASCADE,
 id uuid NOT NULL,
 staff_id uuid,                                -- null: the whole shop
 from_date date NOT NULL, to_date date NOT NULL,
 note text CHECK(length(note)<=200),
 PRIMARY KEY(shop_id,id), CHECK(to_date>=from_date),
 FOREIGN KEY(shop_id,staff_id) REFERENCES bk_staff(shop_id,id) ON DELETE CASCADE);

CREATE TABLE bk_customers (
 shop_id uuid NOT NULL REFERENCES bk_shops(id) ON DELETE CASCADE,
 id uuid NOT NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 phone text CHECK(phone ~ '^\+[0-9]{6,15}$'),
 email text,
 notes text CHECK(length(notes)<=1000),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(shop_id,id), UNIQUE(shop_id,phone));

CREATE TABLE bk_appointments (
 shop_id uuid NOT NULL REFERENCES bk_shops(id) ON DELETE CASCADE,
 id uuid NOT NULL,
 staff_id uuid NOT NULL,
 service_id uuid NOT NULL,
 customer_id uuid NOT NULL,
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 blocks_until timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'confirmed' CHECK(status IN('confirmed','done','no_show','cancelled')),
 source text NOT NULL CHECK(source IN('web','owner','whatsapp','phone')),
 price_cents integer,
 note text CHECK(length(note)<=500),
 manage_token_hash text UNIQUE,                -- sha256 of the customer's link to see or cancel the booking
 created_by integer REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 cancelled_at timestamptz,
 PRIMARY KEY(shop_id,id),
 CHECK(ends_at>starts_at AND blocks_until>=ends_at),
 FOREIGN KEY(shop_id,staff_id) REFERENCES bk_staff(shop_id,id),
 FOREIGN KEY(shop_id,service_id) REFERENCES bk_services(shop_id,id),
 FOREIGN KEY(shop_id,customer_id) REFERENCES bk_customers(shop_id,id),
 CONSTRAINT bk_no_overlap EXCLUDE USING gist (staff_id WITH =, tstzrange(starts_at,blocks_until,'[)') WITH &&) WHERE (status IN('confirmed','done')));
CREATE INDEX bk_appointments_day ON bk_appointments(shop_id,starts_at);
CREATE INDEX bk_appointments_customer ON bk_appointments(shop_id,customer_id);

CREATE TABLE bk_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 shop_id uuid NOT NULL REFERENCES bk_shops(id) ON DELETE CASCADE,
 actor_id integer REFERENCES users(id),
 action text NOT NULL, entity_id uuid,
 at timestamptz NOT NULL DEFAULT now(),
 detail jsonb NOT NULL DEFAULT '{}');

-- Raises a named error when a condition fails (role checks and optimistic guards inside one HTTP transaction).
CREATE OR REPLACE FUNCTION bk_assert(ok boolean, msg text, code text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION USING MESSAGE=msg, ERRCODE=code; END IF; END $$;
CREATE OR REPLACE FUNCTION bk_role(shop uuid, uid integer) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT role FROM bk_members WHERE shop_id=shop AND user_id=uid $$;
COMMIT;
