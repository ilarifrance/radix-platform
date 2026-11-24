/* RADIX Trasporti — reading of transport documents photographed by the driver (DDT, CMR, giornale di viaggio for
   live animals, fuel receipt). This file holds the fields of each kind, the instructions given to the AI and the
   check of what the AI returns: dates, numbers and plates are normalised, a field the AI was unsure about or could
   not read is marked "da controllare". Nothing is invented: an unreadable field stays empty. Pure functions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixTrDocumenti=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

// type: text | date | datetime | number | int | plate | money | country
const COMMON=[
 ['numero','Numero documento','text'],['data','Data','date'],
 ['mittente','Mittente','text'],['mittente_indirizzo','Indirizzo mittente','text'],
 ['destinatario','Destinatario','text'],['destinatario_indirizzo','Indirizzo destinatario','text'],
 ['luogo_carico','Luogo di carico','text'],['luogo_scarico','Luogo di scarico','text'],
 ['merce','Merce','text'],['colli','Colli','int'],['peso_kg','Peso (kg)','number'],
 ['targa','Targa','plate'],['vettore','Vettore','text']
];
const KINDS={
 ddt:{label:'DDT',name:'Documento di trasporto (DDT)',fields:[...COMMON,['causale','Causale del trasporto','text'],['aspetto_beni','Aspetto dei beni','text'],['porto','Porto (franco/assegnato)','text'],['per_conto_di','Spedizione per conto di (committente)','text'],['data_ora_ritiro','Data e ora inizio trasporto','datetime'],['targa_rimorchio','Targa rimorchio','plate'],
  ['specie','Animali vivi: specie','text'],['numero_capi','Animali vivi: numero di capi','int'],['modello_4','Animali vivi: Mod. 4 / codice ciclo','text'],['consegna_data','Data di consegna (firma del destinatario)','date'],['consegna_ricevuto_da','Ricevuto da (timbro o nome)','text']],required:['numero','data','mittente','destinatario'],lines:true},
 // CMR as they really are: groupage with one line per original sender/DDT, totals, box 13 (who gave the order),
 // box 24 (delivery signed: the proof of delivery), tractor and trailer plates.
 cmr:{label:'CMR',name:'Lettera di vettura internazionale (CMR)',fields:[...COMMON,['targa_rimorchio','Targa rimorchio','plate'],['paese_carico','Paese di carico','country'],['paese_scarico','Paese di scarico','country'],['data_presa_in_carico','Data presa in carico (casella 4)','date'],
  ['pallet','Totale pallet','int'],['documenti_allegati','Documenti allegati (casella 5)','text'],['istruzioni','Istruzioni del mittente (casella 13)','text'],['pagamento','Porto (franco / non franco)','text'],['per_conto_di','Per conto di (c/o, committente indicato)','text'],['vettore_successivo','Vettore successivo (casella 17)','text'],['riserve','Riserve del vettore (casella 18)','text'],
  ['consegna_data','Data di consegna (casella 24)','date'],['consegna_ricevuto_da','Ricevuto da (timbro casella 24)','text']],required:['numero','mittente','destinatario','luogo_carico','luogo_scarico'],lines:true},
 // EU journey log for live animals (carnet de route, Reg. CE 1/2005): planning, departure, destination, transporter.
 giornale:{label:'Giornale di viaggio',name:'Giornale di viaggio animali vivi (carnet de route, Reg. CE 1/2005)',fields:[
  ['numero','Numero del giornale','text'],['certificato_sanitario','N. certificato sanitario / TRACES','text'],['organizzatore','Organizzatore','text'],['trasportatore','Trasportatore','text'],
  ['autorizzazione_trasportatore','N. autorizzazione trasportatore','text'],['conducente','Conducente','text'],['specie','Specie','text'],['numero_animali','Numero di animali','int'],['peso_stimato_kg','Peso stimato del lotto (kg)','number'],
  ['luogo_partenza','Luogo di partenza','text'],['partenza','Data e ora di partenza','datetime'],
  ['luogo_destinazione','Luogo di destinazione','text'],['arrivo_previsto','Arrivo previsto','datetime'],['arrivo_effettivo','Arrivo effettivo (sezione 4)','datetime'],['durata_ore','Durata prevista (ore)','number'],
  ['targa','Targa','plate'],['targa_rimorchio','Targa rimorchio','plate'],['animali_idonei_arrivo','Animali idonei all\'arrivo (sezione 3)','int'],['animali_morti','Animali morti o feriti','int']],required:['specie','numero_animali','luogo_partenza','luogo_destinazione','partenza']},
 contratto:{label:'Contratto',name:'Contratto di compravendita (bestiame o merce)',fields:[
  ['numero','Numero contratto','text'],['data','Data di carico','date'],['venditore','Venditore','text'],['acquirente','Acquirente','text'],['destinazione','Destinazione','text'],
  ['capi','Numero di capi o colli','int'],['qualita','Qualità / descrizione','text'],['razza','Razza','text'],['resa','Resa (franco destino, franco partenza…)','text']],required:['numero','venditore','acquirente']},
 pesata:{label:'Pesata',name:'Scontrino di pesatura (bilancia a ponte)',fields:[
  ['data','Data','date'],['targa','Targa','plate'],['peso_entrata_kg','Peso in entrata (kg)','number'],['peso_uscita_kg','Peso in uscita (kg)','number'],['peso_netto_kg','Peso netto (kg)','number'],['pesatore','Pesa (chi ha pesato)','text']],required:['peso_netto_kg']},
 carburante:{label:'Rifornimento',name:'Scontrino o ricevuta di rifornimento',fields:[
  ['data','Data','date'],['ora','Ora','text'],['distributore','Distributore','text'],['prodotto','Prodotto','text'],
  ['litri','Litri','number'],['prezzo_litro','Prezzo al litro (€)','money'],['importo','Importo (€)','money'],
  ['km','Km contachilometri','int'],['targa','Targa','plate']],required:['data','litri','importo']},
 // order confirmation sent by the forwarder (conferma d'ordine, ordre de transport, transport order): the agreed price of the trip
 conferma:{label:'Conferma d\'ordine',name:'Conferma d\'ordine di trasporto dello spedizioniere (ordine di carico, ordre de transport, transport order)',fields:[
  ['numero','Numero ordine / riferimento','text'],['data','Data dell\'ordine','date'],['committente','Committente (spedizioniere che dà l\'ordine)','text'],
  ['luogo_carico','Luogo di carico','text'],['data_carico','Data di carico','date'],['luogo_scarico','Luogo di scarico','text'],['data_scarico','Data di scarico','date'],
  ['merce','Merce','text'],['pallet','Pallet','int'],['numero_capi','Animali vivi: numero di capi','int'],['peso_kg','Peso (kg)','number'],
  ['importo','Prezzo concordato (€, senza IVA)','money'],['pagamento','Condizioni di pagamento','text'],['targa','Targa','plate'],['note','Note e istruzioni','text']],required:['luogo_carico','luogo_scarico','importo']},
 // other expenses of the trip paid by the driver or with the company card: they go to the costs of the trip
 spesa:{label:'Spesa',name:'Ricevuta o scontrino di una spesa di viaggio (parcheggio, pernottamento, pasto, lavaggio, pedaggio estero, AdBlue, piccola riparazione)',fields:[
  ['tipo','Tipo di spesa (parcheggio, pernottamento, pasto, lavaggio, pedaggio, adblue, riparazione, altro)','text'],['data','Data','date'],['esercente','Esercente','text'],
  ['importo','Importo (€)','money'],['descrizione','Descrizione','text'],['pagamento','Pagata con (contanti dell\'autista, carta aziendale…)','text'],['targa','Targa','plate']],required:['data','importo']}
};
// expense type written by the driver or read by the AI → cost item of the management accounts
function expenseKind(tipo){
 const t=String(tipo||'').toLowerCase();
 if(/pedagg|autostrad|vignett|maut|p[ée]age|peaje/.test(t))return 'pedaggio';
 if(/ad\s?blue|urea/.test(t))return 'adblue';
 if(/lavagg|ripara|officin|gomm|ricamb/.test(t))return 'manutenzione';
 if(/parchegg|sosta|pernott|hotel|albergo|pasto|pranzo|cena|ristor|vitto|doccia/.test(t))return 'trasferte';
 return 'altro';
}
// Lines of a CMR or DDT (groupage): one per original sender or DDT.
const LINE_FIELDS=[['colli','int'],['imballaggio','text'],['descrizione','text'],['ddt','text'],['data','date'],['peso_kg','number']];
// What the driver photographs one at a time (the others come from the office's scanned bundles).
const PHOTO_KINDS=['ddt','cmr','giornale','carburante','spesa'];
const KIND_KEYS=Object.keys(KINDS);

const pad=n=>String(n).padStart(2,'0');
function normDate(v){
 if(v==null||v==='')return null;const s=String(v).trim();
 let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(m)return valid(+m[1],+m[2],+m[3]);
 m=s.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})$/);if(m){let y=+m[3];if(y<100)y+=2000;return valid(y,+m[2],+m[1]);}
 return null;
 function valid(y,mo,d){const t=new Date(Date.UTC(y,mo-1,d));return t.getUTCFullYear()===y&&t.getUTCMonth()===mo-1&&t.getUTCDate()===d&&y>=2000&&y<=2100?y+'-'+pad(mo)+'-'+pad(d):null;}
}
function normDateTime(v){
 if(v==null||v==='')return null;const s=String(v).trim();
 const m=s.match(/^(.+?)[ T,]+(\d{1,2})[:.](\d{2})/);
 if(m){const d=normDate(m[1]);const h=+m[2],mi=+m[3];return d&&h<24&&mi<60?d+'T'+pad(h)+':'+pad(mi):null;}
 const d=normDate(s);return d?d+'T00:00':null;
}
// "1.250,50" (Italian), "1,250.50", "1250.5", "1250 kg" → number
function normNumber(v){
 if(typeof v==='number')return Number.isFinite(v)?v:null;
 if(v==null||v==='')return null;let s=String(v).replace(/[^\d,.\-]/g,'');if(!/\d/.test(s))return null;
 const c=s.lastIndexOf(','),p=s.lastIndexOf('.');
 if(c>-1&&p>-1)s=c>p?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
 else if(c>-1)s=/,\d{3}$/.test(s)&&(s.match(/,/g)||[]).length>1?s.replace(/,/g,''):s.replace(',','.');
 else if((s.match(/\./g)||[]).length>1||/^\d{1,3}\.\d{3}$/.test(s))s=s.replace(/\./g,'');
 const n=Number(s);return Number.isFinite(n)?n:null;
}
const normPlate=v=>{if(v==null||v==='')return null;const s=String(v).toUpperCase().replace(/[^A-Z0-9]/g,'');return s.length>=4&&s.length<=10?s:null;};
const ITALIAN_PLATE=/^[A-Z]{2}\d{3}[A-Z]{2}$/;
function normalize(type,v){
 switch(type){
  case 'date':return normDate(v);
  case 'datetime':return normDateTime(v);
  case 'number':{const n=normNumber(v);return n!=null&&n>=0?n:null;}
  case 'int':{const n=normNumber(v);return n!=null&&n>=0?Math.round(n):null;}
  case 'money':{const n=normNumber(v);return n!=null&&n>=0?Math.round(n*100)/100:null;}
  case 'plate':return normPlate(v);
  case 'country':{if(v==null||v==='')return null;const s=String(v).trim();return s.length>60?s.slice(0,60):s;}
  default:{if(v==null)return null;const s=String(v).replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim();return s?s.slice(0,300):null;}
 }
}

// Where things really are on the documents seen so far (CMR IRU, Italian DDT incl. live pigs): the AI reads better with it.
const HINTS={
 cmr:'Caselle CMR: 1 mittente (se c\'è "c/o" o "per conto", metti il nome dopo c/o in mittente e l\'altro in per_conto_di), 2 destinatario, 3 luogo di consegna, 4 luogo e data di presa in carico, 5 documenti allegati (DDT, riferimenti), 6-12 righe merce (colli, imballaggio, descrizione, peso lordo), 13 istruzioni, 14 franco/non franco, 16 vettore (chi ha dato il trasporto: va in "vettore"), 17 vettore successivo, 18 riserve, 21 luogo e data di compilazione, 23 timbro del vettore (spesso contiene targa motrice e rimorchio), 24 merce ricevuta: timbro, firma e data del destinatario (anche "reçu le"); "sous réserve" va in riserve. Molti campi sono scritti a mano o con timbri storti.',
 ddt:'Nel DDT: numero e data in alto, mittente/cedente, destinatario/cessionario e luogo di destinazione, causale, porto, aspetto dei beni, colli e peso in fondo, vettore con eventuale timbro e targhe, firma del destinatario. "Merce caricata/spedita per conto di" va in per_conto_di. Per animali vivi (suini, bovini…) compila specie, numero_capi (capi), peso e il numero del Mod. 4 o codice ciclo/partenza in modello_4; data e ora di ritiro in data_ora_ritiro.'
};
function instructions(kind){
 const k=KINDS[kind];if(!k)throw new Error('Tipo di documento non riconosciuto.');
 const list=k.fields.map(([key,label,type])=>'- '+key+': '+label+' ('+({date:'AAAA-MM-GG',datetime:'AAAA-MM-GG HH:MM',number:'numero',int:'numero intero',money:'euro, numero',plate:'targa senza spazi'}[type]||'testo')+')').join('\n');
 return 'Leggi la foto di un documento di trasporto italiano o europeo: '+k.name+'.\n'
  +'Rispondi SOLO con un oggetto JSON, senza testo prima o dopo, in questa forma:\n'
  +'{"tipo":"'+kind+'","leggibile":true,"campi":{"<chiave>":{"valore":<valore o null>,"sicurezza":"alta"|"media"|"bassa"}},"note":"<eventuale problema della foto>"}\n'
  +'Chiavi da compilare:\n'+list+'\n'
  +(HINTS[kind]?HINTS[kind]+'\n':'')
  +(k.lines?'Se il documento ha una tabella di merci (più righe, groupage), aggiungi in "campi" anche "righe": [{"colli":..,"imballaggio":..,"descrizione":"merce o mittente originario","ddt":"numero DDT","data":"AAAA-MM-GG","peso_kg":..}], una per riga, nello stesso ordine; colli, pallet e peso totali vanno nei campi dei totali.\n':'')
  +'Regole: copia solo ciò che è scritto sul documento; se un dato non c\'è o non si legge metti null; non indovinare e non completare. '
  +'"sicurezza" è bassa se il testo è scritto a mano, coperto, sfocato o se hai dubbi. '
  +'Se la foto non è un documento di questo tipo o è illeggibile, metti "leggibile":false e spiega in "note".';
}
const SYSTEM='Sei un assistente che legge documenti di trasporto per un\'azienda di autotrasporto. Restituisci solo JSON valido. Non inventare mai dati.';

/* An order confirmation as text (PDF with text, Word): the fields that can be found by their label, in Italian, French or
   English. Only what is written next to a label is taken; the office checks before saving. */
