/* Regia RADIX, the panel. It takes the place of the «?» of the Guide (lib/radix-guide.js): the button reads «Regia» and
   opens a side panel (full screen on a phone) with the page's shortcuts from its adapter, the free answers of the Guide
   map, a chat whose every message is 1 AI call, the proposal card («Sì, applica» / «No») and «Annulla» after an apply.
   N3: the AI is the role radix-director of /api/chat (apiSend), called only when the person presses Invia, Enter or a
   shortcut; the first AI message of a browser session asks for confirmation (RadixConfirm, lib/radix-confirm.js). One
   image can go with a message (sent once, never stored). An applied proposal is proposed as a decision in the team
   memory (/api/agency-memory); «Annulla» does not remove it and a failed write blocks nothing.
   Injectable for the tests: send(messages, ctx) (stubSend is the fake AI), confirm(opts), remember(entry).
   The logic is in lib/radix-regia-core.js. UMD: the browser global RadixRegia (register, adapterFor, start, create). */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else{root.RadixRegia=api;if(root.document&&root.RadixRegiaCore)api.start()}})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const core=()=>root.RadixRegiaCore||(typeof require==='function'?require('./radix-regia-core.js'):null);
const NOTE='Ogni messaggio usa 1 chiamata AI';
const ROLE='radix-director';
const CONFIRM_TEXT='La Regia usa 1 chiamata AI per ogni messaggio. Continuare?';
const CONFIRM_KEY='rx-regia-ai-ok';
const IMAGE_TYPES=Object.freeze(['image/png','image/jpeg','image/webp']);
const MAX_IMAGE=5*1024*1024;
// Vercel refuses request bodies over ~4.5 MB, so a picture bigger than SEND_IMAGE is redrawn as a JPEG at most
// SHRINK_SIDE px wide or tall before it leaves; the person may pick one up to PICK_IMAGE.
const SEND_IMAGE=Math.floor(2.5*1024*1024),PICK_IMAGE=20*1024*1024,SHRINK_SIDE=1600;
const PROJECT_ID=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
// What the person reads when the AI does not answer (after «Non riesco a rispondere ora: »).
const ERR=Object.freeze({
 noKey:'l’AI della Regia non è attiva: la chiave sul server manca o non è valida. Chi gestisce RADIX deve configurarla',
 credit:'il credito dell’AI è esaurito: chi gestisce RADIX deve ricaricarlo',
 busy:'troppe richieste in questo momento. Riprova tra un minuto',
 network:'connessione assente o server non raggiungibile. Controlla la rete e riprova',
 session:'la sessione è scaduta. Ricarica la pagina e rifai il login',
 tooBig:'il messaggio o l’immagine sono troppo grandi. Riprova con un’immagine più piccola',
 image:'non riesco a leggere l’immagine. Riprova ad allegarla',
 empty:'risposta vuota'});
function errorText(status,msg){const m=String(msg||'').trim();
 if(/ANTHROPIC_API_KEY|non configurata|chiave API/i.test(m))return ERR.noKey;
 if(/credito API esaurito|credit balance/i.test(m))return ERR.credit;
 if(status===429||status===529||/sovraccaric|rate.?limit|overloaded/i.test(m))return ERR.busy;
 if(status===401)return ERR.session;
 if(status===413)return ERR.tooBig;
 if(status===400&&m)return m.replace(/\.$/,'');
 return 'il server ha risposto con un errore ('+status+'). Riprova tra poco'}
