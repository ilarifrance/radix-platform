/* Plancia (Trasporti) — settings of the company: invoice model (numbering, lines, wording), payment conditions and
   bank accounts. They are chosen once in «Impostazioni» and every invoice takes them, with the conditions of the
   single customer when it has its own. Pure functions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixTrImpostazioni=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// FatturaPA codes of the payment methods a haulier really uses
const PAYMENTS={MP05:'Bonifico bancario',MP12:'Ricevuta bancaria (RiBa)',MP19:'Addebito diretto SEPA (SDD)',MP02:'Assegno',MP01:'Contanti',MP08:'Carta di pagamento'};
const GROUPING={riga:'Una riga per ogni documento di trasporto',viaggio:'Una riga per viaggio',unica:'Una riga sola per il periodo'};
const LINE_PARTS=[['doc','Numero del DDT o CMR'],['date','Data del trasporto'],['route','Tratta'],['goods','Merce'],['weight','Peso'],['plate','Targa del mezzo'],['km','Km fatturati']];
const pad=n=>String(n).padStart(2,'0');
const dmy=s=>s?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'';
const nf=n=>String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g,'.');

function defaults(){
 return {
  invoice:{format:'{n}/{anno}',next_number:null,causale:'Servizi di autotrasporto merci',grouping:'riga',line_prefix:'Trasporto',
   parts:{doc:true,date:true,route:true,goods:true,weight:true,plate:true,km:false},stamp_duty:true,footer:'',accent:'#0F2A44',logo:null,show_bank:true,show_summary:true},
  terms:[{id:'t60',label:'Bonifico a 60 giorni data fattura',payment:'MP05',days:60,eom:false,bank_id:null}],
  default_term:'t60',
  banks:[],
  cdg:{panels:{trend:true,alerts:true,structure:true,kinds:true},views:[],low_pct:8}
 };
}
/* Stored settings completed with the defaults, so a new option never breaks the saved ones. An old company IBAN
   becomes the first bank account. */
function merge(s,company){
 const d=defaults(),x=s||{};
 const out={invoice:{...d.invoice,...(x.invoice||{}),parts:{...d.invoice.parts,...((x.invoice||{}).parts||{})}},
  terms:Array.isArray(x.terms)&&x.terms.length?x.terms:d.terms,default_term:x.default_term||null,banks:Array.isArray(x.banks)?x.banks:[],
  cdg:{panels:{...d.cdg.panels,...((x.cdg||{}).panels||{})},views:((x.cdg||{}).views||[]),low_pct:(x.cdg||{}).low_pct>=0?(x.cdg||{}).low_pct:8}};
 if(!out.terms.some(t=>t.id===out.default_term))out.default_term=out.terms[0].id;
 if(!out.banks.length&&company&&company.iban)out.banks=[{id:'b1',label:'Conto principale',bank:'',iban:String(company.iban).replace(/\s/g,'').toUpperCase(),bic:'',holder:company.name||'',main:true}];
 return out;
}
function ibanOk(v){
 const s=String(v||'').replace(/\s/g,'').toUpperCase();
 if(!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s))return false;
 if(s.startsWith('IT')&&s.length!==27)return false;
 const r=(s.slice(4)+s.slice(0,4)).replace(/[A-Z]/g,c=>String(c.charCodeAt(0)-55));
 let m=0;for(const ch of r)m=(m*10+(+ch))%97;
 return m===1;
}
const ibanFmt=v=>String(v||'').replace(/\s/g,'').toUpperCase().replace(/(.{4})/g,'$1 ').trim();

