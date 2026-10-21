/* RADIX Agenti AI — the v3.7 agent chat, orchestrators and post pipeline on registry projects.
   Each project keeps its conversations in the shared 'agents' document; every call carries the
   project profile and the team's confirmed memory (memoryScope, read on the server). */
(function(){
'use strict';
const ws=window.RadixWorkspace,rt=window.RadixAgents,media=window.RadixAgentMedia,$=id=>document.getElementById(id);
const MAX_KEPT=60,MAX_ATTACH=5,MAX_BYTES=4*1024*1024,ACCEPTED=['xlsx','xls','csv','txt','md','docx','pdf'];
const PIPELINE_STEPS={
 'strategist':'Dai la direzione strategica del post: pilastro, obiettivo, pubblico, angolo, formato e canale.',
 'copywriter':'Scrivi il testo completo del post seguendo la direzione strategica.',
 'art-director':'Definisci il concept visivo (o il carosello slide per slide) coerente con testo e direzione.',
 'ai-specialist':'Prepara i prompt pronti per generare immagini o video coerenti con il concept visivo.',
 'social-media-manager':'Chiudi con pubblicazione: canale, giorno e orario, hashtag, prima riga e cosa monitorare.'
};
let user=null,projects=[],project=null,doc=null,data=null,agentId='marketing-orchestrator',busy=false,attachments=[],saving=Promise.resolve();
const params=new URLSearchParams(location.search);

const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const btn=(text,fn,title)=>{const b=node('button',text);b.type='button';if(title)b.title=title;b.onclick=fn;return b};
const say=t=>{$('status').textContent=t};
const conv=()=>{data.conversations[agentId]=data.conversations[agentId]||[];return data.conversations[agentId]};
const forModel=hist=>hist.filter(m=>!m.pending&&(m.role==='user'||m.role==='assistant')).map(m=>({role:m.role,content:m.content}));
// HeyGen avatar and voice, Buffer channel: chosen once, shared by the team on this project.
let prefsDirty=false;
const teamPrefs={get:k=>(data&&data.prefs&&data.prefs[k])||null,set:(k,v)=>{if(!data||teamPrefs.get(k)===v)return;data.prefs=Object.assign({},data.prefs,{[k]:v});prefsDirty=true;persist()}};
const scope=role=>({projectId:project.id,clientId:project.client_id||'',agentId:role});
function call(role,messages,onProgress){return rt.reply({role,messages,project:rt.profileFor(project),memoryScope:scope(role)},{onProgress})}
const callOne=(role,text,onProgress)=>call(role,[{role:'user',content:text}],onProgress);

// ---- persistence: one shared document per project; on a conflict only this agent's thread is re-applied ----
function persist(){
 const id=agentId;
 saving=saving.then(async()=>{
  try{await doc.save(clean(data));prefsDirty=false}
  catch(e){
   if(!(e instanceof ws.ConflictError))throw e;
   // Someone else saved meanwhile: keep their other conversations, re-apply ours for this agent.
   const fresh=(await doc.load())||{conversations:{}};
   for(const [k,v] of Object.entries(fresh.conversations||{}))if(k!==id)data.conversations[k]=v;
   if(!prefsDirty)data.prefs=fresh.prefs||{};
   data.seoResults=fresh.seoResults;data.adCreatives=fresh.adCreatives;
   await doc.save(clean(data));prefsDirty=false;
  }
 }).catch(e=>say('Salvataggio non riuscito: '+e.message));
 return saving;
}
// seoResults (lib/seo-results-core.js: the Search Console imports of the Studio SEO e GEO) and adCreatives (lib/ad-studio.js:
// the saved ad creatives) are kept as they are.
function clean(d){const out={schemaVersion:1,conversations:{},prefs:Object.assign({},d.prefs)};if(d.seoResults)out.seoResults=d.seoResults;if(d.adCreatives)out.adCreatives=d.adCreatives;for(const [k,v] of Object.entries(d.conversations||{}))out.conversations[k]=(v||[]).filter(m=>!m.pending).slice(-MAX_KEPT);return out}

// ---- rendering ----
function renderRoster(){
 const q=$('filter').value.trim().toLowerCase(),box=$('roster');box.replaceChildren();
 for(const [group,labelText] of Object.entries(rt.GROUP_LABELS)){
  const list=rt.AGENTS.filter(a=>a.group===group&&(!q||(a.name+' '+a.blurb+' '+a.id).toLowerCase().includes(q)));
  if(!list.length)continue;box.append(node('h2',labelText));
  for(const a of list){
   const b=node('button',undefined,'agent');b.type='button';b.setAttribute('aria-current',String(a.id===agentId));
   const t=node('span');const s=node('strong',a.name);if(a.hub)s.append(node('span','orchestra','tag'));if(a.pipeline)s.append(node('span','pipeline','tag'));
   t.append(s,node('small',a.blurb));b.append(node('span',a.icon,'ic'),t);b.onclick=()=>selectAgent(a.id);box.append(b);
  }
 }
}
// ---- spunti dal piano editoriale: the project's PED contents still to write, for the Copywriter and the post pipeline ----
let pedCache={id:null,items:[]};
async function pedItems(){
 if(pedCache.id===project.id)return pedCache.items;
 let items=[];try{const d=await ws.documents.load(project.id,'editorial');items=(d&&d.data&&Array.isArray(d.data.contents)?d.data.contents:[]).filter(c=>c.status!=='approved').sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')).slice(0,8)}catch(e){}
 pedCache={id:project.id,items};return items;
}
async function renderQuick(){
 const box=$('quick');box.replaceChildren();const a=rt.agent(agentId);if(!project||!(agentId==='copywriter'||a.pipeline))return;
 const items=await pedItems();if(!items.length||rt.agent(agentId)!==a)return;
 box.append(node('span','Dal piano editoriale:','small'),...items.map(c=>{const b=btn(c.channel+' · '+c.title,()=>{$('input').value='Scrivi il post per '+c.channel+': '+c.title+(c.date?' (uscita prevista '+c.date+(c.time?' alle '+c.time:'')+')':'')+'.';$('input').focus()},'Usa come compito');b.className='chip';return b}));
}
function selectAgent(id){
 if(busy)return;agentId=rt.agent(id)?rt.agent(id).id:'marketing-orchestrator';
 const a=rt.agent(agentId);$('agent-name').textContent=a.icon+' '+a.name;$('agent-blurb').textContent=a.blurb;$('agent-group').textContent=rt.GROUP_LABELS[a.group]+(a.hub?' · orchestratore':'');
 const u=new URL(location.href);u.searchParams.set('agent',agentId);if(project)u.searchParams.set('project',project.id);history.replaceState(null,'',u);
 if(project)say('Agenti al lavoro su «'+project.name+'»: profilo del progetto e memoria confermata del team arrivano a ogni agente.');
 renderRoster();render();renderQuick();memoryInfo();
}
function docCard(d,by){
 const c=node('div',undefined,'doc'),t=node('div',undefined,'t');
 t.append(node('strong','📄 '+d.title),node('small',(by?by+' · ':'')+rt.wordCount(d.body)+' parole'+(d.incomplete?' · interrotto prima della fine':'')));
 if(rt.isHtmlDoc(d))c.append(t,btn('Anteprima sito',()=>openSite(d)),btn('HTML',()=>rt.exportHtml(d)));else c.append(t);
 c.append(btn('Apri',()=>openViewer(d.title,d.body)),btn('Word',()=>rt.exportWord(d.title,d.body)),btn('PDF',()=>rt.exportPdf(d.title,d.body)),btn('Markdown',()=>rt.exportMarkdown(d.title,d.body)));
 if(rt.markdownTables(d.body).length)c.append(btn('Excel',()=>rt.exportExcel(d.title,d.body)));
 return c;
}
function mdBlock(text){const d=node('div',undefined,'md');d.innerHTML=rt.renderMarkdown(text,1);return d}
function sourcesEl(sources){
 if(!sources||!sources.length)return null;const p=node('p',undefined,'meta');p.append('Fonti: ');
 sources.slice(0,8).forEach((s,i)=>{const a=node('a',s.title||s.url);a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';if(i)p.append(' · ');p.append(a)});return p;
}
function renderFlow(flow,msg){
 const box=node('div',undefined,'flow');
 const done=flow.nodes.filter(n=>n.status==='done').length;
 box.append(node('h3',(flow.pipeline?'Pipeline post':'Flusso di lavoro · giro '+(flow.round||1))+' · '+done+'/'+flow.nodes.length+' compiti completati'+(flow.status==='halted'?' · fermato':'')));
 const timing=[rt.flowElapsed(flow)&&'tempo '+rt.flowElapsed(flow),rt.flowEta(flow,flow.pipeline?1:rt.FLOW_CONCURRENCY)].filter(Boolean).join(' · ');
 if(timing)box.append(node('p',timing,'meta flow-time'));
 if(flow.pipeline){const map=node('div',undefined,'flow-map');flow.nodes.forEach((n,i)=>{if(i)map.append(node('span','→','arrow'));map.append(node('span',n.label,'st '+n.status))});box.append(map)}
 flow.nodes.forEach((n,i)=>{
  const row=node('div',undefined,'node'),head=node('div',undefined,'row');row.dataset.step=i;
  head.append(node('strong','#'+(i+1)+' '+n.label),node('span',{done:n.editedBy?'modificato da '+n.editedBy:'consegnato',stale:'da aggiornare',running:'al lavoro'+(n.progress?' · '+n.progress:''),error:'non riuscito',pending:'in attesa'}[n.status]||n.status,'st '+n.status));
  if(n.deps&&n.deps.length)head.append(node('small','usa il risultato di '+n.deps.map(d=>'#'+d).join(', '),'meta'));
  row.append(head,node('small',n.subtask,'meta'));
  if(n.status==='stale')row.append(node('small','Usa un risultato che è cambiato: aggiornalo per allinearlo.','meta'));
  if(n.status==='error'&&n.output){const e=node('p',String(n.output).replace(/^Errore:\s*/,''),'node-error');e.setAttribute('role','alert');row.append(e)}
  if((n.status==='done'||n.status==='stale')&&n.output){
   const docs=rt.parseDocuments(n.output);docs.forEach(d=>row.append(docCard(d,n.label)));
   const note=media.stripSlides(rt.stripDocuments(n.output));
   if(note){const det=node('details');det.append(node('summary',docs.length?'Nota dello specialista':'Risposta completa'),mdBlock(note));row.append(det)}
   if(!docs.length){const a=node('div',undefined,'actions');a.append(btn('Word',()=>rt.exportWord(n.label,n.output)),btn('Proponi in memoria',()=>remember(n.role,n.label+': '+n.subtask,n.output)));row.append(a)}
   const src=sourcesEl(n.sources);if(src)row.append(src);
   media.toolsFor(n.role,n.output,{project:rt.profileFor(project),prefix:'radix-'+project.id,prefs:teamPrefs,memoryScope:scope('art-director'),avatar:project.profile&&project.profile.avatar,studioUrl:'/agency/avatar.html?project='+encodeURIComponent(project.id)}).forEach(t=>row.append(t));
   if(!busy)row.append(stepTools(msg,i));
  }else if(n.status==='error'&&n.output)row.append(node('small',n.output,'meta'));
  box.append(row);
 });
 if(flow.pipeline&&flow.nodes.every(n=>n.status==='done')){const p=readyPanel(flow,box);if(p)box.append(p)}
 if(flow.nodes.some(n=>(n.status==='done'||n.status==='stale')&&n.output)){
  const full=()=>rt.flowFullText(flow,media.stripSlides),title=(flow.pipeline?'Pipeline post':'Flusso di lavoro')+' · '+project.name;
  const a=node('div',undefined,'actions flow-all');
  a.append(btn('Copia tutto',()=>navigator.clipboard.writeText(full()).then(()=>say('Risultato completo copiato.'),()=>say('Copia non riuscita: il browser non ha dato il permesso.'))),btn('Scarica tutto (Word)',()=>rt.exportWord(title,full())),btn('Scarica tutto (Markdown)',()=>rt.exportMarkdown(title,full())));
  box.append(a);
 }
 if(flow.nodes.some(n=>n.status==='stale')&&!busy){const a=node('div',undefined,'actions');a.append(btn('Aggiorna i passi successivi',()=>updateStale(msg)));box.append(a)}
 if(flow.nodes.some(n=>n.status==='error')&&!busy){const a=node('div',undefined,'actions');a.append(btn('Riprova i compiti non riusciti',()=>retryFlow(msg)));box.append(a)}
 if(flow.log&&flow.log.length){const det=node('details');det.append(node('summary','Registro del flusso ('+flow.log.length+')'));const log=node('div',undefined,'log');
  log.textContent=flow.log.map(l=>new Date(l.t).toLocaleTimeString('it-IT')+'  '+l.x).join('\n');log.style.whiteSpace='pre-wrap';det.append(log);box.append(det)}
 return box;
}
// v3.7 "cosa creare ora": the Social Media Manager's "Formato:" decides the main button; the other
// formats stay one click away. Buttons open the tool under the step that has the material (nothing is sent yet).
function readyPanel(flow,box){
 const d=rt.pipelineDecision(flow);if(!d)return null;
 const p=node('div',undefined,'ready-panel');p.append(node('strong','Deciso dal Social Media Manager · cosa creare ora'));
 if(d.format)p.append(node('p','Formato: '+d.format,'ready-decision'));
 const acts=node('div',undefined,'actions'),go=(i,what)=>()=>{const row=box.querySelector('.node[data-step="'+i+'"]');if(!row)return;const t=row.querySelector('.tool button.primary');row.scrollIntoView({behavior:'smooth',block:'center'});row.classList.add('focus');setTimeout(()=>row.classList.remove('focus'),1600);if(t&&!t.disabled)t.click();say(what)};
 const add=(i,text,what,primary)=>{if(i<0)return false;const b=btn(text,go(i,what));if(primary)b.className='primary';acts.append(b);return true};
 let main=false;
 if(d.video)main=add(d.ai,'🎬 Crea il video','Video: usa lo strumento sotto AI Specialist.',true)||main;
 if(d.carousel)main=add(d.art,'🖼 Crea il carosello','Carosello: usa lo strumento sotto Art Director.',true)||main;
 if(!main)p.append(node('p',d.video||d.carousel?'Il passo indicato non ha ancora un risultato da cui generare il file.':'Post testuale o immagine singola: il testo del Copywriter è pronto, non serve altro da creare.','meta'));
 if(!d.video)add(d.ai,'Video','Video: usa lo strumento sotto AI Specialist.');
 if(!d.carousel)add(d.art,'Carosello','Carosello: usa lo strumento sotto Art Director.');
 add(d.copy,'📅 Programma in Buffer','Buffer: usa lo strumento sotto Copywriter.');
 p.append(acts);return p;
}
// Hub replies without a flow (e.g. v3.7 conversations copied from the Archive): open each routed task with its specialist.
function routingButtons(text){
 const items=rt.parseRouting(text);if(!items.length)return null;
 const wrap=node('div',undefined,'actions routing-list');wrap.append(node('small','Smistato a:','meta'));
 items.forEach(it=>{const a=rt.agent(it.role);if(!a)return;const b=btn(a.icon+' '+a.name+' → apri con questo compito',()=>{selectAgent(a.id);$('input').value=it.subtask;$('input').focus()},it.subtask);wrap.append(b)});
 return wrap;
}
function deliverablesPanel(hist){
 const docs=rt.collectDocuments(hist,rt.label(agentId));if(!docs.length)return null;
 const det=node('details',undefined,'deliverables');det.open=docs.length<=6;
 det.append(node('summary','📁 Documenti prodotti in questa conversazione · '+docs.length+(docs.length===1?' documento':' documenti')));
 docs.forEach(e=>det.append(docCard(e.doc,e.by)));
 return det;
}
function render(){
 const box=$('thread');box.replaceChildren();
 if(!data||!project){return}
 const hist=conv(),visible=hist.filter(m=>!m.hidden);
 if(!visible.length){
  const a=rt.agent(agentId),e=node('div',undefined,'empty');
  e.append(node('p','Nessuna conversazione con '+a.name+' su «'+project.name+'».'));
  const ul=node('ul');(a.hub?['Descrivi l’obiettivo: l’orchestratore pianifica, smista agli specialisti e ti riporta l’esito con i documenti scaricabili.','I flussi girano fino a '+rt.MAX_ORCH_ROUNDS+' giri, '+rt.FLOW_CONCURRENCY+' specialisti alla volta.']
   :a.pipeline?['Scrivi il brief di un post: cinque specialisti lavorano in fila, ognuno sul risultato del precedente.']
   :['Chiedi un deliverable: i documenti arrivano come schede da aprire o scaricare in Word e Markdown.','Allega file Excel, CSV, Word, PDF o testo come materiale di partenza.']).forEach(t=>ul.append(node('li',t)));
  e.append(ul);box.append(e);
 }
 for(const m of visible){
  const el=node('div',undefined,'msg '+(m.role==='user'?'user':m.role==='error'?'error':'')+(m.pending?' pending':''));
  if(m.role==='user'){el.append(node('div',(m.by||'Tu')+(m.at?' · '+new Date(m.at).toLocaleString('it-IT'):''),'meta'),node('div',m.display||m.content))}
  else if(m.role==='error')el.append(node('div',m.content));
  else if(m.pending)el.append(node('div',m.content));
  else{
   const a=rt.agent(m.agent||agentId);el.append(node('div',(a?a.icon+' '+a.name:'Agente')+(m.at?' · '+new Date(m.at).toLocaleString('it-IT'):''),'meta'));
   const body=media.stripSlides(rt.stripRouting(rt.stripDocuments(m.content)));if(body)el.append(mdBlock(body));
   const slides=media.parseSlides(m.content);if(slides.length)el.append(node('p',slides.length+' slide pronte per il carosello: generale qui sotto.','meta'));
   rt.parseDocuments(m.content).forEach(d=>el.append(docCard(d,a&&a.name)));
   const s=sourcesEl(m.sources);if(s)el.append(s);
   if(m.flow)el.append(renderFlow(m.flow,m));
   else if(rt.isHub(m.agent||agentId)){const r=routingButtons(m.content);if(r)el.append(r)}
   const acts=node('div',undefined,'actions');
   acts.append(btn('Copia',()=>navigator.clipboard.writeText(m.content).then(()=>say('Testo copiato.'))),btn('Word',()=>rt.exportWord((a?a.name:'Risposta')+' · '+project.name,m.content)),btn('PDF',()=>rt.exportPdf((a?a.name:'Risposta')+' · '+project.name,m.content)),btn('Markdown',()=>rt.exportMarkdown((a?a.name:'Risposta')+' · '+project.name,m.content)),btn('Proponi in memoria',()=>remember(m.agent||agentId,(a?a.name:'Agente')+' · '+project.name,m.content)));
   if((m.agent||agentId)==='copywriter')acts.append(node('small',m.content.length+' caratteri','char-count'));
   if(rt.markdownTables(m.content).length)acts.append(btn('Excel',()=>rt.exportExcel((a?a.name:'Risposta')+' · '+project.name,m.content)));
   el.append(acts);
   if(!m.flow)media.toolsFor(m.agent||agentId,m.content,{project:rt.profileFor(project),prefix:'radix-'+project.id,prefs:teamPrefs,memoryScope:scope('art-director'),avatar:project.profile&&project.profile.avatar,studioUrl:'/agency/avatar.html?project='+encodeURIComponent(project.id)}).forEach(t=>el.append(t));
  }
  box.append(el);
 }
 const dp=deliverablesPanel(hist);if(dp)box.append(dp);
 box.scrollTop=box.scrollHeight;
 const has=forModel(hist).length>0;
 $('send').disabled=busy;$('input').disabled=false;$('attach').disabled=busy;$('reset').disabled=busy||!hist.length;
 $('regenerate').disabled=busy||!has;
}
function openViewer(title,body){$('viewer-title').textContent=title;$('viewer-body').innerHTML=rt.renderMarkdown(body,0);
 $('viewer-word').onclick=()=>rt.exportWord(title,body);$('viewer-md').onclick=()=>rt.exportMarkdown(title,body);$('viewer-pdf').onclick=()=>rt.exportPdf(title,body);$('viewer-xls').hidden=!rt.markdownTables(body).length;$('viewer-xls').onclick=()=>rt.exportExcel(title,body);$('viewer-txt').onclick=()=>rt.exportText(title,body);$('viewer-copy').onclick=()=>navigator.clipboard.writeText(body).then(()=>say('Documento copiato.'));$('viewer').showModal()}
$('viewer-close').onclick=()=>$('viewer').close();
// ---- Web Developer site preview (v3.7 openSitePreview): sandboxed without scripts; links between pages switch tabs ----
let sitePagesList=[],siteCurrent=null;
function openSite(d){
 const pages=rt.sitePages(rt.collectDocuments(conv(),rt.label(agentId))),same=p=>rt.htmlFilename(p.doc)===rt.htmlFilename(d);
 if(!pages.some(same))pages.unshift({doc:d});sitePagesList=pages;showSitePage(pages.find(same)||pages[0]);
 $('site-download-all').hidden=pages.length<2;if(!$('site').open)$('site').showModal();
}
function showSitePage(p){
 siteCurrent=p;$('site-title').textContent=rt.htmlFilename(p.doc)+(p.by?' · '+p.by:'');
 $('site-tabs').replaceChildren(...sitePagesList.map(x=>{const b=btn(rt.htmlFilename(x.doc),()=>showSitePage(x));b.setAttribute('role','tab');b.setAttribute('aria-selected',String(x===p));return b}));
 $('site-frame').srcdoc=rt.htmlSource(p.doc);
}
$('site-frame').addEventListener('load',()=>{
 let doc;try{doc=$('site-frame').contentDocument}catch(e){return}if(!doc)return;
 doc.addEventListener('click',e=>{
  const a=e.target.closest&&e.target.closest('a[href]');if(!a)return;e.preventDefault();
  const href=a.getAttribute('href')||'',name=href.split(/[?#]/)[0].replace(/^\.?\//,'').toLowerCase();
  if(/^https?:\/\//i.test(href)){window.open(href,'_blank','noopener,noreferrer');return}
  if(!name){if(href.startsWith('#')){const t=doc.getElementById(href.slice(1));if(t)t.scrollIntoView()}return}
  const target=sitePagesList.find(x=>rt.htmlFilename(x.doc)===name||(name==='index.html'&&x===sitePagesList[0]));
  if(target)showSitePage(target);else say('La pagina «'+name+'» non è tra quelle prodotte in questa conversazione.');
 });
});
const siteView=mobile=>{$('site-wrap').classList.toggle('mobile',mobile);$('site-mobile').setAttribute('aria-pressed',String(mobile));$('site-desktop').setAttribute('aria-pressed',String(!mobile))};
$('site-mobile').onclick=()=>siteView(true);$('site-desktop').onclick=()=>siteView(false);
$('site-download').onclick=()=>siteCurrent&&rt.exportHtml(siteCurrent.doc);$('site-download-all').onclick=()=>sitePagesList.forEach(p=>rt.exportHtml(p.doc));
$('site-close').onclick=()=>$('site').close();
// ---- presentation mode (v3.7 setPresent): only the conversation and the flows, full width; remembered on this browser ----
function setPresent(on){document.body.classList.toggle('present',on);$('present').textContent=on?'🎥 Esci dalla presentazione':'🎥 Presentazione';$('present').setAttribute('aria-pressed',String(on));try{localStorage.setItem('radix.present',on?'1':'0')}catch(e){}}
$('present').onclick=()=>setPresent(!document.body.classList.contains('present'));
try{if(localStorage.getItem('radix.present')==='1')setPresent(true)}catch(e){}

// What an agent produced can be proposed to the team memory; a person confirms it there.
async function remember(role,title,content){
 const text=rt.stripRouting(content).slice(0,3900);if(text.length<5)return;
 try{
  const r=await fetch('/api/agency-memory',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({level:'project',kind:'outcome',projectId:project.id,clientId:project.client_id||'',agentId:role,title:title.slice(0,140),content:text,source:('Agente '+rt.label(role)+' · '+new Date().toLocaleDateString('it-IT')).slice(0,200)})});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Errore '+r.status);
  say('Proposta salvata nella memoria del progetto: confermala dalla pagina Memoria per renderla disponibile agli agenti.');memoryInfo();
 }catch(e){say('Memoria non aggiornata: '+e.message)}
}

// ---- conversations ----
async function requestReply(){
 const id=agentId,hist=conv(),pending={role:'assistant',content:'Sto scrivendo…',pending:true};
 hist.push(pending);busy=true;render();
 try{
  let r=await call(id,forModel(hist),p=>{pending.content='Il testo è lungo: continuo a scriverlo (parte '+p+')…';render()});
  hist.pop();let msg={role:'assistant',agent:id,content:r.text||'(risposta vuota)',sources:r.sources,at:new Date().toISOString()};hist.push(msg);
  if(rt.isHub(id)){
   let items=rt.parseRouting(msg.content);
   if(!items.length&&rt.looksLikeDraftedDocument(msg.content)){
    hist.pop();const discarded=msg.content;const wait={role:'assistant',content:'L’orchestratore stava scrivendo un documento da solo: lo faccio smistare agli specialisti…',pending:true};hist.push(wait);render();
    const retry=await call(id,forModel(hist).concat([{role:'assistant',content:discarded.slice(0,1500)+'\n[…]'},{role:'user',content:rt.HUB_REROUTE_NOTE}]));
    hist.pop();msg={role:'assistant',agent:id,content:retry.text||'(risposta vuota)',sources:retry.sources,at:new Date().toISOString()};hist.push(msg);items=rt.parseRouting(msg.content);
   }
   if(items.length){
    const prior=[...hist].reverse().find(m=>m.role==='user'&&!m.hidden);
    msg.flow=rt.makeFlow(items,1);msg.flow.task=prior?(prior.display||prior.content):'';
    persist();await orchestrate(id,hist,msg,1);
   }
  }
 }catch(e){if(hist.length&&hist[hist.length-1].pending)hist.pop();hist.push({role:'error',content:e.status===401?'Sessione scaduta: accedi di nuovo dal Command Center.':'Chiamata non riuscita: '+e.message})}
 busy=false;render();await persist();
}
// v3.7 runOrchestrationFlow: specialists work in dependency order, then the hub reports back
// and may open another round for what is still missing.
async function orchestrate(id,hist,msg,round){
 const flow=msg.flow;flow.status='running';flow.round=round;flow.startedAt=flow.startedAt||Date.now();
 rt.flowLog(flow,'plan',rt.label(id)+' ha pianificato '+flow.nodes.length+' compiti (giro '+round+')');render();
 await rt.runNodes(flow,{call:(role,text,onP)=>callOne(role,text,onP),onUpdate:()=>{render();persist()}});
 if(flow.halted){flow.status='halted';return}
 if(!flow.nodes.some(n=>n.status==='done')){flow.status='error';return}
 const {prompt,produced}=rt.summaryPrompt(flow.task,flow,round);
 const pending={role:'assistant',content:'Sto raccogliendo i risultati degli specialisti…',pending:true};hist.push(pending);render();
 try{
  const synth=await callOne(id,prompt);
  hist.pop();
  if(produced.length)hist.push({role:'user',hidden:true,content:'[Nota automatica della piattaforma — esito del flusso di lavoro, giro '+round+'] Documenti consegnati come schede scaricabili sotto il flusso: '+produced.map((d,i)=>(i+1)+') "'+d.title+'" di '+d.by+(d.incomplete?' (interrotto)':'')).join('; ')+'.'});
  const next={role:'assistant',agent:id,content:synth.text||'(risposta vuota)',sources:synth.sources,at:new Date().toISOString()};hist.push(next);
  flow.status='done';flow.endedAt=Date.now();rt.flowLog(flow,'done','Flusso completato: '+produced.length+' documenti');
  const more=round<rt.MAX_ORCH_ROUNDS?rt.parseRouting(next.content):[];
  if(more.length){next.flow=rt.makeFlow(more,round+1);next.flow.task=flow.task;persist();await orchestrate(id,hist,next,round+1)}
 }catch(e){if(hist.length&&hist[hist.length-1].pending)hist.pop();hist.push({role:'error',content:'Sintesi non riuscita: '+e.message});flow.status='error'}
}
// ---- one step of a finished flow: edit by hand, regenerate, or reply to that specialist (v3.7 pipeline) ----
let stepUi=null;// {flow, i, mode:'edit'|'reply'}
function stepTools(msg,i){
 const n=msg.flow.nodes[i],wrap=node('div',undefined,'step-tools');
 if(stepUi&&stepUi.flow===msg.flow&&stepUi.i===i){
  const ta=node('textarea');ta.rows=stepUi.mode==='edit'?10:3;ta.value=stepUi.mode==='edit'?n.output:'';ta.placeholder=stepUi.mode==='reply'?'Rispondi a '+n.label+': cosa cambiare o le informazioni che chiedeva':'';ta.setAttribute('aria-label',stepUi.mode==='edit'?'Testo del passo':'Risposta a '+n.label);
  const ok=btn(stepUi.mode==='edit'?'Salva modifica':'Invia e rigenera',async()=>{const v=ta.value;if(stepUi.mode==='edit'){try{const k=rt.editNode(msg.flow,i,v,user&&user.name);stepUi=null;render();await persist();say('Passo modificato'+(k?': '+k+(k===1?' passo successivo da aggiornare.':' passi successivi da aggiornare.'):'.'))}catch(e){say(e.message)}}else{if(!v.trim()){say('Scrivi la risposta per '+n.label+'.');return}stepUi=null;await runStep(msg,i,v)}});
  const no=btn('Annulla',()=>{stepUi=null;render()});wrap.append(ta,ok,no);setTimeout(()=>ta.focus(),0);return wrap;
 }
 wrap.append(btn('Modifica',()=>{stepUi={flow:msg.flow,i,mode:'edit'};render()}),btn('Rigenera',()=>runStep(msg,i,'')),btn('Rispondi',()=>{stepUi={flow:msg.flow,i,mode:'reply'};render()}));
 return wrap;
}
async function runStep(msg,i,note){
 if(busy)return;const n=msg.flow.nodes[i];if(!note&&!confirm('Rigenerare il lavoro di '+n.label+'? La chiamata consuma crediti e sostituisce la versione attuale.'))return;
 busy=true;render();
 try{const k=await rt.rerunNode(msg.flow,i,{call:(role,text,onP)=>callOne(role,text,onP),note,onUpdate:()=>{render()}});say(n.status==='done'?n.label+' ha consegnato una nuova versione'+(k?'; '+k+(k===1?' passo successivo da aggiornare.':' passi successivi da aggiornare.'):'.'):n.label+' non è riuscito: '+n.output)}
 catch(e){say(e.message)}finally{busy=false;render();await persist()}
}
async function updateStale(msg){
 if(busy)return;const k=rt.requeueStale(msg.flow);if(!k)return;busy=true;say('Aggiorno '+k+(k===1?' passo':' passi')+' con il nuovo materiale…');render();
 try{await rt.runNodes(msg.flow,{call:(role,text,onP)=>callOne(role,text,onP),concurrency:msg.flow.pipeline?1:rt.FLOW_CONCURRENCY,onUpdate:()=>{render();persist()}});msg.flow.status=msg.flow.nodes.every(n=>n.status==='done')?'done':'error';say('Passi aggiornati.')}
 finally{busy=false;render();await persist()}
}
async function retryFlow(msg){
 if(busy)return;busy=true;msg.flow.nodes.forEach(n=>{if(n.status==='error'){n.status='pending';n.output=null}});
 try{if(msg.flow.pipeline){await runPipelineFlow(msg)}else await orchestrate(msg.agent||agentId,conv(),msg,msg.flow.round||1)}finally{busy=false;render();persist()}
}
// "Pipeline post": five specialists in a row, each working on everything produced before.
async function runPipelineFlow(msg){
 const flow=msg.flow;flow.status='running';flow.startedAt=flow.startedAt||Date.now();delete flow.endedAt;
 await rt.runNodes(flow,{call:(role,text,onP)=>callOne(role,text,onP),concurrency:1,onUpdate:()=>{render();persist()}});
 flow.status=flow.nodes.every(n=>n.status==='done')?'done':flow.halted?'halted':'error';flow.endedAt=Date.now();
}
async function runPipeline(task){
 const hist=conv(),items=rt.PIPELINE.map((role,i)=>({role,subtask:'Brief del post: '+task+'\n\nIl tuo compito in questa pipeline: '+PIPELINE_STEPS[role],deps:Array.from({length:i},(_,k)=>k+1)}));
 const msg={role:'assistant',agent:'orchestrator',content:'Pipeline avviata: '+rt.PIPELINE.map(rt.label).join(' → ')+'.',at:new Date().toISOString()};
 msg.flow=rt.makeFlow(items,1);msg.flow.pipeline=true;msg.flow.task=task;hist.push(msg);busy=true;render();
 try{await runPipelineFlow(msg)}finally{busy=false;render();await persist()}
}

$('composer').onsubmit=async e=>{
 e.preventDefault();if(busy||!project)return;const text=$('input').value.trim();if(!text)return;
 const content=attachments.reduce((acc,f)=>acc+'\n\n[Contenuto del file allegato "'+f.name+'"]\n'+f.text,text);
 const display=attachments.length?text+'  '+attachments.map(f=>'📎 '+f.name).join(' '):text;
 $('input').value='';attachments=[];renderChips();
 if(rt.agent(agentId).pipeline){conv().push({role:'user',content,display,by:user.name,at:new Date().toISOString()});await runPipeline(content);return}
 conv().push({role:'user',content,display,by:user.name,at:new Date().toISOString()});await requestReply();
};
$('input').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))$('composer').requestSubmit()});
$('regenerate').onclick=async()=>{if(busy)return;const hist=conv();while(hist.length&&hist[hist.length-1].role!=='user')hist.pop();if(!hist.length)return;if(rt.agent(agentId).pipeline){const last=hist[hist.length-1];await runPipeline(last.content);return}await requestReply()};
$('reset').onclick=async()=>{if(busy||!confirm('Cancellare per tutto il team la conversazione con '+rt.label(agentId)+' su questo progetto? I documenti scaricati restano sul tuo computer.'))return;data.conversations[agentId]=[];render();await persist();say('Conversazione cancellata.')};
$('filter').oninput=renderRoster;

// ---- attachments (/api/parse-file, same limits as v3.7) ----
function renderChips(){const box=$('chips');box.replaceChildren(...attachments.map((f,i)=>{const c=node('span','📎 '+f.name,'chip');c.append(btn('×',()=>{attachments.splice(i,1);renderChips()},'Rimuovi '+f.name));return c}))}
$('attach').onclick=()=>$('file').click();
async function addFiles(files){
 for(const file of Array.from(files||[])){
  if(attachments.length>=MAX_ATTACH){say('Massimo '+MAX_ATTACH+' file per messaggio.');break}
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(!ACCEPTED.includes(ext)){say('Formato non supportato: '+file.name);continue}
  if(file.size>MAX_BYTES){say('File troppo grande (max 4MB): '+file.name);continue}
  say('Leggo '+file.name+'…');
  try{
   const bytes=new Uint8Array(await file.arrayBuffer());let bin='';for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));
   const r=await fetch('/api/parse-file',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({filename:file.name,contentBase64:btoa(bin)})});
   const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Errore lettura file');
   attachments.push({name:file.name,text:String(d.text||'')});say(file.name+' allegato.');
  }catch(e){say('Non sono riuscito a leggere '+file.name+': '+e.message)}
 }
 $('file').value='';renderChips();
}
$('file').onchange=()=>addFiles($('file').files);
// Files dropped on the conversation or the composer are attached like the 📎 button (v3.7 drag and drop).
for(const zone of [$('thread'),$('composer')]){
 zone.addEventListener('dragover',e=>{if(!project||busy||!e.dataTransfer||![...e.dataTransfer.types].includes('Files'))return;e.preventDefault();$('composer').classList.add('dropping')});
 zone.addEventListener('dragleave',()=>$('composer').classList.remove('dropping'));
 zone.addEventListener('drop',e=>{$('composer').classList.remove('dropping');if(!project||busy||!e.dataTransfer||!e.dataTransfer.files.length)return;e.preventDefault();addFiles(e.dataTransfer.files)});
}

