/* RADIX Trasporti — motorway tolls. Reads the transit detail of a toll invoice (Telepass, UnipolMove and similar
   CSV/Excel exports: date, entry and exit time and toll gate, plate or device, amount) and reconciles every transit
   with the trip that vehicle was making at that time. Transits outside every trip are shown for a check: a trip not
   registered, a private use, or a device mounted on another vehicle. Where the vehicle's positions are known (from
   the tracker on the vehicle or from the driver's phone) they tell "the vehicle was moving" apart from "no data".
   Times are local Italian wall-clock times "AAAA-MM-GGTHH:MM", compared as minutes. Pure functions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixTrPedaggi=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const ALIASES={
 date:['data','data transito','data operazione','data viaggio'],
 entryDate:['data entrata','data ingresso','data ora entrata','data e ora entrata','data ora ingresso'],
 exitDate:['data uscita','data ora uscita','data e ora uscita'],
 entryTime:['ora entrata','ora ingresso','orario entrata','orario ingresso'],
 exitTime:['ora uscita','orario uscita','ora','orario'],
 entry:['casello entrata','stazione entrata','entrata','ingresso','casello ingresso','stazione ingresso','punto entrata'],
 exit:['casello uscita','stazione uscita','uscita','punto uscita'],
 plate:['targa','targa veicolo','veicolo'],
 device:['dispositivo','codice dispositivo','apparato','n apparato','numero apparato','obu','telepass','codice apparato','seriale'],
 amount:['importo','importo euro','importo eur','importo e','euro','totale','importo iva inclusa','importo ivato','pedaggio']
};
function splitLine(line,sep){
 const out=[];let cur='',q=false;
 for(let i=0;i<line.length;i++){const ch=line[i];
  if(q){if(ch==='"'){if(line[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=ch;}
  else if(ch==='"')q=true;else if(ch===sep){out.push(cur);cur='';}else cur+=ch;}
 out.push(cur);return out.map(s=>s.trim());
}
const pad=n=>String(n).padStart(2,'0');
function parseDate(s){
 s=String(s||'').trim();let m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2})[:.](\d{2}))?/);
 if(m)return {d:m[1]+'-'+m[2]+'-'+m[3],t:m[4]!=null?pad(m[4])+':'+m[5]:null};
 m=s.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})(?:[ T,]+(\d{1,2})[:.](\d{2}))?/);
 if(m){let y=+m[3];if(y<100)y+=2000;return {d:y+'-'+pad(m[2])+'-'+pad(m[1]),t:m[4]!=null?pad(m[4])+':'+m[5]:null};}
 return null;
}
const parseTime=s=>{const m=String(s||'').trim().match(/^(\d{1,2})[:.](\d{2})/);return m&&+m[1]<24&&+m[2]<60?pad(m[1])+':'+m[2]:null;};
function parseAmount(s){
 let t=String(s??'').replace(/[^\d,.\-]/g,'');if(!/\d/.test(t))return null;
 const c=t.lastIndexOf(','),p=t.lastIndexOf('.');
 if(c>-1&&p>-1)t=c>p?t.replace(/\./g,'').replace(',','.'):t.replace(/,/g,'');else if(c>-1)t=t.replace(',','.');
 const n=Number(t);return Number.isFinite(n)?Math.round(n*100):null;
}
const plateOf=v=>{const s=String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');return s.length>=4&&s.length<=10?s:null;};

// CSV text (separator ; , or tab, header row anywhere in the first 15 lines) → transits + rows not understood.
function parseTransits(text){
 if(Array.isArray(text))return parseRows(text);
 const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l.trim());
 if(!lines.length)return {transits:[],skipped:[],error:'File vuoto.'};
 for(let i=0;i<Math.min(15,lines.length);i++)for(const s of [';','\t',','])if(headerOf(splitLine(lines[i],s)))return parseRows(lines.map(l=>splitLine(l,s)),lines);
 return {transits:[],skipped:[],error:NO_HEADER};
}
const NO_HEADER='Non trovo le colonne: servono data, importo e targa o dispositivo.';
function headerOf(cells){
 const cols=cells.map(norm);if(cols.length<3)return null;
 const m={};for(const [key,names] of Object.entries(ALIASES)){const idx=cols.findIndex((c,j)=>names.includes(c)&&!Object.values(m).includes(j));if(idx>-1)m[key]=idx;}
 return (m.date!=null||m.entryDate!=null||m.exitDate!=null)&&m.amount!=null&&(m.plate!=null||m.device!=null)?m:null;
}
// Rows of cells (from an Excel sheet, or from the CSV above) → transits.
function parseRows(rows,lines){
 rows=lines?rows:(rows||[]).filter(r=>r&&r.some(c=>String(c??'').trim()));
 if(!rows.length)return {transits:[],skipped:[],error:'File vuoto.'};
 let header=-1,map=null;
 for(let i=0;i<Math.min(15,rows.length)&&header<0;i++){const m=headerOf(rows[i].map(c=>String(c??'')));if(m){header=i;map=m;}}
 if(header<0)return {transits:[],skipped:[],error:NO_HEADER};
 const transits=[],skipped=[];
 for(let i=header+1;i<rows.length;i++){
  const c=rows[i].map(v=>String(v??'').trim()),get=k=>map[k]!=null?c[map[k]]||'':'';
  const base=parseDate(get('date'));const ed=parseDate(get('entryDate'))||base;const xd=parseDate(get('exitDate'))||base||ed;
  const entryTime=parseTime(get('entryTime'))||(ed&&ed.t);const exitTime=parseTime(get('exitTime'))||(xd&&xd.t);
  const amount=parseAmount(get('amount'));const plate=plateOf(get('plate'));const device=String(get('device')||'').replace(/\s+/g,'')||null;
  if(!xd&&!ed||amount==null||(!plate&&!device)){skipped.push({line:i+1,text:(lines?lines[i]:c.join(' ; ')).slice(0,200)});continue;}
  const exitAt=xd&&exitTime?xd.d+'T'+exitTime:null;let entryAt=ed&&entryTime?ed.d+'T'+entryTime:null;
  // one date column (the exit's) and an entry time after the exit time: the transit started the day before
  if(entryAt&&exitAt&&entryAt>exitAt&&map.entryDate==null){const d=new Date(Date.UTC(+entryAt.slice(0,4),+entryAt.slice(5,7)-1,+entryAt.slice(8,10)-1));entryAt=d.toISOString().slice(0,10)+entryAt.slice(10);}
  transits.push({id:'t'+(i+1),date:(xd||ed).d,entryAt,exitAt,entry:get('entry')||null,exit:get('exit')||null,plate,device,amount_cents:amount});
 }
 return {transits,skipped,error:null};
}

const minutes=s=>{const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);return m?Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5])/60000:null;};

/* transits: from parseTransits. vehicles: [{id, plate, devices:[...]}]. trips: [{id, vehicle_id, started_at, ended_at}]
   (ended_at null = still open). positions: [{vehicle_id, at}] optional.
   A transit belongs to a trip when its exit (or entry) time falls inside the trip, with `marginMinutes` of tolerance
   (default 30: the driver starts the trip in the app a little after leaving or closes it a little before). */
