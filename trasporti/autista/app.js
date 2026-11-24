/* Plancia (Trasporti) — driver app, Android first (installable from Chrome, works without signal).
   One driver, one vehicle: start the trip, photograph the documents (the AI reads them, the driver checks and
   confirms), log refuelling, report a problem to the office, have the delivery signed, close the trip.
   Without signal the driver fills in the main fields and the photo waits on the phone (IndexedDB): it is read as soon
   as the network comes back and the office sees where the reading differs from what the driver typed.
   The phone is the tracker, always on from the driver's sign-in (the company has the agreements with the drivers):
   a point every 2 minutes when moving, every 10 when still, sent to the server in batches. In the native app
   (mobile/, Capacitor) it records with the screen off; in the browser only while the app is open. Where the vehicle
   also has a tracker the command center prefers the tracker and uses the phone where the tracker is silent. */
(function(){
'use strict';
const DOC=window.RadixTrDocumenti,ST=window.RadixTrStore;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const view=$('view'),banner=$('banner');
const ME_KEY='radix-trasporti-autista';
const ISSUE={ritardo:'Ritardo',attesa:'Attesa al carico/scarico',guasto:'Guasto al mezzo',incidente:'Incidente',merce:'Merce o carico',altro:'Altro'};
let data=ST.load(),me=null,flow=null,watch=null;
try{me=JSON.parse(localStorage.getItem(ME_KEY)||'null');}catch{me=null;}
const LIVE=window.RadixTrLive,live=()=>!!(LIVE&&LIVE.live()&&LIVE.role()==='driver'),liveInfo=()=>ST.live()||{};
const save=()=>{if(!ST.save(data))say('Memoria del telefono piena: chiedi all\'ufficio di scaricare i dati.','error');};
const nowIso=()=>ST.localIso(new Date());
const hm=s=>s?s.slice(11,16):'';
const dmy=s=>s?s.slice(8,10)+'/'+s.slice(5,7):'';
const driver=()=>data.drivers.find(d=>d.id===me?.driver);
const vehicle=()=>data.vehicles.find(v=>v.id===me?.vehicle);
const openTrip=()=>data.trips.find(t=>t.status==='aperto'&&t.vehicle_id===me?.vehicle&&t.driver_id===me?.driver);
function say(msg,kind){banner.textContent=msg||'';banner.className='tr-banner'+(kind?' '+kind:'');banner.hidden=!msg;}
const online=()=>navigator.onLine!==false;

// ---------- photos waiting for the network (IndexedDB: photos are too big for localStorage) ----------
const Q={
 db:null,
 open(){if(this.db)return Promise.resolve(this.db);return new Promise((ok,ko)=>{if(!window.indexedDB)return ko(new Error('no idb'));const r=indexedDB.open('plancia-autista',1);r.onupgradeneeded=()=>r.result.createObjectStore('queue',{keyPath:'id'});r.onsuccess=()=>{this.db=r.result;ok(this.db);};r.onerror=()=>ko(r.error);});},
 async tx(mode,fn){const db=await this.open();return new Promise((ok,ko)=>{const t=db.transaction('queue',mode);const s=t.objectStore('queue');const r=fn(s);t.oncomplete=()=>ok(r&&r.result);t.onerror=()=>ko(t.error);});},
 put(item){return this.tx('readwrite',s=>s.put(item));},
 all(){return this.tx('readonly',s=>s.getAll());},
 del(id){return this.tx('readwrite',s=>s.delete(id));}
};
let flushing=false;
async function flushQueue(){
 if(flushing||!online())return;flushing=true;
 try{
  const items=await Q.all().catch(()=>[]);let done=0;
  for(const it of items||[]){
   // the photo itself, kept for the office (real company only)
   if(it.type==='file'){
    if(!live()){await Q.del(it.id);continue;}
    try{await LIVE.post('file.salva',{id:it.file_id,media_type:it.img.media_type,image:it.img.image,trip_id:it.trip_id});await Q.del(it.id);}
    catch(e){if(e.offline)break;if([400,403,413].includes(e.status))await Q.del(it.id);}
    continue;
   }
   try{
    const r=await readDocument(it.kind,it.img,{noDemo:true});
    data=ST.load();const d=data.documents.find(x=>x.id===it.doc_id);
    if(d){d.read=r.reading.campi;d.pending=false;d.later_diff=Object.keys(d.fields).filter(k=>r.reading.campi[k]!=null&&JSON.stringify(r.reading.campi[k])!==JSON.stringify(d.fields[k]));save();}
    await Q.del(it.id);done++;
   }catch(e){if(e&&e.offline)break;if(e&&e.permanent){await Q.del(it.id);}}
  }
  if(done)say(done===1?'Una foto rimasta in attesa è stata letta e inviata all\'ufficio.':done+' foto rimaste in attesa sono state lette e inviate all\'ufficio.','ok');
 }finally{flushing=false;updateOffline();}
}
async function updateOffline(){
 const n=((await Q.all().catch(()=>[]))||[]).length;const el=$('offline');
 el.hidden=online()&&!n;
 el.textContent=!online()?'Sei senza rete: puoi continuare, i dati restano sul telefono'+(n?' ('+n+' foto in attesa)':'')+'.':n?n+' foto in attesa di lettura: le invio appena possibile.':'';
}
window.addEventListener('online',()=>{updateOffline();flushQueue();});
window.addEventListener('offline',updateOffline);

// ---------- position: the phone is the tracker, always on from the driver's sign-in ----------
// Native app (Android/iPhone, Capacitor + background geolocation): records with the screen off and in the pocket.
// Browser: records only while Plancia is open, so the screen is kept on. Points go to the server (tr_positions)
// in batches; without signal they wait on the phone and leave when the network comes back.
function phoneTracking(){const v=vehicle();return !!me&&(!v||v.phone_off!==true);}
const GPSQ='plancia-gps-coda';
const gps={id:null,native:null,last:null,lock:null,error:null,server:null,sent:null};
const BG=()=>window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.BackgroundGeolocation||null;
const distM=(a,b)=>{const R=6371000,r=Math.PI/180,dl=(b.lat-a.lat)*r,dn=(b.lon-a.lon)*r;const h=Math.sin(dl/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h));};
function queue(){try{return JSON.parse(localStorage.getItem(GPSQ)||'[]');}catch{return [];}}
function setQueue(q){try{localStorage.setItem(GPSQ,JSON.stringify(q.slice(-20000)));}catch{}}
function keepPoint(c,force){
 if(!me)return;
 const trip=openTrip();
 const pt={vehicle_id:me.vehicle,trip_id:trip?trip.id:null,at:nowIso(),lat:Math.round(c.latitude*1e5)/1e5,lon:Math.round(c.longitude*1e5)/1e5,speed_kmh:c.speed!=null&&c.speed>=0?Math.round(c.speed*3.6):null,accuracy_m:c.accuracy!=null?Math.round(c.accuracy):null,source:'telefono'};
 if(pt.accuracy_m!=null&&pt.accuracy_m>500&&!force)return;
 const L=gps.last,age=L?(Date.now()-L.t)/60000:Infinity,moved=L?distM(L,pt):Infinity;
 // moving: one point every 2 minutes; standing still (under 150 m): one every 10 minutes
 if(!force&&!(age>=2&&moved>=150)&&!(age>=10))return;
 if(force&&age<0.5)return; // several forced readings in a row (sign-in, trip start): one is enough
 gps.last={t:Date.now(),lat:pt.lat,lon:pt.lon,at:pt.at};gps.error=null;
 data=ST.load();data.positions.push(pt);save();
 const q=queue();q.push({at:new Date().toISOString(),lat:pt.lat,lon:pt.lon,speed_kmh:pt.speed_kmh,accuracy_m:pt.accuracy_m,trip_id:pt.trip_id});setQueue(q);
 showGps();
 if(force||q.length===1)setTimeout(flushGps,1500); // sign-in, start and end of a trip reach the office at once
}
let gpsFlushing=false;
async function flushGps(){
 if(gpsFlushing||!online()||gps.server==="off")return;const q=queue();if(!q.length)return;
 gpsFlushing=true;
 try{
  const batch=q.slice(0,1000);
  const r=await fetch('/api/trasporti',{method:'POST',credentials:'same-origin',headers:ST.headers(),body:JSON.stringify({action:'posizioni.telefono',data:{vehicle_id:me&&me.vehicle,points:batch}})});
  if(r.ok){setQueue(queue().slice(batch.length));gps.sent=nowIso();gps.server=null;}
  // demo without an account, or archive not configured: positions stay on this phone
  else if([401,403,404,503].includes(r.status))gps.server='off';
 }catch{}finally{gpsFlushing=false;showGps();}
}
function recordPosition(){
 if(!navigator.geolocation||!phoneTracking())return;
 navigator.geolocation.getCurrentPosition(p=>keepPoint(p.coords,true),e=>{gps.error=e.code===1?'permesso negato':'segnale GPS assente';showGps();},{enableHighAccuracy:true,maximumAge:60000,timeout:20000});
}
async function lockScreen(on){
 if(BG())return; // the native app records with the screen off
 try{if(on&&!gps.lock&&navigator.wakeLock){gps.lock=await navigator.wakeLock.request('screen');gps.lock.addEventListener('release',()=>{gps.lock=null;showGps();});}
  if(!on&&gps.lock){await gps.lock.release();gps.lock=null;}}catch{gps.lock=null;}
 showGps();
}
async function stopTracking(){
 if(watch){clearInterval(watch);watch=null;}
 if(gps.id!=null&&navigator.geolocation){navigator.geolocation.clearWatch(gps.id);gps.id=null;}
 if(gps.native&&BG()){try{await BG().removeWatcher({id:gps.native});}catch{}gps.native=null;}
}
async function followTrip(){
 await stopTracking();
 if(!phoneTracking()){lockScreen(false);showGps();return;}
 const bg=BG();
 if(bg){
  try{gps.native=await bg.addWatcher({backgroundTitle:'Plancia',backgroundMessage:'Plancia registra la posizione del mezzo.',requestPermissions:true,stale:false,distanceFilter:50},
   (loc,err)=>{if(err){gps.error=err.code==='NOT_AUTHORIZED'?'permesso negato':'segnale GPS assente';showGps();return;}if(loc)keepPoint({latitude:loc.latitude,longitude:loc.longitude,accuracy:loc.accuracy,speed:loc.speed},false);});}
  catch{gps.error='localizzazione non disponibile';}
 }else if(navigator.geolocation){
  gps.id=navigator.geolocation.watchPosition(p=>keepPoint(p.coords,false),e=>{gps.error=e.code===1?'permesso negato':'segnale GPS assente';showGps();},{enableHighAccuracy:true,maximumAge:30000,timeout:60000});
  lockScreen(true);
 }
 // a still truck sends no events: a point every 10 minutes anyway; positions leave every 2 minutes
 recordPosition();
 watch=setInterval(()=>{recordPosition();},10*60*1000);
 if(!window.__gpsFlush)window.__gpsFlush=setInterval(flushGps,2*60*1000);
 showGps();
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&phoneTracking()){lockScreen(true);recordPosition();flushGps();}});
window.addEventListener('online',()=>flushGps());
function showGps(){
 const el=document.getElementById('gpsState');if(!el)return;
 if(!me){el.hidden=true;return;}el.hidden=false;
 const n=queue().length;
 el.className='tr-gps'+(gps.error?' bad':'');
 el.innerHTML=gps.error?'<strong>Posizione non attiva</strong> ('+esc(gps.error)+'). Accendi la localizzazione e consenti a Plancia di usarla «sempre».'
  :'<strong>Posizione attiva</strong> · il telefono fa da localizzatore'+(gps.last?' · ultima alle '+hm(gps.last.at):'')
   +(gps.server==='off'?'':n?' · '+n+' da inviare':gps.sent?' · inviate alle '+hm(gps.sent):'')
   +'<br><span class="tr-subtle">'+(BG()?'Registra anche a schermo spento.':'Nel browser registra solo con Plancia aperta'+(gps.lock?' (schermo sempre acceso)':'')+': con l\'app Plancia installata registra sempre.')+'</span>';
}

