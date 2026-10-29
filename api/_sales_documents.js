'use strict';
// CRM catalog and documents (migration sales 013): Prodotti, Listini, Preventivi, Fatture and the issuer data.
// command() checks every field before the database sees it; the store calls sales_document_command (one atomic
// PL/pgSQL function, like sales_command) and reads with the same membership guard as api/_sales_store.js.
const {randomUUID}=require('node:crypto');
const vis=require('./_sales_visibility');
const ENTITIES=Object.freeze(['products','price_books','price_book_entries','documents','document_settings']);
const READS=Object.freeze(['products','price_books','price_book_entries','documents','document','document_settings']);
class DocError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new DocError(status,message)};
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const CTRL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const MAX_CENTS=9000000000000;
function text(v,label,max,{required=false,multiline=false}={}){
 if(v===null||v===undefined||v===''){if(required)fail(400,label+' obbligatorio.');return null}
 if(typeof v!=='string'||v.length>max||(multiline?CTRL:/[\u0000-\u001f\u007f]/).test(v))fail(400,label+': testo non valido o più lungo di '+max+' caratteri.');
 const t=v.trim();if(required&&!t)fail(400,label+' obbligatorio.');return t||null;
}
const int=(v,label,min,max)=>{if(!Number.isSafeInteger(v)||v<min||v>max)fail(400,label+' non valido.');return v};
const bool=(v,label)=>{if(typeof v!=='boolean')fail(400,label+' non valido.');return v};
function date(v,label){if(v===null)return null;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v||v<'2000-01-01'||v>'2100-12-31')fail(400,label+': usa una data reale YYYY-MM-DD.');return v}
const keys=(d,allowed,label)=>{if(!object(d)||Object.keys(d).some(k=>!allowed.includes(k)))fail(400,label||'Campo non consentito.')};
const ref=(v,label)=>{if(v===null)return null;if(!uuid(v))fail(400,label+' non valido.');return v};

const PRODUCT=['name','code','description','unit','unit_price_cents','vat_rate_bp','active'];
const BOOK=['name','description','is_default','active'];
const DOC=['title','company_id','contact_id','opportunity_id','price_book_id','issue_date','valid_until','due_date','notes','terms','lines'];
const LINE=['product_id','description','quantity','unit','unit_price_cents','discount_bp','vat_rate_bp'];
const ISSUER=['name','legal_name','vat_number','tax_code','street','zip','city','province','country','email','pec','phone','iban','sdi_code','website','brand_primary','brand_accent'];
// The two offer colours (sales/offerta.js) live in issuer as #rrggbb: no column, no migration.
const HEX=/^#[0-9a-f]{6}$/i;
const QUOTE_STATUS=['bozza','inviato','accettato','rifiutato','scaduto'],INVOICE_STATUS=['bozza','emessa','pagata','annullata'];

