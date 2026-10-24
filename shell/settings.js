'use strict';
/* Impostazioni (impostazioni.html): one page for profilo, workspace e membri, caselle email, collegamenti, CRM, crediti.
   Sections and rules: shell/settings-core.js. The CRM panels are the CRM's own modules, mounted here as they are:
   «Caselle email» (sales/crm-mailboxes.js) with «Indirizzi disiscritti» (sales/crm-suppressions.js), «Visibilità dei record» (sales/crm-visibility.js), «Scadenze SLA» (sales/crm-sla.js),
   «Campi aggiunti» (sales/crm-custom-fields.js). They talk to the CRM through window.RadixSalesApp; on this page that is the
   small host below (same /api/sales calls as sales/sales.js, no CRM records loaded). Members and automation rules need the
   whole CRM (records, pipeline), so they stay in radix-sales.html and this page links to them. */
(function(root){
const C=root.RadixSettingsCore;if(!C)return;
const $=id=>document.getElementById(id);
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
const A=(text,href,cls)=>{const a=E('a',text,cls);a.href=href;return a};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const card=(title,sub,cls)=>{const c=E('section',undefined,'st-card'+(cls?' '+cls:''));if(title)c.append(E('h2',title));if(sub)c.append(E('p',sub,'st-sub'));return c};
const S={section:'profilo',me:undefined,workspace:null,workspaces:[],busy:false,loaded:false,gen:0};

/* ---- CRM host: what the mounted CRM modules call (subset of sales/sales.js window.RadixSalesApp) ---- */
const state={get workspace(){return S.workspace},get workspaces(){return S.workspaces},get busy(){return S.busy},get me(){return S.me&&S.me.id||null},ready:true,rows:{}};
const role=()=>(S.workspaces.find(w=>w.id===S.workspace)||{}).role;
async function api(entity,options={}){
 const q=new URLSearchParams({entity,offset:String(options.offset||0)});
 if(options.subject)q.set('subject',options.subject);
 if(S.workspace&&entity!=='workspaces')q.set('workspace',S.workspace);
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),20000);
 try{
  const r=await fetch('/api/sales'+(options.body?'':'?'+q),{method:options.body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:ctl.signal,...(options.body?{headers:{'Content-Type':'application/json','x-radix-sales':'1'},body:JSON.stringify(options.body)}:{})});
  let d;try{d=await r.json()}catch{d={}}
  if(!r.ok){const e=new Error(r.status===401?'Sessione scaduta: accedi di nuovo a RADIX.':typeof d.error==='string'?d.error:d.error?.message||'Richiesta rifiutata ('+r.status+').');e.status=r.status;throw e}
  if(!options.body&&!Array.isArray(d.rows))throw new Error('Risposta del server non valida.');
  return d;
 }catch(e){if(e.name==='AbortError')throw new Error('Tempo di attesa scaduto: ricarica la sezione per verificare.');throw e}
 finally{clearTimeout(timer)}
}
function notice(m){const n=$('st-status');if(n){n.textContent=m||'';n.className='st-status'}}
function error(m){const n=$('st-error');if(n){n.textContent=m||'';n.hidden=!m}}
function lock(v){S.busy=v;const main=$('main');if(!main)return;main.setAttribute('aria-busy',String(v));
 main.querySelectorAll('button,input,select,textarea').forEach(n=>{if(v){n.dataset.preDisabled=String(n.disabled);n.disabled=true}else if(n.dataset.preDisabled!==undefined){n.disabled=n.dataset.preDisabled==='true';delete n.dataset.preDisabled}})}
if(!root.RadixSalesApp)root.RadixSalesApp={state,api,role,rows:e=>state.rows[e]||[],writable:e=>e!=='members'&&['member','admin','owner'].includes(role()),notice,error,lock,title:r=>r.name||r.title||r.id,refresh:async()=>{},mutate:async()=>{}};

