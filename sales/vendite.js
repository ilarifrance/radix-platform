'use strict';
/* sales-vendite.html: Preventivi, Fatture, Prodotti, Listini and the issuer data (Intestazione), as in the
   Salesforce Products / Price Books / Quotes. Data through /api/sales (api/_sales_documents.js, migration
   sales/013); totals and allowed status moves from sales/vendite-core.js, the same rules as the database. */
(function(){
const V=window.RadixVenditeCore;
const $=id=>document.getElementById(id);
function h(tag,attrs,...kids){
 const e=document.createElement(tag);
 for(const [k,v] of Object.entries(attrs||{})){
  if(v===null||v===undefined||v===false)continue;
  if(k==='class')e.className=v;else if(k==='text')e.textContent=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(k==='value')e.value=v;else e.setAttribute(k,v===true?'':v);
 }
 for(const k of kids.flat())if(k!==null&&k!==undefined&&k!==false)e.append(k.nodeType?k:document.createTextNode(String(k)));
 return e;
}
const TABS=[['quotes','Preventivi'],['invoices','Fatture'],['products','Prodotti'],['pricebooks','Listini'],['settings','Intestazione']];
const KIND={quotes:'quote',invoices:'invoice'};
const S={workspace:'',workspaces:[],tab:'quotes',docId:null,products:[],books:[],entries:[],settings:null,docs:{quote:[],invoice:[]},companies:[],contacts:[],opportunities:[],
 current:null,form:null,filter:{status:'',search:''},book:'',product:null,keys:new Map(),loaded:false,missing:'',opp:new URLSearchParams(location.search).get('opp')};

async function request(url,options){
 const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});const d=await r.json().catch(()=>({}));
 if(!r.ok){const e=new Error(r.status===401?'Accedi con il tuo account RADIX.':d.error||'Errore ('+r.status+').');e.status=r.status;throw e}
 return d;
}
const get=(entity,extra)=>request('/api/sales?'+new URLSearchParams({entity,workspace:S.workspace,...(extra||{})})).then(d=>d.rows||[]);
async function getAll(entity){const out=[];for(let o=0;o<1000;o+=100){const rows=await get(entity,{offset:String(o)});out.push(...rows);if(rows.length<100)break}return out}
const post=(entity,action,data)=>request('/api/sales',{method:'POST',headers:{'Content-Type':'application/json','x-radix-sales':'1'},body:JSON.stringify({workspace:S.workspace,entity,action,data})}).then(d=>d.rows?.[0]);
const role=()=>S.workspaces.find(w=>w.id===S.workspace)?.role||'viewer';
const canWrite=()=>role()!=='viewer';
const canAdmin=()=>['owner','admin'].includes(role());

function say(text,kind){const el=$('vd-status');el.textContent=text||'';el.className='vd-status'+(kind?' is-'+kind:'');}
let busy=false;
async function run(label,fn){
 if(busy)return;busy=true;say(label+'…');
 try{const r=await fn();say(r||'',r?'ok':'');return true}
 catch(e){say(e.message||'Operazione non riuscita.','err');return false}
 finally{busy=false}
}

// The workspace last chosen in the CRM (radix.workspace, see sales.js), so every Sales page opens the same one.
const wsMemo={get(){try{return localStorage.getItem('radix.workspace')||''}catch{return ''}},set(v){try{if(v)localStorage.setItem('radix.workspace',v)}catch{}}};
async function loadWorkspaces(){
 const rows=await request('/api/sales?entity=workspaces').then(d=>d.rows||[]);
 S.workspaces=rows;const sel=$('vd-workspace');sel.textContent='';
 for(const w of rows)sel.append(h('option',{value:w.id,text:w.name+(w.role==='viewer'?' · sola lettura':'')}));
 if(!rows.length){say('Nessun workspace CRM: chiedi a un owner di aggiungerti.','err');return false}
 const kept=wsMemo.get();S.workspace=(rows.find(w=>w.id===kept)||rows[0]).id;sel.value=S.workspace;wsMemo.set(S.workspace);return true;
}
async function loadAll(){
 S.loaded=false;S.missing='';render();
 try{
  const [products,books,entries,settings,quotes,invoices]=await Promise.all([get('products'),get('price_books'),get('price_book_entries'),get('document_settings'),get('documents',{kind:'quote'}),get('documents',{kind:'invoice'})]);
  Object.assign(S,{products,books,entries,settings:settings[0]||null,docs:{quote:quotes,invoice:invoices}});
 }catch(e){if(e.status===503){S.missing=e.message}else{say(e.message,'err')}}
 try{const [companies,contacts,opportunities]=await Promise.all([getAll('companies'),getAll('contacts'),getAll('opportunities')]);Object.assign(S,{companies,contacts,opportunities})}catch(e){say('Clienti del CRM non caricati: '+e.message,'err')}
 S.loaded=true;
 if(S.opp&&!S.missing){const o=S.opportunities.find(x=>x.id===S.opp);S.opp=null;history.replaceState(null,'',location.pathname+'#quotes/new');if(o)S.pendingOpp=o}
 route();
}
async function reloadDocs(){const [q,i]=await Promise.all([get('documents',{kind:'quote'}),get('documents',{kind:'invoice'})]);S.docs={quote:q,invoice:i}}
async function openDoc(id){const rows=await get('document',{id});if(!rows.length)throw new Error('Documento non trovato: forse è stato eliminato.');S.current=rows[0];S.form=V.formOf(rows[0]);}

