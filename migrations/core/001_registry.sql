-- Generated from api/_registry-core.js SCHEMA. Idempotent; apply with POST /api/admin/migrate?registry=1.
CREATE TABLE IF NOT EXISTS rx_clients (
 id text PRIMARY KEY CHECK (id ~ '^cl-[a-zA-Z0-9-]{6,80}$'),
 name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
 status text NOT NULL DEFAULT 'prospect' CHECK (status IN ('prospect','active','paused','archived')),
 sector text NOT NULL DEFAULT '' CHECK (length(sector) <= 100),
 manager text NOT NULL DEFAULT '' CHECK (length(manager) <= 100),
 goal text NOT NULL DEFAULT '' CHECK (length(goal) <= 500),
 notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 800),
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 created_by integer REFERENCES users(id),
 updated_by integer REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rx_projects (
 id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
 client_id text REFERENCES rx_clients(id),
 name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
 kind text NOT NULL DEFAULT 'agency' CHECK (kind IN ('agency','brand','internal','personal')),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','paused','done','archived')),
 summary text NOT NULL DEFAULT '' CHECK (length(summary) <= 2000),
 profile jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(profile) = 'object' AND octet_length(profile::text) <= 60000),
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 created_by integer REFERENCES users(id),
 updated_by integer REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rx_projects_client_idx ON rx_projects(client_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS rx_documents (
 project_id text NOT NULL REFERENCES rx_projects(id) ON DELETE CASCADE,
 module text NOT NULL CHECK (module IN ('agency-workspace','agency-operations','editorial','pm','agents','meetings')),
 data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object' AND octet_length(data::text) <= 1500000),
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 updated_by integer REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (project_id, module)
);

ALTER TABLE rx_documents DROP CONSTRAINT IF EXISTS rx_documents_module_check;

ALTER TABLE rx_documents ADD CONSTRAINT rx_documents_module_check CHECK (module IN ('agency-workspace','agency-operations','editorial','pm','agents','meetings'));

CREATE TABLE IF NOT EXISTS rx_approvals (
 id uuid PRIMARY KEY,
 project_id text NOT NULL REFERENCES rx_projects(id) ON DELETE CASCADE,
 subject_type text NOT NULL CHECK (subject_type IN ('strategy','ped-plan','content','agency-task','pm-task')),
 subject_id text NOT NULL CHECK (length(subject_id) BETWEEN 1 AND 120),
 fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
 summary text NOT NULL DEFAULT '' CHECK (length(summary) <= 300),
 state text NOT NULL CHECK (state IN ('awaiting_approval','approved','needs_revision','rejected','superseded')),
 requested_by text NOT NULL CHECK (requested_by ~ '^(user:[0-9]{1,10}|agent:[a-z0-9-]{1,60})$'),
 reviewer_id integer REFERENCES users(id),
 self_review boolean NOT NULL DEFAULT false,
 note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
 requested_at timestamptz NOT NULL DEFAULT now(),
 decided_at timestamptz,
 CHECK ((state = 'awaiting_approval') = (reviewer_id IS NULL) OR state = 'superseded')
);

CREATE INDEX IF NOT EXISTS rx_approvals_subject_idx ON rx_approvals(project_id, subject_type, subject_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS rx_activity (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 project_id text,
 actor_id integer REFERENCES users(id),
 action text NOT NULL CHECK (length(action) BETWEEN 3 AND 60),
 subject text NOT NULL DEFAULT '' CHECK (length(subject) <= 160),
 detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rx_activity_project_idx ON rx_activity(project_id, id DESC);
CREATE TABLE IF NOT EXISTS rx_publications (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 project_id text NOT NULL REFERENCES rx_projects(id) ON DELETE CASCADE,
 content_id text NOT NULL CHECK (length(content_id) BETWEEN 1 AND 120),
 revision integer NOT NULL CHECK (revision > 0),
 service text NOT NULL CHECK (service IN ('buffer')),
 channel_id text NOT NULL CHECK (length(channel_id) BETWEEN 1 AND 120),
 channel_name text NOT NULL DEFAULT '' CHECK (length(channel_name) <= 160),
 mode text NOT NULL CHECK (mode IN ('scheduled','queue')),
 timezone text NOT NULL DEFAULT '' CHECK (length(timezone) <= 60),
 scheduled_at timestamptz,
 status text NOT NULL CHECK (status IN ('sending','queued','failed')),
 post_id text,
 due_at timestamptz,
 error text NOT NULL DEFAULT '' CHECK (length(error) <= 500),
 attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0),
 requested_by integer REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (project_id, content_id, revision, service)
);
CREATE INDEX IF NOT EXISTS rx_publications_project_idx ON rx_publications(project_id, updated_at DESC);

-- Images of a PED content (slides, post image), fetched by publishing services from a signed link.
CREATE TABLE IF NOT EXISTS rx_media (
 id text PRIMARY KEY CHECK (id ~ '^[0-9a-f-]{36}$'),
 project_id text NOT NULL REFERENCES rx_projects(id) ON DELETE CASCADE,
 content_id text NOT NULL CHECK (length(content_id) BETWEEN 1 AND 120),
 slot integer NOT NULL CHECK (slot BETWEEN 0 AND 19),
 mime text NOT NULL CHECK (mime IN ('image/png','image/jpeg')),
 data_b64 text NOT NULL CHECK (length(data_b64) <= 4000000),
 created_by integer REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (project_id, content_id, slot)
);

-- One reading a day of the numbers of a published post (from Buffer): the time series behind «Risultati».
CREATE TABLE IF NOT EXISTS rx_post_stats (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 project_id text NOT NULL REFERENCES rx_projects(id) ON DELETE CASCADE,
 content_id text NOT NULL CHECK (length(content_id) BETWEEN 1 AND 120),
 service text NOT NULL CHECK (service IN ('buffer')),
 post_id text NOT NULL CHECK (length(post_id) BETWEEN 1 AND 64),
 day date NOT NULL,
 published_at timestamptz,
 link text CHECK (link IS NULL OR length(link) <= 500),
 metrics jsonb NOT NULL CHECK (jsonb_typeof(metrics) = 'object'),
 engagement_rate numeric,
 fetched_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (project_id, content_id, post_id, day)
);
CREATE INDEX IF NOT EXISTS rx_post_stats_project_idx ON rx_post_stats(project_id, content_id, fetched_at);
