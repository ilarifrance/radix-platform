/* Plancia (Trasporti) — a whole scanned bundle ("pratica"), as transport offices really keep them: one PDF with the
   contract, the CMR (often two or three copies of the same CMR: for the consignee, for the carrier), the weighing
   ticket stuck on top, the carnet de route of live animals over five pages, the health certificate, for one or more
   consignments of the same truck.
   The pages are read in batches by the AI, which says for each document its kind, its pages and its fields. Here:
   - the instructions for one batch, and the check of what comes back (lib/trasporti/documenti for each document);
   - merging batches: a document cut by the batch boundary is joined, copies of the same CMR become one document
     (the most complete reading wins, the pages of the copies are kept);
   - grouping documents into consignments by the numbers they share (contract number in the carnet, health
     certificate in box 5 of the CMR), so each CMR becomes one shipment with its own consignee, delivery and lines.
   Pure functions. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./documenti'):root.RadixTrDocumenti);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixTrPratiche=api})(typeof globalThis!=='undefined'?globalThis:this,function(DOC){
'use strict';

const KINDS=['cmr','ddt','giornale','contratto','conferma','pesata','carburante'];
const OTHER={certificato:'Certificato sanitario',altro:'Altro documento'};
const label=k=>DOC.KINDS[k]?DOC.KINDS[k].label:OTHER[k]||k;
const MAX_PAGES=12;

function instructions(first,count){
 const list=KINDS.map(k=>{const K=DOC.KINDS[k];return '- "'+k+'" ('+K.name+'): '+K.fields.map(f=>f[0]).join(', ')+(K.lines?', righe':'');}).join('\n');
 return 'Queste sono le pagine da '+first+' a '+(first+count-1)+' di un PDF scansionato da un\'azienda di autotrasporto: una o più pratiche di viaggio. '
  +'Le immagini sono in ordine, una per pagina, a partire da pagina '+first+'.\n'
  +'Individua ogni documento. Un documento può occupare più pagine (il giornale di viaggio animali ha 5 sezioni); una pagina può contenerne due (uno scontrino di pesata incollato sopra una CMR). '
  +'Le copie dello stesso documento (esemplare 1, 2, 3 della stessa CMR, stesso numero) vanno indicate come documenti separati con "copia":true dalla seconda in poi.\n'
  +'Tipi e chiavi dei campi:\n'+list+'\n- "certificato" (certificato sanitario o TRACES): numero, data\n- "altro": descrizione\n'
  +'Rispondi SOLO con JSON: {"documenti":[{"tipo":"cmr","pagine":['+first+'],"copia":false,"continua":false,"campi":{"<chiave>":{"valore":<valore o null>,"sicurezza":"alta"|"media"|"bassa"}},"note":null}]}\n'
  +'"continua":true se il documento è iniziato in una pagina precedente a questo gruppo (es. sezioni 2-5 di un giornale). '
  +'Per CMR e DDT con una tabella di merci aggiungi "righe": [{"colli":..,"imballaggio":..,"descrizione":"merce o mittente originario","ddt":"numero DDT","data":"AAAA-MM-GG","peso_kg":..}]. '
  +'Date in AAAA-MM-GG, date con ora in AAAA-MM-GG HH:MM, numeri senza unità, targhe senza spazi. Copia solo ciò che è scritto, anche a mano; se non si legge metti null e sicurezza bassa. Non inventare.';
}

const extract=t=>DOC.extractJson(t);
// One batch answer → documents with normalised fields (pages are absolute page numbers of the PDF).
function parseBatch(raw,first,count){
 const j=typeof raw==='string'?extract(raw):raw;
 const list=j&&Array.isArray(j.documenti)?j.documenti:[];
 const out=[];
 for(const d of list.slice(0,60)){
  if(!d||typeof d!=='object')continue;
  const kind=KINDS.includes(d.tipo)?d.tipo:d.tipo==='certificato'?'certificato':'altro';
  const pages=(Array.isArray(d.pagine)?d.pagine:[d.pagine]).map(Number).filter(n=>Number.isInteger(n)&&n>=first&&n<first+count);
  const doc={kind,pages:pages.length?[...new Set(pages)].sort((a,b)=>a-b):[first],copy:d.copia===true,continues:d.continua===true,note:typeof d.note==='string'?d.note.slice(0,300):null};
  if(DOC.KINDS[kind]){const r=DOC.parseReading(kind,{leggibile:true,campi:d.campi||{}});doc.fields=r.campi;doc.check=r.da_controllare;if(r.righe)doc.lines=r.righe;}
  else{const c=d.campi||{};const v=k=>{const x=c[k];return x&&typeof x==='object'?x.valore:x;};doc.fields={numero:v('numero')!=null?String(v('numero')).slice(0,80):null,data:DOC.normDate(v('data')),descrizione:v('descrizione')!=null?String(v('descrizione')).slice(0,300):null};doc.check=[];}
  out.push(doc);
 }
 if(!j)return {documents:[],error:'Risposta della lettura non valida per le pagine '+first+'-'+(first+count-1)+'.'};
 return {documents:out,error:null};
}

const key=s=>s==null?null:String(s).toUpperCase().replace(/[^A-Z0-9]/g,'')||null;
const filled=d=>Object.values(d.fields||{}).filter(v=>v!=null).length+(d.lines?d.lines.length:0);

/* Batches → one list. A "continues" document joins the previous document of the same kind; copies (same kind and
   number, or marked copy) collapse into the most complete reading, keeping all pages in copy_pages. */
