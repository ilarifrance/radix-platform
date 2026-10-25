/* Guida RADIX: the internal guide that helps a person use the platform on their own.
   GUIDE is the map of the platform (what each page is for, how to start, common questions). The widget
   answers from it instantly and for free; anything else goes to the «radix-guide» agent, whose system prompt
   is built from the same map (api/chat.js), so the AI and the quick answers never disagree.
   UMD: the browser widget (start) and Node (systemText, match, linkify for the tests and the server). */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else{root.RadixGuide=api;if(root.document&&!root.document.documentElement.hasAttribute('data-rx-regia'))api.start()}})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const GUIDE=[
 {id:'cc',title:'Command Center',href:'/control-center-v2.html',what:'La home di RADIX: progetti attivi, approvazioni in attesa, agenti e integrazioni in un colpo d’occhio.',
  start:['Guarda le approvazioni in attesa: sono le cose che aspettano te.','Apri un progetto dalla lista Progetti per vedere a che punto è.','Per un nuovo lavoro di marketing vai su Marketing Agency → Progetti → Nuovo progetto.'],
  faq:[['Da dove comincio?','Se è la prima volta crea un progetto: Marketing Agency → Nuovo progetto ti guida in 5 passi. Poi apri il suo Piano editoriale.',['agency-new','agency-ped']],['Cosa sono le approvazioni?','Sono i contenuti e i piani preparati dagli agenti AI che aspettano il tuo ok: niente esce da RADIX senza una tua conferma.',['cc-approvals']]]},
 {id:'cc-approvals',title:'Approvazioni',href:'/control-center-v2.html#approvals',what:'Tutto quello che gli agenti hanno preparato e aspetta il tuo ok.',start:['Apri ogni elemento, leggilo e approvalo o chiedi di rifarlo con una nota.'],faq:[]},
 {id:'cc-integrations',title:'Integrazioni',href:'/control-center-v2.html#integrations',what:'Lo stato dei servizi esterni collegati (Buffer, HeyGen, Higgsfield, immagini AI, email).',start:['Controlla quali servizi sono attivi: un servizio non configurato resta visibile ma disattivato nelle pagine.'],
  faq:[['Perché un pulsante è disattivato?','Di solito manca la chiave del servizio (per esempio HeyGen o Buffer). Le chiavi le aggiunge l’amministratore nelle impostazioni del server; qui vedi quali mancano.',['cc-integrations']]]},
 {id:'agency-orbit',title:'Marketing · Panoramica',href:'/agency/orbit.html',what:'La home del Marketing: il progetto su cui lavori, le cose che aspettano te, i servizi, i lavori in corso e il team AI.',
  start:['Scegli il progetto in alto, oppure premi «Nuovo progetto».','Scrivi in «Cosa vuoi fare oggi?» cosa ti serve, o scegli un servizio: si apre nella pagina «Cosa vuoi fare».','«Da rivedere» e «Approvazioni» dicono cosa aspetta te; «Lavori in corso» mostra cosa sta preparando il team AI.'],
  faq:[['Da dove parto nel Marketing?','Scegli il progetto e apri «Cosa vuoi fare»: ogni servizio ti guida con poche domande e ti mostra il costo prima di partire.',['agency-crea','agency-new']]]},
 {id:'agency-crea',title:'Cosa vuoi fare',href:'/agency/crea.html',what:'Marketing · Servizi guidati: post, foto, video, sito, stampa, testi e kit completi, ognuno con poche domande e tre proposte tra cui scegli tu.',
  start:['Scegli il progetto in «Per quale progetto»: i servizi partono dai suoi fatti confermati.','Trova il servizio: scrivi cosa ti serve, filtra per area o apri un kit completo.','Il costo è scritto sulla scheda prima di aprirla: molti servizi lavorano qui nel browser, senza AI e senza crediti.','L’AI parte solo dopo la tua conferma; poi scegli tra le proposte e rifinisci.','Quello che salvi resta nel progetto: riaprendo il servizio lo ritrovi.'],
  faq:[['Quanto costa un servizio guidato?','Lo dice la scheda prima di aprirla: «Nessuna chiamata AI e nessun credito» oppure quante chiamate AI servono. Ogni chiamata AI ti chiede conferma prima di partire.',['agency-crea']],
   ['Dove ritrovo quello che ho preparato?','Nel progetto: scegli lo stesso progetto e riapri il servizio. I post vanno nel Piano editoriale.',['agency-crea','agency-ped']]]},
 {id:'agency',title:'Agenzia e divisioni',href:'/agency/index.html',what:'Le divisioni della Marketing Agency, il workflow operativo, gli agenti AI disponibili e i task recenti.',
  start:['Guarda quali divisioni e agenti AI lavorano per te.','Per iniziare un lavoro vai su «Cosa vuoi fare» o apri un progetto.'],faq:[]},
 {id:'agency-new',title:'Nuovo progetto Agency',href:'/agency/new-project.html',what:'Crea un progetto di marketing in 5 passi: progetto e materiali, obiettivo e pubblico, servizi e canali, fatti e regole, riepilogo.',
  start:['Scrivi nome e settore, e incolla o allega il materiale che hai (brief, sito, presentazione).','Al passo 2 premi «Proponimi 3 direzioni» e scegli quella giusta, poi correggila.','Al passo 4 compila la scheda fatti: gli specialisti scrivono solo con fatti veri.','Al riepilogo premi «Crea il progetto»: l’Orchestratore prepara il piano e si apre la pagina del progetto.'],
  faq:[['Cosa metto nella scheda fatti?','Numeri, certificazioni, clienti e casi reali, e le cose da non dire. Senza fatti gli specialisti lasciano [da fornire] invece di inventare.',['agency-new']]]},
 {id:'agency-projects',title:'Progetti Agency',href:'/agency/projects.html',what:'L’elenco dei progetti di marketing, con lo stato di ognuno.',start:['Apri un progetto per vedere incarichi, risultati e approvazioni.','Per un nuovo progetto usa «Nuovo progetto».'],faq:[['Posso partire da un progetto esistente?','Sì: «Usa come modello» copia servizio, canali e regole senza i dati del cliente.',['agency-projects']]]},
 {id:'agency-clients',title:'Clienti',href:'/agency/clients.html',what:'L’anagrafica dei clienti dell’agenzia: ogni progetto può essere collegato a un cliente.',start:['Aggiungi il cliente prima di creare il progetto, così lo trovi nel passo 1.'],faq:[]},
 {id:'agency-ped',title:'Piano editoriale (PED)',href:'/project-editorial.html',project:true,what:'Il piano dei contenuti social di un progetto: identità visiva, scrittura dei post, revisione con anteprima, programmazione su Buffer.',
  start:['Passo 1 «Identità visiva»: carica una moodboard o fatti proporre colori, font e firma dall’Art Director, poi approvala.','Passo 2 «Scrivi tutto»: gli agenti scrivono le bozze dei prossimi 31 giorni con il controllo dei fatti.','Passo 3 «Rivedi e approva»: vedi ogni post come apparirà; approvalo o premi «Da rifare» con una nota.','Passo 4 «Programma su Buffer»: i post approvati vanno in coda solo con la tua conferma.'],
  faq:[['Come cambio la grafica dei post?','Approva l’identità visiva al passo 1, poi nella revisione premi «🎨 Ridisegna le immagini»: tutte le immagini seguono i nuovi colori.',['agency-ped']],
   ['Posso usare una foto invece della grafica?','Sì: apri il post e premi «📷 Foto con Higgsfield · 3 proposte». Rispondi a poche domande, scegli una delle tre foto e RADIX la compone con il titolo e i colori del progetto. Ogni proposta consuma crediti Higgsfield e ti chiede conferma.',['agency-ped']],
   ['Perché un post non si approva?','Se il testo contiene numeri da verificare resta in bozza: aprilo dalla Libreria, controlla i numeri con la scheda fatti e salvalo.',['agency-ped']],
   ['Come faccio un video con l’avatar?','Crea l’avatar in Studio Avatar: tre proposte, scegli la migliore e una voce. Poi nei post video il pulsante genera il video con quell’avatar.',['agency-avatar']]]},
 {id:'agency-strategy',title:'Strategia del progetto',href:'/project-editorial.html#brief',project:true,what:'Il brief strategico del progetto, prima del Piano editoriale: contesto, obiettivo, pubblico, canali, tono, posizionamento, messaggi, rubriche, frequenza e KPI.',
  start:['Completa i campi del brief; se l’agenzia ha incarichi approvati, «Compila il brief dagli incarichi approvati» lo prepara per te.','«Salva versione strategica» tiene lo storico delle versioni.','«Approva strategia e apri PED» passa al Piano editoriale.','Con la strategia approvata trovi anche «Budget e KPI» e il confronto con i siti dei concorrenti.'],
  faq:[['Dove imposto la strategia?','Nella pagina Strategia del progetto (il brief prima del Piano editoriale): completala e premi «Approva strategia e apri PED».',['agency-strategy']]]},
 {id:'agency-avatar',title:'Studio Avatar',href:'/agency/avatar.html',project:true,what:'Crea l’avatar che parla nei video: lo descrivi con poche domande, HeyGen prepara tre proposte, scegli la migliore e la voce.',
  start:['Scegli come crearlo: disegnato dall’AI, da una tua foto o da un avatar HeyGen che hai già.','Guarda le tre proposte e scegli la migliore.','Ascolta tre voci in italiano e scegline una.','Genera un video di prova e salva l’avatar nel progetto.'],faq:[['Quanto costa?','Ogni generazione consuma crediti HeyGen: RADIX ti chiede conferma prima di ogni passo a pagamento.',['agency-avatar']]]},
 {id:'agency-operations',title:'Operations',href:'/agency/operations.html',what:'Produzione e attività dell’agenzia: chi sta lavorando a cosa.',start:['Controlla gli incarichi in corso e quelli fermi.'],faq:[]},
 {id:'agency-memory',title:'Memoria del team',href:'/agency/memory.html',what:'Decisioni, preferenze e risultati confermati che tutti gli agenti usano.',start:['Conferma le decisioni importanti: gli agenti le rispetteranno nei lavori successivi.'],faq:[]},
 {id:'agents',title:'Agenti AI',href:'/agents.html',what:'Parla direttamente con uno specialista (strategist, copywriter, art director, video…) su un progetto.',start:['Scegli il progetto e lo specialista.','Scrivi cosa ti serve: sotto la risposta trovi gli strumenti (carosello, foto, video, Buffer).'],faq:[]},
 {id:'pm',title:'Project Management',href:'/radix-pm-concept.html',project:true,what:'Fasi, attività, Gantt, Kanban e carichi del team per ogni progetto.',start:['Apri il progetto, controlla le fasi nel Gantt.','Sposta le attività nel Kanban man mano che avanzano.','Guarda i carichi per non sovraccaricare nessuno.'],faq:[]},
 {id:'sales-crm',title:'CRM',href:'/radix-sales.html',what:'Contatti, trattative, attività, calendario, analisi, campagne email, automazioni e ticket, con il Copilota commerciale.',
  start:['Importa o aggiungi i contatti.','Crea le trattative e tienile aggiornate nella pipeline.','Chiedi al Copilota commerciale le priorità del giorno: risponde sui dati del tuo CRM.'],
  faq:[['Le email partono da sole?','No: ogni invio si conferma, e le campagne vanno solo ai contatti con consenso marketing.',['sales-crm']]]},
 {id:'sales-orbit',title:'Sales Orbit',href:'/sales-orbit-higgsfield.html',what:'La vista d’insieme commerciale: clienti e opportunità attorno al tuo business.',start:['Usala per capire dove concentrare il lavoro commerciale, poi apri il CRM per agire.'],faq:[]},
 {id:'sales-pipeline',title:'Pipeline',href:'/sales-pipeline-premium.html',what:'Le trattative per fase, con valori e prossime azioni.',start:['Trascina una trattativa nella fase giusta quando avanza.'],faq:[]},
 {id:'sales-lead',title:'Lead Intelligence',href:'/lead-intelligence.html',what:'Ricerca e verifica di nuovi lead da contattare.',start:['Definisci il profilo dei clienti che cerchi e controlla i lead proposti prima di contattarli.'],faq:[]},
 {id:'accounting',title:'Accounting',href:'/accounting/index.html',what:'Contabilità e controllo di gestione.',start:['Segui i passi indicati nella pagina per caricare i dati dell’azienda.'],faq:[]},
 {id:'legal',title:'Legal',href:'/legal/index.html',what:'Documenti e verifiche legali.',start:['Scegli il tipo di documento e segui le domande.'],faq:[]}
];
const RULES=['Niente esce da RADIX (post, email, video) senza un clic di conferma di una persona.','Le generazioni a pagamento (HeyGen, Higgsfield, immagini AI) chiedono sempre conferma prima di partire.','Gli agenti scrivono solo con i fatti forniti: dove mancano lasciano [da fornire].'];
const byId=id=>GUIDE.find(g=>g.id===id)||null;
// The guide entry for a page: the entry of its path and hash (the strategy is #brief of the PED page), then the entry of
// its file (pages that share a shell id, e.g. Nuovo progetto and Progetti), then its shell page id, else the Command Center.
function forPage(pageId,path,hash){const p=String(path||''),h=String(hash||'');
 return (h&&GUIDE.find(g=>g.href===p+h))||GUIDE.find(g=>!g.href.includes('#')&&g.href===p)||byId(pageId)||byId('cc')}
