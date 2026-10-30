-- CRM: Prodotti, Listini, Preventivi e Fatture (Salesforce Products, Price Books, Quotes, Invoices).
-- Apply after 001-011 (012 is independent), first on Neon radix-preview; production only with the owner's OK.
-- Idempotent: tables and indexes use IF NOT EXISTS, the functions are CREATE OR REPLACE. Nothing existing changes.
-- Documents (preventivi and fatture) share one table and one lines table; totals, numbering and the
-- customer snapshot are computed here, never taken from the client. A CRM invoice is a commercial document:
-- sending it to the SdI (fattura elettronica) is not part of this migration.
BEGIN;
DO $$ BEGIN
 IF current_setting('server_version_num')::integer<150000 THEN RAISE EXCEPTION 'sales 013 needs PostgreSQL 15 or later'; END IF;
END $$;

CREATE TABLE IF NOT EXISTS sales_products(
 workspace_id uuid NOT NULL REFERENCES sales_workspaces(id), id uuid NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 code text CHECK(length(code) BETWEEN 1 AND 60),
 description text CHECK(length(description)<=4000),
 unit text NOT NULL DEFAULT 'pz' CHECK(length(btrim(unit)) BETWEEN 1 AND 20),
 unit_price_cents bigint NOT NULL DEFAULT 0 CHECK(unit_price_cents BETWEEN 0 AND 9000000000000),
 -- VAT in basis points: 2200 = 22%.
 vat_rate_bp integer NOT NULL DEFAULT 2200 CHECK(vat_rate_bp BETWEEN 0 AND 10000),
 active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), created_by integer REFERENCES users(id) ON DELETE SET NULL,
 PRIMARY KEY(workspace_id,id));
CREATE UNIQUE INDEX IF NOT EXISTS sales_products_code ON sales_products(workspace_id,lower(code)) WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS sales_price_books(
 workspace_id uuid NOT NULL REFERENCES sales_workspaces(id), id uuid NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 description text CHECK(length(description)<=1000),
 is_default boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), created_by integer REFERENCES users(id) ON DELETE SET NULL,
 PRIMARY KEY(workspace_id,id));
CREATE UNIQUE INDEX IF NOT EXISTS sales_price_books_default ON sales_price_books(workspace_id) WHERE is_default;

