-- CRM support tickets and saved contact segments (approved by Francesco 2026-10-16 20:01).
-- Apply once after 001-008 on the Preview database (radix-preview) only; production needs a separate OK.
BEGIN;
CREATE TABLE sales_tickets (
 workspace_id uuid NOT NULL REFERENCES sales_workspaces(id), id uuid NOT NULL,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 200),
 body text NOT NULL DEFAULT '' CHECK(length(body)<=4000),
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','pending','resolved','closed')),
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN('low','normal','high','urgent')),
 channel text NOT NULL DEFAULT 'email' CHECK(channel IN('email','phone','chat','web','other')),
 company_id uuid, contact_id uuid, assignee_id integer,
 due_at timestamptz CHECK(isfinite(due_at)),
 resolution text CHECK(length(resolution)<=4000),
 resolved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by integer REFERENCES users(id), version integer NOT NULL DEFAULT 1,
 PRIMARY KEY(workspace_id,id),
 FOREIGN KEY(workspace_id,company_id) REFERENCES sales_companies(workspace_id,id),
 FOREIGN KEY(workspace_id,contact_id) REFERENCES sales_contacts(workspace_id,id),
 FOREIGN KEY(workspace_id,contact_id,company_id) REFERENCES sales_contacts(workspace_id,id,company_id),
 FOREIGN KEY(workspace_id,assignee_id) REFERENCES sales_memberships(workspace_id,user_id),
 CHECK((status IN('resolved','closed'))=(resolved_at IS NOT NULL)));
CREATE INDEX sales_tickets_status ON sales_tickets(workspace_id,status,due_at,id);
CREATE INDEX sales_tickets_company ON sales_tickets(workspace_id,company_id,id);
CREATE INDEX sales_tickets_contact ON sales_tickets(workspace_id,contact_id,id);
-- resolved_at follows the status; reopening clears it.
CREATE FUNCTION sales_ticket_status() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status IN('open','pending') THEN NEW.resolved_at:=NULL;
 ELSIF TG_OP='INSERT' OR OLD.status IN('open','pending') THEN NEW.resolved_at:=now(); END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END;
$$;
CREATE TRIGGER sales_ticket_status BEFORE INSERT OR UPDATE ON sales_tickets FOR EACH ROW EXECUTE FUNCTION sales_ticket_status();
-- Saved segments: named contact filters shared by the workspace. Filter keys are validated by the API.
CREATE TABLE sales_segments (
 workspace_id uuid NOT NULL REFERENCES sales_workspaces(id), id uuid NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 filters jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(filters)='object' AND length(filters::text)<=2000),
 created_at timestamptz NOT NULL DEFAULT now(), created_by integer REFERENCES users(id), version integer NOT NULL DEFAULT 1,
 PRIMARY KEY(workspace_id,id));
CREATE UNIQUE INDEX sales_segments_name ON sales_segments(workspace_id,lower(btrim(name)));

-- Full versioned replacement of 008: adds the tickets and segments entities.
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
       WHEN 'companies' THEN ARRAY['name','website','industry','email','phone','city','notes']
       WHEN 'contacts' THEN ARRAY['name','company_id','email','phone','role','linkedin_url','notes','marketing_consent','consent_at']
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
