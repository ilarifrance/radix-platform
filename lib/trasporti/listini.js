/* Plancia (Trasporti) — listini: how a transport company prices a trip or a shipment.
   Methods used in road haulage: fixed price per route, per km, by zone (province, region, country of delivery or
   origin→destination pair), by band (weight, pallets, linear metres, km), per tonne, per package/pallet, per head
   (live animals), per hour. On top: minimum charge and supplements (fuel adjustment tied to the diesel price, ADR,
   waiting time, extra drops, tail lift, floor delivery, holidays, fixed extras). Amounts in cents. Pure functions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixTrListini=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

const METHODS={
 fisso:{label:'Prezzo fisso per tratta',unit:'viaggio'},
 km:{label:'Al km',unit:'km'},
 zone:{label:'A zone',unit:'zona'},
 fasce:{label:'A fasce',unit:'fascia'},
 tonnellata:{label:'A tonnellata',unit:'t'},
 collo:{label:'A collo o pallet',unit:'pz'},
 capo:{label:'A capo (animali vivi)',unit:'capi'},
 ora:{label:'All\'ora',unit:'ore'}
};
const BASES={peso:{label:'peso (kg)',key:'weight_kg'},pallet:{label:'pallet',key:'pallets'},metri:{label:'metri lineari',key:'linear_m'},colli:{label:'colli',key:'packages'},km:{label:'km',key:'km'},capi:{label:'capi',key:'animals'}};
const SUPPLEMENTS={
 gasolio:{label:'Adeguamento gasolio'},adr:{label:'Merce pericolosa (ADR)'},sosta:{label:'Sosta e attesa'},
 scarico_extra:{label:'Scarichi oltre il primo'},ramassa:{label:'Ramasse (carichi in più)'},sponda:{label:'Sponda idraulica'},piano:{label:'Consegna al piano'},
 festivo:{label:'Festivo o notturno'},fisso:{label:'Supplemento fisso'}
};
// Italian regions → province codes, for zones written as a region name.
const REGIONS={
 'valle d\'aosta':['AO'],piemonte:['TO','VC','NO','CN','AT','AL','BI','VB'],lombardia:['VA','CO','SO','MI','BG','BS','PV','CR','MN','LC','LO','MB'],
 'trentino alto adige':['BZ','TN'],veneto:['VR','VI','BL','TV','VE','PD','RO'],'friuli venezia giulia':['UD','GO','TS','PN'],liguria:['IM','SV','GE','SP'],
 'emilia romagna':['PC','PR','RE','MO','BO','FE','RA','FC','PU','RN'],toscana:['MS','LU','PT','FI','LI','PI','AR','SI','GR','PO'],umbria:['PG','TR'],
 marche:['PU','AN','MC','AP','FM'],lazio:['VT','RI','RM','LT','FR'],abruzzo:['AQ','TE','PE','CH'],molise:['CB','IS'],campania:['CE','BN','NA','AV','SA'],
 puglia:['FG','BA','TA','BR','LE','BT'],basilicata:['PZ','MT'],calabria:['CS','CZ','RC','KR','VV'],sicilia:['TP','PA','ME','AG','CL','EN','CT','RG','SR'],
 sardegna:['SS','NU','CA','OR','SU']
};
const COUNTRIES={FR:['france','francia'],DE:['germany','germania','deutschland'],ES:['spain','spagna','españa','espana'],AT:['austria','österreich'],CH:['switzerland','svizzera','schweiz','suisse'],
 BE:['belgium','belgio','belgique'],NL:['netherlands','olanda','paesi bassi','nederland'],PL:['poland','polonia','polska'],SI:['slovenia'],HR:['croatia','croazia','hrvatska'],
 HU:['hungary','ungheria'],CZ:['czech','repubblica ceca','česko'],RO:['romania'],GR:['greece','grecia'],PT:['portugal','portogallo'],IT:['italy','italia']};

// Provincial capitals: a place written with the city name only («Verona») is in its province.
const CAPOLUOGHI={'aosta':'AO','torino':'TO','vercelli':'VC','novara':'NO','cuneo':'CN','asti':'AT','alessandria':'AL','biella':'BI','verbania':'VB','varese':'VA','como':'CO','sondrio':'SO','milano':'MI','bergamo':'BG','brescia':'BS','pavia':'PV','cremona':'CR','mantova':'MN','lecco':'LC','lodi':'LO','monza':'MB','bolzano':'BZ','trento':'TN','verona':'VR','vicenza':'VI','belluno':'BL','treviso':'TV','venezia':'VE','padova':'PD','rovigo':'RO','udine':'UD','gorizia':'GO','trieste':'TS','pordenone':'PN','imperia':'IM','savona':'SV','genova':'GE','la spezia':'SP','piacenza':'PC','parma':'PR','reggio emilia':'RE','modena':'MO','bologna':'BO','ferrara':'FE','ravenna':'RA','forli':'FC','cesena':'FC','rimini':'RN','massa':'MS','carrara':'MS','lucca':'LU','pistoia':'PT','firenze':'FI','livorno':'LI','pisa':'PI','arezzo':'AR','siena':'SI','grosseto':'GR','prato':'PO','perugia':'PG','terni':'TR','pesaro':'PU','urbino':'PU','ancona':'AN','macerata':'MC','ascoli piceno':'AP','fermo':'FM','viterbo':'VT','rieti':'RI','roma':'RM','latina':'LT','frosinone':'FR','l\'aquila':'AQ','teramo':'TE','pescara':'PE','chieti':'CH','campobasso':'CB','isernia':'IS','caserta':'CE','benevento':'BN','napoli':'NA','avellino':'AV','salerno':'SA','foggia':'FG','bari':'BA','taranto':'TA','brindisi':'BR','lecce':'LE','barletta':'BT','andria':'BT','trani':'BT','potenza':'PZ','matera':'MT','cosenza':'CS','catanzaro':'CZ','reggio calabria':'RC','crotone':'KR','vibo valentia':'VV','trapani':'TP','palermo':'PA','messina':'ME','agrigento':'AG','caltanissetta':'CL','enna':'EN','catania':'CT','ragusa':'RG','siracusa':'SR','sassari':'SS','nuoro':'NU','cagliari':'CA','oristano':'OR','carbonia':'SU'};
const AMBIGUOUS={FR:'03',PT:'51',RO:'45',SI:'53',CH:'66',AT:'14'};
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
/* Where a place is: Italian province (2 letters in brackets or after the CAP), country (ISO code or name). */
function placeOf(text){
 const t=String(text||''),n=norm(t);
 let country=null;
 const iso=t.match(/(?:[-–,(]\s*|\s)(FR|DE|ES|AT|CH|BE|NL|PL|SI|HR|HU|CZ|RO|GR|PT|IT)\s*\)?\s*$/);
 if(iso)country=iso[1];
 if(!country)for(const [c,names] of Object.entries(COUNTRIES))if(names.some(x=>new RegExp('\\b'+x+'\\b').test(n))){country=c;break;}
 let province=null;
 const cap=(t.match(/\b(\d{5})\b/)||[])[1]||null;
 const pr=t.match(/\(([A-Z]{2})\)/)||t.match(/\b\d{5}\s+[A-Za-zÀ-ÿ' .-]+?\s+([A-Z]{2})\s*$/);
 if(pr&&Object.values(REGIONS).some(l=>l.includes(pr[1]))){
  // codes that are both a province and a country: Italian only with that province's CAP (Frosinone 03…)
  const both=AMBIGUOUS[pr[1]];
  if(!both||(cap&&cap.startsWith(both))||/\bitali[ae]\b/i.test(t))province=pr[1];
 }
 if(!province&&(!country||country==='IT')){for(const seg of t.replace(/\b\d{5}\b/g,'').split(/[,(–-]/)){const c=CAPOLUOGHI[norm(seg)];if(c)province=c;}}
 if(province)country='IT';
 return {country,province,cap,text:t};
}
/* A zone matches a place when one of its terms does: province code (MN), region name (lombardia), country (FR, francia),
   CAP prefix (46*), or a word of the place name (canneto). */
function termMatches(term,p){
 const x=String(term||'').trim();if(!x)return false;
 if(/^[A-Z]{2}$/.test(x)){if(p.province===x)return true;if(p.country===x&&x!=='IT'||(x==='IT'&&p.country==='IT'))return true;return false;}
 if(/^\d{1,5}\*?$/.test(x))return !!p.cap&&p.cap.startsWith(x.replace('*',''));
 const n=norm(x);
 if(REGIONS[n])return !!p.province&&REGIONS[n].includes(p.province);
 for(const [c,names] of Object.entries(COUNTRIES))if(names.includes(n))return p.country===c;
 return norm(p.text).includes(n);
}
function zoneFor(card,job){
 const to=placeOf(job.delivery_place),from=placeOf(job.load_place);
 // a zone with an origin is more specific than one with the destination only
 for(const z of (card.zones||[]).slice().sort((a,b)=>((b.from||[]).length?1:0)-((a.from||[]).length?1:0))){
  const toOk=(z.to||[]).length?(z.to||[]).some(t=>termMatches(t,to)):true;
  const fromOk=(z.from||[]).length?(z.from||[]).some(t=>termMatches(t,from)):true;
  if(toOk&&fromOk&&((z.to||[]).length||(z.from||[]).length))return z;
 }
 return null;
}
const money=c=>(c/100).toFixed(2).replace('.',',')+' €';
const r2=x=>Math.round(x*100)/100;

/* Price of a job with a card.
   job: {km, weight_kg, pallets, linear_m, packages, animals, hours, load_place, delivery_place, date,
         adr, wait_hours, extra_drops, extra_loads, tail_lift, floor, holiday, diesel_eur_l}
   → {amount_cents, lines:[{label, qty, unit, amount_cents}], missing:[...], zone} */
function price(card,job){
 const j=job||{},lines=[],missing=[];let base=0,zone=null;
 const need=(k,label)=>{const v=Number(j[k]);if(!(v>0)){missing.push(label);return 0;}return v;};
 switch(card.method){
  case 'fisso':base=card.amount_cents||0;lines.push({label:card.route||'Prezzo fisso',qty:1,unit:'viaggio',amount_cents:base});break;
  // live animals: the loaded leg is usually paid twice (the truck comes back empty)
  case 'km':{const k1=need('km','km'),km=card.round_trip?k1*2:k1;base=Math.round(km*(card.per_km_cents||0));if(km)lines.push({label:card.round_trip?'Trasporto al km, tratta carica pagata due volte ('+k1+' km × 2)':'Trasporto al km',qty:km,unit:'km',amount_cents:base});break;}
  case 'tonnellata':{const kg=need('weight_kg','peso');const t=r2(kg/1000);base=Math.round(t*(card.per_ton_cents||0));if(kg)lines.push({label:'Trasporto a tonnellata',qty:t,unit:'t',amount_cents:base});break;}
  case 'collo':{const k=(BASES[card.basis||'pallet']||BASES.pallet);const n=need(k.key,k.label);base=Math.round(n*(card.per_unit_cents||0));if(n)lines.push({label:'Trasporto a '+(card.basis==='colli'?'collo':'pallet'),qty:n,unit:card.basis==='colli'?'colli':'pallet',amount_cents:base});break;}
  case 'capo':{const n=need('animals','numero di capi');base=Math.round(n*(card.per_unit_cents||0));if(n)lines.push({label:'Trasporto animali vivi',qty:n,unit:'capi',amount_cents:base});break;}
  case 'ora':{const h=need('hours','ore');base=Math.round(h*(card.per_hour_cents||0));if(h)lines.push({label:'Trasporto a ore',qty:r2(h),unit:'ore',amount_cents:base});break;}
  case 'zone':{
   zone=zoneFor(card,j);
   if(!zone){missing.push('zona di '+(j.delivery_place||'consegna')+' non presente nel listino');break;}
   if(zone.per_unit_cents&&zone.basis){const k=BASES[zone.basis];const n=need(k.key,k.label);base=Math.round(n*zone.per_unit_cents);lines.push({label:'Zona '+zone.name,qty:n,unit:k.label,amount_cents:base});}
   else{base=zone.amount_cents||0;lines.push({label:'Zona '+zone.name,qty:1,unit:'viaggio',amount_cents:base});}
   break;}
  case 'fasce':{
   const k=BASES[card.basis||'peso']||BASES.peso;const v=need(k.key,k.label);if(!v)break;
   const bands=(card.bands||[]).slice().sort((a,b)=>a.upto-b.upto);
   const b=bands.find(x=>v<=x.upto)||null;
   if(!b){missing.push(k.label+' '+v+' oltre l\'ultima fascia');break;}
   base=b.per_unit?Math.round(v*b.amount_cents):b.amount_cents;
   lines.push({label:'Fascia fino a '+b.upto+' '+k.label,qty:b.per_unit?v:1,unit:b.per_unit?k.label:'viaggio',amount_cents:base});break;}
  default:missing.push('metodo del listino');
 }
 if(card.min_cents&&base<card.min_cents&&!missing.length){lines.push({label:'Integrazione al minimo ('+money(card.min_cents)+')',qty:1,unit:'',amount_cents:card.min_cents-base});base=card.min_cents;}
 let total=base;
 for(const s of missing.length?[]:card.supplements||[]){
  const lab=(SUPPLEMENTS[s.kind]||{}).label||s.label||'Supplemento';let a=0,qty=1,unit='';
  if(s.kind==='gasolio'){
   // fuel clause: the price moves with diesel: (current − base) / base × incidence of fuel on the price
   const cur=Number(j.diesel_eur_l)||Number(s.current_eur_l)||0;
   if(!cur||!s.base_eur_l){if(s.base_eur_l)missing.push('prezzo del gasolio del periodo');continue;}
   const pct=(cur-s.base_eur_l)/s.base_eur_l*(s.incidence_pct||30);
   a=Math.round(base*pct/100);qty=r2(pct);unit='%';
   lines.push({label:lab+' (gasolio '+cur.toFixed(3).replace('.',',')+' €/l su base '+Number(s.base_eur_l).toFixed(3).replace('.',',')+')',qty,unit,amount_cents:a});total+=a;continue;
  }
  if(s.kind==='adr'&&!j.adr)continue;
  if(s.kind==='sponda'&&!j.tail_lift)continue;
  if(s.kind==='piano'&&!j.floor)continue;
  if(s.kind==='festivo'&&!j.holiday)continue;
  if(s.kind==='sosta'){const h=Math.max(0,(Number(j.wait_hours)||0)-(s.free_hours||0));if(!h)continue;a=Math.round(h*(s.per_hour_cents||0));qty=r2(h);unit='ore';}
  else if(s.kind==='scarico_extra'){const n=Number(j.extra_drops)||0;if(!n)continue;a=n*(s.amount_cents||0);qty=n;unit=n===1?'scarico':'scarichi';}
  else if(s.kind==='ramassa'){const n=Number(j.extra_loads)||0;if(!n)continue;a=n*(s.amount_cents||0);qty=n;unit=n===1?'carico':'carichi';}
  else if(s.pct){a=Math.round(base*s.pct/100);qty=s.pct;unit='%';}
  else a=s.amount_cents||0;
  if(a){lines.push({label:lab,qty,unit,amount_cents:a});total+=a;}
 }
 return {amount_cents:missing.length&&!base?null:total,lines,missing,zone:zone&&zone.name||null};
}

/* The card for a customer on a date: the customer's own valid card, else the company default. */
function cardFor(cards,customerId,date){
 const ok=c=>c.active!==false&&(!c.valid_from||!date||date>=c.valid_from)&&(!c.valid_to||!date||date<=c.valid_to);
 const list=(cards||[]).filter(ok);
 return list.find(c=>c.customer_id&&c.customer_id===customerId)||list.find(c=>!c.customer_id)||null;
}

/* What the job is, from a trip and (when present) one shipment of it. */
function jobOf(trip,shipment,ships,docs){
 const s=shipment||{},t=trip||{};
 const mine=(docs||[]).filter(d=>d.trip_id===t.id);const main=mine.find(d=>d.kind==='cmr'||d.kind==='ddt')||{};const f=main.fields||{};
 // livestock: the heads are on the journey log when there is no DDT or CMR with them
 const gv=(mine.find(d=>d.kind==='giornale')||{}).fields||{};
 // pallets and heads agreed on the forwarder's order confirmation, when no transport document carries them
 const cf=(mine.find(d=>d.kind==='conferma')||{}).fields||{};
 const hours=t.started_at&&t.ended_at?Math.max(0,(Date.parse(t.ended_at)-Date.parse(t.started_at))/3600000):null;
 // a trip with several shipments: km shared by weight so that per-km cards still add up to the trip
 // km to invoice: the agreed ones when they differ from the km actually driven (billed_km), else the driven ones
 const tk=t.billed_km!=null?t.billed_km:t.km;
 let km=tk;if(shipment&&ships&&ships.length>1&&tk){const tot=ships.reduce((a,x)=>a+(x.weight_kg||0),0);km=tot?Math.round(tk*(s.weight_kg||0)/tot):Math.round(tk/ships.length);}
 // extra drops and extra loads (ramasse) belong to the trip: with several shipments they go on the first one only
 const first=!shipment||!ships||ships.length<2||ships[0]===shipment||ships[0].id===s.id;
 return {km,weight_kg:s.weight_kg??f.peso_kg??null,pallets:s.pallets??f.pallet??cf.pallet??null,packages:s.packages??f.colli??null,animals:s.animals??f.numero_capi??gv.animali_idonei_arrivo??gv.numero_animali??cf.numero_capi??null,
  linear_m:s.linear_m??null,hours:hours!=null?Math.round(hours*4)/4:null,load_place:s.load_place||t.origin||f.luogo_carico||null,delivery_place:s.delivery_place||t.destination||f.luogo_scarico||null,
  date:(s.load_date||t.started_at||'').slice(0,10),adr:!!(t.adr||s.adr),wait_hours:t.wait_hours||0,extra_drops:first?t.extra_drops||0:0,extra_loads:first?t.extra_loads||0:0,tail_lift:!!(t.tail_lift||s.tail_lift),floor:!!s.floor,holiday:!!t.holiday,diesel_eur_l:t.diesel_eur_l||null};
}

/* Lines like "MN, CR, BS = 350" or "Francia | FR = 1200" → zones; "1000 = 120" or "33 = 25/u" → bands. */
function parseZones(text){
 return String(text||'').split(/\n+/).map(l=>l.trim()).filter(Boolean).map((l,i)=>{
  const m=l.match(/^(.*?)(?:\s*->\s*(.*?))?\s*=\s*([\d.,]+)\s*(\/\s*(pallet|kg|capo|collo|m))?\s*$/i);if(!m)return {error:'Riga '+(i+1)+': scrivi "luoghi = importo"'};
  const a=m[2]!=null?m[1]:'',b=m[2]!=null?m[2]:m[1];
  const terms=s=>s.split(/[,;|]/).map(x=>x.trim()).filter(Boolean).map(x=>/^[a-z]{2}$/i.test(x)?x.toUpperCase():x);
  const cents=Math.round(parseFloat(m[3].replace(/\./g,'').replace(',','.'))*100);
  const per=m[5]?({pallet:'pallet',kg:'peso',capo:'capi',collo:'colli',m:'metri'})[m[5].toLowerCase()]:null;
  return {name:b.split(/[,;|]/)[0].trim()+(a?' da '+a.split(/[,;|]/)[0].trim():''),from:a?terms(a):[],to:terms(b),...(per?{basis:per,per_unit_cents:cents}:{amount_cents:cents})};
 });
}
function parseBands(text){
 return String(text||'').split(/\n+/).map(l=>l.trim()).filter(Boolean).map((l,i)=>{
  const m=l.match(/^(?:fino a\s*)?([\d.,]+)\s*=\s*([\d.,]+)\s*(\/\s*u)?\s*$/i);if(!m)return {error:'Riga '+(i+1)+': scrivi "fino a = importo" (es. 1000 = 120, oppure 33 = 25/u)'};
  return {upto:parseFloat(m[1].replace(/\./g,'').replace(',','.')),amount_cents:Math.round(parseFloat(m[2].replace(/\./g,'').replace(',','.'))*100),per_unit:!!m[3]};
 });
}


const UNIT={pallet:'pallet',peso:'kg',capi:'capo',colli:'collo',metri:'m'};
const centsTxt=c=>c==null?'':(c/100).toFixed(2).replace('.',',');
/* Zones back to the text of the editor, one per line. */
function zonesText(zones){
 return (zones||[]).map(z=>((z.from||[]).length?z.from.join(', ')+' -> ':'')+(z.to||[]).join(', ')+' = '+centsTxt(z.amount_cents!=null?z.amount_cents:z.per_unit_cents)+(z.per_unit_cents?' /'+(UNIT[z.basis]||'pallet'):'')).join('\n');
}

/* A price list received as a file (Excel, Word, PDF): rows of cells, or lines of text → zones and supplements.
   Recognised: "Carico zona Rodez" (the origin of the rows that follow), "Cuneo (CN)  1.450,00", a table with
   origin / destination / amount columns, "Scarico oltre il primo 50", "Ramasse 100", "Sosta 40 €/ora", "Minimo 300".
   What is not understood is returned in `skipped`, never guessed. */
function amountOf(v){
 if(typeof v==='number')return Number.isFinite(v)?v:null;
 const s=String(v??'').replace(/€|eur(o|os)?\b|\+|\s/gi,'');if(!/^\d[\d.,]*$/.test(s))return null;
 let x=s;if(/,\d{1,2}$/.test(x))x=x.replace(/\./g,'').replace(',','.');else if(/^\d{1,3}(\.\d{3})+$/.test(x))x=x.replace(/\./g,'');else x=x.replace(/,/g,'');
 const n=parseFloat(x);return Number.isFinite(n)?n:null;
}
function splitLine(l){
 const t=String(l||'').trim();if(!t)return [];
 let c=t.split(/\t+|\s{2,}|[;|]/).map(x=>x.trim()).filter(Boolean);
 if(c.length>1)return c;
 const m=t.match(/^(.*?)[\s:=]+\+?\s*((?:€\s*)?\d[\d.,]*)\s*(?:€|euro|eur)?\s*((?:\/|a |al |per |all')\s*(?:pallet|kg|capo|collo|ora|h))?\.?$/i);
 return m&&m[1].trim()?[m[1].trim(),m[2]+(m[3]?' '+m[3]:'')]:[t];
}
const KNOWN=new Set(Object.values(REGIONS).flat());
function placeTerms(cell){
 const out=[];
 for(const raw of String(cell||'').split(/[,;\/]|\s+e\s+/)){
  const x=raw.trim().replace(/^(?:provincia|prov\.?|zona|zone|area)\s+(?:di\s+)?/i,'');if(!x)continue;
  const br=x.match(/\(([A-Za-z]{2})\)/);
  if(br){out.push(br[1].toUpperCase());continue;}
  if(/^[A-Za-z]{2}$/.test(x)){out.push(x.toUpperCase());continue;}
  if(CAPOLUOGHI[norm(x)]){out.push(CAPOLUOGHI[norm(x)]);continue;}
  out.push(x);
 }
 return out;
}
function knownPlace(term){
 if(/^[A-Z]{2}$/.test(term))return KNOWN.has(term)||!!COUNTRIES[term];
 if(/^\d{2,5}\*?$/.test(term))return true;
 const n=norm(term);return !!(REGIONS[n]||CAPOLUOGHI[n]||Object.values(COUNTRIES).some(l=>l.includes(n)));
}
function importTable(input){
 const rows=typeof input==='string'?input.split(/\r?\n/).map(l=>[l]):(input||[]);
 const zones=[],supplements=[],skipped=[];let min_cents=null,origin=[],head=null;
 const sup=(kind,o)=>{if(!supplements.some(s=>s.kind===kind))supplements.push({kind,...o});};
 for(const row of rows){
  let cells=(Array.isArray(row)?row:[row]).map(c=>typeof c==='number'?c:String(c??'').trim()).filter(c=>c!=='');
  const fromText=cells.length===1&&typeof cells[0]==='string';
  if(fromText)cells=splitLine(cells[0]);
  if(!cells.length)continue;
  const perUnit=cells.map(c=>(String(c).match(/(?:\/|a |al |per |all')\s*(pallet|kg|capo|collo|ora|h)\b/i)||[])[1]).find(Boolean);
  const vals=cells.map(c=>amountOf(String(c).replace(/(?:\/|a |al |per |all')\s*(?:pallet|kg|capo|collo|ora|h)\b/i,'')));
  const texts=cells.filter((c,i)=>vals[i]==null).map(String),nums=vals.filter(x=>x!=null);
  const text=texts.join(' '),n=norm(text);
  // "Carico zona Rodez": the rows that follow leave from there
  const o=nums.length||texts.length>2||(texts.length===2&&!/^(?:luogo di |zona di )?(?:carico|caricamento|partenza|ritiro|origine|chargement|d[ée]part)\s*:?$/i.test(texts[0]))?null:text.match(/^(?:luogo di |zona di |zone de )?(?:carico|caricamento|partenza|ritiro|origine|chargement|depart|départ)\b\s*(?:in |da |a |nella |zona |zone |area |di )*:?\s*(.+)$/i);
  if(o){origin=placeTerms(o[1].replace(/[.:]+$/,''));head=null;continue;}
  if(!nums.length){if(texts.length>1)head=texts.map(norm);continue;}
  const amount=nums[nums.length-1],cents=Math.round(amount*100);
  if(/ramass|doppio carico|secondo carico|\bcarico (in piu|aggiuntivo|supplementare|extra)|\bcarichi (in piu|aggiuntivi)/.test(n)){sup('ramassa',{amount_cents:cents});continue;}
  if(/scaric/.test(n)&&/in piu|oltre|aggiuntiv|supplement|extra|second|ulterior|ogni|successiv|\d/.test(n+' '+(nums.length>1?'1':''))&&!/^(?:luogo|provincia|zona)/.test(n)){
   // "2 scarichi +50", "3 scarichi +100": the amount is for the drops beyond the first
   const k=(n.match(/(\d+)\s*scarich/)||[])[1]||(nums.length>1&&Number.isInteger(nums[0])&&nums[0]>=2&&nums[0]<=10?nums[0]:null);
   sup('scarico_extra',{amount_cents:k&&+k>=2?Math.round(cents/(+k-1)):cents});continue;}
  if(/\b(sosta|attesa|fermo)\b/.test(n)){sup('sosta',{per_hour_cents:cents,free_hours:+((n.match(/(\d+(?:[.,]\d+)?)\s*or[ae]/)||[])[1]||'0').replace(',','.')||(nums.length>1&&nums[0]<=24?nums[0]:0)});continue;}
  if(/\badr\b|merce pericolosa/.test(n)){sup('adr',{amount_cents:cents});continue;}
  if(/sponda/.test(n)){sup('sponda',{amount_cents:cents});continue;}
  if(/\bminimo\b/.test(n)){min_cents=cents;continue;}
  if(/gasolio|carburante|fuel|festiv|nottur|pagament|validit|\biva\b|giorni|telefono|\btel\b|\bfax\b|pagina|totale|offerta|listino|tariffario|\banno\b|partita/.test(n)){skipped.push(cells.join(' '));continue;}
  // a zone: where from (when the table has that column), where to, how much
  let from=origin,to;
  const col=re=>head?head.findIndex(h=>re.test(h)):-1;
  const fi=col(/^(da|carico|partenza|origine|ritiro|luogo di carico|zona di carico)\b/),ti=col(/^(a|scarico|destinazione|destino|consegna|provincia|luogo di scarico|zona|arrivo)\b/);
  const cell=i=>i>=0&&i<cells.length&&vals[i]==null?String(cells[i]):null;
  if(head&&fi>=0&&ti>=0&&cell(fi)&&cell(ti)){from=placeTerms(cell(fi));to=placeTerms(cell(ti));}
  else{
   const all=texts.flatMap(placeTerms),codes=all.filter(t=>/^[A-Z]{2}$/.test(t)&&knownPlace(t));
   if(codes.length)to=codes;
   else if(texts.length===2&&!head){from=placeTerms(texts[0]);to=placeTerms(texts[1]);}
   else to=all;
  }
  to=[...new Set(to)];
  if(!to.length||(fromText&&!zones.length&&!to.some(knownPlace))||amount<=0){skipped.push(cells.join(' '));continue;}
  const basis=perUnit?({pallet:'pallet',kg:'peso',capo:'capi',collo:'colli'})[perUnit.toLowerCase()]:null;
  zones.push({name:to[0]+(from.length?' da '+from[0]:''),from:from.slice(),to,...(basis?{basis,per_unit_cents:cents}:{amount_cents:cents})});
 }
 return {zones,supplements,min_cents,skipped};
}

/* A price list as PDF or photo is read by the AI on the server: what is sent with the file, and the answer as rows. */
function fileInstructions(){
 return 'Questo è il listino prezzi di un trasporto su strada (anche in francese o inglese). Trascrivi le righe del listino così come sono, senza calcolare e senza inventare. '
  +'Rispondi solo con JSON: {"righe":[["testo o numero","…"]]}: una riga per ogni riga del documento, una cella per colonna, nello stesso ordine; i numeri come numeri (1450.00). '
  +'Riporta anche le intestazioni delle tabelle, le righe che indicano il luogo o la zona di carico (es. "Carico zona Rodez") e le righe dei supplementi (scarichi oltre il primo, ramasse o doppio carico, sosta, minimo). '
  +'Ignora intestazione dell\'azienda, indirizzi, condizioni generali e firme. Se un valore non si legge usa null.';
}
function fileRows(raw,extractJson){
 let j=raw;if(typeof raw==='string'){try{j=extractJson?extractJson(raw):JSON.parse(raw.slice(raw.indexOf('{'),raw.lastIndexOf('}')+1));}catch{j=null;}}
 const list=j&&Array.isArray(j.righe)?j.righe:[];
 return list.slice(0,2000).filter(Array.isArray).map(r=>r.slice(0,30).map(c=>typeof c==='number'&&Number.isFinite(c)?c:c==null?'':String(c).slice(0,120)));
}

return {METHODS,BASES,SUPPLEMENTS,REGIONS,placeOf,termMatches,zoneFor,price,cardFor,jobOf,parseZones,parseBands,zonesText,importTable,amountOf,fileInstructions,fileRows};
});