function product(d,create){
 const o={};
 for(const [k,v] of Object.entries(d)){
  if(k==='name')o.name=text(v,'Nome del prodotto',200,{required:true});
  else if(k==='code'){o.code=text(v,'Codice',60);if(o.code&&!/^[\p{L}\p{N}._\-/ ]+$/u.test(o.code))fail(400,'Codice: usa lettere, numeri, punto, trattino o barra.')}
  else if(k==='description')o.description=text(v,'Descrizione',4000,{multiline:true});
  else if(k==='unit')o.unit=text(v,'Unità',20,{required:true});
  else if(k==='unit_price_cents')o.unit_price_cents=int(v,'Prezzo',0,MAX_CENTS);
  else if(k==='vat_rate_bp')o.vat_rate_bp=int(v,'Aliquota IVA',0,10000);
  else if(k==='active')o.active=bool(v,'Attivo');
 }
 if(create&&!o.name)fail(400,'Nome del prodotto obbligatorio.');
 return o;
}
function book(d,create){
 const o={};
 for(const [k,v] of Object.entries(d)){
  if(k==='name')o.name=text(v,'Nome del listino',200,{required:true});
  else if(k==='description')o.description=text(v,'Descrizione',1000,{multiline:true});
  else o[k]=bool(v,k==='is_default'?'Predefinito':'Attivo');
 }
 if(create&&!o.name)fail(400,'Nome del listino obbligatorio.');
 return o;
}
function lines(v){
 if(!Array.isArray(v)||v.length>200)fail(400,'Righe non valide: massimo 200.');
 return v.map((l,i)=>{
  const n='Riga '+(i+1);keys(l,LINE,n+': campo non consentito.');
  const q=l.quantity;if(typeof q!=='number'||!Number.isFinite(q)||q<=0||q>1e9||Math.round(q*1000)!==q*1000&&Math.abs(Math.round(q*1000)-q*1000)>1e-6)fail(400,n+': quantità maggiore di zero, al massimo 3 decimali.');
  const o={description:text(l.description,n+': descrizione',1000,{required:true,multiline:true}),quantity:Math.round(q*1000)/1000,unit_price_cents:int(l.unit_price_cents,n+': prezzo',0,MAX_CENTS),vat_rate_bp:int(l.vat_rate_bp,n+': aliquota IVA',0,10000)};
  if(l.product_id!==undefined&&l.product_id!==null)o.product_id=ref(l.product_id,n+': prodotto');
  if(l.unit!==undefined&&l.unit!==null&&l.unit!=='')o.unit=text(l.unit,n+': unità',20);
  if(l.discount_bp!==undefined)o.discount_bp=int(l.discount_bp,n+': sconto',0,10000);
  return o;
 });
}
function documentFields(d){
 const o={};
 for(const [k,v] of Object.entries(d)){
  if(k==='title')o.title=text(v,'Titolo',200);
  else if(['company_id','contact_id','opportunity_id','price_book_id'].includes(k))o[k]=ref(v,{company_id:'Azienda',contact_id:'Contatto',opportunity_id:'Trattativa',price_book_id:'Listino'}[k]);
  else if(['issue_date','valid_until','due_date'].includes(k))o[k]=date(v,{issue_date:'Data',valid_until:'Valido fino al',due_date:'Scadenza pagamento'}[k]);
  else if(k==='notes')o.notes=text(v,'Note',4000,{multiline:true});
  else if(k==='terms')o.terms=text(v,'Condizioni',4000,{multiline:true});
  else if(k==='lines')o.lines=lines(v);
 }
 return o;
}
const idVersion=d=>{if(!uuid(d.id)||!Number.isInteger(d.version)||d.version<1||d.version>2147483646)fail(400,'Identificativo e versione obbligatori.');return {id:d.id,version:d.version}};

