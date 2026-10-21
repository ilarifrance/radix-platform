/* Studio SEO e GEO: the guided plan to be found on Google and cited by AI assistants. A few questions, ONE AI call to
   the SEO and GEO specialist that writes three alternative strategies, the person picks one and copies it, downloads it
   as Markdown or saves it in the project (a document in the specialist's thread on the Agenti AI page).
   Pure part (questions, prefill, prompt, parsing, Markdown, the saved entry) runs in Node for the tests; seoStudio() is
   the browser widget. The only paid step is the AI call, started from a click with confirmation.
   A second tab, «Risultati SEO», loads lib/seo-results.js on first use: the Search Console numbers and the AI next steps. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixSeoStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
// Italian label → words for the prompt. `def` is the default option (first when missing).
const QUESTIONS=[
 {id:'goal',label:'Obiettivo principale',options:[['Più chiamate e contatti','avere più chiamate, richieste di preventivo e contatti dal sito'],['Visibilità locale','farsi trovare da chi cerca nella propria zona (ricerche «vicino a me», Google Maps, scheda dell’attività)'],['Citati dalle AI','essere citati e consigliati dagli assistenti AI come ChatGPT, Perplexity e le risposte AI di Google'],['Vendite ecommerce','vendere di più online dalle schede prodotto e dalle categorie del negozio']]},
 {id:'customers',label:'Chi compra',options:[['Privati','privati (B2C)'],['Aziende','aziende e professionisti (B2B)'],['Entrambi','sia privati sia aziende']]}
];
const AGENT='seo-geo',COUNT=3,FIELD_MAX=400,COMPETITORS=3;
const LIMITS={keywords:12,pages:5,geo:8,steps:10};
const question=id=>QUESTIONS.find(q=>q.id===id);
const fallback=q=>q.options[q.def||0][1];
function pick(id,v){const q=question(id),o=q.options.find(x=>x[1]===v);if(v!=null&&v!==''&&!o)throw Error('Risposta non valida per «'+q.label+'».');return o?o[1]:fallback(q)}
const labelOf=(id,v)=>{const q=question(id);return (q.options.find(x=>x[1]===v)||q.options[q.def||0])[0]};
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
// A site address the person typed: «example.it», «www.example.it/x» or a full http(s) URL. '' when empty; throws when it is not an address.
function siteUrl(v){const s=clean(v);if(!s)return '';const u=/^https?:\/\//i.test(s)?s:'https://'+s;
 let x;try{x=new URL(u)}catch(e){x=null}
 if(!x||!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(x.hostname)||/\s/.test(s))throw Error('L’indirizzo del sito non sembra valido (es. www.esempio.it).');
 return x.href.replace(/\/$/,'')}
// The project profile (RadixAgents.profileFor) → what the questions start from: offer, customers and the site among the links.
function prefill(profile){const p=profile||{};
 const offer=clean(p.summary||p.positioning||'').slice(0,FIELD_MAX),audience=clean(p.audience).slice(0,FIELD_MAX);
 const link=(String(p.links||'').match(/https?:\/\/[^\s,;)<>"']+/i)||[''])[0].replace(/[.]+$/,'');
 const a=audience.toLowerCase(),b2b=/aziend|impres|b2b|professionist|pmi|startup|societ/.test(a),b2c=/privat|famigli|person|b2c|consumator|client[ie] finali/.test(a);
 return {offer,audience,site:link,customers:b2b&&b2c?QUESTIONS[1].options[2][1]:b2b?QUESTIONS[1].options[1][1]:QUESTIONS[1].options[0][1]}}
// The one request to the SEO and GEO specialist: three alternative strategies in a format parseStrategies() reads back.
function strategiesPrompt(answers,{offer,audience,site,competitors,project}={}){const a=answers||{},what=clean(offer);
 if(what.length<10)throw Error('Scrivi in una frase cosa vende l’attività e dove.');
 const url=siteUrl(site),rivals=(Array.isArray(competitors)?competitors:[]).map(c=>clean(c).slice(0,120)).filter(Boolean).slice(0,COMPETITORS),p=project||{},lines=[];
 lines.push('Prepara '+COUNT+' strategie SEO e GEO alternative tra loro per il progetto'+(p.name?' «'+clean(p.name).slice(0,80)+'»':'')+': farsi trovare su Google e farsi citare nelle risposte degli assistenti AI (ChatGPT, Perplexity, risposte AI di Google).');
 lines.push('Cosa vende e dove: «'+what.slice(0,FIELD_MAX)+'».');
 lines.push('Clienti: '+pick('customers',a.customers)+(clean(audience)?'; in particolare «'+clean(audience).slice(0,FIELD_MAX)+'»':'')+'.');
 lines.push('Obiettivo principale: '+pick('goal',a.goal)+'.');
 lines.push(url?'Sito: '+url+' (non l’hai visitato: non descriverne lo stato attuale, proponi cosa controllare).':'Sito: non indicato (potrebbe non esserci ancora).');
 if(rivals.length)lines.push('Concorrenti indicati: '+rivals.map(r=>'«'+r+'»').join(', ')+'. Usali solo per capire contro chi ci si posiziona: non inventare cosa fanno.');
 lines.push('Le tre strategie devono avere un focus diverso (per esempio: ricerche locali, domande dei clienti e contenuti utili, citazioni nelle AI e autorevolezza).');
 lines.push('Per ogni strategia: un titolo; il focus in una frase; da 8 a 12 parole chiave o domande che le persone cercano davvero, scritte come le scriverebbero; 3 pagine o contenuti da creare o ottimizzare, con lo scopo di ognuno; le azioni GEO (FAQ, dati strutturati schema.org, citazioni e menzioni su fonti esterne, coerenza di nome, indirizzo e contatti su sito, scheda Google e profili); i passi dei primi 30 giorni, in ordine.');
 lines.push('Usa solo i fatti confermati del progetto e quelli scritti qui. Non inventare posizionamenti su Google, volumi di ricerca, traffico, percentuali, prezzi o altri numeri. Se un volume di ricerca o un dato non è disponibile, scrivi «da verificare».');
 lines.push('Italiano semplice, frasi brevi, niente gergo non spiegato, niente emoji.');
 lines.push('Rispondi solo in questo formato, senza testo prima o dopo:');
 for(let i=1;i<=COUNT;i++)lines.push('===STRATEGIA '+i+'===\nTITOLO: (3-7 parole)\nFOCUS: (una frase)\nPAROLE CHIAVE:\n- (parola chiave o domanda)\nPAGINE:\n- (pagina o contenuto: scopo)\nAZIONI GEO:\n- (azione)\nPRIMI 30 GIORNI:\n- (passo)');
 lines.push('===FINE===');
 return lines.join('\n')}

// Section headings the reply may use, in Italian or English, with or without markdown around them.
const SECTIONS=[['keywords',/^(?:parole\s*chiave\b.*|keywords?|domande(?:\s+(?:delle persone|che (?:le persone )?(?:fanno|cercano)|cercate))?|ricerche)$/i],['pages',/^(?:pagine\b.*|contenuti(?:\s+da\b.*)?|pages)$/i],['geo',/^(?:azioni\s*geo\b.*|geo(?:\s+actions)?)$/i],['steps',/^(?:primi\s*30\s*giorni\b.*|(?:piano|passi)\s+(?:dei\s+)?(?:primi\s+)?30\s*giorni|first\s*30\s*days|30\s*giorni|primo\s*mese)$/i],['focus',/^focus$/i],['title',/^(?:titolo|title)$/i]];
const stripMd=s=>clean(String(s||'').replace(/\*\*|__|`/g,'').replace(/^[#>\s]+/,''));
const bullet=s=>stripMd(String(s).replace(/^\s*(?:[-*•–·]|\d{1,2}[.)]|\[[ x]\])\s+/,''));
const list=(v,max)=>(Array.isArray(v)?v:typeof v==='string'?v.split(/\n|;/):[]).map(x=>bullet(typeof x==='string'?x:x&&(x.text||x.title||x.name||x.keyword||x.page||x.action||x.step)||'')).filter(x=>x.length>1).map(x=>x.slice(0,300)).slice(0,max);
// A strategy is usable when it says what to search for and at least one thing to do; empty ones are skipped.
function strategy(x,n){const s={title:stripMd(x.title).replace(/[«»"]/g,'').slice(0,90),focus:stripMd(x.focus).slice(0,400),
  keywords:list(x.keywords,LIMITS.keywords),pages:list(x.pages,LIMITS.pages),geo:list(x.geo,LIMITS.geo),steps:list(x.steps,LIMITS.steps)};
 if(!s.keywords.length||!(s.pages.length||s.geo.length||s.steps.length))return null;
 if(!s.title)s.title='Strategia '+n;return s}
function sectionsOf(body){const out={title:'',focus:'',keywords:[],pages:[],geo:[],steps:[]};let cur=null;
 for(const line of String(body).split('\n')){const item=/^\s*(?:[-*•–·]|\d{1,2}[.)])\s/.test(line),t=stripMd(line).replace(/^\d{1,2}[.)]\s+(?=[A-Za-zÀ-ú])/,'');if(!t)continue;
  const h=/^([^:]{2,40}?)\s*:\s*(.*)$/.exec(t),hit=!item&&(h&&SECTIONS.find(([,re])=>re.test(h[1].trim()))||(t.length<=40&&SECTIONS.find(([k,re])=>k!=='title'&&k!=='focus'&&re.test(t.replace(/[:\s]+$/,'')))));
  if(hit){const k=hit[0],rest=h&&hit===SECTIONS.find(([,re])=>re.test(h[1].trim()))?h[2].trim():'';
   if(k==='title'||k==='focus'){out[k]=rest;cur=k==='focus'&&!rest?'focus':null}else{cur=k;if(rest)out[k].push(rest)}continue}
  if(cur==='focus'){out.focus=out.focus?out.focus+' '+t:t;continue}
  if(cur)out[cur].push(line)}
 return out}
// The reply → up to three strategies. Reads the requested markers or «Strategia 1» headings, tolerating markdown;
// falls back to a JSON list. Returns [] when nothing usable is there (the widget says so).
function parseStrategies(text){const raw=String(text||'').replace(/\r/g,'').replace(/```[a-z]*\n?|```/gi,''),out=[];
 const marker=/^[ \t]*[=#*\-_ ]*\s*(?:STRATEGIA|STRATEGY|OPZIONE)\s*(?:N[°.]?\s*)?(\d)\s*(?:[=#*\-_:.)–—]+[ \t]*(.*)|[ \t]*)$/gim,heads=[];let m;
 while((m=marker.exec(raw)))heads.push({i:m.index,end:m.index+m[0].length,rest:m[2]||''});
 if(heads.length){heads.forEach((h,k)=>{const body=raw.slice(h.end,k+1<heads.length?heads[k+1].i:raw.length).replace(/^[ \t]*[=#*_-]{2,}[ \t]*FINE\b[\s\S]*$/m,'');
   const s=sectionsOf(body);if(!s.title)s.title=h.rest.replace(/^[–—:\-\s]+/,'').replace(/[=*#_]+$/,'');
   const it=out.length<COUNT&&strategy(s,out.length+1);if(it)out.push(it)});
  if(out.length)return out}
 const j=raw.match(/[[{][\s\S]*[\]}]/);if(j){try{let d=JSON.parse(j[0]);if(d&&!Array.isArray(d))d=d.strategies||d.strategie||d.items||[];
   (Array.isArray(d)?d:[]).forEach(x=>{if(!x||typeof x!=='object'||out.length>=COUNT)return;
    const it=strategy({title:x.title||x.titolo,focus:x.focus,keywords:x.keywords||x.parole_chiave||x.paroleChiave||x.domande,pages:x.pages||x.pagine||x.contenuti,geo:x.geo||x.azioni_geo||x.azioniGeo||x.geo_actions,steps:x.steps||x.primi_30_giorni||x.primi30giorni||x.first_30_days||x.piano},out.length+1);if(it)out.push(it)})}catch(e){}}
 return out}
// The chosen strategy as a Markdown plan, ready to copy, download or save.
function toMarkdown(s,{project,answers,site,date}={}){const p=project||{},a=answers||{},sec=(h,xs,ordered)=>xs.length?['','## '+h,'',...xs.map((x,i)=>(ordered?(i+1)+'. ':'- ')+x)]:[];
 const day=date||new Date().toISOString().slice(0,10);
 return ['# Piano SEO e GEO · '+s.title,'',(p.name?'Progetto: '+clean(p.name)+' · ':'')+'Obiettivo: '+labelOf('goal',a.goal)+(clean(site)?' · Sito: '+clean(site):'')+' · '+day,
  ...(s.focus?['','**Focus:** '+s.focus]:[]),...sec('Parole chiave e domande',s.keywords),...sec('Pagine e contenuti',s.pages),...sec('Azioni GEO',s.geo),...sec('Primi 30 giorni',s.steps,true),
  '','---','Volumi di ricerca e posizionamenti non sono stimati qui: da verificare con uno strumento SEO prima di decidere le priorità.'].join('\n')}
const filename=s=>'piano-seo-geo-'+(String(s.title||'strategia').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50)||'strategia')+'.md';
// Saved in the project: one exchange in the specialist's thread of the shared «agents» document, the same place the
// Agenti AI page reads. The plan is a «---DOCUMENTO---» block, so it is listed and downloadable there like any agent document.
const MAX_KEPT=60;
function savedEntry(s,md,{by,at}={}){const when=at||new Date().toISOString();
 return [{role:'user',content:'Piano SEO e GEO scelto dal pannello Marketing: «'+s.title+'».',display:'Piano SEO e GEO scelto nel pannello Marketing: «'+s.title+'»',by:by||'Pannello Marketing',at:when,source:'seo-studio'},
  {role:'assistant',agent:AGENT,content:'Ecco il piano scelto, salvato nel progetto.\n\n---DOCUMENTO: Piano SEO e GEO · '+s.title+'---\n'+md+'\n---FINE DOCUMENTO---',at:when,source:'seo-studio'}]}
async function saveToProject(ws,projectId,s,md,opts){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');
 const doc=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await doc.load())||{},conv={...(cur.conversations||{})};
  conv[AGENT]=(Array.isArray(conv[AGENT])?conv[AGENT]:[]).concat(savedEntry(s,md,opts)).slice(-MAX_KEPT);
  try{return await doc.save({...cur,schemaVersion:1,conversations:conv})}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}

// ---- browser widget ----
// The «Risultati SEO» tab: its scripts and style load on the first click, so the pages that show the studio stay as they are.
const RESULTS_SCRIPTS=Object.freeze([['/lib/zip-lite.js',()=>root.RadixZip&&root.RadixZip.unzipAsync],['/lib/seo-results-core.js',()=>root.RadixSeoResultsCore],['/lib/seo-results.js',()=>root.RadixSeoResults]]),RESULTS_CSS='/shell/seo-results.css';
let resultsLoading=null;
function loadResults(){if(RESULTS_SCRIPTS.every(([,ok])=>ok()))return Promise.resolve(root.RadixSeoResults);
 if(resultsLoading)return resultsLoading;const d=doc();
 if(!d.querySelector('link[href="'+RESULTS_CSS+'"]')){const l=d.createElement('link');l.rel='stylesheet';l.href=RESULTS_CSS;d.head.append(l)}
 const one=([src,ok])=>ok()?Promise.resolve():new Promise((res,rej)=>{const s=d.createElement('script');s.src=src;s.onload=()=>res();s.onerror=()=>rej(Error('non riesco a caricare '+src));d.head.append(s)});
 resultsLoading=RESULTS_SCRIPTS.reduce((p,x)=>p.then(()=>one(x)),Promise.resolve()).then(()=>root.RadixSeoResults).catch(e=>{resultsLoading=null;throw e});
 return resultsLoading}
let counter=0;
const doc=()=>root.document;
const el=(tag,text,cls)=>{const n=doc().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=el('button',text,cls||'');b.type='button';return b};
const field=(label,value,ph,max)=>{const l=el('label',label),i=el('input');i.type='text';i.value=value||'';i.placeholder=ph||'';i.maxLength=max||FIELD_MAX;l.append(i);return [l,i]};
// ctx: {project (profile for the AI), memoryScope, projectId, workspace (RadixWorkspace, for «Salva nel progetto»), agentsUrl, by}
function seoStudio(ctx={}){
 const n=++counter,answers={},wrap=el('div',undefined,'tool photo-studio seo-studio'),pre=prefill(ctx.project);
 answers.customers=pre.customers;
 const steps=el('ol',undefined,'ps-steps');['Le domande','Scegli tra 3 strategie','Il piano'].forEach((t,i)=>{const li=el('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 const form=el('div',undefined,'ps-form'),qs=el('div',undefined,'ps-questions');
 for(const q of QUESTIONS){const fs=el('fieldset');fs.append(el('legend',q.label));q.options.forEach(([label,v])=>{const l=el('label',undefined,'ps-chip'),r=el('input');r.type='radio';r.name='ss-'+q.id+'-'+n;r.value=v;r.checked=v===(answers[q.id]||fallback(q));r.onchange=()=>{answers[q.id]=v};l.append(r,doc().createTextNode(' '+label));fs.append(l)});qs.append(fs)}
 const ol=el('label','Cosa vende l’attività e dove'),offer=el('textarea');offer.rows=2;offer.maxLength=FIELD_MAX;offer.value=pre.offer;offer.placeholder='Es. studio dentistico a Bergamo: igiene, impianti e ortodonzia invisibile';ol.append(offer);
 const [al,audience]=field('Clienti principali',pre.audience,'Es. famiglie e professionisti della provincia');
 const [sl,site]=field('Sito web (facoltativo)',pre.site,'Es. www.esempio.it',200);site.inputMode='url';
 const cw=el('div',undefined,'ss-competitors'),rivals=[];cw.append(el('span','Concorrenti (facoltativi, fino a 3)','ss-label'));
 for(let i=0;i<COMPETITORS;i++){const x=el('input');x.type='text';x.maxLength=120;x.placeholder=i===0?'Nome o sito di un concorrente':'Altro concorrente';x.setAttribute('aria-label','Concorrente '+(i+1));rivals.push(x);cw.append(x)}
 const fields=el('div',undefined,'ss-fields');fields.append(ol,al,sl,cw);
 const go=button('✦ Prepara 3 strategie','primary'),cost=el('span','Una chiamata AI allo Specialista SEO e GEO: ti chiedo conferma prima.','muted'),status=el('p','','tool-status');status.setAttribute('role','status');
 const bar=el('div',undefined,'ps-actions');bar.append(go,cost);form.append(qs,fields,bar);
 const grid=el('div',undefined,'ps-grid ss-grid'),plan=el('div',undefined,'ss-plan');grid.hidden=plan.hidden=true;
 const tabs=el('div',undefined,'ss-tabs'),planBox=el('div',undefined,'ss-tab-plan'),resBox=el('div',undefined,'ss-tab-results');tabs.setAttribute('role','tablist');resBox.hidden=true;
 const tabPlan=button('Strategia'),tabRes=button('Risultati SEO');[tabPlan,tabRes].forEach(b=>{b.setAttribute('role','tab');tabs.append(b)});
 const show=which=>{tabPlan.setAttribute('aria-selected',String(which==='plan'));tabRes.setAttribute('aria-selected',String(which==='results'));planBox.hidden=which!=='plan';resBox.hidden=which!=='results'};
 tabPlan.onclick=()=>show('plan');
 tabRes.onclick=async()=>{show('results');if(resBox.childElementCount)return;resBox.append(el('p','Carico i Risultati SEO…','tool-status'));
  try{const R=await loadResults();resBox.replaceChildren(R.seoResults({project:ctx.project,projectId:ctx.projectId,workspace:ctx.workspace,memoryScope:ctx.memoryScope,by:ctx.by}))}
  catch(e){resBox.replaceChildren(el('p','Risultati SEO non disponibili: '+e.message+'. Ricarica la pagina.','tool-status'))}};
 planBox.append(steps,form,status,grid,plan);wrap.append(tabs,planBox,resBox);show(ctx.tab==='results'?'results':'plan');if(ctx.tab==='results')tabRes.onclick();setStep(1);
 const lock=on=>{go.disabled=on;wrap.querySelectorAll('.ps-form input,.ps-form textarea').forEach(x=>x.disabled=on)};
 let asked={};
 go.onclick=async()=>{let prompt;const inputs={offer:offer.value,audience:audience.value,site:site.value,competitors:rivals.map(r=>r.value),project:ctx.project};
  try{prompt=strategiesPrompt(answers,inputs)}catch(e){status.textContent=e.message;(/sito/.test(e.message)?site:offer).focus();return}
  const rt=root.RadixAgents;if(!rt||typeof rt.reply!=='function'){status.textContent='Gli agenti non si sono caricati: ricarica la pagina.';return}
  if(!root.confirm('Preparare 3 strategie SEO e GEO con lo Specialista SEO e GEO AI? È una sola chiamata AI: usa crediti API.'))return;
  lock(true);setStep(2);status.textContent='Lo Specialista SEO e GEO prepara le 3 strategie…';grid.hidden=false;grid.replaceChildren();plan.hidden=true;
  asked={answers:{...answers},site:siteUrl(site.value)};
  try{const r=await rt.reply({role:AGENT,project:ctx.project,memoryScope:ctx.memoryScope,messages:[{role:'user',content:prompt}]});const list=parseStrategies(r&&r.text);
   if(!list.length)throw Error('la risposta non contiene strategie leggibili. Riprova.');
   status.textContent=(list.length<COUNT?'Sono arrivate '+list.length+' strategie su '+COUNT+'. ':'')+'Confrontale e scegli quella da seguire. I volumi di ricerca non sono stimati: vanno verificati.';
   grid.replaceChildren(...list.map(card));go.textContent='↺ Prepara altre 3 strategie'}
  catch(e){status.textContent='Strategie non preparate: '+e.message;setStep(1);grid.hidden=true}
  finally{lock(false)}};
 const section=(title,xs,ordered)=>{if(!xs.length)return null;const d=el('div',undefined,'ss-sec'),l=el(ordered?'ol':'ul');d.append(el('h4',title+' · '+xs.length));xs.forEach(x=>l.append(el('li',x)));d.append(l);return d};
 function card(s,i){const f=el('article',undefined,'ps-card ss-card'),use=button('Scegli questa','primary');
  f.append(el('h3',(i+1)+' · '+s.title));if(s.focus)f.append(el('p',s.focus,'ss-focus'));
  [section('Parole chiave e domande',s.keywords),section('Pagine e contenuti',s.pages),section('Azioni GEO',s.geo),section('Primi 30 giorni',s.steps,true)].forEach(x=>x&&f.append(x));
  use.onclick=()=>choose(s,f);f.append(use);return f}
 function choose(s,cardEl){grid.querySelectorAll('.ss-card').forEach(x=>x.dataset.chosen=String(x===cardEl));setStep(3);plan.hidden=false;
  const md=toMarkdown(s,{project:ctx.project,answers:asked.answers,site:asked.site}),out=el('textarea');out.readOnly=true;out.rows=12;out.value=md;out.setAttribute('aria-label','Piano scelto in Markdown');
  const st=el('p','Il piano scelto: copialo, scaricalo o salvalo nel progetto.','tool-status');st.setAttribute('role','status');
  const copy=button('Copia'),dl=button('Scarica .md'),acts=el('div',undefined,'ps-actions');acts.append(copy,dl);
  copy.onclick=async()=>{try{await root.navigator.clipboard.writeText(md);st.textContent='Piano copiato.'}catch(e){out.focus();out.select();st.textContent='Copia non riuscita: il testo è selezionato, usa Ctrl+C.'}};
  dl.onclick=()=>{const a=el('a');a.href=root.URL.createObjectURL(new root.Blob([md],{type:'text/markdown;charset=utf-8'}));a.download=filename(s);doc().body.append(a);a.click();a.remove();setTimeout(()=>root.URL.revokeObjectURL(a.href),2000);st.textContent='Piano scaricato: '+a.download+'.'};
  if(ctx.workspace&&ctx.projectId){const save=button('Salva nel progetto','primary');acts.prepend(save);
   save.onclick=async()=>{save.disabled=true;st.textContent='Salvo il piano nel progetto…';
    try{await saveToProject(ctx.workspace,ctx.projectId,s,md,{by:ctx.by});save.textContent='Salvato ✓';st.replaceChildren(doc().createTextNode('Piano salvato nel progetto: lo trova tutto il team tra i documenti dello Specialista SEO e GEO. '));
     if(ctx.agentsUrl){const a=el('a','Apri in Agenti AI →');a.href=ctx.agentsUrl;st.append(a)}}
    catch(e){st.textContent='Piano non salvato: '+e.message;save.disabled=false}}}
  plan.replaceChildren(el('h3','Il piano scelto · '+s.title),acts,st,out);plan.scrollIntoView&&plan.scrollIntoView({behavior:'smooth',block:'nearest'})}
 return wrap}
return Object.freeze({QUESTIONS,AGENT,LIMITS,RESULTS_SCRIPTS,RESULTS_CSS,loadResults,siteUrl,prefill,strategiesPrompt,parseStrategies,toMarkdown,filename,savedEntry,saveToProject,labelOf,seoStudio});
});