// Words that say nothing about the topic: a match needs at least two topic words in common.
const STOP=new Set(['come','cosa','dove','quando','quale','quali','perche','posso','faccio','fare','sono','della','delle','degli','dello','dei','nella','nelle','questo','questa','anche','invece','posto','prima','dopo','molto','tutto','tutti','ogni','alla','alle','sulla','sulle','dalla','qual','vuol','dire','serve','servono']);
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 ]/g,' ');
// A quick answer from the map when the question clearly matches one; null means «ask the AI».
function match(question){const q=norm(question).split(/\s+/).filter(w=>w.length>3&&!STOP.has(w));if(q.length<2)return null;let best=null;
 for(const g of GUIDE)for(const [fq,a,links] of g.faq){const words=new Set(norm(fq).split(/\s+/).filter(w=>w.length>3&&!STOP.has(w)));const hit=q.filter(w=>words.has(w)).length,score=hit/Math.max(words.size,1);if(hit>=2&&score>=.5&&(!best||score>best.score))best={score,q:fq,a,links:links||[]}}
 return best}
// [[id]] in an AI answer becomes a link to that page; unknown ids are dropped.
function linkify(text){const parts=[],re=/\[\[([a-z-]+)\]\]/g;let last=0,m;const s=String(text||'');
 while((m=re.exec(s))){parts.push({text:s.slice(last,m.index)});const g=byId(m[1]);if(g)parts.push({link:g});last=re.lastIndex}parts.push({text:s.slice(last)});return parts.filter(p=>p.link||p.text)}
