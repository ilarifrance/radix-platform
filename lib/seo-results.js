/* Risultati SEO: the panel of the Studio SEO e GEO that reads a Google Search Console «Prestazioni» export (the .zip as
   downloaded, or its CSVs; optionally a GA4 landing-page CSV), shows KPI tiles, the daily chart and the opportunity
   tables, and asks the Specialista SEO e GEO for the «Prossimi passi» (one AI call, from a click with confirmation, with
   only the computed numbers and the saved plan). Imports and the last advice are kept in the project's «agents»
   document (lib/seo-results-core.js). No Google API and no keys: everything starts from a file the person picks. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixSeoResults=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const core=()=>root.RadixSeoResultsCore||(typeof require==='function'?require('./seo-results-core.js'):null);
// The three steps of the in-panel guide.
const GUIDE=Object.freeze([
 'Apri Google Search Console, scegli la proprietà del sito e vai su «Prestazioni» → «Risultati di ricerca». Imposta il periodo (per esempio gli ultimi 3 mesi) senza «Confronta».',
 'In alto a destra premi «Esporta» → «Scarica CSV»: arriva un file .zip con Query, Pagine, Paesi, Dispositivi e Date.',
 'Carica qui lo .zip così com’è, oppure i singoli CSV. Ripeti ogni mese con lo stesso periodo: RADIX confronta l’ultimo import con il precedente.'
]);
const CONFIRM='Chiedere allo Specialista SEO e GEO AI i prossimi passi? Riceve solo i numeri calcolati qui (totali, query e pagine delle tabelle) e il piano SEO salvato, nient’altro. È una sola chiamata AI: usa crediti API.';
const MAX_FILE=25*1024*1024;

// ---- browser widget ----
const doc=()=>root.document;
const el=(tag,text,cls)=>{const n=doc().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=el('button',text,cls||'');b.type='button';return b};
const SVG='http://www.w3.org/2000/svg';
const svgEl=(tag,attrs)=>{const n=doc().createElementNS(SVG,tag);for(const [k,v] of Object.entries(attrs||{}))n.setAttribute(k,String(v));return n};
// File → {name,text} or, for a .zip, the bytes.
const readText=f=>typeof f.text==='function'?f.text():new Promise((ok,ko)=>{const r=new root.FileReader();r.onload=()=>ok(String(r.result));r.onerror=()=>ko(r.error);r.readAsText(f)});
const readBytes=f=>typeof f.arrayBuffer==='function'?f.arrayBuffer().then(b=>new Uint8Array(b)):new Promise((ok,ko)=>{const r=new root.FileReader();r.onload=()=>ok(new Uint8Array(r.result));r.onerror=()=>ko(r.error);r.readAsArrayBuffer(f)});
async function importPicked(files,C){const list=[...(files||[])];if(!list.length)throw Error('Scegli lo .zip o i file CSV.');
 if(list.some(f=>f.size>MAX_FILE))throw Error('File troppo grande: massimo 25 MB.');
 const csv=[];for(const f of list){if(/\.zip$/i.test(f.name)){const imp=await C.importZip(await readBytes(f),root.RadixZip);if(list.length===1)return imp;
   const z=await root.RadixZip.unzipAsync(await readBytes(f)),dec=new TextDecoder('utf-8');z.forEach(x=>csv.push({name:x.name,text:dec.decode(x.data)}))}
  else csv.push({name:f.name,text:await readText(f)})}
 return C.importFiles(csv)}

// ctx: {project (profile for brand terms), projectId, workspace (RadixWorkspace), memoryScope, by}
function seoResults(ctx={}){
 const C=core(),wrap=el('div',undefined,'seo-results');
 if(!C){wrap.append(el('p','Risultati SEO non caricati: ricarica la pagina.','tool-status'));return wrap}
 const saved=!!(ctx.workspace&&ctx.projectId);let store=C.readStore(null),agentsDoc=null,picked='',advice=null;
 // guide
 const guide=el('details',undefined,'sr-guide'),sum=el('summary','Come esportare da Search Console'),ol=el('ol');GUIDE.forEach(t=>ol.append(el('li',t)));
 guide.append(sum,ol,el('p','Nessun collegamento a Google per ora: lavori sul file che scarichi tu. Facoltativo: il CSV «Pagine di destinazione» di Google Analytics 4.','muted'));
 // upload and settings
 const up=el('div',undefined,'sr-upload'),fl=el('label',undefined,'sr-file'),file=el('input');file.type='file';file.multiple=true;file.accept='.zip,.csv,.tsv,text/csv,application/zip';
 fl.append(el('span','Carica l’export (.zip o CSV)'),file);
 const bl=el('label',undefined,'sr-brand'),brand=el('input');brand.type='text';brand.maxLength=300;brand.placeholder='Es. nome del brand, nome del sito';bl.append(el('span','Termini del brand (separati da virgola)'),brand);
 const per=el('label',undefined,'sr-period'),period=el('select');per.append(el('span','Periodo'),period);per.hidden=true;
 const drop=button('Elimina questo import');drop.hidden=true;
 up.append(fl,bl,per,drop);
 const status=el('p',saved?'Carico i risultati salvati…':'Scegli un progetto per salvare gli import: senza progetto restano solo in questa pagina.','tool-status');status.setAttribute('role','status');
 const view=el('div',undefined,'sr-view');
 wrap.append(guide,up,status,view);
 const terms=()=>C.brandTerms(null,brand.value);

 // Without a project the change stays in this page; with one it is applied to the saved copy (conflicts retried).
 async function persist(change){if(!saved){store=change(store);return}
  store=await C.updateStore(ctx.workspace,ctx.projectId,change)}
 async function load(){if(!saved){brand.value=C.brandTerms(ctx.project).join(', ');render();return}
  try{agentsDoc=(await ctx.workspace.bind(ctx.projectId,'agents').load())||{};store=C.readStore(agentsDoc);
   brand.value=(store.brandTerms.length?store.brandTerms:C.brandTerms(ctx.project)).join(', ');
   status.textContent=store.imports.length?'Ultimo import caricato. Carica un nuovo export per confrontare i periodi.':'Nessun import ancora: segui la guida e carica l’export di Search Console.'}
  catch(e){status.textContent='Risultati salvati non disponibili: '+e.message}
  render()}

 file.onchange=async()=>{const files=file.files;if(!files||!files.length)return;file.disabled=true;status.textContent='Leggo l’export…';
  try{const imp=await importPicked(files,C);imp.by=ctx.by||'';
   await persist(s=>({...C.addImport(s,imp),brandTerms:terms()}));picked=imp.id;
   const n=imp.queries.length,p=imp.pages.length;
   status.textContent='Import riuscito'+(imp.range?' ('+C.shortDate(imp.range.from)+' – '+C.shortDate(imp.range.to)+')':'')+': '+n+' query, '+p+' pagine'+(imp.dates.length?', '+imp.dates.length+' giorni':'')+'.'+(saved?' Salvato nel progetto.':'')+(imp.warnings.length?' Note: '+imp.warnings.join(' '):'')}
  catch(e){status.textContent='Import non riuscito: '+e.message}
  finally{file.disabled=false;file.value='';render()}};
 brand.onchange=async()=>{try{await persist(s=>({...s,brandTerms:terms()}));render()}catch(e){status.textContent='Termini non salvati: '+e.message}};
 period.onchange=()=>{picked=period.value;render()};
 drop.onclick=async()=>{const id=period.value||picked;if(!id||!root.confirm('Eliminare questo import dai risultati del progetto?'))return;
  try{await persist(s=>C.removeImport(s,id));picked='';status.textContent='Import eliminato.';render()}catch(e){status.textContent='Import non eliminato: '+e.message}};

 const tile=(label,value,d,better)=>{const t=el('div',undefined,'sr-tile');t.append(el('span',label,'sr-tile-label'),el('b',value));
  if(d){const up=d.abs>0,good=better==='down'?d.abs<0:d.abs>0,s=el('span',(up?'▲ ':d.abs<0?'▼ ':'= ')+(d.pct!=null?Math.abs(d.pct).toLocaleString('it-IT')+'%':C.fmt(Math.abs(d.abs),2)),'sr-delta');s.dataset.trend=d.abs===0?'flat':good?'good':'bad';s.title='Rispetto all’import precedente';t.append(s)}
  return t};
 function chart(dates){const W=640,H=180,P=28;const pts=dates.filter(d=>d.clicks!=null||d.impressions!=null);if(pts.length<2)return null;
  const svg=svgEl('svg',{viewBox:'0 0 '+W+' '+H,role:'img','aria-label':'Clic e impressioni per giorno',class:'sr-chart'});
  const x=i=>P+i*(W-2*P)/(pts.length-1),line=(k,cls)=>{const max=Math.max(1,...pts.map(d=>d[k]||0));return svgEl('polyline',{points:pts.map((d,i)=>x(i).toFixed(1)+','+(H-P-((d[k]||0)/max)*(H-2*P)).toFixed(1)).join(' '),class:cls,fill:'none'})};
  svg.append(svgEl('line',{x1:P,y1:H-P,x2:W-P,y2:H-P,class:'sr-axis'}),line('impressions','sr-line-impr'),line('clicks','sr-line-clicks'));
  [[0,'start'],[pts.length-1,'end']].forEach(([i,a])=>{const t=svgEl('text',{x:x(i),y:H-8,'text-anchor':a,class:'sr-tick'});t.textContent=C.shortDate(pts[i].key);svg.append(t)});
  const fig=el('figure',undefined,'sr-figure'),cap=el('figcaption');cap.append(el('span','● Clic','sr-key-clicks'),doc().createTextNode('  '),el('span','● Impressioni','sr-key-impr'),doc().createTextNode(' · ogni linea con la sua scala'));
  fig.append(svg,cap);return fig}
 function table(title,hint,rows,cols){const box=el('section',undefined,'sr-table');box.append(el('h4',title+' · '+rows.length));if(hint)box.append(el('p',hint,'muted'));
  if(!rows.length){box.append(el('p','Niente da segnalare.','muted'));return box}
  const t=el('table'),head=el('tr');cols.forEach(c=>head.append(el('th',c[0])));t.append(head);
  rows.forEach(r=>{const tr=el('tr');cols.forEach(c=>{const td=el('td',c[1](r));if(c[2])td.className=c[2];tr.append(td)});t.append(tr)});
  const scroll=el('div',undefined,'sr-scroll');scroll.append(t);box.append(scroll);return box}
 const K=['Query',r=>r.key,'sr-key'],P=['Pagina',r=>r.key,'sr-key'],CL=['Clic',r=>C.fmt(r.clicks)],IM=['Impressioni',r=>C.fmt(r.impressions)],CT=['CTR',r=>r.ctr==null?'n.d.':C.fmt(r.ctr,2)+'%'],PO=['Posizione',r=>C.fmt(r.position,1)];

 function render(){const list=C.sortedImports(store);view.replaceChildren();
  per.hidden=list.length<2;drop.hidden=!list.length;
  period.replaceChildren(...list.slice().reverse().map(x=>new root.Option(x.range?C.shortDate(x.range.from)+' – '+C.shortDate(x.range.to):'Import del '+String(x.at).slice(0,10),x.id)));
  if(!list.length){view.append(el('p','Qui compariranno clic, impressioni, CTR e posizione media, le query a un passo dalla prima pagina e i titoli da riscrivere.','muted'));return}
  const a=C.analyse(store,{importId:picked,brand:terms()});period.value=a.current.id;
  const k=a.kpis,c=a.comparison||{},tiles=el('div',undefined,'sr-tiles');
  tiles.append(tile('Clic',C.fmt(k.clicks),c.clicks,'up'),tile('Impressioni',C.fmt(k.impressions),c.impressions,'up'),tile('CTR',k.ctr==null?'n.d.':C.fmt(k.ctr,2)+'%',c.ctr,'up'),tile('Posizione media',C.fmt(k.position,1),c.position,'down'));
  if(a.brand)tiles.append(tile('Clic da ricerche brand',a.brand.brandShare==null?'n.d.':C.fmt(a.brand.brandShare,1)+'%'));
  const meta=el('p',(a.current.range?'Periodo '+C.shortDate(a.current.range.from)+' – '+C.shortDate(a.current.range.to):'Periodo non indicato (manca Date.csv)')+(a.previous?' · confronto con '+(a.previous.range?C.shortDate(a.previous.range.from)+' – '+C.shortDate(a.previous.range.to):'l’import precedente'):' · carica un altro periodo per il confronto')+(k.source&&k.source!=='dates'?' · totali dalla tabella '+C.KIND_LABELS[k.source]+' (senza query anonime)':''),'muted');
  view.append(tiles,meta);const ch=chart(a.current.dates||[]);if(ch)view.append(ch);
  const o=a.opportunities,grid=el('div',undefined,'sr-tables');
  grid.append(table('A un passo dalla prima pagina','Query in posizione 4-20 con molte impressioni: contenuto e link interni le possono portare in alto.',o.nearFirstPage,[K,PO,IM,CL]),
   table('Titoli e meta da riscrivere','Molte impressioni ma CTR sotto la metà della media del sito'+(o.lowCtr[0]?' ('+C.fmt(o.lowCtr[0].siteCtr,2)+'%)':'')+'.',o.lowCtr,[o.lowCtr[0]&&o.lowCtr[0].type==='query'?K:P,IM,CT,PO]));
  if(a.previous)grid.append(table('Pagine che perdono clic','Rispetto all’import precedente.',o.losingPages,[P,['Prima',r=>C.fmt(r.previousClicks)],['Ora',r=>C.fmt(r.clicks)],['Variazione',r=>C.fmt(r.changePct,1)+'%']]));
  grid.append(table('Query con più clic','',a.topQueries,[K,CL,IM,CT,PO]));
  if(a.brand)grid.append(table('Brand e non brand','Termini: '+a.brand.terms.join(', ')+'.',[{key:'Brand',...a.brand.brand},{key:'Non brand',...a.brand.nonBrand}],[['Ricerche',r=>r.key],['Query',r=>C.fmt(r.queries)],CL,IM]));
  if(a.landing.length)grid.append(table('Pagine di destinazione (GA4)','',a.landing,[P,['Sessioni',r=>C.fmt(r.sessions)],['Utenti',r=>C.fmt(r.users)],['Eventi chiave',r=>C.fmt(r.keyEvents)]]));
  view.append(grid,nextSteps(a))}

 function nextSteps(a){const box=el('section',undefined,'sr-next'),go=button('✦ Prossimi passi con l’AI','primary'),note=el('span','Una chiamata AI allo Specialista SEO e GEO, con conferma. Riceve solo questi numeri e il piano salvato.','muted'),out=el('div',undefined,'sr-advice');out.setAttribute('aria-live','polite');
  const bar=el('div',undefined,'ps-actions');bar.append(go,note);box.append(el('h4','Prossimi passi'),bar,out);
  const plan=C.savedPlan(agentsDoc),key=C.adviceKey(a,plan),cached=store.advice&&store.advice.key===key?store.advice:null;
  if(cached){showAdvice(out,cached,true);go.textContent='↺ Chiedi di nuovo'}
  go.onclick=async()=>{const rt=root.RadixAgents;if(!rt||typeof rt.reply!=='function'){out.replaceChildren(el('p','Gli agenti non si sono caricati: ricarica la pagina.','tool-status'));return}
   let prompt;try{prompt=C.nextStepsPrompt(a,{plan})}catch(e){out.replaceChildren(el('p',e.message,'tool-status'));return}
   if(!root.confirm(CONFIRM))return;
   go.disabled=true;out.replaceChildren(el('p','Lo Specialista SEO e GEO legge i numeri…','tool-status'));
   try{const r=await rt.reply({role:C.AGENT,messages:[{role:'user',content:prompt}]}),res=C.parseAdvice(r&&r.text,a);
    if(!res.actions.length)throw Error(res.dropped?'le azioni proposte citavano query o pagine che non sono nei dati: riprova.':'nessuna azione leggibile: riprova.');
    advice={key,importId:a.current.id,at:new Date().toISOString(),actions:res.actions,measure:res.measure,dropped:res.dropped};
    try{await persist(s=>({...s,advice}))}catch(e){advice.unsaved=e.message}
    showAdvice(out,advice,false);go.textContent='↺ Chiedi di nuovo'}
   catch(e){out.replaceChildren(el('p','Prossimi passi non preparati: '+e.message,'tool-status'))}
   finally{go.disabled=false}};
  return box}
 function showAdvice(out,adv,cached){const ol=el('ol',undefined,'sr-actions');
  adv.actions.forEach(x=>{const li=el('li');li.append(el('b',x.titolo),el('span',' · '+(x.tipo==='pagina'?'pagina ':'query ')+'«'+x.oggetto+'»','sr-target'));if(x.metrica)li.append(el('p','Perché: '+x.metrica));if(x.come)li.append(el('p','Come: '+x.come));ol.append(li)});
  const parts=[el('p',(cached?'Risposta salvata del '+String(adv.at).slice(0,10)+': stessi numeri, nessuna nuova chiamata. ':'')+(adv.dropped?adv.dropped+(adv.dropped===1?' azione scartata':' azioni scartate')+' perché citava query o pagine che non sono nei dati. ':'')+(adv.unsaved?'Non salvata nel progetto: '+adv.unsaved:''),'muted'),ol];
  if(adv.measure&&adv.measure.length){const m=el('ul');adv.measure.forEach(t=>m.append(el('li',t)));parts.push(el('h4','Da misurare al prossimo import'),m)}
  out.replaceChildren(...parts)}
 load();
 return wrap}
return Object.freeze({GUIDE,CONFIRM,seoResults});
});
