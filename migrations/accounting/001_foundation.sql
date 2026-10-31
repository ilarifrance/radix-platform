-- RADIX Accounting foundation: client companies, members, chart of accounts, journal, invoices, VAT, open items, bank, budget.
-- MANUAL: apply on the Preview database (Neon radix-preview) only after Francesco's OK; production needs a separate OK.
-- Requires public.users(id integer). Amounts are integer cents. Every table is scoped by company_id.
BEGIN;
CREATE TABLE acc_companies (
 id uuid PRIMARY KEY,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 vat text CHECK(vat ~ '^[A-Z]{2}[0-9A-Z]{2,28}$'),
 tax_code text CHECK(tax_code ~ '^[0-9A-Z]{11,16}$'),
 legal_form text NOT NULL DEFAULT 'srl' CHECK(legal_form IN('srl','srls','spa','snc','sas','ditta','professionista','altro')),
 regime text NOT NULL DEFAULT 'ordinario' CHECK(regime IN('ordinario','semplificato','forfettario')),
 vat_periodicity text NOT NULL DEFAULT 'quarterly' CHECK(vat_periodicity IN('monthly','quarterly')),
 plan text NOT NULL DEFAULT 'base' CHECK(plan IN('base','controllo','professionista')),
 lock_date date,
 created_at timestamptz NOT NULL DEFAULT now(), created_by integer REFERENCES users(id), version integer NOT NULL DEFAULT 1);
CREATE TABLE acc_memberships (
 company_id uuid NOT NULL REFERENCES acc_companies(id) ON DELETE CASCADE, user_id integer NOT NULL REFERENCES users(id),
 role text NOT NULL CHECK(role IN('owner','admin','accountant','member','viewer')), PRIMARY KEY(company_id,user_id));
CREATE INDEX acc_memberships_user ON acc_memberships(user_id);
CREATE TABLE acc_accounts (
 company_id uuid NOT NULL REFERENCES acc_companies(id) ON DELETE CASCADE, code text NOT NULL CHECK(code ~ '^\d{2}\.\d{2}(\.\d{2})?$'),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120), kind text NOT NULL CHECK(kind IN('A','P','N','R','C')),
 grp text NOT NULL CHECK(length(grp) BETWEEN 1 AND 40), keywords text CHECK(length(keywords)<=600),
 system boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true, PRIMARY KEY(company_id,code));
CREATE TABLE acc_entries (
 company_id uuid NOT NULL REFERENCES acc_companies(id) ON DELETE CASCADE, id uuid NOT NULL,
 number text, date date NOT NULL CHECK(date BETWEEN '2000-01-01' AND '2100-12-31'),
 description text NOT NULL CHECK(length(btrim(description)) BETWEEN 1 AND 300),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','posted')),
 source jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(source)='object' AND length(source::text)<=2000),
 reverses uuid, created_at timestamptz NOT NULL DEFAULT now(), created_by integer REFERENCES users(id),
 posted_at timestamptz, posted_by integer REFERENCES users(id), version integer NOT NULL DEFAULT 1,
 PRIMARY KEY(company_id,id), CHECK((status='posted')=(number IS NOT NULL AND posted_at IS NOT NULL)));
CREATE UNIQUE INDEX acc_entries_number ON acc_entries(company_id,number) WHERE number IS NOT NULL;
CREATE INDEX acc_entries_date ON acc_entries(company_id,date,id);
CREATE TABLE acc_entry_lines (
 company_id uuid NOT NULL, entry_id uuid NOT NULL, n integer NOT NULL CHECK(n BETWEEN 1 AND 200),
 account text NOT NULL, debit_cents bigint NOT NULL DEFAULT 0 CHECK(debit_cents BETWEEN 0 AND 90000000000000),
 credit_cents bigint NOT NULL DEFAULT 0 CHECK(credit_cents BETWEEN 0 AND 90000000000000),
 cost_center text CHECK(length(cost_center) BETWEEN 1 AND 80), project text CHECK(length(project) BETWEEN 1 AND 80),
 description text CHECK(length(description)<=300),
 PRIMARY KEY(company_id,entry_id,n), CHECK((debit_cents>0)<>(credit_cents>0)),
 FOREIGN KEY(company_id,entry_id) REFERENCES acc_entries(company_id,id) ON DELETE CASCADE,
 FOREIGN KEY(company_id,account) REFERENCES acc_accounts(company_id,code));
