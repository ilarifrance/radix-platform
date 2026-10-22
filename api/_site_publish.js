'use strict';
/* /api/integrations/site-publish — «Metti online il sito» of the Studio Sito (lib/site-studio.js) on Vercel, our hosting.
   One Vercel project per RADIX project (radix-site-<slug>), one file (index.html), production target. Needs a RADIX
   session and an existing project. Env: VERCEL_SITES_TOKEN (required), VERCEL_SITES_TEAM_ID (optional), VERCEL_API_BASE
   (tests and the local harness point it to a fake). The token is only sent as a header to Vercel: never logged, never
   returned, and stripped from any provider message passed on.
   GET  ?projectId=…                                   → {configured, site}  (site: the saved record or null; 503 without key)
   POST {action:'publish',projectId,html,pages}        → {url,deploymentId,project,state,publishedAt}  (waits up to ~45s, then state BUILDING)
        pages: the legal pages of lib/site-legal.js ({'privacy.html','cookie.html'} always, 'grazie.html' with the contact
        form). Every page is refused with a «[da completare: …]» marker (company data included); a page with the contact
        form needs a valid form token of this same project (api/_site_form.js), so a form never goes online unlinked.
   POST {action:'status',projectId,deploymentId}       → same shape, read again from Vercel
   POST {action:'domain',projectId}                    → {domain,verified,record:{type,name,value,zone}}  (<slug>.radixinnovationstudio.com)
   The record is saved in the project's «agents» document (where the studio saves the site): top-level siteOnline plus,
   once online, an exchange in the Web Developer's thread so the team sees it there too. */
const crypto=require('crypto');
const core=require('./_registry-core');
const studio=require('../lib/site-studio.js');
const siteForm=require('./_site_form');

const MISSING='Pubblicazione non ancora attiva: manca la chiave Vercel dei siti.';
const MAX_HTML=2*1024*1024,ZONE='radixinnovationstudio.com',CNAME='cname.vercel-dns.com',AGENT='web-developer',MAX_KEPT=60;
const WAIT_MS=45000,POLL_MS=2000;
const DONE=['READY','ERROR','CANCELED'];
class HttpError extends Error{constructor(status,message){super(message);this.status=status}}

// <name>-<6 hex of the project id>: [a-z0-9-], at most 40 characters, stable for the project and never shared by two.
function siteSlug(name,projectId){
 const suffix=crypto.createHash('sha256').update(String(projectId||'')).digest('hex').slice(0,6);
 const base=String(name||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40-7).replace(/-+$/,'')||'sito';
 return base+'-'+suffix}
const projectName=slug=>'radix-site-'+slug;
const slugOf=project=>String(project||'').replace(/^radix-site-/,'');
const subdomain=slug=>slug+'.'+ZONE;
const dnsRecord=slug=>({type:'CNAME',name:slug,value:CNAME,zone:ZONE});
const PAGE_NAMES=Object.freeze(['privacy.html','cookie.html','grazie.html']);
function deploymentPayload(project,html,pages){const files=[{file:'index.html',data:html}];
 for(const name of PAGE_NAMES)if(pages&&typeof pages[name]==='string')files.push({file:name,data:pages[name]});
 return {name:project,project,target:'production',files,projectSettings:{framework:null}}}
