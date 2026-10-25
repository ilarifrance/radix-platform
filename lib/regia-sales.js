/* Regia RADIX · Sales pages adapter (the Sales Intelligence pages outside the CRM; areas 'sales-*'). Read-only, no ops.
   These pages keep their data inside their own scripts, so the Regia reads what the page shows: the title, the
   workspace, the numbers in its counters, the status lines and the visible rows of each section (DOM text only, never a
   field's value, so no key or password typed in a field can leave). Two pages read a little more:
     sales-lead       the lead lists saved in the workspace (the «Liste» select), the leads of the table through
                      window.RadixLeadPipeline.leads(), ranked for «Quali lead lavoro prima?», and the provider status;
     sales-campaigns  the campaign cards of the selected commercial project (name, goal, segment, state, channel).
   The radix-sales.html CRM keeps its own adapter (lib/regia-crm.js). Nothing is sent from here: the core rejects any op
   that would send an email or a LinkedIn message, or start a paid enrichment (lib/radix-regia-core.js FORBIDDEN_OP).
   UMD: registers every area with RadixRegiaCore in the browser; Node gets the pure parts for the tests. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else{root.RadixRegiaSales=api;if(root.RadixRegiaCore)for(const [area,a] of Object.entries(api.adapters))root.RadixRegiaCore.register(area,a)}})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const one=(v,n)=>{const s=String(v==null?'':v).replace(/\s+/g,' ').trim();return n&&s.length>n?s.slice(0,n-1)+'…':s};
const NO_SEND='La Regia qui legge soltanto: non invia email né messaggi LinkedIn, non avvia arricchimenti o verifiche a pagamento e non cambia i dati. Una bozza la scrivi come testo nella chat; l’invio si fa dal pulsante della pagina, con la sua conferma.';
const MAX_SECTIONS=8,MAX_ITEMS=6;

// ---- the pages ----
// metrics: [label, element id]; workspace: the select whose chosen option names the workspace; extra: a page reader.
const PAGES=Object.freeze({
 'sales-pipeline':{title:'Pipeline',workspace:'workspace',
  metrics:[['Opportunità aperte caricate','count'],['Valore registrato','amount'],['Chiusure previste già passate','overdue'],['Copertura dati','coverage'],['Esiti','outcomes']],
  shortcuts:[{label:'Dove si blocca la pipeline?',prompt:'Dove si blocca la pipeline? Guarda le fasi e le chiusure già passate e dimmi quali trattative muovere per prime. Le modifiche le faccio io dal CRM.'}],
  hint:'Le trattative si spostano dalla pagina (trascinandole, con conferma) o dal CRM.'},
 'sales-orbit':{title:'Sales Orbit',workspace:'workspace',
  metrics:[['Opportunità','opportunities-count'],['Attive','so-kpi-active'],['Attività','tasks-count'],['In scadenza','so-kpi-due'],['Copertura','so-kpi-coverage'],['Priorità di oggi','so-prio-n'],['Opportunità a rischio','so-risk-n'],['Azioni suggerite','so-act-n']],
  shortcuts:[{label:'Su cosa mi concentro oggi?',prompt:'Su cosa mi concentro oggi? Parti dalle priorità e dalle opportunità a rischio che vedi nella pagina e dammi al massimo tre passi.'}],
  hint:'Per agire su un’opportunità si apre il CRM.'},
 'sales-vendite':{title:'Preventivi e fatture',workspace:null,metrics:[],
  shortcuts:[{label:'Cosa resta da chiudere?',prompt:'Cosa resta da chiudere tra preventivi e fatture? Dimmi cosa vedi aperto o in scadenza e da dove partire.'}],
  hint:'Preventivi e fatture si creano e si mandano dai pulsanti della pagina.'},
 'sales-linkedin':{title:'LinkedIn e Sales Navigator',workspace:null,metrics:[['Account LinkedIn','linkedin-account']],
  shortcuts:[{label:'Come importo i contatti?',prompt:'Come importo i contatti da Sales Navigator in RADIX? Dammi i passi partendo da quello che vedo nella pagina.'}],
  hint:'I contatti si importano con l’estensione «Importa in RADIX»; i messaggi LinkedIn si scrivono e si mandano da LinkedIn, a mano.'},
 'sales-campaigns':{title:'Campagne commerciali',workspace:'campaign-workspace',
  metrics:[['Campagne del progetto','campaign-total'],['Pronte per revisione','campaign-ready'],['Bozze','campaign-draft'],['Budget massimo totale (crediti)','campaign-credit-total']],
  shortcuts:[{label:'Come vanno le campagne?',prompt:'Come vanno le campagne? Per ogni campagna del progetto dimmi a che punto è, cosa manca (segmento, obiettivo, budget) e il prossimo passo.'}],
  hint:'Qui ci sono i piani delle campagne del progetto commerciale: invii e risultati sono nel CRM › Campagne.'},
 'sales-projects':{title:'Progetti commerciali',workspace:null,metrics:[['Stato del progetto','growth-current-state'],['Campagne collegate','growth-campaign-count']],
  shortcuts:[{label:'A che punto è il progetto?',prompt:'A che punto è il progetto commerciale aperto? Dimmi cosa manca e le prossime attività.'}],
  hint:'Il progetto si salva dai pulsanti della pagina.'},
 'sales-lead':{title:'Lead Intelligence',workspace:null,metrics:[['Lead nella tabella','lp-total'],['Già nel CRM','lp-incrm'],['Con email','lp-email'],['Contattati','lp-contacted'],['Contatti del lavoro aperto','contact-count'],['Lotti','contact-batches'],['Duplicati','contact-duplicates']],
  shortcuts:[{label:'Quali lead lavoro prima?',prompt:'Quali lead lavoro prima? Metti in ordine i lead che vedi (email verificata, ruolo, azienda) e dimmi perché. Non avviare arricchimenti: se servono, dimmi quali e li avvio io dal pulsante.'}],
  hint:'Arricchimenti e verifiche dei lead (a pagamento) si avviano solo dal pulsante della pagina, con la conferma e il costo.'}
});
// The same Sales Orbit on its two pages: sales-orbit-higgsfield.html (the live one) and the older sales-orbit.html.

// ---- DOM reading (browser; a small fake document in the tests) ----
const visible=e=>{if(!e)return false;
 if(typeof e.closest==='function'){if(e.closest('[hidden]')||e.closest('#rxRegia')||e.closest('nav'))return false;const d=e.closest('dialog');if(d&&!d.open)return false}
 if(typeof e.getClientRects==='function'){try{return e.getClientRects().length>0}catch(x){return true}}return true};
const textOf=(e,n)=>e?one(e.textContent,n):'';
function byId(doc,id){return doc&&typeof doc.getElementById==='function'?doc.getElementById(id):null}
function all(scope,sel){try{return scope&&typeof scope.querySelectorAll==='function'?[...scope.querySelectorAll(sel)]:[]}catch(e){return []}}
function chosen(sel){if(!sel||!sel.options)return '';const o=sel.options[sel.selectedIndex];return o&&o.value?one(o.textContent,80):''}
// The visible sections of the main area: each h2 with the rows under it (list items, cards, table rows).
function sectionsOf(doc){const main=(doc.querySelector&&doc.querySelector('main'))||doc.body;const out=[];
 for(const h of all(main,'h2')){if(out.length>=MAX_SECTIONS)break;if(!visible(h))continue;
  const box=(h.closest&&h.closest('section,article,.panel,.stage'))||h.parentElement;
  const items=[];for(const r of all(box,'li,article,tbody tr,.campaign-card,.deal,.card')){if(items.length>=MAX_ITEMS)break;if(!visible(r))continue;const t=textOf(r,160);if(t&&!items.includes(t))items.push(t)}
  out.push({title:textOf(h,80),items})}
 return out}
function statusOf(doc){const main=(doc.querySelector&&doc.querySelector('main'))||doc.body;const out=[];
 for(const s of all(main,'[role=status],[role=alert]')){if(out.length>=5)break;if(!visible(s))continue;const t=textOf(s,200);if(t&&!out.includes(t))out.push(t)}return out}

// The LinkedIn lists saved in the workspace: «<title> · <n> contatti · v<k>» options of the jobs select (lead-flow.js).
function listsOf(doc){const sel=byId(doc,'contact-job-list');if(!sel||!sel.options)return [];
 return [...sel.options].filter(o=>o.value).slice(0,20).map(o=>{const m=/^(.*) · (\d+) contatti · v\d+$/.exec(one(o.textContent));return {title:one(m?m[1]:o.textContent,90),count:m?Number(m[2]):null}})}
// Which leads first: a checked email first, then any email, a role, a LinkedIn profile, a company. Pure.
function leadScore(l){return (l.verified&&l.email?4:0)+(l.email?2:0)+(l.role?1:0)+(l.linkedin?1:0)+(l.company?1:0)}
function rankLeads(leads,n){return (Array.isArray(leads)?leads:[]).filter(l=>l&&(l.name||l.company)).map((l,i)=>({l,i,s:leadScore(l)}))
 .sort((a,b)=>b.s-a.s||a.i-b.i).slice(0,n||8).map(({l,s})=>({name:one(l.name,60),company:one(l.company,60),role:one(l.role,60),email:l.email?(l.verified?'verificata':'da verificare'):'manca',linkedin:!!l.linkedin,source:one(l.sourceLabel||l.origin,40),score:s}))}
function leadsSummary(leads){const list=Array.isArray(leads)?leads:[];
 return {total:list.length,withEmail:list.filter(l=>l&&l.email).length,verified:list.filter(l=>l&&l.verified&&l.email).length,withLinkedin:list.filter(l=>l&&l.linkedin).length,top:rankLeads(list,8)}}
function campaignsOf(doc){return all(byId(doc,'campaign-list'),'.campaign-card').filter(visible).slice(0,12).map(c=>{const q=s=>c.querySelector?textOf(c.querySelector(s),200):'';
 return {title:q('h3'),goal:q('p'),segment:q('small').replace(/^Segmento:\s*/,''),stage:q('.campaign-status'),channel:q('.campaign-meta .helper')}})}

