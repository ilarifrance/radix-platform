-- CRM: Salesforce-style Account/Contact fields and Italian fiscal data (Aziende e Contatti).
-- Applied on Neon radix-preview and radix-production on 2026-10-20 with the owner's OK.
-- Apply after 001-010. Idempotent: columns use ADD COLUMN IF NOT EXISTS, named constraints and
-- indexes are created only when missing, sales_command is a full versioned replacement of 009.
-- Needs PostgreSQL 15+ for ON DELETE SET NULL (column): deleting a parent company, a manager
-- contact or a workspace member clears only that reference, never workspace_id.
-- Every new column is optional (NULL); existing rows are unchanged. The API (api/_sales.js) checks
-- formats first (Partita IVA with check digit, codice fiscale, SDI, PEC); these CHECKs are the floor.
BEGIN;
DO $$ BEGIN
 IF current_setting('server_version_num')::integer<150000 THEN RAISE EXCEPTION 'sales 011 needs PostgreSQL 15 or later'; END IF;
END $$;
ALTER TABLE sales_companies
 ADD COLUMN IF NOT EXISTS legal_name text CHECK(length(legal_name)<=200),
 ADD COLUMN IF NOT EXISTS account_type text CHECK(account_type IN('cliente','prospect','partner','fornitore','altro')),
 ADD COLUMN IF NOT EXISTS rating text CHECK(rating IN('calda','tiepida','fredda')),
 ADD COLUMN IF NOT EXISTS owner_id integer CHECK(owner_id BETWEEN 1 AND 2147483647),
 ADD COLUMN IF NOT EXISTS parent_company_id uuid,
 ADD COLUMN IF NOT EXISTS annual_revenue_cents bigint CHECK(annual_revenue_cents BETWEEN 0 AND 9000000000000000),
 ADD COLUMN IF NOT EXISTS employees integer CHECK(employees BETWEEN 0 AND 10000000),
 ADD COLUMN IF NOT EXISTS billing_street text CHECK(length(billing_street)<=200),
 ADD COLUMN IF NOT EXISTS billing_zip text CHECK(length(billing_zip)<=20),
 ADD COLUMN IF NOT EXISTS billing_city text CHECK(length(billing_city)<=120),
 ADD COLUMN IF NOT EXISTS billing_province text CHECK(length(billing_province)<=60),
 ADD COLUMN IF NOT EXISTS billing_country text CHECK(length(billing_country)<=60),
 ADD COLUMN IF NOT EXISTS shipping_street text CHECK(length(shipping_street)<=200),
 ADD COLUMN IF NOT EXISTS shipping_zip text CHECK(length(shipping_zip)<=20),
 ADD COLUMN IF NOT EXISTS shipping_city text CHECK(length(shipping_city)<=120),
 ADD COLUMN IF NOT EXISTS shipping_province text CHECK(length(shipping_province)<=60),
 ADD COLUMN IF NOT EXISTS shipping_country text CHECK(length(shipping_country)<=60),
 -- Partita IVA: normalized (no spaces, upper case), IT + 11 digits or a foreign VAT number.
 ADD COLUMN IF NOT EXISTS vat_number text CHECK(vat_number ~ '^[A-Z0-9+*]{2,20}$'),
 -- Codice fiscale: 11 digits (company) or 16 characters (person).
 ADD COLUMN IF NOT EXISTS tax_code text CHECK(tax_code ~ '^([0-9]{11}|[A-Z0-9]{16})$'),
 ADD COLUMN IF NOT EXISTS pec text CHECK(length(pec)<=254 AND pec ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
 -- Codice destinatario SDI: 7 characters, 6 for the Pubblica Amministrazione.
 ADD COLUMN IF NOT EXISTS sdi_code text CHECK(sdi_code ~ '^[A-Z0-9]{6,7}$'),
 ADD COLUMN IF NOT EXISTS description text CHECK(length(description)<=4000);
ALTER TABLE sales_contacts
 ADD COLUMN IF NOT EXISTS first_name text CHECK(length(first_name)<=100),
 ADD COLUMN IF NOT EXISTS last_name text CHECK(length(last_name)<=100),
 ADD COLUMN IF NOT EXISTS title text CHECK(length(title)<=120),
 ADD COLUMN IF NOT EXISTS department text CHECK(length(department)<=120),
 ADD COLUMN IF NOT EXISTS reports_to_id uuid,
 ADD COLUMN IF NOT EXISTS owner_id integer CHECK(owner_id BETWEEN 1 AND 2147483647),
 ADD COLUMN IF NOT EXISTS mobile text CHECK(length(mobile)<=40),
 ADD COLUMN IF NOT EXISTS street text CHECK(length(street)<=200),
 ADD COLUMN IF NOT EXISTS zip text CHECK(length(zip)<=20),
 ADD COLUMN IF NOT EXISTS city text CHECK(length(city)<=120),
 ADD COLUMN IF NOT EXISTS province text CHECK(length(province)<=60),
 ADD COLUMN IF NOT EXISTS country text CHECK(length(country)<=60),
 ADD COLUMN IF NOT EXISTS birthdate date CHECK(birthdate BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'),
 ADD COLUMN IF NOT EXISTS lead_source text CHECK(length(lead_source)<=80),
 ADD COLUMN IF NOT EXISTS preferred_language text CHECK(length(preferred_language)<=40);
-- References stay inside the workspace (composite keys) and never point at the record itself.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='sales_companies'::regclass AND conname='sales_company_parent') THEN
  ALTER TABLE sales_companies ADD CONSTRAINT sales_company_parent FOREIGN KEY(workspace_id,parent_company_id) REFERENCES sales_companies(workspace_id,id) ON DELETE SET NULL (parent_company_id);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='sales_companies'::regclass AND conname='sales_company_not_own_parent') THEN
  ALTER TABLE sales_companies ADD CONSTRAINT sales_company_not_own_parent CHECK(parent_company_id IS NULL OR parent_company_id<>id);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='sales_companies'::regclass AND conname='sales_company_owner_membership') THEN
  ALTER TABLE sales_companies ADD CONSTRAINT sales_company_owner_membership FOREIGN KEY(workspace_id,owner_id) REFERENCES sales_memberships(workspace_id,user_id) ON DELETE SET NULL (owner_id);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='sales_contacts'::regclass AND conname='sales_contact_reports_to') THEN
  ALTER TABLE sales_contacts ADD CONSTRAINT sales_contact_reports_to FOREIGN KEY(workspace_id,reports_to_id) REFERENCES sales_contacts(workspace_id,id) ON DELETE SET NULL (reports_to_id);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='sales_contacts'::regclass AND conname='sales_contact_not_own_manager') THEN
  ALTER TABLE sales_contacts ADD CONSTRAINT sales_contact_not_own_manager CHECK(reports_to_id IS NULL OR reports_to_id<>id);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='sales_contacts'::regclass AND conname='sales_contact_owner_membership') THEN
  ALTER TABLE sales_contacts ADD CONSTRAINT sales_contact_owner_membership FOREIGN KEY(workspace_id,owner_id) REFERENCES sales_memberships(workspace_id,user_id) ON DELETE SET NULL (owner_id);
 END IF;