function reconcile({transits,vehicles,trips,positions,marginMinutes=30,nowAt}){
 const byPlate=new Map(),byDevice=new Map();
 for(const v of vehicles||[]){if(v.plate)byPlate.set(plateOf(v.plate),v);for(const d of v.devices||[])if(d)byDevice.set(String(d).replace(/\s+/g,''),v);}
 const now=minutes(nowAt)??Infinity;
 const tripsOf=new Map();for(const t of trips||[]){const a=minutes(t.started_at);if(a==null)continue;const b=t.ended_at?minutes(t.ended_at):now;(tripsOf.get(t.vehicle_id)||tripsOf.set(t.vehicle_id,[]).get(t.vehicle_id)).push({t,a,b});}
 const posOf=new Map();for(const p of positions||[]){const m=minutes(p.at);if(m==null)continue;(posOf.get(p.vehicle_id)||posOf.set(p.vehicle_id,[]).get(p.vehicle_id)).push(m);}
 const rows=[],perTrip={},perVehicle={};
 for(const tr of transits||[]){
  const v=(tr.plate&&byPlate.get(tr.plate))||(tr.device&&byDevice.get(tr.device))||null;
  const row={...tr,vehicle_id:v?v.id:null,trip_id:null,status:null,reason:null};
  if(!v){row.status='mezzo_sconosciuto';row.reason='Targa o dispositivo non associati a un mezzo.';rows.push(row);continue;}
  if(tr.plate&&v.plate&&plateOf(v.plate)!==tr.plate&&tr.device&&byDevice.get(tr.device)===v){row.reason='Dispositivo del mezzo usato con un\'altra targa.';}
  const at=minutes(tr.exitAt)??minutes(tr.entryAt);
  if(at==null){row.status='da_controllare';row.reason='Transito senza orario: abbina a mano.';rows.push(row);continue;}
  const from=minutes(tr.entryAt)??at;
  const cands=(tripsOf.get(v.id)||[]).filter(x=>at>=x.a-marginMinutes&&from<=x.b+marginMinutes);
  if(cands.length){
   // the trip that contains the exit time best (smallest distance outside the window, then the latest start)
   cands.sort((x,y)=>dist(at,x)-dist(at,y)||y.a-x.a);
   const t=cands[0].t;row.trip_id=t.id;row.status='abbinato';
   if(dist(at,cands[0])>0)row.reason='Transito appena fuori dagli orari del viaggio (entro '+marginMinutes+' minuti).';
   perTrip[t.id]=(perTrip[t.id]||0)+tr.amount_cents;
  }else{
   const ps=posOf.get(v.id)||[];const moving=ps.some(m=>Math.abs(m-at)<=45);
   row.status='fuori_viaggio';
   row.reason=moving?'Il mezzo risulta in movimento ma non c\'è un viaggio registrato: manca un viaggio?':'Nessun viaggio registrato a quell\'ora: viaggio mancante, uso privato o dispositivo su un altro mezzo.';
  }
  perVehicle[v.id]=(perVehicle[v.id]||0)+tr.amount_cents;
  rows.push(row);
 }
 const sum=st=>rows.filter(r=>r.status===st).reduce((s,r)=>s+r.amount_cents,0);
 return {rows,perTrip,perVehicle,totals:{count:rows.length,amount_cents:rows.reduce((s,r)=>s+r.amount_cents,0),matched_cents:sum('abbinato'),outside_cents:sum('fuori_viaggio'),unknown_cents:sum('mezzo_sconosciuto')+sum('da_controllare'),matched:rows.filter(r=>r.status==='abbinato').length}};
 function dist(at,x){return at<x.a?x.a-at:at>x.b?at-x.b:0;}
}