// ---- project ----
// What this agent receives from the team memory on this project, and what waits for confirmation.
let memoryReq=0;
async function memoryInfo(){
 const el=$('memory-info');if(!el||!project)return;const req=++memoryReq,q='?projectId='+encodeURIComponent(project.id)+'&clientId='+encodeURIComponent(project.client_id||'')+'&agentId='+encodeURIComponent(agentId);
 try{
  const get=u=>fetch('/api/agency-memory'+u,{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('HTTP '+r.status)));
  const [ctx,list]=await Promise.all([get(q+'&mode=context'),get(q)]);if(req!==memoryReq)return;
  const n=(ctx.used||[]).length,pending=(list.items||[]).filter(m=>m.status==='proposed').length;
  el.replaceChildren();const a=node('a',(n?'Memoria: '+n+(n===1?' elemento confermato':' elementi confermati')+' arriva a questo agente':'Memoria: nessun elemento confermato per ora')+(pending?' · '+pending+' da confermare':'')+' ↗');
  a.href='/agency/memory.html?id='+encodeURIComponent(project.id)+(pending?'&status=proposed':'');el.append(a);el.dataset.count=String(n);el.dataset.pending=String(pending);
 }catch(e){if(req===memoryReq)el.textContent='Memoria non raggiungibile in questo momento.'}
}
function projectLinks(){
 const box=$('project-links');box.replaceChildren();const id=encodeURIComponent(project.id);
 const links=[];if(project.kind==='agency')links.push(['/agency/project-workspace.html?id='+id,'Workspace Agency']);
 links.push(['/project-editorial.html?project='+id,'Piano editoriale'],['/radix-pm-concept.html?project='+id,'Project manager'],['/agency/memory.html?id='+id,'Memoria del progetto'],['/project-profile.html?id='+id,'Profilo per gli agenti']);
 for(const [href,text] of links){const a=node('a',text+' ↗');a.href=href;a.dataset.projectLink='1';box.append(a)}
 const mi=node('span',undefined,'memory-info');mi.id='memory-info';box.append(mi);
 $('nav-ped').href='/project-editorial.html?project='+id;$('nav-pm').href='/radix-pm-concept.html?project='+id;$('nav-memory').href='/agency/memory.html?id='+id;
}
async function openProject(id){
 project=projects.find(p=>p.id===id)||projects[0];$('project').value=project.id;
 doc=ws.bind(project.id,'agents');data=(await doc.load())||{schemaVersion:1,conversations:{}};data.conversations=data.conversations||{};
 projectLinks();selectAgent(agentId);say('Agenti al lavoro su «'+project.name+'»: profilo del progetto e memoria confermata del team arrivano a ogni agente.');
}
$('project').onchange=()=>{if(busy){$('project').value=project.id;return}openProject($('project').value).catch(e=>say(e.message))};