CREATE INDEX acc_entry_lines_account ON acc_entry_lines(company_id,account);
CREATE TABLE acc_sequences (company_id uuid NOT NULL REFERENCES acc_companies(id) ON DELETE CASCADE, year integer NOT NULL, last integer NOT NULL DEFAULT 0, PRIMARY KEY(company_id,year));
-- Invoices (FatturaPA) imported and waiting for review or registered.
CREATE TABLE acc_documents (
 company_id uuid NOT NULL REFERENCES acc_companies(id) ON DELETE CASCADE, id uuid NOT NULL,
 direction text NOT NULL CHECK(direction IN('purchase','sale')), doc_type text NOT NULL CHECK(doc_type ~ '^TD[0-9]{2}$'),
 number text NOT NULL CHECK(length(number) BETWEEN 1 AND 40), date date NOT NULL,
 counterpart_name text CHECK(length(counterpart_name)<=200), counterpart_vat text CHECK(length(counterpart_vat)<=40), counterpart_key text CHECK(length(counterpart_key)<=240),
 total_cents bigint NOT NULL, status text NOT NULL DEFAULT 'to_review' CHECK(status IN('to_review','registered','ignored')),
 parsed jsonb NOT NULL CHECK(jsonb_typeof(parsed)='object' AND length(parsed::text)<=400000), proposal jsonb CHECK(length(proposal::text)<=200000),
 file_name text CHECK(length(file_name)<=200), sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 entry_id uuid, created_at timestamptz NOT NULL DEFAULT now(), created_by integer REFERENCES users(id), version integer NOT NULL DEFAULT 1,
 PRIMARY KEY(company_id,id), FOREIGN KEY(company_id,entry_id) REFERENCES acc_entries(company_id,id));
-- Same file body never imported twice; same invoice of the same counterpart never twice either.
CREATE UNIQUE INDEX acc_documents_sha ON acc_documents(company_id,sha256);
CREATE UNIQUE INDEX acc_documents_identity ON acc_documents(company_id,direction,coalesce(counterpart_key,''),number,date);
CREATE INDEX acc_documents_status ON acc_documents(company_id,status,date);
CREATE TABLE acc_vat_rows (
 company_id uuid NOT NULL, id uuid NOT NULL, document_id uuid, entry_id uuid NOT NULL,
 register text NOT NULL CHECK(register IN('vendite','acquisti')), date date NOT NULL, doc_date date, doc_number text, doc_type text,
 counterpart text, counterpart_vat text, rate numeric(5,2) NOT NULL CHECK(rate BETWEEN 0 AND 100), nature text CHECK(nature ~ '^N[0-9](\.[0-9])?$'),
 taxable_cents bigint NOT NULL, vat_cents bigint NOT NULL, deductible_vat_cents bigint NOT NULL DEFAULT 0,
 exigibility text NOT NULL DEFAULT 'I' CHECK(exigibility IN('I','D','S')), reverse_charge boolean NOT NULL DEFAULT false, paid_date date,
 PRIMARY KEY(company_id,id), FOREIGN KEY(company_id,document_id) REFERENCES acc_documents(company_id,id),
 FOREIGN KEY(company_id,entry_id) REFERENCES acc_entries(company_id,id));
CREATE INDEX acc_vat_rows_date ON acc_vat_rows(company_id,date);
CREATE TABLE acc_open_items (
 company_id uuid NOT NULL, id uuid NOT NULL, document_id uuid, kind text NOT NULL CHECK(kind IN('receivable','payable')),
 due date NOT NULL, amount_cents bigint NOT NULL, paid_cents bigint NOT NULL DEFAULT 0,
 counterpart text, doc_number text, method text, iban text CHECK(length(iban)<=34), version integer NOT NULL DEFAULT 1,
 PRIMARY KEY(company_id,id), FOREIGN KEY(company_id,document_id) REFERENCES acc_documents(company_id,id),
 CHECK(abs(paid_cents)<=abs(amount_cents)));
CREATE INDEX acc_open_items_due ON acc_open_items(company_id,kind,due);
CREATE TABLE acc_bank_movements (
 company_id uuid NOT NULL REFERENCES acc_companies(id) ON DELETE CASCADE, id uuid NOT NULL, account text NOT NULL DEFAULT '03.01',
 date date NOT NULL, value_date date, amount_cents bigint NOT NULL CHECK(amount_cents<>0), description text NOT NULL DEFAULT '' CHECK(length(description)<=500),
 fingerprint text NOT NULL CHECK(length(fingerprint)<=700), status text NOT NULL DEFAULT 'new' CHECK(status IN('new','matched','ignored')),
 entry_id uuid, open_item_id uuid, created_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1,
 PRIMARY KEY(company_id,id), UNIQUE(company_id,account,fingerprint),
 FOREIGN KEY(company_id,account) REFERENCES acc_accounts(company_id,code),
 FOREIGN KEY(company_id,entry_id) REFERENCES acc_entries(company_id,id), FOREIGN KEY(company_id,open_item_id) REFERENCES acc_open_items(company_id,id));