function merge(batches){
 const docs=[];
 for(const b of batches)for(const d of b){
  const prev=docs[docs.length-1];
  if(d.continues&&prev&&prev.kind===d.kind){prev.pages=[...new Set(prev.pages.concat(d.pages))].sort((a,b)=>a-b);for(const [k,v] of Object.entries(d.fields||{}))if(prev.fields[k]==null&&v!=null)prev.fields[k]=v;continue;}
  docs.push({...d,fields:{...d.fields},copy_pages:[]});
 }
 const out=[];
 for(const d of docs){
  const n=key(d.fields&&d.fields.numero);
  const same=n&&out.find(o=>o.kind===d.kind&&key(o.fields.numero)===n);
  if(same){
   const best=filled(d)>filled(same)?d:same,other=best===d?same:d;
   const merged={...best,fields:{...best.fields},copy_pages:[...new Set(same.copy_pages.concat(other.pages,d.copy_pages))].sort((a,b)=>a-b)};
   for(const [k,v] of Object.entries(other.fields||{}))if(merged.fields[k]==null&&v!=null)merged.fields[k]=v; // a stamp read only on one copy (box 24) still counts
   if((!merged.lines||!merged.lines.length)&&other.lines&&other.lines.length)merged.lines=other.lines;
   merged.pages=best.pages;merged.check=(best.check||[]).filter(k=>merged.fields[k]==null||!other.fields||other.fields[k]==null);
   out[out.indexOf(same)]=merged;continue;
  }
  out.push(d);
 }
 return out.map((d,i)=>({...d,id:'d'+(i+1)}));
}

// Numbers a document shares with the others of its consignment.
function keysOf(d){
 const f=d.fields||{},ks=new Set();
 const add=v=>{const k=key(v);if(k&&k.length>=5){ks.add(k);for(const m of k.match(/\d{6,}/g)||[])ks.add(m);}};
 if(d.kind!=='cmr'&&d.kind!=='ddt')add(f.numero);
 add(f.certificato_sanitario);
 if(d.kind==='certificato')add(f.numero);
 if(f.documenti_allegati)for(const part of String(f.documenti_allegati).split(/[\/,;]/))add(part);
 return ks;
}
// "2125 BRCAM 106" in box 5 of a CMR written together with the certificate number, "2125BRCAM 106" in the carnet:
// equal, or one contains the other when both are long enough to be a document number.
function share(a,b){for(const x of a)for(const y of b){if(x===y)return true;if(Math.min(x.length,y.length)>=8&&(x.includes(y)||y.includes(x)))return true;}return false;}

/* Documents → consignments. Documents sharing a number are together; one CMR or DDT per consignment; a document
   with nothing in common goes with the nearest consignment before it in the PDF (it was scanned with it). */
function group(docs){
 const g=docs.map((d,i)=>({docs:[d],keys:keysOf(d),first:Math.min(...d.pages),idx:i}));
 const main=x=>x.docs.filter(d=>d.kind==='cmr'||d.kind==='ddt');
 let changed=true;
 while(changed){changed=false;
  for(let i=0;i<g.length&&!changed;i++)for(let j=i+1;j<g.length&&!changed;j++){
   if(!share(g[i].keys,g[j].keys))continue;
   if(main(g[i]).length&&main(g[j]).length)continue;
   g[i].docs.push(...g[j].docs);for(const k of g[j].keys)g[i].keys.add(k);g[i].first=Math.min(g[i].first,g[j].first);g.splice(j,1);changed=true;
  }}
 // loose documents (no shared number) attach to the consignment with a CMR/DDT closest before them in page order
 const anchored=g.filter(x=>main(x).length),loose=g.filter(x=>!main(x).length&&!x.keys.size);
 for(const l of loose){
  const before=anchored.filter(a=>a.first<=l.first).sort((a,b)=>b.first-a.first)[0]||anchored.slice().sort((a,b)=>a.first-b.first)[0];
  if(before){before.docs.push(...l.docs);g.splice(g.indexOf(l),1);}
 }
 return g.sort((a,b)=>a.first-b.first).map((x,i)=>({id:'s'+(i+1),documents:x.docs.sort((a,b)=>a.pages[0]-b.pages[0])}));
}

