'use strict';
const { randomUUID } = require('node:crypto');
const leadLists=require('./_lead_lists');
const leadContactJobs=require('./_lead_contact_jobs');
const growthProjects=require('./_lead_growth_projects');
const publicLookup=require('./_lead_public_lookup');
const providerStatus=require('./_lead_provider_client');
const providerCallback=require('./_lead_provider_callback');
const unsubscribe=require('./_sales_unsubscribe');
const clicks=require('./_sales_clicks');
const importToken=require('./_lead_import_token');
// Prodotti, Listini, Preventivi, Fatture (migration sales 013): own validator and atomic SQL command.
const docs=require('./_sales_documents');
// «Aggiungi campo» (migration sales 015): field definitions per workspace, values in «custom».
const customFields=require('./_sales_custom_fields');
// Salesforce-style account/contact fields and Italian fiscal data (migration sales 011, draft): one
// description shared with the browser (sales/crm-fields-core.js), validated again here.
const recordFields=require('../sales/crm-fields-core.js');
const fields = Object.freeze({companies:['name','website','industry','email','phone','city','notes',...recordFields.ADDED.companies,'custom'],contacts:['name','company_id','email','phone','role','linkedin_url','notes','marketing_consent','consent_at',...recordFields.ADDED.contacts,'custom'],leads:['title','company_id','contact_id','status','status_reason','source','owner_id','notes'],processes:['title','kind'],stages:['title','process_id','position','task_title','task_assignee_id','task_priority','task_due_days','probability'],opportunities:['title','company_id','contact_id','process_id','stage_id','amount_cents','owner_id','expected_close','probability','outcome','lost_reason'],tasks:['title','company_id','contact_id','opportunity_id','process_id','stage_id','status','assignee_id','priority','due_at'],interactions:['title','kind','occurred_at','body','company_id','contact_id','opportunity_id'],tickets:['title','body','status','priority','channel','company_id','contact_id','assignee_id','due_at','resolution'],segments:['name','filters']});
class SalesError extends Error { constructor(status,message){super(message);this.status=status;} }
function fail(status,message){throw new SalesError(status,message);}
// Reserved sales_segments rows: CRM settings that ride in ONE row per workspace (no new table), validated by the same
// rule the browser uses, written by owners/admins only, hidden from the contact segments list and read with ?subject=.
// «__regole__» filters={rules:[…]} (sales/crm-rules-core.js); «__sla__» filters={sla:{…}} (sales/crm-sla-core.js).
const rulesCore=require('../sales/crm-rules-core.js'),slaCore=require('../sales/crm-sla-core.js');
const RESERVED=Object.freeze({
 [rulesCore.RESERVED]:Object.freeze({key:'rules',error:v=>{const r=rulesCore.validateSet(v);return r.ok?null:r.error||'formato non previsto.'},invalid:'Regole non valide: ',what:'alle regole di automazione'}),
 [slaCore.RESERVED]:Object.freeze({key:'sla',error:v=>slaCore.error(v),invalid:'Scadenze SLA non valide: ',what:'alle scadenze SLA'})});
