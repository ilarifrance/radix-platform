-- CRM phase A (approved by Francesco 2026-10-16): full contact/company records, won/lost with reason,
-- forecast probability, interaction authors, workspace member management.
-- Apply once after 001-007 on the Preview database (radix-preview) only; production needs a separate OK.
-- Existing rows keep NULL for the new optional fields; created_at of existing rows is the migration time.
BEGIN;
ALTER TABLE sales_companies
 ADD COLUMN website text CHECK(length(website)<=300),
 ADD COLUMN industry text CHECK(length(industry)<=120),
 ADD COLUMN email text CHECK(length(email)<=254),
 ADD COLUMN phone text CHECK(length(phone)<=40),
 ADD COLUMN city text CHECK(length(city)<=120),
 ADD COLUMN notes text CHECK(length(notes)<=4000),
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN created_by integer REFERENCES users(id);
ALTER TABLE sales_contacts
 ADD COLUMN email text CHECK(length(email)<=254),
 ADD COLUMN phone text CHECK(length(phone)<=40),
 ADD COLUMN role text CHECK(length(role)<=120),
 ADD COLUMN linkedin_url text CHECK(length(linkedin_url)<=300),
 ADD COLUMN notes text CHECK(length(notes)<=4000),
 -- GDPR: explicit marketing consent, with the time it was recorded.
 ADD COLUMN marketing_consent boolean NOT NULL DEFAULT false,
 ADD COLUMN consent_at timestamptz CHECK(isfinite(consent_at)),
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN created_by integer REFERENCES users(id);
-- Default win probability per stage; an opportunity may override it.
ALTER TABLE sales_stages ADD COLUMN probability smallint CHECK(probability BETWEEN 0 AND 100);
ALTER TABLE sales_opportunities
 ADD COLUMN probability smallint CHECK(probability BETWEEN 0 AND 100),
 ADD COLUMN outcome text NOT NULL DEFAULT 'open' CHECK(outcome IN('open','won','lost')),
 ADD COLUMN lost_reason text CHECK(length(lost_reason)<=500),
 ADD COLUMN closed_at timestamptz,
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN created_by integer REFERENCES users(id),
 ADD CONSTRAINT sales_opportunity_lost_reason CHECK(outcome='lost' OR lost_reason IS NULL),
 ADD CONSTRAINT sales_opportunity_closed CHECK((outcome='open')=(closed_at IS NULL));
ALTER TABLE sales_leads ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN created_by integer REFERENCES users(id);
ALTER TABLE sales_tasks ADD COLUMN created_by integer REFERENCES users(id);
ALTER TABLE sales_interactions ADD COLUMN created_by integer REFERENCES users(id);
CREATE INDEX sales_opportunities_outcome ON sales_opportunities(workspace_id,outcome,closed_at);

-- closed_at follows the outcome; reopening clears the loss reason.
CREATE FUNCTION sales_opportunity_outcome() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.outcome='open' THEN NEW.closed_at:=NULL; NEW.lost_reason:=NULL;
 ELSIF TG_OP='INSERT' OR NEW.outcome IS DISTINCT FROM OLD.outcome THEN NEW.closed_at:=now(); END IF;
 IF NEW.outcome='won' THEN NEW.lost_reason:=NULL; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER sales_opportunity_outcome BEFORE INSERT OR UPDATE ON sales_opportunities FOR EACH ROW EXECUTE FUNCTION sales_opportunity_outcome();

