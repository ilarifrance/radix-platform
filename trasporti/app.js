/* Plancia (Trasporti) — command center. Reads the same demonstration data as the driver app (trasporti/store.js) and
   computes everything with lib/trasporti: vehicles on the map with the alerts of the day, trips and documents read from
   the drivers' photos, toll reconciliation by plate/device and time, margin per trip, vehicle, driver and customer,
   invoicing, costs, master data (vehicles, drivers, customers) and the trackers the vehicles already have.
   Exports are real Excel files (lib/trasporti/xlsx.js). */
(function(){
'use strict';
const DOC=window.RadixTrDocumenti,TOLL=window.RadixTrPedaggi,MRG=window.RadixTrMargini,ST=window.RadixTrStore,LOC=window.RadixTrLocalizzatori,XL=window.RadixTrXlsx;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const EUR=new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}),EUR0=new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0});
const eur=c=>EUR.format((c||0)/100),eur0=c=>EUR0.format((c||0)/100);
const num=n=>new Intl.NumberFormat('it-IT').format(n||0);
const dmy=s=>s?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'';
const hm=s=>s?s.slice(11,16):'';
const pctTxt=p=>p==null?'—':String(p).replace('.',',')+'%';
const TABS=['oggi','viaggi','pedaggi','margine','fatturazione','costi','anagrafiche','localizzatori'];
const DOC_LABEL=k=>k==='consegna'?'Consegna firmata':DOC.KINDS[k]?.label||k;
const ISSUE={ritardo:'Ritardo',guasto:'Guasto al mezzo',incidente:'Incidente',merce:'Merce o carico',attesa:'Attesa al carico/scarico',altro:'Altro'};
const view=$('view');
let data=ST.load(),tab='oggi',sel=null,mDim='vehicles',ana='vehicles',editing=null,map=null,lastImport=null;

function period(){
 const days=data.trips.map(t=>t.started_at.slice(0,10)).sort();
 if(!$('from').value)$('from').value=days[0]||ST.localIso(new Date()).slice(0,10);
 if(!$('to').value)$('to').value=ST.localIso(new Date()).slice(0,10);
 return {from:$('from').value,to:$('to').value};
}
const veh=id=>data.vehicles.find(v=>v.id===id)||{},drv=id=>data.drivers.find(d=>d.id===id)||{},cus=id=>data.customers.find(c=>c.id===id)||{};
const nowIso=()=>ST.localIso(new Date());
function tollResult(){
 if(!data.tolls||!data.tolls.transits)return null;
 return TOLL.reconcile({transits:data.tolls.transits,vehicles:data.vehicles,trips:data.trips,positions:data.positions,nowAt:nowIso()});
}
function margin(){
 const p=period(),tr=tollResult();
 // transits of a known vehicle outside every trip are a cost of that vehicle, shared among its trips
 const extra=tr?tr.rows.filter(r=>r.status==='fuori_viaggio').map(r=>({id:r.id,kind:'pedaggio',date:r.date,amount_cents:r.amount_cents,vehicle_id:r.vehicle_id})):[];
 return MRG.compute({trips:data.trips.filter(t=>t.status!=='aperto'),costs:data.costs.concat(extra),tolls:tr,from:p.from,to:p.to,vehicles:data.vehicles,drivers:data.drivers,customers:data.customers});
}
function download(name,bytes,type){const blob=new Blob([bytes],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);}
const xlsx=(name,sheets)=>download(name,XL.write(sheets),XL.MIME);
function say(msg,kind){const b=$('notice');b.textContent=msg||'';b.className='tr-banner'+(kind?' '+kind:'');b.hidden=!msg;if(msg)setTimeout(()=>{if(b.textContent===msg)b.hidden=true;},6000);}
const save=()=>{if(!ST.save(data))say('Spazio del browser pieno: scarica i dati e ricomincia la dimostrazione.','error');};