// ---------- screens ----------
function render(){
 data=ST.load();
 $('changeWho').hidden=!me||!vehicle();
 $('foot').textContent=live()?(liveInfo().company||'Plancia')+': quello che fai qui arriva in ufficio. Senza rete continua a funzionare e parte appena torna.':'Dimostrazione: i dati restano su questo telefono.';
 if(live()&&me&&me.driver!==liveInfo().driver_id){me={driver:liveInfo().driver_id,vehicle:null};localStorage.setItem(ME_KEY,JSON.stringify(me));}
 if(!me||!driver()||!vehicle())return live()?renderVehicle():renderWho();
 $('who').textContent=driver().name;$('whoSub').textContent=' · '+vehicle().plate;
 if(flow)return ({photo:renderFlow,issue:renderIssue,delivery:renderDelivery})[flow.type]();
 const t=openTrip();
 if(!t)return renderIdle();
 return renderTrip(t);
}
function renderWho(){
 $('who').textContent=window.TR_BRAND?TR_BRAND.app:'App autista';$('whoSub').textContent='';
 const drivers=data.drivers.filter(d=>d.active!==false),vehicles=data.vehicles.filter(v=>v.active!==false);
 view.innerHTML='<section class="tr-card"><h1>Chi guida oggi?</h1><p class="tr-muted">Ogni telefono è legato a un autista e a un mezzo.</p>'
  +'<label>Autista<select id="selD">'+drivers.map(d=>'<option value="'+esc(d.id)+'"'+(me?.driver===d.id?' selected':'')+'>'+esc(d.name)+'</option>').join('')+'</select></label>'
  +'<label>Mezzo<select id="selV">'+vehicles.map(v=>'<option value="'+esc(v.id)+'">'+esc(v.plate+(v.label?' · '+v.label:''))+'</option>').join('')+'</select></label>'
  +'<button class="tr-btn big" id="okWho">Conferma</button></section>'
  +'<section class="tr-card"><h2>Hai il codice dell\'ufficio?</h2><p class="tr-muted">Te lo manda la tua azienda: lo scrivi una volta sola e questo telefono resta collegato.</p>'
  +'<form id="codeForm"><label>Codice<input id="code" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="ABCDE-FGHJK" required></label><p class="tr-banner error" id="codeErr" hidden></p><button class="tr-btn big ghost" id="codeGo">Collega il telefono</button></form></section>';
 $('codeForm').onsubmit=e=>{e.preventDefault();enterCode($('code').value);};
 const sd=$('selD'),sv=$('selV');const sync=()=>{const d=data.drivers.find(x=>x.id===sd.value);if(d&&d.vehicle)sv.value=d.vehicle;};sync();sd.onchange=sync;
 $('okWho').onclick=()=>{me={driver:sd.value,vehicle:sv.value};localStorage.setItem(ME_KEY,JSON.stringify(me));render();followTrip();};
}
// the driver entered with the code of the office: the phone is theirs, they only choose the vehicle of the day
function renderVehicle(){
 const d=driver(),vehicles=data.vehicles.filter(v=>v.active!==false);
 $('who').textContent=d?d.name:(window.TR_BRAND?TR_BRAND.app:'Plancia');$('whoSub').textContent='';
 if(!d||!vehicles.length){
  const st=LIVE.status();
  view.innerHTML='<section class="tr-card"><h1>'+(st.error==='accesso'?'Telefono non più collegato':st.ok===false?'Non riesco a scaricare i dati':'Sto scaricando i tuoi dati…')+'</h1><p class="tr-muted">'+(st.error==='accesso'?'Chiedi un nuovo codice all\'ufficio.':st.error==='offline'?'Sei senza rete: riprova appena torna.':st.ok===false?'Riprova tra poco.':d?'L\'ufficio non ha ancora inserito i mezzi.':'Un attimo.')+'</p><button class="tr-btn big" id="again">Riprova</button>'+(st.error==='accesso'?'<button class="tr-btn big ghost" id="newCode">Inserisci un nuovo codice</button>':'')+'</section>';
  $('again').onclick=()=>LIVE.run();if($('newCode'))$('newCode').onclick=async()=>{await LIVE.leave();location.reload();};
  return;
 }
 const first=d.name.split(' ')[0];
 view.innerHTML='<section class="tr-card"><h1>Ciao '+esc(first)+', che mezzo guidi oggi?</h1>'
  +'<label>Mezzo<select id="selV">'+vehicles.map(v=>'<option value="'+esc(v.id)+'"'+((me.vehicle||d.vehicle)===v.id?' selected':'')+'>'+esc(v.plate+(v.label?' · '+v.label:''))+'</option>').join('')+'</select></label>'
  +'<button class="tr-btn big" id="okWho">Conferma</button></section>';
 $('okWho').onclick=()=>{me={driver:d.id,vehicle:$('selV').value};localStorage.setItem(ME_KEY,JSON.stringify(me));render();followTrip();};
}
let entering=false;
async function enterCode(code){
 if(entering)return;entering=true;const err=$('codeErr'),btn=$('codeGo');if(btn){btn.disabled=true;btn.textContent='Collego…';}
 try{await LIVE.enter(code);location.replace('/trasporti/autista/');}
 catch(e){entering=false;const msg=e.offline?'Sei senza rete: serve la connessione solo per questo primo passo.':e.message;if(err){err.textContent=msg;err.hidden=false;}else say(msg,'error');if(btn){btn.disabled=false;btn.textContent='Collega il telefono';}}
}
// deadlines of the vehicle the driver is on (revisione, assicurazione, tachigrafo…) within 30 days
const DUE=[['due_revisione','Revisione'],['due_assicurazione','Assicurazione'],['due_tachigrafo','Tachigrafo'],['due_bollo','Bollo'],['due_atp','ATP']];
function dueHtml(){
 const v=vehicle();if(!v)return '';const today=Date.parse(nowIso().slice(0,10)+'T00:00:00Z');
 const list=DUE.filter(([k])=>v[k]).map(([k,l])=>({l,d:v[k],days:Math.round((Date.parse(v[k]+'T00:00:00Z')-today)/86400000)})).filter(x=>x.days<=30).sort((a,b)=>a.days-b.days);
 return list.length?'<section class="tr-card"><h2>Scadenze di '+esc(v.plate)+'</h2><ul class="tr-list">'+list.map(x=>'<li><strong>'+esc(x.l)+'</strong> '+(x.days<0?'<span class="tr-flag">scaduta il '+dmy(x.d)+'</span>':'scade il '+dmy(x.d))+'</li>').join('')+'</ul><p class="tr-subtle">Se è già fatta, avvisa l\'ufficio.</p></section>':'';
}
function renderIdle(){
 const last=data.trips.filter(t=>t.vehicle_id===me.vehicle).sort((a,b)=>a.started_at<b.started_at?1:-1).slice(0,3);
 const places=[...new Set(data.trips.flatMap(t=>[t.origin,t.destination]).filter(Boolean))].slice(0,40);
 const planned=data.trips.filter(t=>t.status==='pianificato'&&(t.driver_id===me.driver||!t.driver_id&&t.vehicle_id===me.vehicle)).sort((a,b)=>a.started_at<b.started_at?-1:1).slice(0,6);
 const cname=id=>(data.customers.find(c=>c.id===id)||{}).name||'';
 view.innerHTML=(planned.length?'<section class="tr-card live"><h1>Viaggi assegnati</h1><ul class="tr-list">'+planned.map(t=>'<li><strong>'+dmy(t.started_at)+' '+hm(t.started_at)+'</strong> '+esc((t.origin||'')+' → '+(t.destination||''))+'<br><span class="tr-subtle">'+esc(cname(t.customer_id))+'</span>'+(t.note?'<br>'+esc(t.note):'')+'<button class="tr-btn big" style="margin-top:8px" data-go="'+esc(t.id)+'">Inizia questo viaggio</button></li>').join('')+'</ul></section>':'')
  +'<section class="tr-card"><h1>Nuovo viaggio</h1>'
  +'<label>Cliente<select id="cus">'+data.customers.filter(c=>c.active!==false).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('')+'</select></label>'
  +'<div class="tr-row"><label>Da<input id="orig" list="places" autocomplete="off" placeholder="Luogo di carico"></label><label>A<input id="dest" list="places" autocomplete="off" placeholder="Luogo di scarico"></label></div>'
  +'<datalist id="places">'+places.map(p=>'<option value="'+esc(p)+'">').join('')+'</datalist>'
  +'<button class="tr-btn big" id="start">Inizia viaggio</button><p class="tr-subtle">'+(phoneTracking()?'Questo telefono fa da localizzatore del mezzo.':'La posizione arriva dal localizzatore del mezzo: questo telefono non la registra.')+'</p><p id="gpsState" class="tr-gps" hidden></p></section>'
  +dueHtml()
  +(last.length?'<section class="tr-card"><h2>Ultimi viaggi</h2><ul class="tr-list">'+last.map(t=>'<li><strong>'+dmy(t.started_at)+'</strong> '+esc((t.origin||'')+' → '+(t.destination||''))+' <span class="tr-subtle">'+esc(t.status)+'</span></li>').join('')+'</ul></section>':'');
 view.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{data=ST.load();const t=data.trips.find(x=>x.id===b.dataset.go&&x.status==='pianificato');if(!t){render();return;}
  t.planned_at=t.started_at;t.status='aperto';t.started_at=nowIso();t.vehicle_id=me.vehicle;t.driver_id=me.driver;save();recordPosition(t);followTrip();say('Viaggio iniziato alle '+hm(t.started_at)+'.','ok');render();});
 $('start').onclick=()=>{
  data=ST.load();
  const t={id:ST.uid(),vehicle_id:me.vehicle,driver_id:me.driver,customer_id:$('cus').value,status:'aperto',started_at:nowIso(),ended_at:null,origin:$('orig').value.trim()||null,destination:$('dest').value.trim()||null,km:null,revenue_cents:null};
  data.trips.push(t);save();recordPosition(t);followTrip();say('Viaggio iniziato alle '+hm(t.started_at)+'.','ok');render();
 };
 showGps();
}
function renderTrip(t){
 const docs=data.documents.filter(d=>d.trip_id===t.id),fuel=data.costs.filter(c=>c.trip_id===t.id&&c.kind==='carburante'),spese=data.costs.filter(c=>c.trip_id===t.id&&c.source==='spesa'),issues=(data.issues||[]).filter(i=>i.trip_id===t.id);
 const cus=data.customers.find(c=>c.id===t.customer_id);
 const label=d=>d.kind==='consegna'?'Consegna firmata':DOC.KINDS[d.kind]?.label||d.kind;
 view.innerHTML='<section class="tr-card live"><p class="tr-eyebrow">Viaggio in corso dalle '+hm(t.started_at)+'</p><h1>'+esc((t.origin||'Partenza')+' → '+(t.destination||'Arrivo'))+'</h1><p class="tr-muted">'+esc(cus?cus.name:'')+'</p><p id="gpsState" class="tr-gps" hidden></p></section>'
  +'<section class="tr-actions">'
  +'<button class="tr-btn big" data-doc="ddt">Foto DDT</button><button class="tr-btn big" data-doc="cmr">Foto CMR</button>'
  +'<button class="tr-btn big blue" data-doc="giornale">Giornale di viaggio</button><button class="tr-btn big blue" data-doc="carburante">Rifornimento</button>'
  +'<button class="tr-btn big blue" data-doc="spesa">Altra spesa</button>'
  +'<button class="tr-btn big blue" id="pod">Consegna e firma</button><button class="tr-btn big ghost" id="issue">Segnala un problema</button></section>'
  +'<section class="tr-card"><h2>Documenti del viaggio</h2>'+(docs.length?'<ul class="tr-list">'+docs.map(d=>'<li><strong>'+esc(label(d))+'</strong> '+esc(d.fields.numero||d.fields.ricevuto_da||'')+' <span class="tr-subtle">'+hm(d.at)+(d.pending?' · foto in attesa di rete':'')+'</span></li>').join('')+'</ul>':'<p class="tr-muted">Ancora nessuno. Al carico fotografa il documento.</p>')
  +(fuel.length?'<p class="tr-subtle">Rifornimenti: '+fuel.map(f=>esc((f.liters??'?')+' l, '+(f.amount_cents/100).toFixed(2).replace('.',',')+' €')).join(' · ')+'</p>':'')
  +(spese.length?'<p class="tr-subtle">Spese: '+spese.map(f=>esc((f.fields&&f.fields.tipo||'spesa')+' '+(f.amount_cents/100).toFixed(2).replace('.',',')+' €')).join(' · ')+'</p>':'')
  +(issues.length?'<p class="tr-subtle">Segnalazioni: '+issues.map(i=>esc((ISSUE[i.kind]||i.kind)+' alle '+hm(i.at))+(i.resolved?' (gestita)':'')).join(' · ')+'</p>':'')+'</section>'
  +'<section class="tr-card"><h2>Fine viaggio</h2><label>Km percorsi (dal contachilometri)<input id="km" type="number" inputmode="numeric" min="0" max="20000"></label><button class="tr-btn big warn" id="close">Chiudi viaggio</button></section>';
 view.querySelectorAll('[data-doc]').forEach(b=>b.onclick=()=>startPhoto(b.dataset.doc,t));showGps();
 $('pod').onclick=()=>{flow={type:'delivery',trip:t.id};render();};
 $('issue').onclick=()=>{flow={type:'issue',trip:t.id};render();};
 $('close').onclick=()=>{
  const km=parseInt($('km').value,10);
  if(!docs.some(d=>d.kind!=='consegna')&&!confirm('Non c\'è nessun documento di trasporto: chiudo lo stesso?'))return;
  if(!docs.some(d=>d.kind==='consegna')&&!confirm('La consegna non è firmata: chiudo lo stesso?'))return;
  data=ST.load();const tt=data.trips.find(x=>x.id===t.id);
  tt.km=Number.isFinite(km)&&km>=0?km:null;tt.ended_at=nowIso();tt.status='chiuso';
  const c=data.customers.find(x=>x.id===tt.customer_id);if(c&&c.rate_kind==='km'&&tt.km&&c.rate_cents!=null)tt.revenue_cents=Math.round(tt.km*c.rate_cents/100)*100;else if(c&&c.rate_kind==='viaggio'&&c.rate_cents!=null)tt.revenue_cents=c.rate_cents;
  save();recordPosition({...tt});followTrip();say('Viaggio chiuso alle '+hm(tt.ended_at)+'. Grazie!','ok');render();
 };
}