const sumLines=(lines,k)=>{const v=(lines||[]).map(l=>l[k]).filter(x=>x!=null);return v.length?v.reduce((a,b)=>a+b,0):null;};
const pick=(...v)=>{for(const x of v)if(x!=null&&x!=='')return x;return null;};
/* A consignment → the shipment the office confirms: who, where, when delivered, how much (pallets, animals, kg). */
const normName=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\b(srl|spa|sas|sarl|snc|s\.?r\.?l\.?|autotrasporti|trasporti|logistica|logistics)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const sameName=(a,b)=>{const x=normName(a),y=normName(b);return !!x&&!!y&&(x.includes(y)||y.includes(x));};
/* Who to invoice. When the CMR names another carrier in box 16 and we are the successive carrier (box 17), that carrier
   gave us the job (a broker like Broad): it is the customer, not the sender. Otherwise "per conto di", box 13, sender. */
function customerOf(f,kf,gf,own){
 if(own&&f.vettore&&!sameName(f.vettore,own)&&(!f.vettore_successivo||sameName(f.vettore_successivo,own)))return {name:f.vettore,why:'vettore in casella 16 (siamo subvettori)'};
 if(f.per_conto_di)return {name:f.per_conto_di,why:'per conto di'};
 const n=pick(f.istruzioni&&/[a-z]{3,}.*\b(srl|spa|sas|sarl|gmbh|ltd|sa)\b/i.test(f.istruzioni)?f.istruzioni:null,f.mittente,kf.venditore,gf.organizzatore);
 return n?{name:n,why:f.mittente===n?'mittente':'documento'}:null;
}
function shipmentOf(c,own){
 const d=k=>c.documents.find(x=>x.kind===k);
 const m=d('cmr')||d('ddt'),g=d('giornale'),k=d('contratto'),p=d('pesata');
 const f=m?m.fields:{},gf=g?g.fields:{},kf=k?k.fields:{},pf=p?p.fields:{};
 const lines=m&&m.lines||[];
 const warnings=[];const cust=customerOf(f,kf,gf,own);
 if(!m)warnings.push('Manca la CMR o il DDT di questa spedizione.');
 if(m&&!f.consegna_data)warnings.push('Consegna non firmata nella casella 24: da verificare prima di fatturare.');
 const heads=pick(gf.animali_idonei_arrivo,gf.numero_animali,kf.capi);
 if(g&&kf.capi!=null&&gf.numero_animali!=null&&kf.capi!==gf.numero_animali)warnings.push('Capi diversi tra contratto ('+kf.capi+') e giornale di viaggio ('+gf.numero_animali+').');
 if(gf.animali_morti)warnings.push(gf.animali_morti+' animali morti o feriti segnalati nel giornale di viaggio.');
 if(f.riserve)warnings.push('Riserve del vettore: '+f.riserve);
 return {id:c.id,kind:m?m.kind:'altro',number:m?f.numero:pick(kf.numero,gf.numero),
  sender:pick(f.mittente,kf.venditore,gf.organizzatore),consignee:pick(f.destinatario,kf.acquirente),
  customer_hint:(cust||{}).name||null,customer_why:(cust||{}).why||null,per_conto_di:f.per_conto_di||null,
  load_place:pick(f.luogo_carico,gf.luogo_partenza),load_date:pick(f.data_presa_in_carico,f.data,(gf.partenza||'').slice(0,10)||null,kf.data),
  delivery_place:pick(f.luogo_scarico,gf.luogo_destinazione,kf.destinazione),delivered_at:pick(f.consegna_data,(gf.arrivo_effettivo||'').slice(0,10)||null),
  received_by:f.consegna_ricevuto_da||null,reserves:f.riserve||null,
  plate:pick(f.targa,gf.targa,pf.targa),trailer:pick(f.targa_rimorchio,gf.targa_rimorchio),
  pallets:pick(f.pallet,lines.length?sumLines(lines,'colli'):null),packages:f.colli??null,
  animals:pick(heads,f.numero_capi),species:pick(gf.specie,f.specie,kf.qualita),animal_ref:f.modello_4||null,
  weight_kg:pick(pf.peso_netto_kg,f.peso_kg,sumLines(lines,'peso_kg'),gf.peso_stimato_kg),
  lines,documents:c.documents.map(x=>({id:x.id,kind:x.kind,label:label(x.kind),number:x.fields&&x.fields.numero||null,pages:x.pages,copy_pages:x.copy_pages||[]})),warnings};
}

function pageBatches(total,size=MAX_PAGES){const out=[];for(let p=1;p<=total;p+=size)out.push({first:p,count:Math.min(size,total-p+1)});return out;}

return {KINDS,instructions,parseBatch,merge,group,shipmentOf,customerOf,sameName,keysOf,pageBatches,label,MAX_PAGES};
});
