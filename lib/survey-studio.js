/* Studio «Sondaggio e NPS» (agency job M1), the browser widget; every rule and file is in lib/survey-core.js.
   1. «Domande»: the goal (NPS clienti, soddisfazione dopo l'acquisto, ricerca di mercato breve, feedback evento), who
      answers and how long it may take. No AI.
   2. «Proposte»: three questionnaires from fixed templates, «Breve», «Standard», «Approfondito», the one that fits the
      chosen length marked.
   3. «Rifinisci»: questions (edit, move, add: NPS 0–10, scala 1–5, scelta singola, multipla, testo breve), intro,
      privacy line, thank-you text, sample, the main colour from the Kit identità; live preview of the page and the paper
      version, live checks.
   4. «Metti online»: the CRM workspace that receives the answers (the existing form token), the company data of the
      privacy page, the publication on its own hosting project (api/_site_publish.js, action survey). «Salva nel progetto».
   5. «Risultati ed export»: the answers read from the CRM (GET /api/sales interactions), NPS, charts, the open answers,
      answers on paper from the CSV model (.pf-drop), the optional AI summary (ONE call, only after RadixConfirm), and
      the files: report PDF, questionnaire PDF for paper, CSV, zip. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixSurveyStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
function lib(name,file){if(root[name])return root[name];try{return typeof require==='function'?require(file):null}catch(e){return null}}
const C=()=>lib('RadixSurveyCore','./survey-core.js'),PS=()=>lib('RadixPrintStudio','./print-studio.js'),SITE=()=>lib('RadixSiteStudio','./site-studio.js'),LEGAL=()=>lib('RadixSiteLegal','./site-legal.js');
const askConfirm=o=>{const R=root.RadixConfirm;return R?R.ask(o):Promise.resolve(!!(root.confirm&&root.confirm([o.title,o.cost,o.message].filter(Boolean).join('\n'))))};
const clean=s=>String(s==null?'':s).replace(/[\s ]+/g,' ').trim();
const cap=s=>{s=clean(s);return s?s[0].toUpperCase()+s.slice(1):s};
const copy=o=>JSON.parse(JSON.stringify(o));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let counter=0;
const dom=()=>root.document;
const E=(tag,text,cls)=>{const x=dom().createElement(tag);if(text!=null)x.textContent=text;if(cls)x.className=cls;return x};
const button=(text,cls)=>{const b=E('button',text,cls||'');b.type='button';return b};
const svgUrl=svg=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
const svgImg=(svg,alt,cls)=>{const i=E('img');i.src=svgUrl(svg);i.alt=alt||'';i.decoding='async';if(cls)i.className=cls;return i};
const note=text=>E('p',text,'cs-note');
function choice(name,legend,items,cur,onchange,cls){const fs=E('fieldset',undefined,'ig-choice'+(cls?' '+cls:''));fs.append(E('legend',legend));
 items.forEach(it=>{const l=E('label',undefined,'ps-chip ig-chip'),x=E('input');x.type='radio';x.name=name;x.value=it.id;x.checked=it.id===cur;x.onchange=()=>{if(x.checked)onchange(it.id)};
  const t=E('span',undefined,'ig-chip-text');t.append(E('b',it.label));if(it.small)t.append(E('small',it.small));l.append(x,t);l.dataset.value=it.id;fs.append(l)});return fs}
function field(label,value,on,{area=false,rows=2,max=300,ph='',count=0,help='',type='text',name=''}={}){const l=E('label',undefined,'rp-field'),x=E(area?'textarea':'input');if(area)x.rows=rows;else x.type=type;
 if(max)x.maxLength=max;x.value=value==null?'':value;x.placeholder=ph;if(name)x.name=name;const top=E('span',undefined,'fn-label');top.append(E('span',label));let c=null;
 if(count){c=E('small','','fn-count');top.append(c)}const upd=()=>{if(c){const k=Array.from(x.value).length;c.textContent=k+'/'+count;c.dataset.over=String(k>count)}};upd();
 x.oninput=()=>{upd();on(x.value)};l.append(top,x);if(help)l.append(E('small',help,'rp-help'));return l}
function checkRow(c){const row=E('div',undefined,'rp-check');row.dataset.state=c.state;row.dataset.check=c.id;row.append(E('span',{ok:'OK',warn:'Da guardare',fail:'Da sistemare'}[c.state],'rp-check-badge'),E('strong',c.label),E('p',c.detail,'rp-check-detail'));
 if(c.issues&&c.issues.length){const ul=E('ul');c.issues.slice(0,8).forEach(i=>ul.append(E('li',i)));row.append(ul)}return row}
const base64=bytes=>{const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);let s='';for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode.apply(null,b.subarray(i,i+32768));return root.btoa(s)};
const plural=(n,one,many)=>n+' '+(n===1?one:many);

// ctx: {project, profile, projectName, projectId, workspace, rt, agentsUrl, crmUrl, formEndpoint, fetch, today, by}
function surveyStudio(ctx={}){const S=C(),n=++counter,today=()=>ctx.today?new Date(ctx.today):new Date(),kit=S.brandFor(ctx.profile||{},ctx.projectName);
 const wrap=E('div',undefined,'tool photo-studio ad-studio report-studio infographic-studio funnel-studio survey-studio');
 const steps=E('ol',undefined,'ps-steps');['Domande','Proposte','Rifinisci','Metti online','Risultati ed export'].forEach((t,i)=>{const li=E('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');setStep(1);
 const st={m:S.newModel({projectName:ctx.projectName,profile:ctx.profile}),props:[],store:{schemaVersion:1,items:[],online:{}},tab:'domande',pv:'pagina',busy:false,results:null,paper:[],summary:null,workspaceId:''};
 const brand=()=>S.withColour(kit,st.m.survey&&st.m.survey.colour||'primary');
 const saved=E('div',undefined,'ad-saved rp-saved');saved.hidden=true;
 const status=E('p','','tool-status');status.setAttribute('role','status');
 const form=E('div',undefined,'ps-form ig-form fn-form sv-form'),dirs=E('div',undefined,'ad-dirs rp-dirs ig-dirs fn-dirs sv-dirs'),refine=E('div',undefined,'rp-result ig-refine fn-refine sv-refine'),online=E('div',undefined,'rp-result sv-publish'),results=E('div',undefined,'rp-result sv-results');
 dirs.hidden=refine.hidden=online.hidden=results.hidden=true;
 const bx=E('div',undefined,'ad-brand rp-brand ig-brand');bx.dataset.source=kit.source;const sw=E('span',undefined,'ad-swatches');
 ['primary','secondary','accent','dark','light'].forEach(k=>{const i=E('i');i.style.background=kit.palette[k];i.title=k+' '+kit.palette[k];sw.append(i)});
 const bt=E('span',undefined,'ad-brand-text');bt.append(E('strong',kit.name||ctx.projectName||'Il progetto'),E('span',kit.source==='kit'?'Pagina, PDF e report nei colori e col logo del Kit identità':'Nessun Kit identità: uso uno stile neutro e il nome al posto del logo.'));
 bx.append(sw,bt);if(kit.logo){const li=svgImg(kit.logo,'Logo del kit');li.className='ad-brand-logo';bx.append(li)}
 wrap.append(steps,saved,bx,form,status,dirs,refine,online,results);
 const scroll=x=>x.scrollIntoView&&x.scrollIntoView({behavior:'smooth',block:'start'});
 const opts=()=>({today:today()});
 // 1. the questions
 function renderForm(){const a=st.m.input;form.replaceChildren();
  const fs=E('fieldset',undefined,'rp-pick');fs.append(E('legend','Il sondaggio'));
  const g=choice('sv-goal-'+n,'Che cosa vuoi sapere',S.GOALS.map(x=>({id:x.id,label:x.label,small:x.small})),a.goal,v=>{a.goal=v},'sv-goals');
  const au=choice('sv-aud-'+n,'Chi risponde',S.AUDIENCES.map(x=>({id:x.id,label:x.label})),a.audience,v=>{a.audience=v},'sv-chips');
  const le=choice('sv-len-'+n,'Quanto tempo al massimo',S.LENGTHS.map(x=>({id:x.id,label:x.label})),a.length,v=>{a.length=v},'sv-chips');
  const f=E('div',undefined,'rp-fields');f.append(field('Nome dell’attività nelle domande',a.brand,v=>{a.brand=clean(v).slice(0,80)},{max:80,help:'Compare in domande come «Quanto è probabile che consigli … a un amico?».'}));
  fs.append(g,au,le,f);
  const go=button(st.props.length?'Rifai i 3 questionari':'Prepara 3 questionari','primary'),bar=E('div',undefined,'ps-actions');bar.append(go,E('span','Nessuna chiamata AI: le domande vengono dai modelli di RADIX, scritte in modo neutro.','muted'));
  go.onclick=()=>{if(!clean(a.brand)){status.textContent='Scrivi il nome dell’attività: compare nelle domande.';return}
   status.textContent='';st.props=S.proposals(a,opts());st.m.survey=null;refine.hidden=online.hidden=results.hidden=true;renderDirs();scroll(dirs)};
  form.append(fs,bar)}
 // 2. three questionnaires
 function renderDirs(){setStep(st.m.survey?3:2);dirs.hidden=false;const rec=S.recommended(st.m.input);
  dirs.replaceChildren(...st.props.map(s=>{const v=S.variantOf(s.variant),card=E('article',undefined,'ad-dir rp-dir ig-dir fn-dir sv-dir');card.dataset.variant=s.variant;card.dataset.chosen=String(!!st.m.survey&&st.m.survey.variant===s.variant);
   const hd=E('div',undefined,'ad-dir-head');hd.append(E('span',(s.variant===rec?'Consigliato · ':'')+plural(s.questions.length,'domanda','domande')+' · circa '+S.minutes(s.questions)+' min','ad-angle'),E('h3',v.label),E('p',v.line,'ad-idea'));
   const ol=E('ol',undefined,'sv-qlist');s.questions.slice(0,6).forEach(q=>{const li=E('li');li.append(E('span',S.typeOf(q.type).label,'sv-type'),E('span',q.text,'sv-qtext'));ol.append(li)});
   const body=E('div',undefined,'fn-dir-body');body.append(ol);if(s.questions.length>6)body.append(E('p','+ altre '+(s.questions.length-6)+' domande','muted'));
   const pick=button(card.dataset.chosen==='true'?'Questionario scelto':'Scegli questo questionario','primary');
   pick.onclick=()=>{st.m.survey=copy(s);st.m.survey.colour='primary';st.results=null;st.summary=null;st.paper=[];online.hidden=results.hidden=true;renderDirs();renderRefine();scroll(refine)};
   card.append(hd,body,pick);return card}))}
 // 3. refine: tabs on the left, the page / paper preview on the right
 let timer=0;const changed=()=>{clearTimeout(timer);timer=setTimeout(()=>{drawPreview();renderOnline(true)},200)};
 const pv=E('div',undefined,'ig-preview fn-preview sv-preview'),pvBody=E('div',undefined,'fn-pv-body'),pvChecks=E('div',undefined,'rp-checks ig-live-checks'),pvSel=E('div',undefined,'fn-pv-tabs');pvSel.setAttribute('role','group');pvSel.setAttribute('aria-label','Anteprima');
 const PV=[['pagina','Pagina'],['grazie','Grazie'],['carta','Su carta']];
 const endpoint=()=>{const X=SITE();return S.formAction(ctx.formEndpoint)||(root.location&&/^https?:/.test(root.location.origin||'')?S.formAction(root.location.origin+'/api/sales?site_form=1'):'')};
 function siteNow(){const s=st.m.survey,site=S.surveySite(s,brand(),{profile:ctx.profile,endpoint:endpoint(),token:st.m.form&&st.m.form.token||'',year:today().getFullYear(),date:today()}),X=SITE(),v=st.m.legal||{};
  if(!X||!Object.keys(v).length)return site;return {html:X.fillTodos(site.html,v),pages:Object.fromEntries(Object.entries(site.pages).map(([k,x])=>[k,X.fillTodos(x,v)]))}}
 function frame(html,title){const fr=E('iframe');fr.setAttribute('sandbox','');fr.setAttribute('referrerpolicy','no-referrer');fr.title=title;fr.srcdoc=html;fr.className='fn-frame';return fr}
 function drawPreview(){const s=st.m.survey;if(!s)return;pvSel.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pv===st.pv)));
  if(st.pv==='carta'){const d=S.paperDoc(s,brand()),pages=E('div',undefined,'ig-pages fn-pages sv-pages');
   d.pages.forEach((p,i)=>{const fg=E('figure',undefined,'rp-fig ig-page');fg.append(svgImg(PS().previewSvg(d,i,{guides:false}),'Pagina '+(i+1)+' di '+d.pages.length),E('figcaption','Pagina '+(i+1)+' di '+d.pages.length));pages.append(fg)});
   pvBody.replaceChildren(E('p',plural(d.pages.length,'pagina','pagine')+' A4 da stampare: caselle da segnare e righe per scrivere.','fn-pv-note'),pages)}
  else{const site=siteNow(),html=st.pv==='pagina'?site.html:site.pages['grazie.html'];pvBody.replaceChildren(E('p',st.pv==='pagina'?'La pagina come la vede chi risponde dal telefono: nessuno script, nessun cookie.':'La pagina dopo l’invio delle risposte.','fn-pv-note'),frame(html,st.pv==='pagina'?'Anteprima del questionario':'Anteprima della pagina grazie'))}
  const cs=S.checksOf(s,st.m.input).filter(c=>c.state!=='ok');pvChecks.replaceChildren(...(cs.length?cs.map(checkRow):[checkRow({id:'ok',label:'Tutto a posto',state:'ok',detail:'Domande neutre, scale con le etichette, privacy e campione.',issues:[]})]))}
 PV.forEach(([id,label])=>{const b=button(label);b.dataset.pv=id;b.onclick=()=>{st.pv=id;drawPreview()};pvSel.append(b)});
 const TABS=[['domande','Domande'],['testi','Testi e privacy'],['colori','Colori']];
 function renderRefine(){const s=st.m.survey;setStep(3);refine.hidden=false;const box=E('div',undefined,'ig-work fn-work'),edit=E('div',undefined,'ig-edit fn-edit');
  const tabs=E('div',undefined,'fn-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Cosa rifinire');const panel=E('div',undefined,'fn-panel');panel.setAttribute('role','tabpanel');
  const show=id=>{st.tab=id;tabs.querySelectorAll('button').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.tab===id));b.tabIndex=b.dataset.tab===id?0:-1});panel.replaceChildren(...({domande:questionsEditor,testi:textsEditor,colori:coloursEditor}[id])())};
  TABS.forEach(([id,label])=>{const b=button(label,'fn-tab');b.dataset.tab=id;b.setAttribute('role','tab');b.onclick=()=>show(id);
   b.onkeydown=e=>{const i=TABS.findIndex(x=>x[0]===id);if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const k=TABS[(i+(e.key==='ArrowRight'?1:TABS.length-1))%TABS.length][0];show(k);tabs.querySelector('[data-tab="'+k+'"]').focus()}};tabs.append(b)});
  const head=E('div',undefined,'fn-refine-head');head.append(E('h3',S.variantOf(s.variant).label+' · «'+clean(s.title)+'»'),E('p','Cambia, sposta o aggiungi domande: l’anteprima e i controlli si aggiornano.','ad-idea'));
  const next=button('Avanti: metti online','primary'),nb=E('div',undefined,'ps-actions');nb.append(next,E('span','Pagina, PDF e report si creano qui, senza AI e senza costi.','muted'));next.onclick=()=>{renderOnline();scroll(online)};
  edit.append(head,tabs,panel,nb);
  const ph=E('div',undefined,'ig-preview-head');ph.append(E('h4','Anteprima'),pvSel);pv.replaceChildren(ph,pvBody,pvChecks);box.append(edit,pv);refine.replaceChildren(box);show(st.tab);drawPreview()}
 function questionsEditor(){const s=st.m.survey,list=E('ol',undefined,'ig-blocks sv-questions');
  const draw=()=>{list.replaceChildren(...s.questions.map((q,i)=>{const li=E('li',undefined,'ig-block sv-q');li.dataset.type=q.type;const top=E('div',undefined,'ig-block-top');
    const ty=E('select');ty.setAttribute('aria-label','Tipo della domanda '+(i+1));S.TYPES.forEach(t=>{const o=E('option',t.label);o.value=t.id;ty.append(o)});ty.value=q.type;
    ty.onchange=()=>{const nq=S.question(ty.value,q.text,ty.value==='singola'||ty.value==='multipla'?(q.options&&q.options.length?q.options:['','']):null);nq.id=q.id;nq.required=q.required&&ty.value!=='testo'?true:nq.required;s.questions[i]=nq;draw();changed()};
    const up=button('↑','ig-move'),dn=button('↓','ig-move'),del=button('Togli','ig-hide');up.disabled=i===0;dn.disabled=i===s.questions.length-1;del.disabled=s.questions.length<=1;
    up.setAttribute('aria-label','Sposta su la domanda '+(i+1));dn.setAttribute('aria-label','Sposta giù la domanda '+(i+1));del.setAttribute('aria-label','Togli la domanda '+(i+1));
    up.onclick=()=>{S.moveQuestion(s,i,-1);draw();changed()};dn.onclick=()=>{S.moveQuestion(s,i,1);draw();changed()};del.onclick=()=>{S.removeQuestion(s,i);draw();changed()};
    top.append(E('span',String(i+1),'ig-block-n'),ty,E('span',undefined,'fn-spacer'),up,dn,del);
    const gr=E('div',undefined,'fn-sec-fields');gr.append(field('Domanda',q.text,v=>{q.text=v;changed()},{area:true,rows:2,max:S.LIMITS.question,count:120}));
    if(q.type==='singola'||q.type==='multipla')gr.append(field('Risposte (una per riga)',(q.options||[]).join('\n'),v=>{q.options=String(v).split('\n').map(x=>x.replace(/\s+$/,'')).filter((x,k,a)=>clean(x)||k<a.length-1);changed()},{area:true,rows:Math.min(7,Math.max(3,(q.options||[]).length)),max:1600,help:'Da 2 a '+S.LIMITS.options+' risposte. Aggiungi «Altro» se le scelte non coprono tutto.'}));
    if(q.type==='nps'||q.type==='scala'){const ends=E('div',undefined,'rp-fields sv-ends'),lo=q.type==='nps'?0:1,hi=q.type==='nps'?10:5;
     ends.append(field('Cosa vuol dire '+lo,q.low,v=>{q.low=v;changed()},{max:S.LIMITS.label}),field('Cosa vuol dire '+hi,q.high,v=>{q.high=v;changed()},{max:S.LIMITS.label}));gr.append(ends)}
    const rq=E('label',undefined,'ps-chip rp-chip fn-confirm sv-required'),cb=E('input');cb.type='checkbox';cb.checked=!!q.required;cb.onchange=()=>{q.required=cb.checked;changed()};rq.append(cb,dom().createTextNode(' Obbligatoria'));gr.append(rq);
    li.append(top,gr);return li}))};draw();
  const addRow=E('div',undefined,'ps-actions sv-add'),sel=E('select');sel.setAttribute('aria-label','Tipo della nuova domanda');S.TYPES.forEach(t=>{const o=E('option',t.label+' · '+t.small);o.value=t.id;sel.append(o)});sel.value='scala';
  const add=button('+ Aggiungi domanda','ap-add');add.onclick=()=>{if(s.questions.length>=S.LIMITS.questions){status.textContent='Al massimo '+S.LIMITS.questions+' domande.';return}S.addQuestion(s,sel.value);draw();changed();const t=list.querySelector('.sv-q:last-child textarea');if(t)t.focus()};
  addRow.append(sel,add);
  return [note('Una cosa per domanda, parole neutre, scale con il significato del primo e dell’ultimo valore: i controlli dell’anteprima ti avvisano.'),list,addRow]}
 function textsEditor(){const s=st.m.survey,g=E('div',undefined,'rp-fields');
  const t=field('Titolo',s.title,v=>{s.title=v;changed()},{max:S.LIMITS.title,count:60}),i=field('Introduzione',s.intro,v=>{s.intro=v;changed()},{area:true,rows:3,max:S.LIMITS.intro}),p=field('Riga sulla privacy',s.privacy,v=>{s.privacy=v;changed()},{area:true,rows:3,max:S.LIMITS.privacy,help:'Le parole «informativa privacy» diventano il link alla pagina.'});
  const th=field('Testo della pagina grazie',s.thanks,v=>{s.thanks=v;changed()},{area:true,rows:2,max:S.LIMITS.thanks}),sa=field('Campione (a chi lo mandi e quando)',s.sample,v=>{s.sample=v;changed()},{max:S.LIMITS.sample,help:'Va nel report accanto ai risultati.'}),b=field('Testo del pulsante',s.button,v=>{s.button=v;changed()},{max:40,count:30});
  [t,i,p,th,sa].forEach(x=>x.classList.add('rp-wide'));g.append(t,i,p,th,sa,b);
  const em=E('label',undefined,'ps-chip rp-chip fn-confirm'),cb=E('input');cb.type='checkbox';cb.checked=s.askEmail!==false;cb.onchange=()=>{s.askEmail=cb.checked;changed()};em.append(cb,dom().createTextNode(' Chiedi l’e-mail facoltativa per ricontattare (con la casella del consenso)'));
  return [g,em,note('Senza e-mail e consenso la risposta è anonima: nel CRM resta solo la nota con le risposte.')]}
 function coloursEditor(){const s=st.m.survey,pal=kit.palette;
  if(kit.source!=='kit')return [note('Nessun Kit identità nel progetto: la pagina usa un grigio scuro neutro. Crea il kit in «Kit identità» per avere i colori e il logo del brand.')];
  const items=S.COLOUR_ROLES.filter(r=>/^#[0-9a-f]{6}$/i.test(pal[r]||'')).map(r=>({id:r,label:{primary:'Principale',secondary:'Secondario',accent:'Accento',dark:'Scuro'}[r]+' '+pal[r]}));
  const ch=choice('sv-col-'+n,'Colore della pagina, dei PDF e del report',items,s.colour||'primary',v=>{s.colour=v;changed();renderRefine()},'sv-colours');
  ch.querySelectorAll('label').forEach(l=>{const i=E('i','','sv-swatch');i.style.background=pal[l.dataset.value];l.prepend(i)});
  const c=S.coloursOf(brand());return [ch,note(c.primary!==S.withColour(kit,s.colour||'primary').palette.primary.toUpperCase()?'Questo colore è troppo chiaro per i testi su bianco: uso un grigio scuro al suo posto.':'Testi e pulsanti restano leggibili: il contrasto è controllato.')]}
 // 4. online: checks, CRM link, legal data, publication, save
 function renderOnline(quiet){const s=st.m.survey;if(!s)return;if(!quiet&&online.hidden){online.hidden=false;setStep(4)}else if(online.hidden)return;
  const cs=S.checksOf(s,st.m.input),checks=E('div',undefined,'rp-checks');checks.append(E('h4','Controlli prima di pubblicare'),...cs.map(checkRow));
  const saveB=button('Salva nel progetto'),acts=E('div',undefined,'ps-actions rp-actions'),rs=E('p','','tool-status');rs.setAttribute('role','status');acts.append(saveB,E('span','Il questionario si salva nel progetto; le risposte restano nel CRM.','muted'));
  saveB.onclick=async()=>{if(!ctx.workspace||!ctx.projectId){rs.textContent='Apri un progetto per salvare.';return}saveB.disabled=true;
   try{st.store=await S.saveToProject(ctx.workspace,ctx.projectId,S.savedRecord(st.m,{by:ctx.by}));rs.textContent='Questionario salvato nel progetto.';renderSaved()}catch(e){rs.textContent='Salvataggio non riuscito: '+e.message}finally{saveB.disabled=false}};
  const box=E('section',undefined,'fn-online'),sites=ctx.workspace&&ctx.workspace.sites&&typeof ctx.workspace.sites.survey==='function'&&ctx.projectId?ctx.workspace.sites:null,crm=ctx.workspace&&ctx.workspace.siteForm&&ctx.projectId?ctx.workspace.siteForm:null;
  box.append(E('h4','Metti online il questionario'));const msg=E('p','','tool-status');msg.setAttribute('role','status');
  const on=st.store.online[s.slug];if(on&&on.url){const p=E('p',undefined,'fn-online-url');const a=E('a',on.url.replace(/^https:\/\//,''));a.href=on.url;a.target='_blank';a.rel='noopener noreferrer';p.append(dom().createTextNode(on.state==='READY'?'Online su ':'In pubblicazione su '),a);box.append(p)}
  if(!sites||!crm||!endpoint()){box.append(E('p','Per collegare le risposte al CRM e mettere online il questionario apri lo studio da un progetto.','muted'));online.replaceChildren(checks,acts,rs,box);return}
  const linked=!!(st.m.form&&st.m.form.token),c1=E('div',undefined,'fn-online-step');c1.append(E('strong','1 · Risposte → CRM'),E('p',linked?'Collegato al workspace «'+(st.m.form.workspace||'')+'»: ogni invio diventa una nota «Risposta sondaggio». Anonima, salvo e-mail con consenso.':st.m.form&&st.m.form.linked?'Era collegato a «'+(st.m.form.workspace||'')+'»: ricollegalo per aggiornare la pagina online.':'Scegli il workspace CRM che riceve le risposte.','muted'));
  const pick=E('select');pick.setAttribute('aria-label','Workspace CRM');pick.disabled=true;const link=button(linked?'Ricollega':'Collega al CRM');link.disabled=true;const row=E('div',undefined,'ps-actions');row.append(pick,link);c1.append(row);
  crm.workspaces().then(list=>{const ok=(list||[]).filter(w=>['owner','admin','member'].includes(w.role));if(!ok.length){msg.textContent='Non sei in nessun workspace CRM con permesso di scrittura: chiedi a un admin di aggiungerti.';return}
   pick.replaceChildren(...ok.map(w=>{const o=E('option',w.name);o.value=w.id;return o}));if(st.m.form&&st.m.form.workspaceId)pick.value=st.m.form.workspaceId;pick.disabled=link.disabled=false}).catch(e=>{msg.textContent='Workspace CRM non letti: '+e.message});
  link.onclick=async()=>{link.disabled=true;msg.textContent='Collego il questionario…';try{const r=await crm.link(pick.value,ctx.projectId);if(!r||!r.token)throw Error('risposta senza codice');st.m.form={token:r.token,workspace:pick.selectedOptions[0].textContent,workspaceId:pick.value};st.workspaceId=pick.value;renderOnline(true);drawPreview()}
   catch(e){msg.textContent='Questionario non collegato: '+e.message;link.disabled=false}};
  const X=SITE(),site=siteNow(),todos=X?X.todoMarkers([site.html,...Object.values(site.pages)].join('\n')):[],c2=E('form',undefined,'fn-online-step');
  c2.append(E('strong','2 · Dati per privacy e piè di pagina'));
  if(!todos.length)c2.append(E('p','Completi: ragione sociale, P. IVA, sede ed e-mail per la privacy.','muted'));
  else{c2.append(E('p','Non li invento: scrivili una volta, valgono per tutte le pagine del questionario.','muted'));const g=E('div',undefined,'rp-fields');
   todos.forEach(t=>{const l=E('label',undefined,'rp-field'),i=E('input');i.type='text';i.dataset.key=t.key;i.dataset.label=t.label;i.placeholder=/partita IVA/.test(t.label)?'11 cifre':'Scrivi il dato vero';l.append(E('span',cap(t.label.replace(/^\[da completare: |\]$/g,''))),i);g.append(l)});
   const ap=button('Applica','primary');ap.type='submit';c2.append(g,ap);
   c2.onsubmit=e=>{e.preventDefault();const Lg=LEGAL(),vals={...(st.m.legal||{})};let bad='';c2.querySelectorAll('input[data-key]').forEach(i=>{const r=Lg.checkValue(i.dataset.label,i.value);if(r.error){bad=bad||r.error;i.setAttribute('aria-invalid','true')}else if(r.value)vals[i.dataset.key]=r.value});
    if(bad){msg.textContent=bad;return}st.m.legal=vals;renderOnline(true);drawPreview()}}
  const c3=E('div',undefined,'fn-online-step'),pub=button(on?'Aggiorna il questionario online':'Metti online il questionario','primary');c3.append(E('strong','3 · Online'),E('p','Il questionario va su un indirizzo tutto suo: il sito del progetto non cambia. Lo condividi con un link o con il QR del PDF su carta.','muted'),pub);
  const blockedBy=()=>!linked?'Collega prima le risposte al CRM (passo 1).':todos.length?'Completa prima i dati per privacy e piè di pagina (passo 2).':S.blocking(S.checksOf(st.m.survey,st.m.input)).length?'Prima sistema i controlli in rosso.':'';
  pub.disabled=!!blockedBy();if(blockedBy())msg.textContent=blockedBy();
  pub.onclick=async()=>{if(pub.disabled)return;const warns=S.checksOf(st.m.survey,st.m.input).filter(x=>x.state==='warn');
   if(!await askConfirm({title:'Mettere online il questionario?',tag:'Pubblico',cost:'Sarà pubblicato su internet, sul nostro hosting Vercel: chiunque abbia il link potrà rispondere.',facts:warns.length?[['Da guardare',warns.map(x=>x.label).join(', ')]]:undefined,message:'Ogni risposta diventa una nota nel CRM del workspace collegato. Nessuna e-mail parte da sola.',ok:'Metti online'}))return;
   pub.disabled=true;msg.textContent='Metto online il questionario… (di solito meno di un minuto)';
   try{const sv=st.m.survey,s2=siteNow();let r=await sites.survey(ctx.projectId,sv.slug,s2.html,s2.pages);
    for(let i=0;r.state==='BUILDING'&&i<40;i++){msg.textContent='Vercel sta preparando la pagina… ('+(i+1)*3+' s)';await wait(3000);r=await sites.surveyStatus(ctx.projectId,sv.slug,r.deploymentId)}
    st.store={...st.store,online:{...st.store.online,[sv.slug]:r}};renderOnline(true);
    const m2=online.querySelector('.fn-online .tool-status');if(m2)m2.textContent=r.state==='READY'?'Il questionario è online. Rispondi una volta per prova: la nota arriva nel CRM.':r.state==='BUILDING'?'Vercel sta ancora preparando la pagina: tra qualche minuto sarà online.':'Vercel non è riuscito a metterlo online ('+r.state+'). Riprova tra qualche minuto.'}
   catch(e){msg.textContent='Questionario non messo online: '+e.message;pub.disabled=false}};
  box.append(c1,c2,c3,msg);
  const nx=button('Vai ai risultati'),nb=E('div',undefined,'ps-actions');nb.append(nx);nx.onclick=()=>{renderResults();scroll(results)};
  online.replaceChildren(checks,acts,rs,box,nb)}
 // 5. results and export
 const fetchImpl=()=>ctx.fetch||(root.fetch&&root.fetch.bind(root));
 function allResponses(){return [...(st.results&&st.results.responses||[]),...st.paper]}
 function renderResults(){const s=st.m.survey;if(!s)return;results.hidden=false;if(!st.results&&!st.paper.length)setStep(5);
  const head=E('div',undefined,'co-kit-head ig-files-head');head.append(E('h3','Risultati ed export'),E('p','Le risposte arrivano nel CRM come note: le leggo da lì, calcolo NPS e grafici qui, senza AI.','ad-idea'));
  const src=E('div',undefined,'fn-online-step sv-source'),ws=E('select');ws.setAttribute('aria-label','Workspace CRM delle risposte');ws.disabled=true;const read=button('Leggi le risposte','primary');read.disabled=true;
  const msg=E('p','','tool-status');msg.setAttribute('role','status');const row=E('div',undefined,'ps-actions');row.append(ws,read);src.append(E('strong','Risposte dal CRM'),row,msg);
  const crm=ctx.workspace&&ctx.workspace.siteForm;
  if(crm)crm.workspaces().then(list=>{const ok=(list||[]).filter(w=>['owner','admin','member','viewer'].includes(w.role));if(!ok.length){msg.textContent='Non sei in nessun workspace CRM.';return}
   ws.replaceChildren(...ok.map(w=>{const o=E('option',w.name);o.value=w.id;return o}));const want=st.workspaceId||st.m.form&&st.m.form.workspaceId;if(want)ws.value=want;ws.disabled=read.disabled=false}).catch(e=>{msg.textContent='Workspace CRM non letti: '+e.message});
  else msg.textContent='Apri lo studio da un progetto per leggere le risposte dal CRM.';
  read.onclick=async()=>{if(st.busy)return;st.busy=true;read.disabled=true;msg.textContent='Leggo le note del CRM…';
   try{st.workspaceId=ws.value;st.results=await S.readResponses(ws.value,s,fetchImpl());st.summary=null;msg.textContent=st.results.responses.length?plural(st.results.responses.length,'risposta trovata','risposte trovate')+' su '+st.results.read+' note lette'+(st.results.truncated?' (lette solo le prime 5.000 note)':'')+'.':'Nessuna risposta ancora per questo questionario ('+st.results.read+' note lette).';drawResults()}
   catch(e){msg.textContent='Risposte non lette: '+e.message}finally{st.busy=false;read.disabled=false}};
  // answers on paper: the CSV model, filled in by hand, read back here (they stay in this page, not in the CRM)
  const paper=E('div',undefined,'fn-online-step sv-paper');paper.append(E('strong','Risposte su carta (facoltativo)'));
  const tpl=button('Scarica il modello CSV');tpl.onclick=()=>PS().download('modello-risposte-'+s.slug+'.csv',new TextEncoder().encode(S.responsesCsv(s,[])),'text/csv');
  const drop=E('label',undefined,'pf-drop sv-drop'),inp=E('input');inp.type='file';inp.accept='.csv,text/csv';const dt=E('span',undefined,'pf-drop-text');dt.append(E('strong','Carica il CSV delle risposte su carta'),E('small','Il modello con una riga per questionario compilato · trascinalo qui o fai clic. Restano in questa pagina.'));drop.append(inp,dt);
  const pmsg=E('p','','tool-status');pmsg.setAttribute('role','status');
  inp.onchange=async()=>{const f=inp.files&&inp.files[0];if(!f)return;if(f.size>2*1024*1024){pmsg.textContent='File troppo grande (massimo 2 MB).';return}
   const r=S.paperResponses(await f.text(),s);if(r.error){pmsg.textContent=r.error;return}st.paper=r.responses;st.summary=null;pmsg.textContent=plural(r.responses.length,'risposta su carta aggiunta','risposte su carta aggiunte')+(r.skipped?' · '+r.skipped+' righe vuote saltate':'')+'.';drawResults()};
  const pr=E('div',undefined,'ps-actions');pr.append(tpl);paper.append(pr,drop,pmsg);
  const out=E('div',undefined,'sv-out');out.dataset.role='results';
  const files=E('div',undefined,'sv-files');
  results.replaceChildren(head,src,paper,out,files);drawResults()}
 function drawResults(){const s=st.m.survey,out=results.querySelector('.sv-out'),files=results.querySelector('.sv-files');if(!out)return;const list=allResponses(),a=S.analyse(s,list),c=S.coloursOf(brand());
  out.replaceChildren();const cw=(typeof window!=='undefined'&&window.innerWidth<640)?340:640;
  if(!list.length){out.append(note('Ancora nessuna risposta: quando arrivano, qui trovi NPS, grafici e risposte aperte. I file del questionario si scaricano già.'))}
  else{const sum=E('dl',undefined,'fn-facts sv-facts');[['Risposte',String(a.count)+(a.paper?' (di cui '+a.paper+' su carta)':'')],['Periodo',a.first?S.itDate(a.first).slice(0,10)+(a.last&&a.last.slice(0,10)!==a.first.slice(0,10)?' – '+S.itDate(a.last).slice(0,10):''):'—'],['Campione',clean(s.sample)||'non dichiarato'],['Con e-mail e consenso',String(a.withEmail)]].forEach(([k,v])=>sum.append(E('dt',k),E('dd',v)));out.append(sum);
   if(a.count<30)out.append(note('Meno di 30 risposte: leggi i numeri come indicazioni, non come misure precise.'));
   if(a.nps){const box=E('section',undefined,'sv-chart sv-nps');box.append(E('h4','NPS'),svgImg(S.npsSvg(a.nps,{width:cw}),'NPS '+S.signed(a.nps.score)+' su '+a.nps.n+' risposte','sv-svg'));out.append(box)}
   a.questions.forEach((q,i)=>{const box=E('section',undefined,'sv-chart');box.dataset.type=q.type;box.append(E('h4','D'+(i+1)+' · '+q.text),E('p',plural(q.answered,'risposta','risposte')+(q.mean!=null?' · media '+String(q.mean).replace('.',',')+' su '+q.hi:''),'muted'));
    if(q.dist)box.append(svgImg(S.distSvg(q,{colour:c.primary,width:cw}),'Distribuzione da '+q.lo+' a '+q.hi,'sv-svg'));
    else if(q.counts)box.append(svgImg(S.choiceSvg(q,{colour:c.primary,width:cw}),'Risposte a scelta','sv-svg'));
    else{const ul=E('ul',undefined,'sv-open');q.answers.slice(0,8).forEach(t=>ul.append(E('li','«'+t+'»')));if(!q.answers.length)ul.append(E('li','Nessuna risposta.'));box.append(ul);if(q.answers.length>8)box.append(E('p','… e altre '+(q.answers.length-8)+' nel CSV.','muted'))}
    out.append(box)});
   // the optional AI summary of the open answers: one call, only after RadixConfirm
   const ai=E('section',undefined,'rp-ai ig-ai fn-ai sv-ai'),aiB=button('Riassumi le risposte aperte con AI'),aiRes=E('div',undefined,'rp-ai-res');
   ai.append(E('h4','Facoltativo: sintesi delle risposte aperte'),E('p','Una chiamata AI all’analista, con conferma: usa crediti API. Senza questo clic nessuna chiamata parte. Tengo solo le citazioni scritte così nelle risposte.','rp-note'),aiB,aiRes);
   if(st.summary)aiRes.replaceChildren(summaryEl(st.summary));
   aiB.onclick=async()=>{if(st.busy)return;st.busy=true;aiB.disabled=true;
    try{const r=await S.summarizeWithAi({survey:s,analysis:a,rt:ctx.rt,confirm:askConfirm,project:ctx.project,onStart:()=>aiRes.replaceChildren(E('p','L’analista sta leggendo le risposte aperte…','rp-note'))});
     if(r.cancelled){aiRes.replaceChildren();return}st.summary=r;aiRes.replaceChildren(summaryEl(r))}
    catch(e){aiRes.replaceChildren(E('p','Sintesi non fatta: '+e.message,'rp-note'))}finally{st.busy=false;aiB.disabled=false}};
   out.append(ai)}
  drawFiles(files,a)}
 function summaryEl(r){const box=E('div',undefined,'sv-summary');r.themes.forEach(t=>{const d=E('div',undefined,'sv-theme');d.append(E('strong',t.title));if(t.text)d.append(E('p',t.text));const ul=E('ul');t.quotes.forEach(q=>ul.append(E('li','«'+q+'»')));d.append(ul);box.append(d)});
  box.append(E('p',r.dropped.length?(r.dropped.length===1?'Scartata 1 parte: ':'Scartate '+r.dropped.length+' parti: ')+r.dropped.join('; ')+'.':'Ogni citazione è stata trovata nelle risposte.','rp-note'));return box}
 function drawFiles(box,a){const s=st.m.survey,b=brand(),list=allResponses(),rs=E('p','','tool-status');rs.setAttribute('role','status');
  const hd=E('h4','File');const acts=E('div',undefined,'ps-actions sv-file-actions');
  const dl=(label,fn,cls)=>{const x=button(label,cls||'');x.onclick=()=>{try{fn();rs.textContent='Scaricato.'}catch(e){rs.textContent='File non creato: '+e.message}};return x};
  acts.append(dl('Scarica tutto (.zip)',()=>{const site=siteNow(),fs=S.files(s,a,b,{date:today(),site,summary:st.summary,responses:list,online:st.store.online[s.slug]});PS().download('sondaggio-'+s.slug+'.zip',S.bundle(fs,{date:today()}),'application/zip')},'primary'),
   dl('Report (PDF)',()=>PS().download('report-'+s.slug+'.pdf',S.reportPdf(s,a,b,{summary:st.summary,date:today()}),'application/pdf')),
   dl('Questionario su carta (PDF)',()=>PS().download('questionario-'+s.slug+'.pdf',S.paperPdf(s,b,{date:today()}),'application/pdf')),
   dl('Risposte (CSV)',()=>PS().download('risposte-'+s.slug+'.csv',new TextEncoder().encode(S.responsesCsv(s,list)),'text/csv')));
  box.replaceChildren(hd,acts,rs,note('Il report usa solo le risposte lette qui: NPS e percentuali sono calcolati da RADIX, mai stimati.'))}
 function renderSaved(){const items=st.store.items;if(!items.length){saved.hidden=true;return}saved.replaceChildren(E('h4','Sondaggi salvati nel progetto'));const row=E('div',undefined,'ad-saved-row');
  items.slice(-4).reverse().forEach(r=>{const b=button(r.title+' · '+S.variantOf(r.variant).label+(st.store.online[r.slug]?' · online':'')+' · '+String(r.at||'').slice(0,10),'ad-saved-item');
   b.onclick=()=>{st.m=copy(r.model);if(st.m.form&&!st.m.form.token)st.m.form={...st.m.form,token:''};st.props=S.proposals(st.m.input,opts());st.results=null;st.paper=[];st.summary=null;st.workspaceId=st.m.form&&st.m.form.workspaceId||'';
    renderForm();renderDirs();renderRefine();online.hidden=false;renderOnline(true);renderResults();status.textContent='Riaperto il sondaggio salvato il '+String(r.at||'').slice(0,10)+'.'};row.append(b)});
  saved.append(row);saved.hidden=false}
 async function loadSaved(){if(!ctx.workspace||!ctx.projectId)return;try{st.store=S.readStore(await ctx.workspace.bind(ctx.projectId,'agents').load());renderSaved()}catch(e){}}
 renderForm();loadSaved();
 return wrap}

return Object.freeze({surveyStudio});
});
