/* RADIX Trasporti — driver app. One driver, one vehicle: start the trip, photograph the documents (the AI reads
   them, the driver checks and confirms), log refuelling, close the trip. Position from the phone only while a trip is
   open; the command center normally reads it from the tracker already on the vehicle. */
(function(){
'use strict';
const DOC=window.RadixTrDocumenti,ST=window.RadixTrStore;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const view=$('view'),banner=$('banner');
const ME_KEY='radix-trasporti-autista';
let data=ST.load(),me=null,flow=null,watch=null;
try{me=JSON.parse(localStorage.getItem(ME_KEY)||'null');}catch{me=null;}
const save=()=>ST.save(data);
const nowIso=()=>ST.localIso(new Date());
const hm=s=>s?s.slice(11,16):'';
const dmy=s=>s?s.slice(8,10)+'/'+s.slice(5,7):'';
const driver=()=>data.drivers.find(d=>d.id===me?.driver);
const vehicle=()=>data.vehicles.find(v=>v.id===me?.vehicle);
const openTrip=()=>data.trips.find(t=>t.status==='aperto'&&t.vehicle_id===me?.vehicle&&t.driver_id===me?.driver);
function say(msg,kind){banner.textContent=msg||'';banner.className='tr-banner'+(kind?' '+kind:'');banner.hidden=!msg;}

// ---------- position: only with an open trip ----------
function recordPosition(trip){
 if(!trip||!navigator.geolocation)return;
 navigator.geolocation.getCurrentPosition(p=>{
  data.positions.push({vehicle_id:trip.vehicle_id,trip_id:trip.id,at:nowIso(),lat:Math.round(p.coords.latitude*1e5)/1e5,lon:Math.round(p.coords.longitude*1e5)/1e5,source:'telefono'});save();
 },()=>{},{enableHighAccuracy:false,maximumAge:120000,timeout:15000});
}
function followTrip(){
 const t=openTrip();
 if(watch){clearInterval(watch);watch=null;}
 if(t)watch=setInterval(()=>{const o=openTrip();if(o)recordPosition(o);else{clearInterval(watch);watch=null;}},5*60*1000);
}

// ---------- screens ----------
function render(){
 data=ST.load();
 $('changeWho').hidden=!me;
 if(!me||!driver()||!vehicle())return renderWho();
 $('who').textContent=driver().name;$('whoSub').textContent=' · '+vehicle().plate;
 if(flow)return renderFlow();
 const t=openTrip();
 if(!t)return renderIdle();
 return renderTrip(t);
}
function renderWho(){
 $('who').textContent='App autista';$('whoSub').textContent='';
 view.innerHTML='<section class="tr-card"><h1>Chi guida oggi?</h1><p class="tr-muted">Ogni telefono è legato a un autista e a un mezzo.</p>'
  +'<label>Autista<select id="selD">'+data.drivers.map(d=>'<option value="'+esc(d.id)+'"'+(me?.driver===d.id?' selected':'')+'>'+esc(d.name)+'</option>').join('')+'</select></label>'
  +'<label>Mezzo<select id="selV">'+data.vehicles.map(v=>'<option value="'+esc(v.id)+'">'+esc(v.plate+' · '+v.label)+'</option>').join('')+'</select></label>'
  +'<button class="tr-btn big" id="okWho">Conferma</button></section>';
 const sd=$('selD'),sv=$('selV');const sync=()=>{const d=data.drivers.find(x=>x.id===sd.value);if(d&&d.vehicle)sv.value=d.vehicle;};sync();sd.onchange=sync;
 $('okWho').onclick=()=>{me={driver:sd.value,vehicle:sv.value};localStorage.setItem(ME_KEY,JSON.stringify(me));render();};
}
function renderIdle(){
 const last=data.trips.filter(t=>t.vehicle_id===me.vehicle).sort((a,b)=>a.started_at<b.started_at?1:-1).slice(0,3);
 view.innerHTML='<section class="tr-card"><h1>Nuovo viaggio</h1>'
  +'<label>Cliente<select id="cus">'+data.customers.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('')+'</select></label>'
  +'<div class="tr-row"><label>Da<input id="orig" autocomplete="off" placeholder="Luogo di carico"></label><label>A<input id="dest" autocomplete="off" placeholder="Luogo di scarico"></label></div>'
  +'<button class="tr-btn big" id="start">Inizia viaggio</button><p class="tr-subtle">Da qui la posizione del mezzo viene registrata fino alla chiusura del viaggio.</p></section>'
  +(last.length?'<section class="tr-card"><h2>Ultimi viaggi</h2><ul class="tr-list">'+last.map(t=>'<li><strong>'+dmy(t.started_at)+'</strong> '+esc((t.origin||'')+' → '+(t.destination||''))+' <span class="tr-subtle">'+esc(t.status)+'</span></li>').join('')+'</ul></section>':'');
 $('start').onclick=()=>{
  const t={id:ST.uid(),vehicle_id:me.vehicle,driver_id:me.driver,customer_id:$('cus').value,status:'aperto',started_at:nowIso(),ended_at:null,origin:$('orig').value.trim()||null,destination:$('dest').value.trim()||null,km:null,revenue_cents:null};
  data.trips.push(t);save();recordPosition(t);followTrip();say('Viaggio iniziato alle '+hm(t.started_at)+'.','ok');render();
 };
}
function renderTrip(t){
 const docs=data.documents.filter(d=>d.trip_id===t.id),fuel=data.costs.filter(c=>c.trip_id===t.id&&c.kind==='carburante');
 const cus=data.customers.find(c=>c.id===t.customer_id);
 view.innerHTML='<section class="tr-card live"><p class="tr-eyebrow">Viaggio in corso dalle '+hm(t.started_at)+'</p><h1>'+esc((t.origin||'Partenza')+' → '+(t.destination||'Arrivo'))+'</h1><p class="tr-muted">'+esc(cus?cus.name:'')+'</p></section>'
  +'<section class="tr-actions">'
  +'<button class="tr-btn big" data-doc="ddt">Foto DDT</button><button class="tr-btn big" data-doc="cmr">Foto CMR</button>'
  +'<button class="tr-btn big ghost" data-doc="giornale">Giornale di viaggio</button><button class="tr-btn big ghost" data-doc="carburante">Rifornimento</button></section>'
  +'<section class="tr-card"><h2>Documenti del viaggio</h2>'+(docs.length?'<ul class="tr-list">'+docs.map(d=>'<li><strong>'+esc(DOC.KINDS[d.kind]?.label||d.kind)+'</strong> '+esc(d.fields.numero||'')+' <span class="tr-subtle">'+hm(d.at)+'</span></li>').join('')+'</ul>':'<p class="tr-muted">Ancora nessuno. Al carico fotografa il documento.</p>')
  +(fuel.length?'<p class="tr-subtle">Rifornimenti: '+fuel.map(f=>esc(f.liters+' l, '+(f.amount_cents/100).toFixed(2).replace('.',',')+' €')).join(' · ')+'</p>':'')+'</section>'
  +'<section class="tr-card"><h2>Fine viaggio</h2><label>Km percorsi (dal contachilometri)<input id="km" type="number" inputmode="numeric" min="0" max="20000"></label><button class="tr-btn big warn" id="close">Chiudi viaggio</button></section>';
 view.querySelectorAll('[data-doc]').forEach(b=>b.onclick=()=>startPhoto(b.dataset.doc,t));
 $('close').onclick=()=>{
  const km=parseInt($('km').value,10);
  if(!docs.length&&!confirm('Non c\'è nessun documento: chiudo lo stesso?'))return;
  t.km=Number.isFinite(km)&&km>=0?km:null;t.ended_at=nowIso();t.status='chiuso';
  const c=data.customers.find(x=>x.id===t.customer_id);if(c&&c.rate_kind==='km'&&t.km)t.revenue_cents=Math.round(t.km*c.rate_cents/100)*100;
  recordPosition({...t});save();followTrip();say('Viaggio chiuso alle '+hm(t.ended_at)+'. Grazie!','ok');render();
 };
}

// ---------- photo → reading → confirm ----------
function startPhoto(kind,trip){
 const input=$('photo');input.value='';
 input.onchange=async()=>{const f=input.files&&input.files[0];if(!f)return;flow={kind,trip:trip.id,file:f,stage:'reading'};render();
  try{const img=await shrink(f);flow.preview=img.preview;render();const r=await readDocument(kind,img);flow.reading=r.reading;flow.demo=r.demo;flow.stage='confirm';}
  catch(e){flow.reading=DOC.parseReading(kind,null);flow.reading.note=e.message;flow.stage='confirm';}
  render();};
 input.click();
}
async function shrink(file){
 if(file.type==='application/pdf'){const b=await file.arrayBuffer();if(b.byteLength>3000000)throw new Error('PDF troppo grande: fotografa il documento.');return {media_type:'application/pdf',image:b64(b),preview:null};}
 const url=URL.createObjectURL(file);
 try{
  const im=await new Promise((ok,ko)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>ko(new Error('Foto non leggibile.'));i.src=url;});
  const max=1600,k=Math.min(1,max/Math.max(im.width,im.height));const c=document.createElement('canvas');c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);
  c.getContext('2d').drawImage(im,0,0,c.width,c.height);const du=c.toDataURL('image/jpeg',0.82);
  return {media_type:'image/jpeg',image:du.split(',')[1],preview:du};
 }finally{URL.revokeObjectURL(url);}
}
function b64(buf){let s='';const a=new Uint8Array(buf);for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode.apply(null,a.subarray(i,i+32768));return btoa(s);}
async function readDocument(kind,img){
 try{
  const r=await fetch('/api/trasporti',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Radix-Trasporti':'1'},body:JSON.stringify({action:'documento.leggi',data:{kind,image:img.image,media_type:img.media_type}})});
  let j={};try{j=await r.json();}catch{}
  if(r.ok&&j.reading)return {reading:j.reading,demo:false};
  if(r.status===401||r.status===503||r.status===404)return {reading:demoReading(kind),demo:true,why:j.error};
  throw new Error(j.error||'Lettura non riuscita ('+r.status+').');
 }catch(e){if(e instanceof TypeError)return {reading:demoReading(kind),demo:true};throw e;}
}
// Without login or without the AI key: an example reading, clearly marked, so the flow can be tried.
function demoReading(kind){
 const v=vehicle(),t=data.trips.find(x=>x.id===flow.trip)||{};const d=nowIso().slice(0,10);
 const sample={ddt:{numero:{valore:'4187',sicurezza:'alta'},data:{valore:d,sicurezza:'alta'},mittente:{valore:'Latteria Valpadana Srl',sicurezza:'alta'},destinatario:{valore:'Supermercati Nord Spa',sicurezza:'media'},luogo_carico:{valore:t.origin||'Cremona',sicurezza:'alta'},luogo_scarico:{valore:t.destination||'Verona',sicurezza:'media'},merce:{valore:'Formaggi stagionati',sicurezza:'alta'},colli:{valore:'24',sicurezza:'alta'},peso_kg:{valore:'18.450',sicurezza:'bassa'},targa:{valore:v.plate,sicurezza:'alta'}},
  cmr:{numero:{valore:'IT 0045123',sicurezza:'alta'},mittente:{valore:'Ortofrutta Delta Spa',sicurezza:'alta'},destinatario:{valore:'Frischmarkt GmbH',sicurezza:'media'},luogo_carico:{valore:t.origin||'Cremona',sicurezza:'alta'},luogo_scarico:{valore:t.destination||'München',sicurezza:'alta'},paese_carico:{valore:'IT',sicurezza:'alta'},paese_scarico:{valore:'DE',sicurezza:'alta'},merce:{valore:'Mele in casse',sicurezza:'alta'},colli:{valore:'33 pallet',sicurezza:'media'},peso_kg:{valore:'21800',sicurezza:'alta'},targa:{valore:v.plate,sicurezza:'alta'}},
  giornale:{numero:{valore:'GV-2026-118',sicurezza:'alta'},specie:{valore:'Bovini',sicurezza:'alta'},numero_animali:{valore:'26',sicurezza:'alta'},luogo_partenza:{valore:t.origin||'Allevamento Bassa, Cremona',sicurezza:'alta'},partenza:{valore:d+' 05:40',sicurezza:'media'},luogo_destinazione:{valore:t.destination||'Macello di Modena',sicurezza:'alta'},durata_ore:{valore:'3',sicurezza:'bassa'},targa:{valore:v.plate,sicurezza:'alta'}},
  carburante:{data:{valore:d,sicurezza:'alta'},distributore:{valore:'Stazione di servizio A21',sicurezza:'media'},prodotto:{valore:'Gasolio',sicurezza:'alta'},litri:{valore:'312,40',sicurezza:'alta'},prezzo_litro:{valore:'1,619',sicurezza:'alta'},importo:{valore:'505,78',sicurezza:'alta'},km:{valore:'',sicurezza:'bassa'},targa:{valore:v.plate,sicurezza:'alta'}}}[kind];
 return DOC.parseReading(kind,{tipo:kind,leggibile:true,campi:sample});
}
function renderFlow(){
 const k=DOC.KINDS[flow.kind];
 if(flow.stage==='reading'){view.innerHTML='<section class="tr-card"><h1>'+esc(k.label)+'</h1>'+(flow.preview?'<img class="tr-preview" alt="Foto del documento" src="'+flow.preview+'">':'')+'<p class="tr-muted">Sto leggendo il documento…</p></section>';return;}
 const r=flow.reading,check=new Set(r.da_controllare);
 const input=([key,label,type])=>{const v=r.campi[key];const val=v==null?'':type==='date'?v:type==='datetime'?v:String(v).replace('.',type==='money'||type==='number'?',':'.');
  return '<label class="'+(check.has(key)?'check':'')+'">'+esc(label)+(check.has(key)?' <span class="tr-flag">da controllare</span>':'')+'<input name="'+esc(key)+'" value="'+esc(val)+'"'+(type==='date'?' type="date"':type==='datetime'?' type="datetime-local"':type==='int'||type==='number'||type==='money'?' inputmode="decimal"':'')+'></label>';};
 view.innerHTML='<section class="tr-card"><h1>Controlla e conferma</h1><p class="tr-muted">'+esc(k.name)+'</p>'
  +(flow.demo?'<p class="tr-banner demo">Lettura di esempio: la lettura automatica funziona dopo l\'accesso a RADIX. Correggi i campi come faresti con un documento vero.</p>':'')
  +(r.note?'<p class="tr-banner">'+esc(r.note)+'</p>':'')
  +(flow.preview?'<img class="tr-preview" alt="Foto del documento" src="'+flow.preview+'">':'')
  +'<form id="docForm" class="tr-form">'+k.fields.map(input).join('')+'<p class="tr-error" id="docErr" hidden></p>'
  +'<div class="tr-row"><button type="button" class="tr-btn ghost" id="cancel">Annulla</button><button class="tr-btn">Conferma e invia</button></div></form></section>';
 $('cancel').onclick=()=>{flow=null;render();};
 $('docForm').onsubmit=e=>{e.preventDefault();
  const campi={};for(const el of e.target.elements)if(el.name)campi[el.name]=el.value;
  const res=DOC.checkConfirmed(flow.kind,campi);
  if(!res.ok){$('docErr').textContent=res.errors.join(' ');$('docErr').hidden=false;return;}
  const corrected=Object.keys(res.values).filter(k2=>JSON.stringify(res.values[k2])!==JSON.stringify(r.campi[k2])).length;
  const trip=data.trips.find(t=>t.id===flow.trip);
  if(flow.kind==='carburante'){
   const v=res.values;data.costs.push({id:ST.uid(),kind:'carburante',date:v.data,amount_cents:Math.round(v.importo*100),liters:v.litri,km:v.km,vehicle_id:trip.vehicle_id,driver_id:trip.driver_id,trip_id:trip.id,description:'Rifornimento '+(v.distributore||''),fields:v});
  }
  data.documents.push({id:ST.uid(),trip_id:flow.trip,kind:flow.kind,at:nowIso(),fields:res.values,read:r.campi,corrected,confirmed:true,demo:!!flow.demo});
  save();recordPosition(trip);flow=null;say(k.label+' salvato nel viaggio.'+(corrected?' Hai corretto '+corrected+' campi.':''),'ok');render();
 };
}

$('changeWho').onclick=()=>{me=null;localStorage.removeItem(ME_KEY);flow=null;render();};
render();followTrip();
})();
