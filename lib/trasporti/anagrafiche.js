/* Plancia (Trasporti) — anagrafica that fills itself from the documents read: customers (who gave the job: box 16
   carrier when we are the successive carrier, "per conto di", sender), consignees and places of loading and delivery.
   Nothing is created without the office's OK: these are proposals, deduplicated against what already exists.
   VAT numbers found in the text are checked (Italian check digit). Pure functions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixTrAnagrafiche=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\b(s\.?r\.?l\.?s?|s\.?p\.?a\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|sarl|sas|gmbh|ltd|unipersonale|societa|soc|in liquidazione)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const same=(a,b)=>{const x=norm(a),y=norm(b);return !!x&&!!y&&(x===y||(x.length>=5&&y.length>=5&&(x.includes(y)||y.includes(x))));};

// Italian partita IVA: 11 digits with the Luhn-like check digit
function pivaOk(p){
 const s=String(p||'').replace(/^IT/i,'');if(!/^\d{11}$/.test(s)||/^0{11}$/.test(s))return false;
 let t=0;for(let i=0;i<10;i++){let d=+s[i];if(i%2){d*=2;if(d>9)d-=9;}t+=d;}
 return (10-t%10)%10===+s[10];
}
/* VAT numbers in a text: Italian (checked) and EU ones written with the country prefix. */
function vatIn(text){
 const t=String(text||'');const out=[];
 for(const m of t.matchAll(/(?:p\.?\s?iva|partita\s+iva|vat|c\.?\s?f\.?\s*e\s*p\.?\s?iva|cod\.?\s*fisc\.?\s*e\s*p\.?\s?iva)[^0-9A-Z]{0,12}((?:IT)?\s?\d{11})/gi)){const v=m[1].replace(/\s/g,'').replace(/^IT/i,'');if(pivaOk(v))out.push({country:'IT',code:v});}
 for(const m of t.matchAll(/\b(FR|DE|ES|AT|BE|NL|PL|SI|HR|HU|CZ|RO|PT)\s?([0-9A-Z]{8,12})\b/g))out.push({country:m[1],code:m[2]});
 for(const m of t.matchAll(/\bIT\s?(\d{11})\b/g))if(pivaOk(m[1])&&!out.some(x=>x.code===m[1]))out.push({country:'IT',code:m[1]});
 return out;
}
/* "Via Roma 1, 46010 Canneto sull'Oglio (MN)" → parts for the invoice. */
function addressOf(text){
 const t=String(text||'').replace(/\s+/g,' ').trim();if(!t)return null;
 const cap=(t.match(/\b(\d{5})\b/)||[])[1]||null;
 const prov=(t.match(/\(([A-Z]{2})\)/)||t.match(/\b\d{5}\s+[^,]+?\s([A-Z]{2})\b/)||[])[1]||null;
 const country=(t.match(/(?:-|,|\s)\s*(FR|DE|ES|AT|CH|BE|NL|PL|SI|HR|HU|CZ|RO|GR|PT)\s*$/)||[])[1]||(/\b(france|francia)\b/i.test(t)?'FR':'IT');
 let comune=null;if(cap){const m=t.match(new RegExp(cap+'\\s+([^,(\\-]+)'));if(m)comune=m[1].replace(/\s[A-Z]{2}\s*$/,'').trim();}
 const street=cap?t.slice(0,t.indexOf(cap)).replace(/[,\s-]+$/,'').trim()||null:null;
 return {street,cap,comune,provincia:country==='IT'?prov:null,nazione:country,text:t};
}

/* Proposals from confirmed documents and shipments. own = our company name (never proposed). */
function proposals({documents,shipments,customers,consignees,own}){
 const outC=[],outP=[];
 const known=(list,name)=>(list||[]).some(x=>same(x.name,name));
 const addC=(name,why,src,addr,text)=>{
  if(!name||(own&&same(name,own))||known(customers,name))return;
  let p=outC.find(x=>same(x.name,name));
  if(!p){p={name:String(name).split(/\n/)[0].trim().slice(0,200),why,sources:[],address:addressOf(addr),vat:null,count:0};outC.push(p);}
  p.count++;if(src&&!p.sources.includes(src))p.sources.push(src);
  if(!p.vat){const v=vatIn(text||'')[0];if(v)p.vat=v;}
  if(!p.address&&addr)p.address=addressOf(addr);
 };
 const addP=(name,addr,kind,src)=>{
  if(!name&&!addr)return;const key=name||addr;
  if(known(consignees,key))return;
  let p=outP.find(x=>same(x.name,key)&&x.kind===kind);
  if(!p){p={name:String(key).slice(0,200),kind,address:addressOf(addr||name),sources:[],count:0};outP.push(p);}
  p.count++;if(src&&!p.sources.includes(src))p.sources.push(src);
 };
 for(const s of shipments||[]){
  const src=(s.kind||'').toUpperCase()+' '+(s.number||'');
  if(s.customer_hint)addC(s.customer_hint,s.customer_why||'committente',src,null,'');
  if(s.consignee)addP(s.consignee,s.delivery_place,'destinatario',src);
 }
 for(const d of documents||[]){
  if(!['ddt','cmr'].includes(d.kind)||!d.fields)continue;const f=d.fields,src=d.kind.toUpperCase()+' '+(f.numero||'');
  const text=Object.values(f).filter(v=>typeof v==='string').join(' \n ');
  if(f.vettore&&own&&!same(f.vettore,own)&&(!f.vettore_successivo||same(f.vettore_successivo,own)))addC(f.vettore,'vettore che ci ha dato il trasporto',src,null,text);
  if(f.per_conto_di)addC(f.per_conto_di,'per conto di',src,null,text);
  if(f.mittente)addC(f.mittente,'mittente',src,f.mittente_indirizzo,text);
  if(f.destinatario)addP(f.destinatario,f.destinatario_indirizzo||f.luogo_scarico,'destinatario',src);
  if(f.luogo_carico)addP(null,f.luogo_carico,'carico',src);
 }
 return {customers:outC.sort((a,b)=>b.count-a.count),places:outP.sort((a,b)=>b.count-a.count)};
}

return {norm,same,pivaOk,vatIn,addressOf,proposals};
});