// ---------- report a problem ----------
function renderIssue(){
 view.innerHTML='<section class="tr-card"><h1>Segnala un problema</h1><p class="tr-muted">L\'ufficio lo vede subito nel centro operativo.</p><form id="issueForm">'
  +'<div class="tr-actions">'+Object.entries(ISSUE).map(([k,l],i)=>'<label style="margin:0"><input type="radio" name="kind" value="'+k+'"'+(i===0?' checked':'')+' style="width:auto;margin-right:6px">'+esc(l)+'</label>').join('')+'</div>'
  +'<label>Cosa succede<textarea name="text" rows="3" maxlength="500" placeholder="Es. coda in A21, 40 minuti di ritardo"></textarea></label>'
  +'<button type="button" class="tr-btn ghost" id="issuePhoto">Aggiungi una foto</button><div id="issuePrev"></div>'
  +'<div class="tr-row" style="margin-top:12px"><button type="button" class="tr-btn ghost" id="cancel">Annulla</button><button class="tr-btn">Invia</button></div></form></section>';
 $('cancel').onclick=()=>{flow=null;render();};
 $('issuePhoto').onclick=()=>pick(async f=>{const img=await shrink(f,900,0.7);flow.photo=img.preview;$('issuePrev').innerHTML='<img class="tr-preview" alt="Foto della segnalazione" src="'+img.preview+'">';});
 $('issueForm').onsubmit=e=>{e.preventDefault();const el=e.target.elements;data=ST.load();const t=data.trips.find(x=>x.id===flow.trip);
  data.issues=data.issues||[];data.issues.push({id:ST.uid(),trip_id:t.id,vehicle_id:t.vehicle_id,driver_id:t.driver_id,at:nowIso(),kind:el.kind.value,text:el.text.value.trim().slice(0,500)||null,photo:flow.photo||null,resolved:false});
  save();flow=null;say('Segnalazione inviata all\'ufficio.','ok');render();};
}