CREATE TABLE IF NOT EXISTS sales_price_book_entries(
 workspace_id uuid NOT NULL, price_book_id uuid NOT NULL, product_id uuid NOT NULL,
 unit_price_cents bigint NOT NULL CHECK(unit_price_cents BETWEEN 0 AND 9000000000000),
 PRIMARY KEY(workspace_id,price_book_id,product_id),
 FOREIGN KEY(workspace_id,price_book_id) REFERENCES sales_price_books(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,product_id) REFERENCES sales_products(workspace_id,id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS sales_price_book_entries_product ON sales_price_book_entries(workspace_id,product_id);

CREATE TABLE IF NOT EXISTS sales_documents(
 workspace_id uuid NOT NULL REFERENCES sales_workspaces(id), id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('quote','invoice')),
 number text CHECK(length(number) BETWEEN 1 AND 40),
 title text CHECK(length(title)<=200),
 status text NOT NULL DEFAULT 'bozza',
 company_id uuid, contact_id uuid, opportunity_id uuid, price_book_id uuid, quote_id uuid,
 issue_date date NOT NULL DEFAULT current_date CHECK(issue_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
 valid_until date CHECK(valid_until BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
 due_date date CHECK(due_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
 paid_at date CHECK(paid_at BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
 notes text CHECK(length(notes)<=4000), terms text CHECK(length(terms)<=4000),
 -- Snapshots taken when the document is saved: who issues it and who receives it.
 customer jsonb NOT NULL DEFAULT '{}', issuer jsonb NOT NULL DEFAULT '{}',
 subtotal_cents bigint NOT NULL DEFAULT 0, discount_cents bigint NOT NULL DEFAULT 0, vat_cents bigint NOT NULL DEFAULT 0, total_cents bigint NOT NULL DEFAULT 0,
 vat_summary jsonb NOT NULL DEFAULT '[]',
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by integer REFERENCES users(id) ON DELETE SET NULL,
 PRIMARY KEY(workspace_id,id),
 CHECK((kind='quote' AND status IN('bozza','inviato','accettato','rifiutato','scaduto')) OR (kind='invoice' AND status IN('bozza','emessa','pagata','annullata'))),
 -- A quote is numbered when created, an invoice when it is issued (Italian sequential numbering).
 CHECK(number IS NOT NULL OR (kind='invoice' AND status='bozza')),
 CHECK(kind='invoice' OR (due_date IS NULL AND paid_at IS NULL AND quote_id IS NULL)),
 CHECK(kind='quote' OR valid_until IS NULL),
 CHECK((paid_at IS NOT NULL)=(kind='invoice' AND status='pagata')),
 FOREIGN KEY(workspace_id,company_id) REFERENCES sales_companies(workspace_id,id),
 FOREIGN KEY(workspace_id,contact_id) REFERENCES sales_contacts(workspace_id,id),
 FOREIGN KEY(workspace_id,opportunity_id) REFERENCES sales_opportunities(workspace_id,id) ON DELETE SET NULL (opportunity_id),
 FOREIGN KEY(workspace_id,price_book_id) REFERENCES sales_price_books(workspace_id,id) ON DELETE SET NULL (price_book_id),
 FOREIGN KEY(workspace_id,quote_id) REFERENCES sales_documents(workspace_id,id) ON DELETE SET NULL (quote_id));
CREATE UNIQUE INDEX IF NOT EXISTS sales_documents_number ON sales_documents(workspace_id,kind,number) WHERE number IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_documents_list ON sales_documents(workspace_id,kind,issue_date DESC,id);
CREATE INDEX IF NOT EXISTS sales_documents_company ON sales_documents(workspace_id,company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_documents_contact ON sales_documents(workspace_id,contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_documents_opportunity ON sales_documents(workspace_id,opportunity_id) WHERE opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_documents_quote ON sales_documents(workspace_id,quote_id) WHERE quote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_documents_price_book ON sales_documents(workspace_id,price_book_id) WHERE price_book_id IS NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='sales_document_integrity') THEN
  -- Same rule as leads and opportunities: a contact belongs to the chosen company.
  CREATE TRIGGER sales_document_integrity BEFORE INSERT OR UPDATE ON sales_documents FOR EACH ROW EXECUTE FUNCTION sales_activity_integrity();
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS sales_document_lines(
 workspace_id uuid NOT NULL, document_id uuid NOT NULL, id uuid NOT NULL,
 position integer NOT NULL CHECK(position BETWEEN 0 AND 500),
 product_id uuid,
 description text NOT NULL CHECK(length(btrim(description)) BETWEEN 1 AND 1000),
 quantity numeric(12,3) NOT NULL CHECK(quantity>0 AND quantity<=1000000000),
 unit text NOT NULL DEFAULT 'pz' CHECK(length(btrim(unit)) BETWEEN 1 AND 20),
 unit_price_cents bigint NOT NULL CHECK(unit_price_cents BETWEEN 0 AND 9000000000000),
 discount_bp integer NOT NULL DEFAULT 0 CHECK(discount_bp BETWEEN 0 AND 10000),
 vat_rate_bp integer NOT NULL CHECK(vat_rate_bp BETWEEN 0 AND 10000),
 net_cents bigint NOT NULL,
 PRIMARY KEY(workspace_id,document_id,id), UNIQUE(workspace_id,document_id,position),
 FOREIGN KEY(workspace_id,document_id) REFERENCES sales_documents(workspace_id,id) ON DELETE CASCADE,
 -- Deleting a product keeps the lines: description, price and VAT are copied on the line.
 FOREIGN KEY(workspace_id,product_id) REFERENCES sales_products(workspace_id,id) ON DELETE SET NULL (product_id));
CREATE INDEX IF NOT EXISTS sales_document_lines_product ON sales_document_lines(workspace_id,product_id) WHERE product_id IS NOT NULL;

-- Issuer data (intestazione) and default terms, one row per workspace.
CREATE TABLE IF NOT EXISTS sales_document_settings(
 workspace_id uuid PRIMARY KEY REFERENCES sales_workspaces(id),
 issuer jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(issuer)='object' AND length(issuer::text)<=4000),
 quote_terms text CHECK(length(quote_terms)<=4000), invoice_terms text CHECK(length(invoice_terms)<=4000),
 quote_validity_days integer NOT NULL DEFAULT 30 CHECK(quote_validity_days BETWEEN 1 AND 365),
 payment_days integer NOT NULL DEFAULT 30 CHECK(payment_days BETWEEN 0 AND 365),
 version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(), updated_by integer REFERENCES users(id) ON DELETE SET NULL);

-- Yearly counters: PRV-2026-0001 for quotes, 2026/0001 for invoices.
CREATE TABLE IF NOT EXISTS sales_document_counters(
 workspace_id uuid NOT NULL REFERENCES sales_workspaces(id), kind text NOT NULL CHECK(kind IN('quote','invoice')),
 year integer NOT NULL CHECK(year BETWEEN 2000 AND 2100), last integer NOT NULL CHECK(last BETWEEN 0 AND 999999),
 PRIMARY KEY(workspace_id,kind,year));

-- Replaces the lines of a document and recomputes its totals. VAT per rate on the rate's net total,
-- as in the «riepilogo IVA» of an Italian invoice. lines: [{product_id?,description,quantity,unit?,unit_price_cents,discount_bp?,vat_rate_bp}]
CREATE OR REPLACE FUNCTION sales_document_set_lines(w uuid, doc uuid, lines jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE l jsonb; i integer := 0; line_net bigint; line_gross bigint; result jsonb;
BEGIN
 IF jsonb_typeof(lines)<>'array' OR jsonb_array_length(lines)>200 THEN RAISE EXCEPTION 'invalid lines' USING ERRCODE='22023'; END IF;
 DELETE FROM sales_document_lines WHERE workspace_id=w AND document_id=doc;
 FOR l IN SELECT value FROM jsonb_array_elements(lines) LOOP
   IF jsonb_typeof(l)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(l) k WHERE k NOT IN('product_id','description','quantity','unit','unit_price_cents','discount_bp','vat_rate_bp')) THEN RAISE EXCEPTION 'invalid lines' USING ERRCODE='22023'; END IF;
   line_gross := round((l->>'quantity')::numeric(12,3)*(l->>'unit_price_cents')::bigint);
   line_net := round(line_gross*(10000-COALESCE((l->>'discount_bp')::integer,0))/10000.0);
   INSERT INTO sales_document_lines(workspace_id,document_id,id,position,product_id,description,quantity,unit,unit_price_cents,discount_bp,vat_rate_bp,net_cents)
   VALUES(w,doc,gen_random_uuid(),i,(l->>'product_id')::uuid,btrim(l->>'description'),(l->>'quantity')::numeric(12,3),COALESCE(NULLIF(btrim(l->>'unit'),''),'pz'),(l->>'unit_price_cents')::bigint,COALESCE((l->>'discount_bp')::integer,0),(l->>'vat_rate_bp')::integer,line_net);
   i := i+1;
 END LOOP;
 WITH x AS (SELECT round(quantity*unit_price_cents)::bigint AS gross,net_cents,vat_rate_bp FROM sales_document_lines WHERE workspace_id=w AND document_id=doc),
  r AS (SELECT vat_rate_bp,sum(net_cents)::bigint AS net,round(sum(net_cents)*vat_rate_bp/10000.0)::bigint AS vat FROM x GROUP BY vat_rate_bp),
  t AS (SELECT COALESCE((SELECT sum(gross) FROM x),0)::bigint AS gross,COALESCE((SELECT sum(net) FROM r),0)::bigint AS net,COALESCE((SELECT sum(vat) FROM r),0)::bigint AS vat,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('vat_rate_bp',vat_rate_bp,'net_cents',net,'vat_cents',vat) ORDER BY vat_rate_bp DESC) FROM r),'[]'::jsonb) AS summary)
 UPDATE sales_documents d SET subtotal_cents=t.net,discount_cents=t.gross-t.net,vat_cents=t.vat,total_cents=t.net+t.vat,vat_summary=t.summary,updated_at=now()
  FROM t WHERE d.workspace_id=w AND d.id=doc RETURNING to_jsonb(d.*) INTO result;
 RETURN result;
END;
$$;

-- Customer snapshot from the company (billing data, 011 fields when present) and the contact.
CREATE OR REPLACE FUNCTION sales_document_customer(w uuid, company uuid, contact uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
 SELECT jsonb_strip_nulls(jsonb_build_object(
  'company',(SELECT jsonb_build_object('name',c.name,'legal_name',to_jsonb(c)->>'legal_name','vat_number',to_jsonb(c)->>'vat_number','tax_code',to_jsonb(c)->>'tax_code',
    'street',to_jsonb(c)->>'billing_street','zip',to_jsonb(c)->>'billing_zip','city',COALESCE(to_jsonb(c)->>'billing_city',c.city),'province',to_jsonb(c)->>'billing_province','country',to_jsonb(c)->>'billing_country',
    'pec',to_jsonb(c)->>'pec','sdi_code',to_jsonb(c)->>'sdi_code','email',c.email) FROM sales_companies c WHERE c.workspace_id=w AND c.id=company),
  'contact',(SELECT jsonb_build_object('name',p.name,'email',p.email,'phone',p.phone) FROM sales_contacts p WHERE p.workspace_id=w AND p.id=contact)));
$$;

-- One entry point for the catalog and the documents, like sales_command for the CRM records.
-- entity: products | price_books | price_book_entries | documents | document_settings.
CREATE OR REPLACE FUNCTION sales_document_command(w uuid, actor integer, entity text, action text, d jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public, pg_temp SET timezone = 'Europe/Rome' AS $$
#variable_conflict use_variable
DECLARE r text; cur jsonb; result jsonb; rid uuid; k text; allowed text[]; cols text := ''; vals text := ''; updates text := '';
 doc sales_documents%ROWTYPE; src sales_documents%ROWTYPE; st sales_document_settings%ROWTYPE; yr integer; n integer; num text; prior sales_idempotency%ROWTYPE; fp jsonb;
BEGIN
 SELECT m.role INTO r FROM sales_memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=w AND m.user_id=actor FOR SHARE OF m,u;
 IF r IS NULL OR r NOT IN ('owner','admin','member') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF entity IN ('price_books','price_book_entries','document_settings') AND r NOT IN ('owner','admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 rid := (d->>'id')::uuid;

 IF entity='document_settings' THEN
   IF action<>'set' THEN RAISE EXCEPTION 'invalid command' USING ERRCODE='22023'; END IF;
   INSERT INTO sales_document_settings(workspace_id,issuer,quote_terms,invoice_terms,quote_validity_days,payment_days,updated_by)
   VALUES(w,COALESCE(d->'issuer','{}'),d->>'quote_terms',d->>'invoice_terms',COALESCE((d->>'quote_validity_days')::integer,30),COALESCE((d->>'payment_days')::integer,30),actor)
   ON CONFLICT(workspace_id) DO UPDATE SET issuer=EXCLUDED.issuer,quote_terms=EXCLUDED.quote_terms,invoice_terms=EXCLUDED.invoice_terms,quote_validity_days=EXCLUDED.quote_validity_days,payment_days=EXCLUDED.payment_days,
    version=sales_document_settings.version+1,updated_at=now(),updated_by=actor
   -- An existing row changes only with its current version (two admins editing at once).
   WHERE sales_document_settings.version=(d->>'version')::integer
   RETURNING to_jsonb(sales_document_settings.*) INTO result;
   IF result IS NULL THEN RAISE EXCEPTION 'version conflict' USING ERRCODE='40001'; END IF;
   INSERT INTO sales_audit(workspace_id,actor_id,entity,entity_id,action,detail) VALUES(w,actor,entity,w,action,jsonb_build_object('after',result));
   RETURN result;
 END IF;

 IF entity='price_book_entries' THEN
   IF action='set' THEN
     INSERT INTO sales_price_book_entries(workspace_id,price_book_id,product_id,unit_price_cents) VALUES(w,(d->>'price_book_id')::uuid,(d->>'product_id')::uuid,(d->>'unit_price_cents')::bigint)
     ON CONFLICT(workspace_id,price_book_id,product_id) DO UPDATE SET unit_price_cents=EXCLUDED.unit_price_cents RETURNING to_jsonb(sales_price_book_entries.*) INTO result;
   ELSIF action='delete' THEN
     DELETE FROM sales_price_book_entries WHERE workspace_id=w AND price_book_id=(d->>'price_book_id')::uuid AND product_id=(d->>'product_id')::uuid RETURNING to_jsonb(sales_price_book_entries.*) INTO result;
     IF result IS NULL THEN RAISE EXCEPTION 'not found' USING ERRCODE='P0002'; END IF;
   ELSE RAISE EXCEPTION 'invalid command' USING ERRCODE='22023'; END IF;
   INSERT INTO sales_audit(workspace_id,actor_id,entity,entity_id,action,detail) VALUES(w,actor,entity,(d->>'product_id')::uuid,action,jsonb_build_object('price_book_id',d->'price_book_id','after',result));
   RETURN result;
 END IF;

 IF entity IN ('products','price_books') THEN
   IF action NOT IN ('create','update','delete') THEN RAISE EXCEPTION 'invalid command' USING ERRCODE='22023'; END IF;
   IF action<>'create' THEN
     EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE workspace_id=$1 AND id=$2 FOR UPDATE','sales_'||entity) INTO cur USING w,rid;
     IF cur IS NULL THEN RAISE EXCEPTION 'not found' USING ERRCODE='P0002'; END IF;
     IF (cur->>'version')::integer IS DISTINCT FROM (d->>'version')::integer THEN RAISE EXCEPTION 'version conflict' USING ERRCODE='40001'; END IF;
   END IF;
   IF action='delete' THEN
     EXECUTE format('DELETE FROM %I WHERE workspace_id=$1 AND id=$2','sales_'||entity) USING w,rid;
     result := jsonb_build_object('id',rid,'deleted',true);
   ELSE
     allowed := CASE entity WHEN 'products' THEN ARRAY['name','code','description','unit','unit_price_cents','vat_rate_bp','active'] ELSE ARRAY['name','description','is_default','active'] END;
     -- Only one default price book: setting a new one clears the previous.
     IF entity='price_books' AND (d->>'is_default')::boolean THEN UPDATE sales_price_books SET is_default=false,version=version+1 WHERE workspace_id=w AND is_default AND id IS DISTINCT FROM rid; END IF;
     FOR k IN SELECT jsonb_object_keys(d - 'id' - 'version') LOOP
       IF NOT (k = ANY(allowed)) THEN RAISE EXCEPTION 'invalid field' USING ERRCODE='22023'; END IF;
       cols := cols || format(',%I',k); vals := vals || format(',x.%I',k); updates := updates || format('%I=x.%I,',k,k);
     END LOOP;
     IF action='create' THEN
       EXECUTE format('INSERT INTO %I (workspace_id,id,created_by%s) SELECT $1,$2,$4%s FROM jsonb_populate_record(NULL::%I,$3) x RETURNING to_jsonb(%I.*)','sales_'||entity,cols,vals,'sales_'||entity,'sales_'||entity) INTO result USING w,rid,d,actor;
     ELSE
       EXECUTE format('UPDATE %I t SET %s version=t.version+1 FROM jsonb_populate_record(NULL::%I,$3) x WHERE t.workspace_id=$1 AND t.id=$2 RETURNING to_jsonb(t.*)','sales_'||entity,updates,'sales_'||entity) INTO result USING w,rid,d;
     END IF;
   END IF;
   INSERT INTO sales_audit(workspace_id,actor_id,entity,entity_id,action,detail) VALUES(w,actor,entity,rid,action,jsonb_build_object('before',cur,'after',CASE WHEN action='delete' THEN NULL ELSE result END));
   RETURN result;
 END IF;

 IF entity<>'documents' OR action NOT IN ('create','update','status','invoice','delete') THEN RAISE EXCEPTION 'invalid command' USING ERRCODE='22023'; END IF;
 SELECT * INTO st FROM sales_document_settings WHERE workspace_id=w;

 IF action='invoice' THEN
   -- Accepted quote → draft invoice with the same lines; idempotent by key like a stage transition.
   fp := jsonb_build_object('entity',entity,'action',action,'id',rid,'version',d->'version');
   PERFORM pg_advisory_xact_lock(hashtextextended(w::text || ':' || actor::text || ':' || (d->>'key'),0));
   SELECT * INTO prior FROM sales_idempotency WHERE workspace_id=w AND actor_id=actor AND key=(d->>'key')::uuid;
   IF FOUND THEN IF prior.fingerprint <> fp THEN RAISE EXCEPTION 'idempotency conflict' USING ERRCODE='40001'; END IF; RETURN prior.result; END IF;
 END IF;

 IF action<>'create' THEN
   SELECT * INTO doc FROM sales_documents WHERE workspace_id=w AND id=rid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'not found' USING ERRCODE='P0002'; END IF;
   IF doc.version IS DISTINCT FROM (d->>'version')::integer THEN RAISE EXCEPTION 'version conflict' USING ERRCODE='40001'; END IF;
   cur := to_jsonb(doc);
 END IF;

 IF action='create' THEN
   IF d->>'kind' NOT IN ('quote','invoice') THEN RAISE EXCEPTION 'invalid command' USING ERRCODE='22023'; END IF;
   IF d->>'kind'='quote' THEN
     yr := extract(year FROM COALESCE((d->>'issue_date')::date,current_date))::integer;
     INSERT INTO sales_document_counters AS c(workspace_id,kind,year,last) VALUES(w,'quote',yr,1)
     ON CONFLICT(workspace_id,kind,year) DO UPDATE SET last=c.last+1 RETURNING last INTO n;
     num := 'PRV-'||yr||'-'||lpad(n::text,4,'0');
   END IF;
   INSERT INTO sales_documents(workspace_id,id,kind,number,title,company_id,contact_id,opportunity_id,price_book_id,issue_date,valid_until,due_date,notes,terms,customer,issuer,created_by)
   VALUES(w,rid,d->>'kind',num,NULLIF(btrim(d->>'title'),''),(d->>'company_id')::uuid,(d->>'contact_id')::uuid,(d->>'opportunity_id')::uuid,(d->>'price_book_id')::uuid,
    COALESCE((d->>'issue_date')::date,current_date),
    CASE WHEN d->>'kind'='quote' THEN COALESCE((d->>'valid_until')::date,COALESCE((d->>'issue_date')::date,current_date)+COALESCE(st.quote_validity_days,30)) END,
    CASE WHEN d->>'kind'='invoice' THEN COALESCE((d->>'due_date')::date,COALESCE((d->>'issue_date')::date,current_date)+COALESCE(st.payment_days,30)) END,
    d->>'notes',COALESCE(d->>'terms',CASE WHEN d->>'kind'='quote' THEN st.quote_terms ELSE st.invoice_terms END),
    sales_document_customer(w,(d->>'company_id')::uuid,(d->>'contact_id')::uuid),COALESCE(st.issuer,'{}'),actor);
   result := sales_document_set_lines(w,rid,COALESCE(d->'lines','[]'));

 ELSIF action='update' THEN
   -- Content changes only on drafts; a sent quote goes back to «bozza» first.
   IF doc.status<>'bozza' THEN RAISE EXCEPTION 'document locked' USING ERRCODE='23514'; END IF;
   UPDATE sales_documents SET
    title=CASE WHEN d ? 'title' THEN NULLIF(btrim(d->>'title'),'') ELSE title END,
    company_id=CASE WHEN d ? 'company_id' THEN (d->>'company_id')::uuid ELSE company_id END,
    contact_id=CASE WHEN d ? 'contact_id' THEN (d->>'contact_id')::uuid ELSE contact_id END,
    opportunity_id=CASE WHEN d ? 'opportunity_id' THEN (d->>'opportunity_id')::uuid ELSE opportunity_id END,
    price_book_id=CASE WHEN d ? 'price_book_id' THEN (d->>'price_book_id')::uuid ELSE price_book_id END,
    issue_date=CASE WHEN d ? 'issue_date' THEN (d->>'issue_date')::date ELSE issue_date END,
    valid_until=CASE WHEN d ? 'valid_until' THEN (d->>'valid_until')::date ELSE valid_until END,
    due_date=CASE WHEN d ? 'due_date' THEN (d->>'due_date')::date ELSE due_date END,
    notes=CASE WHEN d ? 'notes' THEN d->>'notes' ELSE notes END,
    terms=CASE WHEN d ? 'terms' THEN d->>'terms' ELSE terms END,
    version=version+1,updated_at=now()
   WHERE workspace_id=w AND id=rid RETURNING * INTO doc;
   UPDATE sales_documents SET customer=sales_document_customer(w,doc.company_id,doc.contact_id),issuer=COALESCE(st.issuer,issuer) WHERE workspace_id=w AND id=rid;
   IF d ? 'lines' THEN result := sales_document_set_lines(w,rid,d->'lines'); ELSE SELECT to_jsonb(x) INTO result FROM sales_documents x WHERE workspace_id=w AND id=rid; END IF;

 ELSIF action='status' THEN
   IF NOT (
     (doc.kind='quote' AND ((doc.status='bozza' AND d->>'status'='inviato') OR (doc.status='inviato' AND d->>'status' IN('bozza','accettato','rifiutato','scaduto')) OR (doc.status IN('rifiutato','scaduto') AND d->>'status'='bozza')))
     OR (doc.kind='invoice' AND ((doc.status='bozza' AND d->>'status'='emessa') OR (doc.status='emessa' AND d->>'status' IN('pagata','annullata')) OR (doc.status='pagata' AND d->>'status'='emessa'))))
   THEN RAISE EXCEPTION 'invalid status change' USING ERRCODE='23514'; END IF;
   IF doc.kind='invoice' AND d->>'status'='emessa' AND doc.number IS NULL THEN
     IF NOT EXISTS(SELECT 1 FROM sales_document_lines WHERE workspace_id=w AND document_id=rid) THEN RAISE EXCEPTION 'empty document' USING ERRCODE='23514'; END IF;
     -- The number follows the issue date's year; issuing sets today's date on a draft dated earlier.
     IF doc.issue_date<current_date THEN doc.issue_date:=current_date; END IF;
     yr := extract(year FROM doc.issue_date)::integer;
     INSERT INTO sales_document_counters AS c(workspace_id,kind,year,last) VALUES(w,'invoice',yr,1)
     ON CONFLICT(workspace_id,kind,year) DO UPDATE SET last=c.last+1 RETURNING last INTO n;
     doc.number := yr||'/'||lpad(n::text,4,'0');
   END IF;
   UPDATE sales_documents SET status=d->>'status',number=doc.number,issue_date=doc.issue_date,
    paid_at=CASE WHEN d->>'status'='pagata' THEN COALESCE((d->>'paid_at')::date,current_date) END,
    customer=CASE WHEN doc.status='bozza' THEN sales_document_customer(w,doc.company_id,doc.contact_id) ELSE customer END,
    issuer=CASE WHEN doc.status='bozza' THEN COALESCE(st.issuer,issuer) ELSE issuer END,
    version=version+1,updated_at=now()
   WHERE workspace_id=w AND id=rid RETURNING to_jsonb(sales_documents.*) INTO result;

 ELSIF action='invoice' THEN
   IF doc.kind<>'quote' OR doc.status<>'accettato' THEN RAISE EXCEPTION 'quote not accepted' USING ERRCODE='23514'; END IF;
   INSERT INTO sales_documents(workspace_id,id,kind,title,company_id,contact_id,opportunity_id,price_book_id,quote_id,issue_date,due_date,notes,terms,customer,issuer,created_by)
   VALUES(w,(d->>'invoice_id')::uuid,'invoice',doc.title,doc.company_id,doc.contact_id,doc.opportunity_id,doc.price_book_id,doc.id,current_date,current_date+COALESCE(st.payment_days,30),doc.notes,st.invoice_terms,
    sales_document_customer(w,doc.company_id,doc.contact_id),COALESCE(st.issuer,'{}'),actor);
   result := sales_document_set_lines(w,(d->>'invoice_id')::uuid,(SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('product_id',product_id,'description',description,'quantity',quantity,'unit',unit,'unit_price_cents',unit_price_cents,'discount_bp',discount_bp,'vat_rate_bp',vat_rate_bp)) ORDER BY position),'[]') FROM sales_document_lines WHERE workspace_id=w AND document_id=rid));
   INSERT INTO sales_audit(workspace_id,actor_id,entity,entity_id,action,detail) VALUES(w,actor,entity,(d->>'invoice_id')::uuid,'create',jsonb_build_object('quote_id',rid,'source','invoice','after',result));
   INSERT INTO sales_idempotency(workspace_id,actor_id,key,fingerprint,result) VALUES(w,actor,(d->>'key')::uuid,fp,result);
   RETURN result;

 ELSE -- delete: drafts, and quotes that never became an invoice. Issued invoices are cancelled («annullata»), never deleted.
   IF (doc.kind='invoice' AND doc.status<>'bozza') OR (doc.kind='quote' AND EXISTS(SELECT 1 FROM sales_documents WHERE workspace_id=w AND quote_id=rid)) THEN RAISE EXCEPTION 'document locked' USING ERRCODE='23514'; END IF;
   DELETE FROM sales_documents WHERE workspace_id=w AND id=rid;
   result := jsonb_build_object('id',rid,'deleted',true);
 END IF;
 INSERT INTO sales_audit(workspace_id,actor_id,entity,entity_id,action,detail) VALUES(w,actor,entity,rid,action,jsonb_build_object('before',cur,'after',CASE WHEN action='delete' THEN NULL ELSE result END));
 RETURN result;
END;
$$;
COMMIT;
