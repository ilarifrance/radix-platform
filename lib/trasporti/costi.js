/* Plancia (Trasporti) — costs loaded automatically for the management accounts.
   - Supplier invoices: the FatturaPA XML from the SdI (or the "cassetto fiscale") is read here, exactly, without AI;
     a PDF or a photo is read by the AI with the same fields. Every line is classified into a cost item (fuel,
     tolls, tyres, workshop, leasing, insurance…) from its words and from what the office chose before for that
     supplier, and tied to a vehicle when its plate is written on the line (fuel cards, workshops, leasing).
   - Payslips (also the whole monthly "LUL" PDF with every employee): read by the AI, matched to the driver by
     tax code or name, and turned into the cost of the driver for the month: wages and contributions, overtime,
     travel allowances.
   - Period of competence: an insurance premium or a yearly road tax is spread over the months it covers, so a
     month's margin carries only its share.
   Amounts in cents. Pure functions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixTrCosti=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

// ---------- what the AI reads (PDF or photo) ----------
const KINDS={
 busta_paga:{label:'Buste paga',name:'busta paga (cedolino) o Libro Unico del Lavoro di un dipendente',fields:[
  ['dipendente','Cognome e nome del dipendente','text'],['codice_fiscale','Codice fiscale del dipendente','text'],['mese','Mese di retribuzione (AAAA-MM)','month'],
  ['qualifica','Qualifica o mansione','text'],['ore_ordinarie','Ore ordinarie','number'],['ore_straordinario','Ore di straordinario','number'],
  ['lordo','Totale competenze lorde (€)','money'],['straordinari','Importo straordinari (€)','money'],['trasferte','Trasferte, diarie e indennità di trasferta (€)','money'],
  ['netto','Netto in busta (€)','money'],['contributi_azienda','Contributi a carico ditta INPS e INAIL (€)','money'],['tfr','Quota TFR del mese (€)','money'],['costo_azienda','Costo totale azienda, se indicato (€)','money']],
  required:['dipendente','mese','lordo'],
  hint:'Nel Libro Unico ogni dipendente ha il suo cedolino: restituisci un elemento per ogni dipendente e mese. Le trasferte (indennità di trasferta Italia o estero, diarie, rimborsi) e gli straordinari vanno anche nei loro campi oltre che nel lordo. contributi_azienda è la parte a carico dell\'azienda (spesso in fondo, "contributi ditta" o nel riepilogo costo), non quella trattenuta al dipendente. Se il costo totale per l\'azienda è scritto, mettilo in costo_azienda.'},
 fattura_acquisto:{label:'Fatture fornitori',name:'fattura di acquisto di un fornitore',fields:[
  ['fornitore','Fornitore (ragione sociale)','text'],['partita_iva','Partita IVA del fornitore','text'],['numero','Numero fattura','text'],['data','Data fattura','date'],
  ['imponibile','Totale imponibile (€)','money'],['iva','Totale IVA (€)','money'],['totale','Totale documento (€)','money'],['periodo','Periodo di riferimento, se indicato (es. dal 01/01/2026 al 31/12/2026)','text']],
  required:['fornitore','numero','data','imponibile'],lines:true,
  hint:'Le righe sono le voci della fattura: descrizione completa (con la targa se c\'è), quantità e importo imponibile della riga. Le schede carburante (DKV, UTA, Q8, Eni…) hanno spesso una riga per rifornimento o per targa: riportale tutte.'}
};
const MAX_PAGES=12;
const pad=n=>String(n).padStart(2,'0');
const MONTHS={gennaio:1,febbraio:2,marzo:3,aprile:4,maggio:5,giugno:6,luglio:7,agosto:8,settembre:9,ottobre:10,novembre:11,dicembre:12,gen:1,feb:2,mar:3,apr:4,mag:5,giu:6,lug:7,ago:8,set:9,ott:10,nov:11,dic:12};
function normMonth(v){
 if(v==null||v==='')return null;const s=String(v).trim().toLowerCase();
 let m=s.match(/^(\d{4})[-/.](\d{1,2})/);if(m&&+m[2]>=1&&+m[2]<=12)return m[1]+'-'+pad(+m[2]);
 m=s.match(/^(\d{1,2})[-/.](\d{4})$/);if(m&&+m[1]>=1&&+m[1]<=12)return m[2]+'-'+pad(+m[1]);
 m=s.match(/([a-z]+)\s*(\d{4})/);if(m&&MONTHS[m[1]]&&!/^\d/.test(m[1]))return m[2]+'-'+pad(MONTHS[m[1]]);
 return null;
}
function normalize(DOC,type,v){return type==='month'?normMonth(v):DOC.normalize(type,v);}

function instructions(kind,first,count){
 const k=KINDS[kind];if(!k)throw new Error('Tipo non riconosciuto.');
 const list=k.fields.map(([key,label,type])=>'- '+key+': '+label+' ('+({date:'AAAA-MM-GG',month:'AAAA-MM',number:'numero',money:'euro, numero'}[type]||'testo')+')').join('\n');
 return 'Queste sono le pagine da '+first+' a '+(first+count-1)+' di un PDF con uno o più documenti: '+k.name+'.\n'
  +'Rispondi SOLO con JSON in questa forma: {"documenti":[{"pagine":[numeri di pagina],"campi":{"<chiave>":{"valore":<valore o null>,"sicurezza":"alta"|"media"|"bassa"}}'+(k.lines?',"righe":[{"descrizione":"…","quantita":<numero>,"importo":<euro imponibile>}]':'')+'}]}\n'
  +'Chiavi da compilare:\n'+list+'\n'+k.hint+'\n'
  +'Le pagine numerate come nel PDF intero. Regole: copia solo ciò che è scritto; se un dato non c\'è metti null; non indovinare. "sicurezza" bassa se hai dubbi. Pagine che non sono '+k.name+' (copertine, riepiloghi generali) non vanno restituite.';
}
function parseBatch(DOC,kind,raw,first,count){
 const k=KINDS[kind];if(!k)throw new Error('Tipo non riconosciuto.');
 const j=typeof raw==='string'?DOC.extractJson(raw):raw;
 const list=j&&Array.isArray(j.documenti)?j.documenti:j&&j.campi?[j]:[];
 return list.slice(0,200).map(d=>{
  if(!d||typeof d!=='object')return null;
  const src=d.campi&&typeof d.campi==='object'?d.campi:{};const campi={},check=[];
  for(const [key,,type] of k.fields){const f=src[key];const rv=f&&typeof f==='object'&&!Array.isArray(f)?f.valore:f;const v=normalize(DOC,type,rv);campi[key]=v;
   if((f&&f.sicurezza==='bassa')||(rv!=null&&rv!==''&&v==null)||(v==null&&k.required.includes(key)))check.push(key);}
  const pages=(Array.isArray(d.pagine)?d.pagine:[]).map(Number).filter(n=>Number.isInteger(n)&&n>=first&&n<first+count);
  const out={kind,pages,campi,da_controllare:check};
  if(k.lines)out.righe=(Array.isArray(d.righe)?d.righe:[]).slice(0,500).map(r=>({description:DOC.normalize('text',r&&r.descrizione)||'',qty:DOC.normalize('number',r&&r.quantita),amount_cents:moneyCents(DOC.normNumber(r&&r.importo))})).filter(r=>r.description||r.amount_cents);
  return out;
 }).filter(Boolean);
}
const moneyCents=n=>n==null||!Number.isFinite(n)?null:Math.round(n*100);

// ---------- FatturaPA XML (from the SdI), read exactly ----------
const unxml=s=>String(s??'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n)).replace(/&amp;/g,'&').trim();
const blocks=(x,tag)=>{const re=new RegExp('<(?:[\\w-]+:)?'+tag+'\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?'+tag+'>','g');const out=[];let m;while((m=re.exec(x)))out.push(m[1]);return out;};
const one=(x,tag)=>{const b=blocks(x||'',tag);return b.length?unxml(b[0].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')):null;};
/* text of a .xml or of a signed .xml.p7m (the XML sits inside the signature envelope as plain bytes; long files
   can be cut into chunks with a few binary bytes in between, which are removed) */