/* Invoice number from the chosen format: {n} progressive of the year, {nnn} with zeros, {anno}, {aa}. */
function invoiceNumber(format,n,date){
 const y=String(date||'').slice(0,4);
 const f=/\{n+\}/.test(format||'')?format:'{n}/{anno}';
 return f.replace(/\{(n+)\}/g,(_,k)=>String(n).padStart(k.length,'0')).replace(/\{anno\}/g,y).replace(/\{aa\}/g,y.slice(2)).slice(0,20);
}
/* Next progressive: the one set by hand in the settings if it is ahead, else the invoices of the year + 1. */
function nextProgressive(invoices,date,next){
 const y=String(date||'').slice(0,4);
 const used=(invoices||[]).filter(i=>String(i.date||'').slice(0,4)===y);
 const max=used.reduce((m,i)=>Math.max(m,i.progressive||0),0)||used.length;
 return Math.max(max+1,next>0?Math.floor(next):1);
}
function dueDate(date,days,eom){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return '';
 let d=new Date(Date.parse(date+'T00:00:00Z')+(days||0)*86400000);
 if(eom)d=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0));
 return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate());
}
/* Payment conditions of an invoice: those of the customer if it has its own, else the default; with the bank account. */
function termsFor(customer,settings){
 const s=settings||defaults();
 const t=s.terms.find(x=>x.id===(customer&&customer.term_id))||s.terms.find(x=>x.id===s.default_term)||s.terms[0]||{payment:'MP05',days:60};
 const bank=s.banks.find(b=>b.id===t.bank_id)||s.banks.find(b=>b.main)||s.banks[0]||null;
 return {term:t,payment:PAYMENTS[t.payment]?t.payment:'MP05',days:t.days>=0?t.days:60,eom:!!t.eom,bank,label:t.label||PAYMENTS[t.payment]||''};
}
function lineDescription(r,inv){
 const p=(inv&&inv.parts)||defaults().invoice.parts,pre=(inv&&inv.line_prefix)||'Trasporto';
 const head=[pre,p.doc&&r.doc?r.doc:null,p.date&&r.date?'del '+dmy(r.date):null].filter(Boolean).join(' ');
 const rest=[p.route&&(r.origin||r.destination)?(r.origin||'?')+' - '+(r.destination||'?'):null,p.goods&&r.goods?r.goods:null,p.weight&&r.weight_kg?nf(r.weight_kg)+' kg':null,p.km&&r.billed_km?nf(r.billed_km)+' km':null,p.plate&&r.plate?'mezzo '+r.plate:null].filter(Boolean);
 return rest.length?head+': '+rest.join(', '):head;
}
/* Rows to invoice → invoice lines, grouped as chosen. A single line never mixes national and international
   transports, because their VAT is different. rows: as RadixTrMargini.invoiceRows, with load_country/delivery_country. */
function invoiceLines(rows,inv){
 const g=(inv&&inv.grouping)||'riga',pre=(inv&&inv.line_prefix)||'Trasporto';
 const ddt=r=>r.doc_kind==='ddt'&&r.doc_number&&/^\d{4}-\d{2}-\d{2}$/.test(r.doc_date||'')?{numero:r.doc_number,data:r.doc_date}:null;
 const one=r=>({description:lineDescription(r,inv),amount_cents:r.amount_cents,load_country:r.load_country||'IT',delivery_country:r.delivery_country||'IT',ddt:ddt(r)});
 if(g==='riga')return (rows||[]).map(one);
 const groups=new Map();
 for(const r of rows||[]){
  const intl=(r.load_country||'IT')!==(r.delivery_country||'IT');
  const key=g==='viaggio'?r.trip_id:(intl?'estero':'italia');
  const x=groups.get(key)||{rows:[],intl};x.rows.push(r);groups.set(key,x);
 }
 return [...groups.values()].map(x=>{
  const f=x.rows[0],sum=x.rows.reduce((s,r)=>s+r.amount_cents,0);
  if(g==='viaggio'){const docs=x.rows.map(r=>r.doc).filter(Boolean);
   return {...one({...f,doc:docs.length>1?docs.length+' documenti ('+docs.slice(0,6).join(', ')+(docs.length>6?'…':'')+')':f.doc,goods:x.rows.length>1?'':f.goods,weight_kg:x.rows.reduce((s,r)=>s+(+r.weight_kg||0),0)||''}),amount_cents:sum,ddt:x.rows.length===1?ddt(f):null};}
  const days=x.rows.map(r=>r.date).sort(),trips=new Set(x.rows.map(r=>r.trip_id)).size;
  return {description:pre+(x.intl?' internazionali':'')+' dal '+dmy(days[0])+' al '+dmy(days[days.length-1])+': '+trips+(trips===1?' viaggio':' viaggi')+', come da documenti di trasporto',amount_cents:sum,load_country:f.load_country||'IT',delivery_country:f.delivery_country||'IT',ddt:null};
 });
}
return {PAYMENTS,GROUPING,LINE_PARTS,defaults,merge,ibanOk,ibanFmt,invoiceNumber,nextProgressive,dueDate,termsFor,lineDescription,invoiceLines};
});