function route(){
 const [tab,id]=(location.hash.slice(1)||'quotes').split('/');
 const next=TABS.some(t=>t[0]===tab)?tab:'quotes';if(next!==S.tab)say('');S.tab=next;S.docId=KIND[S.tab]&&id?id:null;
 if(!S.docId){S.current=null;S.form=null;render();return}
 if(S.docId==='new'){
  if(!S.form||S.current||S.form.kind!==KIND[S.tab]){S.current=null;S.form=V.newDocument(KIND[S.tab],{settings:S.settings,books:S.books,opportunity:S.pendingOpp});S.pendingOpp=null}
  render();return;
 }
 if(S.current?.id===S.docId){render();return}
 S.current=null;S.form=null;render();
 openDoc(S.docId).then(render,e=>{say(e.message,'err');location.hash=S.tab});
}

/* ---------- Rendering ---------- */
function render(){
 const tabs=$('vd-tabs');tabs.textContent='';
 for(const [k,t] of TABS){
  const n=KIND[k]?S.docs[KIND[k]].length:k==='products'?S.products.length:k==='pricebooks'?S.books.length:null;
  tabs.append(h('a',{href:'#'+k,class:'vd-tab','aria-current':S.tab===k?'page':null},t,n?h('b',{text:String(n)}):null));
 }
 // Shared Sales menu: one entry per tab (Prodotti e listini also for Listini and Intestazione).
 const navTab=KIND[S.tab]?S.tab:'products';
 for(const a of document.querySelectorAll('a.sx-link[href^="/sales-vendite.html"]')){if(a.hash==='#'+navTab)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')}
 const main=$('vd-main');main.textContent='';
 if(!S.loaded){main.append(h('div',{class:'vd-empty',text:'Caricamento…'}));return}
 if(S.missing){main.append(h('div',{class:'vd-empty is-warn'},h('strong',{text:'Funzione non ancora attiva in questo archivio'}),h('p',{text:S.missing})));return}
 if(KIND[S.tab])main.append(S.docId?editor():docList(KIND[S.tab]));
 else if(S.tab==='products')main.append(productsView());
 else if(S.tab==='pricebooks')main.append(booksView());
 else main.append(settingsView());
 if(!canWrite())main.prepend(h('p',{class:'vd-note',text:'Il tuo ruolo in questo workspace è di sola lettura.'}));
}

const customerName=d=>d.customer?.company?.name||d.customer?.contact?.name||'—';
const dateText=v=>v?new Date(v+'T00:00:00').toLocaleDateString('it-IT'):'—';
const badge=d=>h('span',{class:'vd-badge is-'+d.status+(V.overdue(d)?' is-late':''),text:V.label(d)+(V.overdue(d)?' · scaduta':'')});

function docList(kind){
 const rows=S.docs[kind],counts=V.counts(rows,kind),list=V.filter(rows,S.filter);
 const wrap=h('section',{class:'vd-panel'});
 const chips=h('div',{class:'vd-chips',role:'group','aria-label':'Filtra per stato'},
  h('button',{type:'button',class:'vd-chip','aria-pressed':String(!S.filter.status),onclick:()=>{S.filter.status='';render()}},'Tutti ',h('b',{text:String(rows.length)})),
  (kind==='invoice'?V.INVOICE:V.QUOTE).map(([k,t])=>h('button',{type:'button',class:'vd-chip','aria-pressed':String(S.filter.status===k),onclick:()=>{S.filter.status=S.filter.status===k?'':k;render()}},t+' ',h('b',{text:String(counts[k])}))));
 const open=V.openValue(rows,kind);
 wrap.append(h('div',{class:'vd-head'},
  h('div',{},h('h2',{text:kind==='invoice'?'Fatture':'Preventivi'}),h('p',{class:'vd-sub',text:(kind==='invoice'?'Da incassare: ':'In attesa di risposta: ')+V.euro(open)})),
  canWrite()?h('a',{class:'vd-btn is-primary',href:'#'+(kind==='invoice'?'invoices':'quotes')+'/new'},kind==='invoice'?'＋ Nuova fattura':'＋ Nuovo preventivo'):null));
 const search=h('input',{type:'search',class:'vd-search',placeholder:'Cerca per numero, titolo o cliente','aria-label':'Cerca',value:S.filter.search,oninput:e=>{S.filter.search=e.target.value;const pos=e.target.selectionStart;render();const s=document.querySelector('.vd-search');s.focus();s.setSelectionRange(pos,pos)}});
 wrap.append(h('div',{class:'vd-toolbar'},chips,search));
 if(!rows.length){wrap.append(h('div',{class:'vd-empty'},h('strong',{text:kind==='invoice'?'Nessuna fattura ancora':'Nessun preventivo ancora'}),h('p',{text:kind==='invoice'?'Crea una fattura da zero oppure da un preventivo accettato («Crea fattura»).':'Crea il primo preventivo: scegli il cliente, aggiungi prodotti dal catalogo e stampalo o salvalo in PDF.'})));return wrap}
 const table=h('table',{class:'vd-table'},h('thead',{},h('tr',{},['Numero','Titolo e cliente','Data',kind==='invoice'?'Scadenza':'Valido fino al','Stato','Totale'].map((t,i)=>h('th',{scope:'col',class:i===5?'num':null,text:t})))));
 const body=h('tbody');
 for(const d of list){
  const href='#'+(kind==='invoice'?'invoices':'quotes')+'/'+d.id;
  body.append(h('tr',{onclick:e=>{if(e.target.tagName!=='A')location.hash=href}},
   h('td',{'data-label':'Numero'},h('a',{href,text:d.number||'Bozza'})),
   h('td',{'data-label':'Cliente'},h('strong',{text:d.title||'Senza titolo'}),h('small',{text:customerName(d)})),
   h('td',{'data-label':'Data',text:dateText(d.issue_date)}),
   h('td',{'data-label':kind==='invoice'?'Scadenza':'Validità',text:dateText(kind==='invoice'?d.due_date:d.valid_until)}),
   h('td',{'data-label':'Stato'},badge(d)),
   h('td',{class:'num','data-label':'Totale',text:V.euro(d.total_cents)})));
 }
 if(!list.length)body.append(h('tr',{},h('td',{colspan:'6',class:'vd-none',text:'Nessun documento con questi filtri.'})));
 table.append(body);wrap.append(h('div',{class:'vd-scroll'},table));
 return wrap;
}

function options(rows,value,empty,labelOf){
 return [h('option',{value:'',text:empty}),...rows.map(r=>h('option',{value:r.id,text:labelOf?labelOf(r):r.name||r.title,selected:r.id===value}))];
}
function field(labelText,control,cls){return h('label',{class:'vd-field'+(cls?' '+cls:'')},h('span',{text:labelText}),control)}

function editor(){
 const f=S.form,doc=S.current,kind=KIND[S.tab],edit=V.editable(doc)&&canWrite();
 const wrap=h('section',{class:'vd-panel vd-editor'});
 if(!f){wrap.append(h('div',{class:'vd-empty',text:'Apertura del documento…'}));return wrap}
 const lock=el=>{if(!edit)el.disabled=true;return el};
 const set=k=>e=>{f[k]=e.target.value;if(k==='company_id'){f.contact_id=S.contacts.some(c=>c.id===f.contact_id&&c.company_id===f.company_id)?f.contact_id:'';f.opportunity_id=S.opportunities.some(o=>o.id===f.opportunity_id&&o.company_id===f.company_id)?f.opportunity_id:''}if(['company_id','price_book_id'].includes(k))render()};
 const contacts=S.contacts.filter(c=>!f.company_id||c.company_id===f.company_id);
 const opps=S.opportunities.filter(o=>!f.company_id||o.company_id===f.company_id);
 const back='#'+S.tab;
 const head=h('div',{class:'vd-head'},
  h('div',{},h('a',{class:'vd-back',href:back,text:'← '+(kind==='invoice'?'Fatture':'Preventivi')}),h('h2',{text:doc?V.docName(doc):kind==='invoice'?'Nuova fattura':'Nuovo preventivo'}),doc?badge(doc):h('span',{class:'vd-badge is-bozza',text:'Nuovo'})),
  h('div',{class:'vd-actions'},actions(doc,f)));
 wrap.append(head);
 if(kind==='invoice')wrap.append(h('p',{class:'vd-note',text:'Fattura commerciale per il cliente: non sostituisce la fattura elettronica da trasmettere allo SdI.'}));
 if(doc&&!V.editable(doc))wrap.append(h('p',{class:'vd-note',text:kind==='quote'?(doc.status==='accettato'?'Preventivo accettato: non si modifica più. Da qui crei la fattura; per cambiare le condizioni fai un nuovo preventivo.':'Il preventivo non è più una bozza: per cambiarlo riportalo in bozza.'):'La fattura è emessa: non si modifica più. Se è sbagliata, annullala e creane una nuova.'}));
 const grid=h('div',{class:'vd-grid'},
  field('Titolo',lock(h('input',{value:f.title,maxlength:'200',placeholder:'Es. Sito web e campagna di lancio',oninput:set('title')})),'wide'),
  field('Azienda',lock(h('select',{onchange:set('company_id')},options(S.companies,f.company_id,'— Nessuna —')))),
  field('Contatto',lock(h('select',{onchange:set('contact_id')},options(contacts,f.contact_id,'— Nessuno —')))),
  field('Trattativa',lock(h('select',{onchange:set('opportunity_id')},options(opps,f.opportunity_id,'— Nessuna —')))),
  field('Listino prezzi',lock(h('select',{onchange:set('price_book_id')},options(S.books.filter(b=>b.active!==false||b.id===f.price_book_id),f.price_book_id,'Prezzi di catalogo')))),
  field('Data',lock(h('input',{type:'date',value:f.issue_date,onchange:set('issue_date')}))),
  kind==='quote'?field('Valido fino al',lock(h('input',{type:'date',value:f.valid_until,onchange:set('valid_until')}))):field('Scadenza pagamento',lock(h('input',{type:'date',value:f.due_date,onchange:set('due_date')}))));
 wrap.append(grid);
 wrap.append(h('h3',{class:'vd-h3',text:'Righe'}),linesTable(f,edit));
 const tot=h('div',{class:'vd-totals',id:'vd-totals'});fillTotals(tot,f);
 wrap.append(h('div',{class:'vd-bottom'},
  h('div',{class:'vd-texts'},field('Note per il cliente',lock(h('textarea',{rows:'3',maxlength:'4000',value:f.notes,oninput:set('notes')}))),field('Condizioni',lock(h('textarea',{rows:'4',maxlength:'4000',value:f.terms,oninput:set('terms'),placeholder:'Modalità di pagamento, tempi di consegna… (predefinite in Intestazione)'})))),
  tot));
 return wrap;
}
function fillTotals(box,f){
 box.textContent='';const c=V.cleanLines(f.lines);
 if(c.error){box.append(h('p',{class:'vd-warn',text:c.error}));return}
 const t=V.totals(c.lines);
 const row=(k,v,cls)=>h('div',{class:'vd-trow'+(cls?' '+cls:'')},h('span',{text:k}),h('b',{text:v}));
 box.append(row('Imponibile',V.euro(t.subtotal_cents)));
 if(t.discount_cents)box.append(row('di cui sconti',V.euro(t.discount_cents),'is-minor'));
 for(const r of t.vat_summary)box.append(row('IVA '+V.pct(r.vat_rate_bp)+' su '+V.euro(r.net_cents),V.euro(r.vat_cents),'is-minor'));
 box.append(row('Totale',V.euro(t.total_cents),'is-total'));
}
function linesTable(f,edit){
 const wrap=h('div',{class:'vd-scroll'});
 const table=h('table',{class:'vd-lines'},h('thead',{},h('tr',{},['Prodotto','Descrizione','Q.tà','Unità','Prezzo €','Sconto %','IVA %','Importo',''].map((t,i)=>h('th',{scope:'col',class:i>=2&&i!==3&&i<8?'num':null,text:t})))));
 const body=h('tbody');
 const refresh=()=>{const t=document.getElementById('vd-totals');if(t)fillTotals(t,f)};
 f.lines.forEach((l,i)=>{
  const amount=h('td',{class:'num vd-amount','data-label':'Importo'});
  const upd=()=>{const c=V.cleanLines([{...l,description:l.description||'x'}]);amount.textContent=c.error||!c.lines.length?'—':V.euro(V.lineNet(c.lines[0]))};
  const inp=(k,attrs)=>{const e=h(k==='description'?'textarea':'input',{value:l[k],...attrs,oninput:ev=>{l[k]=ev.target.value;upd();refresh()}});if(!edit)e.disabled=true;return e};
  const prod=h('select',{'aria-label':'Prodotto riga '+(i+1),onchange:e=>{const p=S.products.find(x=>x.id===e.target.value);if(p)Object.assign(l,V.lineFromProduct(p,S.entries,f.price_book_id));else l.product_id=null;render()}},
   options(S.products.filter(p=>p.active!==false||p.id===l.product_id),l.product_id,'Voce libera',p=>p.name+(p.code?' · '+p.code:'')));
  if(!edit)prod.disabled=true;
  body.append(h('tr',{},
   h('td',{'data-label':'Prodotto'},prod),
   h('td',{'data-label':'Descrizione'},inp('description',{rows:'1',maxlength:'1000','aria-label':'Descrizione riga '+(i+1)})),
   h('td',{class:'num','data-label':'Q.tà'},inp('quantity',{inputmode:'decimal',size:'5','aria-label':'Quantità riga '+(i+1)})),
   h('td',{'data-label':'Unità'},inp('unit',{maxlength:'20',size:'4','aria-label':'Unità riga '+(i+1)})),
   h('td',{class:'num','data-label':'Prezzo €'},inp('price',{inputmode:'decimal',size:'9','aria-label':'Prezzo riga '+(i+1)})),
   h('td',{class:'num','data-label':'Sconto %'},inp('discount',{inputmode:'decimal',size:'4','aria-label':'Sconto riga '+(i+1)})),
   h('td',{class:'num','data-label':'IVA %'},inp('vat',{inputmode:'decimal',size:'4',list:'vd-vat','aria-label':'IVA riga '+(i+1)})),
   amount,
   h('td',{},edit?h('button',{type:'button',class:'vd-icon','aria-label':'Togli riga '+(i+1),title:'Togli riga',onclick:()=>{f.lines.splice(i,1);if(!f.lines.length)f.lines.push(V.emptyLine());render()}},'×'):null)));
  upd();
 });
 table.append(body);wrap.append(table);
 if(edit)wrap.append(h('button',{type:'button',class:'vd-btn',onclick:()=>{f.lines.push(V.emptyLine());render()}},'＋ Aggiungi riga'));
 return wrap;
}

function actions(doc,f){
 const out=[];const kind=KIND[S.tab];
 if(V.editable(doc)&&canWrite())out.push(h('button',{type:'button',class:'vd-btn is-primary',onclick:save},doc?'Salva':'Crea bozza'));
 if(doc&&canWrite()){
  for(const [to,t] of V.moves(doc))out.push(h('button',{type:'button',class:'vd-btn'+(to==='annullata'||to==='rifiutato'?' is-danger':''),onclick:()=>move(to,t)},t));
  if(kind==='quote'&&doc.status==='accettato'){
   const inv=S.docs.invoice.find(i=>i.quote_id===doc.id);
   out.push(inv?h('a',{class:'vd-btn',href:'#invoices/'+inv.id},'Apri la fattura '+(inv.number||'(bozza)')):h('button',{type:'button',class:'vd-btn is-primary',onclick:makeInvoice},'Crea fattura'));
   const o=S.opportunities.find(x=>x.id===doc.opportunity_id);
   if(o&&Number(o.amount_cents||0)!==Number(doc.subtotal_cents))out.push(h('button',{type:'button',class:'vd-btn',title:'Imposta il valore della trattativa all’imponibile del preventivo',onclick:()=>syncOpportunity(o,doc)},'Valore trattativa = '+V.euro(doc.subtotal_cents)));
  }
 }
 if(doc)out.push(h('button',{type:'button',class:'vd-btn',onclick:()=>printDoc(doc)},'Stampa / PDF'));
 // «Offerta grafica» (sales/offerta.js): the quote as a proposal to look at, three looks, printed to PDF by the browser.
 if(doc&&kind==='quote'&&window.RadixOfferta)out.push(h('button',{type:'button',class:'vd-btn',title:'Il preventivo impaginato come proposta commerciale: configuratore, tre look, stampa o PDF',onclick:()=>window.RadixOfferta.open(doc,{workspace:S.workspace,industry:S.companies.find(c=>c.id===doc.company_id)?.industry||''})},'✦ Offerta grafica'));
 if(doc&&canWrite()&&doc.status==='bozza'&&!(kind==='quote'&&S.docs.invoice.some(i=>i.quote_id===doc.id)))out.push(h('button',{type:'button',class:'vd-btn is-danger',onclick:remove},'Elimina'));
 return out;
}
async function save(){
 const p=V.documentPayload(S.current,S.form);
 if(p.error){say(p.error,'err');return}
 if(p.nothing){say('Nessuna modifica da salvare.');return}
 await run('Salvataggio',async()=>{
  const r=await post('documents',p.action,p.data);await reloadDocs();
  if(p.action==='create'){S.current=null;location.hash=S.tab+'/'+r.id;return 'Bozza creata: '+(r.number||'il numero arriva all’emissione')+'.'}
  await openDoc(S.current.id);render();return 'Salvato.';
 });
}
async function move(to,text){
 const doc=S.current;
 if(V.editable(doc)){const p=V.documentPayload(doc,S.form);if(!p.nothing){say('Prima salva le modifiche.','err');return}}
 if(to==='emessa'&&!confirm('Emettere la fattura? Riceve il numero definitivo e non si potrà più modificare.'))return;
 if(to==='annullata'&&!confirm('Annullare questa fattura? Resta in archivio con il suo numero.'))return;
 const data={id:doc.id,version:doc.version,status:to};
 await run(text,async()=>{await post('documents','status',data);await reloadDocs();await openDoc(doc.id);render();return 'Stato aggiornato: '+V.label(S.current)+(S.current.number&&!doc.number?' · numero '+S.current.number:'')+'.'});
}
async function makeInvoice(){
 const doc=S.current;if(!S.keys.has(doc.id))S.keys.set(doc.id,crypto.randomUUID());
 await run('Creazione fattura',async()=>{const r=await post('documents','invoice',{id:doc.id,version:doc.version,key:S.keys.get(doc.id)});S.keys.delete(doc.id);await reloadDocs();S.current=null;location.hash='invoices/'+(r.invoice_id||r.id);return 'Fattura in bozza creata dal preventivo: controllala ed emettila.'});
}
async function syncOpportunity(o,doc){
 await run('Aggiornamento trattativa',async()=>{await post('opportunities','update',{id:o.id,version:o.version,amount_cents:Number(doc.subtotal_cents)});S.opportunities=await getAll('opportunities');render();return 'Valore della trattativa «'+o.title+'» aggiornato.'});
}
async function remove(){
 const doc=S.current;if(!confirm('Eliminare questa bozza?'))return;
 await run('Eliminazione',async()=>{await post('documents','delete',{id:doc.id,version:doc.version});await reloadDocs();S.current=null;location.hash=S.tab;return 'Bozza eliminata.'});
}

/* ---------- Print / PDF ---------- */
function printDoc(doc){
 const box=$('vd-print');box.textContent='';
 const issuer=doc.issuer||S.settings?.issuer||{},cust=doc.customer||{};
 const who=cust.company?V.party(cust.company):[];if(cust.contact?.name)who.push((cust.company?'Alla c.a. ':'')+cust.contact.name);
 box.append(...[
  h('header',{class:'pd-head'},h('div',{},h('strong',{class:'pd-issuer',text:issuer.legal_name||issuer.name||'Intestazione da completare'}),V.party(issuer).slice(1).map(t=>h('div',{text:t}))),
   h('div',{class:'pd-title'},h('h1',{text:V.kindName(doc.kind)+(doc.number?' n. '+doc.number:' (bozza)')}),h('div',{text:'Data '+dateText(doc.issue_date)}),
    doc.kind==='quote'&&doc.valid_until?h('div',{text:'Valido fino al '+dateText(doc.valid_until)}):null,doc.kind==='invoice'&&doc.due_date?h('div',{text:'Scadenza '+dateText(doc.due_date)}):null)),
  h('section',{class:'pd-to'},h('small',{text:'Spett.le'}),who.length?who.map((t,i)=>h(i?'div':'strong',{text:t})):h('div',{text:'—'})),
  doc.title?h('h2',{class:'pd-subject',text:doc.title}):null,
  h('table',{class:'pd-lines'},h('thead',{},h('tr',{},['Descrizione','Q.tà','Prezzo','Sconto','IVA','Importo'].map((t,i)=>h('th',{class:i?'num':null,text:t})))),
   h('tbody',{},(doc.lines||[]).map(l=>h('tr',{},h('td',{text:l.description}),h('td',{class:'num',text:V.qtyText(l.quantity)+' '+(l.unit||'')}),h('td',{class:'num',text:V.euro(l.unit_price_cents)}),h('td',{class:'num',text:l.discount_bp?V.pct(l.discount_bp):''}),h('td',{class:'num',text:V.pct(l.vat_rate_bp)}),h('td',{class:'num',text:V.euro(l.net_cents)}))))),
  h('div',{class:'pd-totals'},h('div',{},h('span',{text:'Imponibile'}),h('b',{text:V.euro(doc.subtotal_cents)})),
   (doc.vat_summary||[]).map(r=>h('div',{},h('span',{text:'IVA '+V.pct(r.vat_rate_bp)+' su '+V.euro(r.net_cents)}),h('b',{text:V.euro(r.vat_cents)}))),
   h('div',{class:'pd-total'},h('span',{text:'Totale'}),h('b',{text:V.euro(doc.total_cents)}))),
  doc.notes?h('section',{class:'pd-text'},h('h3',{text:'Note'}),h('p',{text:doc.notes})):null,
  doc.terms?h('section',{class:'pd-text'},h('h3',{text:'Condizioni'}),h('p',{text:doc.terms})):null,
  doc.kind==='invoice'?h('p',{class:'pd-foot',text:'Documento commerciale. La fattura elettronica valida ai fini fiscali è quella trasmessa tramite il Sistema di Interscambio (SdI).'}):null].filter(Boolean));
 const prev=document.title;document.title=V.kindName(doc.kind)+(doc.number?' '+doc.number.replace('/','-'):' bozza')+(cust.company?.name?' - '+cust.company.name:'');
 window.print();setTimeout(()=>{document.title=prev},500);
}

/* ---------- Prodotti ---------- */
function productsView(){
 const wrap=h('section',{class:'vd-panel'});
 wrap.append(h('div',{class:'vd-head'},h('div',{},h('h2',{text:'Prodotti e servizi'}),h('p',{class:'vd-sub',text:'Il catalogo da cui scegli le righe di preventivi e fatture. Prezzi IVA esclusa.'})),
  canAdmin()?h('button',{type:'button',class:'vd-btn is-primary',onclick:()=>{S.product={};render()}},'＋ Nuovo prodotto'):null));
 if(!canAdmin())wrap.append(h('p',{class:'vd-note',text:'Il catalogo si modifica solo da owner o admin del workspace.'}));
 if(S.product)wrap.append(productForm(S.product));
 if(!S.products.length){wrap.append(h('div',{class:'vd-empty'},h('strong',{text:'Catalogo vuoto'}),h('p',{text:'Aggiungi i tuoi prodotti o servizi con prezzo e aliquota IVA: li ritrovi nelle righe dei preventivi.'})));return wrap}
 const t=h('table',{class:'vd-table'},h('thead',{},h('tr',{},['Nome','Codice','Unità','Prezzo','IVA','Stato'].map((x,i)=>h('th',{scope:'col',class:i===3||i===4?'num':null,text:x})))));
 const b=h('tbody');
 for(const p of S.products)b.append(h('tr',{onclick:()=>{if(canAdmin()){S.product=p;render();window.scrollTo({top:0,behavior:'smooth'})}}},
  h('td',{'data-label':'Nome'},h('strong',{text:p.name}),p.description?h('small',{text:p.description}):null),h('td',{'data-label':'Codice',text:p.code||'—'}),h('td',{'data-label':'Unità',text:p.unit}),
  h('td',{class:'num','data-label':'Prezzo',text:V.euro(p.unit_price_cents)}),h('td',{class:'num','data-label':'IVA',text:V.pct(p.vat_rate_bp)}),
  h('td',{'data-label':'Stato'},h('span',{class:'vd-badge '+(p.active?'is-emessa':'is-annullata'),text:p.active?'Attivo':'Non attivo'}))));
 t.append(b);wrap.append(h('div',{class:'vd-scroll'},t));return wrap;
}
function productForm(p){
 const f={name:p.name||'',code:p.code||'',description:p.description||'',unit:p.unit||'pz',price:p.id?V.plain(p.unit_price_cents):'',vat:p.id?String(Number(p.vat_rate_bp)/100).replace('.',','):'22',active:p.id?p.active:true};
 const inp=(k,attrs)=>h(k==='description'?'textarea':'input',{value:f[k],...attrs,oninput:e=>{f[k]=e.target.value}});
 const form=h('form',{class:'vd-form',onsubmit:async e=>{e.preventDefault();const r=V.productPayload(p,f);if(r.error){say(r.error,'err');return}if(r.nothing){S.product=null;render();return}
  await run('Salvataggio prodotto',async()=>{await post('products',r.action,r.data);S.products=await get('products');S.product=null;render();return 'Prodotto salvato.'})}},
  h('h3',{class:'vd-h3',text:p.id?'Modifica «'+p.name+'»':'Nuovo prodotto o servizio'}),
  h('div',{class:'vd-grid'},field('Nome',inp('name',{required:true,maxlength:'200'}),'wide'),field('Codice',inp('code',{maxlength:'60',placeholder:'Facoltativo'})),field('Unità',inp('unit',{maxlength:'20',placeholder:'pz, ore, mese…'})),
   field('Prezzo € (IVA esclusa)',inp('price',{inputmode:'decimal',required:true,placeholder:'Es. 1.200'})),field('IVA %',inp('vat',{inputmode:'decimal',list:'vd-vat'})),
   field('Descrizione',inp('description',{rows:'2',maxlength:'4000'}),'wide'),
   h('label',{class:'vd-check'},h('input',{type:'checkbox',checked:f.active,onchange:e=>{f.active=e.target.checked}}),'Attivo: si può scegliere nei documenti')),
  h('div',{class:'vd-actions'},h('button',{class:'vd-btn is-primary',type:'submit'},'Salva'),h('button',{type:'button',class:'vd-btn',onclick:()=>{S.product=null;render()}},'Annulla'),
   p.id?h('button',{type:'button',class:'vd-btn is-danger',onclick:async()=>{if(!confirm('Eliminare «'+p.name+'»? Le righe dei documenti già fatti restano invariate.'))return;await run('Eliminazione',async()=>{await post('products','delete',{id:p.id,version:p.version});[S.products,S.entries]=await Promise.all([get('products'),get('price_book_entries')]);S.product=null;render();return 'Prodotto eliminato.'})}},'Elimina'):null));
 return form;
}

/* ---------- Listini ---------- */
function booksView(){
 const wrap=h('section',{class:'vd-panel'});
 wrap.append(h('div',{class:'vd-head'},h('div',{},h('h2',{text:'Listini prezzi'}),h('p',{class:'vd-sub',text:'Prezzi diversi per gruppi di clienti (es. rivenditori). Nel preventivo scegli il listino: le righe prendono quei prezzi.'})),
  canAdmin()?h('button',{type:'button',class:'vd-btn is-primary',onclick:newBook},'＋ Nuovo listino'):null));
 if(!S.books.length){wrap.append(h('div',{class:'vd-empty'},h('strong',{text:'Nessun listino'}),h('p',{text:'Senza listini si usano i prezzi del catalogo Prodotti.'})));return wrap}
 if(!S.books.some(b=>b.id===S.book))S.book=S.books[0].id;
 const bk=S.books.find(b=>b.id===S.book);
 wrap.append(h('div',{class:'vd-chips'},S.books.map(b=>h('button',{type:'button',class:'vd-chip','aria-pressed':String(b.id===S.book),onclick:()=>{S.book=b.id;render()}},b.name,b.is_default?h('b',{text:'predefinito'}):null))));
 if(canAdmin())wrap.append(h('div',{class:'vd-actions'},
  bk.is_default?null:h('button',{type:'button',class:'vd-btn',onclick:()=>bookUpdate(bk,{is_default:true},'Listino predefinito impostato.')},'Rendi predefinito'),
  h('button',{type:'button',class:'vd-btn',onclick:()=>{const n=prompt('Nuovo nome del listino',bk.name);if(n&&n.trim()&&n.trim()!==bk.name)bookUpdate(bk,{name:n.trim().slice(0,200)},'Listino rinominato.')}},'Rinomina'),
  h('button',{type:'button',class:'vd-btn is-danger',onclick:async()=>{if(!confirm('Eliminare il listino «'+bk.name+'»? I documenti già fatti non cambiano.'))return;await run('Eliminazione',async()=>{await post('price_books','delete',{id:bk.id,version:bk.version});[S.books,S.entries]=await Promise.all([get('price_books'),get('price_book_entries')]);render();return 'Listino eliminato.'})}},'Elimina')));
 if(!S.products.length){wrap.append(h('p',{class:'vd-note',text:'Aggiungi prima qualche prodotto nel catalogo.'}));return wrap}
 const t=h('table',{class:'vd-table'},h('thead',{},h('tr',{},['Prodotto','Prezzo di catalogo','Prezzo nel listino',''].map((x,i)=>h('th',{scope:'col',class:i===1||i===2?'num':null,text:x})))));
 const b=h('tbody');
 for(const p of S.products.filter(x=>x.active)){
  const e=S.entries.find(x=>x.price_book_id===bk.id&&x.product_id===p.id);
  const input=h('input',{inputmode:'decimal',size:'10',value:e?V.plain(e.unit_price_cents):'',placeholder:V.plain(p.unit_price_cents),'aria-label':'Prezzo nel listino per '+p.name});
  if(!canAdmin())input.disabled=true;
  b.append(h('tr',{},h('td',{'data-label':'Prodotto'},h('strong',{text:p.name})),h('td',{class:'num','data-label':'Catalogo',text:V.euro(p.unit_price_cents)}),h('td',{class:'num','data-label':'Listino'},input),
   h('td',{},canAdmin()?[h('button',{type:'button',class:'vd-btn',onclick:async()=>{const c=V.cents(input.value);if(c===null||!input.value.trim()){say('Scrivi un prezzo valido, per esempio 950 o 1.200,50.','err');return}
     await run('Salvataggio prezzo',async()=>{await post('price_book_entries','set',{price_book_id:bk.id,product_id:p.id,unit_price_cents:c});S.entries=await get('price_book_entries');render();return 'Prezzo salvato nel listino.'})}},'Salva'),
    e?h('button',{type:'button',class:'vd-btn',onclick:async()=>{await run('Rimozione',async()=>{await post('price_book_entries','delete',{price_book_id:bk.id,product_id:p.id});S.entries=await get('price_book_entries');render();return 'Torna al prezzo di catalogo.'})}},'Usa catalogo'):null]:null)));
 }
 t.append(b);wrap.append(h('div',{class:'vd-scroll'},t));return wrap;
}
async function newBook(){
 const n=prompt('Nome del nuovo listino (es. Rivenditori 2026)');if(!n||!n.trim())return;
 await run('Creazione listino',async()=>{const r=await post('price_books','create',{name:n.trim().slice(0,200),is_default:!S.books.length});S.books=await get('price_books');S.book=r?.id||S.book;render();return 'Listino creato: imposta i prezzi qui sotto.'});
}
async function bookUpdate(bk,data,msg){await run('Salvataggio',async()=>{await post('price_books','update',{id:bk.id,version:bk.version,...data});S.books=await get('price_books');render();return msg})}

/* ---------- Intestazione ---------- */
function settingsView(){
 const st=S.settings||{},iss=st.issuer||{};
 const f={quote_terms:st.quote_terms||'',invoice_terms:st.invoice_terms||'',quote_validity_days:String(st.quote_validity_days||30),payment_days:String(st.payment_days??30)};
 for(const [k] of V.ISSUER)f['issuer_'+k]=iss[k]||'';
 const lock=el=>{if(!canAdmin())el.disabled=true;return el};
 const inp=(k,attrs)=>lock(h(attrs?.rows?'textarea':'input',{value:f[k],...attrs,oninput:e=>{f[k]=e.target.value}}));
 const form=h('form',{class:'vd-panel vd-form',onsubmit:async e=>{e.preventDefault();const r=V.settingsPayload(S.settings,{...f,quote_validity_days:Number(f.quote_validity_days),payment_days:Number(f.payment_days)});if(r.error){say(r.error,'err');return}
  await run('Salvataggio intestazione',async()=>{await post('document_settings','set',r.data);S.settings=(await get('document_settings'))[0]||null;render();return 'Intestazione salvata: vale per i nuovi documenti e per le bozze.'})}},
  h('div',{class:'vd-head'},h('div',{},h('h2',{text:'Intestazione e condizioni'}),h('p',{class:'vd-sub',text:'I tuoi dati che compaiono in alto su preventivi e fatture. I documenti già inviati o emessi conservano i dati di quel momento.'}))),
  canAdmin()?null:h('p',{class:'vd-note',text:'Si modifica solo da owner o admin del workspace.'}),
  h('div',{class:'vd-grid'},V.ISSUER.map(([k,t])=>field(t,inp('issuer_'+k,{maxlength:'200',autocomplete:'off'}),k==='name'||k==='legal_name'||k==='street'?'wide':null))),
  h('h3',{class:'vd-h3',text:'Condizioni predefinite'}),
  h('div',{class:'vd-grid'},field('Validità del preventivo (giorni)',inp('quote_validity_days',{type:'number',min:'1',max:'365'})),field('Pagamento fattura (giorni)',inp('payment_days',{type:'number',min:'0',max:'365'})),
   field('Condizioni del preventivo',inp('quote_terms',{rows:'3',maxlength:'4000'}),'wide'),field('Condizioni della fattura',inp('invoice_terms',{rows:'3',maxlength:'4000',placeholder:'Es. Bonifico bancario a 30 giorni data fattura'}),'wide')),
  canAdmin()?h('div',{class:'vd-actions'},h('button',{type:'submit',class:'vd-btn is-primary'},'Salva intestazione')):null);
 return form;
}

/* ---------- Boot ---------- */
window.addEventListener('hashchange',route);
document.addEventListener('DOMContentLoaded',async()=>{
 $('vd-workspace').addEventListener('change',e=>{S.workspace=e.target.value;wsMemo.set(S.workspace);S.current=null;S.form=null;loadAll()});
 try{if(await loadWorkspaces())await loadAll();else{S.loaded=true;render()}}
 catch(e){S.loaded=true;say(e.message,'err');render()}
});
})();
