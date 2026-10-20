'use strict';
/* «Vendite»: Prodotti, Listini, Preventivi e Fatture (migration sales/013, api/_sales_documents.js).
   Pure logic for sales/vendite.js and the tests: Italian amounts, line and VAT totals computed exactly as
   sales_document_set_lines does in the database, the status moves the database allows, and the payloads
   the API accepts. No network, no DOM. */
(function(root){
const str=v=>v===null||v===undefined?'':String(v).trim();
const QUOTE=Object.freeze([['bozza','Bozza'],['inviato','Inviato'],['accettato','Accettato'],['rifiutato','Rifiutato'],['scaduto','Scaduto']]);
const INVOICE=Object.freeze([['bozza','Bozza'],['emessa','Emessa'],['pagata','Pagata'],['annullata','Annullata']]);
const LABEL={quote:Object.fromEntries(QUOTE),invoice:Object.fromEntries(INVOICE)};
// Same moves as the CHECK in sales_document_command: anything else is refused there too.
const MOVES=Object.freeze({
 quote:{bozza:[['inviato','Segna come inviato']],inviato:[['accettato','Accettato dal cliente'],['rifiutato','Rifiutato'],['scaduto','Scaduto'],['bozza','Riporta in bozza']],rifiutato:[['bozza','Riporta in bozza']],scaduto:[['bozza','Riporta in bozza']],accettato:[]},
 invoice:{bozza:[['emessa','Emetti la fattura']],emessa:[['pagata','Segna come pagata'],['annullata','Annulla']],pagata:[['emessa','Non ancora pagata']],annullata:[]}});
const moves=doc=>(MOVES[doc?.kind]||{})[doc?.status]||[];
const editable=doc=>!doc?.id||doc.status==='bozza';
const label=doc=>LABEL[doc?.kind]?.[doc?.status]||str(doc?.status);
const VAT_RATES=Object.freeze([2200,1000,500,400,0]);

// «12.500», «12500,50», «€ 1.200» → cents; '' → 0; anything else → null.
function cents(v){
 let s=str(v).replace(/[€\s]/g,'');if(!s)return 0;
 if(/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s))s=s.replace(/\./g,'').replace(',','.');
 else if(/^\d+(,\d{1,2})?$/.test(s))s=s.replace(',','.');
 else if(!/^\d+(\.\d{1,2})?$/.test(s))return null;
 const n=Math.round(Number(s)*100);return Number.isSafeInteger(n)&&n>=0&&n<=9000000000000?n:null;
}
// «22», «22%», «4,5» → basis points (2200, 450); 0..100 %.
function bp(v){
 const s=str(v).replace(/[%\s]/g,'').replace(',','.');if(!s)return 0;
 if(!/^\d{1,3}(\.\d{1,2})?$/.test(s))return null;
 const n=Math.round(Number(s)*100);return n>=0&&n<=10000?n:null;
}
// «2», «1,5», «0,250» → number with at most 3 decimals, above zero.
function qty(v){
 const s=str(v).replace(/\s/g,'').replace(',','.');
 if(!/^\d{1,9}(\.\d{1,3})?$/.test(s))return null;
 const n=Number(s);return n>0?n:null;
}
const fmt=new Intl.NumberFormat('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});
const euro=c=>'€ '+fmt.format(Number(c||0)/100);
const plain=c=>fmt.format(Number(c||0)/100);
const pct=b=>new Intl.NumberFormat('it-IT',{maximumFractionDigits:2}).format(Number(b||0)/100)+'%';
const qtyText=q=>new Intl.NumberFormat('it-IT',{maximumFractionDigits:3}).format(Number(q||0));

// Postgres round(): half away from zero; amounts are never negative here.
const round=x=>Math.round(x+1e-9);
const lineGross=l=>round(Math.round(l.quantity*1000)*l.unit_price_cents/1000);
const lineNet=l=>round(lineGross(l)*(10000-(l.discount_bp||0))/10000);
// Totals of a set of clean lines, as sales_document_set_lines: VAT per rate on that rate's net total.
function totals(lines){
 const by=new Map();let gross=0;
 for(const l of lines){gross+=lineGross(l);const n=lineNet(l);by.set(l.vat_rate_bp,(by.get(l.vat_rate_bp)||0)+n);}
 const vat_summary=[...by.entries()].sort((a,b)=>b[0]-a[0]).map(([rate,net])=>({vat_rate_bp:rate,net_cents:net,vat_cents:round(net*rate/10000)}));
 const net=vat_summary.reduce((s,r)=>s+r.net_cents,0),vat=vat_summary.reduce((s,r)=>s+r.vat_cents,0);
 return {subtotal_cents:net,discount_cents:gross-net,vat_cents:vat,total_cents:net+vat,vat_summary};
}

// The price of a product: the chosen price book's entry when there is one, else the list price.
function priceOf(product,entries,bookId){
 const e=bookId&&(entries||[]).find(x=>x.price_book_id===bookId&&x.product_id===product.id);
 return e?Number(e.unit_price_cents):Number(product.unit_price_cents||0);
}
function lineFromProduct(product,entries,bookId){
 return {product_id:product.id,description:product.description?product.name+' · '+product.description:product.name,quantity:'1',unit:product.unit||'pz',price:plain(priceOf(product,entries,bookId)),discount:'',vat:String(Number(product.vat_rate_bp??2200)/100).replace('.',',')};
}
const emptyLine=()=>({product_id:null,description:'',quantity:'1',unit:'pz',price:'',discount:'',vat:'22'});
const lineForm=l=>({product_id:l.product_id||null,description:l.description||'',quantity:qtyText(l.quantity).replace(/\./g,''),unit:l.unit||'pz',price:plain(l.unit_price_cents),discount:l.discount_bp?String(l.discount_bp/100).replace('.',','):'',vat:String(Number(l.vat_rate_bp)/100).replace('.',',')});

// Form rows (strings, as typed) → API lines, or {error} naming the row. Fully empty rows are skipped.
function cleanLines(rows){
 const out=[];
 for(const [i,r] of (rows||[]).entries()){
  const n='Riga '+(i+1)+': ';
  if(!str(r.description)&&!str(r.price)&&!r.product_id)continue;
  if(!str(r.description))return {error:n+'scrivi la descrizione.'};
  const q=qty(r.quantity);if(q===null)return {error:n+'quantità non valida (per esempio 2 oppure 1,5).'};
  const p=cents(r.price);if(p===null)return {error:n+'prezzo non valido (per esempio 1.200 o 99,90).'};
  const d=bp(r.discount);if(d===null)return {error:n+'sconto non valido (da 0 a 100%).'};
  const v=bp(r.vat);if(v===null)return {error:n+'aliquota IVA non valida (per esempio 22).'};
  const l={description:str(r.description).slice(0,1000),quantity:q,unit:str(r.unit).slice(0,20)||'pz',unit_price_cents:p,discount_bp:d,vat_rate_bp:v};
  if(r.product_id)l.product_id=r.product_id;
  out.push(l);
 }
 if(out.length>200)return {error:'Massimo 200 righe per documento.'};
 return {lines:out};
}
const realDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
// Editor form → create/update data. On update only what changed is sent, with id and version.
function documentPayload(doc,form){
 const c=cleanLines(form.lines);if(c.error)return c;
 for(const [k,name] of [['issue_date','Data'],['valid_until','Valido fino al'],['due_date','Scadenza pagamento']])if(form[k]&&!realDate(form[k]))return {error:name+': data non valida.'};
 const d={title:str(form.title).slice(0,200)||null,company_id:form.company_id||null,contact_id:form.contact_id||null,opportunity_id:form.opportunity_id||null,price_book_id:form.price_book_id||null,
  notes:str(form.notes)||null,terms:str(form.terms)||null,lines:c.lines};
 if(form.issue_date)d.issue_date=form.issue_date;
 if(doc?.kind==='quote'||form.kind==='quote'){if(form.valid_until)d.valid_until=form.valid_until;else if(doc?.id)d.valid_until=null;}
 else{if(form.due_date)d.due_date=form.due_date;else if(doc?.id)d.due_date=null;}
 if(!doc?.id)return {action:'create',data:{kind:form.kind,...Object.fromEntries(Object.entries(d).filter(([,v])=>v!==null))}};
 const changed={};
 for(const [k,v] of Object.entries(d)){
  if(k==='lines'){if(JSON.stringify(v)!==JSON.stringify((doc.lines||[]).map(apiLine)))changed.lines=v;continue;}
  if((doc[k]??null)!==v)changed[k]=v;
 }
 if(!Object.keys(changed).length)return {nothing:true};
 return {action:'update',data:{id:doc.id,version:doc.version,...changed}};
}
// A stored line in the shape cleanLines produces, to tell whether the lines changed.
function apiLine(l){const o={description:l.description,quantity:Number(l.quantity),unit:l.unit||'pz',unit_price_cents:Number(l.unit_price_cents),discount_bp:Number(l.discount_bp||0),vat_rate_bp:Number(l.vat_rate_bp)};if(l.product_id)o.product_id=l.product_id;return o}

// New document defaults: today, the validity or payment days of the settings, the default price book,
// and when it comes from an opportunity, its company, contact and title.
function today(now){const d=now||new Date();const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())}
function addDays(iso,days){const d=new Date(iso+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function newDocument(kind,{settings,books,opportunity,now}={}){
 const t=today(now),book=(books||[]).find(b=>b.is_default&&b.active!==false);
 const f={kind,title:opportunity?.title||'',company_id:opportunity?.company_id||'',contact_id:opportunity?.contact_id||'',opportunity_id:opportunity?.id||'',price_book_id:book?.id||'',issue_date:t,notes:'',
  terms:(kind==='quote'?settings?.quote_terms:settings?.invoice_terms)||'',lines:[emptyLine()]};
 if(kind==='quote')f.valid_until=addDays(t,Number(settings?.quote_validity_days||30));else f.due_date=addDays(t,Number(settings?.payment_days??30));
 return f;
}
function formOf(doc){
 return {kind:doc.kind,title:doc.title||'',company_id:doc.company_id||'',contact_id:doc.contact_id||'',opportunity_id:doc.opportunity_id||'',price_book_id:doc.price_book_id||'',issue_date:doc.issue_date||'',valid_until:doc.valid_until||'',due_date:doc.due_date||'',notes:doc.notes||'',terms:doc.terms||'',
  lines:(doc.lines||[]).length?doc.lines.map(lineForm):[emptyLine()]};
}

// Product form → create/update data.
function productPayload(p,form){
 const name=str(form.name);if(!name)return {error:'Scrivi il nome del prodotto o servizio.'};
 const price=cents(form.price);if(price===null)return {error:'Prezzo non valido (per esempio 1.200 o 99,90).'};
 const vat=bp(form.vat);if(vat===null)return {error:'Aliquota IVA non valida (per esempio 22).'};
 const code=str(form.code);if(code&&!/^[\p{L}\p{N}._\-/ ]{1,60}$/u.test(code))return {error:'Codice: fino a 60 caratteri tra lettere, numeri, punto, trattino o barra.'};
 const d={name:name.slice(0,200),code:code||null,description:str(form.description).slice(0,4000)||null,unit:str(form.unit).slice(0,20)||'pz',unit_price_cents:price,vat_rate_bp:vat,active:form.active!==false};
 if(!p?.id)return {action:'create',data:Object.fromEntries(Object.entries(d).filter(([,v])=>v!==null))};
 const changed=Object.fromEntries(Object.entries(d).filter(([k,v])=>(['unit_price_cents','vat_rate_bp'].includes(k)?Number(p[k]):p[k]??null)!==v));
 if(!Object.keys(changed).length)return {nothing:true};
 return {action:'update',data:{id:p.id,version:p.version,...changed}};
}

const ISSUER=Object.freeze([['name','Nome commerciale'],['legal_name','Ragione sociale'],['vat_number','Partita IVA'],['tax_code','Codice fiscale'],['street','Indirizzo'],['zip','CAP'],['city','Città'],['province','Provincia'],['country','Paese'],['email','Email'],['pec','PEC'],['sdi_code','Codice destinatario SdI'],['phone','Telefono'],['iban','IBAN'],['website','Sito web']]);
function settingsPayload(current,form){
 const issuer={};for(const [k] of ISSUER){const v=str(form['issuer_'+k]);if(v)issuer[k]=v.slice(0,200)}
 const v=Number(form.quote_validity_days),p=Number(form.payment_days);
 if(!Number.isInteger(v)||v<1||v>365)return {error:'Validità del preventivo: da 1 a 365 giorni.'};
 if(!Number.isInteger(p)||p<0||p>365)return {error:'Giorni di pagamento: da 0 a 365.'};
 const d={issuer,quote_terms:str(form.quote_terms)||null,invoice_terms:str(form.invoice_terms)||null,quote_validity_days:v,payment_days:p};
 if(current?.version)d.version=current.version;
 return {action:'set',data:d};
}

// Lines of a party (issuer or customer snapshot) for the printed document.
function party(o){
 if(!o)return [];
 const place=[str(o.zip),str(o.city),o.province?'('+str(o.province)+')':''].filter(Boolean).join(' ');
 return [o.legal_name||o.name,o.street,place,o.country&&o.country!=='IT'&&o.country!=='Italia'?o.country:'',o.vat_number?'P. IVA '+o.vat_number:'',o.tax_code&&o.tax_code!==o.vat_number?'C.F. '+o.tax_code:'',o.sdi_code?'Codice SdI '+o.sdi_code:'',o.pec?'PEC '+o.pec:'',o.email,o.phone,o.iban?'IBAN '+o.iban:''].map(str).filter(Boolean);
}
const kindName=k=>k==='invoice'?'Fattura':'Preventivo';
function docName(doc){return doc.number?kindName(doc.kind)+' '+doc.number:kindName(doc.kind)+(doc.kind==='invoice'?' (bozza, numero all’emissione)':' (bozza)')}

// Tabs and list filters.
function filter(rows,{status,search}={}){
 const q=str(search).toLowerCase();
 return (rows||[]).filter(r=>(!status||r.status===status)&&(!q||[r.number,r.title,r.customer?.company?.name,r.customer?.contact?.name].some(x=>str(x).toLowerCase().includes(q))));
}
function counts(rows,kind){const c={};for(const [k] of (kind==='invoice'?INVOICE:QUOTE))c[k]=0;for(const r of rows||[])if(Object.hasOwn(c,r.status))c[r.status]++;return c}
// Open value: quotes sent and not yet answered; invoices issued and not paid.
function openValue(rows,kind){return (rows||[]).filter(r=>kind==='invoice'?r.status==='emessa':r.status==='inviato').reduce((s,r)=>s+Number(r.total_cents||0),0)}
function overdue(doc,now){return doc.kind==='invoice'&&doc.status==='emessa'&&doc.due_date&&doc.due_date<today(now)}

const api={QUOTE,INVOICE,LABEL,MOVES,VAT_RATES,ISSUER,moves,editable,label,cents,bp,qty,euro,plain,pct,qtyText,lineGross,lineNet,totals,priceOf,lineFromProduct,emptyLine,lineForm,cleanLines,documentPayload,apiLine,today,addDays,newDocument,formOf,productPayload,settingsPayload,party,kindName,docName,filter,counts,openValue,overdue};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixVenditeCore=api;
})(typeof window==='object'?window:globalThis);