// The map as the agent's knowledge (api/chat.js «radix-guide»).
function systemText(){return 'Sei la Guida RADIX: aiuti chi usa la piattaforma RADIX a trovare la pagina giusta e a fare il prossimo passo, da solo.\n'+
 'Rispondi in italiano, breve e pratico: prima la risposta, poi al massimo 5 passi numerati. Quando citi una pagina scrivi il suo codice tra doppie parentesi quadre, per esempio [[agency-ped]]: diventa un pulsante. '+
 'Usa solo le pagine e le funzioni di questa mappa; se una cosa non esiste in RADIX dillo e proponi l’alternativa più vicina. Non puoi fare azioni al posto della persona e non inventi funzioni, prezzi o numeri.\n\nREGOLE DELLA PIATTAFORMA:\n- '+RULES.join('\n- ')+
 '\n\nMAPPA DI RADIX:\n'+GUIDE.map(g=>'['+g.id+'] '+g.title+': '+g.what+'\n  Come iniziare: '+g.start.join(' ')+(g.faq.length?'\n  Domande frequenti: '+g.faq.map(f=>f[0]+' '+f[1]).join(' '):'')).join('\n')}

// ---- browser widget ----
// The shell's top bar (or a page's own top bar adopted by the shell) where the «?» docks; null on pages without one.
function dockBar(doc){return doc.querySelector('header.rx-topbar')||doc.querySelector('header.rx-pagetop')||null}
function start(){
 const doc=root.document;if(doc.getElementById('rxGuide'))return;
 const page=doc.body.dataset.shellPage||'',entryNow=()=>forPage(page,root.location.pathname,root.location.hash),qs=new URLSearchParams(root.location.search),project=qs.get('project')||qs.get('id')||'';
 const el=(t,c,x)=>{const n=doc.createElement(t);if(c)n.className=c;if(x!=null)n.textContent=x;return n};
 const href=g=>{const [base,hash]=g.href.split('#');return base+(g.project&&/^[a-z0-9-]{1,80}$/i.test(project)?(base.includes('?')?'&':'?')+'project='+encodeURIComponent(project):'')+(hash?'#'+hash:'')};let entry=entryNow();
 const fab=el('button','rx-guide-fab','?');fab.type='button';fab.id='rxGuide';fab.setAttribute('aria-label','Guida RADIX');fab.title='Guida RADIX: come si usa questa pagina';
 const panel=el('section','rx-guide');panel.hidden=true;panel.setAttribute('aria-label','Guida RADIX');
 const head=el('header'),h=el('strong',null,'Guida RADIX'),x=el('button','rx-guide-x','✕');x.type='button';x.setAttribute('aria-label','Chiudi la guida');head.append(h,x);
 const log=el('div','rx-guide-log');log.setAttribute('aria-live','polite');
 const form=el('form','rx-guide-ask'),input=el('input');input.placeholder='Chiedi come fare qualcosa…';input.maxLength=500;input.setAttribute('aria-label','Domanda per la guida');const send=el('button',null,'Chiedi');send.type='submit';form.append(input,send);
 panel.append(head,log,form);doc.body.append(fab,panel);
 // In the shell's sticky top bar the «?» never covers the page; pages without one keep the small round button bottom right.
 const bar=dockBar(doc);if(bar){const at=bar.querySelector('.rx-user,.user-pill,.rx-logout');if(at)at.parentNode.insertBefore(fab,at);else bar.append(fab);fab.classList.add('rx-guide-fab--top');panel.classList.add('rx-guide--top')}
 const history=[];
 function bubble(who,parts){const b=el('div','rx-guide-msg '+who);for(const p of parts){if(p.link){const a=el('a','rx-guide-link','→ '+p.link.title);a.href=href(p.link);b.append(a)}else b.append(doc.createTextNode(p.text))}log.append(b);log.scrollTop=log.scrollHeight;return b}
 function intro(){log.replaceChildren();const b=bubble('bot',[{text:entry.title+' · '+entry.what}]);const ol=el('ol');entry.start.forEach(s=>ol.append(el('li',null,s)));b.append(ol);
  const chips=el('div','rx-guide-chips');const faqs=entry.faq.length?entry.faq:byId('cc').faq;faqs.forEach(([q,a,links])=>{const c=el('button','rx-guide-chip',q);c.type='button';c.onclick=()=>{bubble('me',[{text:q}]);bubble('bot',[{text:a}].concat((links||[]).map(id=>byId(id)).filter(Boolean).map(link=>({link}))))};chips.append(c)});log.append(chips)}
 let opened=false;root.addEventListener('hashchange',()=>{const e=entryNow();if(e!==entry){entry=e;opened=!panel.hidden;if(opened)intro()}});fab.onclick=()=>{panel.hidden=!panel.hidden;fab.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){if(!opened){intro();opened=true}input.focus()}};
 x.onclick=()=>{panel.hidden=true;fab.setAttribute('aria-expanded','false');fab.focus()};
 doc.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden)x.onclick()});
 form.onsubmit=async e=>{e.preventDefault();const q=input.value.trim();if(!q)return;input.value='';bubble('me',[{text:q}]);
  const quick=match(q);if(quick){bubble('bot',[{text:quick.a}].concat(quick.links.map(id=>byId(id)).filter(Boolean).map(link=>({link}))));return}
  let ok=false;try{ok=root.sessionStorage.getItem('rx-guide-ai')==='1'}catch(err){}
  if(!ok){if(!root.confirm('La guida risponde con l’AI di RADIX: ogni domanda consuma pochi crediti API. Continuare?')){bubble('bot',[{text:'Va bene. Scegli una delle domande frequenti qui sopra, oppure apri la pagina che ti serve dal menu.'}]);return}try{root.sessionStorage.setItem('rx-guide-ai','1')}catch(err){}}
  const wait=bubble('bot',[{text:'Sto cercando…'}]);send.disabled=true;
  history.push({role:'user',content:'[Pagina attuale: '+entry.title+' ('+entry.id+')]\n'+q});
  try{const r=await root.fetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({role:'radix-guide',messages:history.slice(-8)})});const d=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(r.status===401?'accedi a RADIX per usare la guida':d.error||'errore '+r.status);history.push({role:'assistant',content:d.reply});wait.remove();bubble('bot',linkify(d.reply))}
  catch(err){history.pop();wait.remove();bubble('bot',[{text:'Non riesco a rispondere ora: '+err.message+'.'}])}finally{send.disabled=false}}}
return Object.freeze({GUIDE,RULES,forPage,match,linkify,systemText,dockBar,start});
});
