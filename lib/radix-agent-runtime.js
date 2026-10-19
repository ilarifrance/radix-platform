/* RADIX agent runtime — the v3.7 agent engine (index.html) as a shared library for the new pages.
   Roster, replies with automatic continuation, orchestrator routing and multi-round flows,
   the ---DOCUMENTO--- protocol and Markdown/Word exports. No storage here: pages decide where
   conversations live (the registry, per project). Works in the browser and under node --test. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixAgents=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';

// Same ids as AGENTS in api/chat.js and index.html v3.7.
const AGENTS=Object.freeze([
 {id:'marketing-orchestrator',icon:'🎯',name:'Orchestratore Marketing',blurb:'Dal post al lancio completo: pianifica e smista agli specialisti',hub:true,group:'marketing'},
 {id:'brand-strategist',icon:'🧠',name:'Stratega di Marca e Campagne',blurb:'Posizionamento, funnel, canali, KPI, piano a 90 giorni',group:'marketing'},
 {id:'strategist',icon:'🧭',name:'Digital Strategist',blurb:'Pilastri editoriali, piani mensili, direzione di ogni contenuto',group:'marketing'},
 {id:'copywriter',icon:'✍️',name:'Copywriter',blurb:'Ogni testo: post, email, landing, annunci, script, comunicati',group:'marketing'},
 {id:'art-director',icon:'🎨',name:'Art Director',blurb:'Identità visiva, caroselli, look di sito, prompt per immagini',group:'marketing'},
 {id:'ai-specialist',icon:'🤖',name:'AI Specialist',blurb:'Video con avatar, prompt per immagini, automazioni e assistenti',group:'marketing'},
 {id:'social-media-manager',icon:'📅',name:'Social Media Manager',blurb:'Apertura canali, bio, calendario, formati e orari',group:'marketing'},
 {id:'seo-geo',icon:'🔍',name:'Specialista SEO e GEO',blurb:'Parole chiave, architettura e SEO tecnica; citazioni nei motori AI',group:'marketing'},
 {id:'web-content',icon:'📝',name:'Content e UX Writer',blurb:'Struttura e testi di sito, landing e schede store',group:'marketing'},
 {id:'video-producer',icon:'🎬',name:'Video Producer',blurb:'Sceneggiature, storyboard e shot list, serie e avatar',group:'marketing'},
 {id:'paid-media',icon:'📣',name:'Paid Media Specialist',blurb:'Campagne Meta, Google, LinkedIn: struttura, pubblici, annunci',group:'marketing'},
 {id:'analytics',icon:'📈',name:'Analytics e CRO',blurb:'Piano di misurazione, GA4, dashboard, test A/B',group:'marketing'},
 {id:'orchestrator',icon:'🧩',name:'Pipeline post',blurb:'Un post: 5 agenti in fila, dal brief al calendario',pipeline:true,group:'marketing'},
 {id:'partner',icon:'🧠',name:'Orchestratore dello Studio',blurb:'Un task, lo smista agli specialisti giusti',hub:true,group:'admin'},
 {id:'commercialista-senior',icon:'📊',name:'Commercialista Senior',blurb:'Pareri fiscali e societari, tax planning, contenzioso',group:'admin'},
 {id:'commercialista-operativo',icon:'🧾',name:'Commercialista Operativo',blurb:'Bilanci, dichiarazioni, pratiche, checklist documenti',group:'admin'},
 {id:'contabilita',icon:'🧮',name:'Contabilità',blurb:'Scadenzario, liquidazioni IVA e F24, prima nota, riconciliazioni',group:'admin'},
 {id:'lavoro-paghe',icon:'👔',name:'Lavoro e Paghe',blurb:'CCNL, contratti, costo del lavoro, cedolini e TFR',group:'admin'},
 {id:'segreteria-studio',icon:'✉️',name:'Segreteria dello Studio',blurb:'Comunicazioni con clienti ed enti, parcelle, solleciti',group:'admin'},
 {id:'web-developer',icon:'💻',name:'Web Developer',blurb:'Siti e app con anteprima dal vivo, SEO tecnica, pubblicazione',group:'dev'},
 {id:'legal-orchestrator',icon:'⚖️',name:'Orchestratore Legale',blurb:'Un\'esigenza legale, la smista agli specialisti e fa rileggere tutto',hub:true,group:'legale'},
 {id:'legal-gdpr',icon:'🔐',name:'Esperto Privacy e GDPR',blurb:'Trattamento dati, informative, DPIA, adempimenti verso il Garante',group:'legale'},
 {id:'legal-contracts',icon:'📜',name:'Esperto Contrattualistica, IP e Creator',blurb:'Contratti B2B/B2C, marchi, diritti d\'immagine, accordi con creator',group:'legale'},
 {id:'legal-banking',icon:'🏦',name:'Esperto Diritto Bancario e Finanziario',blurb:'Contratti di finanziamento, normativa bancaria, utile su Doc Capital',group:'legale'},
 {id:'legal-risk-analyst',icon:'🔎',name:'Analista di Rischio Legale',blurb:'Rilegge contratti e pareri degli altri, isola criticità e limiti di responsabilità',group:'legale'},
 {id:'comm-orchestrator',icon:'🧭',name:'Orchestratore Commerciale',blurb:'Smista l\'obiettivo commerciale agli specialisti giusti',hub:true,group:'commerciale'},
 {id:'comm-market-analyst',icon:'📈',name:'Analista di Mercato e Strategia',blurb:'Ricerche di mercato, trend, definisce la strategia per ogni mercato target',group:'commerciale'},
 {id:'comm-contact-finder',icon:'🔍',name:'Ricercatore di Contatti',blurb:'Trova aziende e contatti professionali pubblici in base alla strategia',group:'commerciale'},
 {id:'comm-email-outreach',icon:'📧',name:'Specialista Email Outreach',blurb:'Scrive le email; l\'invio resta una tua conferma esplicita',group:'commerciale'},
 {id:'comm-crm-manager',icon:'📊',name:'Responsabile CRM / Sales Ops',blurb:'Tiene i numeri: stato dei contatti, follow-up dovuti, tasso di risposta',group:'commerciale'}
].map(Object.freeze));
const AGENT_ALIASES=Object.freeze({'commercialista-junior':'commercialista-operativo','praticante-commercialista':'commercialista-operativo','responsabile-contabile':'contabilita','addetto-contabilita-senior':'contabilita','addetto-contabilita-junior':'contabilita','consulente-lavoro':'lavoro-paghe','addetto-paghe':'lavoro-paghe','legal-image-rights':'legal-contracts'});
const GROUP_LABELS=Object.freeze({marketing:'Agenzia Marketing',admin:'Area Amministrativa e Contabile',dev:'Sviluppo',legale:'Area Legale',commerciale:'Ufficio Commerciale'});
const PIPELINE=Object.freeze(['strategist','copywriter','art-director','ai-specialist','social-media-manager']);
const MAX_CONTINUATIONS=4,FLOW_CONCURRENCY=3,MAX_ORCH_ROUNDS=3,HUB_MAX_DIRECT_CHARS=4500;

function agent(id){const key=AGENT_ALIASES[id]||id;return AGENTS.find(a=>a.id===key)||null}
const isHub=id=>!!(agent(id)&&agent(id).hub);
const label=id=>{const a=agent(id);return a?a.name:String(id||'Agente')};

// ---- documents (DOCUMENT_PROTOCOL in api/chat.js) ----
const DOC_OPEN_RE=/^[ \t]*---\s*DOCUMENTO\s*:\s*(.+?)\s*---[ \t]*$/im;
const DOC_CLOSE_RE=/^[ \t]*---\s*FINE\s+DOCUMENTO\s*---[ \t]*$/im;
function parseDocuments(text){
 const docs=[];let rest=String(text||''),guard=0;
 while(guard++<30){
  const open=DOC_OPEN_RE.exec(rest);if(!open)break;
  const afterOpen=rest.slice(open.index+open[0].length),close=DOC_CLOSE_RE.exec(afterOpen);
  const body=close?afterOpen.slice(0,close.index):afterOpen;
  docs.push({title:open[1].trim().replace(/^["“]|["”]$/g,''),body:body.replace(/^\s*\n/,'').replace(/\s+$/,''),incomplete:!close});
  if(!close)break;rest=afterOpen.slice(close.index+close[0].length);
 }
 return docs;
}
function stripDocuments(text){
 let rest=String(text||''),out='',guard=0;
 while(guard++<30){
  const open=DOC_OPEN_RE.exec(rest);if(!open){out+=rest;break}
  out+=rest.slice(0,open.index);
  const afterOpen=rest.slice(open.index+open[0].length),close=DOC_CLOSE_RE.exec(afterOpen);
  if(!close)break;rest=afterOpen.slice(close.index+close[0].length);
 }
 return out.replace(/\n{3,}/g,'\n\n').trim();
}
const wordCount=t=>{const m=String(t||'').trim().match(/\S+/g);return m?m.length:0};
function slugify(title){return String(title||'documento').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'documento'}

// ---- routing (v3.7 parseRouting: lenient, dipende:N refers to non-empty lines) ----
function parseRouting(text){
 const m=/---ROUTING---([\s\S]*?)---FINE---/.exec(text||'');if(!m)return [];
 const items=[],keptByLine={};let lineNo=0;
 m[1].split('\n').forEach(raw=>{
  const line=raw.trim().replace(/^\d+[.)]\s*/,'');if(!line)return;lineNo++;
  const sep=line.indexOf('|');if(sep<0)return;
  const role=AGENT_ALIASES[line.slice(0,sep).trim().replace(/^[-*•]\s*/,'')]||line.slice(0,sep).trim().replace(/^[-*•]\s*/,'');
  let rest=line.slice(sep+1).trim(),deps=[];
  const dep=/\|\s*dipende\s*:\s*([\d,\s]+)\s*$/i.exec(rest);
  if(dep){deps=dep[1].split(',').map(s=>parseInt(s.trim(),10)).filter(n=>n>0);rest=rest.slice(0,dep.index).trim()}
  const subtask=rest.replace(/\|\s*$/,'').trim();
  // Only real specialists: a hub or the post pipeline can't be routed to.
  const a=agent(role);
  if(a&&!a.hub&&!a.pipeline&&subtask){items.push({role:a.id,subtask:subtask.slice(0,4000),deps});keptByLine[lineNo]=items.length}
 });
 items.forEach(it=>{it.deps=it.deps.map(n=>keptByLine[n]||0).filter(n=>n>0)});
 return items.slice(0,12);
}
const stripRouting=t=>String(t||'').replace(/\n?---ROUTING---[\s\S]*?---FINE---/,'').trim();