function render(){
 data=ST.load();
 $('company').textContent=data.company.name;
 tab=TABS.includes(location.hash.slice(1))?location.hash.slice(1):'oggi';
 document.querySelectorAll('#tabs a').forEach(a=>{if(a.dataset.tab===tab)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 if(map){map.remove();map=null;}
 ({oggi:renderToday,viaggi:renderTrips,pedaggi:renderTolls,margine:renderMargin,fatturazione:renderInvoicing,costi:renderCosts,anagrafiche:renderMaster,localizzatori:renderTrackers})[tab]();
}
const kpis=list=>'<div class="tr-kpis">'+list.map(([b,s])=>'<div class="tr-kpi"><b>'+b+'</b><span>'+esc(s)+'</span></div>').join('')+'</div>';
const lastPos=id=>{let best=null;for(const p of data.positions)if(p.vehicle_id===id&&(!best||p.at>best.at))best=p;return best;};
const SRC={webfleet:'Webfleet',verizon:'Verizon Connect',targa:'Targa Telematics',rfms:'rFMS',file:'file importato',telefono:'telefono autista',localizzatore:'localizzatore'};

// ---------- today: vehicles, map, alerts, reports from the drivers ----------
function renderToday(){
 const m=margin(),now=nowIso();
 const alerts=LOC.alerts({vehicles:data.vehicles.filter(v=>v.active!==false),trips:data.trips,positions:data.positions,nowAt:now});
 const issues=(data.issues||[]).filter(i=>!i.resolved).sort((a,b)=>a.at<b.at?1:-1);
 const openTrips=data.trips.filter(t=>t.status==='aperto');
 const rows=data.vehicles.filter(v=>v.active!==false).map(v=>{
  const open=openTrips.find(t=>t.vehicle_id===v.id);const last=lastPos(v.id);const g=m.vehicles.find(x=>x.id===v.id)||{};
  const km=open?LOC.tripKm(open,data.positions,now):null;
  return '<tr><td><strong>'+esc(v.plate)+'</strong><br><span class="tr-subtle">'+esc(v.label||'')+'</span></td>'
   +'<td>'+(open?'<span class="tr-pill ok">In viaggio</span><br><span class="tr-subtle">'+esc(drv(open.driver_id).name)+' · dalle '+hm(open.started_at)+(km?' · '+num(km.km)+' km':'')+'</span>':'<span class="tr-pill">Fermo</span>')+'</td>'
   +'<td>'+(last?dmy(last.at)+' '+hm(last.at)+(last.speed_kmh?' · '+Math.round(last.speed_kmh)+' km/h':'')+' <a href="https://www.openstreetmap.org/?mlat='+last.lat+'&mlon='+last.lon+'#map=12/'+last.lat+'/'+last.lon+'" target="_blank" rel="noopener">mappa</a><br><span class="tr-subtle">da '+esc(SRC[last.source]||last.source)+'</span>':'—')+'</td>'
   +'<td class="num">'+num(g.trips)+'</td><td class="num">'+num(g.km)+'</td><td class="num">'+eur0(g.revenue_cents)+'</td><td class="num '+((g.margin_cents||0)<0?'neg':'')+'">'+eur0(g.margin_cents)+'</td></tr>';
 }).join('');
 const t=m.totals;
 view.innerHTML=kpis([[num(openTrips.length),'Mezzi in viaggio ora'],[num(alerts.length+issues.length),'Avvisi e segnalazioni'],[eur0(t.revenue_cents),'Ricavi del periodo'],[eur0(t.margin_cents),'Margine ('+pctTxt(t.margin_pct)+')'],[num(t.km)+' km','Percorsi nel periodo']])
  +'<div class="tr-grid2"><section class="tr-panel"><h2>Dove sono i mezzi</h2><div class="tr-map" id="map" role="img" aria-label="Mappa con l\'ultima posizione di ogni mezzo"></div><p class="tr-subtle">Ultima posizione dal localizzatore già montato sul mezzo; il telefono dell\'autista solo dove il localizzatore non c\'è o non risponde.</p></section>'
  +'<section class="tr-panel"><h2>Da guardare</h2>'
  +(issues.length?issues.map(i=>'<div class="tr-alert alto"><div><b>'+esc(ISSUE[i.kind]||i.kind)+'</b> · '+esc(veh(i.vehicle_id).plate)+' · '+esc(drv(i.driver_id).name)+' · '+dmy(i.at)+' '+hm(i.at)+'<br>'+esc(i.text||'')+(i.photo?'<br><img src="'+esc(i.photo)+'" alt="Foto della segnalazione" style="max-width:220px;border-radius:8px;margin-top:6px">':'')+'</div><button class="tr-btn small ghost" data-resolve="'+esc(i.id)+'">Gestita</button></div>').join(''):'')
  +(alerts.length?alerts.map(a=>'<div class="tr-alert '+a.level+'"><div>'+esc(a.text)+'</div></div>').join(''):'')
  +(!issues.length&&!alerts.length?'<p class="tr-muted">Nessun avviso: tutti i mezzi in movimento hanno un viaggio aperto e mandano la posizione.</p>':'')+'</section></div>'
  +'<section class="tr-panel"><h2>Mezzi</h2><table class="tr-table"><thead><tr><th>Mezzo</th><th>Stato</th><th>Ultima posizione</th><th class="num">Viaggi</th><th class="num">Km</th><th class="num">Ricavi</th><th class="num">Margine</th></tr></thead><tbody>'+rows+'</tbody></table></section>';
 view.querySelectorAll('[data-resolve]').forEach(b=>b.onclick=()=>{const i=data.issues.find(x=>x.id===b.dataset.resolve);if(i){i.resolved=true;i.resolved_at=nowIso();save();renderToday();}});
 drawMap(openTrips);
}
function drawMap(openTrips){
 const el=$('map');if(!el)return;
 if(!window.L){el.innerHTML='<p class="tr-muted" style="padding:14px">Mappa non disponibile senza rete: usa i link "mappa" nella tabella.</p>';return;}
 map=L.map(el,{scrollWheelZoom:false});
 L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap'}).addTo(map);
 const pts=[];
 for(const v of data.vehicles.filter(x=>x.active!==false)){
  const p=lastPos(v.id);if(!p)continue;pts.push([p.lat,p.lon]);
  const open=openTrips.find(t=>t.vehicle_id===v.id);
  if(open){const trail=data.positions.filter(x=>x.vehicle_id===v.id&&x.at>=open.started_at).sort((a,b)=>a.at<b.at?-1:1).map(x=>[x.lat,x.lon]);if(trail.length>1)L.polyline(trail,{color:'#1B3D60',weight:4,opacity:.8}).addTo(map);}
  L.circleMarker([p.lat,p.lon],{radius:9,color:'#1F2630',weight:2,fillColor:open?'#F26B1D':'#6B7480',fillOpacity:1}).addTo(map)
   .bindTooltip(v.plate+(open?' · '+(drv(open.driver_id).name||''):' · fermo')+' · '+hm(p.at),{permanent:false});
 }
 if(pts.length)map.fitBounds(pts,{padding:[30,30],maxZoom:10});else map.setView([45.1,10],7);
}

// ---------- trips & documents ----------
function renderTrips(){
 const p=period();
 const trips=data.trips.filter(t=>t.started_at.slice(0,10)>=p.from&&t.started_at.slice(0,10)<=p.to).sort((a,b)=>a.started_at<b.started_at?1:-1);
 const docsOf=id=>data.documents.filter(d=>d.trip_id===id);
 const read=data.documents.filter(d=>d.kind!=='consegna'),corrected=read.filter(d=>d.corrected).length;
 const noPod=trips.filter(t=>t.status!=='aperto'&&!docsOf(t.id).some(d=>d.kind==='consegna')).length;
 view.innerHTML=kpis([[num(trips.length),'Viaggi nel periodo'],[num(trips.filter(t=>!docsOf(t.id).some(d=>d.kind!=='consegna')).length),'Senza documento di trasporto'],[num(noPod),'Chiusi senza consegna firmata'],[read.length?Math.round((read.length-corrected)*100/read.length)+'%':'—','Letti senza correzioni']])
  +'<div class="tr-toolbar"><button class="tr-btn ghost small" id="xlsTrips">Scarica viaggi in Excel</button></div>'
  +'<div class="tr-grid2"><section class="tr-panel"><h2>Viaggi</h2><table class="tr-table"><thead><tr><th>Data</th><th>Mezzo</th><th>Autista</th><th>Tratta</th><th>Documenti</th><th>Stato</th></tr></thead><tbody>'
  +trips.map(t=>{const ds=docsOf(t.id);return '<tr data-trip="'+esc(t.id)+'"'+(sel===t.id?' class="sel"':'')+' style="cursor:pointer" tabindex="0"><td>'+dmy(t.started_at)+'<br><span class="tr-subtle">'+hm(t.started_at)+'–'+(hm(t.ended_at)||'in corso')+'</span></td><td>'+esc(veh(t.vehicle_id).plate)+'</td><td>'+esc(drv(t.driver_id).name)+'</td><td class="wrap">'+esc((t.origin||'?')+' → '+(t.destination||'?'))+'</td><td>'+(ds.length?ds.map(d=>'<span class="tr-pill'+(d.corrected?' flag':' ok')+'">'+esc(DOC_LABEL(d.kind))+'</span>').join(' '):'<span class="tr-pill bad">manca</span>')+'</td><td>'+esc(t.status)+'</td></tr>';}).join('')
  +'</tbody></table></section><section class="tr-panel" id="detail">'+tripDetail(sel)+'</section></div>';
 view.querySelectorAll('[data-trip]').forEach(r=>{r.onclick=()=>{sel=r.dataset.trip;renderTrips();};r.onkeydown=e=>{if(e.key==='Enter')r.onclick();};});
 $('xlsTrips').onclick=()=>xlsx('viaggi-'+p.from+'-'+p.to+'.xlsx',[{name:'Viaggi',columns:[{title:'Data',type:'date'},{title:'Partenza',type:'datetime'},{title:'Arrivo',type:'datetime'},{title:'Mezzo'},{title:'Autista'},{title:'Cliente'},{title:'Da'},{title:'A'},{title:'Km',type:'int'},{title:'Ricavo',type:'euro'},{title:'Stato'},{title:'Documenti'}],
  rows:trips.map(t=>[t.started_at.slice(0,10),t.started_at,t.ended_at,veh(t.vehicle_id).plate,drv(t.driver_id).name,cus(t.customer_id).name,t.origin,t.destination,t.km,t.revenue_cents!=null?t.revenue_cents/100:null,t.status,docsOf(t.id).map(d=>DOC_LABEL(d.kind)+(d.fields&&d.fields.numero?' '+d.fields.numero:'')).join(', ')])}]);
 bindTripEdit();
}
function tripDetail(id){
 const t=data.trips.find(x=>x.id===id);if(!t)return '<h2>Dettaglio</h2><p class="tr-muted">Scegli un viaggio per vedere i documenti letti dalle foto e correggere km e importo.</p>';
 const ds=data.documents.filter(d=>d.trip_id===id),is=(data.issues||[]).filter(i=>i.trip_id===id);
 const km=LOC.tripKm(t,data.positions,nowIso());
 return '<h2>'+esc((t.origin||'?')+' → '+(t.destination||'?'))+'</h2><p class="tr-muted">'+dmy(t.started_at)+' '+hm(t.started_at)+'–'+(hm(t.ended_at)||'in corso')+' · '+esc(veh(t.vehicle_id).plate)+' · '+esc(drv(t.driver_id).name)+' · '+esc(cus(t.customer_id).name||'')+'</p>'
  +'<form id="tripEdit" class="tr-form-grid"><label>Km<input name="km" inputmode="numeric" value="'+esc(t.km??'')+'"></label><label>Importo €<input name="rev" inputmode="decimal" value="'+esc(t.revenue_cents!=null?(t.revenue_cents/100).toFixed(2).replace('.',','):'')+'"></label>'
  +'<label>Stato<select name="status">'+['aperto','chiuso','fatturato'].map(s=>'<option'+(t.status===s?' selected':'')+'>'+s+'</option>').join('')+'</select></label><button class="tr-btn small">Salva</button></form>'
  +(km?'<p class="tr-subtle">Dal localizzatore: '+num(km.km)+' km'+(km.method==='punti_gps'?' in linea d\'aria tra '+km.points+' posizioni (il percorso su strada è più lungo)':' dal contachilometri')+(t.km==null?' · <button type="button" class="tr-link" id="useKm">usa questo valore</button>':'')+'</p>':'')
  +'<p class="tr-error" id="tripErr" hidden></p>'
  +is.map(i=>'<p class="tr-banner'+(i.resolved?'':' error')+'"><strong>'+esc(ISSUE[i.kind]||i.kind)+'</strong> '+hm(i.at)+': '+esc(i.text||'')+(i.resolved?' (gestita)':'')+'</p>').join('')
  +(ds.length?ds.map(d=>{
   if(d.kind==='consegna'){const f=d.fields||{};return '<h3>Consegna firmata <span class="tr-subtle">'+dmy(d.at)+' '+hm(d.at)+'</span></h3><table class="tr-table"><tbody><tr><th>Ricevuto da</th><td>'+esc(f.ricevuto_da||'')+'</td></tr>'+(f.riserve?'<tr><th>Riserve</th><td class="wrap">'+esc(f.riserve)+'</td></tr>':'')+'<tr><th>Firma</th><td>'+(typeof f.firma==='string'&&f.firma.startsWith('data:image/')?'<img src="'+esc(f.firma)+'" alt="Firma del destinatario" style="max-width:240px;background:#fff;border-radius:6px">':f.firma?'presente':'—')+'</td></tr>'+(d.photo?'<tr><th>Foto</th><td><img src="'+esc(d.photo)+'" alt="Foto alla consegna" style="max-width:240px;border-radius:6px"></td></tr>':'')+'</tbody></table>';}
   const k=DOC.KINDS[d.kind];return '<h3>'+esc(k?k.name:d.kind)+(d.corrected?' <span class="tr-pill flag">'+d.corrected+' campi corretti dall\'autista</span>':'')+(d.demo?' <span class="tr-pill">lettura di esempio</span>':'')+(d.pending?' <span class="tr-pill flag">foto in attesa di lettura</span>':'')+(d.later_diff&&d.later_diff.length?' <span class="tr-pill flag">la lettura successiva differisce su '+d.later_diff.length+' campi</span>':'')+'</h3><table class="tr-table"><tbody>'
   +(k?k.fields:[]).filter(([key])=>d.fields[key]!=null).map(([key,label])=>'<tr><th>'+esc(label)+'</th><td class="wrap">'+esc(d.fields[key])+(d.read&&JSON.stringify(d.read[key])!==JSON.stringify(d.fields[key])?' <span class="tr-subtle">(letto: '+esc(d.read[key]??'vuoto')+')</span>':'')+'</td></tr>').join('')+'</tbody></table>';}).join(''):'<p class="tr-muted">Nessun documento per questo viaggio: senza documento non si fattura.</p>');
}
function bindTripEdit(){
 const f=$('tripEdit');if(!f)return;const t=data.trips.find(x=>x.id===sel);
 f.onsubmit=e=>{e.preventDefault();const el=f.elements;const err=$('tripErr');
  const km=el.km.value.trim()===''?null:parseInt(el.km.value,10);const rev=el.rev.value.trim()===''?null:DOC.normNumber(el.rev.value);
  if(km!=null&&!(km>=0&&km<=20000)){err.textContent='Km non validi.';err.hidden=false;return;}
  if(el.rev.value.trim()!==''&&(rev==null||rev<0)){err.textContent='Importo non valido.';err.hidden=false;return;}
  t.km=km;t.revenue_cents=rev==null?null:Math.round(rev*100);t.status=el.status.value;if(t.status!=='aperto'&&!t.ended_at)t.ended_at=nowIso();
  save();say('Viaggio aggiornato.','ok');renderTrips();};
 const u=$('useKm');if(u)u.onclick=()=>{const km=LOC.tripKm(t,data.positions,nowIso());if(km){f.elements.km.value=km.km;}};
}

// ---------- tolls ----------
function renderTolls(){
 const r=tollResult();
 let html='<section class="tr-panel"><h2>Fatture autostradali</h2><p class="tr-muted">Carica il dettaglio transiti (CSV o Excel esportato da Telepass, UnipolMove o altri: data, ore e caselli di entrata e uscita, targa o dispositivo, importo). Ogni transito viene abbinato al viaggio che quel mezzo stava facendo a quell\'ora.</p>'
  +'<div class="tr-toolbar"><button class="tr-btn" id="tollUp">Carica CSV o Excel</button><button class="tr-btn ghost" id="tollDemo">Usa il file di esempio</button>'+(r?'<button class="tr-btn ghost" id="tollXls">Scarica in Excel</button>':'')+(data.tolls?'<span class="tr-subtle">Ultimo file: '+esc(data.tolls.name)+', '+num(data.tolls.transits.length)+' transiti'+(data.tolls.skipped?', '+data.tolls.skipped+' righe non lette':'')+'</span>':'')+'</div></section>';
 const label={abbinato:['Abbinato','ok'],fuori_viaggio:['Fuori viaggio','flag'],mezzo_sconosciuto:['Mezzo sconosciuto','bad'],da_controllare:['Da controllare','flag']};
 if(r){
  const t=r.totals;
  const order={fuori_viaggio:0,mezzo_sconosciuto:1,da_controllare:2,abbinato:3};
  html+=kpis([[eur(t.amount_cents),num(t.count)+' transiti'],[eur(t.matched_cents),num(t.matched)+' abbinati a un viaggio'],[eur(t.outside_cents),'Fuori da ogni viaggio'],[eur(t.unknown_cents),'Mezzo sconosciuto o senza orario']])
   +'<section class="tr-panel"><h2>Transiti</h2><table class="tr-table"><thead><tr><th>Stato</th><th>Data</th><th>Entrata</th><th>Uscita</th><th>Targa</th><th class="num">Importo</th><th>Viaggio</th><th>Nota</th></tr></thead><tbody>'
   +r.rows.slice().sort((a,b)=>order[a.status]-order[b.status]||(a.exitAt||'').localeCompare(b.exitAt||'')).map(x=>{const tr=data.trips.find(y=>y.id===x.trip_id);const l=label[x.status];return '<tr><td><span class="tr-pill '+l[1]+'">'+l[0]+'</span></td><td>'+dmy(x.date)+'</td><td>'+hm(x.entryAt)+' '+esc(x.entry||'')+'</td><td>'+hm(x.exitAt)+' '+esc(x.exit||'')+'</td><td>'+esc(x.plate||x.device)+'</td><td class="num">'+eur(x.amount_cents)+'</td><td>'+(tr?esc((tr.origin||'?')+' → '+(tr.destination||'?'))+' <span class="tr-subtle">'+esc(drv(tr.driver_id).name)+'</span>':'—')+'</td><td class="wrap tr-subtle">'+esc(x.reason||'')+'</td></tr>';}).join('')
   +'</tbody></table></section>';
 }
 view.innerHTML=html;
 $('tollUp').onclick=()=>pickFile('.csv,.xlsx,text/csv,text/plain,'+XL.MIME,async file=>{const rows=await sheetRows(file);importTolls(file.name,rows);});
 $('tollDemo').onclick=()=>importTolls('telepass-esempio.csv',ST.sampleTollCsv(data));
 if(r)$('tollXls').onclick=()=>xlsx('pedaggi-'+(data.tolls.name||'transiti').replace(/\.\w+$/,'')+'.xlsx',[{name:'Transiti',columns:[{title:'Stato'},{title:'Data',type:'date'},{title:'Entrata',type:'datetime'},{title:'Casello entrata'},{title:'Uscita',type:'datetime'},{title:'Casello uscita'},{title:'Targa'},{title:'Dispositivo'},{title:'Importo',type:'euro'},{title:'Viaggio'},{title:'Autista'},{title:'Nota'}],
  rows:r.rows.map(x=>{const tr=data.trips.find(y=>y.id===x.trip_id);return [label[x.status][0],x.date,x.entryAt,x.entry,x.exitAt,x.exit,x.plate,x.device,x.amount_cents/100,tr?(tr.origin||'?')+' → '+(tr.destination||'?'):'',tr?drv(tr.driver_id).name:'',x.reason||''];})},
  {name:'Per mezzo',columns:[{title:'Targa'},{title:'Importo',type:'euro'}],rows:Object.entries(r.perVehicle).map(([id,c])=>[veh(id).plate||id,c/100])}]);
}
// A chosen file as rows (Excel) or text (CSV).
async function sheetRows(file){
 const buf=new Uint8Array(await file.arrayBuffer());
 if(XL.isXlsx(buf)){const sheets=await XL.read(buf);const best=sheets.slice().sort((a,b)=>b.rows.length-a.rows.length)[0];return best?best.rows:[];}
 return new TextDecoder('utf-8').decode(buf);
}
function pickFile(accept,fn){const f=$('anyFile');f.value='';f.accept=accept;f.onchange=async()=>{const file=f.files[0];if(!file)return;try{await fn(file);}catch(e){alertBanner(e.message||'File non leggibile.');}};f.click();}
function importTolls(name,input){
 const p=TOLL.parseTransits(input);
 if(p.error){alertBanner(p.error);return;}
 data.tolls={name,importedAt:nowIso(),transits:p.transits,skipped:p.skipped.length};save();renderTolls();
}
function alertBanner(msg){say(msg,'error');}

// ---------- margin ----------
function renderMargin(){
 const m=margin(),t=m.totals,p=period();
 const dims={vehicles:'Per mezzo',drivers:'Per autista',customers:'Per cliente',trips:'Per viaggio'};
 const kinds=Object.entries(m.by_kind).sort((a,b)=>b[1]-a[1]);const maxK=Math.max(1,...kinds.map(k=>k[1]));
 let rows;
 if(mDim==='trips')rows=m.trips.map(r=>'<tr><td>'+dmy(r.date)+'</td><td class="wrap">'+esc((r.origin||'?')+' → '+(r.destination||'?'))+'</td><td>'+esc(veh(r.vehicle_id).plate)+'</td><td class="num">'+num(r.km)+'</td><td class="num">'+eur(r.revenue_cents)+'</td><td class="num">'+eur(r.cost_cents)+'</td><td class="num '+(r.margin_cents<0?'neg':'')+'">'+eur(r.margin_cents)+'</td><td class="num">'+pctTxt(r.margin_pct)+'</td></tr>').join('');
 else rows=m[mDim].map(g=>'<tr><td>'+esc(g.name)+'</td><td class="num">'+num(g.trips)+'</td><td class="num">'+num(g.km)+'</td><td class="num">'+eur0(g.revenue_cents)+'</td><td class="num">'+eur0(g.cost_cents)+(g.unallocated_cents?'<br><span class="tr-subtle">'+eur0(g.unallocated_cents)+' senza viaggi</span>':'')+'</td><td class="num '+(g.margin_cents<0?'neg':'')+'">'+eur0(g.margin_cents)+'</td><td class="num">'+pctTxt(g.margin_pct)+'</td><td class="num">'+(g.cost_per_km_cents!=null?eur(g.cost_per_km_cents):'—')+'</td></tr>').join('');
 const head=mDim==='trips'?'<th>Data</th><th>Tratta</th><th>Mezzo</th><th class="num">Km</th><th class="num">Ricavo</th><th class="num">Costi</th><th class="num">Margine</th><th class="num">%</th>':'<th>'+({vehicles:'Mezzo',drivers:'Autista',customers:'Cliente'}[mDim])+'</th><th class="num">Viaggi</th><th class="num">Km</th><th class="num">Ricavi</th><th class="num">Costi</th><th class="num">Margine</th><th class="num">%</th><th class="num">Costo/km</th>';
 view.innerHTML=kpis([[eur0(t.revenue_cents),'Ricavi'],[eur0(t.cost_cents),'Costi'],[eur0(t.margin_cents),'Margine'],[pctTxt(t.margin_pct),'Margine sui ricavi'],[t.km?eur(Math.round(t.cost_cents/t.km)):'—','Costo per km']])
  +(t.missing_revenue?'<p class="tr-banner">'+t.missing_revenue+' viaggi senza ricavo: indica la tariffa del cliente in Anagrafiche o l\'importo nel viaggio.</p>':'')
  +'<section class="tr-panel"><div class="tr-toolbar">'+Object.entries(dims).map(([k,l])=>'<button class="tr-btn small'+(k===mDim?' blue':' ghost')+'" data-dim="'+k+'">'+l+'</button>').join('')+'<button class="tr-btn small ghost" id="xlsMargin" style="margin-left:auto">Scarica in Excel</button></div><table class="tr-table"><thead><tr>'+head+'</tr></thead><tbody>'+rows+'</tbody></table>'
  +'<p class="tr-subtle">Costi del viaggio: carburante segnalato e pedaggi abbinati. Costi del mezzo (leasing, manutenzione, pedaggi fuori viaggio) e del personale ripartiti sui viaggi in proporzione ai km.</p></section>'
  +'<section class="tr-panel" style="max-width:760px"><h2>Dove vanno i costi</h2><table class="tr-table"><tbody>'+kinds.map(([k,c])=>'<tr><td>'+esc(MRG.KIND_LABEL[k]||k)+'</td><td style="width:45%"><div class="tr-bar"><i style="width:'+Math.round(c*100/maxK)+'%"></i></div></td><td class="num">'+eur0(c)+'</td><td class="num">'+(t.cost_cents?Math.round(c*100/t.cost_cents)+'%':'')+'</td></tr>').join('')+'</tbody></table></section>';
 view.querySelectorAll('[data-dim]').forEach(b=>b.onclick=()=>{mDim=b.dataset.dim;renderMargin();});
 $('xlsMargin').onclick=()=>{
  const g=(list,title)=>({name:title,columns:[{title:title.replace('Per ','').replace(/^./,c=>c.toUpperCase())},{title:'Viaggi',type:'int'},{title:'Km',type:'int'},{title:'Ricavi',type:'euro'},{title:'Costi',type:'euro'},{title:'di cui senza viaggi',type:'euro'},{title:'Margine',type:'euro'},{title:'Margine %',type:'number'},{title:'Costo per km',type:'euro'}],
   rows:list.map(x=>[x.name,x.trips,x.km,x.revenue_cents/100,x.cost_cents/100,(x.unallocated_cents||0)/100,x.margin_cents/100,x.margin_pct,x.cost_per_km_cents!=null?x.cost_per_km_cents/100:null])});
  xlsx('margine-'+p.from+'-'+p.to+'.xlsx',[
   {name:'Riepilogo',columns:[{title:'Voce'},{title:'Valore',type:'euro'}],rows:[['Ricavi',t.revenue_cents/100],['Costi',t.cost_cents/100],['Margine',t.margin_cents/100],...kinds.map(([k,c])=>['Costi · '+(MRG.KIND_LABEL[k]||k),c/100])]},
   g(m.vehicles,'Per mezzo'),g(m.drivers,'Per autista'),g(m.customers,'Per cliente'),
   {name:'Per viaggio',columns:[{title:'Data',type:'date'},{title:'Da'},{title:'A'},{title:'Mezzo'},{title:'Autista'},{title:'Cliente'},{title:'Km',type:'int'},{title:'Ricavo',type:'euro'},{title:'Costi diretti',type:'euro'},{title:'Costi ripartiti',type:'euro'},{title:'Margine',type:'euro'},{title:'Margine %',type:'number'}],
    rows:m.trips.map(r=>[r.date,r.origin,r.destination,veh(r.vehicle_id).plate,drv(r.driver_id).name,cus(r.customer_id).name,r.km,r.revenue_cents/100,Object.values(r.direct).reduce((s,x)=>s+x,0)/100,Object.values(r.allocated).reduce((s,x)=>s+x,0)/100,r.margin_cents/100,r.margin_pct])}]);
 };
}

// ---------- invoicing ----------
function renderInvoicing(){
 const p=period();const rows=MRG.invoiceRows({trips:data.trips,documents:data.documents,vehicles:data.vehicles,customers:data.customers,drivers:data.drivers,from:p.from,to:p.to});
 const byC=new Map();for(const r of rows){const g=byC.get(r.customer)||{n:0,c:0};g.n++;g.c+=r.amount_cents;byC.set(r.customer,g);}
 const pod=new Set(data.documents.filter(d=>d.kind==='consegna').map(d=>d.trip_id));
 view.innerHTML='<section class="tr-panel"><h2>Da fatturare nel periodo</h2><p class="tr-muted">Viaggi chiusi con i dati del documento confermato dall\'autista. Il file Excel ha un foglio per il riepilogo per cliente e uno con il dettaglio, pronto per il programma di fatturazione.</p>'
  +'<div class="tr-toolbar"><button class="tr-btn" id="xls"'+(rows.length?'':' disabled')+'>Scarica in Excel</button><button class="tr-btn ghost" id="csv"'+(rows.length?'':' disabled')+'>CSV</button><button class="tr-btn ghost" id="mark"'+(rows.length?'':' disabled')+'>Segna come fatturati</button></div>'
  +'<table class="tr-table"><thead><tr><th>Cliente</th><th class="num">Viaggi</th><th class="num">Importo</th></tr></thead><tbody>'+[...byC].map(([k,g])=>'<tr><td>'+esc(k)+'</td><td class="num">'+g.n+'</td><td class="num">'+eur(g.c)+'</td></tr>').join('')+'</tbody></table></section>'
  +'<section class="tr-panel"><table class="tr-table"><thead><tr><th>Cliente</th><th>Data</th><th>Documento</th><th>Tratta</th><th>Merce</th><th>Targa</th><th>Consegna</th><th class="num">Km</th><th class="num">Importo</th></tr></thead><tbody>'
  +rows.map(r=>'<tr><td>'+esc(r.customer)+'</td><td>'+dmy(r.date)+'</td><td>'+esc(r.doc)+'</td><td class="wrap">'+esc(r.origin+' → '+r.destination)+'</td><td>'+esc(r.goods)+'</td><td>'+esc(r.plate)+'</td><td>'+(pod.has(r.trip_id)?'<span class="tr-pill ok">firmata</span>':'<span class="tr-pill flag">manca</span>')+'</td><td class="num">'+num(r.km)+'</td><td class="num">'+eur(r.amount_cents)+'</td></tr>').join('')+'</tbody></table></section>';
 $('xls').onclick=()=>xlsx('viaggi-da-fatturare-'+p.from+'-'+p.to+'.xlsx',[
  {name:'Per cliente',columns:[{title:'Cliente'},{title:'Viaggi',type:'int'},{title:'Importo',type:'euro'}],rows:[...byC].map(([k,g])=>[k,g.n,g.c/100])},
  {name:'Dettaglio',columns:[{title:'Cliente'},{title:'Data',type:'date'},{title:'Documento'},{title:'Da'},{title:'A'},{title:'Merce'},{title:'Peso kg',type:'number'},{title:'Targa'},{title:'Autista'},{title:'Km',type:'int'},{title:'Consegna firmata'},{title:'Importo',type:'euro'},{title:'Viaggio'}],
   rows:rows.map(r=>[r.customer,r.date,r.doc,r.origin,r.destination,r.goods,r.weight_kg===''?null:r.weight_kg,r.plate,r.driver,r.km===''?null:r.km,pod.has(r.trip_id)?'sì':'no',r.amount_cents/100,r.trip_id])}]);
 $('csv').onclick=()=>download('viaggi-da-fatturare-'+p.from+'-'+p.to+'.csv',MRG.toCsv(rows),'text/csv;charset=utf-8');
 $('mark').onclick=()=>{const ids=new Set(rows.map(r=>r.trip_id));for(const t of data.trips)if(ids.has(t.id))t.status='fatturato';save();renderInvoicing();};
}

// ---------- costs ----------
function renderCosts(){
 const p=period();const list=data.costs.filter(c=>c.date>=p.from&&c.date<=p.to).sort((a,b)=>a.date<b.date?1:-1);
 const opts=(arr,lab)=>'<option value="">—</option>'+arr.map(x=>'<option value="'+esc(x.id)+'">'+esc(lab(x))+'</option>').join('');
 view.innerHTML='<section class="tr-panel"><h2>Aggiungi un costo</h2><p class="tr-muted">Buste paga, leasing, manutenzioni, assicurazioni. Collega il costo al mezzo o all\'autista: il margine lo ripartisce sui suoi viaggi.</p>'
  +'<form id="costForm" class="tr-form-grid"><label>Tipo<select name="kind">'+Object.entries(MRG.KIND_LABEL).map(([k,l])=>'<option value="'+k+'">'+esc(l)+'</option>').join('')+'</select></label><label>Data<input type="date" name="date" required value="'+esc(p.to)+'"></label><label>Importo €<input name="amount" inputmode="decimal" required></label><label>Mezzo<select name="vehicle">'+opts(data.vehicles,v=>v.plate)+'</select></label><label>Autista<select name="driver">'+opts(data.drivers,d=>d.name)+'</select></label><label>Descrizione<input name="description"></label><button class="tr-btn">Aggiungi</button></form><p class="tr-error" id="costErr" hidden></p></section>'
  +'<section class="tr-panel"><div class="tr-toolbar"><h2 style="margin:0">Costi del periodo</h2><button class="tr-btn small ghost" id="xlsCosts" style="margin-left:auto">Scarica in Excel</button></div><table class="tr-table"><thead><tr><th>Data</th><th>Tipo</th><th>Mezzo</th><th>Autista</th><th>Descrizione</th><th class="num">Importo</th><th></th></tr></thead><tbody>'
  +list.map(c=>'<tr><td>'+dmy(c.date)+'</td><td>'+esc(MRG.KIND_LABEL[c.kind]||c.kind)+'</td><td>'+esc(veh(c.vehicle_id).plate||'')+'</td><td>'+esc(drv(c.driver_id).name||'')+'</td><td class="wrap">'+esc(c.description||'')+'</td><td class="num">'+eur(c.amount_cents)+'</td><td>'+(c.trip_id?'':'<button class="tr-link" data-del="'+esc(c.id)+'" aria-label="Elimina costo">Elimina</button>')+'</td></tr>').join('')+'</tbody></table></section>';
 $('costForm').onsubmit=e=>{e.preventDefault();const f=e.target.elements;const n=DOC.normNumber(f.amount.value);
  if(n==null||n<=0){$('costErr').textContent='Importo non valido.';$('costErr').hidden=false;return;}
  data.costs.push({id:ST.uid(),kind:f.kind.value,date:f.date.value,amount_cents:Math.round(n*100),vehicle_id:f.vehicle.value||null,driver_id:f.driver.value||null,description:f.description.value.trim()||null});save();renderCosts();};
 view.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{data.costs=data.costs.filter(c=>c.id!==b.dataset.del);save();renderCosts();});
 $('xlsCosts').onclick=()=>xlsx('costi-'+p.from+'-'+p.to+'.xlsx',[{name:'Costi',columns:[{title:'Data',type:'date'},{title:'Tipo'},{title:'Mezzo'},{title:'Autista'},{title:'Descrizione'},{title:'Litri',type:'number'},{title:'Importo',type:'euro'}],rows:list.map(c=>[c.date,MRG.KIND_LABEL[c.kind]||c.kind,veh(c.vehicle_id).plate,drv(c.driver_id).name,c.description,c.liters??null,c.amount_cents/100])}]);
}

// ---------- master data ----------
const RATE={viaggio:'a viaggio',km:'al km',ton:'a tonnellata',ora:'all\'ora'};
const VKIND=['trattore','motrice','rimorchio','semirimorchio','furgone','bestiame','altro'];
const ENT={
 vehicles:{title:'Mezzi',one:'mezzo',fields:[['plate','Targa','plate',true],['label','Modello o nome','text'],['kind','Tipo',VKIND],['devices','Dispositivi pedaggio (Telepass, UnipolMove), separati da virgola','list'],['tracker','Localizzatore',Object.keys(LOC.PROVIDERS).filter(k=>k!=='file')],['tracker_ref','Codice nel localizzatore','text'],['vin','Telaio (VIN, per rFMS)','text']],
  cols:v=>[v.plate,v.label,v.kind,(v.devices||[]).join(', '),LOC.PROVIDERS[v.tracker]?.label||'—'],head:['Targa','Modello','Tipo','Pedaggi','Localizzatore'],used:id=>data.trips.some(t=>t.vehicle_id===id)},
 drivers:{title:'Autisti',one:'autista',fields:[['name','Nome e cognome','text',true],['phone','Telefono','text'],['vehicle','Mezzo abituale','vehicle']],
  cols:d=>[d.name,d.phone,veh(d.vehicle).plate||'—'],head:['Autista','Telefono','Mezzo abituale'],used:id=>data.trips.some(t=>t.driver_id===id)},
 customers:{title:'Clienti',one:'cliente',fields:[['name','Ragione sociale','text',true],['vat','Partita IVA','text'],['rate_kind','Tariffa',Object.keys(RATE)],['rate','Importo tariffa €','money']],
  cols:c=>[c.name,c.vat,c.rate_cents!=null?eur(c.rate_cents)+' '+(RATE[c.rate_kind]||''):'—'],head:['Cliente','Partita IVA','Tariffa'],used:id=>data.trips.some(t=>t.customer_id===id)}
};
function renderMaster(){
 const E=ENT[ana],list=data[ana].slice().sort((a,b)=>(a.active===false)-(b.active===false));
 const item=editing&&editing!=='new'?data[ana].find(x=>x.id===editing):null;
 const val=(k,type)=>{if(!item)return '';if(type==='list')return (item[k]||[]).join(', ');if(type==='money')return item.rate_cents!=null?(item.rate_cents/100).toFixed(2).replace('.',','):'';return item[k]??'';};
 const field=([k,label,type,req])=>{
  if(Array.isArray(type))return '<label>'+esc(label)+'<select name="'+k+'"><option value="">—</option>'+type.map(o=>'<option value="'+esc(o)+'"'+(val(k)===o?' selected':'')+'>'+esc(k==='tracker'?LOC.PROVIDERS[o].label:k==='rate_kind'?RATE[o]:o)+'</option>').join('')+'</select></label>';
  if(type==='vehicle')return '<label>'+esc(label)+'<select name="'+k+'"><option value="">—</option>'+data.vehicles.map(v=>'<option value="'+esc(v.id)+'"'+(val(k)===v.id?' selected':'')+'>'+esc(v.plate)+'</option>').join('')+'</select></label>';
  return '<label>'+esc(label)+'<input name="'+k+'" value="'+esc(val(k,type))+'"'+(req?' required':'')+(type==='money'?' inputmode="decimal"':'')+(type==='plate'?' autocapitalize="characters"':'')+'></label>';};
 view.innerHTML='<div class="tr-toolbar">'+Object.entries(ENT).map(([k,e])=>'<button class="tr-btn small'+(k===ana?' blue':' ghost')+'" data-ana="'+k+'">'+e.title+' ('+data[k].length+')</button>').join('')+'</div>'
  +'<div class="tr-grid2"><section class="tr-panel"><div class="tr-toolbar"><h2 style="margin:0">'+E.title+'</h2><button class="tr-btn small" id="addOne" style="margin-left:auto">Aggiungi '+E.one+'</button></div><table class="tr-table"><thead><tr>'+E.head.map(h=>'<th>'+h+'</th>').join('')+'<th></th></tr></thead><tbody>'
  +list.map(x=>'<tr'+(x.active===false?' style="opacity:.55"':'')+(editing===x.id?' class="sel"':'')+'>'+E.cols(x).map((c,i)=>'<td'+(i===0?'':' class="wrap"')+'>'+(i===0?'<strong>'+esc(c)+'</strong>':esc(c??''))+(i===0&&x.active===false?' <span class="tr-chip">non attivo</span>':'')+'</td>').join('')+'<td><button class="tr-link" data-edit="'+esc(x.id)+'">Modifica</button></td></tr>').join('')+'</tbody></table></section>'
  +'<section class="tr-panel">'+(editing?'<h2>'+(item?'Modifica '+E.one:'Nuovo '+E.one)+'</h2><form id="anaForm">'+E.fields.map(field).join('')+'<p class="tr-error" id="anaErr" hidden></p><div class="tr-toolbar"><button class="tr-btn">Salva</button><button type="button" class="tr-btn ghost" id="anaCancel">Annulla</button>'+(item?(E.used(item.id)?'<button type="button" class="tr-btn warn" id="anaOff">'+(item.active===false?'Riattiva':'Disattiva')+'</button>':'<button type="button" class="tr-btn warn" id="anaDel">Elimina</button>'):'')+'</div>'+(item&&E.used(item.id)?'<p class="tr-subtle">Ha già dei viaggi: si può disattivare, non eliminare, così lo storico e il margine restano giusti.</p>':'')+'</form>'
   :'<h2>'+E.title+'</h2><p class="tr-muted">'+({vehicles:'Per ogni mezzo: i dispositivi di pedaggio (servono ad abbinare i transiti anche se la targa sulla fattura manca) e il localizzatore da cui leggere la posizione, con il codice del mezzo in quel sistema o il telaio per rFMS.',drivers:'Ogni autista usa l\'app sul proprio telefono; il mezzo abituale viene proposto all\'inizio della giornata.',customers:'Con la tariffa al km il ricavo del viaggio si calcola da solo quando l\'autista lo chiude con i km.'}[ana])+'</p>')+'</section></div>';
 view.querySelectorAll('[data-ana]').forEach(b=>b.onclick=()=>{ana=b.dataset.ana;editing=null;renderMaster();});
 view.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{editing=b.dataset.edit;renderMaster();});
 $('addOne').onclick=()=>{editing='new';renderMaster();};
 const f=$('anaForm');if(!f)return;
 $('anaCancel').onclick=()=>{editing=null;renderMaster();};
 if($('anaDel'))$('anaDel').onclick=()=>{data[ana]=data[ana].filter(x=>x.id!==item.id);editing=null;save();renderMaster();};
 if($('anaOff'))$('anaOff').onclick=()=>{item.active=item.active===false;save();renderMaster();};
 f.onsubmit=e=>{e.preventDefault();const el=f.elements,err=$('anaErr');const o=item||{id:ST.uid()};const errs=[];
  for(const [k,label,type,req] of E.fields){const raw=(el[k].value||'').trim();
   if(type==='plate'){const v=raw.toUpperCase().replace(/[^A-Z0-9]/g,'');if(v.length<4||v.length>10)errs.push('Targa non valida.');else if(data.vehicles.some(x=>x.plate===v&&x.id!==o.id))errs.push('Targa già presente.');o[k]=v;}
   else if(type==='list')o[k]=raw.split(/[,;\s]+/).map(s=>s.trim()).filter(Boolean);
   else if(type==='money'){if(raw===''){o.rate_cents=null;}else{const n=DOC.normNumber(raw);if(n==null||n<0)errs.push('Tariffa non valida.');else o.rate_cents=Math.round(n*100);}}
   else{if(req&&!raw)errs.push(label+': obbligatorio.');o[k]=raw||null;}}
  if(ana==='vehicles'&&o.vin)o.vin=o.vin.toUpperCase();
  if(errs.length){err.textContent=errs.join(' ');err.hidden=false;return;}
  if(!item)data[ana].push(o);editing=null;save();say((item?'Salvato: ':'Aggiunto: ')+(o.plate||o.name)+'.','ok');renderMaster();};
}

