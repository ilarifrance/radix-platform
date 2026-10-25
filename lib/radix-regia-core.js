/* Regia RADIX, the common core (N1, with the N3 additions: op names in the context, readable rejected ops, the
   team-memory entry of an applied proposal). Pure and testable in Node; the panel is lib/radix-regia.js.
   One Regia for the whole platform: every area registers an adapter, the Regia reads the page through it and proposes
   changes as a proposal {area, summary, ops}. The core checks the shape and the common rules, the adapter checks the
   content; nothing is applied without «Sì, applica», and every apply returns its undo.

   Adapter contract (register(area, adapter)):
     shortcuts: [{label, prompt}]            the page's shortcut chips
     context(state) -> string                compact summary of the page, no AI
     digest(state, rows) -> object|string    real numbers computed in the browser
     ops: {name: {validate(op, state) -> true | 'motivo' | false,
                  preview?(op, state) -> string, copyFields?: [field], cost?: {ai, paid} | (op) => {ai, paid},
                  effects?: ['send'|'publish'|'paid']}}
     apply(state, ops) -> {state, undo}       undo() -> previous state (may be a Promise)
     optional: pages: [pageId], title, contextMax (characters of the page block, ≤ 4000), read(doc, prev) -> state, view(state) -> {title, items}, sample(state) -> proposal,
       validate(proposal, state) -> {ops, rejected:[{op, reason}]}   whole-proposal check after the per-op one (cross-op
         rules, normalised ops: what it returns in ops is what apply gets), preview(op, state) -> string for every op.
   So an area core with its own validateProposal/applyProposal/undoLast (lib/ped-regia-core.js) wraps with thin glue.
   The common rules: an unknown op is rejected; client-facing copy that names RADIX or a tool is rejected; an op that
   would send, publish or start a paid generation is rejected (the page's own button, with its confirmation, does it). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixRegiaCore=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const AREA_RE=/^[a-z0-9][a-z0-9-]{0,39}$/;
// Fields that end up in front of the client (posts, emails, pages). Internal fields (reason, note) are free.
const COPY_FIELDS=Object.freeze(['copy','title','text','caption','headline','subject','body','message','cta','description','hashtags','script']);
// Names that never appear in client-facing copy: the platform and the tools behind it.
const BRANDS=Object.freeze(['RADIX','HeyGen','Buffer','Higgsfield','Claude','OpenAI']);
const BRAND_RE=new RegExp('(^|[^\\p{L}\\p{N}])('+BRANDS.join('|')+')(?=$|[^\\p{L}\\p{N}])','iu');
// What the Regia never starts by itself: sending, publishing, paid generations.
const FORBIDDEN_EFFECTS=Object.freeze(['send','publish','paid']);
const FORBIDDEN_OP=/(^|[_\-.\s])(send|invia|email|mail|publish|pubblica|schedule|programma|buffer|post_?now|generate|genera|render|heygen|higgsfield|paid|charge|pay)([_\-.\s]|$)/i;
const FORBIDDEN_FLAGS=Object.freeze(['send','publish','schedule','generate','paid','sendNow','publishNow']);
const FORBIDDEN_STATUS=new Set(['sent','published','scheduled','queued','inviato','pubblicato','programmato']);
const MAX_OPS=40;
const REASON={
 shape:'Operazione non leggibile: manca il nome «op».',
 unknown:op=>'Operazione sconosciuta in questa pagina: «'+op+'».',
 brand:(field,name)=>'Il testo per il cliente («'+field+'») nomina «'+name+'»: RADIX e gli strumenti non si citano nei contenuti per i clienti.',
 effect:'La Regia non invia, non pubblica e non avvia generazioni a pagamento: usa il pulsante della pagina, che ha la sua conferma.',
 invalid:'Non valida per i dati di questa pagina.',
 tooMany:'Troppe modifiche in una sola proposta: ne tengo al massimo '+MAX_OPS+'.'
};

// ---- registry ----
function createRegistry(){
 const areas=new Map();
 function register(area,adapter){
  if(!AREA_RE.test(String(area||'')))throw new TypeError('Regia: nome di area non valido «'+area+'»');
  if(!adapter||typeof adapter!=='object')throw new TypeError('Regia: adattatore mancante per «'+area+'»');
  const ops=adapter.ops&&typeof adapter.ops==='object'?adapter.ops:{};
  for(const [name,def] of Object.entries(ops))if(!def||typeof def.validate!=='function')throw new TypeError('Regia: l’operazione «'+name+'» di «'+area+'» non ha validate(op,state)');
  if(Object.keys(ops).length&&typeof adapter.apply!=='function')throw new TypeError('Regia: «'+area+'» ha operazioni ma non apply(state,ops)');
  const shortcuts=(Array.isArray(adapter.shortcuts)?adapter.shortcuts:[]).filter(s=>s&&s.label).map(s=>Object.freeze({label:String(s.label),prompt:String(s.prompt||s.label)}));
  const a=Object.freeze(Object.assign({},adapter,{area,ops:Object.freeze(Object.assign({},ops)),shortcuts:Object.freeze(shortcuts),pages:Object.freeze((adapter.pages||[area]).map(String))}));
  areas.set(area,a);return a}
 function adapterFor(pageId){const id=String(pageId||'');if(areas.has(id))return areas.get(id);for(const a of areas.values())if(a.pages.includes(id))return a;return null}
 return Object.freeze({register,adapterFor,get:area=>areas.get(area)||null,areas:()=>[...areas.keys()],unregister:area=>areas.delete(area)})}

// ---- proposal parsing ----
// Every balanced {...} in the text, string-aware, in order of appearance.
function objectsIn(s){const out=[];for(let i=s.indexOf('{');i!==-1;i=s.indexOf('{',i+1)){let depth=0,str=false,esc=false;
 for(let j=i;j<s.length;j++){const c=s[j];if(str){if(esc)esc=false;else if(c==='\\')esc=true;else if(c==='"')str=false;continue}
  if(c==='"')str=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){out.push(s.slice(i,j+1));break}}}return out}
// The JSON proposal {area, summary, ops} inside a model reply (code fences or not); null when there is none.
function parseProposal(text){const s=String(text||'');const fenced=[...s.matchAll(/```(?:json|JSON)?\s*([\s\S]*?)```/g)].map(m=>m[1]);
 for(const chunk of fenced.concat([s]))for(const raw of objectsIn(chunk)){let p;try{p=JSON.parse(raw)}catch(e){continue}
  if(p&&typeof p==='object'&&!Array.isArray(p)&&Array.isArray(p.ops))return {area:String(p.area||''),summary:String(p.summary||''),ops:p.ops}}
 return null}
// The prose around the proposal, for the bubble above the card.
function proseOf(text){return String(text||'').replace(/```[\s\S]*?```/g,'').replace(/\{[\s\S]*"ops"[\s\S]*\}/,'').replace(/\n{3,}/g,'\n\n').trim()}

// ---- validation ----
function brandIn(value){const m=BRAND_RE.exec(String(value==null?'':Array.isArray(value)?value.join(' '):value));return m?m[2]:null}
function forbidden(op,def){const name=String(op.op);
 if(def&&Array.isArray(def.effects)&&def.effects.some(e=>FORBIDDEN_EFFECTS.includes(e)))return true;
 if(FORBIDDEN_OP.test(name.replace(/([a-z])([A-Z])/g,'$1_$2')))return true;
 if(FORBIDDEN_FLAGS.some(k=>op[k]===true||op[k]==='true'))return true;
 return op.status!=null&&FORBIDDEN_STATUS.has(String(op.status).toLowerCase())}
// One op against the common rules and the adapter: null when accepted, else the Italian reason.
function checkOp(op,adapter,state){
 if(!op||typeof op!=='object'||Array.isArray(op)||typeof op.op!=='string'||!op.op.trim())return REASON.shape;
 const def=Object.prototype.hasOwnProperty.call(adapter.ops,op.op)?adapter.ops[op.op]:null;
 if(forbidden(op,def))return REASON.effect;
 if(!def)return REASON.unknown(op.op);
 for(const f of def.copyFields||COPY_FIELDS){const name=brandIn(op[f]);if(name)return REASON.brand(f,name)}
 let r;try{r=def.validate(op,state)}catch(e){return REASON.invalid}
 if(r===true||r==null)return null;return typeof r==='string'&&r.trim()?r:r&&r.reason?String(r.reason):REASON.invalid}
// {ok, area, summary, accepted, rejected:[{op, reason}], error?}
function validateProposal(p,adapter,state){
 const base={ok:false,area:p&&p.area||'',summary:p&&p.summary||'',accepted:[],rejected:[]};
 if(!p||!Array.isArray(p.ops))return Object.assign(base,{error:'Proposta non leggibile.'});
 if(!adapter)return Object.assign(base,{error:'Questa pagina non ha ancora una Regia che può applicare modifiche.'});
 if(p.area&&p.area!==adapter.area)return Object.assign(base,{error:'La proposta riguarda un’altra area («'+p.area+'»), non questa pagina.'});
 p.ops.forEach((op,i)=>{if(i>=MAX_OPS){base.rejected.push({op,reason:REASON.tooMany});return}const reason=checkOp(op,adapter,state);if(reason)base.rejected.push({op,reason});else base.accepted.push(op)});
 // The adapter's own whole-proposal check: it may drop ops (with a reason) and normalise the ones it keeps.
 if(typeof adapter.validate==='function'&&base.accepted.length){let r;try{r=adapter.validate({area:adapter.area,summary:base.summary,ops:base.accepted.slice()},state)}catch(e){r={ops:[],rejected:base.accepted.map(op=>({op,reason:REASON.invalid}))}}
  if(r&&Array.isArray(r.ops)){base.accepted=r.ops.filter(op=>op&&typeof op==='object'&&Object.prototype.hasOwnProperty.call(adapter.ops,op.op));
   for(const x of r.rejected||[])base.rejected.push({op:x&&typeof x.op==='object'?x.op:{op:String(x&&x.op||'?'),title:x&&x.title||''},reason:String(x&&x.reason||REASON.invalid)})}}
 base.ok=base.accepted.length>0;return base}

// ---- cost ----
// AI calls and paid items, from what each op declares (the adapter's declaration first, else the op's own).
function costOf(ops,adapter){let ai=0;const paid=[];
 for(const op of ops||[]){const def=adapter&&op&&adapter.ops[op.op];let c=def&&def.cost!=null?def.cost:op&&op.cost;if(typeof c==='function')c=c(op);if(!c||typeof c!=='object')continue;
  ai+=Math.max(0,Math.floor(Number(c.ai)||0));
  const items=Array.isArray(c.paid)?c.paid:c.paid?[c.paid]:[];for(const it of items)paid.push(typeof it==='object'?{label:String(it.label||op.op),amount:it.amount!=null?String(it.amount):''}:{label:String(it),amount:''})}
 return {ai,paid,label:costLabel(ai,paid)}}
function costLabel(ai,paid){const a=ai===0?'nessuna chiamata AI':ai===1?'1 chiamata AI':ai+' chiamate AI';
 const p=paid.length?paid.map(x=>x.label+(x.amount?' ('+x.amount+')':'')).join(', ')+' da avviare dal pulsante della pagina':'nessun credito';return a+' · '+p}

// ---- conversation ----
// The messages to send: the newest first kept whole, each one capped, the total under maxChars; older ones dropped
// with a note so the model knows the conversation started earlier.
function conversationDigest(messages,opts){const o=Object.assign({maxChars:6000,perMessage:1500},opts);const list=(messages||[]).filter(m=>m&&m.content!=null);
 const cut=s=>{s=String(s);return s.length>o.perMessage?s.slice(0,o.perMessage-1)+'…':s};const out=[];let size=0;
 for(let i=list.length-1;i>=0;i--){const content=cut(list[i].content);if(out.length&&size+content.length>o.maxChars)break;out.unshift({role:list[i].role==='assistant'?'assistant':'user',content});size+=content.length}
 const dropped=list.length-out.length;if(dropped>0&&out.length)out[0]={role:out[0].role,content:'['+dropped+(dropped===1?' messaggio precedente omesso':' messaggi precedenti omessi')+']\n'+out[0].content};
 return out}
// The page block that goes with a question: area, context and numbers, capped.
// The cap is 2500 characters, or the adapter's contextMax (at most 4000, the server's cap) when it needs more room.
function contextBlock(adapter,state,rows,maxChars){if(!adapter)return '';const cap=maxChars||(Number(adapter.contextMax)>0?Math.min(4000,Math.floor(adapter.contextMax)):2500);let ctx='',dig='';
 try{ctx=adapter.context?String(adapter.context(state)||''):''}catch(e){ctx=''}
 try{const d=adapter.digest?adapter.digest(state,rows):null;dig=d==null?'':typeof d==='string'?d:JSON.stringify(d)}catch(e){dig=''}
 // The op names go first, so the model knows what it may propose even when the context is cut.
 const ops=Object.keys(adapter.ops||{});
 const s='[Area: '+(adapter.title||adapter.area)+' ('+adapter.area+')]'+(ops.length?'\n[Operazioni] '+ops.join(', '):'')+(ctx?'\n[Contesto] '+ctx:'')+(dig?'\n[Numeri] '+dig:'');return s.length>cap?s.slice(0,cap-1)+'…':s}

// ---- apply ----
// Only accepted ops reach the adapter; the result always carries an undo.
async function applyProposal(adapter,state,accepted){if(!adapter||typeof adapter.apply!=='function')throw new Error('Questa pagina non applica modifiche.');
 const r=await adapter.apply(state,accepted.slice());if(!r||typeof r.undo!=='function')throw new Error('L’adattatore «'+adapter.area+'» non ha restituito l’annullamento.');return r}
function previewOf(op,adapter,state){const def=adapter&&adapter.ops[op&&op.op];try{if(def&&def.preview)return String(def.preview(op,state));if(adapter&&adapter.preview){const t=adapter.preview(op,state);if(t)return String(t)}}catch(e){}
 if(!op||typeof op!=='object')return String(op);return Object.entries(op).filter(([k])=>k!=='op').map(([k,v])=>k+': '+(typeof v==='object'?JSON.stringify(v):v)).join(' · ')||String(op.op)}

// A rejected op as one readable Italian line: the adapter's preview when the op is one of its own and the preview
// reads well, else «Operazione X» with its main field. Never the raw key: value list.
const MAIN_FIELDS=['title','item','name','subject','headline','text','copy','message','caption','note','contentId','id','date'];
function rejectedPreview(op,adapter,state){if(!op||typeof op!=='object')return 'Operazione non leggibile';
 const name=typeof op.op==='string'&&op.op.trim()?op.op.trim().slice(0,60):'';
 const def=adapter&&name&&Object.prototype.hasOwnProperty.call(adapter.ops||{},name)?adapter.ops[name]:null;
 if(def){let t='';try{t=def.preview?def.preview(op,state):adapter.preview?adapter.preview(op,state):''}catch(e){t=''}
  t=String(t||'').replace(/\s+/g,' ').trim();if(t&&!/\b(undefined|null|NaN)\b|\[object /.test(t))return t.length>160?t.slice(0,159)+'…':t}
 const f=MAIN_FIELDS.find(k=>op[k]!=null&&typeof op[k]!=='object'&&String(op[k]).trim());
 const main=f?String(op[f]).replace(/\s+/g,' ').trim():'';
 return (name?'Operazione «'+name+'»':'Operazione senza nome')+(main?': '+(main.length>100?main.slice(0,99)+'…':main):'')}

// ---- team memory ----
// What an applied proposal leaves in the team memory: one proposed decision (a person confirms it on the Memoria
// page). scope: {projectId, clientId, agentId}; without a project it is an agency-wide proposal.
const MEMORY_AGENT='radix-director';
const MEMORY_ID=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
function memoryEntry(result,adapter,state,scope){const sc=scope||{},one=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
 const id=v=>{const x=one(v);return MEMORY_ID.test(x)?x:''};const projectId=id(sc.projectId),clientId=id(sc.clientId),agentId=id(sc.agentId)||MEMORY_AGENT;
 const ops=(result&&result.accepted)||[],area=adapter?(adapter.title||adapter.area):'';
 const summary=one(result&&result.summary)||'Modifiche applicate'+(area?' in «'+area+'»':'');
 const lines=ops.map(op=>'- '+one(previewOf(op,adapter,state)));
 const content=('Applicate con «Sì, applica» nella Regia'+(area?' · area «'+area+'»':'')+' ('+ops.length+(ops.length===1?' modifica':' modifiche')+'):\n'+lines.join('\n')).slice(0,4000);
 return {level:projectId?'project':'agency',kind:'decision',status:'proposed',projectId,clientId,agentId,
  title:('Regia: '+summary).slice(0,140),content,source:('Regia'+(area?' · '+area:'')).slice(0,200)}}

const defaultRegistry=createRegistry();
return Object.freeze({COPY_FIELDS,BRANDS,FORBIDDEN_EFFECTS,MAX_OPS,REASON,createRegistry,register:defaultRegistry.register,adapterFor:defaultRegistry.adapterFor,registry:defaultRegistry,
 parseProposal,proseOf,validateProposal,checkOp,brandIn,costOf,conversationDigest,contextBlock,applyProposal,previewOf,rejectedPreview,memoryEntry,MEMORY_AGENT});
});