// One page as the Regia sees it. Pure over doc (and win for the lead table).
function readPage(page,doc,win){const P=PAGES[page];if(!P||!doc)return {page,title:P?P.title:'',heading:'',workspace:'',metrics:[],status:[],sections:[]};
 const h1=doc.querySelector&&doc.querySelector('main h1, h1');
 const metrics=[];for(const [label,id] of P.metrics){const e=byId(doc,id);if(!e||!visible(e))continue;const v=textOf(e,80);if(v&&v!=='—')metrics.push({label,value:v})}
 const s={page,title:P.title,heading:textOf(h1,120),workspace:P.workspace?chosen(byId(doc,P.workspace)):'',metrics,status:statusOf(doc),sections:sectionsOf(doc)};
 if(page==='sales-lead'){s.lists=listsOf(doc);let leads=[];try{const lp=win&&win.RadixLeadPipeline;leads=lp&&typeof lp.leads==='function'?lp.leads():[]}catch(e){leads=[]}s.leads=leadsSummary(leads);
  s.provider=['contact-api-status','contact-job-status','lf-jobs-status'].map(id=>byId(doc,id)).filter(visible).map(e=>textOf(e,160)).filter(Boolean)}
 if(page==='sales-campaigns'){s.project=chosen(byId(doc,'campaign-project'));s.campaigns=campaignsOf(doc)}
 return s}

