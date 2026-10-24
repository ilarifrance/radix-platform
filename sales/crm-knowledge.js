'use strict';
/* Assistenza: «Knowledge base» (short help articles) and «Risposte rapide» (snippets with {{nome}}, {{azienda}},
   {{ticket}}) on top of sales.js and crm-ticket-reply.js. No AI: suggestions are a fixed keyword rule
   (crm-knowledge-core.js). Storage: this browser only, one localStorage entry per CRM workspace
   (radix-crm-knowledge:<workspace id>), every access in try/catch; Esporta/Importa JSON moves the data
   between browsers and people. A server copy needs a new table, which needs Francesco's OK. */
(function(){
const K=()=>window.RadixCrmKnowledgeCore,app=()=>window.RadixSalesApp;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const CHANGE='radix-crm-knowledge-change';
const memory=new Map();let storageOk=true;
// Open reply blocks repaint when the data changes; blocks removed by a re-render are dropped.
const live=new Set();document.addEventListener(CHANGE,()=>{for(const b of live){if(b.wrap.isConnected)b.paint();else live.delete(b)}});
const ws=()=>(app()&&app().state.workspace)||'';
function read(){
 const key=K().storageKey(ws());
 try{const raw=localStorage.getItem(key);storageOk=true;if(raw)return K().normalize(JSON.parse(raw))}catch{storageOk=false}
 return K().normalize(memory.get(key));
}
function write(data){
 const key=K().storageKey(ws()),clean=K().normalize(data);memory.set(key,clean);
 try{localStorage.setItem(key,JSON.stringify(clean));storageOk=true}catch{storageOk=false}
 document.dispatchEvent(new CustomEvent(CHANGE));return clean;
}
function download(name,text){const a=E('a');a.href=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.download=name;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
const say=m=>{try{app().notice(m)}catch{}};

// ---------- Section panel: manage articles and quick replies ----------
function editor(kind,item,done){
 const f=E('form',undefined,'crm-kb-form');f.noValidate=true;
 const field=(label,node)=>{const l=E('label',label);l.append(node);f.append(l);return node};
 const title=field('Titolo',E('input'));title.maxLength=K().LIMITS.title;title.value=item?item.title:'';title.required=true;
 const tags=kind==='article'?field('Tag (separati da virgola)',E('input')):null;if(tags)tags.value=item?item.tags.join(', '):'';
 const text=field(kind==='article'?'Testo':'Testo · puoi usare {{nome}}, {{azienda}}, {{ticket}}',E('textarea'));text.rows=5;text.maxLength=K().LIMITS.text;text.value=item?item.text:'';
 const err=E('p','','crm-kb-warn');err.hidden=true;f.append(err);
 const acts=E('div',undefined,'actions');acts.append(B('Salva',()=>f.requestSubmit(),'primary'),B('Annulla',()=>done(false)));f.append(acts);
 f.addEventListener('submit',e=>{e.preventDefault();
  const r=K().check(kind,{id:item&&item.id,title:title.value,text:text.value,tags:tags?tags.value:undefined});
  if(r.error){err.textContent='Controlla: '+r.error+'.';err.hidden=false;return}
  const d=read(),key=kind==='article'?'articles':'snippets',i=d[key].findIndex(x=>x.id===r.item.id);
  if(i<0&&d[key].length>=K().LIMITS[key]){err.textContent='Limite raggiunto ('+K().LIMITS[key]+').';err.hidden=false;return}
  if(i>=0)d[key][i]=r.item;else d[key].push(r.item);write(d);say((kind==='article'?'Articolo':'Risposta rapida')+' salvato.');done(true)});
 return f;
}
function list(kind,host){
 const key=kind==='article'?'articles':'snippets',d=read(),items=d[key];host.replaceChildren();
 const head=E('div',undefined,'crm-kb-head');head.append(E('h3',(kind==='article'?'Articoli':'Risposte rapide')+' · '+items.length));
 const slot=E('div');
 head.append(B(kind==='article'?'Nuovo articolo':'Nuova risposta rapida',()=>{slot.replaceChildren(editor(kind,null,()=>list(kind,host)));slot.querySelector('input').focus()}));
 host.append(head,slot);
 if(!items.length)host.append(E('p',kind==='article'?'Nessun articolo. Scrivi le risposte che dai più spesso.':'Nessuna risposta rapida.','crm-kb-muted'));
 const ul=E('ul',undefined,'crm-kb-list');
 items.slice().sort((a,b)=>a.title.localeCompare(b.title,'it')).forEach(x=>{
  const li=E('li',undefined,'crm-kb-item');li.append(E('strong',x.title));
  if(x.tags&&x.tags.length){const t=E('p',undefined,'crm-kb-tags');x.tags.forEach(g=>t.append(E('span',g,'crm-kb-tag')));li.append(t)}
  li.append(E('p',x.text.length>220?x.text.slice(0,220)+'…':x.text,'crm-kb-text'));
  const a=E('div',undefined,'actions');
  a.append(B('Modifica',()=>{li.replaceChildren(editor(kind,x,()=>list(kind,host)))}),B('Elimina',()=>{
   if(!window.confirm('Eliminare «'+x.title+'» da questo browser?'))return;const n=read();n[key]=n[key].filter(y=>y.id!==x.id);write(n);list(kind,host);say('Eliminato.')},'danger'));
  li.append(a);ul.append(li)});
 host.append(ul);
}
function panel(){
 const box=E('details',undefined,'crm-kb');box.append(E('summary','Knowledge base e risposte rapide'));
 const note=E('p','','crm-kb-muted');box.append(note);
 const io=E('div',undefined,'actions');box.append(io);
 const arts=E('div',undefined,'crm-kb-block'),snips=E('div',undefined,'crm-kb-block');box.append(arts,snips);
 const file=E('input');file.type='file';file.accept='application/json,.json';file.hidden=true;box.append(file);
 const status=E('p','','crm-kb-muted');status.setAttribute('role','status');box.append(status);
 const paint=()=>{const d=read();
  note.textContent=storageOk?'Salvati solo in questo browser, per questo workspace. Per condividerli usa Esporta e Importa.':'Memoria del browser non disponibile: i dati restano solo finché la pagina è aperta. Esportali prima di chiudere.';
  io.replaceChildren(B('Esporta JSON',()=>{const n=read();download('knowledge-base-'+new Date().toISOString().slice(0,10)+'.json',K().exportJson(n,ws()));status.textContent='Esportati '+n.articles.length+' articoli e '+n.snippets.length+' risposte rapide.'}),B('Importa JSON',()=>file.click()));
  if(!d.articles.length&&!d.snippets.length)io.append(B('Aggiungi esempi',()=>{write(K().merge(read(),K().EXAMPLES).data);paint();status.textContent='Aggiunti 3 articoli e 2 risposte rapide di esempio: modificali o eliminali.'}));
  list('article',arts);list('snippet',snips)};
 file.addEventListener('change',async()=>{const f=file.files&&file.files[0];file.value='';if(!f)return;
  let text='';try{text=await f.text()}catch{status.textContent='File non leggibile.';return}
  const r=K().importJson(text);if(r.error){status.textContent=r.error;return}
  if(!window.confirm('Importare '+r.data.articles.length+' articoli e '+r.data.snippets.length+' risposte rapide? Quelli con lo stesso id vengono sostituiti.'))return;
  const m=K().merge(read(),r.data);write(m.data);paint();
  status.textContent='Importati: '+m.added+' nuovi, '+m.replaced+' sostituiti'+(m.dropped?', '+m.dropped+' oltre il limite':'')+(r.skipped.length?'. Scartati '+r.skipped.length+': '+r.skipped.slice(0,3).join('; '):'')+'.'});
 box.addEventListener('toggle',()=>{if(box.open)paint()},{once:false});
 paint();return box;
}

// ---------- Ticket reply block: suggestions, search, quick replies ----------
function attach(box,area,ticket,loadContact){
 const label=area.closest('label');if(!label||!K())return false;
 const wrap=E('div',undefined,'crm-kb-assist');
 const msg=E('p','','crm-kb-muted');msg.setAttribute('role','status');
 let values=null;
 const merge=async()=>{if(values)return values;let contact=null;try{contact=await loadContact()}catch{}
  const a=app(),cid=ticket.company_id||(contact&&contact.company_id),company=cid?(a.rows('companies')||[]).find(c=>c.id===cid):null;
  values=K().mergeValues(ticket,contact,company);return values};
 const put=async(text,what)=>{
  const f=K().fill(text,await merge());const r=K().insert(area.value,f.text,area.selectionStart,area.selectionEnd,area.maxLength>0?area.maxLength:4000);
  if(r.full){msg.textContent='La risposta ha già 4000 caratteri: accorciala prima di inserire altro.';return}
  area.value=r.value;area.dispatchEvent(new Event('input',{bubbles:true}));area.focus();try{area.setSelectionRange(r.cursor,r.cursor)}catch{}
  msg.textContent='Inserito nella risposta: '+what+'.'+(f.missing.length?' Dati mancanti, uso il valore generico: '+f.missing.map(k=>'{{'+k+'}} → «'+K().FALLBACK[k]+'»').join(', ')+'.':'')+(f.unknown.length?' Tag non riconosciuti lasciati così: '+f.unknown.join(' ')+'.':'')+(r.truncated?' Testo tagliato a 4000 caratteri.':'');
 };
 const row=(res)=>{const li=E('li',undefined,'crm-kb-hit');li.append(E('strong',res.article.title));
  li.append(E('p',res.article.text.length>160?res.article.text.slice(0,160)+'…':res.article.text,'crm-kb-text'));
  if(res.words.length)li.append(E('p','Parole in comune: '+res.words.join(', '),'crm-kb-why'));
  li.append(B('Inserisci nella risposta',()=>put(res.article.text,'articolo «'+res.article.title+'»'),'crm-kb-insert'));return li};
 // Suggestions
 const sug=E('section',undefined,'crm-kb-sub');const sugHead=E('h4','Articoli suggeriti ');sugHead.append(E('span','regola fissa, non AI','crm-kb-badge'));
 const sugList=E('ul',undefined,'crm-kb-list');sug.append(sugHead,sugList);
 // Search
 const find=E('section',undefined,'crm-kb-sub');const fl=E('label','Cerca nella knowledge base');const q=E('input');q.type='search';q.placeholder='es. password, fattura';q.maxLength=120;fl.append(q);
 const found=E('ul',undefined,'crm-kb-list');find.append(fl,found);
 // Quick replies
 const quick=E('section',undefined,'crm-kb-sub');const ql=E('label','Risposte rapide');const sel=E('select');ql.append(sel);
 const qa=E('div',undefined,'actions');quick.append(ql,qa);
 const paint=()=>{const d=read();
  sugList.replaceChildren();const s=K().suggest(d.articles,ticket);
  if(s.length)s.forEach(r=>sugList.append(row(r)));else sugList.append(E('li',d.articles.length?'Nessun articolo con parole in comune con questo ticket.':'Knowledge base vuota: aggiungi articoli nel riquadro «Knowledge base e risposte rapide».','crm-kb-muted'));
  found.replaceChildren();if(q.value.trim()){const r=K().search(d.articles,q.value,5);if(r.length)r.forEach(x=>found.append(row(x)));else found.append(E('li','Nessun risultato.','crm-kb-muted'))}
  const keep=sel.value;sel.replaceChildren();const o0=E('option',d.snippets.length?'Scegli una risposta rapida':'Nessuna risposta rapida');o0.value='';sel.append(o0);
  d.snippets.forEach(x=>{const o=E('option',x.title);o.value=x.id;sel.append(o)});sel.value=d.snippets.some(x=>x.id===keep)?keep:'';sel.disabled=!d.snippets.length;
  qa.replaceChildren(B('Inserisci risposta rapida',()=>{const x=read().snippets.find(y=>y.id===sel.value);if(!x){msg.textContent='Scegli prima una risposta rapida.';return}put(x.text,'risposta rapida «'+x.title+'»')}))};
 let t=0;q.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(paint,150)});
 q.addEventListener('keydown',e=>{if(e.key==='Enter')e.preventDefault()});
 live.add({wrap,paint});
 wrap.append(sug,find,quick,msg);box.insertBefore(wrap,label);
 paint();return true;
}
window.RadixCrmKnowledge={panel,attach,read,write};
})();