/* A motorway invoice in PDF (Telepass, UnipolMove, DKV…): the pages go to the AI, which returns one row per transit.
   pdfInstructions is the text sent with the pages, pdfRows turns the answer into the same rows an Excel sheet gives. */
const PDF_MAX_PAGES=10;
const PDF_HEAD=['Data','Ora entrata','Casello entrata','Ora uscita','Casello uscita','Targa','Dispositivo','Importo'];
function pdfInstructions(first,count){
 return 'Queste sono '+count+' pagine (dalla '+first+') di una fattura o di un estratto conto di pedaggi autostradali (Telepass, UnipolMove, DKV o simili). '
  +'Estrai OGNI transito del dettaglio, uno per riga, senza saltarne e senza sommarli. Ignora totali, riepiloghi, canoni e IVA. '
  +'Rispondi solo con JSON: {"transiti":[{"data":"AAAA-MM-GG","ora_entrata":"HH:MM","casello_entrata":"","ora_uscita":"HH:MM","casello_uscita":"","targa":"","dispositivo":"","importo":0.00}]}. '
  +'La data è quella di uscita. Se un valore non è scritto usa null: non inventare targhe, orari o importi. L\'importo è quello del singolo transito, in euro.';
}
function pdfRows(raw,extractJson){
 let j=raw;if(typeof raw==='string'){try{j=extractJson?extractJson(raw):JSON.parse(raw.slice(raw.indexOf('{'),raw.lastIndexOf('}')+1));}catch{j=null;}}
 const list=j&&Array.isArray(j.transiti)?j.transiti:[];
 const s=v=>v==null?'':String(v).slice(0,80);
 return list.slice(0,3000).filter(t=>t&&typeof t==='object').map(t=>[s(t.data),s(t.ora_entrata),s(t.casello_entrata),s(t.ora_uscita),s(t.casello_uscita),s(t.targa),s(t.dispositivo),typeof t.importo==='number'?t.importo.toFixed(2).replace('.',','):s(t.importo)]);
}
return {parseTransits,parseRows,reconcile,parseAmount,parseDate,minutes,plateOf,PDF_MAX_PAGES,PDF_HEAD,pdfInstructions,pdfRows};
});