// ---------- delivery with signature ----------
function renderDelivery(){
 view.innerHTML='<section class="tr-card"><h1>Consegna</h1><p class="tr-muted">Fai firmare chi riceve la merce sullo schermo.</p><form id="podForm">'
  +'<label>Ricevuto da (nome e cognome)<input name="who" required autocomplete="off"></label>'
  +'<label>Riserve o note (merce danneggiata, colli mancanti…)<textarea name="notes" rows="2" maxlength="500"></textarea></label>'
  +'<p class="tr-subtle" style="margin:0 0 4px">Firma qui sotto</p><canvas class="tr-sign" id="sign" aria-label="Spazio per la firma"></canvas><button type="button" class="tr-link" id="clearSign">Cancella la firma</button>'
  +'<button type="button" class="tr-btn ghost" id="podPhoto" style="width:100%;margin-top:8px">Foto della merce scaricata (facoltativa)</button><div id="podPrev"></div>'
  +'<p class="tr-error" id="podErr" hidden></p><div class="tr-row" style="margin-top:12px"><button type="button" class="tr-btn ghost" id="cancel">Annulla</button><button class="tr-btn">Salva consegna</button></div></form></section>';
 const c=$('sign'),ctx=c.getContext('2d');let drawing=false,signed=false;
 const fit=()=>{const r=c.getBoundingClientRect(),k=window.devicePixelRatio||1;c.width=Math.round(r.width*k);c.height=Math.round(r.height*k);ctx.scale(k,k);ctx.lineWidth=2.4;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#1F2630';};fit();
 const pt=e=>{const r=c.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];};
 c.onpointerdown=e=>{drawing=true;c.setPointerCapture(e.pointerId);const [x,y]=pt(e);ctx.beginPath();ctx.moveTo(x,y);};
 c.onpointermove=e=>{if(!drawing)return;const [x,y]=pt(e);ctx.lineTo(x,y);ctx.stroke();signed=true;};
 c.onpointerup=c.onpointercancel=()=>{drawing=false;};
 $('clearSign').onclick=()=>{ctx.clearRect(0,0,c.width,c.height);signed=false;};
 $('cancel').onclick=()=>{flow=null;render();};
 $('podPhoto').onclick=()=>pick(async f=>{const img=await shrink(f,1000,0.7);flow.photo=img.preview;$('podPrev').innerHTML='<img class="tr-preview" alt="Foto alla consegna" src="'+img.preview+'">';});
 $('podForm').onsubmit=e=>{e.preventDefault();const el=e.target.elements;
  if(!signed){$('podErr').textContent='Manca la firma.';$('podErr').hidden=false;return;}
  // white background and reduced size, so the signature stays readable and light
  const out=document.createElement('canvas');out.width=600;out.height=Math.round(600*c.height/c.width);const o=out.getContext('2d');o.fillStyle='#fff';o.fillRect(0,0,out.width,out.height);o.drawImage(c,0,0,out.width,out.height);
  data=ST.load();const t=data.trips.find(x=>x.id===flow.trip);
  data.documents.push({id:ST.uid(),trip_id:t.id,kind:'consegna',at:nowIso(),fields:{ricevuto_da:el.who.value.trim().slice(0,120),riserve:el.notes.value.trim().slice(0,500)||null,firma:out.toDataURL('image/png')},photo:flow.photo||null,confirmed:true});
  save();recordPosition(t);flow=null;say('Consegna salvata con la firma.','ok');render();};
}

