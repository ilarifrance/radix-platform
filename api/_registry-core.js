'use strict';
/* RADIX shared registry: validation, schema and fingerprints for clients, projects,
   project documents, approvals and activity. Pure functions only; no DB or network here. */
const crypto=require('crypto');

const CLIENT_STATUSES=Object.freeze(['prospect','active','paused','archived']);
const PROJECT_KINDS=Object.freeze(['agency','brand','internal','personal']);
const PROJECT_STATUSES=Object.freeze(['draft','active','paused','done','archived']);
// One JSON document per project and module. PED and PM get their own tables in F3/F4;
// until then their whole state lives here, shared by the team and versioned.
const MODULES=Object.freeze(['agency-workspace','agency-operations','editorial','pm']);
const SUBJECT_TYPES=Object.freeze(['strategy','ped-plan','content','agency-task','pm-task']);
const DECISIONS=Object.freeze({approve:'approved',revise:'needs_revision',reject:'rejected'});
const MAX_DOCUMENT_BYTES=1500000;

const SCHEMA=Object.freeze([
`CREATE TABLE IF NOT EXISTS rx_clients (
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
)`,
`CREATE TABLE IF NOT EXISTS rx_projects (
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
)`,
`CREATE INDEX IF NOT EXISTS rx_projects_client_idx ON rx_projects(client_id, updated_at DESC)`,
`CREATE TABLE IF NOT EXISTS rx_documents (
 project_id text NOT NULL REFERENCES rx_projects(id) ON DELETE CASCADE,
 module text NOT NULL CHECK (module IN ('agency-workspace','agency-operations','editorial','pm')),
 data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object' AND octet_length(data::text) <= 1500000),
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 updated_by integer REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (project_id, module)
)`,
`CREATE TABLE IF NOT EXISTS rx_approvals (
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
)`,
`CREATE INDEX IF NOT EXISTS rx_approvals_subject_idx ON rx_approvals(project_id, subject_type, subject_id, requested_at DESC)`,
`CREATE TABLE IF NOT EXISTS rx_activity (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 project_id text,
 actor_id integer REFERENCES users(id),
 action text NOT NULL CHECK (length(action) BETWEEN 3 AND 60),
 subject text NOT NULL DEFAULT '' CHECK (length(subject) <= 160),
 detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 at timestamptz NOT NULL DEFAULT now()
)`,
`CREATE INDEX IF NOT EXISTS rx_activity_project_idx ON rx_activity(project_id, id DESC)`
]);

class InputError extends Error{}
const fail=message=>{throw new InputError(message)};
const clean=(value,max)=>String(value==null?'':value).trim().slice(0,max);
const isObject=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const CLIENT_ID=/^cl-[a-zA-Z0-9-]{6,80}$/;
const PROJECT_ID=/^[a-z0-9][a-z0-9-]{1,79}$/;
const validClientId=id=>CLIENT_ID.test(String(id||''));
const validProjectId=id=>PROJECT_ID.test(String(id||''));

function newClientId(){return 'cl-'+crypto.randomUUID()}
function newProjectId(name){
 const slug=clean(name,200).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40);
 return (slug.length>=2?slug+'-':'prj-')+crypto.randomUUID().slice(0,8);
}

function client(input,{partial=false}={}){
 if(!isObject(input))fail('Dati cliente non validi');
 const out={};
 if(!partial||'name' in input){out.name=clean(input.name,120);if(out.name.length<2)fail('Inserisci un nome cliente di almeno 2 caratteri')}
 if(!partial||'status' in input){out.status=clean(input.status,20)||'prospect';if(!CLIENT_STATUSES.includes(out.status))fail('Stato cliente non valido')}
 for(const [k,max] of [['sector',100],['manager',100],['goal',500],['notes',800]])if(!partial||k in input)out[k]=clean(input[k],max);
 return out;
}