const RESERVED_SEGMENTS=Object.freeze(Object.keys(RESERVED));
const reservedByName=n=>typeof n==='string'&&Object.hasOwn(RESERVED,n.trim().toLowerCase())?n.trim().toLowerCase():null;
const reservedBySubject=s=>RESERVED_SEGMENTS.find(n=>RESERVED[n].key===s)||null;
const reservedByFilters=v=>object(v)&&RESERVED_SEGMENTS.find(n=>Object.hasOwn(v,RESERVED[n].key))||null;
const reservedFilters=v=>{const n=reservedByFilters(v);return !!n&&Object.keys(v).length===1&&!RESERVED[n].error(v[RESERVED[n].key])};
const reservedName=n=>fail(400,'Il nome «'+n+'» è riservato '+RESERVED[n].what+'.');
function uuid(v){return typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}
function object(v){return v && typeof v==='object' && !Array.isArray(v) && Object.getPrototypeOf(v)===Object.prototype;}
function timestamp(v){
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v))return false;
 const date=new Date(v);if(v.startsWith('0000-')||!Number.isFinite(date.getTime()))return false;
 return date.toISOString().slice(0,19)===v.slice(0,19);
}
// Calendar date, not an instant: no timezone conversion or inferred close time.
function calendarDate(v){return typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && timestamp(v+'T00:00:00Z');}
// Optional record fields (phase A): empty string clears them, as NULL does.
const TEXT_LIMITS=Object.freeze({status_reason:500,source:80,website:300,industry:120,email:254,phone:40,city:120,notes:4000,role:120,linkedin_url:300,lost_reason:500,resolution:4000});
// Saved segment filters: the same fields as the contact segment panel, nothing else.
// Lead lifecycle (012). «convertito» comes only from the convert action.
const LEAD_STATUSES=Object.freeze(['nuovo','contattato','qualificato','non_qualificato']);
const CONVERT_OPPORTUNITY=Object.freeze(['title','process_id','stage_id','amount_cents','owner_id','expected_close','probability']);
// «Converti»: {id,version,key,opportunity:{title,process_id,stage_id,...}|null}. The opportunity fields follow the create rules.
function convertCommand(workspace,d){
 if(Object.keys(d).some(k=>!['id','version','key','opportunity'].includes(k))||!uuid(d.id)||!Number.isInteger(d.version)||d.version<1||d.version>2147483646||!uuid(d.key)||d.opportunity===undefined)fail(400,'Conversione non valida.');
 const o=d.opportunity;if(o===null)return {workspace,entity:'leads',action:'convert',data:{id:d.id,version:d.version,key:d.key,opportunity:null}};
 if(!object(o)||Object.keys(o).some(k=>!CONVERT_OPPORTUNITY.includes(k)))fail(400,'Trattativa della conversione non valida.');
 if(typeof o.title!=='string'||!o.title.trim()||o.title.length>200)fail(400,'Titolo della trattativa obbligatorio: massimo 200 caratteri.');
 if(!uuid(o.process_id)||!uuid(o.stage_id))fail(400,'Scegli pipeline e fase della trattativa.');
 if(o.amount_cents!==undefined&&(!Number.isSafeInteger(o.amount_cents)||o.amount_cents<0||o.amount_cents>9000000000000))fail(400,'Importo non valido.');
 if(o.owner_id!==undefined&&o.owner_id!==null&&(!Number.isInteger(o.owner_id)||o.owner_id<1||o.owner_id>2147483647))fail(400,'Responsabile non valido.');
 if(o.expected_close!==undefined&&o.expected_close!==null&&!calendarDate(o.expected_close))fail(400,'Data chiusura prevista non valida: usa YYYY-MM-DD.');
 if(o.probability!==undefined&&o.probability!==null&&(!Number.isInteger(o.probability)||o.probability<0||o.probability>100))fail(400,'Probabilità tra 0 e 100.');
 return {workspace,entity:'leads',action:'convert',data:{id:d.id,version:d.version,key:d.key,opportunity_id:randomUUID(),opportunity:{...o,title:o.title.trim()}}};
}
const SEGMENT_FILTERS=Object.freeze({role:'text',industry:'text',city:'text',consent:['yes','no'],silent_days:'days',min_score:'score',clicked:['yes','no'],clicked_campaign:'text'});
function segmentFilters(v){
 if(!object(v)||Object.keys(v).some(k=>!Object.hasOwn(SEGMENT_FILTERS,k)))return false;
 return Object.entries(v).every(([k,x])=>{const t=SEGMENT_FILTERS[k];if(t==='text')return typeof x==='string'&&x.length<=80&&!/[\u0000-\u001f\u007f]/.test(x);if(t==='days')return Number.isInteger(x)&&x>=0&&x<=3650;if(t==='score')return Number.isInteger(x)&&x>=0&&x<=100;return t.includes(x)});
}
// One added field (011) → normalized value, or a 400 with the reason. Empty string or null clears it.
function addedField(entity,k,v,d){
 if(v===null||v==='')return null;
 const fd=recordFields.fieldOf(entity,k);
 if(fd.type==='member'){if(!Number.isInteger(v)||v<1||v>2147483647)fail(400,'Responsabile non valido.');return v;}
 if(fd.type==='money'){if(!Number.isSafeInteger(v)||v<0||v>recordFields.MAX_CENTS)fail(400,'Fatturato non valido: importo in centesimi, intero e non negativo.');return v;}
 if(fd.type==='int'){if(!Number.isInteger(v)||v<0||v>recordFields.MAX_EMPLOYEES)fail(400,'Dipendenti: un numero intero da 0 a 10.000.000.');return v;}
 if(typeof v!=='string')fail(400,fd.label+': valore non valido.');
 if((fd.type==='company'||fd.type==='contact')&&!uuid(v))fail(400,'Identificativo non valido.');
 const r=recordFields.parse(entity,k,v,{selfId:d.id});
 if(r.error)fail(400,r.error);
 return r.value;
}
function command(body){
 if(!object(body)||Object.keys(body).some(k=>!['workspace','entity','action','data'].includes(k)))fail(400,'Comando non valido.');
 const {workspace,entity,action}=body; let d=body.data;
 if(!uuid(workspace)||!Object.hasOwn(fields,entity)||!['create','update','delete','transition','convert'].includes(action)||!object(d))fail(400,'Comando non valido.');
 if(action==='convert'){if(entity!=='leads')fail(400,'Conversione non supportata.');return convertCommand(workspace,d);}
 let allowed=[...fields[entity]];
 if(action==='create'&&entity==='opportunities')allowed=allowed.filter(k=>!['outcome','lost_reason'].includes(k));
 if(action==='update'){if(entity==='opportunities')allowed=allowed.filter(k=>!['process_id','stage_id'].includes(k));if(entity==='processes')allowed=allowed.filter(k=>k!=='kind');allowed.push('id','version');}
 if(action==='delete')allowed=['id','version'];
 if(action==='transition'){if(entity!=='opportunities')fail(400,'Transizione non supportata.');allowed=['id','version','stage_id','key'];}
 if(Object.keys(d).some(k=>!allowed.includes(k)))fail(400,'Campo non consentito.');
 // Contacts: a missing display name is «Nome Cognome» (on create, or when the name is sent empty).
 if(entity==='contacts'&&['create','update'].includes(action)){
  const full=recordFields.displayName(typeof d.first_name==='string'?d.first_name:'',typeof d.last_name==='string'?d.last_name:'');
  const blank=d.name===undefined?action==='create':d.name===null||(typeof d.name==='string'&&!d.name.trim());
  if(blank&&full)d={...d,name:full};
 }
 const added=['companies','contacts'].includes(entity)?recordFields.ADDED[entity]:[];
 for(const [k,v] of Object.entries(d)){
   if(added.includes(k)){d={...d,[k]:addedField(entity,k,v,d)};continue;}
   if(k==='custom'){d={...d,custom:customFields.values(v)};continue;}
   if(k==='version'){if(!Number.isInteger(v)||v<1||v>2147483646)fail(400,'Versione non valida.');}
   else if(k==='expected_close'){if(v!==null&&!calendarDate(v))fail(400,'Data chiusura prevista non valida: usa YYYY-MM-DD.');}
   else if(['owner_id','assignee_id','task_assignee_id'].includes(k)){if(v!==null&&(!Number.isInteger(v)||v<1||v>2147483647))fail(400,'Assegnatario non valido.');}
   else if(['due_at','occurred_at'].includes(k)){if(v===null&&k==='due_at')continue;if(!timestamp(v))fail(400,'Usa un timestamp UTC valido con secondi e suffisso Z.');}
   else if(['priority','task_priority'].includes(k)){if(v===null&&k==='task_priority')continue;if(!['low','normal','high','urgent'].includes(v))fail(400,'Priorità non valida.');}
   else if(k==='task_due_days'){if(v!==null&&(!Number.isInteger(v)||v<0||v>3650))fail(400,'Intervallo scadenza non valido.');}
   else if(k==='body'){if(typeof v!=='string'||v.length>4000)fail(400,'Nota troppo lunga.');}
   else if(Object.hasOwn(TEXT_LIMITS,k)){if(v===null||v==='')continue;if(typeof v!=='string'||v.length>TEXT_LIMITS[k]||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))fail(400,'Testo troppo lungo o non valido.');if(k==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))fail(400,'Email non valida.');if(['website','linkedin_url'].includes(k)&&!/^https?:\/\/\S+$/i.test(v))fail(400,'Indirizzo web non valido: inizia con https://');}
   else if(k==='marketing_consent'){if(typeof v!=='boolean')fail(400,'Consenso non valido.');}
   else if(k==='consent_at'){if(v!==null&&!timestamp(v))fail(400,'Data consenso non valida.');}
   else if(k==='probability'){if(v!==null&&(!Number.isInteger(v)||v<0||v>100))fail(400,'Probabilità tra 0 e 100.');}
   else if(k==='outcome'){if(!['open','won','lost'].includes(v))fail(400,'Esito non valido.');}
   else if(k==='id'||k==='key'||k.endsWith('_id')){if(v===null && ['company_id','contact_id','opportunity_id'].includes(k))continue;if(v===null&&entity==='tasks'&&['process_id','stage_id'].includes(k))continue;if(!uuid(v))fail(400,'Identificativo non valido.');}
   else if(['name','title','task_title'].includes(k)){if(k==='task_title'&&v===null)continue;if(typeof v!=='string'||!v.trim()||v.length>200)fail(400,'Testo obbligatorio: massimo 200 caratteri.');}
   else if(k==='amount_cents'){if(!Number.isSafeInteger(v)||v<0||v>9000000000000)fail(400,'Importo non valido.');}
   else if(k==='position'){if(!Number.isInteger(v)||v<0||v>10000)fail(400,'Posizione non valida.');}
   else if(k==='status'&&entity==='leads'){if(!LEAD_STATUSES.includes(v))fail(400,v==='convertito'?'Un lead diventa «Convertito» solo con «Converti».':'Stato lead non valido.');}
   else if(k==='kind'&&!(entity==='interactions'?['note','call','meeting','email']:['opportunity','task']).includes(v))fail(400,'Tipo processo non valido.');
   else if(k==='status'&&!(entity==='tickets'?['open','pending','resolved','closed']:['todo','doing','done']).includes(v))fail(400,'Stato non valido.');
   else if(k==='channel'&&!['email','phone','chat','web','other'].includes(v))fail(400,'Canale non valido.');
   else if(k==='filters'){if(!reservedFilters(v)&&!segmentFilters(v)){const n=reservedByFilters(v);fail(400,n?RESERVED[n].invalid+(Object.keys(v).length===1&&RESERVED[n].error(v[RESERVED[n].key])||'formato non previsto.'):'Filtri del segmento non validi.')}}
 }
 if(action!=='create'&&(!d.id||!d.version))fail(400,'Identificativo e versione obbligatori.');
 if(action==='create'){
   const required=[['companies','contacts','segments'].includes(entity)?'name':'title'];if(entity==='segments')required.push('filters');
   if(entity==='interactions')required.push('kind','occurred_at');if(entity==='processes')required.push('kind');if(entity==='stages')required.push('process_id','position');if(entity==='opportunities')required.push('process_id','stage_id');
   if(required.some(k=>d[k]===undefined||d[k]===null))fail(400,'Campi obbligatori mancanti.');
 }
 // A reserved name and its filters go together: a segment cannot hold settings, a settings row cannot hold a segment.
 if(entity==='segments'&&action!=='delete'){const named=d.name!==undefined?reservedByName(d.name):null,held=reservedByFilters(d.filters);
  if((action==='create'||(d.name!==undefined&&d.filters!==undefined))&&named!==held)reservedName(named||held);}
 if(action==='update'&&Object.keys(d).length===2)fail(400,'Nessuna modifica.');
 if(d.outcome==='lost'&&(typeof d.lost_reason!=='string'||!d.lost_reason.trim()))fail(400,'Indica il motivo della perdita.');
 if(d.lost_reason&&Object.hasOwn(d,'outcome')&&d.outcome!=='lost')fail(400,'Il motivo vale solo per le trattative perse.');
 d={...d};for(const k of Object.keys(TEXT_LIMITS))if(d[k]==='')d[k]=null;
 if(entity==='tasks'&&((Object.hasOwn(d,'process_id')!==Object.hasOwn(d,'stage_id'))||(Object.hasOwn(d,'process_id')&&((d.process_id===null)!==(d.stage_id===null)))))fail(400,'Processo e fase devono essere coerenti.');
 if(action==='transition'&&(!d.key||!d.stage_id))fail(400,'Fase e chiave idempotenza obbligatorie.');
 d={...d};if(action==='create')d.id=randomUUID();if(action==='transition')d.task_id=randomUUID();
 return {workspace,entity,action,data:d};
}
// Workspace members (phase A): owners/admins add an existing RADIX account by email, change roles, remove.
function memberCommand(body){
 if(!object(body)||Object.keys(body).some(k=>!['workspace','entity','action','data'].includes(k))||body.entity!=='members'||!uuid(body.workspace)||!['add','update','remove'].includes(body.action)||!object(body.data))fail(400,'Comando membri non valido.');
 const d=body.data,keys=Object.keys(d).sort().join(',');
 const roles=['owner','admin','member','viewer'];
 if(body.action==='add'){if(keys!=='email,role'||typeof d.email!=='string'||d.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())||!roles.includes(d.role))fail(400,'Indica email e ruolo validi.');}
 else if(body.action==='update'){if(keys!=='role,user_id'||!Number.isInteger(d.user_id)||d.user_id<1||!roles.includes(d.role))fail(400,'Membro o ruolo non validi.');}
 else if(keys!=='user_id'||!Number.isInteger(d.user_id)||d.user_id<1)fail(400,'Membro non valido.');
 return {workspace:body.workspace,entity:'members',action:body.action,data:{...d,...(d.email?{email:d.email.trim()}:{})}};
}
// Reserved rows: only owners and admins write them, and an update keeps each row what it is (a segment stays a segment).
async function reservedGuard(store,c,role){
 const d=c.data,held=reservedByFilters(d.filters);let row=c.action==='create'?held:null;
 if(c.action!=='create'){const r=await store.sql('SELECT name FROM sales_segments WHERE workspace_id=$1 AND id=$2',[c.workspace,d.id]);
  row=r[0]?reservedByName(r[0].name):null;
  if(c.action==='update'&&r[0]){const bad=(d.filters!==undefined&&held!==row)?held||row:(d.name!==undefined&&reservedByName(d.name)!==row)?reservedByName(d.name)||row:null;if(bad)reservedName(bad);}}
 if(row&&!['owner','admin'].includes(role))fail(403,'Solo owner e admin possono modificare '+RESERVED[row].what.replace(/^alle /,'le ')+'.');
}
function createHandler({getSessionUser,getStore}){
 return async function(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 try{
   if(req.method==='POST'&&(req.headers?.['x-radix-provider-token']!==undefined||req.query?.job!==undefined)){
     const result=await providerCallback.receive(req,getStore);
     return res.status(200).json(result);
   }
   // Public unsubscribe link from a campaign email: no session, the signed token is the permission.
   if(req.query?.unsubscribe!==undefined)return await unsubscribe.handle(req,res,{getSql:()=>getStore().sql,secret:unsubscribe.secretOf(process.env)});
   // Public tracked link from a campaign email: counts the click, then redirects where the email pointed.
   if(req.query?.click!==undefined)return await clicks.handle(req,res,{getSql:()=>getStore().sql,secret:unsubscribe.secretOf(process.env)});
   // Chrome extension «Importa in RADIX»: its own scoped token, never the session cookie.
   if(importToken.bearer(req)!==undefined)return await importToken.handle(req,res,{getStore,secret:process.env.JWT_SECRET});
   if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');fail(405,'Metodo non consentito.');}
   let user;try{user=getSessionUser(req);}catch{user=null;}
   if(!user||!Number.isInteger(user.uid)||user.uid<1||user.uid>2147483647)fail(401,'Accedi con il tuo account RADIX.');
   if(req.method==='POST'){
     if(req.headers['x-radix-sales']!=='1'||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')||req.headers['sec-fetch-site']==='cross-site')fail(403,'Richiesta non consentita.');
   }
   let c;
   if(req.method==='POST'){
     let body=req.body;if(typeof body==='string'){if(Buffer.byteLength(body)>200000)fail(413,'Richiesta troppo grande.');try{body=JSON.parse(body);}catch{fail(400,'JSON non valido.');}}
     if(Buffer.byteLength(JSON.stringify(body)||'')>(['lead_lists','lead_contact_jobs'].includes(body?.entity)?1700000:['lead_growth_projects','documents'].includes(body?.entity)?150000:16384))fail(413,'Richiesta troppo grande.');if(body?.entity==='lead_provider_status'){
       if(!object(body)||Object.keys(body).some(k=>!['workspace','entity','action','data'].includes(k))||body.action!=='test'||!uuid(body.workspace)||!object(body.data)||Object.keys(body.data).length)fail(400,'Verifica provider non valida.');
       c={workspace:body.workspace,entity:'lead_provider_status',data:{}};
     }else if(body?.entity==='lead_public_lookup'){
       if(!object(body)||Object.keys(body).some(k=>!['workspace','entity','action','data'].includes(k))||body.action!=='suggest'||!uuid(body.workspace)||!object(body.data)||Object.keys(body.data).some(k=>!['name','domain'].includes(k)))fail(400,'Richiesta ricerca pubblica non valida.');
       c={workspace:body.workspace,entity:'lead_public_lookup',data:body.data};
     }else if(body?.entity==='lead_import_token'){
       if(!object(body)||Object.keys(body).some(k=>!['workspace','entity','action','data'].includes(k))||body.action!=='create'||!uuid(body.workspace)||!object(body.data)||Object.keys(body.data).length)fail(400,'Richiesta collegamento estensione non valida.');
       c={workspace:body.workspace,entity:'lead_import_token',data:{}};
     }else if(body?.entity==='unsubscribe_links'){
       const ids=body?.data?.contacts,d=body?.data||{};
       if(!object(body)||Object.keys(body).some(k=>!['workspace','entity','action','data'].includes(k))||body.action!=='create'||!uuid(body.workspace)||!object(body.data)||Object.keys(body.data).some(k=>!['contacts','campaign','urls'].includes(k))||!Array.isArray(ids)||!ids.length||ids.length>300||!ids.every(uuid))fail(400,'Richiesta link di disiscrizione non valida (massimo 300 contatti).');
       // Optional tracked links: up to 10 distinct urls of the email, signed per contact.
       if(d.urls!==undefined&&(!Array.isArray(d.urls)||d.urls.length>10||!d.urls.every(clicks.validUrl)||!clicks.validCampaign(d.campaign)))fail(400,'Link tracciati non validi: massimo 10 indirizzi http(s) e un nome campagna fino a 80 caratteri.');
       c={workspace:body.workspace,entity:'unsubscribe_links',data:{contacts:[...new Set(ids)],...(d.urls?.length?{campaign:d.campaign.trim(),urls:[...new Set(d.urls)]}:{})}};
     }else if(body?.entity==='custom_fields')c={...customFields.command(body),entity:'custom_fields',customFields:true};
     else if(docs.ENTITIES.includes(body?.entity))c={...docs.command(body),documents:true};
     else c=body?.entity==='members'?memberCommand(body):body?.entity==='lead_growth_projects'?growthProjects.command(body):body?.entity==='lead_contact_jobs'?leadContactJobs.command(body):body?.entity==='lead_lists'?leadLists.command(body):command(body);
   }else{
     const q=req.query||{};
     if(q.entity==='custom_fields'){if(Object.keys(q).some(k=>!['entity','workspace','offset'].includes(k))||(q.offset!==undefined&&q.offset!=='0')||!uuid(q.workspace))fail(400,'Parametri campi non validi.');c={workspace:q.workspace,entity:'custom_fields',customFields:true};}
     else if(docs.READS.includes(q.entity))c={...docs.query(q),documents:true};
     else{if(Object.keys(q).some(k=>!['entity','workspace','offset','subject','id','search','due'].includes(k)&&!(k==='report'&&q.entity==='email_clicks')))fail(400,'Parametro non consentito.');
     if(q.search!==undefined && (!['companies','contacts'].includes(q.entity)||typeof q.search!=='string'||q.search.length>200||/[\u0000-\u001f\u007f]/.test(q.search)))fail(400,'Ricerca non valida: massimo 200 caratteri per aziende o contatti.');
     if(q.due!==undefined && (q.entity!=='tasks'||!['all','overdue','upcoming','unscheduled'].includes(q.due)))fail(400,'Filtro scadenza non valido.');
     if(q.entity==='email_clicks'){
       if(Object.keys(q).some(k=>!['entity','workspace','offset','report'].includes(k))||!uuid(q.workspace)||(q.report!==undefined&&q.report!=='campaigns'))fail(400,'Parametri clic non validi.');
       const store=getStore(),m=await store.membership(q.workspace,user.uid);if(!m||!['owner','admin','member','viewer'].includes(m.role))fail(403,'Membership esplicita richiesta per questo workspace.');
       // report=campaigns adds the rows of the «Report campagna» (sends, unsubscribe stamps, later contacts, opportunities).
       if(q.report==='campaigns'){const [base,data]=await Promise.all([clicks.report(store.sql,q.workspace),clicks.campaignData(store.sql,q.workspace)]);return res.status(200).json({...base,report:data});}
       return res.status(200).json(await clicks.report(store.sql,q.workspace));
     }
     if(q.entity==='workspaces'){const store=getStore();return res.status(200).json({rows:await store.workspaces(user.uid)});}
     if(q.entity==='lead_workspaces'){
       if(Object.keys(q).some(k=>k!=='entity'))fail(400,'Parametri archivio non validi.');
       const store=getStore();return res.status(200).json({rows:await store.leadLists.workspaces(user.uid)});
     }
     if(!uuid(q.workspace)||(!Object.hasOwn(fields,q.entity)&&!['dashboard','members','customer360','export','lead_lists','lead_contact_jobs','lead_growth_projects','lead_provider_status'].includes(q.entity)))fail(400,'Workspace o risorsa non validi.');
     const offset=q.offset===undefined?0:Number(q.offset);if(!Number.isSafeInteger(offset)||offset<0||offset>1000000||Array.isArray(q.offset))fail(400,'Pagina non valida.');
     if(q.entity==='customer360'){if(!['companies','contacts','opportunities'].includes(q.subject)||!uuid(q.id))fail(400,'Cliente non valido.');}
     else if(q.entity==='export'){if(!['companies','contacts'].includes(q.subject)||q.id!==undefined)fail(400,'Esportazione non valida.');}
     else if(q.entity==='segments'&&q.subject!==undefined){if(!reservedBySubject(q.subject)||q.id!==undefined||offset!==0)fail(400,'Filtro non consentito.');}
     else if(q.subject!==undefined||(q.id!==undefined&&(!['lead_lists','lead_contact_jobs','lead_growth_projects'].includes(q.entity)||!uuid(q.id))))fail(400,'Filtro non consentito.');
     c={workspace:q.workspace,entity:q.entity,offset,...(q.due!==undefined?{due:q.due}:{}),...(q.search!==undefined?{search:q.search.trim()}:{}),...(q.entity==='customer360'?{subject:q.subject,id:q.id}:{}),...(q.entity==='export'?{subject:q.subject}:{}),...(q.entity==='segments'&&q.subject!==undefined?{reserved:reservedBySubject(q.subject)}:{}),...(['lead_lists','lead_contact_jobs','lead_growth_projects'].includes(q.entity)&&q.id!==undefined?{id:q.id}:{})};}
   }
   const store=getStore();const membership=await (['lead_lists','lead_contact_jobs','lead_growth_projects','lead_public_lookup','lead_provider_status','lead_import_token'].includes(c.entity)?store.leadLists.membership(c.workspace,user.uid):store.membership(c.workspace,user.uid));
   if(!membership||!['owner','admin','member','viewer'].includes(membership.role))fail(403,'Membership esplicita richiesta per questo workspace.');
   if(c.entity==='lead_provider_status'){
     if(req.method==='GET')return res.status(200).json(providerStatus.status());
     if(!['owner','admin'].includes(membership.role))fail(403,'Solo admin e owner possono verificare la connessione API.');
     return res.status(200).json(await providerStatus.verify());
   }
   if(req.method==='POST'&&c.entity==='lead_public_lookup'){
     const result=await publicLookup.lookup(c.data);
     return res.status(200).json(result);
   }
   if(req.method==='POST'){
     if(!['owner','admin','member'].includes(membership.role)||(['processes','stages'].includes(c.entity)&&!['owner','admin'].includes(membership.role)))fail(403,'Permessi insufficienti.');
     if(c.entity==='segments')await reservedGuard(store,c,membership.role);
     if(c.customFields)return res.status(200).json({rows:[await store.customFields.command(c,user.uid)]});
     if(c.documents){if(c.entity!=='documents'&&!['owner','admin'].includes(membership.role))fail(403,'Catalogo, listini e intestazione si modificano solo da owner o admin.');return res.status(200).json({rows:[await store.documents.command(c,user.uid)]});}
     if(c.entity==='lead_import_token')return res.status(200).json(importToken.sign({uid:user.uid,workspace:c.workspace},process.env.JWT_SECRET));
     if(c.entity==='unsubscribe_links'){const secret=unsubscribe.secretOf(process.env);return res.status(200).json({links:await unsubscribe.links(store.sql,c.workspace,c.data.contacts,secret),...(c.data.urls?{clicks:await clicks.links(store.sql,c.workspace,c.data.contacts,c.data.campaign,c.data.urls,secret),urls:c.data.urls}:{})})}
     return res.status(200).json({rows:[await (c.entity==='lead_lists'?store.leadLists.command(c,user.uid):c.entity==='lead_contact_jobs'?store.leadContactJobs.command(c,user.uid):c.entity==='lead_growth_projects'?store.growthProjects.command(c,user.uid):c.entity==='members'?store.memberCommand(c,user.uid):store.command(c,user.uid))]});
   }
   if(c.customFields)return res.status(200).json({rows:await store.customFields.read(c,user.uid)});
   if(c.documents)return res.status(200).json({rows:await store.documents.read(c,user.uid),limit:500,offset:c.offset});
   return res.status(200).json({rows:await (c.entity==='lead_lists'?store.leadLists.read(c,user.uid):c.entity==='lead_contact_jobs'?store.leadContactJobs.read(c,user.uid):c.entity==='lead_growth_projects'?store.growthProjects.read(c,user.uid):store.read(c,user.uid)),limit:100,offset:c.offset});
 }catch(e){
   if(e.code==='22023'&&e.message==='invalid field')return res.status(400).json({error:'Campi non ancora disponibili in questo archivio: serve l’ultima migrazione sales (da approvare). Gli altri campi si salvano lasciando vuoti quelli nuovi.'});
   if(e.code==='23514'&&e.message==='already converted')return res.status(409).json({error:'Questo lead è già stato convertito: ricarica i dati.'});
   const codes={'42P01':[503,'Archivio CRM non aggiornato: applica le migrazioni sales 005-010 a questo database.'],'22007':[400,'Timestamp non valido.'],'22008':[400,'Timestamp fuori intervallo.'],'42501':[403,'Permessi insufficienti.'],'P0002':[404,'Record non trovato.'],'40001':[409,'Conflitto: ricarica i dati o riusa la stessa chiave per riprovare.'],'40P01':[409,'Concorrenza: riprova la richiesta.'],'23503':[409,'Relazione non valida o record ancora collegato.'],'23505':[409,'Record o posizione già esistente.'],'23514':[400,'Dati non validi.'],'23502':[400,'Campi obbligatori mancanti.'],'22023':[400,'Comando non valido.'],'22P02':[400,'Formato non valido.']};
   const mapped=codes[e.code];res.status(e.status||mapped?.[0]||503).json({error:e.status?e.message:mapped?.[1]||'Sales non disponibile. Verificare dipendenza Neon, configurazione e migrazioni manuali in ambiente isolato.'});
 }
 };
}
module.exports={createHandler,command,LEAD_STATUSES,memberCommand,segmentFilters,RESERVED_SEGMENTS,uuid,fields,timestamp,calendarDate};