-- Full versioned replacement of 004: wider allowlists and created_by from the authenticated actor.
CREATE OR REPLACE FUNCTION sales_command(w uuid, actor integer, entity text, action text, d jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public, pg_temp SET timezone = 'UTC' AS $$
#variable_conflict use_variable
DECLARE r text; tbl text; rid uuid; current_row jsonb; result jsonb; target sales_stages%ROWTYPE; prior sales_idempotency%ROWTYPE; fp jsonb; cols text; vals text; updates text; k text; generated uuid; generated_row jsonb;
BEGIN
 -- Shared membership lock prevents permission revocation racing a command.
 SELECT m.role INTO r FROM sales_memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=w AND m.user_id=actor FOR SHARE OF m,u;
 IF r IS NULL OR r NOT IN ('owner','admin','member') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF entity NOT IN ('companies','contacts','leads','opportunities','tasks','processes','stages','interactions') OR action NOT IN ('create','update','delete','transition') THEN RAISE EXCEPTION 'invalid command' USING ERRCODE='22023'; END IF;
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
       WHEN 'companies' THEN ARRAY['name','website','industry','email','phone','city','notes']
       WHEN 'contacts' THEN ARRAY['name','company_id','email','phone','role','linkedin_url','notes','marketing_consent','consent_at']
       WHEN 'leads' THEN ARRAY['title','company_id','contact_id']
       WHEN 'processes' THEN CASE WHEN action='create' THEN ARRAY['title','kind'] ELSE ARRAY['title'] END
       WHEN 'stages' THEN ARRAY['title','process_id','position','task_title','task_assignee_id','task_priority','task_due_days','probability']
       WHEN 'opportunities' THEN CASE WHEN action='create' THEN ARRAY['title','company_id','contact_id','process_id','stage_id','amount_cents','owner_id','expected_close','probability'] ELSE ARRAY['title','company_id','contact_id','amount_cents','owner_id','expected_close','probability','outcome','lost_reason'] END
       WHEN 'interactions' THEN ARRAY['title','kind','occurred_at','body','company_id','contact_id','opportunity_id']
       WHEN 'tasks' THEN ARRAY['title','company_id','contact_id','opportunity_id','process_id','stage_id','status','assignee_id','priority','due_at'] END)) THEN RAISE EXCEPTION 'invalid field' USING ERRCODE='22023'; END IF;
     cols := cols || format(',%I',k); vals := vals || format(',x.%I',k); updates := updates || format('%I=x.%I,',k,k);
   END LOOP;
   IF action='create' THEN
     -- Author is always the authenticated actor, never a client value.
     IF entity IN ('companies','contacts','leads','opportunities','tasks','interactions') THEN cols := cols || ',created_by'; vals := vals || format(',%s',actor); END IF;
     EXECUTE format('INSERT INTO %I (workspace_id,id%s) SELECT $1,$2%s FROM jsonb_populate_record(NULL::%I,$3) x RETURNING to_jsonb(%I.*)',tbl,cols,vals,tbl,tbl) INTO result USING w,rid,d;
   ELSE
     EXECUTE format('UPDATE %I t SET %s version=t.version+1 FROM jsonb_populate_record(NULL::%I,$3) x WHERE t.workspace_id=$1 AND t.id=$2 RETURNING to_jsonb(t.*)',tbl,updates,tbl) INTO result USING w,rid,d;
   END IF;
 END IF;
 INSERT INTO sales_audit(workspace_id,actor_id,entity,entity_id,action,detail) VALUES(w,actor,entity,rid,action,jsonb_build_object('before',current_row,'after',CASE WHEN action='delete' THEN NULL ELSE result END));
 RETURN result;
END;
$$;

-- Member management: owners/admins add an existing RADIX account by email, change roles, remove members.
-- Only an owner grants or removes 'owner'/'admin'; the last owner can never be removed or demoted.
CREATE FUNCTION sales_member_command(w uuid, actor integer, action text, d jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
#variable_conflict use_variable
DECLARE r text; target_id integer; target_role text; new_role text; owners integer; result jsonb;
BEGIN
 SELECT m.role INTO r FROM sales_memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=w AND m.user_id=actor FOR UPDATE OF m;
 IF r IS NULL OR r NOT IN ('owner','admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF action NOT IN ('add','update','remove') THEN RAISE EXCEPTION 'invalid command' USING ERRCODE='22023'; END IF;
 new_role := d->>'role';
 IF action IN ('add','update') AND (new_role IS NULL OR new_role NOT IN ('owner','admin','member','viewer')) THEN RAISE EXCEPTION 'invalid role' USING ERRCODE='22023'; END IF;
 IF new_role IN ('owner','admin') AND r<>'owner' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF action='add' THEN
   SELECT id INTO target_id FROM users WHERE lower(email)=lower(btrim(d->>'email'));
   IF target_id IS NULL THEN RAISE EXCEPTION 'unknown user' USING ERRCODE='P0002'; END IF;
   INSERT INTO sales_memberships(workspace_id,user_id,role) VALUES(w,target_id,new_role) ON CONFLICT DO NOTHING;
   IF NOT FOUND THEN RAISE EXCEPTION 'already member' USING ERRCODE='23505'; END IF;
 ELSE
   target_id := (d->>'user_id')::integer;
   SELECT role INTO target_role FROM sales_memberships WHERE workspace_id=w AND user_id=target_id FOR UPDATE;
   IF target_role IS NULL THEN RAISE EXCEPTION 'not found' USING ERRCODE='P0002'; END IF;
   IF target_role IN ('owner','admin') AND r<>'owner' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
   IF target_role='owner' AND (action='remove' OR new_role<>'owner') THEN
     SELECT count(*) INTO owners FROM sales_memberships WHERE workspace_id=w AND role='owner';
     IF owners<=1 THEN RAISE EXCEPTION 'last owner' USING ERRCODE='23514'; END IF;
   END IF;
   -- Removal fails (FK) while the member still owns opportunities or tasks: reassign them first.
   IF action='remove' THEN DELETE FROM sales_memberships WHERE workspace_id=w AND user_id=target_id;
   ELSE UPDATE sales_memberships SET role=new_role WHERE workspace_id=w AND user_id=target_id; END IF;
 END IF;
 SELECT jsonb_build_object('id',m.user_id,'name',u.name,'role',m.role) INTO result FROM sales_memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=w AND m.user_id=target_id;
 result := COALESCE(result,jsonb_build_object('id',target_id,'removed',true));
 INSERT INTO sales_audit(workspace_id,actor_id,entity,entity_id,action,detail) VALUES(w,actor,'members',w,action,jsonb_build_object('user_id',target_id,'before',target_role,'after',new_role));
 RETURN result;
END;
$$;
COMMIT;