// The page refuses the yellow «[da completare: …]» markers: they would go online as they are.
function checkHtml(html,what){
 if(typeof html!=='string'||!/<html[\s>]/i.test(html))throw new HttpError(400,(what||'Pagina del sito')+' mancante o non valida.');
 if(Buffer.byteLength(html,'utf8')>MAX_HTML)throw new HttpError(413,'Il sito è troppo grande per la pubblicazione (massimo 2 MB).');
 if(studio.hasTodo(html)||/\[da completare:/.test(html))throw new HttpError(422,'Il sito ha ancora testi evidenziati in giallo «[da completare: …]»: completali prima di metterlo online.');
 return html}
/* The whole site: index.html plus the legal pages. Privacy and cookie pages are required; the thank-you page and a valid
   form token (signed for this project) are required when the page has the contact form. */
function checkSite(html,pages,{projectId,secret,now}={}){checkHtml(html);
 if(pages!=null&&(typeof pages!=='object'||Array.isArray(pages)||Object.keys(pages).some(k=>!PAGE_NAMES.includes(k))))throw new HttpError(400,'Pagine del sito non valide.');
 const p=pages||{},form=siteForm.hasForm(html);
 if(typeof p['privacy.html']!=='string'||typeof p['cookie.html']!=='string')throw new HttpError(422,'Mancano l’informativa privacy e la cookie policy del sito: rigenera il sito dallo studio.');
 checkHtml(p['privacy.html'],'Informativa privacy');checkHtml(p['cookie.html'],'Cookie policy');
 if(form){if(typeof p['grazie.html']!=='string')throw new HttpError(422,'Manca la pagina di ringraziamento del modulo contatti.');checkHtml(p['grazie.html'],'Pagina di ringraziamento');
  let claims=null;try{claims=siteForm.verify(siteForm.tokenIn(html),secret,now)}catch(e){claims=null}
  if(!claims||claims.site!==projectId)throw new HttpError(422,'Il modulo contatti non è collegato al CRM di questo progetto: collegalo nello studio prima di metterlo online.')}
 const total=[html,...Object.values(p)].reduce((n,x)=>n+Buffer.byteLength(String(x),'utf8'),0);
 if(total>2*MAX_HTML)throw new HttpError(413,'Il sito è troppo grande per la pubblicazione (massimo 4 MB in tutto).');
 return {html,pages:Object.fromEntries(PAGE_NAMES.filter(k=>typeof p[k]==='string').map(k=>[k,p[k]]))}}
const stateOf=s=>{s=String(s||'').toUpperCase();return DONE.includes(s)?s:'BUILDING'};
function view(d,project,at){const alias=Array.isArray(d&&d.alias)&&d.alias.find(a=>typeof a==='string'&&a);
 const host=alias||(d&&d.url)||'';return {url:host?'https://'+String(host).replace(/^https?:\/\//,''):'',deploymentId:String(d&&d.id||''),project,state:stateOf(d&&(d.readyState||d.status)),publishedAt:at}}

// ---- Vercel REST ----
function vercel(env,fetchFn){const token=String(env.VERCEL_SITES_TOKEN||'').trim(),team=String(env.VERCEL_SITES_TEAM_ID||'').trim();
 const base=String(env.VERCEL_API_BASE||'https://api.vercel.com').replace(/\/+$/,'');
 const hide=s=>String(s==null?'':s).split(token).join('[chiave]').slice(0,300);
 return async(method,path,body)=>{let r;
  try{r=await fetchFn(base+path+(team?(path.includes('?')?'&':'?')+'teamId='+encodeURIComponent(team):''),{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined})}
  catch(e){throw new HttpError(502,'Vercel non raggiungibile: '+hide(e&&e.message))}
  let data=null;try{data=await r.json()}catch(e){}
  if(!r.ok){const m=data&&data.error&&(data.error.message||data.error.code);const err=new HttpError(r.status===401||r.status===403?502:r.status===409?409:502,'Vercel ha risposto '+r.status+(m?': '+hide(m):''));err.code=data&&data.error&&data.error.code;err.upstream=r.status;throw err}
  return data||{}}}

// ---- the record in the project ----
function savedSite(data){const d=data||{};if(d.siteOnline&&d.siteOnline.deploymentId)return d.siteOnline;
 // A page that rewrote the document without siteOnline: the last exchange in the Web Developer's thread still has it.
 const t=d.conversations&&Array.isArray(d.conversations[AGENT])?d.conversations[AGENT]:[];
 for(let i=t.length-1;i>=0;i--)if(t[i]&&t[i].source==='site-publish'&&t[i].site&&t[i].site.deploymentId)return t[i].site;
 return null}
function onlineEntry(site,{by,at}={}){const when=at||new Date().toISOString();
 return [{role:'user',content:'Sito messo online dal pannello Marketing.',display:'Sito messo online dal pannello Marketing',by:by||'Pannello Marketing',at:when,source:'site-publish'},
  {role:'assistant',agent:AGENT,content:'Il sito è online: '+site.url+'\nProgetto di hosting: '+site.project+' (Vercel).',at:when,source:'site-publish',site}]}
// Merges the record into the agents document with the registry's optimistic revision; a new READY adds the exchange.
async function remember(store,projectId,site,{by}={}){
 for(let i=0;i<3;i++){const cur=await store.load(projectId),data={schemaVersion:1,conversations:{},...(cur.data||{})},prev=savedSite(data);
  const next={...site,domain:site.domain||(prev&&prev.domain)||null};
  data.siteOnline=next;
  if(next.state==='READY'&&!(prev&&prev.deploymentId===next.deploymentId&&prev.state==='READY')){const conv={...(data.conversations||{})};
   conv[AGENT]=(Array.isArray(conv[AGENT])?conv[AGENT]:[]).concat(onlineEntry(next,{by})).slice(-MAX_KEPT);data.conversations=conv}
  if(await store.save(projectId,data,cur.revision))return next}
 throw new HttpError(409,'Il progetto è stato modificato nello stesso momento: riprova.')}

function sqlStore(db,uid){return {
 project:async id=>(await db`SELECT id,name FROM rx_projects WHERE id=${id}`)[0]||null,
 load:async id=>{const r=await db`SELECT data,revision FROM rx_documents WHERE project_id=${id} AND module='agents'`;return r.length?{data:r[0].data,revision:r[0].revision}:{data:null,revision:0}},
 save:async(id,data,revision)=>{const json=JSON.stringify(data);
  const rows=revision===0
   ?await db`INSERT INTO rx_documents(project_id,module,data,updated_by) VALUES(${id},'agents',${json}::jsonb,${uid}) ON CONFLICT (project_id,module) DO NOTHING RETURNING revision`
   :await db`UPDATE rx_documents SET data=${json}::jsonb,revision=revision+1,updated_by=${uid},updated_at=now() WHERE project_id=${id} AND module='agents' AND revision=${revision} RETURNING revision`;
  if(rows.length&&data.siteOnline)try{await db`INSERT INTO rx_activity(project_id,actor_id,action,subject,detail) VALUES(${id},${uid},'site.published',${String(data.siteOnline.url||'').slice(0,160)},${JSON.stringify({deploymentId:data.siteOnline.deploymentId,state:data.siteOnline.state})}::jsonb)`}catch(e){}
  return rows.length>0}}}

const bodyOf=req=>typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body||{};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function handle(req,res,deps){
 res.setHeader('Cache-Control','no-store');
 const user=require('./_auth').getSessionUser(req);
 if(!user||!user.uid)return res.status(401).json({error:'Accesso RADIX richiesto'});
 if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({error:'Metodo non consentito'});
 const env=deps.env||process.env,configured=String(env.VERCEL_SITES_TOKEN||'').trim()!=='';
 try{
  const input=req.method==='POST'?bodyOf(req):req.query||{},action=req.method==='GET'?'info':String(input.action||'publish');
  const projectId=String(input.projectId||'');if(!core.validProjectId(projectId))throw new HttpError(400,'Progetto non valido');
  const store=deps.store||sqlStore(deps.db(),Number(user.uid)),proj=await store.project(projectId);
  if(!proj)throw new HttpError(404,'Progetto non trovato');
  const saved=savedSite((await store.load(projectId)).data);
  if(action==='info')return res.status(configured?200:503).json(configured?{configured,site:saved}:{configured,error:MISSING,site:saved});
  if(!configured)return res.status(503).json({error:MISSING});
  const api=vercel(env,deps.fetch||globalThis.fetch),by=user.name||user.email||'';
  if(action==='publish'){const {html,pages}=checkSite(input.html,input.pages,{projectId,secret:env.JWT_SECRET,now:(deps.now?deps.now():new Date()).getTime()});
   const project=saved&&saved.project||projectName(siteSlug(proj.name,projectId)),at=(deps.now?deps.now():new Date()).toISOString();
   let d=await api('POST','/v13/deployments',deploymentPayload(project,html,pages));
   const wait=deps.waitMs==null?WAIT_MS:deps.waitMs,every=deps.pollMs==null?POLL_MS:deps.pollMs,pause=deps.sleep||sleep;
   for(let t=0;!DONE.includes(stateOf(d.readyState||d.status))&&t<wait;t+=every){await pause(every);d={...d,...await api('GET','/v13/deployments/'+encodeURIComponent(d.id))}}
   const site=await remember(store,projectId,view(d,project,at),{by});
   if(site.state!=='READY'&&site.state!=='BUILDING')return res.status(502).json({...site,error:'Vercel non è riuscito a mettere online il sito ('+site.state+'). Riprova tra qualche minuto.'});
   return res.status(200).json(site)}
  if(action==='status'){const id=String(input.deploymentId||'');
   if(!saved||!id||saved.deploymentId!==id)throw new HttpError(404,'Pubblicazione non trovata in questo progetto.');
   const d=await api('GET','/v13/deployments/'+encodeURIComponent(id));
   const site=await remember(store,projectId,{...view({...d,id},saved.project,saved.publishedAt),domain:saved.domain||null},{by});
   return res.status(200).json(site)}
  if(action==='domain'){if(!saved||!saved.project)throw new HttpError(409,'Metti online il sito prima di collegare un sottodominio.');
   const slug=slugOf(saved.project),name=subdomain(slug),path='/v10/projects/'+encodeURIComponent(saved.project)+'/domains';let d;
   try{d=await api('POST',path,{name})}
   catch(e){if(e.upstream!==409)throw e;d=await api('GET','/v9/projects/'+encodeURIComponent(saved.project)+'/domains/'+encodeURIComponent(name))}
   const domain={name,verified:d&&d.verified===true};
   await remember(store,projectId,{...saved,domain},{by});
   return res.status(200).json({domain:name,verified:domain.verified,record:dnsRecord(slug)})}
  throw new HttpError(400,'Azione non valida')
 }catch(e){
  if(e instanceof SyntaxError)return res.status(400).json({error:'JSON non valido'});
  if(e instanceof HttpError)return res.status(e.status).json({error:e.message});
  if(e instanceof core.InputError)return res.status(400).json({error:e.message});
  return res.status(503).json({error:'Pubblicazione non disponibile in questo momento: riprova.'})}
}

module.exports=(req,res)=>handle(req,res,{db:()=>require('./_db').sql()});
Object.assign(module.exports,{handle,siteSlug,projectName,subdomain,dnsRecord,deploymentPayload,checkHtml,checkSite,PAGE_NAMES,savedSite,view,MISSING,MAX_HTML,ZONE});
