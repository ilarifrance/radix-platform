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
 ddt:{label:'DDT',name:'Documento di trasporto (DDT)',fields:[...COMMON,['causale','Causale del trasporto','text'],['aspetto_beni','Aspetto dei beni','text'],['porto','Porto (franco/assegnato)','text']],required:['numero','data','mittente','destinatario']},
 cmr:{label:'CMR',name:'Lettera di vettura internazionale (CMR)',fields:[...COMMON,['paese_carico','Paese di carico','country'],['paese_scarico','Paese di scarico','country'],['data_presa_in_carico','Data presa in carico','date'],['istruzioni','Istruzioni del mittente','text']],required:['numero','mittente','destinatario','luogo_carico','luogo_scarico']},
 giornale:{label:'Giornale di viaggio',name:'Giornale di viaggio animali vivi (Reg. CE 1/2005)',fields:[
  ['numero','Numero documento','text'],['organizzatore','Organizzatore','text'],['trasportatore','Trasportatore','text'],
  ['autorizzazione_trasportatore','N. autorizzazione trasportatore','text'],['specie','Specie','text'],['numero_animali','Numero di animali','int'],
  ['luogo_partenza','Luogo di partenza','text'],['partenza','Data e ora di partenza','datetime'],
  ['luogo_destinazione','Luogo di destinazione','text'],['arrivo_previsto','Arrivo previsto','datetime'],['durata_ore','Durata prevista (ore)','number'],
  ['targa','Targa','plate'],['targa_rimorchio','Targa rimorchio','plate'],['certificato_sanitario','N. certificato sanitario / TRACES','text']],required:['specie','numero_animali','luogo_partenza','luogo_destinazione','partenza']},
 carburante:{label:'Rifornimento',name:'Scontrino o ricevuta di rifornimento',fields:[
  ['data','Data','date'],['ora','Ora','text'],['distributore','Distributore','text'],['prodotto','Prodotto','text'],
  ['litri','Litri','number'],['prezzo_litro','Prezzo al litro (€)','money'],['importo','Importo (€)','money'],
  ['km','Km contachilometri','int'],['targa','Targa','plate']],required:['data','litri','importo']}
};
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

function instructions(kind){
 const k=KINDS[kind];if(!k)throw new Error('Tipo di documento non riconosciuto.');
 const list=k.fields.map(([key,label,type])=>'- '+key+': '+label+' ('+({date:'AAAA-MM-GG',datetime:'AAAA-MM-GG HH:MM',number:'numero',int:'numero intero',money:'euro, numero',plate:'targa senza spazi'}[type]||'testo')+')').join('\n');
 return 'Leggi la foto di un documento di trasporto italiano o europeo: '+k.name+'.\n'
  +'Rispondi SOLO con un oggetto JSON, senza testo prima o dopo, in questa forma:\n'
  +'{"tipo":"'+kind+'","leggibile":true,"campi":{"<chiave>":{"valore":<valore o null>,"sicurezza":"alta"|"media"|"bassa"}},"note":"<eventuale problema della foto>"}\n'
  +'Chiavi da compilare:\n'+list+'\n'
  +'Regole: copia solo ciò che è scritto sul documento; se un dato non c\'è o non si legge metti null; non indovinare e non completare. '
  +'"sicurezza" è bassa se il testo è scritto a mano, coperto, sfocato o se hai dubbi. '
  +'Se la foto non è un documento di questo tipo o è illeggibile, metti "leggibile":false e spiega in "note".';
}
const SYSTEM='Sei un assistente che legge documenti di trasporto per un\'azienda di autotrasporto. Restituisci solo JSON valido. Non inventare mai dati.';

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
 for(const [key,,type] of k.fields){
  const f=src[key];const rawValue=f&&typeof f==='object'&&!Array.isArray(f)?f.valore:f;
  const value=normalize(type,rawValue);const conf=f&&typeof f==='object'?f.sicurezza:null;
  out.campi[key]=value;
  const unsure=conf==='bassa'||(rawValue!=null&&rawValue!==''&&value==null)||(value==null&&k.required.includes(key))||(type==='plate'&&value&&!ITALIAN_PLATE.test(value)&&conf!=='alta');
  if(unsure)out.da_controllare.push(key);
 }
 return out;
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
 return {ok:!errors.length,values,errors};
}

return {KINDS,KIND_KEYS,SYSTEM,instructions,parseReading,checkConfirmed,extractJson,normDate,normDateTime,normNumber,normPlate,normalize};
});