function command(body){
 if(!object(body)||Object.keys(body).some(k=>!['workspace','entity','action','data'].includes(k))||!uuid(body.workspace)||!ENTITIES.includes(body.entity)||typeof body.action!=='string'||!object(body.data))fail(400,'Comando non valido.');
 const {workspace,entity,action}=body,d=body.data;let data;
 if(entity==='products'||entity==='price_books'){
  const allowed=entity==='products'?PRODUCT:BOOK,clean=entity==='products'?product:book;
  if(action==='create'){keys(d,allowed);data={id:randomUUID(),...clean(d,true)}}
  else if(action==='update'){keys(d,[...allowed,'id','version']);const {id,version,...rest}=d;const c=clean(rest,false);if(!Object.keys(c).length)fail(400,'Nessuna modifica.');data={...idVersion(d),...c}}
  else if(action==='delete'){keys(d,['id','version']);data=idVersion(d)}
  else fail(400,'Comando non valido.');
 }else if(entity==='price_book_entries'){
  if(action==='set'){keys(d,['price_book_id','product_id','unit_price_cents']);data={price_book_id:ref(d.price_book_id,'Listino'),product_id:ref(d.product_id,'Prodotto'),unit_price_cents:int(d.unit_price_cents,'Prezzo',0,MAX_CENTS)}}
  else if(action==='delete'){keys(d,['price_book_id','product_id']);data={price_book_id:ref(d.price_book_id,'Listino'),product_id:ref(d.product_id,'Prodotto')}}
  else fail(400,'Comando non valido.');
  if(!data.price_book_id||!data.product_id)fail(400,'Listino e prodotto obbligatori.');
 }else if(entity==='document_settings'){
  if(action!=='set')fail(400,'Comando non valido.');
  keys(d,['version','issuer','quote_terms','invoice_terms','quote_validity_days','payment_days']);
  data={};
  if(d.version!==undefined)data.version=int(d.version,'Versione',1,2147483646);
  if(d.issuer!==undefined){keys(d.issuer,ISSUER,'Intestazione: campo non consentito.');data.issuer={};for(const [k,v] of Object.entries(d.issuer)){const t=text(v,'Intestazione',200);if(t&&k.startsWith('brand_')&&!HEX.test(t))fail(400,'Colore non valido: usa il formato #rrggbb.');if(t)data.issuer[k]=k.startsWith('brand_')?t.toLowerCase():t}}
  if(d.quote_terms!==undefined)data.quote_terms=text(d.quote_terms,'Condizioni del preventivo',4000,{multiline:true});
  if(d.invoice_terms!==undefined)data.invoice_terms=text(d.invoice_terms,'Condizioni della fattura',4000,{multiline:true});
  if(d.quote_validity_days!==undefined)data.quote_validity_days=int(d.quote_validity_days,'Validità del preventivo',1,365);
  if(d.payment_days!==undefined)data.payment_days=int(d.payment_days,'Giorni di pagamento',0,365);
 }else{
  if(action==='create'){keys(d,['kind',...DOC]);if(!['quote','invoice'].includes(d.kind))fail(400,'Tipo di documento non valido.');data={id:randomUUID(),kind:d.kind,...documentFields(d)};if(!data.lines)data.lines=[]}
  else if(action==='update'){keys(d,['id','version',...DOC]);const {id,version,...rest}=d;const c=documentFields(rest);if(!Object.keys(c).length)fail(400,'Nessuna modifica.');data={...idVersion(d),...c}}
  else if(action==='status'){keys(d,['id','version','status','paid_at']);if(![...QUOTE_STATUS,...INVOICE_STATUS].includes(d.status))fail(400,'Stato non valido.');data={...idVersion(d),status:d.status};if(d.paid_at!==undefined)data.paid_at=date(d.paid_at,'Data di pagamento')}
  else if(action==='invoice'){keys(d,['id','version','key']);if(!uuid(d.key))fail(400,'Chiave mancante.');data={...idVersion(d),key:d.key,invoice_id:randomUUID()}}
  else if(action==='delete'){keys(d,['id','version']);data=idVersion(d)}
  else fail(400,'Comando non valido.');
 }
 return {workspace,entity,action,data};
}
function query(q){
 if(Object.keys(q).some(k=>!['entity','workspace','offset','id','kind'].includes(k))||!uuid(q.workspace)||!READS.includes(q.entity))fail(400,'Parametri non validi.');
 const offset=q.offset===undefined?0:Number(q.offset);if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)fail(400,'Pagina non valida.');
 if(q.entity==='document'?!uuid(q.id):q.id!==undefined)fail(400,'Documento non valido.');
 if(q.kind!==undefined&&(q.entity!=='documents'||!['quote','invoice'].includes(q.kind)))fail(400,'Tipo di documento non valido.');
 return {workspace:q.workspace,entity:q.entity,offset,...(q.id?{id:q.id}:{}),...(q.kind?{kind:q.kind}:{})};
}