function xmlText(input){
 let s=typeof input==='string'?input:latin1(input),bin=typeof input!=='string';
 const a=s.search(/<\?xml|<(?:[\w-]+:)?FatturaElettronica[\s>]/),endRe=/<\/(?:[\w-]+:)?FatturaElettronica>/g;let b=-1,m;while((m=endRe.exec(s)))b=m.index+m[0].length;
 if(a<0||b<0)return null;
 s=s.slice(a,b);
 // chunk boundaries of a DER octet string: 0x04 + length bytes between two pieces of text
 if(/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(s))s=s.replace(/\x04\x82[\s\S]{2}|\x04\x81[\s\S]|[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
 // bytes read as Latin-1: when the file is UTF-8 (the usual case) fix the accented letters
 if(bin&&!/encoding=["']ISO-8859-1/i.test(s.slice(0,100))){try{s=decodeURIComponent(escape(s));}catch{}}
 return s;
}
function latin1(bytes){const u=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);let s='';for(let i=0;i<u.length;i+=8192)s+=String.fromCharCode.apply(null,u.subarray(i,i+8192));return s;}
function parseFatturaXml(input){
 const x=xmlText(input);if(!x)return {error:'Non è una fattura elettronica (XML FatturaPA).'};
 const ced=blocks(x,'CedentePrestatore')[0]||'';const ana=blocks(ced,'Anagrafica')[0]||'';
 const name=one(ana,'Denominazione')||[one(ana,'Nome'),one(ana,'Cognome')].filter(Boolean).join(' ')||null;
 const vat=one(blocks(ced,'IdFiscaleIVA')[0]||'','IdCodice'),country=one(blocks(ced,'IdFiscaleIVA')[0]||'','IdPaese')||'IT';
 const ces=blocks(x,'CessionarioCommittente')[0]||'';const buyerVat=one(blocks(ces,'IdFiscaleIVA')[0]||'','IdCodice');
 const bodies=blocks(x,'FatturaElettronicaBody');
 const docs=bodies.map(body=>{
  const gen=blocks(body,'DatiGeneraliDocumento')[0]||'';const type=one(gen,'TipoDocumento')||'TD01';
  const sign=type==='TD04'?-1:1; // credit note
  const lines=blocks(body,'DettaglioLinee').map(l=>({n:+one(l,'NumeroLinea')||null,description:one(l,'Descrizione')||'',qty:num(one(l,'Quantita')),unit:one(l,'UnitaMisura'),amount_cents:sign*Math.round((num(one(l,'PrezzoTotale'))||0)*100),vat_rate:num(one(l,'AliquotaIVA')),natura:one(l,'Natura')}));
  const sums=blocks(body,'DatiRiepilogo').map(r=>({taxable:Math.round((num(one(r,'ImponibileImporto'))||0)*100),tax:Math.round((num(one(r,'Imposta'))||0)*100),vat_rate:num(one(r,'AliquotaIVA')),natura:one(r,'Natura')}));
  const taxable=sums.reduce((a,s)=>a+s.taxable,0)*sign,tax=sums.reduce((a,s)=>a+s.tax,0)*sign;
  const total=num(one(gen,'ImportoTotaleDocumento'));
  const causale=blocks(gen,'Causale').map(c=>unxml(c)).join(' ');
  const period=periodIn(causale+' '+lines.map(l=>l.description).join(' '));
  return {type,credit_note:sign<0,number:one(gen,'Numero'),date:one(gen,'Data'),causale:causale||null,lines,taxable_cents:taxable,vat_cents:tax,total_cents:total!=null?Math.round(total*100)*sign:taxable+tax,period};
 });
 if(!docs.length)return {error:'Fattura senza righe.'};
 return {supplier:{name,vat,country},buyer_vat:buyerVat,documents:docs};
}
const num=s=>{if(s==null||s==='')return null;const n=Number(String(s).trim());return Number.isFinite(n)?n:null;};

// "dal 01/01/2026 al 31/12/2026", "periodo 01.03.2026 - 31.03.2026", "competenza marzo 2026"
function periodIn(text){
 const t=String(text||'');const d='(\\d{1,2})[./-](\\d{1,2})[./-](\\d{2,4})';
 const m=t.match(new RegExp('(?:dal|da|periodo|competenza|validit[aà])?\\s*'+d+'\\s*(?:al|a|-|–|fino al)\\s*'+d,'i'));
 const iso=(dd,mm,yy)=>{let y=+yy;if(y<100)y+=2000;const t2=new Date(Date.UTC(y,+mm-1,+dd));return t2.getUTCMonth()===+mm-1&&t2.getUTCDate()===+dd?y+'-'+pad(+mm)+'-'+pad(+dd):null;};
 if(m){const a=iso(m[1],m[2],m[3]),b=iso(m[4],m[5],m[6]);if(a&&b&&a<=b)return {from:a,to:b};}
 const mm=t.toLowerCase().match(/(?:competenza|mese di|canone)\s+([a-z]+)\s+(\d{4})/);
 if(mm&&MONTHS[mm[1]])return monthPeriod(mm[2]+'-'+pad(MONTHS[mm[1]]));
 return null;
}
function monthPeriod(ym){const [y,m]=ym.split('-').map(Number);const last=new Date(Date.UTC(y,m,0)).getUTCDate();return {from:ym+'-01',to:ym+'-'+pad(last)};}
function addMonths(iso,n){const [y,m,d]=iso.split('-').map(Number);const t=new Date(Date.UTC(y,m-1+n,d));t.setUTCDate(t.getUTCDate()-1);return t.toISOString().slice(0,10);}

// ---------- classification ----------
// first match wins; the words are the ones that appear on Italian invoices of hauliers' suppliers
const RULES=[
 ['adblue',/\bad\s?blue\b|\burea\b/i],
 ['carburante',/gasolio|diesel|gas\s?oil|carburant|rifornim|\bhvo\b|\blng\b|\bgnl\b|benzina|\bdkv\b|\buta\b|\bq8\b|eni\s?station|ip\s?plus/i],
 ['pedaggio',/pedagg|autostrad|telepass|unipolmove|unipol\s?move|\bmove\b.*pedagg|viacard|\bvignett|maut|p[ée]age|peaje|eurovignet|\bgo[- ]?box\b|\bmyto\b|\btoll\b/i],
 ['autista_esterno',/somministrazione|lavoro interinale|personale (in )?(somministr|distacc)|autisti? (a chiamata|esterni|in leasing)|leasing (di )?personale|staff leasing|distacco|con conducente/i],
 ['pneumatici',/pneumatic|gomm(e|ista)|\btyre|\btire|copertoni|ricostruzion.*(gomm|pneum)|equilibratur|convergenz/i],
 ['manutenzione',/officin|ricamb|tagliand|manutenz|riparaz|revisione impianto|carrozzer|lavaggio|olio motore|filtr[oi]\b|frizion|freni|pastigli|elettrauto|soccorso stradale|traino/i],
 ['leasing',/leasing|locazione finanziaria|canone.*(finanz|leasing)|maxicanone|riscatto/i],
 ['noleggio',/noleggio|locazione operativa|\brent(al)?\b/i],
 ['assicurazione',/assicuraz|polizza|premio\s+(rca|annuo|assic)|\brca\b|kasko|furto e incendio|\bcmr\b.*polizz/i],
 ['bollo',/tassa (automobilistica|di possesso)|bollo auto|\bbollo\b.*(mezz|veicol)|revision[ei]\b|tachigraf|cronotachigraf|motorizzazione|\bata[ -]?atp\b|collaudo/i],
 ['subvettore',/\btrasport[oi]\b.*(merc|conto terzi|da .* a )|subvezion|vezione|nolo (camion|autotreno)|servizio di trasporto|autotrasport/i],
 ['trasferte',/albergo|hotel|pernott|ristorant|\bvitto\b|\bpasti?\b|parcheggio (camion|tir)|area di sosta/i],
 ['multe',/sanzion|verbale|contravvenz|\bmulta/i],
 ['generali',/software|consulenz|commercialist|elaborazione (paghe|cedolini)|paghe|telefon|internet|canone (gestionale|software)|cancelleri|affitto|locazione (uffic|immobil|capannone)|energia elettrica|utenz|pulizi|\bpec\b|dominio|notai/i]
];
function classify(text,supplierRule){
 if(supplierRule&&supplierRule.kind)return {kind:supplierRule.kind,why:'come le altre fatture di questo fornitore'};
 const t=String(text||'');
 for(const [kind,re] of RULES)if(re.test(t))return {kind,why:'dalle parole della fattura'};
 return {kind:'altro',why:'da scegliere'};
}
const PLATE_RE=/\b([A-Z]{2})\s?-?(\d{3})\s?-?([A-Z]{2})\b|\b([A-Z]{2})\s?(\d{5})\b/g; // tractors AA123BB, trailers XA12345
function platesIn(text){const out=[];const t=String(text||'').toUpperCase();let m;PLATE_RE.lastIndex=0;while((m=PLATE_RE.exec(t)))out.push(m[1]?m[1]+m[2]+m[3]:m[4]+m[5]);return [...new Set(out)];}
function vehicleIn(text,vehicles){
 const ps=platesIn(text);if(!ps.length)return null;
 for(const v of vehicles||[])if(v.plate&&ps.includes(String(v.plate).toUpperCase()))return v.id;
 return null;
}

/* One supplier invoice → cost proposals: lines with the same item and vehicle are added together.
   inv: {supplier:{name,vat}, number, date, lines:[{description, amount_cents}], taxable_cents, period?, causale?}
   The cost is the taxable amount (VAT is recovered). Lines of 0 € are skipped. */
function invoiceCosts(inv,{vehicles,rules}={}){
 const rule=inv.supplier&&inv.supplier.vat&&rules?rules[String(inv.supplier.vat)]:null;
 const head=[inv.supplier&&inv.supplier.name,inv.causale].filter(Boolean).join(' ');
 const lines=(inv.lines||[]).filter(l=>l.amount_cents);
 const src=lines.length?lines:[{description:inv.causale||'',amount_cents:inv.taxable_cents||0}];
 const by=new Map();
 for(const l of src){
  let c=classify(l.description,rule);if(c.kind==='altro')c=classify(l.description+' '+head,rule);
  const vid=vehicleIn(l.description,vehicles)||(rule&&rule.vehicle_id)||null;
  const k=c.kind+'|'+(vid||'');
  const g=by.get(k)||{kind:c.kind,why:c.why,vehicle_id:vid,amount_cents:0,lines:0,liters:0,descriptions:[]};
  g.amount_cents+=l.amount_cents;g.lines++;g.liters+=litersOf(l);if(g.descriptions.length<3&&l.description)g.descriptions.push(l.description.slice(0,80));
  by.set(k,g);
 }
 // lines that only differ by rounding/extra fees (no words) go with the largest group
 const out=[...by.values()];
 const period=inv.period||suggestPeriod(out.length===1?out[0].kind:null,inv.date);
 return out.map(g=>({kind:g.kind,why:g.why,vehicle_id:g.vehicle_id,amount_cents:g.amount_cents,liters:g.kind==='carburante'&&g.liters>0?Math.round(g.liters*100)/100:null,date:inv.date,period_from:period&&period.from||null,period_to:period&&period.to||null,
  supplier:inv.supplier&&inv.supplier.name||null,supplier_vat:inv.supplier&&inv.supplier.vat||null,doc_number:inv.number||null,
  description:(inv.supplier&&inv.supplier.name?inv.supplier.name+' · ':'')+'fatt. '+(inv.number||'')+(g.descriptions.length?' · '+g.descriptions.join('; '):'')+(g.lines>3?' (+'+(g.lines-3)+' righe)':''),
  source:'fattura',warn:g.kind==='pedaggio'?'I pedaggi li carichi anche dalla scheda Pedaggi: tienili in un posto solo.':g.kind==='carburante'?'Se gli autisti fotografano gli scontrini dei rifornimenti pagati con questa scheda, togli quelli o questa fattura.':null}));
}
// litres of a fuel line: unit LT/L with the quantity, or "lt 500" / "500 litri" in the text
function litersOf(l){
 if(l.qty>0&&/^(lt|l|litri|ltr)\.?$/i.test(String(l.unit||'').trim()))return l.qty;
 const m=String(l.description||'').match(/(?:\b(?:lt|ltr|litri)\.?\s*(\d+(?:[.,]\d+)*))|(?:(\d+(?:[.,]\d+)*)\s*(?:lt|ltr|litri)\b)/i);
 if(!m)return 0;let x=m[1]||m[2];
 // Italian thousands: 1.850 = 1850; decimals with comma: 312,40
 x=/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(x)?x.replace(/\./g,'').replace(',','.'):x.replace(',','.');
 return Number(x)||0;
}
// Yearly items without a written period cover 12 months from the invoice date; the others stay on the date.
function suggestPeriod(kind,date){
 if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
 if(kind==='assicurazione'||kind==='bollo')return {from:date,to:addMonths(date,12)};
 if(kind==='leasing'||kind==='noleggio'||kind==='generali')return monthPeriod(date.slice(0,7));
 return null;
}

// ---------- payslips ----------
const normName=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z ]/g,' ').split(/\s+/).filter(Boolean).sort().join(' ');
function matchDriver(name,cf,drivers){
 const C=String(cf||'').toUpperCase().replace(/\s/g,'');
 if(C)for(const d of drivers||[])if(d.cf&&String(d.cf).toUpperCase()===C)return {id:d.id,how:'codice fiscale'};
 const n=normName(name);if(!n)return null;
 for(const d of drivers||[])if(normName(d.name)===n)return {id:d.id,how:'nome'};
 // "ROSSI MARIO" vs "Mario Rossi Esempio": all words of the shorter one in the other
 const nw=n.split(' ');
 for(const d of drivers||[]){const dw=normName(d.name).split(' ');const [a,b]=nw.length<=dw.length?[nw,dw]:[dw,nw];if(a.length>=2&&a.every(w=>b.includes(w)))return {id:d.id,how:'nome'};}
 return null;
}
/* payslip fields (as read) → the driver's cost of the month, split into items.
   Company cost = costo_azienda when written, else gross pay + employer contributions + TFR. */
function payslipCosts(p,drivers){
 const f=p.campi||p;const month=f.mese;if(!month)return {error:'Manca il mese della busta paga.'};
 const c=x=>x==null?0:Math.round(x*100);
 const gross=c(f.lordo),contr=c(f.contributi_azienda),tfr=c(f.tfr),total=f.costo_azienda!=null?c(f.costo_azienda):gross+contr+tfr;
 if(!total)return {error:'Mancano gli importi della busta paga.'};
 const trav=Math.min(c(f.trasferte),total),over=Math.min(c(f.straordinari),total-trav);
 const per=monthPeriod(month);const who=matchDriver(f.dipendente,f.codice_fiscale,drivers);
 const base={date:per.to,period_from:per.from,period_to:per.to,driver_id:who?who.id:null,matched_by:who?who.how:null,employee:f.dipendente||null,tax_code:f.codice_fiscale||null,source:'busta_paga',doc_number:'busta '+month};
 const rows=[{...base,kind:'stipendio',amount_cents:total-trav-over,description:'Busta paga '+month+' · '+(f.dipendente||'')+' · lordo '+(gross/100).toFixed(2)+', contributi ditta '+(contr/100).toFixed(2)+(tfr?', TFR '+(tfr/100).toFixed(2):'')}];
 if(over)rows.push({...base,kind:'straordinari',amount_cents:over,description:'Straordinari '+month+' · '+(f.dipendente||'')+(f.ore_straordinario?' ('+f.ore_straordinario+' ore)':'')});
 if(trav)rows.push({...base,kind:'trasferte',amount_cents:trav,description:'Trasferte e diarie '+month+' · '+(f.dipendente||'')});
 return {rows,total_cents:total,driver_id:base.driver_id,matched_by:base.matched_by,month,net_cents:c(f.netto)};
}

// The same document loaded twice is recognised: supplier VAT + number, or employee + month.
function docKey(x){
 if(x.source==='busta_paga')return 'bp|'+(x.tax_code||normName(x.employee))+'|'+x.date.slice(0,7);
 if(x.source==='fattura')return 'ft|'+(x.supplier_vat||normName(x.supplier))+'|'+String(x.doc_number||'').replace(/\s/g,'').toUpperCase();
 return null;
}

return {KINDS,MAX_PAGES,RULES,normMonth,instructions,parseBatch,xmlText,parseFatturaXml,periodIn,monthPeriod,addMonths,classify,platesIn,vehicleIn,invoiceCosts,litersOf,suggestPeriod,matchDriver,payslipCosts,docKey,normName};
});