// Agent status light (free GET, as in v3.7) and the signed-in person with a logout.
async function checkApi(){const el=$('api-status');try{const r=await fetch('/api/chat',{credentials:'same-origin',cache:'no-store'});const d=await r.json().catch(()=>({}));if(r.ok&&d.configured){el.textContent='● Agenti collegati';el.dataset.state='ok'}else{el.textContent=r.status===401?'● Accesso richiesto':'● Agenti non configurati sul server';el.dataset.state='err'}}catch(e){el.textContent='● Agenti non raggiungibili';el.dataset.state='err'}}
$('logout').onclick=async()=>{if(busy&&!confirm('Un agente sta ancora lavorando. Uscire comunque?'))return;try{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'})}finally{location.href='/control-center-v2.html'}};
// Colleagues' replies appear when you come back to the tab, without reloading the page.
document.addEventListener('visibilitychange',async()=>{if(document.visibilityState!=='visible'||!project||!doc||busy)return;try{const fresh=await doc.load();if(fresh&&!prefsDirty&&data)data.prefs=fresh.prefs||{};if(fresh&&data){data.seoResults=fresh.seoResults;data.adCreatives=fresh.adCreatives}if(fresh&&!busy&&JSON.stringify(fresh.conversations||{})!==JSON.stringify(clean(data).conversations)){data=fresh;data.conversations=data.conversations||{};render();say('Conversazioni aggiornate con il lavoro del team.')}}catch(e){}});
async function boot(){
 renderRoster();checkApi();
 try{
  user=await ws.ready();
  if(!user){say('');const p=node('p','Accedi a RADIX dal Command Center per usare gli agenti. ');const a=node('a','Vai al Command Center');a.href='/control-center-v2.html';p.append(a);$('thread').replaceChildren(p);return}
  $('me').textContent=user.name||user.email||'';$('logout').hidden=false;
  projects=(await ws.projects.list()).filter(p=>p.status!=='archived');
  if(!projects.length){say('Nessun progetto nell’archivio: creane uno dalle pagine Agency o Project manager.');return}
  $('project').replaceChildren(...projects.map(p=>{const o=node('option',p.name+(p.client_name?' · '+p.client_name:''));o.value=p.id;return o}));$('project').disabled=false;
  if(params.get('agent'))agentId=(rt.agent(params.get('agent'))||rt.agent(agentId)).id;
  await openProject((params.get('project')||'').toLowerCase());
  // «Ask RADIX» from the Command Center: the question is prefilled, never sent on its own.
  const q=(params.get('q')||'').slice(0,2000);if(q&&!$('input').value){$('input').value=q;$('input').focus()}
 }catch(e){say(e.message)}
}
boot();
})();