-- Account learned per counterpart from confirmed invoices.
CREATE TABLE acc_learned (company_id uuid NOT NULL REFERENCES acc_companies(id) ON DELETE CASCADE, counterpart_key text NOT NULL, account text NOT NULL, uses integer NOT NULL DEFAULT 1, PRIMARY KEY(company_id,counterpart_key), FOREIGN KEY(company_id,account) REFERENCES acc_accounts(company_id,code));
CREATE TABLE acc_budget (company_id uuid NOT NULL REFERENCES acc_companies(id) ON DELETE CASCADE, year integer NOT NULL CHECK(year BETWEEN 2000 AND 2100), key text NOT NULL CHECK(key IN('ricavi','acquisti','servizi','godimento','oneri_diversi','personale','ammortamenti','ebitda','utile')), month integer NOT NULL CHECK(month BETWEEN 1 AND 12), amount_cents bigint NOT NULL, PRIMARY KEY(company_id,year,key,month));
CREATE TABLE acc_vat_settlements (company_id uuid NOT NULL REFERENCES acc_companies(id) ON DELETE CASCADE, period text NOT NULL CHECK(period ~ '^\d{4}-(M(0[1-9]|1[0-2])|T[1-4])$'), result jsonb NOT NULL, entry_id uuid, closed_at timestamptz NOT NULL DEFAULT now(), closed_by integer REFERENCES users(id), PRIMARY KEY(company_id,period), FOREIGN KEY(company_id,entry_id) REFERENCES acc_entries(company_id,id));
CREATE TABLE acc_audit (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, company_id uuid NOT NULL REFERENCES acc_companies(id) ON DELETE CASCADE, actor_id integer REFERENCES users(id), action text NOT NULL, entity_id uuid, at timestamptz NOT NULL DEFAULT now(), detail jsonb NOT NULL DEFAULT '{}');
CREATE INDEX acc_audit_company ON acc_audit(company_id,id DESC);

-- Raises a named error inside a multi-statement transaction (the API sends one HTTP transaction per command).
CREATE FUNCTION acc_assert(ok boolean, message text, code text DEFAULT 'P0001') RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION '%', message USING ERRCODE=code; END IF; RETURN true; END $$;
-- Role of a user in a company (null if none). Shared lock blocks a concurrent removal.
CREATE FUNCTION acc_role(c uuid, u integer) RETURNS text LANGUAGE sql AS $$ SELECT role FROM acc_memberships WHERE company_id=c AND user_id=u FOR SHARE $$;

-- Every entry has at least two lines and balances at commit time.
CREATE FUNCTION acc_check_balanced(c uuid, e uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE d bigint; k bigint; n integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM acc_entries WHERE company_id=c AND id=e) THEN RETURN; END IF;
 SELECT COALESCE(sum(debit_cents),0),COALESCE(sum(credit_cents),0),count(*) INTO d,k,n FROM acc_entry_lines WHERE company_id=c AND entry_id=e;
 IF n<2 OR d<>k THEN RAISE EXCEPTION 'Registrazione non bilanciata' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION acc_lines_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM acc_check_balanced(COALESCE(NEW.company_id,OLD.company_id),COALESCE(NEW.entry_id,OLD.entry_id)); RETURN NULL; END $$;
CREATE FUNCTION acc_entries_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM acc_check_balanced(NEW.company_id,NEW.id); RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER acc_lines_balanced AFTER INSERT OR UPDATE OR DELETE ON acc_entry_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION acc_lines_balanced();
CREATE CONSTRAINT TRIGGER acc_entries_balanced AFTER INSERT ON acc_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION acc_entries_balanced();

-- Posting assigns the yearly protocol number; posted entries and their lines are immutable; nothing moves inside a locked period.
CREATE FUNCTION acc_entry_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE lock date; seq integer;
BEGIN
 SELECT lock_date INTO lock FROM acc_companies WHERE id=COALESCE(NEW.company_id,OLD.company_id);
 IF TG_OP IN('UPDATE','DELETE') AND OLD.status='posted' THEN RAISE EXCEPTION 'Registrazione già contabilizzata: per correggerla usa lo storno' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN
  IF lock IS NOT NULL AND OLD.date<=lock THEN RAISE EXCEPTION 'Periodo chiuso: fino alla data di blocco non si registra più nulla' USING ERRCODE='42501'; END IF;
  RETURN OLD;
 END IF;
 IF lock IS NOT NULL AND NEW.date<=lock THEN RAISE EXCEPTION 'Periodo chiuso: fino alla data di blocco non si registra più nulla' USING ERRCODE='42501'; END IF;
 IF NEW.status='posted' AND (TG_OP='INSERT' OR OLD.status='draft') THEN
  INSERT INTO acc_sequences(company_id,year,last) VALUES(NEW.company_id,extract(year FROM NEW.date)::integer,1)
   ON CONFLICT(company_id,year) DO UPDATE SET last=acc_sequences.last+1 RETURNING last INTO seq;
  NEW.number:=extract(year FROM NEW.date)::integer||'/'||lpad(seq::text,4,'0'); NEW.posted_at:=now();
 END IF;
 IF TG_OP='UPDATE' THEN NEW.version:=OLD.version+1; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER acc_entry_guard BEFORE INSERT OR UPDATE OR DELETE ON acc_entries FOR EACH ROW EXECUTE FUNCTION acc_entry_guard();
CREATE FUNCTION acc_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM acc_entries WHERE company_id=COALESCE(NEW.company_id,OLD.company_id) AND id=COALESCE(NEW.entry_id,OLD.entry_id) AND status='posted') THEN
  RAISE EXCEPTION 'Registrazione già contabilizzata: per correggerla usa lo storno' USING ERRCODE='42501'; END IF;
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER acc_line_guard BEFORE INSERT OR UPDATE OR DELETE ON acc_entry_lines FOR EACH ROW EXECUTE FUNCTION acc_line_guard();
COMMIT;
