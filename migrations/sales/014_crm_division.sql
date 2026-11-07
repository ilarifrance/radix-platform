-- CRM: «Dipartimento» on Aziende and Contatti: which client company / department of the user the record
-- belongs to (one CRM, several companies followed). Free text with suggestions in the UI, filterable in the lists.
-- Apply after 001-012, first on Neon radix-preview; production only with the owner's OK.
-- Idempotent: ADD COLUMN IF NOT EXISTS; sales_command is a full versioned replacement of 012.
BEGIN;
ALTER TABLE sales_companies ADD COLUMN IF NOT EXISTS division text CHECK(length(division)<=120);
ALTER TABLE sales_contacts ADD COLUMN IF NOT EXISTS division text CHECK(length(division)<=120);
CREATE INDEX IF NOT EXISTS sales_companies_division ON sales_companies(workspace_id,lower(division)) WHERE division IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_contacts_division ON sales_contacts(workspace_id,lower(division)) WHERE division IS NOT NULL;

-- Full versioned replacement of 012: the same function, plus «division» on companies and contacts.
CREATE OR REPLACE FUNCTION sales_command(w uuid, actor integer, entity text, action text, d jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public, pg_temp SET timezone = 'UTC' AS $$
#variable_conflict use_variable
DECLARE r text; tbl text; rid uuid; current_row jsonb; result jsonb; target sales_stages%ROWTYPE; prior sales_idempotency%ROWTYPE; fp jsonb; opp jsonb; opp_row jsonb; cols text; vals text; updates text; k text; generated uuid; generated_row jsonb;
BEGIN
 -- Shared membership lock prevents permission revocation racing a command.
 SELECT m.role INTO r FROM sales_memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=w AND m.user_id=actor FOR SHARE OF m,u;
 IF r IS NULL OR r NOT IN ('owner','admin','member') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF entity NOT IN ('companies','contacts','leads','opportunities','tasks','processes','stages','interactions','tickets','segments') OR action NOT IN ('create','update','delete','transition','convert') THEN RAISE EXCEPTION 'invalid command' USING ERRCODE='22023'; END IF;
 IF entity IN ('processes','stages') AND r NOT IN ('owner','admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 tbl := 'sales_' || entity;
 rid := (d->>'id')::uuid;
 -- Leads: «convertito» is reached only through the convert action, never set by hand.
 IF entity='leads' AND action IN ('create','update') AND d->>'status'='convertito' THEN RAISE EXCEPTION 'invalid lead status' USING ERRCODE='22023'; END IF;
 IF action='convert' AND (entity <> 'leads' OR d->>'key' IS NULL OR COALESCE(jsonb_typeof(d->'opportunity'),'missing') NOT IN ('object','null') OR (jsonb_typeof(d->'opportunity')='object' AND d->>'opportunity_id' IS NULL)) THEN
   RAISE EXCEPTION 'invalid conversion' USING ERRCODE='22023';
 END IF;
 IF action IN ('transition','convert') THEN
   IF action='transition' AND (d->>'key' IS NULL OR d->>'task_id' IS NULL OR d->>'stage_id' IS NULL) THEN RAISE EXCEPTION 'incomplete transition' USING ERRCODE='22023'; END IF;
   IF action='transition' AND entity <> 'opportunities' THEN RAISE EXCEPTION 'invalid transition' USING ERRCODE='22023'; END IF;
   fp := CASE WHEN action='transition' THEN jsonb_build_object('entity',entity,'id',rid,'version',d->'version','stage_id',d->'stage_id')
     ELSE jsonb_build_object('entity',entity,'action',action,'id',rid,'version',d->'version','opportunity',d->'opportunity') END;
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
   -- A converted lead keeps its state: only its other fields can change.
   IF entity='leads' AND action='update' AND current_row->>'status'='convertito' AND d ? 'status' THEN RAISE EXCEPTION 'already converted' USING ERRCODE='23514'; END IF;
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
 ELSIF action='convert' THEN
   -- Lead → opportunity in one transaction: the opportunity keeps the lead's company and contact,
   -- the lead is marked «convertito» and points at it. Without an opportunity the lead is only marked.
   IF current_row->>'status'='convertito' THEN RAISE EXCEPTION 'already converted' USING ERRCODE='23514'; END IF;
   opp := d->'opportunity';
   IF jsonb_typeof(opp)='object' THEN
     IF EXISTS(SELECT 1 FROM jsonb_object_keys(opp) j WHERE j NOT IN ('title','process_id','stage_id','amount_cents','owner_id','expected_close','probability')) THEN RAISE EXCEPTION 'invalid field' USING ERRCODE='22023'; END IF;
     INSERT INTO sales_opportunities(workspace_id,id,title,company_id,contact_id,process_id,stage_id,amount_cents,owner_id,expected_close,probability,created_by)
     SELECT w,(d->>'opportunity_id')::uuid,x.title,(current_row->>'company_id')::uuid,(current_row->>'contact_id')::uuid,x.process_id,x.stage_id,COALESCE(x.amount_cents,0),x.owner_id,x.expected_close,x.probability,actor
     FROM jsonb_populate_record(NULL::sales_opportunities,opp) x RETURNING to_jsonb(sales_opportunities.*) INTO opp_row;
     INSERT INTO sales_audit(workspace_id,actor_id,entity,entity_id,action,detail) VALUES(w,actor,'opportunities',(opp_row->>'id')::uuid,'create',jsonb_build_object('lead_id',rid,'source','convert','after',opp_row));
   END IF;
   UPDATE sales_leads SET status='convertito',status_reason=NULL,converted_at=now(),converted_by=actor,converted_opportunity_id=(opp_row->>'id')::uuid,version=version+1
    WHERE workspace_id=w AND id=rid RETURNING to_jsonb(sales_leads.*) INTO result;
   result := result || jsonb_build_object('opportunity',opp_row);
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
         'legal_name','account_type','rating','owner_id','parent_company_id','annual_revenue_cents','employees','billing_street','billing_zip','billing_city','billing_province','billing_country','shipping_street','shipping_zip','shipping_city','shipping_province','shipping_country','vat_number','tax_code','pec','sdi_code','description','division']
       WHEN 'contacts' THEN ARRAY['name','company_id','email','phone','role','linkedin_url','notes','marketing_consent','consent_at',
         'first_name','last_name','title','department','reports_to_id','owner_id','mobile','street','zip','city','province','country','birthdate','lead_source','preferred_language','division']
       WHEN 'leads' THEN ARRAY['title','company_id','contact_id','status','status_reason','source','owner_id','notes']
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