// ---- what the AI and the panel read ----
function context(state){const s=state||{},P=PAGES[s.page]||{};const lines=[];
 lines.push((P.title||'Sales')+(s.heading&&s.heading!==P.title?' · «'+s.heading+'»':'')+' (Sales Intelligence, sola lettura).'+(s.workspace?' Workspace: '+s.workspace+'.':''));
 if(s.metrics&&s.metrics.length)lines.push('Numeri sulla pagina: '+s.metrics.map(m=>m.label+' '+m.value).join('; ')+'.');
 if(s.page==='sales-lead'){const L=s.leads||{total:0,top:[]};
  lines.push('Liste salvate nel workspace ('+(s.lists||[]).length+'): '+((s.lists||[]).map(l=>l.title+(l.count!=null?' ('+l.count+' contatti)':'')).join('; ')||'nessuna')+'.');
  lines.push('Lead nella tabella: '+L.total+', con email '+L.withEmail+' (verificate '+L.verified+'), con profilo LinkedIn '+L.withLinkedin+'.');
  if(L.top.length)lines.push('Da lavorare prima (email verificata, ruolo, profilo, azienda): '+L.top.map((l,i)=>(i+1)+') '+(l.name||'senza nome')+(l.role?', '+l.role:'')+(l.company?' · '+l.company:'')+' · email '+l.email+(l.linkedin?' · LinkedIn':'')+(l.source?' · '+l.source:'')).join('; ')+'.');
  if(s.provider&&s.provider.length)lines.push('Stato di import e provider: '+s.provider.join(' · ')+'.')}
 if(s.page==='sales-campaigns'){lines.push('Progetto commerciale: '+(s.project||'nessuno selezionato')+'.');
  lines.push((s.campaigns||[]).length?'Campagne: '+s.campaigns.map(c=>'«'+c.title+'» · '+(c.stage||'stato ?')+(c.channel?' · '+c.channel:'')+' · segmento '+(c.segment||'da definire')+(c.goal?' · obiettivo: '+one(c.goal,120):'')).join('; ')+'.':'Nessuna campagna visibile nel progetto.')}
 if(s.status&&s.status.length)lines.push('Messaggi della pagina: '+s.status.join(' · ')+'.');
 const sec=(s.sections||[]).filter(x=>x.title);if(sec.length)lines.push('Sezioni visibili: '+sec.map(x=>x.title+(x.items.length?' ['+x.items.join(' | ')+']':'')).join(' · ')+'.');
 if(P.hint)lines.push(P.hint);
 lines.push(NO_SEND);
 return lines.join('\n')}