function project(input,{partial=false}={}){
 if(!isObject(input))fail('Dati progetto non validi');
 const out={};
 if(!partial||'name' in input){out.name=clean(input.name,120);if(out.name.length<2)fail('Inserisci un nome progetto di almeno 2 caratteri')}
 if(!partial||'clientId' in input){out.clientId=clean(input.clientId,90)||null;if(out.clientId&&!validClientId(out.clientId))fail('Cliente non valido')}
 if(!partial||'kind' in input){out.kind=clean(input.kind,20)||'agency';if(!PROJECT_KINDS.includes(out.kind))fail('Tipo progetto non valido')}
 if(!partial||'status' in input){out.status=clean(input.status,20)||'active';if(!PROJECT_STATUSES.includes(out.status))fail('Stato progetto non valido')}
 if(!partial||'summary' in input)out.summary=clean(input.summary,2000);
 if(!partial||'profile' in input){
  out.profile=input.profile==null?{}:input.profile;
  if(!isObject(out.profile))fail('Profilo progetto non valido');
  if(Buffer.byteLength(JSON.stringify(out.profile))>60000)fail('Profilo progetto troppo grande');
 }
 return out;
}

function documentPayload(input){
 if(!isObject(input))fail('Documento non valido');
 const projectId=clean(input.projectId,80),module=clean(input.module,40);
 if(!validProjectId(projectId))fail('Progetto non valido');
 if(!MODULES.includes(module))fail('Modulo non valido');
 const revision=Number(input.revision);
 if(!Number.isSafeInteger(revision)||revision<0)fail('Versione documento richiesta');
 if(!isObject(input.data))fail('Contenuto documento non valido');
 if(Buffer.byteLength(JSON.stringify(input.data))>MAX_DOCUMENT_BYTES)fail('Documento troppo grande');
 return {projectId,module,revision,data:input.data};
}

// Key order never changes the fingerprint; any change to the content does.
function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(isObject(value))return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 return JSON.stringify(value===undefined?null:value);
}
function fingerprint(content){
 if(content===undefined)fail('Contenuto da approvare richiesto');
 return crypto.createHash('sha256').update(canonical(content)).digest('hex');
}

function approvalRequest(input,userId){
 if(!isObject(input))fail('Richiesta di approvazione non valida');
 const projectId=clean(input.projectId,80),subjectType=clean(input.subjectType,30),subjectId=clean(input.subjectId,120);
 if(!validProjectId(projectId))fail('Progetto non valido');
 if(!SUBJECT_TYPES.includes(subjectType))fail('Tipo di elemento non valido');
 if(!subjectId)fail('Elemento da approvare richiesto');
 // Agents may ask for approval on work they produced; only a signed-in person can decide.
 const agent=clean(input.agentId,60);
 if(agent&&!/^[a-z0-9-]{1,60}$/.test(agent))fail('Agente non valido');
 return {projectId,subjectType,subjectId,summary:clean(input.summary,300),fingerprint:fingerprint(input.content),requestedBy:agent?'agent:'+agent:'user:'+Number(userId)};
}

function approvalDecision(input){
 if(!isObject(input))fail('Decisione non valida');
 const id=clean(input.id,40);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))fail('Approvazione non valida');
 const decision=clean(input.decision,20);
 if(!Object.prototype.hasOwnProperty.call(DECISIONS,decision))fail('Decisione non valida');
 const note=clean(input.note,1000);
 if(decision!=='approve'&&note.length<3)fail('Scrivi una nota per chiedere modifiche o rifiutare');
 return {id,decision,state:DECISIONS[decision],note,fingerprint:fingerprint(input.content)};
}

// Approved only while the stored fingerprint still matches the current content.
function approvalStatus(record,content){
 if(!record)return 'none';
 if(record.state!=='approved')return record.state;
 return record.fingerprint===fingerprint(content)?'approved':'stale';
}

module.exports={CLIENT_STATUSES,PROJECT_KINDS,PROJECT_STATUSES,MODULES,SUBJECT_TYPES,DECISIONS,MAX_DOCUMENT_BYTES,SCHEMA,
 InputError,clean,validClientId,validProjectId,newClientId,newProjectId,client,project,documentPayload,canonical,fingerprint,
 approvalRequest,approvalDecision,approvalStatus};