// The real send: 1 call to /api/chat with the role of the Regia. body: the digest of the conversation, the page's
// context block, the team-memory scope and the optional image (a data URL).
function apiSend(win){return async function(messages,ctx){const c=ctx||{},f=win&&win.fetch;if(typeof f!=='function')throw new Error(ERR.network);
 const body={role:ROLE,messages,context:String(c.contextBlock||'')};if(c.memoryScope)body.memoryScope=c.memoryScope;if(c.image&&c.image.dataUrl)body.image=c.image.dataUrl;
 let r;try{r=await f.call(win,'/api/chat',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}catch(e){throw new Error(ERR.network)}
 let data={};try{data=await r.json()||{}}catch(e){data={}}
 if(!r.ok)throw new Error(errorText(r.status,data.error));
 const reply=typeof data.reply==='string'?data.reply:'';if(!reply.trim())throw new Error(ERR.empty);return {reply}}}
// The fake AI of the tests (and of N1): a fixed reply. On a page whose adapter has sample(state) it is that proposal, so the whole flow
// (card, «Sì, applica», «Annulla») can be tried without any AI call; elsewhere a plain note.
function stubSend(messages,ctx){const a=ctx&&ctx.adapter,p=a&&typeof a.sample==='function'?a.sample(ctx.state):null;
 return Promise.resolve(p?'Risposta di prova, senza AI: ecco cosa farei.\n```json\n'+JSON.stringify(p)+'\n```':'Risposta di prova, senza AI: in questa fase la Regia non chiama ancora l’AI. Le domande frequenti qui sopra rispondono subito.')}

// One Regia on a document. opts: {doc, win, send, registry, guide, pageId, path, hash}. Returns the controller the tests drive.
function create(opts){
 const o=opts||{},C=core(),doc=o.doc||root.document,win=o.win||root,guide=o.guide!==undefined?o.guide:root.RadixGuide||null,registry=o.registry||C.registry;
 const send=typeof o.send==='function'?o.send:apiSend(win);
 const pageId=o.pageId!=null?o.pageId:(doc.body.dataset&&doc.body.dataset.shellPage)||'';
 const loc=win.location||{},entryNow=()=>guide?guide.forPage(pageId,o.path!=null?o.path:loc.pathname,o.hash!=null?o.hash:loc.hash):null;
 const adapter=registry.adapterFor(pageId);
 const el=(t,c,x)=>{const n=doc.createElement(t);if(c)n.className=c;if(x!=null)n.textContent=x;return n};
 const btn=(c,x,label)=>{const b=el('button',c,x);b.type='button';if(label)b.setAttribute('aria-label',label);return b};
 let entry=entryNow(),state=null,busy=false,image=null,opened=false,confirmed=false;const history=[],undos=[],memoryWrites=[];

 // ---- skeleton ----
 const fab=btn('rx-guide-fab rx-regia-fab','Regia','Apri la Regia');fab.id='rxGuide';fab.title='Regia: come si usa questa pagina e cosa fare adesso';fab.setAttribute('aria-expanded','false');
 const panel=el('section','rx-regia');panel.hidden=true;panel.id='rxRegia';panel.setAttribute('aria-label','Regia RADIX');fab.setAttribute('aria-controls','rxRegia');
 const head=el('header','rx-regia-head'),titles=el('div','rx-regia-titles'),pageName=el('small','rx-regia-page',entry?entry.title:(adapter&&adapter.title)||'');
 titles.append(el('strong',null,'Regia'),pageName);const close=btn('rx-regia-x','✕','Chiudi la Regia');head.append(titles,close);
 const shortcuts=el('div','rx-regia-shortcuts');shortcuts.setAttribute('aria-label','Scorciatoie di questa pagina');
 const areaView=el('div','rx-regia-view');areaView.hidden=true;
 const log=el('div','rx-regia-log');log.setAttribute('aria-live','polite');
 const undoBar=el('div','rx-regia-undo');undoBar.hidden=true;const undoText=el('span',null,''),undoBtn=btn('rx-regia-undo-btn','Annulla','Annulla l’ultima modifica applicata');undoBar.append(undoText,undoBtn);
 const form=el('form','rx-regia-ask'),attach=el('div','rx-regia-attach');attach.hidden=true;
 const row=el('div','rx-regia-row'),file=el('input');file.type='file';file.accept='image/*';file.hidden=true;file.className='rx-regia-file';
 const clip=btn('rx-regia-clip','＋','Allega un’immagine');clip.title='Allega un’immagine (una sola)';
 const input=el('textarea','rx-regia-input');input.rows=1;input.maxLength=2000;input.placeholder='Scrivi alla Regia…';input.setAttribute('aria-label','Messaggio per la Regia');
 const go=el('button','rx-regia-send','Invia');go.type='submit';row.append(clip,input,go,file);
 const note=el('p','rx-regia-note',NOTE);form.append(attach,row,note);
 panel.append(head,shortcuts,areaView,log,undoBar,form);doc.body.append(fab,panel);
 const bar=guide&&guide.dockBar?guide.dockBar(doc):null;
 if(bar){const at=bar.querySelector('.rx-user,.user-pill,.rx-logout');if(at)at.parentNode.insertBefore(fab,at);else bar.append(fab);fab.classList.add('rx-guide-fab--top');panel.classList.add('rx-regia--top')}
 // Sales pages with the side menu (sales/sales-nav.js): the button sits in the sticky menu, under the logo (a strip on the phone),
 // so it never covers the page (e.g. «Rivedi i lead →» or the last amount of a quote).
 else{const side=doc.querySelector('aside.sx-side');if(side){const brand=side.querySelector('.sx-brand');if(brand)brand.after(fab);else side.prepend(fab);fab.classList.add('rx-regia-fab--side')}}

 // ---- state of the page ----
 function readState(){if(!adapter)return {};try{return adapter.read?adapter.read(doc,state)||{}:state||{}}catch(e){return state||{}}}
 function renderView(){let v=null;try{v=adapter&&adapter.view?adapter.view(state):null}catch(e){v=null}
  areaView.replaceChildren();areaView.hidden=!v||!v.items||!v.items.length;if(areaView.hidden)return;
  const ul=el('ul');v.items.forEach(i=>ul.append(el('li',null,i)));areaView.append(el('strong',null,v.title||'Da guardare'),ul)}

 // ---- log ----
 function bubble(who,parts){const b=el('div','rx-regia-msg '+who);for(const p of parts){if(p.link){const a=el('a','rx-regia-link','→ '+p.link.title);a.href=p.link.href;b.append(a)}else b.append(doc.createTextNode(p.text))}log.append(b);log.scrollTop=log.scrollHeight;return b}
 const links=ids=>guide?(ids||[]).map(id=>guide.GUIDE.find(g=>g.id===id)).filter(Boolean).map(link=>({link})):[];
 function faqAnswer(q,a,ids){bubble('me',[{text:q}]);const b=bubble('bot',[{text:a}].concat(links(ids)));b.classList.add('free');return b}
 function intro(){log.replaceChildren();shortcuts.replaceChildren();
  (adapter?adapter.shortcuts:[]).forEach(s=>{const c=btn('rx-regia-chip ai',s.label);c.title=NOTE;c.onclick=()=>ask(s.prompt,{label:s.label});shortcuts.append(c)});
  shortcuts.hidden=!shortcuts.children.length;
  if(!entry)return;const b=bubble('bot',[{text:entry.title+' · '+entry.what}]);
  const faqs=entry.faq.length?entry.faq:(guide.GUIDE.find(g=>g.id==='cc')||{faq:[]}).faq;if(!faqs.length)return;
  const box=el('div','rx-regia-faq');box.append(el('span','rx-regia-faq-label','Domande frequenti · risposta subito, senza AI'));
  faqs.forEach(([q,a,ids])=>{const c=btn('rx-regia-chip free',q);c.onclick=()=>faqAnswer(q,a,ids);box.append(c)});b.after?b.after(box):log.append(box)}

 // ---- proposal card ----
 function card(proposal){const result=C.validateProposal(proposal,adapter,state),cost=C.costOf(result.accepted,adapter);
  const c=el('article','rx-regia-card');c.setAttribute('aria-label','Proposta della Regia');
  c.append(el('span','rx-regia-card-kind','Proposta'),el('h4',null,result.summary||'Modifiche proposte'));
  if(result.accepted.length){const ul=el('ul','rx-regia-ops');result.accepted.forEach(op=>ul.append(el('li',null,C.previewOf(op,adapter,state))));c.append(ul)}
  if(result.rejected.length){const box=el('div','rx-regia-rejected'),ul=el('ul');box.append(el('strong',null,'Non applicabili ('+result.rejected.length+')'));
   result.rejected.forEach(r=>{const li=el('li');li.append(el('span',null,C.rejectedPreview(r.op,adapter,state)),el('em',null,r.reason));ul.append(li)});box.append(ul);c.append(box)}
  if(result.error)c.append(el('p','rx-regia-error',result.error));
  c.append(el('p','rx-regia-cost','Costo per applicare: '+cost.label));
  const actions=el('div','rx-regia-actions'),yes=btn('rx-regia-yes','Sì, applica'),no=btn('rx-regia-no','No'),status=el('p','rx-regia-status','');status.setAttribute('role','status');
  yes.disabled=!result.ok;actions.append(yes,no);c.append(actions,status);
  const done=(text,kind)=>{yes.disabled=true;no.disabled=true;status.textContent=text;c.dataset.state=kind};
  yes.onclick=async()=>{if(yes.disabled)return;yes.disabled=true;no.disabled=true;
   try{const r=await C.applyProposal(adapter,state,result.accepted);state=r.state;undos.push({undo:r.undo,card:c,status,n:result.accepted.length});
    done('Applicato: '+result.accepted.length+(result.accepted.length===1?' modifica.':' modifiche.'),'applied');renderView();showUndo();log.scrollTop=log.scrollHeight;
    remember(result).then(ok=>{if(ok&&c.dataset.state==='applied')status.textContent+=' Decisione proposta in Memoria: confermala lì perché gli agenti la usino.'})}
   catch(e){no.disabled=false;yes.disabled=!result.ok;status.textContent='Non applicata: '+(e&&e.message||e)}};
  no.onclick=()=>{if(no.disabled)return;done('Proposta scartata: non ho cambiato niente.','declined')};
  log.append(c);log.scrollTop=log.scrollHeight;return {card:c,result,cost,yes,no,status}}
 function showUndo(){undoBar.hidden=!undos.length;if(!undos.length)return;const n=undos.reduce((s,u)=>s+u.n,0);undoText.textContent=(undos.length===1?'Modifica applicata':undos.length+' proposte applicate')+' ('+n+')'}
 async function undo(){const last=undos.pop();if(!last)return false;undoBtn.disabled=true;
  try{state=await last.undo();last.status.textContent='Annullato: la pagina è tornata com’era.';last.card.dataset.state='undone';renderView();return true}
  catch(e){undos.push(last);bubble('bot',[{text:'Non riesco ad annullare: '+(e&&e.message||e)+'.'}]);return false}finally{undoBtn.disabled=false;showUndo()}}
 undoBtn.onclick=()=>undo();

 // ---- image: one, sent with the next message only, never stored ----
 function setImage(f){if(!f){image=null;attach.replaceChildren();attach.hidden=true;return true}
  if(!IMAGE_TYPES.includes(String(f.type||''))){bubble('bot',[{text:'Posso allegare solo un’immagine PNG, JPG o WebP.'}]);return false}
  if(!(f.size>0)||f.size>PICK_IMAGE){bubble('bot',[{text:'L’immagine è troppo grande: al massimo 20 MB.'}]);return false}
  image={name:String(f.name||'immagine'),type:f.type,size:f.size,file:f};attach.replaceChildren();
  const img=el('img');img.alt='Anteprima: '+image.name;const U=win.URL;if(U&&U.createObjectURL)img.src=U.createObjectURL(f);
  else if(win.FileReader){const r=new win.FileReader();r.onload=()=>{img.src=r.result};r.readAsDataURL(f)}
  const rm=btn('rx-regia-attach-x','✕','Togli l’immagine');rm.onclick=()=>setImage(null);
  attach.append(img,el('span',null,image.name+' · va con il prossimo messaggio, non viene salvata'),rm);attach.hidden=false;return true}
 // The image as a data URL, read only when the message leaves.
 // A big picture is redrawn smaller (canvas → JPEG); without a canvas it cannot leave and the person is told.
 async function shrunk(img){const C=win.createImageBitmap,doc2=win.document;if(typeof C!=='function'||!doc2)throw new Error('L’immagine è troppo grande da inviare: allegane una sotto i 2,5 MB.');
  const bmp=await C(img.file),k=Math.min(1,SHRINK_SIDE/Math.max(bmp.width,bmp.height)),cv=doc2.createElement('canvas');cv.width=Math.max(1,Math.round(bmp.width*k));cv.height=Math.max(1,Math.round(bmp.height*k));
  const g=cv.getContext&&cv.getContext('2d');if(!g)throw new Error(ERR.image);g.drawImage(bmp,0,0,cv.width,cv.height);if(bmp.close)bmp.close();
  const d=cv.toDataURL('image/jpeg',0.85);if(!/^data:image\/jpeg;base64,/.test(d)||d.length>Math.ceil(SEND_IMAGE*4/3)+64)throw new Error('L’immagine è troppo grande da inviare: allegane una sotto i 2,5 MB.');return d}
 function imageData(img){if(img.size>SEND_IMAGE)return shrunk(img);return new Promise((resolve,reject)=>{const R=win.FileReader;if(typeof R!=='function')return reject(new Error(ERR.image));
  const r=new R();r.onload=()=>{const d=String(r.result||'');const m=/^data:([^;,]+);base64,/.exec(d);
   if(!m||!IMAGE_TYPES.includes(m[1])||d.length>Math.ceil(MAX_IMAGE*4/3)+64)return reject(new Error(ERR.image));resolve(d)};
  r.onerror=()=>reject(new Error(ERR.image));try{r.readAsDataURL(img.file)}catch(e){reject(new Error(ERR.image))}})}

 // ---- project, memory scope, team memory ----
 function projectId(){let fromAdapter=null;try{fromAdapter=adapter&&typeof adapter.projectId==='function'?adapter.projectId(state):null}catch(e){fromAdapter=null}
  let fromUrl=null;try{fromUrl=loc.search&&typeof URLSearchParams==='function'?new URLSearchParams(loc.search).get('project'):null}catch(e){fromUrl=null}
  const ds=doc.body.dataset||{};return [o.projectId,fromAdapter,ds.rxProject,ds.projectId,fromUrl].map(v=>v==null?'':String(v).trim()).find(v=>PROJECT_ID.test(v))||''}
 function clientId(){const v=String(o.clientId!=null?o.clientId:(doc.body.dataset&&doc.body.dataset.rxClient)||'').trim();return PROJECT_ID.test(v)?v:''}
 // The confirmed memory the AI reads: this project's when the page has one, else the agency-wide entries.
 function memoryScope(){const p=projectId();return p?{projectId:p,clientId:clientId(),agentId:ROLE}:{level:'agency',agentId:ROLE}}
 // After «Sì, applica»: one proposed decision. Never blocks, never throws; resolves true when written.
 function remember(result){const p=Promise.resolve().then(()=>{const entry=C.memoryEntry(result,adapter,state,{projectId:projectId(),clientId:clientId(),agentId:ROLE});
   if(typeof o.remember==='function')return o.remember(entry);const f=win.fetch;if(typeof f!=='function')throw new Error('memoria non raggiungibile');
   return f.call(win,'/api/agency-memory',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(entry)}).then(r=>{if(!r||!r.ok)throw new Error('memoria: '+(r&&r.status))})})
   .then(()=>true,()=>false);memoryWrites.push(p);return p}

 // ---- confirmation: the first AI message of the browser session ----
 function sessionStore(){try{return win.sessionStorage||null}catch(e){return null}}
 async function confirmFirst(){if(confirmed)return true;
  try{const st=sessionStore();if(st&&st.getItem(CONFIRM_KEY)==='1'){confirmed=true;return true}}catch(e){}
  const rc=root.RadixConfirm||win.RadixConfirm,askYes=typeof o.confirm==='function'?o.confirm:rc&&typeof rc.ask==='function'?rc.ask:t=>typeof win.confirm==='function'?!!win.confirm(t.title):false;
  let ok=false;try{ok=!!(await askYes({title:CONFIRM_TEXT,cost:'1 chiamata AI per ogni messaggio',message:'Le domande frequenti restano gratuite. La Regia lavora solo quando scrivi o premi una scorciatoia.',ok:'Continua',cancel:'Annulla'}))}catch(e){ok=false}
  if(ok){confirmed=true;try{const st=sessionStore();if(st)st.setItem(CONFIRM_KEY,'1')}catch(e){}}return ok}
 clip.onclick=()=>file.click&&file.click();file.onchange=()=>{setImage(file.files&&file.files[0]);file.value=''};

 // ---- ask ----
 // A free answer from the Guide map when the question clearly matches one; else 1 call through send().
 async function ask(text,how){const q=String(text||'').trim(),h=how||{};if(!q||busy)return {kind:'none'};
  bubble('me',[{text:h.label||q}].concat(image?[{text:'\n＋ '+image.name}]:[]));
  if(!h.label&&guide){const quick=guide.match(q);if(quick){const b=bubble('bot',[{text:quick.a}].concat(links(quick.links)));b.classList.add('free');return {kind:'faq',answer:quick.a}}}
  busy=true;go.disabled=true;let sent=false,wait=null;
  try{if(!(await confirmFirst())){bubble('bot',[{text:'Messaggio non inviato: nessuna chiamata AI.'}]);if(!h.label&&!input.value)input.value=q;return {kind:'cancelled'}}
   state=readState();wait=bubble('bot',[{text:'Ci penso…'}]);wait.classList.add('wait');
   const contextBlock=adapter?C.contextBlock(adapter,state):'[Pagina: '+(entry?entry.title:pageId)+']';
   const img=image?{name:image.name,type:image.type,size:image.size,dataUrl:await imageData(image)}:null;
   history.push({role:'user',content:q});sent=true;
   const r=await send(C.conversationDigest(history),{area:adapter&&adapter.area,adapter,state,contextBlock,memoryScope:memoryScope(),image:img});const reply=typeof r==='string'?r:r&&r.reply!=null?String(r.reply):'';
   if(!reply)throw new Error(ERR.empty);history.push({role:'assistant',content:reply});wait.remove();
   const proposal=C.parseProposal(reply),prose=proposal?C.proseOf(reply):reply;
   if(prose)bubble('bot',guide?guide.linkify(prose).map(p=>p.link?{link:Object.assign({},p.link,{href:p.link.href})}:p):[{text:prose}]);
   if(proposal)return Object.assign({kind:'proposal'},card(proposal));return {kind:'text',text:prose}}
  catch(e){if(sent)history.pop();if(wait)wait.remove();bubble('bot',[{text:'Non riesco a rispondere ora: '+String(e&&e.message||e).replace(/\.$/,'')+'.'}]);return {kind:'error',error:e}}
  finally{busy=false;go.disabled=false;if(sent&&image)setImage(null)}}
 form.onsubmit=e=>{if(e&&e.preventDefault)e.preventDefault();const q=input.value;input.value='';return ask(q)};
 input.addEventListener&&input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.onsubmit()}});

 // ---- open / close ----
 function open(){panel.hidden=false;fab.setAttribute('aria-expanded','true');doc.documentElement&&doc.documentElement.classList&&doc.documentElement.classList.add('rx-regia-open');
  if(!opened){state=readState();intro();renderView();opened=true}if(input.focus)input.focus()}
 function hide(){panel.hidden=true;fab.setAttribute('aria-expanded','false');doc.documentElement&&doc.documentElement.classList&&doc.documentElement.classList.remove('rx-regia-open')}
 fab.onclick=()=>panel.hidden?open():hide();close.onclick=()=>{hide();if(fab.focus)fab.focus()};
 doc.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden)close.onclick()});
 if(win.addEventListener)win.addEventListener('hashchange',()=>{const e=entryNow();if(e!==entry){entry=e;pageName.textContent=e?e.title:'';if(!panel.hidden)intro()}});
 return {fab,panel,log,form,input,shortcuts,undoBar,attach,adapter,open,close:hide,ask,undo,setImage,memoryScope,get state(){return state},get history(){return history.slice()},get memoryWrites(){return memoryWrites.slice()}}}

// The browser start: one Regia per page, docked where the Guide's «?» was.
function start(opts){const doc=root.document;if(!doc||doc.getElementById('rxRegia'))return null;const old=doc.getElementById('rxGuide');if(old)old.remove();return create(opts)}
const C0=core();
return Object.freeze({NOTE,ROLE,CONFIRM_TEXT,CONFIRM_KEY,MAX_IMAGE,SEND_IMAGE,PICK_IMAGE,IMAGE_TYPES,ERR,errorText,stubSend,apiSend,create,start,register:(a,x)=>C0.register(a,x),adapterFor:id=>C0.adapterFor(id)});
});