/* ---- page ---- */
async function me(){
 if(S.me!==undefined)return S.me;
 try{const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});S.me=r.ok?((await r.json()).user||null):null}catch{S.me=null}
 return S.me;
}
async function workspaces(){
 if(S.loaded)return S.workspaces;
 try{const d=await api('workspaces');S.workspaces=d.rows||[];S.loaded=true}catch(e){S.workspaces=[];S.wsError=e.message}
 if(!S.workspaces.some(w=>w.id===S.workspace))S.workspace=S.workspaces[0]?.id||null;
 drawWorkspace();return S.workspaces;
}
function drawWorkspace(){
 const sel=$('st-workspace'),wrap=$('st-ws');if(!sel||!wrap)return;
 sel.replaceChildren();for(const w of S.workspaces){const o=E('option',w.name+' · '+(C.ROLE_NAMES[w.role]||w.role));o.value=w.id;sel.append(o)}
 sel.value=S.workspace||'';wrap.hidden=!S.workspaces.length||!C.SECTIONS.find(s=>s.id===S.section)?.crm;
}
function drawNav(){
 const nav=$('st-nav');if(!nav)return;nav.replaceChildren();
 for(const s of C.SECTIONS){const a=A('','#'+s.id,'st-nav-link');a.append(E('strong',s.label),E('small',s.hint));if(s.id===S.section)a.setAttribute('aria-current','page');nav.append(a)}
 // On phones the list is one scrolling row: bring the open section into view.
 const cur=nav.querySelector('[aria-current]');if(cur&&nav.scrollWidth>nav.clientWidth)nav.scrollLeft=cur.offsetLeft-nav.offsetLeft-12;
}
// CRM sections without a workspace: one plain sentence instead of empty panels.
function needWorkspace(out){
 if(S.workspace)return false;
 const c=card('Nessun workspace CRM',S.wsError?'Workspace non leggibili: '+S.wsError:'Il tuo account non è ancora in un workspace CRM: chiedi a un owner o admin di aggiungerti. Da quel momento qui trovi membri, caselle e regole del workspace.');
 out.append(c);return true;
}
const R={
 async profilo(out){
  const u=await me();
  const who=card('Profilo');
  if(!u){who.append(E('p','Non hai una sessione RADIX attiva.','st-sub'),A('Accedi a RADIX','/','st-btn st-primary'));out.append(who);return}
  const id=E('div',undefined,'st-who');id.append(E('span',C.initials(u.name,u.email),'st-avatar'));const t=E('div');t.append(E('strong',u.name||'Senza nome'),E('span',u.email||'','st-sub'));id.append(t);
  who.append(id,E('p','Nome ed email dell’account li cambia l’amministrazione di RADIX.','st-note'));out.append(who);
  const pw=card('Cambia password','Almeno '+C.PASSWORD_MIN+' caratteri. Dopo il cambio resti collegato su questo dispositivo.');
  const form=E('form',undefined,'st-form');form.noValidate=true;
  const field=(label,name,auto)=>{const l=E('label',undefined,'st-field'),i=E('input');i.type='password';i.name=name;i.autocomplete=auto;i.maxLength=C.PASSWORD_MAX;i.required=true;l.append(E('span',label),i);return [l,i]};
  const [lc,cur]=field('Password attuale','current','current-password'),[ln,nw]=field('Nuova password','password','new-password'),[lr,rp]=field('Ripeti la nuova password','confirm','new-password');
  nw.minLength=C.PASSWORD_MIN;rp.minLength=C.PASSWORD_MIN;
  // A hidden username lets password managers save the new password for the right account.
  const user=E('input');user.type='text';user.name='username';user.autocomplete='username';user.value=u.email||'';user.hidden=true;user.tabIndex=-1;user.setAttribute('aria-hidden','true');
  const msg=E('p','','st-msg');msg.setAttribute('role','status');
  const go=E('button','Salva la nuova password','st-btn st-primary');go.type='submit';
  form.append(user,lc,ln,lr,go,msg);pw.append(form);out.append(pw);
  form.addEventListener('submit',async ev=>{ev.preventDefault();if(S.busy)return;
   const data={current:cur.value,password:nw.value,confirm:rp.value},p=C.passwordProblem(data);
   msg.className='st-msg is-err';if(p){msg.textContent=p;return}
   msg.className='st-msg';msg.textContent='Salvo la password…';lock(true);
   try{const r=await fetch('/api/auth/password',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','x-radix-settings':'1'},body:JSON.stringify(data)});
    const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Password non aggiornata ('+r.status+').');
    form.reset();user.value=u.email||'';msg.className='st-msg is-ok';msg.textContent='Password aggiornata. Usala dal prossimo accesso.'}
   catch(e){msg.className='st-msg is-err';msg.textContent=e.message}
   finally{lock(false)}});
  const lang=card('Lingua','La lingua dell’interfaccia di RADIX.');
  const l=E('label',undefined,'st-field'),sel=E('select');sel.name='lingua';
  for(const x of C.LANGUAGES){const o=E('option',x.label+(x.active?'':' — '+x.note));o.value=x.id;o.disabled=!x.active;sel.append(o)}
  sel.value='it';l.append(E('span','Lingua'),sel);lang.append(l,E('p','English è in arrivo: per ora RADIX è solo in italiano.','st-note'));out.append(lang);
 },
 async membri(out){
  await workspaces();if(needWorkspace(out))return;
  const ws=S.workspaces.find(w=>w.id===S.workspace),mine=role(),manage=C.canManage(mine);
  const head=card(ws.name,'Il tuo ruolo: '+(C.ROLE_NAMES[mine]||mine)+'. '+(manage?'Puoi aggiungere membri, cambiare i ruoli e decidere cosa vedono.':'Solo owner e admin cambiano membri e visibilità.'));
  const list=E('ul',undefined,'st-members');list.append(E('li','Caricamento dei membri…','st-sub'));head.append(list);
  const acts=E('div',undefined,'st-actions');acts.append(A(manage?'Aggiungi membri e cambia ruoli nel CRM':'Apri i membri nel CRM','/radix-sales.html#members','st-btn'+(manage?' st-primary':'')));head.append(acts);
  out.append(head);
  const V=root.RadixCrmVisibility;
  if(V&&V.panel&&manage){const vis=card('Visibilità dei record',undefined,'st-mount');const p=V.panel();p.open=true;vis.append(p);out.append(vis)}
  else if(V&&V.load){const vis=card('Visibilità dei record');const n=E('p','Lettura dell’impostazione…','st-sub');vis.append(n);out.append(vis);
   V.load().then(r=>{n.textContent=!r||!r.loaded?'Impostazione non leggibile.':r.settings.ownOnly?'Attiva: member e viewer vedono solo i propri record e quelli collegati. La decide un owner o un admin.':'Non attiva: tutti i membri vedono tutti i record del workspace. La decide un owner o un admin.'})}
  try{const d=await api('members');list.replaceChildren();
   for(const m of d.rows){const li=E('li');li.append(E('strong',(m.name||m.email||'Membro')+(S.me&&m.id===S.me.id?' · tu':'')),E('span',m.email&&m.name?m.email:'','st-sub'),E('span',C.ROLE_NAMES[m.role]||m.role||'','st-badge'));list.append(li)}
   if(!d.rows.length)list.append(E('li','Nessun membro visibile.','st-sub'))}
  catch(e){list.replaceChildren(E('li','Membri non leggibili: '+e.message,'st-err'))}
 },
 async caselle(out){
  await workspaces();if(needWorkspace(out))return;
  const M=root.RadixCrmMailboxes;const c=card('Caselle email','Le caselle da cui partono le campagne messe in coda dal CRM (Contatti › Campagna email › Metti in coda). Solo owner e admin le aggiungono o le cambiano.');
  if(!M){c.append(E('p','Modulo delle caselle non caricato: ricarica la pagina.','st-err'));out.append(c);return}
  c.classList.add('st-mount');const p=M.panel();c.append(p);out.append(c);p.open=true;
  // «Indirizzi disiscritti» (sales/crm-suppressions.js, migration sales 017): owner and admin only.
  const D=root.RadixCrmSuppressions;
  if(D&&D.panel&&C.canManage(role())){const d=card('Indirizzi disiscritti',undefined,'st-mount');const dp=D.panel();d.append(dp);out.append(d);dp.open=true}
  else if(D)out.append(card('Indirizzi disiscritti','Chi si disiscrive resta escluso da tutte le campagne, anche se il contatto viene eliminato o reimportato. La lista la vedono e la cambiano owner e admin.'));
  // «Trova email»: which paid services run after the free sources, in which order (sales/crm-prospecting.js).
  const T=root.RadixCrmEmailFinder;
  if(T&&T.settingsPanel){const f=card('Trova email','Come il CRM cerca l’email aziendale dei contatti che ne sono senza (Contatti › seleziona › Trova email): prima gratis sul sito dell’azienda, poi i servizi a pagamento collegati, in quest’ordine.','st-mount');const fp=T.settingsPanel();f.append(fp);out.append(f);fp.open=true}
 },
 async collegamenti(out){
  const c=card('Servizi collegati','Quali servizi esterni RADIX può usare su questo sito. Le chiavi si impostano dall’amministratore (variabili d’ambiente di Vercel): non si inseriscono nell’app e non vengono mai mostrate qui.');
  const list=E('ul',undefined,'st-conn');list.append(E('li','Controllo i collegamenti…','st-sub'));c.append(list);out.append(c);
  const ext=card('Estensione Chrome «Importa in RADIX»','Importa contatti da LinkedIn e da altre pagine direttamente in Lead Intelligence. Il collegamento si fa con un codice valido 14 giorni, creato per il workspace scelto.');
  const a=E('div',undefined,'st-actions');a.append(A('Collega l’estensione in Lead Intelligence','/lead-intelligence.html#radix-extension-link','st-btn st-primary'));ext.append(a);out.append(ext);
  const W=root.RadixWorkspace;let map=null;try{map=W&&W.integrations?await W.integrations():null}catch{map=null}
  list.replaceChildren();
  if(!map)list.append(E('li','Stato non disponibile: serve una sessione RADIX attiva. Riprova tra poco.','st-err'));
  for(const s of C.connections(map)){const li=E('li');li.dataset.state=String(s.state);const t=E('div');t.append(E('strong',s.label),E('span',s.does,'st-sub'));li.append(t,E('span',s.text,'st-badge'));list.append(li)}
 },
 async crm(out){
  await workspaces();if(needWorkspace(out))return;
  const manage=C.canManage(role());
  const auto=card('Automazioni','Le regole che propongono attività e bozze email (trattative ferme, ticket urgenti, preventivi accettati…). Si configurano nel CRM, nel pannello Automazioni della vista Attività, perché mostrano subito cosa farebbero sui dati del workspace.');
  const aa=E('div',undefined,'st-actions');aa.append(A('Apri Attività › Automazioni','/radix-sales.html#tasks','st-btn st-primary'));auto.append(aa);
  if(!manage)auto.append(E('p','Le regole le cambiano owner e admin; tu puoi applicarne le proposte.','st-note'));out.append(auto);
  const Sla=root.RadixCrmSla;
  if(Sla&&Sla.settingsPanel){const c=card('Scadenze SLA dell’assistenza','Quanto tempo ha il team per la prima risposta e per la risoluzione dei ticket, per priorità.','st-mount');const p=Sla.settingsPanel();p.open=true;c.append(p);out.append(c)}
  const cf=card('Campi aggiunti','I campi creati con «Aggiungi campo» su una scheda di Aziende o Contatti valgono per tutto il workspace. Si creano dalla scheda di un record, dove scrivi anche il primo valore.');
  const list=E('div',undefined,'st-fields');list.append(E('p','Caricamento dei campi…','st-sub'));cf.append(list);
  const fa=E('div',undefined,'st-actions');fa.append(A('Apri Aziende','/radix-sales.html#companies','st-btn'),A('Apri Contatti','/radix-sales.html#contacts','st-btn'));cf.append(fa);out.append(cf);
  const pipe=card('Pipeline, fasi e Dipartimento','Processi e fasi della pipeline (con le attività automatiche all’ingresso in una fase) si gestiscono nel CRM. «Dipartimento» è un campo di testo libero su aziende e contatti: propone i valori già usati, quindi non c’è un elenco da mantenere.');
  const pa=E('div',undefined,'st-actions');pa.append(A('Processi','/radix-sales.html#processes','st-btn'),A('Fasi','/radix-sales.html#stages','st-btn'));pipe.append(pa);out.append(pipe);
  const X=root.RadixCrmCustom;if(!X||!X.load){list.replaceChildren(E('p','Modulo dei campi non caricato.','st-err'));return}
  const defs=await X.load(true);list.replaceChildren();
  for(const [entity,label] of [['companies','Aziende'],['contacts','Contatti']]){const f=X.of(defs,entity),box=E('div',undefined,'st-field-group');box.append(E('strong',label));
   if(!f.length)box.append(E('span','Nessun campo aggiunto.','st-sub'));else{const ul=E('ul');for(const x of f)ul.append(E('li',x.label));box.append(ul)}list.append(box)}
 },
 async crediti(out){
  const c=card('Crediti e fatturazione','In arrivo: qui vedrai i crediti AI usati dal team, il piano attivo e le fatture di RADIX.','st-soon');
  c.append(E('span','In arrivo','st-badge'));out.append(c);
 }
};
async function show(){
 const id=C.sectionFromHash(location.hash),gen=++S.gen;S.section=id;
 drawNav();drawWorkspace();error('');notice('');
 const out=$('st-section');if(!out)return;out.replaceChildren();
 const s=C.SECTIONS.find(x=>x.id===id);const h=E('header',undefined,'st-section-head');h.append(E('h2',s.label),E('p',s.hint,'st-sub'));out.append(h);
 const body=E('div',undefined,'st-cards');out.append(body);
 try{await R[id](body)}catch(e){if(gen===S.gen)error(e.message||String(e))}
}
function start(){
 const sel=$('st-workspace');if(sel)sel.addEventListener('change',()=>{if(S.busy){sel.value=S.workspace;return}S.workspace=sel.value||null;show()});
 root.addEventListener('hashchange',show);
 me();show();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})(typeof globalThis!=='undefined'?globalThis:this);