// ---------- trackers ----------
function renderTrackers(){
 const counts={};for(const v of data.vehicles)if(v.active!==false)counts[v.tracker||'nessuno']=(counts[v.tracker||'nessuno']||0)+1;
 const now=nowIso();
 view.innerHTML='<div class="tr-grid2"><section class="tr-panel"><h2>Localizzatori</h2><p class="tr-muted">La posizione si legge dal localizzatore che i mezzi hanno già. Il telefono dell\'autista serve solo per i mezzi senza localizzatore o quando il localizzatore tace, e solo con un viaggio aperto.</p>'
  +'<table class="tr-table"><tbody>'+Object.entries(LOC.PROVIDERS).filter(([k])=>k!=='file').map(([k,p])=>'<tr><td><strong>'+esc(p.label)+'</strong><br><span class="tr-subtle wrap" style="white-space:normal">'+esc(p.note)+'</span></td><td class="num">'+(counts[k]||0)+' mezzi</td><td>'+(p.api?'<span class="tr-pill ok">API</span>':k==='telefono'?'<span class="tr-pill">riserva</span>':'<span class="tr-pill flag">file</span>')+'</td></tr>').join('')+'</tbody></table>'
  +'<div class="tr-toolbar" style="margin-top:12px"><button class="tr-btn" id="sync">Aggiorna ora dal localizzatore</button><button class="tr-btn ghost" id="imp">Importa export (CSV o Excel)</button></div>'
  +'<p class="tr-subtle">Il collegamento via API si configura sul server con le credenziali dell\'azienda (mai nel browser). Ultimo aggiornamento: '+(data.tracker&&data.tracker.lastSync?dmy(data.tracker.lastSync)+' '+hm(data.tracker.lastSync):'mai')+'.</p>'
  +(lastImport?'<p class="tr-banner '+(lastImport.error?'error':'ok')+'">'+esc(lastImport.text)+'</p>':'')+'</section>'
  +'<section class="tr-panel"><h2>Ultima posizione per mezzo</h2><table class="tr-table"><thead><tr><th>Mezzo</th><th>Localizzatore</th><th>Codice</th><th>Ultima posizione</th><th>Fonte</th></tr></thead><tbody>'
  +data.vehicles.filter(v=>v.active!==false).map(v=>{const p=lastPos(v.id);const age=p?LOC.minutes(now)-LOC.minutes(p.at):null;return '<tr><td><strong>'+esc(v.plate)+'</strong></td><td>'+esc(LOC.PROVIDERS[v.tracker]?.label||'—')+'</td><td>'+esc(v.tracker_ref||v.vin||'')+'</td><td>'+(p?dmy(p.at)+' '+hm(p.at)+(age!=null&&age>24*60?' <span class="tr-pill flag">vecchia</span>':''):'—')+'</td><td>'+(p?esc(SRC[p.source]||p.source):'')+'</td></tr>';}).join('')
  +'</tbody></table><p class="tr-subtle">Privacy: le posizioni si conservano 90 giorni e servono a viaggi, pedaggi e margini, non al controllo a distanza dei lavoratori (art. 4 Statuto dei lavoratori: serve l\'accordo sindacale o l\'autorizzazione dell\'Ispettorato, da indicare nell\'azienda).</p></section></div>';
 $('sync').onclick=syncTracker;
 $('imp').onclick=()=>pickFile('.csv,.xlsx,text/csv,text/plain,'+XL.MIME,async file=>{const input=await sheetRows(file);const p=LOC.parse('file',input);if(p.error){lastImport={error:true,text:p.error};renderTrackers();return;}addPositions(p.positions,file.name,p.skipped.length);});
}
async function syncTracker(){
 const b=$('sync');b.disabled=true;b.textContent='Aggiorno…';
 try{
  const r=await fetch('/api/trasporti',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Radix-Trasporti':'1'},body:JSON.stringify({action:'posizioni.aggiorna'})});
  let j={};try{j=await r.json();}catch{}
  if(!r.ok){lastImport={error:true,text:r.status===401?'Accedi per collegare il localizzatore. Nella dimostrazione usa "Importa export".':r.status===404?'Collegamento non disponibile in questa anteprima: usa "Importa export".':(j.error||'Aggiornamento non riuscito ('+r.status+').')};renderTrackers();return;}
  data.tracker={...(data.tracker||{}),provider:j.provider};addPositions(j.positions||[],LOC.PROVIDERS[j.provider]?.label||j.provider,0);
 }catch{lastImport={error:true,text:'Senza rete: riprova quando la connessione torna.'};renderTrackers();}
}
function addPositions(raw,from,skipped){
 const {positions,unknown}=LOC.assign(raw,data.vehicles);
 const cutoff=ST.localIso(new Date(Date.now()-90*86400000));
 const before=data.positions.length;
 data.positions=LOC.merge(data.positions.concat(positions)).filter(p=>p.at>=cutoff).slice(-20000);
 data.tracker={...(data.tracker||{}),lastSync:nowIso()};save();
 lastImport={error:false,text:from+': '+num(positions.length)+' posizioni lette, '+num(Math.max(0,data.positions.length-before))+' nuove'+(skipped?', '+skipped+' righe non lette':'')+(unknown.length?'. Codici senza mezzo: '+unknown.slice(0,6).map(u=>u.ref+' ('+u.count+')').join(', ')+' — aggiungili in Anagrafiche.':'.')};
 renderTrackers();
}

$('from').onchange=$('to').onchange=render;
$('reset').onclick=()=>{if(!confirm('Cancello i dati di questa dimostrazione e ricreo l\'azienda di esempio?'))return;data=ST.reset();$('from').value='';$('to').value='';render();};
window.addEventListener('hashchange',()=>{editing=null;render();});
window.addEventListener('storage',e=>{if(e.key===ST.KEY&&tab!=='anagrafiche')render();});
render();
})();