function digest(state){const s=state||{},d={};for(const m of s.metrics||[])d[m.label]=m.value;
 if(s.page==='sales-lead'&&s.leads){d.liste=(s.lists||[]).length;d.lead=s.leads.total;d.conEmail=s.leads.withEmail}
 if(s.page==='sales-campaigns')d.campagne=(s.campaigns||[]).length;return d}
function view(state){const s=state||{},items=(s.metrics||[]).slice(0,5).map(m=>m.label+': '+m.value);
 if(s.page==='sales-lead'&&s.leads){items.unshift('Liste nel workspace: '+(s.lists||[]).length+' · lead nella tabella: '+s.leads.total+' (con email '+s.leads.withEmail+')');
  if(s.leads.top[0])items.push('Primo da lavorare: '+(s.leads.top[0].name||s.leads.top[0].company)+(s.leads.top[0].company&&s.leads.top[0].name?' · '+s.leads.top[0].company:''))}
 if(s.page==='sales-campaigns'&&!(s.metrics||[]).length)items.push('Campagne visibili: '+(s.campaigns||[]).length);
 return items.length?{title:'Sulla pagina',items:items.slice(0,6)}:null}
// The fixed answer of the fake AI (tests, screenshots): a send the Regia refuses, so the card shows the rule.
const SAMPLE_OP={'sales-lead':{op:'enrich_leads',note:'Arricchisci i primi 50 lead'},'sales-linkedin':{op:'send_linkedin_message',message:'Ciao, ci sentiamo?'},'sales-campaigns':{op:'send_campaign',note:'Avvia la campagna'}};
function sample(state){const s=state||{},P=PAGES[s.page]||{};
 return {area:s.page,summary:'Su «'+(P.title||'questa pagina')+'» la Regia legge e consiglia: gli invii e gli arricchimenti partono solo dai pulsanti della pagina.',ops:[SAMPLE_OP[s.page]||{op:'send_email',subject:'Ci sentiamo?'}]}}

function adapter(page){const P=PAGES[page];
 return {title:P.title,pages:[page],contextMax:3600,shortcuts:P.shortcuts,ops:{},
  read:(doc,prev)=>{const d=doc||(root&&root.document);if(!d)return prev||{page};try{return readPage(page,d,root)}catch(e){return prev||{page}}},
  context,digest,view,sample}}
const adapters=Object.freeze(Object.fromEntries(Object.keys(PAGES).map(p=>[p,adapter(p)])));
return Object.freeze({PAGES,adapters,adapter,readPage,context,digest,view,sample,rankLeads,leadsSummary,leadScore,NO_SEND});
});