const MESSAGES=Object.freeze({
 'document locked':[409,'Il documento non è più una bozza: per modificarlo riportalo in bozza (preventivi) oppure annullalo (fatture emesse).'],
 'invalid status change':[409,'Questo cambio di stato non è previsto: ricarica e riprova.'],
 'quote not accepted':[409,'La fattura si crea da un preventivo accettato.'],
 'empty document':[409,'Aggiungi almeno una riga prima di emettere la fattura.'],
 'invalid lines':[400,'Righe del documento non valide.']});
function createDocumentsStore(sql){
 const guard="EXISTS (SELECT 1 FROM sales_memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND m.user_id=$2 AND m.role IN ('owner','admin','member','viewer'))";
 const missing=e=>{if(['42P01','42883'].includes(e.code)){const err=new Error('Prodotti, preventivi e fatture non sono ancora attivi in questo archivio: serve la migrazione sales 013 (da approvare).');err.status=503;throw err}throw e};
 return {
  command:async(c,u)=>{
   try{const rows=await sql('SELECT sales_document_command($1::uuid,$2::integer,$3::text,$4::text,$5::jsonb) AS result',[c.workspace,u,c.entity,c.action,JSON.stringify(c.data)]);return rows[0].result}
   catch(e){
    const m=MESSAGES[e.message];if(m){const err=new Error(m[1]);err.status=m[0];throw err}
    if(e.code==='23505'&&/sales_products_code/.test(e.constraint||e.message||'')){const err=new Error('Questo codice prodotto è già usato.');err.status=409;throw err}
    if(e.code==='23503'&&c.entity==='products'&&c.action==='delete'){const err=new Error('Prodotto ancora usato.');err.status=409;throw err}
    return missing(e);
   }
  },
  read:async(c,u)=>{
   try{
    const p=[c.workspace,u,c.offset];
    if(c.entity==='products')return await sql('SELECT t.* FROM sales_products t WHERE t.workspace_id=$1 AND '+guard+' ORDER BY t.active DESC,lower(t.name),t.id LIMIT 500 OFFSET $3',p);
    if(c.entity==='price_books')return await sql('SELECT t.* FROM sales_price_books t WHERE t.workspace_id=$1 AND '+guard+' ORDER BY t.is_default DESC,lower(t.name),t.id LIMIT 500 OFFSET $3',p);
    if(c.entity==='price_book_entries')return await sql('SELECT t.* FROM sales_price_book_entries t WHERE t.workspace_id=$1 AND '+guard+' ORDER BY t.price_book_id,t.product_id LIMIT 5000 OFFSET $3',p);
    if(c.entity==='document_settings')return await sql('SELECT t.* FROM sales_document_settings t WHERE t.workspace_id=$1 AND '+guard,[c.workspace,u]);
    // Dates as text: a driver Date is local midnight and could shift the calendar day.
    const cols='t.*,t.issue_date::text AS issue_date,t.valid_until::text AS valid_until,t.due_date::text AS due_date,t.paid_at::text AS paid_at';
    // Quotes and invoices follow «I member vedono solo i propri record» (api/_sales_visibility.js); products and price books do not.
    if(c.entity==='documents')return await sql('SELECT '+cols+' FROM sales_documents t WHERE t.workspace_id=$1 AND '+guard+vis.and('documents')+(c.kind?' AND t.kind=$4':'')+' ORDER BY t.issue_date DESC,t.created_at DESC,t.id LIMIT 500 OFFSET $3',c.kind?[...p,c.kind]:p);
    const doc=await sql('SELECT '+cols+' FROM sales_documents t WHERE t.workspace_id=$1 AND t.id=$3::uuid AND '+guard+vis.and('documents'),[c.workspace,u,c.id]);
    if(!doc.length)return [];
    const lines=await sql('SELECT l.*,l.quantity::float8 AS quantity FROM sales_document_lines l WHERE l.workspace_id=$1 AND l.document_id=$2::uuid ORDER BY l.position',[c.workspace,c.id]);
    return [{...doc[0],lines}];
   }catch(e){return missing(e)}
  }
 };
}
module.exports={ENTITIES,READS,command,query,createDocumentsStore,lines};