// v3.4 guard: an orchestrator that drafts a document itself is asked to route it instead.
function looksLikeDraftedDocument(text){
 const t=text||'';
 if(/---\s*DOCUMENTO/i.test(t))return true;
 if(/copia(?:lo|li)?\s+(?:tutto\s+)?(?:da\s+qui\s+)?e\s+salva|un\s+documento\s+(?:completo\s+)?per\s+messaggio|DOCUMENTO\s+\d+\s*\/\s*\d+/i.test(t))return true;
 const articles=t.match(/^\s*(?:#{1,4}\s*|\*\*)?(?:Art\.|Articolo|ARTICOLO|ART\.)\s*\d+/gm);
 if(articles&&articles.length>=3)return true;
 return t.length>HUB_MAX_DIRECT_CHARS;
}
const HUB_REROUTE_NOTE='[Nota automatica della piattaforma] La tua risposta precedente conteneva il testo di un documento (o era '+
 'troppo lunga per una nota da project manager) e non aveva il blocco ---ROUTING---: è stata scartata, '+
 'l\'utente non l\'ha vista. Gli orchestratori non scrivono mai documenti: li fanno scrivere agli specialisti, '+
 'che li consegnano come schede scaricabili (Apri / Word / Markdown). Rispondi ORA con il piano di lavoro in '+
 'massimo 3 righe e il blocco ---ROUTING--- con una riga per ogni documento richiesto (ruolo-id|compito '+
 'autosufficiente), senza scrivere nessun documento tu.';

// ---- calls ----
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function postChat(body,fetchImpl){
 const f=fetchImpl||root.fetch.bind(root);
 for(let attempt=1;;attempt++){
  try{
   const res=await f('/api/chat',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
   if(res.status>=500&&attempt===1){await sleep(700);continue}
   return res;
  }catch(err){if(attempt===1){await sleep(700);continue}throw err}
 }
}
// A reply that stopped for length before writing anything usable is a failure, not a delivery: the
// flow shows it as «non riuscito» with what to do, instead of «consegnato» with an empty document.
const CUT_SHORT='La risposta si è interrotta quasi subito, prima di scrivere il documento: premi «Rigenera ultima risposta».';
function cutShort(r){return !!(r&&r.truncated&&String(r.text||'').replace(/⚠️ \[Risposta interrotta[^\]]*\]/,'').trim().length<1500)}
// One reply; when the server says it stopped for length, the text so far is sent back as a
// prefilled assistant turn and the parts are stitched together (v3.0 fetchAgentReply).
async function reply({role,messages,project,memoryScope},{fetch:fetchImpl,onProgress}={}){
 const base=(messages||[]).slice();let msgs=base,text='',parts=0,truncated=false;const sources=[],seen={};
 while(true){
  parts++;
  const res=await postChat({role,messages:msgs,project,memoryScope},fetchImpl);
  let data={};try{data=await res.json()}catch(e){}
  if(res.status===401){const e=Error('Sessione scaduta: accedi di nuovo.');e.status=401;throw e}
  if(!res.ok)throw Error(data.error||'Errore imprevisto');
  let chunk=data.reply||'';
  if(parts===1)chunk=chunk.replace(/^\s+/,'');
  if(parts>1&&/\s$/.test(text)&&/^\s/.test(chunk))chunk=chunk.replace(/^\s+/,'');
  text+=chunk;
  (data.sources||[]).forEach(s=>{if(s&&s.url&&!seen[s.url]){seen[s.url]=1;sources.push(s)}});
  truncated=!!data.truncated;
  if(!truncated||parts>=MAX_CONTINUATIONS||!chunk.trim())break;
  msgs=base.concat([{role:'assistant',content:text.replace(/\s+$/,'')}]);
  if(onProgress)try{onProgress(parts+1)}catch(e){}
 }
 text=text.replace(/\s+$/,'');
 if(truncated)text+='\n\n⚠️ [Risposta interrotta per limite di spazio anche dopo '+parts+' parti: scrivi "continua" per farla finire.]';
 return {text,sources,parts,truncated};
}

// ---- orchestration flows (v3.7 makeFlow / runFlowNodes / runOrchestrationFlow) ----
function makeFlow(items,round){
 return {status:'pending',round,log:[],nodes:items.map(it=>({role:it.role,subtask:it.subtask,deps:it.deps||[],label:label(it.role),status:'pending',output:null,sources:null}))};
}
function flowLog(flow,kind,text){flow.log=flow.log||[];flow.log.push({t:Date.now(),k:kind,x:text});if(flow.log.length>200)flow.log.splice(0,flow.log.length-200)}
const FATAL_API_RE=/credito api esaurito|chiave api degli agenti|sovraccaric|credit balance|billing|insufficient.*(credit|quota)|invalid.*api key|authentication|overloaded|rate limit|too many requests|529|quota/i;

function specialistPrompt(node,deps){
 let text=node.subtask;
 if(deps.length)text+='\n\nMATERIALE DA USARE — risultato di altri specialisti del team su questo stesso incarico:\n\n'+
  deps.map(d=>'=== '+d.label+' ('+d.subtask+') ===\n'+(d.output||'')).join('\n\n')+
  '\n\nSvolgi il tuo compito basandoti su questo materiale (non riscriverlo: usalo).';
 return text;
}

// ---- single-step work on a finished flow (v3.7 pipeline: edit, regenerate, reply, "da aggiornare") ----
// Every finished node that uses node i's result, directly or through others, becomes 'stale'.
function markStale(flow,i){
 const nodes=flow.nodes,changed=new Set([i+1]);let marked=0,grew=true;
 while(grew){grew=false;nodes.forEach((n,k)=>{if(changed.has(k+1))return;if((n.deps||[]).some(d=>changed.has(d))){changed.add(k+1);grew=true;if(n.status==='done'){n.status='stale';marked++}}})}
 return marked;
}
function editNode(flow,i,text,by){
 const n=flow.nodes[i];if(!n||n.status==='running')throw Error('Passo non modificabile');const t=String(text||'').trim();if(!t)throw Error('Il testo non può essere vuoto');
 n.output=t;n.status='done';n.editedBy=by||'';n.editedAt=Date.now();flowLog(flow,'edit',n.label+' (#'+(i+1)+') modificato a mano'+(by?' da '+by:''));
 return markStale(flow,i);
}
// Re-runs one node with the current results of its dependencies; a note from the team rides along with the previous version.
async function rerunNode(flow,i,{call,note,onUpdate}){
 const nodes=flow.nodes,n=nodes[i];if(!n||n.status==='running')throw Error('Passo già in corso');
 const deps=(n.deps||[]).map(d=>nodes[d-1]).filter(d=>d&&d!==n);
 if(deps.some(d=>d.status!=='done'))throw Error('Aggiorna prima i passi da cui dipende');
 const prev=n.output||'';let text=specialistPrompt(n,deps);
 if(note&&String(note).trim())text+='\n\nRISPOSTA DEL TEAM ALLA TUA VERSIONE PRECEDENTE (tienine conto e consegna una nuova versione completa):\n'+String(note).trim()+(prev?'\n\nLA TUA VERSIONE PRECEDENTE:\n'+prev:'');
 n.status='running';n.progress='';n.startedAt=Date.now();flowLog(flow,'start',n.label+' rifà #'+(i+1)+(note?' con la risposta del team':''));onUpdate&&onUpdate();
 try{const r=await call(n.role,text,p=>{n.progress='parte '+p+'…';onUpdate&&onUpdate()});if(cutShort(r))throw Error(CUT_SHORT);n.status='done';n.output=r.text;n.sources=r.sources||[];delete n.editedBy;delete n.editedAt;flowLog(flow,'done',n.label+' consegna di nuovo #'+(i+1))}
 catch(err){n.status='error';n.output=(err&&err.message)||'Errore imprevisto';flowLog(flow,'error',n.label+' non è riuscito (#'+(i+1)+'): '+n.output.slice(0,120))}
 finally{n.progress='';n.endedAt=Date.now()}
 const stale=n.status==='done'?markStale(flow,i):0;onUpdate&&onUpdate();return stale;
}
// "Aggiorna i passi successivi": stale nodes go back to the queue and run with the new material.
function requeueStale(flow){let k=0;flow.nodes.forEach(n=>{if(n.status==='stale'){n.status='pending';k++}});return k}

// call(role,userText,onProgress) -> {text,sources}; onUpdate() is called after every change.
function runNodes(flow,{call,onUpdate,concurrency=FLOW_CONCURRENCY}){
 const nodes=flow.nodes;flow.halted=null;const update=()=>{try{onUpdate&&onUpdate()}catch(e){}};
 return new Promise(resolve=>{
  let active=0,settled=false;
  const depsOf=n=>(n.deps||[]).map(i=>nodes[i-1]).filter(d=>d&&d!==n);
  function run(n,deps){
   const num=nodes.indexOf(n)+1;n.status='running';n.startedAt=Date.now();
   flowLog(flow,'start',n.label+' inizia #'+num+(deps.length?' — riceve il risultato di '+deps.map(d=>'#'+(nodes.indexOf(d)+1)).join(', '):''));update();
   return Promise.resolve().then(()=>call(n.role,specialistPrompt(n,deps),p=>{n.progress='parte '+p+'…';update()})).then(r=>{
    if(cutShort(r)){n.status='error';n.output=CUT_SHORT;n.progress='';n.endedAt=Date.now();flowLog(flow,'error',n.label+' non è riuscito (#'+num+'): risposta interrotta');return}n.status='done';n.output=r.text;n.sources=r.sources||[];n.progress='';n.endedAt=Date.now();
    const docs=parseDocuments(r.text);
    flowLog(flow,'done',n.label+' consegna #'+num+': '+(docs.length?docs.map(d=>'"'+d.title+'"').join(', '):wordCount(r.text)+' parole'));
   },err=>{n.status='error';n.output=(err&&err.message)||'Errore imprevisto';n.progress='';n.endedAt=Date.now();flowLog(flow,'error',n.label+' non è riuscito (#'+num+'): '+n.output.slice(0,120))});
  }
  function tick(){
   let progressed=true;
   while(progressed){
    progressed=false;
    for(const n of nodes){
     if(n.status!=='pending')continue;
     const deps=depsOf(n);
     if(deps.some(d=>d.status==='error')){n.status='error';n.output='Non eseguito: un compito da cui dipendeva non è riuscito.';progressed=true;continue}
     if(!flow.halted&&active<concurrency&&deps.every(d=>d.status==='done')){
      active++;progressed=true;
      run(n,deps).then(()=>{active--;if(n.status==='error'&&FATAL_API_RE.test(n.output||'')&&!flow.halted){flow.halted=n.output;flowLog(flow,'error','Coda fermata: '+n.output.slice(0,160))}update();tick()});
     }
    }
   }
   if(active===0&&!settled){
    const left=nodes.filter(n=>n.status==='pending');
    if(left.length&&!flow.halted)left.forEach(n=>{n.status='error';n.output='Non eseguito: dipendenza circolare o non valida nel piano.'});
    settled=true;update();resolve();
   }
  }
  tick();
 });
}

function summaryPrompt(originalTask,flow,round){
 const produced=[];
 const results=flow.nodes.map((n,i)=>{
  const head='--- Compito '+(i+1)+' · '+n.label+' ('+n.subtask+') ---\n';
  if(n.status!=='done')return head+'(non riuscito: '+n.output+')';
  const docs=parseDocuments(n.output),note=stripDocuments(n.output);
  if(docs.length){
   docs.forEach(d=>produced.push({title:d.title,by:n.label,incomplete:d.incomplete}));
   return head+docs.map(d=>'[DOCUMENTO CONSEGNATO: "'+d.title+'" — '+wordCount(d.body)+' parole, già scaricabile come scheda Documento'+(d.incomplete?', INTERROTTO prima della fine':'')+']').join('\n')+(note?'\nNota dello specialista: '+note.slice(0,700):'');
  }
  return head+n.output.slice(0,3500)+(n.output.length>3500?'\n[…]':'');
 }).join('\n\n');
 const prompt='Richiesta originale: '+originalTask+'\n\nHai pianificato e smistato il lavoro agli specialisti. Esito dei compiti:\n\n'+results+
  '\n\nScrivi ora l\'aggiornamento finale da project manager, in massimo 10-12 righe: cosa è stato prodotto (titoli dei documenti e chi li ha fatti), '+
  'i punti aperti o da personalizzare segnalati dagli specialisti, il prossimo passo. Non riscrivere né riassumere il contenuto dei documenti: '+
  'sono già consegnati come schede scaricabili sotto il flusso di lavoro, e devi dirlo in una riga. '+
  (round>=MAX_ORCH_ROUNDS
   ?'Se la richiesta prevedeva altri documenti o compiti non ancora prodotti, elencali come prossimo passo senza emettere un nuovo blocco ---ROUTING---: l\'utente scriverà "continua".'
   :'Se la richiesta originale prevedeva altri documenti o compiti non ancora prodotti (o un documento è rimasto interrotto), emetti un nuovo blocco ---ROUTING--- con una riga per ciascuno di quelli mancanti; altrimenti chiudi senza blocco.');
 return {prompt,produced};
}

// ---- Markdown (safe: everything is escaped before inline formatting) ----
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inline(s){
 return s.replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<em>$2</em>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}
function renderMarkdown(md,headingOffset){
 const off=typeof headingOffset==='number'?headingOffset:1,lines=String(md||'').replace(/\r/g,'').split('\n'),out=[];let i=0;
 const cells=l=>l.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
 while(i<lines.length){
  const l=lines[i];
  if(!l.trim()){i++;continue}
  let m;
  if((m=/^```(\w*)/.exec(l))){const buf=[];i++;while(i<lines.length&&!/^```/.test(lines[i]))buf.push(lines[i++]);i++;out.push('<pre><code>'+esc(buf.join('\n'))+'</code></pre>');continue}
  if((m=/^(#{1,6})\s+(.*)$/.exec(l))){const lv=Math.min(6,m[1].length+off);out.push('<h'+lv+'>'+inline(esc(m[2]))+'</h'+lv+'>');i++;continue}
  if(/^\s*(-{3,}|\*{3,})\s*$/.test(l)){out.push('<hr>');i++;continue}
  if(/^\s*\|.*\|\s*$/.test(l)&&i+1<lines.length&&/^\s*\|?\s*:?-{2,}/.test(lines[i+1])){
   const head=cells(l);i+=2;const rows=[];while(i<lines.length&&/^\s*\|.*\|\s*$/.test(lines[i]))rows.push(cells(lines[i++]));
   out.push('<table><thead><tr>'+head.map(c=>'<th>'+inline(esc(c))+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+inline(esc(c))+'</td>').join('')+'</tr>').join('')+'</tbody></table>');continue;
  }
  if(/^\s*([-*•]|\d+[.)])\s+/.test(l)){
   const ordered=/^\s*\d/.test(l),items=[];
   while(i<lines.length&&/^\s*([-*•]|\d+[.)])\s+/.test(lines[i]))items.push(lines[i++].replace(/^\s*([-*•]|\d+[.)])\s+/,''));
   const tag=ordered?'ol':'ul';out.push('<'+tag+'>'+items.map(t=>'<li>'+inline(esc(t))+'</li>').join('')+'</'+tag+'>');continue;
  }
  const para=[];while(i<lines.length&&lines[i].trim()&&!/^(#{1,6}\s|```|\s*([-*•]|\d+[.)])\s+)/.test(lines[i]))para.push(lines[i++]);
  out.push('<p>'+inline(esc(para.join('\n'))).replace(/\n/g,'<br>')+'</p>');
 }
 return out.join('');
}

// ---- downloads ----
function download(name,blob){
 const url=URL.createObjectURL(blob),a=root.document.createElement('a');a.href=url;a.download=name;root.document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function wordHtml(title,md){
 return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>'+esc(title)+'</title>'+
  '<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1F1F1F}h1{font-size:18pt;color:#0F2D24}h2{font-size:14pt;color:#0F2D24}h3{font-size:12pt;color:#0F2D24}'+
  'table{border-collapse:collapse}th,td{border:1px solid #999;padding:3pt 6pt;font-size:10pt;vertical-align:top}th{background:#EDE6DE}code{font-family:Consolas,monospace}</style></head>'+
  '<body><h1>'+esc(title)+'</h1>'+renderMarkdown(md,0).replace(/<h1>/g,'<h2>').replace(/<\/h1>/g,'</h2>')+'</body></html>';
}
const exportWord=(title,md)=>download(slugify(title)+'.doc',new Blob(['﻿',wordHtml(title,md)],{type:'application/msword'}));
// Markdown keeps the title as a heading unless the text already opens with one (as in v3.7).
const withTitle=(title,md)=>{const t=String(md||'');return /^\s*#\s/.test(t)?t:'# '+title+'\n\n'+t};
const exportMarkdown=(title,md)=>download(slugify(title)+'.md',new Blob([withTitle(title,md)],{type:'text/markdown;charset=utf-8'}));
const exportText=(title,md)=>download(slugify(title)+'.txt',new Blob([withTitle(title,md)],{type:'text/plain;charset=utf-8'}));
// Markdown tables -> rows of cells; the |---| separator line is dropped.
function markdownTables(md){
 const tables=[];let cur=null;
 for(const line of String(md||'').split('\n')){
  const l=line.trim();
  if(/^\|.*\|$/.test(l)){if(/^\|[\s:|-]+\|$/.test(l)&&l.includes('-'))continue;cur=cur||[];cur.push(l.slice(1,-1).split('|').map(c=>c.trim().replace(/\*\*(.+?)\*\*/g,'$1').replace(/`([^`]+)`/g,'$1')))}
  else if(cur){tables.push(cur);cur=null}
 }
 if(cur)tables.push(cur);return tables;
}
const xml=v=>String(v==null?'':v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// Excel (SpreadsheetML, as in v3.7): one sheet per Markdown table; plain numbers stay numbers.
function excelXml(title,md){
 const tables=markdownTables(md);if(!tables.length)return null;
 const cell=v=>{const n=/^-?\d+([.,]\d+)?$/.test(v)?Number(v.replace(',','.')):NaN;return '<Cell><Data ss:Type="'+(Number.isFinite(n)?'Number':'String')+'">'+xml(Number.isFinite(n)?n:v)+'</Data></Cell>'};
 return '<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'+
  tables.map((rows,i)=>'<Worksheet ss:Name="'+xml(((tables.length>1?(i+1)+' ':'')+title).replace(/[\\\/?*\[\]:]/g,' ').slice(0,31))+'"><Table>'+rows.map(r=>'<Row>'+r.map(cell).join('')+'</Row>').join('')+'</Table></Worksheet>').join('')+'</Workbook>';
}
function exportExcel(title,md){const x=excelXml(title,md);if(!x)return false;download(slugify(title)+'.xls',new Blob([x],{type:'application/vnd.ms-excel'}));return true}
// PDF: the browser's print dialog on a clean copy of the document ("Salva come PDF"); no external library.
function exportPdf(title,md){
 const doc=root.document,f=doc.createElement('iframe');f.setAttribute('aria-hidden','true');f.style.cssText='position:fixed;width:0;height:0;border:0;right:0;bottom:0';
 f.srcdoc=wordHtml(title,md).replace('</style>','@page{margin:18mm}body{margin:0}</style>');
 f.onload=()=>{try{f.contentWindow.focus();f.contentWindow.print()}finally{setTimeout(()=>f.remove(),60000)}};
 doc.body.append(f);return f;
}

// Registry project -> the "project" profile api/chat.js puts at the top of every system prompt.
function profileFor(p){
 if(!p)return null;const pr=p.profile||{},brief=pr.brief||{};
 const pick=(...v)=>v.map(x=>Array.isArray(x)?x.join(', '):x).find(x=>x&&String(x).trim())||'';
 return {id:p.id,name:p.name,kind:pick(pr.kind,brief.industry,p.kind==='agency'?'Progetto Agency':p.kind==='personal'?'Personal brand':'Progetto'),
  summary:pick(p.summary,brief.goal),audience:pick(pr.audience,brief.audience),positioning:pick(pr.positioning),voice:pick(pr.voice,brief.brandRules),
  channels:pick(pr.channels,brief.channels),visual:pick(pr.visual),links:pick(pr.links),notes:pick(pr.notes,[brief.constraints,brief.market].filter(Boolean).join('\n')),decisions:pick(pr.decisions)};
}

// ---- Web Developer pages (v3.7 isHtmlDoc, htmlDocSource, htmlDocFilename, collectSitePages, exportHtmlFile) ----
function htmlSource(d){let b=String((d&&d.body)||'').trim();const f=/^```[a-zA-Z]*\s*\n([\s\S]*?)\n```\s*$/.exec(b);if(f)b=f[1];return b}
function isHtmlDoc(d){return /\.html?$/i.test(String((d&&d.title)||'').trim())||/^\s*(<!doctype\s+html|<html[\s>])/i.test(htmlSource(d))}
function htmlFilename(d){const t=String((d&&d.title)||'').trim();return /\.html?$/i.test(t)?t.replace(/\s+/g,'-').toLowerCase():slugify(t)+'.html'}
// One page per file name: the first complete version wins.
function sitePages(entries){const seen={};return (entries||[]).filter(e=>{if(!isHtmlDoc(e.doc))return false;const f=htmlFilename(e.doc);if(seen[f])return false;seen[f]=1;return true})}
const exportHtml=d=>download(htmlFilename(d),new Blob([htmlSource(d)],{type:'text/html;charset=utf-8'}));

// ---- flow summaries (v3.7 fmtDur, flowEta, pipelineFullText, collectDocuments, renderReadyPanel) ----
function fmtDur(ms){const s=Math.max(0,Math.round(ms/1000));return s<60?s+' s':Math.floor(s/60)+' min '+(s%60<10?'0':'')+(s%60)+' s'}
// Average of finished tasks x tasks left / parallelism.
function flowEta(flow,concurrency){
 const nodes=(flow&&flow.nodes)||[],done=nodes.filter(n=>n.status==='done'&&n.startedAt&&n.endedAt),left=nodes.filter(n=>n.status==='pending'||n.status==='running').length;
 if(!left)return '';if(!done.length)return 'stima disponibile dopo il primo compito';
 const avg=done.reduce((a,n)=>a+(n.endedAt-n.startedAt),0)/done.length;
 return 'circa '+fmtDur(avg*left/(concurrency||FLOW_CONCURRENCY))+' ancora';
}
function flowElapsed(flow,now){if(!flow||!flow.startedAt)return '';return fmtDur((flow.endedAt||now||Date.now())-flow.startedAt)}
// Every finished step, in order, as one text (slide blocks removed by the caller's strip function).
function flowFullText(flow,strip){
 return ((flow&&flow.nodes)||[]).filter(n=>(n.status==='done'||n.status==='stale')&&n.output)
  .map(n=>n.label.toUpperCase()+'\n'+(strip?strip(n.output):n.output)).join('\n\n');
}
// All documents of a conversation, from replies and from flow steps, with who made them.
function collectDocuments(hist,agentName){
 const out=[];
 (hist||[]).forEach(m=>{
  if(m.role==='assistant'&&!m.pending)parseDocuments(m.content).forEach(d=>out.push({doc:d,by:m.agent?label(m.agent):(agentName||'')}));
  if(m.flow&&Array.isArray(m.flow.nodes))m.flow.nodes.forEach(n=>{if((n.status==='done'||n.status==='stale')&&n.output)parseDocuments(n.output).forEach(d=>out.push({doc:d,by:n.label}))});
 });
 return out;
}
// What the Social Media Manager decided to create: reads the "Formato:" line, not the whole text,
// because the reasoning often names the discarded format too ("il video resta in riserva").
function pipelineDecision(flow){
 const nodes=(flow&&flow.nodes)||[],find=r=>nodes.find(n=>n.role===r&&n.status==='done'&&n.output);
 const smm=find('social-media-manager');if(!smm)return null;
 const m=/formato:?\**\s*([^\n]+)/i.exec(smm.output),f=(m?m[1]:smm.output).toLowerCase();
 return {format:m?m[1].replace(/\*+/g,'').trim():'',video:/video/.test(f),carousel:/carosell|carousel/.test(f),
  smm:nodes.indexOf(smm),copy:nodes.indexOf(find('copywriter')),art:nodes.indexOf(find('art-director')),ai:nodes.indexOf(find('ai-specialist'))};
}

return Object.freeze({AGENTS,AGENT_ALIASES,GROUP_LABELS,PIPELINE,MAX_CONTINUATIONS,FLOW_CONCURRENCY,MAX_ORCH_ROUNDS,
 agent,isHub,label,parseDocuments,stripDocuments,wordCount,slugify,parseRouting,stripRouting,looksLikeDraftedDocument,HUB_REROUTE_NOTE,
 postChat,reply,makeFlow,flowLog,runNodes,markStale,editNode,rerunNode,requeueStale,summaryPrompt,fmtDur,flowEta,flowElapsed,flowFullText,collectDocuments,pipelineDecision,htmlSource,isHtmlDoc,htmlFilename,sitePages,exportHtml,renderMarkdown,wordHtml,exportWord,exportMarkdown,exportText,exportExcel,exportPdf,excelXml,markdownTables,profileFor,escapeHtml:esc});
});
