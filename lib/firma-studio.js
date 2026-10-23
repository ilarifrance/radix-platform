/* Studio «Firma email» (agency job E3): the company's email signature from the saved identity kit (profile.identityKit:
   logo, palette), with NO AI and no cost. The HTML is the one of the «Coordinato aziendale» (lib/coordinato-studio.js:
   tables, inline styles, at most 600 px, readable without images and in narrow windows); here it gets its own flow.
   1. The questions: the company data (prefilled from the project and the client, never invented: what is missing is left
      out of the signature), the people (one signature each: name, role, direct phone and email), the address of the logo
      on the client's own site, the links to the company's social profiles.
   2. Three layouts built here, deterministically (Classico, Moderno, Audace), shown with the first person; the person
      picks one («Scelta»).
   3. The refinement (colour of the line and the name, logo size or no logo, legal line, payoff, the fixed white background
      for dark mode), a preview per person in light and in a simulated dark mail window, and the checks: the data (export
      blocked without the company name or without any contact), the signature rules, dark mode, AA contrast, palette
      colours, where the logo comes from.
   4. Copy the signature (rich HTML in the clipboard, ready to paste) or download it (.html and .txt per person, the logo
      PNG on white, ISTRUZIONI.txt, all in one zip), with the steps for Gmail, Outlook (web, new and classic) and Apple Mail.
   The choice is saved in the project: the «agents» document under the key firme (agents-page.js keeps it).
   Pure part runs in Node for the tests; firmaStudio() is the browser widget. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixFirmaStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
function lib(name,file){if(root[name])return root[name];try{return typeof require==='function'?require(file):null}catch(e){return null}}
const CO=()=>lib('RadixCoordinatoStudio','./coordinato-studio.js'),PS=()=>lib('RadixPrintStudio','./print-studio.js'),ZIP=()=>lib('RadixZip','./zip-lite.js');
const AGENT='art-director',MAX_SAVED=10,ROOT='firma-email';
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const slug=s=>norm(s).replace(/ /g,'-').slice(0,40);
const up=h=>String(h||'').toUpperCase();

// ---- the three layouts (the signature layouts of lib/coordinato-studio.js) ----
const LAYOUTS=Object.freeze([
 {id:'classico',title:'Classico',line:'Logo a sinistra, nome e contatti a destra dietro una linea di colore.'},
 {id:'moderno',title:'Moderno',line:'Solo testo pulito, una lineetta di colore e il logo piccolo sotto.'},
 {id:'audace',title:'Audace',line:'Nome e ruolo su una fascia del colore del brand, contatti sotto.'}]);
const layout=id=>LAYOUTS.find(l=>l.id===id)||LAYOUTS[0];
const ACCENT_LABEL=Object.freeze({accent:'Colore di accento',primary:'Colore primario',secondary:'Colore secondario'});
const LOGO_LABEL=Object.freeze({medio:'Logo medio',piccolo:'Logo piccolo',nessuno:'Senza logo'});
// What the signature shows of the company (the stationery fields of the coordinato).
const SHOWN=Object.freeze(['ragione','piva','indirizzo','telefono','email','sito']);

// ---- the model ----
// input: {layout, company, people, logoUrl, style:{accent, logo, legal, payoff, darkSafe, social:{linkedin:url,…}}}
function modelOf(input,profile,{projectName}={}){const i=input||{},C=CO();
 const m=C.modelOf({direction:layout(i.layout).id,company:i.company,people:i.people,pieces:['firma'],logoUrl:i.logoUrl},profile,{projectName});
 return {...m,layout:m.direction,style:C.sigStyle(i.style)}}
const nameOf=m=>clean(m.brand.name||m.company.ragione);
const hasContact=m=>!!(clean(m.company.telefono)||clean(m.company.email)||clean(m.company.sito)||m.people.some(p=>clean(p.telefono)||clean(p.email)));
// What blocks the export: without a name the signature does not say who writes, without any contact it is useless.
function blockers(m){const out=[];
 if(!nameOf(m))out.push('Manca il nome dell’azienda (ragione sociale, o un Kit identità con il nome): senza, la firma non dice chi scrive.');
 if(!hasContact(m))out.push('Manca almeno un contatto: scrivi il telefono, l’email o il sito dell’azienda, oppure l’email o il telefono di una persona.');
 return out}
// The company fields left blank: they are simply not in the signature (never invented).
function omitted(m){const L=Object.fromEntries(CO().COMPANY.map(c=>[c[0],c[1]]));return SHOWN.filter(k=>!clean(m.company[k])).map(k=>L[k])}

// ---- the signatures ----
// logo: {src, w, h} (preview: the kit SVG; export: the PNG on white or the address on the client's site) or null.
function signatures(m,{logo=null}={}){const C=CO(),ps=m.people.length?m.people:[null];
 return ps.map((p,i)=>({person:p,label:p?p.nome:nameOf(m)||'Azienda',base:'firma'+(p?'-'+(slug(p.nome)||'persona-'+(i+1)):''),
  html:C.signatureHtml(m,p,{logo,style:m.style}),text:C.signatureText(m,p,m.style)}))}
// Colours used by the signature HTML.
const colours=html=>[...new Set([...String(html).matchAll(/(?:color|background-color|border-left):\s*(?:2px solid )?(#[0-9A-Fa-f]{6})|bgcolor="(#[0-9A-Fa-f]{6})"/g)].map(x=>up(x[1]||x[2])))];
// The checks before the export: [{id, label, state:'ok'|'warn'|'fail', detail, issues:[...]}].
function checksOf(m,{logo=null}={}){const C=CO(),P=PS(),out=[],add=(id,label,state,detail,issues=[])=>out.push({id,label,state,detail,issues});
 const bl=blockers(m),om=omitted(m),sigs=signatures(m,{logo});
 add('dati','Dati della firma',bl.length?'fail':om.length?'warn':'ok',bl.length?'Prima completa i dati: la firma non si esporta così.':om.length?'Non compaiono nella firma: '+om.map(x=>x.toLowerCase()).join(', ')+'. RADIX non li inventa: se servono, scrivili qui sopra.':'Nome, contatti, sito e dati societari ci sono.',bl.length?bl:om);
 const rules=[...new Set(sigs.flatMap(s=>C.signatureProblems(s.html,m).map(x=>(m.people.length>1?s.label+': ':'')+x)))];
 add('regole','Regole delle caselle email',rules.length?'fail':'ok',rules.length?'La firma non rispetta le regole delle caselle email.':'Tabelle e stili in linea, al massimo '+C.SIGNATURE_MAX+' px, leggibile senza immagini e in finestre strette, nessun indirizzo esterno tranne il sito e i profili social.',rules);
 const dark=sigs.flatMap(s=>C.darkModeProblems(s.html));
 add('scuro','Modalità scura',dark.length?'warn':'ok',dark.length?dark[0]:'Fondo bianco fisso sotto tutta la firma e logo su fondo bianco: leggibile anche quando la casella è in modalità scura.');
 const col=C.signatureColours(m,m.style),need=(px,bold)=>px>=24||(bold&&px>=18.67)?3:4.5,ci=[];
 [[col.head,'#FFFFFF','Nome e sito',15,true],[col.txt,'#FFFFFF','Contatti',13,false],[col.soft,'#FFFFFF','Ruolo e dati societari',11,false]].concat(m.layout==='audace'?[[col.on,col.band,'Nome sulla fascia',16,true]]:[])
  .forEach(([fg,bg,label,px,bold])=>{const r=P.contrast(fg,bg),n=need(px,bold);if(r<n)ci.push(label+': '+up(fg)+' su '+up(bg)+' '+String(r).replace('.',',')+':1 (serve '+String(n).replace('.',',')+':1)')});
 add('contrasto','Contrasto AA',ci.length?'fail':'ok',ci.length?'Testi poco leggibili sul loro fondo.':'Ogni testo ha almeno 4,5:1 sul suo fondo.',ci);
 const ok=new Set(Object.values(m.brand.palette).map(up).concat(['#FFFFFF','#000000'])),off=[...new Set(sigs.flatMap(s=>colours(s.html)).filter(h=>!ok.has(h)))];
 add('colori','Colori della palette',off.length?'fail':'ok',off.length?'Colori fuori dalla palette: '+off.join(', ')+'.':'Solo i colori del Kit identità'+(m.brand.direction?' «'+m.brand.direction+'»':'')+', più bianco e nero.',off);
 const want=m.style.logo!=='nessuno'&&!!m.brand.logo,hosted=want&&C.logoSource(m,{w:480,h:160,dataUrl:'data:image/png;base64,AA=='}).hosted;
 add('logo','Logo',!want||hosted?'ok':'warn',!m.brand.logo?'Il kit non ha un logo: la firma è solo testo.':m.style.logo==='nessuno'?'Firma senza logo, solo testo.':hosted?'Il logo arriva dal tuo sito ('+clean(m.logoUrl)+'): lo vedono anche Gmail e Outlook.':
  'Il logo è incorporato nella firma (PNG su fondo bianco). Gmail e alcune caselle tolgono le immagini incorporate: carica logo-firma.png sul tuo sito e scrivi il suo indirizzo qui sopra.'+(clean(m.logoUrl)?' L’indirizzo scritto non è un https del tuo sito: non lo uso.':''));
 return out}
const blocking=checks=>checks.filter(c=>c.state==='fail');

// ---- how to install it ----
const CLIENTS=Object.freeze([
 {id:'gmail',title:'Gmail',steps:['In RADIX premi «Copia la firma» (oppure apri il file .html nel browser, seleziona tutto con Ctrl+A o Cmd+A e copia).','In Gmail apri l’ingranaggio › Visualizza tutte le impostazioni › scheda Generali › Firma › Crea nuova, e dai un nome.','Incolla nel riquadro della firma con Ctrl+V o Cmd+V.','In «Impostazioni predefinite della firma» scegli la firma per i nuovi messaggi e per le risposte.','In fondo alla pagina premi «Salva modifiche».'],
  note:'Gmail toglie le immagini incorporate: perché il logo si veda, caricalo sul tuo sito e scrivi il suo indirizzo nello studio prima di copiare.'},
 {id:'outlook',title:'Outlook sul web e nuovo Outlook',steps:['In RADIX premi «Copia la firma».','In Outlook apri Impostazioni (ingranaggio) › Account › Firme › Nuova firma, e dai un nome.','Incolla nel riquadro con Ctrl+V o Cmd+V.','Sotto, scegli la firma per i nuovi messaggi e per risposte e inoltri.','Premi «Salva».']},
 {id:'outlook-classico',title:'Outlook classico per Windows',steps:['In RADIX premi «Copia la firma».','In Outlook: File › Opzioni › Posta › Firme… › Nuova, e dai un nome.','Incolla nel riquadro «Modifica firma» con Ctrl+V.','A destra scegli la firma per i nuovi messaggi e per risposte e inoltri.','Premi OK.'],
  note:'Outlook classico usa le colonne fisse della firma: logo e testo restano affiancati.'},
 {id:'apple',title:'Apple Mail',steps:['In RADIX premi «Copia la firma».','In Mail: Mail › Impostazioni › Firme, scegli l’account e premi +.','Togli la spunta a «Utilizza sempre il font predefinito dei messaggi».','Incolla nel riquadro a destra con Cmd+V.','Chiudi la finestra: la firma è salvata.'],
  note:'Se incollando il logo diventa un riquadro vuoto, usa l’indirizzo del logo sul tuo sito.'}]);
function instructions(m,{hosted=false}={}){const L=['FIRMA EMAIL · '+(nameOf(m)||'Azienda'),'Layout: '+layout(m.layout).title+' · '+ACCENT_LABEL[m.style.accent]+' · '+LOGO_LABEL[m.style.logo]+' · preparata con RADIX, nessuna chiamata AI',''];
 L.push('COME SI USA','- Apri firma-<nome>.html nel browser, seleziona tutto (Ctrl+A o Cmd+A), copia e incolla nelle impostazioni della firma. Il file .txt è la versione solo testo.','');
 for(const c of CLIENTS){L.push(c.title.toUpperCase(),...c.steps.map((s,i)=>(i+1)+'. '+s));if(c.note)L.push('Nota: '+c.note);L.push('')}
 L.push('LOGO',hosted?'- Il logo arriva dall’indirizzo sul tuo sito: se lo sposti o lo cancelli, la firma resta senza logo.':'- Il logo è incorporato (PNG su fondo bianco). Gmail e alcune caselle lo tolgono: carica logo-firma.png sul tuo sito, scrivi il suo indirizzo nello studio e copia di nuovo la firma.',
  '- Senza immagini la firma resta leggibile: nome, contatti e dati societari sono testo.','');
 L.push('MODALITÀ SCURA',m.style.darkSafe?'- La firma ha un fondo bianco fisso: in modalità scura resta un riquadro chiaro e leggibile.':'- Il fondo bianco fisso è spento: in modalità scura alcune caselle possono mostrare testo scuro su fondo scuro.','');
 const om=omitted(m);if(om.length)L.push('DATI NON PRESENTI (RADIX non li inventa)',...om.map(x=>'- '+x),'');
 return L.join('\n')+'\n'}

// ---- the files ----
const zipName=m=>'firma-'+(slug(nameOf(m))||'azienda')+'-'+layout(m.layout).id+'.zip';
// png: the logo on white {data,w,h,dataUrl} (browser) or null. Throws when the export is blocked.
function files(m,{png=null}={}){const C=CO(),bl=blockers(m);if(bl.length)throw Error(bl.join(' '));
 const src=m.style.logo!=='nessuno'?C.logoSource(m,png):null,out=[],add=(name,data,label)=>out.push({name:ROOT+'/'+name,data,label});
 for(const s of signatures(m,{logo:src})){add(s.base+'.html',C.signaturePage(s.html,'Firma email · '+s.label),'Firma · '+s.label+' (HTML)');add(s.base+'.txt',s.text,'Firma · '+s.label+' (testo)')}
 if(png&&png.data&&m.style.logo!=='nessuno')add('logo-firma.png',png.data,'Logo su fondo bianco (da caricare sul sito)');
 add('ISTRUZIONI.txt',instructions(m,{hosted:!!(src&&src.hosted)}),'Come installarla in Gmail, Outlook e Apple Mail');
 return out}
const bundle=(list,{date}={})=>ZIP().zip(list.map(f=>({name:f.name,data:f.data})),{date:date||new Date()});

// ---- saved in the project: the «agents» document, key firme ----
const emptyStore=()=>({schemaVersion:1,items:[]});
function readStore(doc){const s=doc&&doc.firme;return s&&typeof s==='object'&&Array.isArray(s.items)?{schemaVersion:1,items:s.items.filter(x=>x&&typeof x==='object')}:emptyStore()}
function savedRecord(m,{by,at}={}){const when=at||new Date().toISOString(),st=m.style;
 return {id:'firma-'+when.replace(/\D/g,'').slice(0,14),at:when,by:clean(by).slice(0,80),layout:m.layout,
  style:{accent:st.accent,logo:st.logo,legal:st.legal,payoff:st.payoff,darkSafe:st.darkSafe,social:Object.fromEntries(st.social.map(x=>[x.id,x.url]))},
  company:{...m.company},people:m.people.map(p=>({...p})),logoUrl:m.logoUrl,kit:{brand:clean(m.brand.name),direction:clean(m.brand.direction)}}}
function addRecord(store,rec){const s=readStore({firme:store});return {schemaVersion:1,items:s.items.filter(x=>x.id!==rec.id).concat([rec]).slice(-MAX_SAVED)}}
async function saveToProject(ws,projectId,rec){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');
 const d=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await d.load())||{},next=addRecord(readStore(cur),rec);
  try{await d.save({...cur,schemaVersion:1,conversations:cur.conversations||{},firme:next});return next}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}
const fromRecord=(r,profile,opts)=>modelOf({layout:r.layout,style:r.style,company:r.company,people:r.people,logoUrl:r.logoUrl},profile,opts);

// ---- the widget (browser) ----
let counter=0;
const doc=()=>root.document;
const E=(tag,text,cls)=>{const n=doc().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=E('button',text,cls||'');b.type='button';return b};
const MIME={html:'text/html;charset=utf-8',txt:'text/plain;charset=utf-8',png:'image/png',zip:'application/zip'};
const save=(name,data)=>PS().download(name.split('/').pop(),data,MIME[name.split('.').pop()]||'application/octet-stream');
// A preview of the signature in a mail window: light, or a simulated dark mode (dark page around the signature).
function frame(html,title,{dark=false}={}){const C=CO(),f=E('iframe',undefined,'co-sig-frame fs-frame'+(dark?' fs-frame-dark':''));f.setAttribute('sandbox','allow-same-origin');f.title=title;f.loading='lazy';
 const page=C.signaturePage(html,title,{pad:12});f.srcdoc=dark?page.replace('background-color:#ffffff;','background-color:#1f1f1f;').replace('content="light"','content="dark"'):page;
 f.onload=()=>{try{const d=f.contentDocument;if(d&&d.body)f.style.height=Math.min(460,d.body.scrollHeight+8)+'px'}catch(e){}};return f}
// The signature in the clipboard as rich HTML (pastes as a formatted signature), plain text as the alternative.
async function copySignature(html,text){const nav=root.navigator;
 if(nav&&nav.clipboard&&typeof nav.clipboard.write==='function'&&typeof root.ClipboardItem==='function'){await nav.clipboard.write([new root.ClipboardItem({'text/html':new root.Blob([html],{type:'text/html'}),'text/plain':new root.Blob([text],{type:'text/plain'})})]);return true}
 const box=E('div');box.contentEditable='true';box.style.cssText='position:fixed;left:-9999px;top:0;opacity:0';box.innerHTML=html;doc().body.append(box);
 const r=doc().createRange();r.selectNodeContents(box);const sel=root.getSelection();sel.removeAllRanges();sel.addRange(r);let ok=false;try{ok=doc().execCommand('copy')}catch(e){}sel.removeAllRanges();box.remove();return ok}
// ctx: {project, profile, projectName, clientName, projectId, workspace, agentsUrl, by, openIdentity(), identityUrl}
function firmaStudio(ctx={}){const n=++counter,C=CO(),P=PS(),profile=ctx.profile||{},wrap=E('div',undefined,'tool photo-studio ad-studio coordinato-studio firma-studio');
 const steps=E('ol',undefined,'ps-steps');['Le domande','3 proposte','Rifinitura e controlli','Copia o scarica'].forEach((t,i)=>{const li=E('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 wrap.append(steps);setStep(1);
 const brand=P.brandOf(profile,ctx.projectName);
 if(!C.hasKit(profile)){const box=E('div',undefined,'co-empty');box.append(E('h3','Prima serve il Kit identità'),E('p','La firma usa il logo e i colori del Kit identità del progetto. Questo progetto non ne ha ancora uno salvato, e RADIX non inventa colori o logo al suo posto.','ad-idea'));
  const go=ctx.openIdentity?button('Crea il Kit identità','primary'):E('a','Crea il Kit identità','co-link primary');if(ctx.openIdentity)go.onclick=()=>ctx.openIdentity();else go.href=ctx.identityUrl||'/agency/crea.html?open=identita';
  const acts=E('div',undefined,'ps-actions');acts.append(go,E('span','Il Kit identità è una chiamata AI con conferma; la firma poi è gratuita.','muted'));box.append(acts);wrap.append(box);return wrap}
 const pre=C.prefill(profile,{projectName:ctx.projectName,clientName:ctx.clientName,summary:ctx.project});
 const st={company:{...pre.values},people:[{nome:'',ruolo:'',email:'',telefono:''}],layout:'',logoUrl:'',style:{accent:'accent',logo:'medio',legal:true,payoff:false,darkSafe:true,social:{}},who:0,png:null,busy:false};
 const input=id=>({layout:id,company:st.company,people:st.people,logoUrl:st.logoUrl,style:st.style});
 const model=()=>modelOf(input(st.layout||'classico'),profile,{projectName:ctx.projectName});
 const vb=brand.logo?P.viewBox(brand.logo):null,previewLogo=vb?{src:P.svgUrl(brand.logo),w:480,h:Math.max(1,Math.round(480*vb[3]/vb[2]))}:null;
 // the kit in use
 const bx=E('div',undefined,'ad-brand co-brand');bx.dataset.source='kit';const sw=E('span',undefined,'ad-swatches');
 ['primary','secondary','accent','dark','light'].forEach(k=>{const i=E('i');i.style.background=brand.palette[k];i.title=k+' '+brand.palette[k];sw.append(i)});
 const bt=E('span',undefined,'ad-brand-text');bt.append(E('strong',brand.name||'Il tuo brand'),E('span','Dal Kit identità'+(brand.direction?' «'+brand.direction+'»':'')+(brand.logo?'':' · senza logo: la firma è solo testo')));
 bx.append(sw,bt);if(brand.logo){const li=E('img');li.src=P.svgUrl(brand.logo);li.alt='Logo del kit';li.className='ad-brand-logo';bx.append(li)}
 const form=E('div',undefined,'ps-form');
 // company data (only what the signature shows)
 const cfs=E('fieldset',undefined,'co-company');cfs.append(E('legend','Dati dell’azienda nella firma'));const grid=E('div',undefined,'co-fields'),inputs={};
 C.COMPANY.forEach(([k,label,max,ph])=>{const l=E('label',undefined,'co-field'+(k==='altri'?' co-wide':''));l.dataset.key=k;const s=E('span',label),i=E('input');i.type=k==='email'?'email':k==='telefono'?'tel':'text';i.maxLength=max;i.placeholder=ph||'';i.value=st.company[k]||'';i.name='fs-'+k;
  i.oninput=()=>{st.company[k]=i.value;changed()};l.append(s,i);if(pre.from[k])l.append(E('small',pre.from[k]==='cliente'?'Dalla scheda del cliente: controlla':'Dal progetto: controlla','co-from'));inputs[k]=i;grid.append(l)});
 cfs.append(grid,E('p','I campi vuoti non compaiono nella firma: RADIX non inventa dati. Servono almeno il nome dell’azienda e un contatto.','ad-note co-hint'));
 // people
 const pplFs=E('fieldset',undefined,'co-people');pplFs.append(E('legend','Persone (una firma per ognuna)'));const rows=E('div',undefined,'co-people-rows'),addP=button('Aggiungi una persona','co-add');
 function renderPeople(){rows.replaceChildren(...st.people.map((p,i)=>{const r=E('div',undefined,'co-person');C.PERSON.forEach(([k,label,max])=>{const l=E('label',undefined,'co-field'),x=E('input');x.type=k==='email'?'email':k==='telefono'?'tel':'text';x.maxLength=max;x.value=p[k]||'';x.name='fs-p'+i+'-'+k;x.oninput=()=>{p[k]=x.value;changed()};l.append(E('span',label),x);r.append(l)});
   if(st.people.length>1){const del=button('Togli','co-del');del.setAttribute('aria-label','Togli la persona '+(i+1));del.onclick=()=>{st.people.splice(i,1);st.who=0;renderPeople();changed()};r.append(del)}return r}));addP.disabled=st.people.length>=10}
 addP.onclick=()=>{if(st.people.length<10){st.people.push({nome:'',ruolo:'',email:'',telefono:''});renderPeople();const last=rows.lastElementChild&&rows.lastElementChild.querySelector('input');if(last)last.focus()}};
 renderPeople();pplFs.append(rows,addP,E('p','Senza persone preparo una firma solo aziendale. Email e telefono diretti sostituiscono quelli dell’azienda.','ad-note'));
 // logo address and social profiles
 const extra=E('fieldset',undefined,'co-company fs-extra');extra.append(E('legend','Logo e profili social (facoltativi)'));const eg=E('div',undefined,'co-fields');
 const lul=E('label',undefined,'co-field co-wide'),lui=E('input');lui.type='url';lui.placeholder='https://www.tuosito.it/logo-firma.png';lui.maxLength=300;lui.name='fs-logo-url';lui.oninput=()=>{st.logoUrl=lui.value;changed()};
 lul.append(E('span','Indirizzo del logo sul tuo sito'),lui,E('small','Gmail toglie le immagini incorporate: carica logo-firma.png (è nello zip) sul tuo sito e scrivi qui il suo indirizzo. Solo indirizzi https del tuo sito.','co-from'));eg.append(lul);
 const socialIn={};C.SOCIAL.forEach(([id,label,d])=>{const l=E('label',undefined,'co-field'),x=E('input');x.type='url';x.placeholder='https://www.'+d+'/…';x.maxLength=200;x.name='fs-social-'+id;x.oninput=()=>{st.style={...st.style,social:{...st.style.social,[id]:x.value}};changed()};socialIn[id]=x;l.append(E('span',label),x);eg.append(l)});
 extra.append(eg,E('p','Solo i profili che scrivi tu, solo indirizzi del social giusto: diventano link di testo, senza icone esterne.','ad-note'));
 const go=button('Prepara 3 proposte','primary'),bar=E('div',undefined,'ps-actions');bar.append(go,E('span','Nessuna chiamata AI: proposte, controlli e file si creano qui, senza costi.','muted'));
 form.append(bx,cfs,pplFs,extra,bar);
 const status=E('p','','tool-status');status.setAttribute('role','status');
 const saved=E('div',undefined,'ad-saved co-saved');saved.hidden=true;
 const dirs=E('div',undefined,'ad-dirs co-dirs fs-dirs'),result=E('div',undefined,'ad-result co-result fs-result'),out=E('div',undefined,'co-kit fs-out');dirs.hidden=result.hidden=out.hidden=true;
 wrap.append(form,saved,status,dirs,result,out);
 let timer=0;function changed(){if(dirs.hidden)return;clearTimeout(timer);timer=setTimeout(()=>{renderDirs();if(st.layout)renderResult()},300)}
 async function loadSaved(){if(!ctx.workspace||!ctx.projectId)return;try{const s=readStore(await ctx.workspace.bind(ctx.projectId,'agents').load());if(!s.items.length)return;
  saved.replaceChildren(E('h4','Firme salvate nel progetto'));const row=E('div',undefined,'ad-saved-row');
  s.items.slice(-4).reverse().forEach(r=>{const b=button(layout(r.layout).title+' · '+String(r.at||'').slice(0,10),'ad-saved-item');b.onclick=()=>{st.company={...st.company,...(r.company||{})};st.people=(r.people&&r.people.length?r.people:[{nome:'',ruolo:'',email:'',telefono:''}]).map(p=>({...p}));
   st.logoUrl=r.logoUrl||'';st.layout=layout(r.layout).id;st.style={...st.style,...(r.style||{}),social:{...((r.style&&r.style.social)||{})}};st.who=0;for(const k of Object.keys(inputs))inputs[k].value=st.company[k]||'';lui.value=st.logoUrl;for(const id of Object.keys(socialIn))socialIn[id].value=st.style.social[id]||'';
   renderPeople();renderDirs();renderResult();status.textContent='Riaperta la firma salvata: controlla i dati e copiala di nuovo.'};row.append(b)});
  saved.append(row);saved.hidden=false}catch(e){}}
 loadSaved();
 go.onclick=()=>{renderDirs();status.textContent='Ecco le 3 proposte fatte con il tuo kit: scegli quella da usare.';dirs.scrollIntoView&&dirs.scrollIntoView({behavior:'smooth',block:'start'})};
 function renderDirs(){setStep(st.layout?3:2);dirs.hidden=false;
  dirs.replaceChildren(...LAYOUTS.map(d=>{const m=modelOf(input(d.id),profile,{projectName:ctx.projectName}),s=signatures(m,{logo:previewLogo})[0];
   const card=E('article',undefined,'ad-dir co-dir fs-dir');card.dataset.chosen=String(st.layout===d.id);card.dataset.layout=d.id;
   const head=E('div',undefined,'ad-dir-head');head.append(E('span','Proposta','ad-angle'),E('h3',d.title),E('p',d.line,'ad-idea'));
   const pick=button(st.layout===d.id?'Proposta scelta':'Scegli questa firma','primary');pick.onclick=()=>{st.layout=d.id;renderDirs();renderResult();result.scrollIntoView&&result.scrollIntoView({behavior:'smooth',block:'start'})};
   card.append(head,frame(s.html,'Firma '+d.title+' · '+s.label),pick);return card}))}
 function checkRow(c){const row=E('div',undefined,'co-check');row.dataset.state=c.state;row.dataset.check=c.id;
  row.append(E('span',{ok:'OK',warn:'Da guardare',fail:'Da sistemare'}[c.state],'co-check-badge'),E('strong',c.label),E('p',c.detail,'co-check-detail'));
  if(c.issues.length){const ul=E('ul');c.issues.slice(0,8).forEach(i=>ul.append(E('li',i)));row.append(ul)}return row}
 // the refinement controls
 function refine(){const box=E('div',undefined,'fs-refine'),pal=brand.palette;
  const acc=E('fieldset',undefined,'fs-choice');acc.append(E('legend','Colore della linea e del nome'));
  C.SIG_ACCENTS.forEach(a=>{const l=E('label',undefined,'ps-chip fs-swatch'),r=E('input');r.type='radio';r.name='fs-accent-'+n;r.value=a;r.checked=st.style.accent===a;r.onchange=()=>{st.style={...st.style,accent:a};renderResult()};const i=E('i');i.style.background=pal[a];l.append(r,i,E('span',ACCENT_LABEL[a]));acc.append(l)});
  const lg=E('fieldset',undefined,'fs-choice');lg.append(E('legend','Logo'));
  Object.keys(C.SIG_LOGO).forEach(k=>{const l=E('label',undefined,'ps-chip'),r=E('input');r.type='radio';r.name='fs-logo-'+n;r.value=k;r.checked=st.style.logo===k;r.disabled=!brand.logo&&k!=='nessuno';r.onchange=()=>{st.style={...st.style,logo:k};renderResult()};l.append(r,E('span',LOGO_LABEL[k]));lg.append(l)});
  const opts=E('fieldset',undefined,'fs-choice');opts.append(E('legend','Righe e modalità scura'));
  [['legal','Ragione sociale e P. IVA'],['payoff','Payoff sotto il nome'],['darkSafe','Fondo bianco fisso (modalità scura)']].forEach(([k,label])=>{const l=E('label',undefined,'ps-chip'),c=E('input');c.type='checkbox';c.name='fs-'+k+'-'+n;c.checked=!!st.style[k];c.disabled=k==='payoff'&&!clean(st.company.payoff);c.onchange=()=>{st.style={...st.style,[k]:c.checked};renderResult()};l.append(c,E('span',label));opts.append(l)});
  box.append(acc,lg,opts);return box}
 function renderResult(){const m=model(),sigs=signatures(m,{logo:previewLogo}),checks=checksOf(m),fails=blocking(checks);setStep(3);result.hidden=false;out.hidden=true;if(st.who>=sigs.length)st.who=0;
  const head=E('div',undefined,'ad-result-head'),hd=E('div');hd.append(E('span','Firma '+layout(m.layout).title,'ad-angle'),E('h3','La firma email di '+(nameOf(m)||'il tuo brand')),E('p','Rifinisci colori, logo e righe: anteprime e controlli si aggiornano. I dati li cambi qui sopra.','ad-idea'));head.append(hd);
  const who=E('label',undefined,'co-field fs-who');const sel=E('select');sel.name='fs-who-'+n;sigs.forEach((s,i)=>{const o=E('option',s.label);o.value=String(i);sel.append(o)});sel.value=String(st.who);sel.onchange=()=>{st.who=+sel.value;renderResult()};who.append(E('span','Anteprima di'),sel);
  const s=sigs[st.who],views=E('div',undefined,'fs-views');
  const fig=(label,node)=>{const f=E('figure',undefined,'co-fig fs-view');f.append(node,E('figcaption',label));return f};
  views.append(fig('Casella chiara',frame(s.html,'Firma · '+s.label)),fig('Casella in modalità scura (simulazione)',frame(s.html,'Firma in modalità scura · '+s.label,{dark:true})));
  const block=E('div',undefined,'co-missing');const bl=blockers(m);block.hidden=!bl.length;if(bl.length){block.setAttribute('role','alert');block.append(E('strong','La firma non si può ancora esportare'),...bl.map(x=>E('p',x)))}
  const checksBox=E('div',undefined,'co-checks');checksBox.append(E('h4','Controlli prima di copiare'),...checks.map(checkRow));
  const ready=button('Prepara copia e download','primary'),saveB=button('Salva nel progetto'),acts=E('div',undefined,'ps-actions co-actions'),rs=E('p','','tool-status');rs.setAttribute('role','status');
  acts.append(ready,saveB,E('span','Nessuna chiamata AI e nessuna email inviata: copi tu la firma nella tua casella.','muted'));
  if(fails.length){ready.disabled=true;ready.title='Si attiva quando i controlli in rosso sono sistemati.';rs.textContent='Prima sistema: '+fails.map(c=>c.label.toLowerCase()).join(', ')+'.'}
  ready.onclick=async()=>{if(st.busy)return;const mm=model();if(blocking(checksOf(mm)).length){rs.textContent='Prima sistema i controlli in rosso.';return}
   st.busy=true;ready.disabled=true;rs.textContent='Preparo il logo su fondo bianco e i file…';
   try{if(!st.png&&brand.logo)st.png=await C.logoPng(brand.logo,{bg:'#FFFFFF'});renderOut(mm);rs.textContent='Pronta: copia la firma o scarica i file.';out.scrollIntoView&&out.scrollIntoView({behavior:'smooth',block:'start'})}
   catch(e){rs.textContent='File non creati: '+e.message}finally{st.busy=false;ready.disabled=false}};
  saveB.onclick=async()=>{if(!ctx.workspace||!ctx.projectId){rs.textContent='Apri un progetto per salvare la firma.';return}saveB.disabled=true;
   try{await saveToProject(ctx.workspace,ctx.projectId,savedRecord(model(),{by:ctx.by}));rs.replaceChildren(doc().createTextNode('Firma salvata nel progetto: proposta, rifinitura, dati e persone. La riapri da qui. '));if(ctx.agentsUrl){const a=E('a','Apri in Agenti AI →');a.href=ctx.agentsUrl;rs.append(a)}loadSaved()}
   catch(e){rs.textContent='Salvataggio non riuscito: '+e.message}finally{saveB.disabled=false}};
  result.replaceChildren(head,refine(),who,views,block,checksBox,acts,rs)}
 function renderOut(m){setStep(4);out.hidden=false;let list;try{list=files(m,{png:st.png})}catch(e){out.replaceChildren(E('p',e.message,'co-missing'));return}
  const src=m.style.logo!=='nessuno'?C.logoSource(m,st.png):null,sigs=signatures(m,{logo:src});
  const top=E('div',undefined,'co-kit-head');top.append(E('h3','La firma è pronta'),E('p',sigs.length+(sigs.length===1?' firma':' firme')+': copiala e incollala nelle impostazioni della tua casella, oppure scarica i file.','ad-idea'));
  const people=E('div',undefined,'fs-people');
  sigs.forEach(s=>{const row=E('div',undefined,'fs-person');const t=E('span',undefined,'co-file');t.append(E('strong',s.label),E('small',s.base+'.html · '+s.base+'.txt'));
   const cp=button('Copia la firma','primary fs-copy'),dh=button('Scarica .html','co-dl'),dt=button('Scarica .txt','co-dl'),ok=E('span','','fs-copied');ok.setAttribute('role','status');
   cp.onclick=async()=>{try{ok.textContent=await copySignature(s.html,s.text)?'Copiata: incollala nelle impostazioni della firma.':'Copia non riuscita: scarica il file .html, aprilo e copia da lì.'}catch(e){ok.textContent='Copia non riuscita: scarica il file .html, aprilo e copia da lì.'}};
   dh.onclick=()=>save(s.base+'.html',C.signaturePage(s.html,'Firma email · '+s.label));dt.onclick=()=>save(s.base+'.txt',s.text);
   const b=E('div',undefined,'fs-person-actions');b.append(cp,dh,dt);row.append(t,b,ok);people.append(row)});
  const zipB=button('Scarica tutto (.zip)'),acts=E('div',undefined,'ps-actions');zipB.onclick=()=>save(zipName(m),bundle(list));acts.append(zipB,E('span',list.length+' file: firme, logo su fondo bianco e istruzioni.','muted'));
  const how=E('section',undefined,'fs-how');how.append(E('h4','Come installarla'));
  CLIENTS.forEach((c,i)=>{const d=E('details',undefined,'fs-client');if(i===0)d.open=true;d.append(E('summary',c.title));const ol=E('ol');c.steps.forEach(x=>ol.append(E('li',x)));d.append(ol);if(c.note)d.append(E('p',c.note,'ad-note'));how.append(d)});
  if(src&&!src.hosted)how.append(E('p','Il logo è incorporato nella firma: Gmail lo toglie. Per vederlo ovunque carica logo-firma.png sul tuo sito e scrivi il suo indirizzo nelle domande.','co-hint'));
  out.replaceChildren(top,people,acts,how)}
 return wrap}

return Object.freeze({AGENT,LAYOUTS,CLIENTS,ACCENT_LABEL,LOGO_LABEL,modelOf,blockers,omitted,signatures,checksOf,blocking,instructions,files,bundle,zipName,
 readStore,savedRecord,addRecord,saveToProject,fromRecord,copySignature,firmaStudio});
});