// ---------- photo → reading → confirm ----------
function pick(fn,accept='image/*'){const input=$('photo');input.value='';input.accept=accept;input.onchange=async()=>{const f=input.files&&input.files[0];if(!f)return;try{await fn(f);}catch(e){say(e.message||'Foto non leggibile.','error');}};input.click();}
function startPhoto(kind,trip){
 pick(async f=>{flow={type:'photo',kind,trip:trip.id,stage:'reading'};render();
  try{const img=await shrink(f);flow.img=img;flow.preview=img.preview;render();
   if(!online()){flow.reading=offlineReading(kind);flow.offline=true;}
   else{const r=await readDocument(kind,img,{noDemo:live()});flow.reading=r.reading;flow.demo=r.demo;}
   flow.stage='confirm';}
  catch(e){if(e&&e.offline){flow.reading=offlineReading(kind);flow.offline=true;}else{flow.reading=DOC.parseReading(kind,null);flow.reading.note=e.message;}flow.stage='confirm';}
  render();},'image/*,application/pdf');
}
function offlineReading(kind){const r=DOC.parseReading(kind,{leggibile:true,campi:{}});const v=vehicle();if(v&&'targa' in r.campi)r.campi.targa=v.plate;r.da_controllare=DOC.KINDS[kind].required.slice();r.note=null;return r;}
async function shrink(file,max=1600,q=0.82){
 if(file.type==='application/pdf'){const b=await file.arrayBuffer();if(b.byteLength>3000000)throw new Error('PDF troppo grande: fotografa il documento.');return {media_type:'application/pdf',image:b64(b),preview:null};}
 const url=URL.createObjectURL(file);
 try{
  const im=await new Promise((ok,ko)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>ko(new Error('Foto non leggibile.'));i.src=url;});
  const k=Math.min(1,max/Math.max(im.width,im.height));const c=document.createElement('canvas');c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);
  c.getContext('2d').drawImage(im,0,0,c.width,c.height);const du=c.toDataURL('image/jpeg',q);
  return {media_type:'image/jpeg',image:du.split(',')[1],preview:du};
 }finally{URL.revokeObjectURL(url);}
}
function b64(buf){let s='';const a=new Uint8Array(buf);for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode.apply(null,a.subarray(i,i+32768));return btoa(s);}
async function readDocument(kind,img,{noDemo=false}={}){
 let r;
 try{r=await fetch('/api/trasporti',{method:'POST',credentials:'same-origin',headers:ST.headers(),body:JSON.stringify({action:'documento.leggi',data:{kind,image:img.image,media_type:img.media_type}})});}
 catch(e){if(noDemo||!online()){const err=new Error('Senza rete.');err.offline=true;throw err;}return {reading:demoReading(kind),demo:true};}
 let j={};try{j=await r.json();}catch{}
 if(r.ok&&j.reading)return {reading:j.reading,demo:false};
 if(r.status===401||r.status===503||r.status===404){if(noDemo){const err=new Error(j.error||'Lettura non disponibile.');err.permanent=true;throw err;}return {reading:demoReading(kind),demo:true,why:j.error};}
 const err=new Error(j.error||'Lettura non riuscita ('+r.status+').');if(r.status===400||r.status===413)err.permanent=true;throw err;
}
// Without login or without the AI key: an example reading, clearly marked, so the flow can be tried.
function demoReading(kind){
 const v=vehicle(),t=data.trips.find(x=>x.id===flow.trip)||{};const d=nowIso().slice(0,10);
 const sample={ddt:{numero:{valore:'4187',sicurezza:'alta'},data:{valore:d,sicurezza:'alta'},mittente:{valore:'Latteria Valpadana Srl',sicurezza:'alta'},destinatario:{valore:'Supermercati Nord Spa',sicurezza:'media'},luogo_carico:{valore:t.origin||'Cremona',sicurezza:'alta'},luogo_scarico:{valore:t.destination||'Verona',sicurezza:'media'},merce:{valore:'Formaggi stagionati',sicurezza:'alta'},colli:{valore:'24',sicurezza:'alta'},peso_kg:{valore:'18.450',sicurezza:'bassa'},targa:{valore:v.plate,sicurezza:'alta'}},
  cmr:{numero:{valore:'IT 0045123',sicurezza:'alta'},mittente:{valore:'Ortofrutta Delta Spa',sicurezza:'alta'},destinatario:{valore:'Frischmarkt GmbH',sicurezza:'media'},luogo_carico:{valore:t.origin||'Cremona',sicurezza:'alta'},luogo_scarico:{valore:t.destination||'München',sicurezza:'alta'},paese_carico:{valore:'IT',sicurezza:'alta'},paese_scarico:{valore:'DE',sicurezza:'alta'},merce:{valore:'Mele in casse',sicurezza:'alta'},colli:{valore:'33 pallet',sicurezza:'media'},peso_kg:{valore:'21800',sicurezza:'alta'},targa:{valore:v.plate,sicurezza:'alta'}},
  giornale:{numero:{valore:'GV-2026-118',sicurezza:'alta'},specie:{valore:'Bovini',sicurezza:'alta'},numero_animali:{valore:'26',sicurezza:'alta'},luogo_partenza:{valore:t.origin||'Allevamento Bassa, Cremona',sicurezza:'alta'},partenza:{valore:d+' 05:40',sicurezza:'media'},luogo_destinazione:{valore:t.destination||'Macello di Modena',sicurezza:'alta'},durata_ore:{valore:'3',sicurezza:'bassa'},targa:{valore:v.plate,sicurezza:'alta'}},
  spesa:{tipo:{valore:'Parcheggio',sicurezza:'alta'},data:{valore:d,sicurezza:'alta'},esercente:{valore:'Area di sosta camion Brennero',sicurezza:'media'},importo:{valore:'18,00',sicurezza:'alta'},pagamento:{valore:'Contanti',sicurezza:'media'}},
  carburante:{data:{valore:d,sicurezza:'alta'},distributore:{valore:'Stazione di servizio A21',sicurezza:'media'},prodotto:{valore:'Gasolio',sicurezza:'alta'},litri:{valore:'312,40',sicurezza:'alta'},prezzo_litro:{valore:'1,619',sicurezza:'alta'},importo:{valore:'505,78',sicurezza:'alta'},km:{valore:'',sicurezza:'bassa'},targa:{valore:v.plate,sicurezza:'alta'}}}[kind];
 return DOC.parseReading(kind,{tipo:kind,leggibile:true,campi:sample});
}
function renderFlow(){
 const k=DOC.KINDS[flow.kind];
 if(flow.stage==='reading'){view.innerHTML='<section class="tr-card"><h1>'+esc(k.label)+'</h1>'+(flow.preview?'<img class="tr-preview" alt="Foto del documento" src="'+flow.preview+'">':'')+'<p class="tr-muted">Sto leggendo il documento…</p></section>';return;}
 const r=flow.reading,check=new Set(r.da_controllare);
 const fields=flow.offline?k.fields.filter(([key])=>k.required.includes(key)||key==='targa'):k.fields;
 const input=([key,label,type])=>{const v=r.campi[key];const val=v==null?'':type==='date'?v:type==='datetime'?v:String(v).replace('.',type==='money'||type==='number'?',':'.');
  return '<label class="'+(check.has(key)?'check':'')+'">'+esc(label)+(check.has(key)?' <span class="tr-flag">'+(flow.offline?'da scrivere':'da controllare')+'</span>':'')+'<input name="'+esc(key)+'" value="'+esc(val)+'"'+(type==='date'?' type="date"':type==='datetime'?' type="datetime-local"':type==='int'||type==='number'||type==='money'?' inputmode="decimal"':'')+(flow.kind==='spesa'&&key==='tipo'?' list="tipoSpesa"><datalist id="tipoSpesa">'+['Parcheggio','Pernottamento','Pasto','Lavaggio e disinfezione','Segatura','AdBlue','Pedaggio','Riparazione'].map(x=>'<option value="'+x+'">').join('')+'</datalist':'')+'></label>';};
 view.innerHTML='<section class="tr-card"><h1>'+(flow.offline?'Scrivi i dati principali':'Controlla e conferma')+'</h1><p class="tr-muted">'+esc(k.name)+'</p>'
  +(flow.offline?'<p class="tr-banner demo">Sei senza rete: scrivi solo questi campi. La foto resta sul telefono e la leggo appena torna la rete; l\'ufficio vedrà se qualcosa non torna.</p>':'')
  +(flow.demo?'<p class="tr-banner demo">Lettura di esempio: la lettura automatica funziona dopo l\'accesso. Correggi i campi come faresti con un documento vero.</p>':'')
  +(r.note?'<p class="tr-banner">'+esc(r.note)+'</p>':'')
  +(flow.preview?'<img class="tr-preview" alt="Foto del documento" src="'+flow.preview+'">':'')
  +'<form id="docForm" class="tr-form">'+fields.map(input).join('')+'<p class="tr-error" id="docErr" hidden></p>'
  +'<div class="tr-row"><button type="button" class="tr-btn ghost" id="cancel">Annulla</button><button class="tr-btn">Conferma e invia</button></div></form></section>';
 $('cancel').onclick=()=>{flow=null;render();};
 $('docForm').onsubmit=async e=>{e.preventDefault();
  const campi={};for(const el of e.target.elements)if(el.name)campi[el.name]=el.value;
  const res=DOC.checkConfirmed(flow.kind,campi);
  if(!res.ok){$('docErr').textContent=res.errors.join(' ');$('docErr').hidden=false;return;}
  const hadReading=Object.values(r.campi||{}).some(v=>v!=null&&v!=='');
  const corrected=flow.offline||!hadReading?0:Object.keys(res.values).filter(k2=>JSON.stringify(res.values[k2])!==JSON.stringify(r.campi[k2])).length;
  data=ST.load();const trip=data.trips.find(t=>t.id===flow.trip);const id=ST.uid();
  if(flow.kind==='spesa'){
   const v=res.values;data.costs.push({id:ST.uid(),kind:DOC.expenseKind(v.tipo),date:v.data,amount_cents:Math.round(v.importo*100),vehicle_id:trip.vehicle_id,driver_id:trip.driver_id,trip_id:trip.id,source:'spesa',description:[v.tipo||'Spesa',v.esercente,v.pagamento&&/contant|autista|propri/i.test(v.pagamento)?'da rimborsare all\'autista':null].filter(Boolean).join(' · '),fields:v,doc_id:id,refund:!!(v.pagamento&&/contant|autista|propri/i.test(v.pagamento))});
  }
  if(flow.kind==='carburante'){
   const v=res.values;data.costs.push({id:ST.uid(),kind:'carburante',date:v.data,amount_cents:Math.round(v.importo*100),liters:v.litri,km:v.km,vehicle_id:trip.vehicle_id,driver_id:trip.driver_id,trip_id:trip.id,description:'Rifornimento '+(v.distributore||''),fields:v,doc_id:id});
  }
  const fileId=live()&&flow.img?ST.uid():null;
  data.documents.push({id,trip_id:flow.trip,kind:flow.kind,at:nowIso(),fields:res.values,read:flow.offline?null:r.campi,corrected,confirmed:true,demo:!!flow.demo,pending:!!flow.offline,...(fileId?{file_id:fileId,file_type:flow.img.media_type}:{})});
  save();
  if(fileId){try{await Q.put({id:ST.uid(),type:'file',file_id:fileId,trip_id:flow.trip,img:{image:flow.img.image,media_type:flow.img.media_type},at:nowIso()});}catch{}flushQueue();}
  if(flow.offline&&flow.img){try{await Q.put({id:ST.uid(),doc_id:id,kind:flow.kind,img:{image:flow.img.image,media_type:flow.img.media_type},at:nowIso()});}catch{}}
  recordPosition(trip);const was=flow;flow=null;
  say(k.label+' salvato nel viaggio.'+(was.offline?' La foto parte appena torna la rete.':corrected?' Hai corretto '+corrected+' campi.':''),'ok');render();updateOffline();
 };
}

$('changeWho').onclick=()=>{if(live()){me={driver:me.driver,vehicle:null};localStorage.setItem(ME_KEY,JSON.stringify(me));}else{me=null;localStorage.removeItem(ME_KEY);}flow=null;render();};
if(LIVE)LIVE.on((what,st)=>{if(st.ok)flushQueue();if(st.error==='accesso'&&live())say('Questo telefono non è più collegato: chiedi un nuovo codice all\'ufficio.','error');if(!flow&&(what==='data'||!driver()||!vehicle()))render();});
{const inv=new URLSearchParams(location.search).get('invito');if(inv&&LIVE&&!live())enterCode(inv);}
window.addEventListener('storage',e=>{if(e.key===ST.KEY&&!flow)render();});
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('/trasporti/autista/sw.js',{scope:'/trasporti/autista/'}).catch(()=>{});
render();followTrip();updateOffline();flushQueue();
})();