END $$;
-- Lookups for the reverse side of each reference (and for the ON DELETE actions).
CREATE INDEX IF NOT EXISTS sales_companies_parent ON sales_companies(workspace_id,parent_company_id) WHERE parent_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_companies_owner ON sales_companies(workspace_id,owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_companies_vat ON sales_companies(workspace_id,vat_number) WHERE vat_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_contacts_reports_to ON sales_contacts(workspace_id,reports_to_id) WHERE reports_to_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_contacts_owner ON sales_contacts(workspace_id,owner_id) WHERE owner_id IS NOT NULL;

-- Full versioned replacement of 009: the same function, with the 011 columns in the company and contact allowlists.
CREATE OR REPLACE FUNCTION sales_command(w uuid, actor integer, entity text, action text, d jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public, pg_temp SET timezone = 'UTC' AS $$
#variable_conflict use_variable
DECLARE r text; tbl text; rid uuid; current_row jsonb; result jsonb; target sales_stages%ROWTYPE; prior sales_idempotency%ROWTYPE; fp jsonb; cols text; vals text; updates text; k text; generated uuid; generated_row jsonb;
BEGIN
 -- Shared membership lock prevents permission revocation racing a command.
 SELECT m.role INTO r FROM sales_memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=w AND m.user_id=actor FOR SHARE OF m,u;
 IF r IS NULL OR r NOT IN ('owner','admin','member') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF entity NOT IN ('companies','contacts','leads','opportunities','tasks','processes','stages','interactions','tickets','segments') OR action NOT IN ('create','update','delete','transition') THEN RAISE EXCEPTION 'invalid command' USING ERRCODE='22023'; END IF;
 IF entity IN ('processes','stages') AND r NOT IN ('owner','admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 tbl := 'sales_' || entity;
 rid := (d->>'id')::uuid;
 IF action='transition' THEN
   IF d->>'key' IS NULL OR d->>'task_id' IS NULL OR d->>'stage_id' IS NULL THEN RAISE EXCEPTION 'incomplete transition' USING ERRCODE='22023'; END IF;
   IF entity <> 'opportunities' THEN RAISE EXCEPTION 'invalid transition' USING ERRCODE='22023'; END IF;
   fp := jsonb_build_object('entity',entity,'id',rid,'version',d->'version','stage_id',d->'stage_id');
   -- Serializes identical keys even when no idempotency row exists yet. Collisions only serialize unrelated work.
   PERFORM pg_advisory_xact_lock(hashtextextended(w::text || ':' || actor::text || ':' || (d->>'key'),0));
   SELECT * INTO prior FROM sales_idempotency WHERE workspace_id=w AND actor_id=actor AND key=(d->>'key')::uuid;
   IF FOUND THEN
     IF prior.fingerprint <> fp THEN RAISE EXCEPTION 'idempotency conflict' USING ERRCODE='40001'; END IF;
     RETURN prior.result;
   END IF;
 END IF;
 IF action <> 'create' THEN
   EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE workspace_id=$1 AND id=$2 FOR UPDATE',tbl) INTO current_row USING w,rid;
   IF current_row IS NULL THEN RAISE EXCEPTION 'not found' USING ERRCODE='P0002'; END IF;
   IF d->>'version' IS NULL OR (current_row->>'version')::integer <> (d->>'version')::integer THEN RAISE EXCEPTION 'version conflict' USING ERRCODE='40001'; END IF;
 END IF;
 IF action='transition' THEN
   SELECT * INTO target FROM sales_stages WHERE workspace_id=w AND id=(d->>'stage_id')::uuid AND process_id=(current_row->>'process_id')::uuid FOR SHARE;
   IF NOT FOUND OR target.id=(current_row->>'stage_id')::uuid THEN RAISE EXCEPTION 'invalid stage' USING ERRCODE='22023'; END IF;
   UPDATE sales_opportunities SET stage_id=target.id,version=version+1 WHERE workspace_id=w AND id=rid RETURNING to_jsonb(sales_opportunities.*) INTO result;
   IF target.task_title IS NOT NULL THEN
     generated := (d->>'task_id')::uuid;
     -- No owner/priority/date fallback: configuration must be complete and member still exists.
     IF num_nonnulls(target.task_assignee_id,target.task_priority,target.task_due_days)<>3 THEN RAISE EXCEPTION 'incomplete task rule' USING ERRCODE='23514'; END IF;
     INSERT INTO sales_tasks(workspace_id,id,title,opportunity_id,company_id,contact_id,assignee_id,priority,due_at,created_by)
     VALUES(w,generated,target.task_title,rid,(current_row->>'company_id')::uuid,(current_row->>'contact_id')::uuid,target.task_assignee_id,target.task_priority,now()+target.task_due_days*interval '24 hours',actor) RETURNING to_jsonb(sales_tasks.*) INTO generated_row;
     INSERT INTO sales_audit(workspace_id,actor_id,entity,entity_id,action,detail) VALUES(w,actor,'tasks',generated,'create',jsonb_build_object('opportunity_id',rid,'source','transition','after',generated_row));
   END IF;
   result := result || jsonb_build_object('generated_task_id',generated);
   INSERT INTO sales_idempotency(workspace_id,actor_id,key,fingerprint,result) VALUES(w,actor,(d->>'key')::uuid,fp,result);
 ELSIF action='delete' THEN
   EXECUTE format('DELETE FROM %I WHERE workspace_id=$1 AND id=$2',tbl) USING w,rid;
   result := jsonb_build_object('id',rid,'deleted',true);
 ELSE
   -- Identifiers come from both a fixed entity allowlist and a fixed column allowlist.
   -- Values are bound via jsonb_populate_record, never concatenated into SQL.
   cols := ''; vals := ''; updates := '';
   FOR k IN SELECT jsonb_object_keys(d - 'id' - 'version') LOOP
     IF NOT (k = ANY(CASE entity
       WHEN 'companies' THEN ARRAY['name','website','industry','email','phone','city','notes',
         'legal_name','account_type','rating','owner_id','parent_company_id','annual_revenue_cents','employees','billing_street','billing_zip','billing_city','billing_province','billing_country','shipping_street','shipping_zip','shipping_city','shipping_province','shipping_country','vat_number','tax_code','pec','sdi_code','description']
       WHEN 'contacts' THEN ARRAY['name','company_id','email','phone','role','linkedin_url','notes','marketing_consent','consent_at',
         'first_name','last_name','title','department','reports_to_id','owner_id','mobile','street','zip','city','province','country','birthdate','lead_source','preferred_language']
       WHEN 'leads' THEN ARRAY['title','company_id','contact_id']
       WHEN 'processes' THEN CASE WHEN action='create' THEN ARRAY['title','kind'] ELSE ARRAY['title'] END
       WHEN 'stages' THEN ARRAY['title','process_id','position','task_title','task_assignee_id','task_priority','task_due_days','probability']
       WHEN 'opportunities' THEN CASE WHEN action='create' THEN ARRAY['title','company_id','contact_id','process_id','stage_id','amount_cents','owner_id','expected_close','probability'] ELSE ARRAY['title','company_id','contact_id','amount_cents','owner_id','expected_close','probability','outcome','lost_reason'] END
       WHEN 'interactions' THEN ARRAY['title','kind','occurred_at','body','company_id','contact_id','opportunity_id']
       WHEN 'tasks' THEN ARRAY['title','company_id','contact_id','opportunity_id','process_id','stage_id','status','assignee_id','priority','due_at']
       WHEN 'tickets' THEN ARRAY['title','body','status','priority','channel','company_id','contact_id','assignee_id','due_at','resolution']
       WHEN 'segments' THEN ARRAY['name','filters'] END)) THEN RAISE EXCEPTION 'invalid field' USING ERRCODE='22023'; END IF;
     cols := cols || format(',%I',k); vals := vals || format(',x.%I',k); updates := updates || format('%I=x.%I,',k,k);
   END LOOP;
   IF action='create' THEN
     -- Author is always the authenticated actor, never a client value.
     IF entity IN ('companies','contacts','leads','opportunities','tasks','interactions','tickets','segments') THEN cols := cols || ',created_by'; vals := vals || format(',%s',actor); END IF;
     EXECUTE format('INSERT INTO %I (workspace_id,id%s) SELECT $1,$2%s FROM jsonb_populate_record(NULL::%I,$3) x RETURNING to_jsonb(%I.*)',tbl,cols,vals,tbl,tbl) INTO result USING w,rid,d;
   ELSE
     EXECUTE format('UPDATE %I t SET %s version=t.version+1 FROM jsonb_populate_record(NULL::%I,$3) x WHERE t.workspace_id=$1 AND t.id=$2 RETURNING to_jsonb(t.*)',tbl,updates,tbl) INTO result USING w,rid,d;
   END IF;
 END IF;
 INSERT INTO sales_audit(workspace_id,actor_id,entity,entity_id,action,detail) VALUES(w,actor,entity,rid,action,jsonb_build_object('before',current_row,'after',CASE WHEN action='delete' THEN NULL ELSE result END));
 RETURN result;
END;
$$;
COMMIT;