function guessOrder(text){
 const t=String(text||''),lines=t.split(/\r?\n/).map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean),f={};
 const after=re=>{for(let i=0;i<lines.length;i++){const m=lines[i].match(re);if(m){const v=(m[1]||'').replace(/^[\s:.\-–]+/,'').trim();if(v)return v;if(lines[i+1]&&!/:\s*$/.test(lines[i+1]))return lines[i+1];}}return null;};
 const DATE=/(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})/;
 f.numero=(t.match(/(?:conferma|ordine|order|ordre|commande|rif(?:erimento)?\.?|ref(?:erence)?\.?)[^\n\d]{0,30}?(?:n[°.ºr]*|nr\.?|#|:)\s*([A-Z0-9][A-Z0-9\/._-]{2,24})/i)||[])[1]||null;
 const d0=lines.map(l=>l.match(new RegExp('^(?:data|date|del)\\b[^\\d]{0,20}'+DATE.source,'i'))).find(Boolean);f.data=d0?normDate(d0[1]):null;
 f.committente=after(/^(?:committente|spedizioniere|cliente|donneur d'ordre|customer|ordered by)\b\s*:?(.*)$/i);
 const lc=after(/^(?:luogo di carico|carico|ritiro|lieu de chargement|chargement|enl[èe]vement|loading(?: place)?|pick ?up)\b[^:]*:(.*)$/i),ls=after(/^(?:luogo di scarico|scarico|consegna|destinazione|lieu de (?:d[ée]chargement|livraison)|d[ée]chargement|livraison|delivery(?: place)?|unloading(?: place)?)\b[^:]*:(.*)$/i);
 const split=v=>{if(!v)return [null,null];const m=v.match(DATE);return [v.replace(DATE,'').replace(/\b(?:il|le|on|del|ore|h)\b\s*$/i,'').replace(/[\s,;\-–]+$/,'').trim()||null,m?normDate(m[1]):null];};
 [f.luogo_carico,f.data_carico]=split(lc);[f.luogo_scarico,f.data_scarico]=split(ls);
 if(!f.data_carico){const m=t.match(new RegExp('(?:data (?:di )?carico|date de chargement|loading date)[^\\d\\n]{0,20}'+DATE.source,'i'));if(m)f.data_carico=normDate(m[1]);}
 if(!f.data_scarico){const m=t.match(new RegExp('(?:data (?:di )?(?:scarico|consegna)|date de (?:livraison|d[ée]chargement)|delivery date)[^\\d\\n]{0,20}'+DATE.source,'i'));if(m)f.data_scarico=normDate(m[1]);}
 f.merce=after(/^(?:merce|marchandise|goods|descrizione)\b\s*:(.*)$/i);
 const int=re=>{const m=t.match(re);return m?parseInt(m[1],10):null;};
 f.pallet=int(/(\d{1,3})\s*(?:pallets?|plt|bancali|epal|palettes?)\b/i)??int(/(?:pallets?|bancali|palettes?)\s*:?\s*(\d{1,3})\b/i);
 f.numero_capi=int(/(\d{1,4})\s*(?:capi|bovini|vitelli|suini|animali|t[êe]tes|broutards|veaux|bovins|heads?)\b/i)??int(/(?:capi|animali|t[êe]tes)\s*:?\s*(\d{1,4})\b/i);
 const kg=t.match(/([\d.,]+)\s*kg\b/i);f.peso_kg=kg?normNumber(kg[1]):null;
 const eur=t.match(/(?:prezzo|importo|nolo|tariffa|compenso|corrispettivo|prix|tarif|fret|freight|rate|price)[^\d\n]{0,40}?((?:\d{1,3}(?:[. ]\d{3})+|\d+)(?:,\d{1,2})?)\s*(?:€|eur)/i)||t.match(/(?:€|eur)\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)/i)||t.match(/((?:\d{1,3}(?:\.\d{3})+|\d{3,})(?:,\d{1,2})?)\s*(?:€|eur)/i);
 f.importo=eur?normNumber(eur[1].replace(/ /g,'')):null;
 f.pagamento=after(/^(?:pagamento|condizioni di pagamento|paiement|payment(?: terms)?)\b\s*:?(.*)$/i);
 const r=parseReading('conferma',{leggibile:true,campi:f});
 return {fields:r.campi,check:r.da_controllare,found:Object.values(r.campi).filter(v=>v!=null).length};
}

function extractJson(text){
 if(typeof text!=='string')return null;
 const t=text.replace(/^```(?:json)?\s*|\s*```$/g,'').trim();
 try{return JSON.parse(t);}catch{}
 const a=t.indexOf('{'),b=t.lastIndexOf('}');
 if(a>-1&&b>a){try{return JSON.parse(t.slice(a,b+1));}catch{}}
 return null;
}

// Turns the AI answer into the form the driver sees: every field of the kind, normalised, with the ones to check.
function parseReading(kind,raw){
 const k=KINDS[kind];if(!k)throw new Error('Tipo di documento non riconosciuto.');
 const j=typeof raw==='string'?extractJson(raw):raw;
 const out={tipo:kind,leggibile:false,campi:{},da_controllare:[],note:null};
 if(!j||typeof j!=='object'){out.note='Risposta della lettura non valida: compila a mano.';for(const [key] of k.fields){out.campi[key]=null;out.da_controllare.push(key);}return out;}
 out.leggibile=j.leggibile!==false;
 out.note=typeof j.note==='string'&&j.note.trim()?j.note.trim().slice(0,300):null;
 const src=j.campi&&typeof j.campi==='object'?j.campi:{};
 if(k.lines){const r=src.righe&&(Array.isArray(src.righe)?src.righe:Array.isArray(src.righe.valore)?src.righe.valore:null);out.righe=normLines(r);}
 for(const [key,,type] of k.fields){
  const f=src[key];const rawValue=f&&typeof f==='object'&&!Array.isArray(f)?f.valore:f;
  const value=normalize(type,rawValue);const conf=f&&typeof f==='object'?f.sicurezza:null;
  out.campi[key]=value;
  const unsure=conf==='bassa'||(rawValue!=null&&rawValue!==''&&value==null)||(value==null&&k.required.includes(key))||(type==='plate'&&value&&!ITALIAN_PLATE.test(value)&&conf!=='alta');
  if(unsure)out.da_controllare.push(key);
 }
 return out;
}

function normLines(r){
 if(!Array.isArray(r))return [];
 return r.slice(0,200).map(x=>{if(!x||typeof x!=='object')return null;const o={};for(const [key,type] of LINE_FIELDS)o[key]=normalize(type,x[key]&&typeof x[key]==='object'?x[key].valore:x[key]);return Object.values(o).some(v=>v!=null)?o:null;}).filter(Boolean);
}
// What the driver confirmed: same normalisation, required fields must be there.
function checkConfirmed(kind,campi){
 const k=KINDS[kind];if(!k)return {ok:false,errors:['Tipo di documento non riconosciuto.']};
 const values={},errors=[];
 for(const [key,label,type] of k.fields){
  const v=campi&&campi[key];const n=normalize(type,v);
  if(v!=null&&v!==''&&n==null)errors.push(label+': valore non valido.');
  values[key]=n;
 }
 for(const key of k.required)if(values[key]==null)errors.push((k.fields.find(f=>f[0]===key)||[key,key])[1]+': obbligatorio.');
 if(k.lines&&campi&&Array.isArray(campi.righe))values.righe=normLines(campi.righe);
 return {ok:!errors.length,values,errors};
}

return {KINDS,HINTS,KIND_KEYS,PHOTO_KINDS,expenseKind,LINE_FIELDS,normLines,SYSTEM,instructions,parseReading,guessOrder,checkConfirmed,extractJson,normDate,normDateTime,normNumber,normPlate,normalize};
});
