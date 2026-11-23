/* Plancia (Trasporti) — command center. Reads the same demonstration data as the driver app (trasporti/store.js) and
   computes everything with lib/trasporti: vehicles on the map with the alerts of the day, trips and documents read from
   the drivers' photos, toll reconciliation by plate/device and time, margin per trip, vehicle, driver and customer,
   invoicing, costs, master data (vehicles, drivers, customers) and the trackers the vehicles already have.
   Exports are real Excel files (lib/trasporti/xlsx.js). */
(function(){
'use strict';
const DOC=window.RadixTrDocumenti,TOLL=window.RadixTrPedaggi,MRG=window.RadixTrMargini,ST=window.RadixTrStore,LOC=window.RadixTrLocalizzatori,XL=window.RadixTrXlsx,LIS=window.RadixTrListini,ANA=window.RadixTrAnagrafiche,CO=window.RadixTrCosti,CT=window.RadixTrControllo,FPA=window.RadixTrFatturaPA;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const EUR=new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}),EUR0=new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0});
const eur=c=>EUR.format((c||0)/100),eur0=c=>EUR0.format((c||0)/100);
const num=n=>new Intl.NumberFormat('it-IT').format(n||0);
const dmy=s=>s?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'';
const hm=s=>s?s.slice(11,16):'';
const pctTxt=p=>p==null?'—':String(p).replace('.',',')+'%';
const TABS=['oggi','viaggi','pedaggi','margine','fatturazione','listini','costi','anagrafiche','localizzatori'];
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
 return MRG.compute({trips:data.trips.filter(t=>t.status!=='aperto'),costs:data.costs.concat(extra),tolls:tr,from:p.from,to:p.to,vehicles:data.vehicles,drivers:data.drivers,customers:data.customers,shareCompany:true});
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
 ({oggi:renderToday,viaggi:renderTrips,pedaggi:renderTolls,margine:renderMargin,fatturazione:renderInvoicing,listini:renderRates,costi:renderCosts,anagrafiche:renderMaster,localizzatori:renderTrackers})[tab]();
}
const kpis=list=>'<div class="tr-kpis">'+list.map(([b,s])=>'<div class="tr-kpi"><b>'+b+'</b><span>'+esc(s)+'</span></div>').join('')+'</div>';
const lastPos=id=>{let best=null;for(const p of data.positions)if(p.vehicle_id===id&&(!best||p.at>best.at))best=p;return best;};
const SRC={webfleet:'Webfleet',verizon:'Verizon Connect',targa:'Targa Telematics',rfms:'rFMS',file:'file importato',telefono:'telefono autista',localizzatore:'localizzatore'};

// ---------- today: vehicles, map, alerts, reports from the drivers ----------
function renderToday(){
 const m=margin(),now=nowIso();
 const alerts=LOC.alerts({vehicles:data.vehicles.filter(v=>v.active!==false),trips:data.trips,positions:data.positions,nowAt:now});
 const issues=(data.issues||[]).filter(i=>!i.resolved).sort((a,b)=>a.at<b.at?1:-1);
 const dues=CT.deadlines(data.vehicles,now.slice(0,10)).filter(d=>d.days<=30);
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
  +dues.map(d=>'<div class="tr-alert '+(d.days<0?'alto':'medio')+'"><div><b>Scadenza</b> · '+esc(d.plate)+'<br>'+esc(d.label)+(d.days<0?' scaduta il ':' scade il ')+dmy(d.date)+(d.days>=0?' (tra '+d.days+(d.days===1?' giorno)':' giorni)'):'')+'</div><a class="tr-btn small ghost" style="margin-left:auto" href="#anagrafiche">Apri</a></div>').join('')
  +(!issues.length&&!alerts.length&&!dues.length?'<p class="tr-muted">Nessun avviso: tutti i mezzi in movimento hanno un viaggio aperto e mandano la posizione.</p>':'')+'</section></div>'
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
  +'<div class="tr-toolbar"><button class="tr-btn small" id="pratica">Carica pratica (PDF)</button><button class="tr-btn ghost small" id="xlsTrips">Scarica viaggi in Excel</button></div>'
  +'<div class="tr-grid2"><section class="tr-panel"><h2>Viaggi</h2><table class="tr-table"><thead><tr><th>Data</th><th>Mezzo</th><th>Autista</th><th>Tratta</th><th>Documenti</th><th>Stato</th></tr></thead><tbody>'
  +trips.map(t=>{const ds=docsOf(t.id);return '<tr data-trip="'+esc(t.id)+'"'+(sel===t.id?' class="sel"':'')+' style="cursor:pointer" tabindex="0"><td>'+dmy(t.started_at)+'<br><span class="tr-subtle">'+hm(t.started_at)+'–'+(hm(t.ended_at)||'in corso')+'</span></td><td>'+esc(veh(t.vehicle_id).plate)+'</td><td>'+esc(drv(t.driver_id).name)+'</td><td class="wrap">'+esc((t.origin||'?')+' → '+(t.destination||'?'))+'</td><td>'+(ds.length?ds.map(d=>'<span class="tr-pill'+(d.corrected?' flag':' ok')+'">'+esc(DOC_LABEL(d.kind))+'</span>').join(' '):'<span class="tr-pill bad">manca</span>')+'</td><td>'+esc(t.status)+'</td></tr>';}).join('')
  +'</tbody></table></section><section class="tr-panel" id="detail">'+tripDetail(sel)+'</section></div>';
 view.querySelectorAll('[data-trip]').forEach(r=>{r.onclick=()=>{sel=r.dataset.trip;renderTrips();};r.onkeydown=e=>{if(e.key==='Enter')r.onclick();};});
 $('xlsTrips').onclick=()=>xlsx('viaggi-'+p.from+'-'+p.to+'.xlsx',[{name:'Viaggi',columns:[{title:'Data',type:'date'},{title:'Partenza',type:'datetime'},{title:'Arrivo',type:'datetime'},{title:'Mezzo'},{title:'Autista'},{title:'Cliente'},{title:'Da'},{title:'A'},{title:'Km',type:'int'},{title:'Ricavo',type:'euro'},{title:'Stato'},{title:'Documenti'}],
  rows:trips.map(t=>[t.started_at.slice(0,10),t.started_at,t.ended_at,veh(t.vehicle_id).plate,drv(t.driver_id).name,cus(t.customer_id).name,t.origin,t.destination,t.km,t.revenue_cents!=null?t.revenue_cents/100:null,t.status,docsOf(t.id).map(d=>DOC_LABEL(d.kind)+(d.fields&&d.fields.numero?' '+d.fields.numero:'')).join(', ')])}]);
 $('pratica').onclick=()=>{if(!window.TrPratica){say('Modulo pratiche non caricato.','error');return;}window.scrollTo(0,0);window.TrPratica.open(view,{data,save,tripId:sel,done:msg=>{renderTrips();if(msg)say(msg,'ok');}});};
 bindTripEdit();
}
function shipmentsOf(id){
 const ss=(data.shipments||[]).filter(s=>s.trip_id===id);if(!ss.length)return '';
 return '<h3>Spedizioni ('+ss.length+')</h3><div style="overflow-x:auto"><table class="tr-table"><thead><tr><th>Documento</th><th>Destinatario</th><th>Cliente</th><th class="num">Quantità</th><th>Consegna</th><th class="num">Importo €</th></tr></thead><tbody>'
  +ss.map(s=>'<tr><td>'+esc((s.kind||'').toUpperCase()+' '+(s.number||''))+'</td><td class="wrap">'+esc(s.consignee||'')+'<br><span class="tr-subtle">'+esc(s.delivery_place||'')+'</span></td><td class="wrap">'+esc(cus(s.customer_id).name||s.customer_hint||'')+(s.customer_why?'<br><span class="tr-subtle">'+esc(s.customer_why)+'</span>':'')+'</td>'
   +'<td class="num">'+[s.animals?num(s.animals)+' capi':null,s.pallets?num(s.pallets)+' pallet':null,s.weight_kg?num(s.weight_kg)+' kg':null].filter(Boolean).join('<br>')+'</td>'
   +'<td>'+(s.delivered_at?'<span class="tr-pill ok">'+dmy(s.delivered_at)+'</span>':'<span class="tr-pill flag">non firmata</span>')+'</td>'
   +'<td class="num"><input class="tr-mini" data-shiprev="'+esc(s.id)+'" inputmode="decimal" placeholder="quota" value="'+esc(s.revenue_cents!=null?(s.revenue_cents/100).toFixed(2).replace('.',','):'')+'" aria-label="Importo della spedizione"></td></tr>'
   +((s.warnings||[]).length?'<tr><td colspan="6" class="wrap tr-subtle">'+s.warnings.map(esc).join(' · ')+'</td></tr>':'')).join('')
  +'</tbody></table></div><p class="tr-subtle">Senza importo, il totale del viaggio si divide tra le spedizioni per peso, capi o pallet.</p>';
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
  +shipmentsOf(id)
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
 document.querySelectorAll('[data-shiprev]').forEach(inp=>{inp.onchange=()=>{const s=data.shipments.find(x=>x.id===inp.dataset.shiprev);if(!s)return;const v=inp.value.trim()===''?null:DOC.normNumber(inp.value);if(v!=null&&v<0)return;s.revenue_cents=v==null?null:Math.round(v*100);save();say('Importo della spedizione salvato.','ok');};});
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

// ---------- controllo di gestione: margin, fixed and variable costs, break-even, trend, what to look at ----------
function marginFor(from,to){
 const tr=tollResult();
 const extra=tr?tr.rows.filter(r=>r.status==='fuori_viaggio').map(r=>({id:r.id,kind:'pedaggio',date:r.date,amount_cents:r.amount_cents,vehicle_id:r.vehicle_id})):[];
 return MRG.compute({trips:data.trips.filter(t=>t.status!=='aperto'),costs:data.costs.concat(extra),tolls:tr,from,to,vehicles:data.vehicles,drivers:data.drivers,customers:data.customers,shareCompany:true});
}
const LEVEL={critico:['alto','Urgente'],attenzione:['medio','Attenzione'],info:['','Da fare']};
function alertsHtml(list,empty){
 return list.length?list.map(a=>'<div class="tr-alert '+LEVEL[a.level][0]+'"><div><b>'+LEVEL[a.level][1]+'</b><br>'+esc(a.text)+'</div>'+(a.tab?'<a class="tr-btn small ghost" style="margin-left:auto" href="#'+a.tab+'">Apri</a>':'')+'</div>').join(''):'<p class="tr-muted">'+esc(empty)+'</p>';
}
/* Monthly revenue and costs: two series (fixed order: revenue blue, costs orange), one axis, legend, a tooltip on
   every month, margin % written above. The table view is the detail below. */
function trendSvg(series){
 const W=640,H=230,L=68,R=8,T=28,B=34,max=Math.max(1,...series.flatMap(s=>[s.revenue,s.cost]));
 const step=Math.pow(10,Math.floor(Math.log10(max)));const top=Math.ceil(max/step/2)*step*2||1;
 const y=v=>T+(H-T-B)*(1-v/top),cw=(W-L-R)/Math.max(1,series.length),bw=Math.min(28,(cw-14)/2);
 const bar=(x,v,cls)=>{const h=Math.max(0,y(0)-y(v)),r=Math.min(4,h);return h?'<path class="'+cls+'" d="M'+x+','+y(0)+'V'+(y(v)+r)+'q0,-'+r+' '+r+',-'+r+'h'+(bw-2*r)+'q'+r+',0 '+r+','+r+'V'+y(0)+'Z"/>':'';};
 let g='';for(let i=0;i<=4;i++){const v=top*i/4;g+='<line class="grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v)+'" y2="'+y(v)+'"/><text class="ax" x="'+(L-6)+'" y="'+(y(v)+4)+'" text-anchor="end">'+esc(eur0(v))+'</text>';}
 const cols=series.map((s,i)=>{const x0=L+cw*i+(cw-2*bw-2)/2;const pct=s.revenue?Math.round((s.revenue-s.cost)*1000/s.revenue)/10:null;
  return '<g class="col" tabindex="0"><title>'+esc(s.label+': ricavi '+eur0(s.revenue)+', costi '+eur0(s.cost)+', margine '+eur0(s.revenue-s.cost)+(pct!=null?' ('+pctTxt(pct)+')':''))+'</title><rect class="hit" x="'+(L+cw*i)+'" y="'+T+'" width="'+cw+'" height="'+(H-T-B)+'"/>'
   +bar(x0,s.revenue,'s1')+bar(x0+bw+2,s.cost,'s2')
   +(pct!=null?'<text class="lab'+(pct<0?' neg':'')+'" x="'+(x0+bw+1)+'" y="'+(Math.min(y(s.revenue),y(s.cost))-6)+'" text-anchor="middle">'+esc(pctTxt(pct))+'</text>':'')
   +'<text class="ax" x="'+(L+cw*i+cw/2)+'" y="'+(H-12)+'" text-anchor="middle">'+esc(s.label)+'</text></g>';}).join('');
 return '<div class="tr-legend"><span><i class="s1"></i>Ricavi</span><span><i class="s2"></i>Costi</span><span class="tr-subtle">sopra: margine sui ricavi</span></div>'
  +'<svg class="tr-chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Ricavi e costi per mese">'+g+'<line class="base" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(0)+'" y2="'+y(0)+'"/>'+cols+'</svg>';
}
function renderMargin(){
 const p=period(),m=marginFor(p.from,p.to),t=m.totals;
 const A=CT.analyze({m,costs:data.costs,vehicles:data.vehicles,drivers:data.drivers,customers:data.customers,payslips:data.payslips,company:data.company,from:p.from,to:p.to,today:nowIso().slice(0,10)});
 const dims={vehicles:'Per mezzo',drivers:'Per autista',customers:'Per cliente',trips:'Per viaggio'};
 const refKm=(data.company||{}).ref_cost_km_cents||null;
 const trend=CT.lastMonths(p.to,6).map(mo=>{const x=marginFor(mo.from,mo.to).totals;return {label:mo.label,revenue:x.revenue_cents,cost:x.cost_cents};});
 // cost structure by group
 const groups={Viaggio:0,Autista:0,Mezzo:0,Azienda:0};for(const [k,c] of Object.entries(m.by_kind))groups[MRG.KIND_GROUP[k]||'Azienda']+=c;
 const kinds=Object.entries(m.by_kind).sort((a,b)=>b[1]-a[1]);const maxK=Math.max(1,...kinds.map(k=>k[1]));
 const vrow=A.vehicles.reduce((o,v)=>(o[v.id]=v,o),{});
 let rows;
 if(mDim==='trips')rows=m.trips.map(r=>'<tr><td>'+dmy(r.date)+'</td><td class="wrap">'+esc((r.origin||'?')+' → '+(r.destination||'?'))+'</td><td>'+esc(veh(r.vehicle_id).plate)+'</td><td>'+esc(cus(r.customer_id).name||'')+'</td><td class="num">'+num(r.km)+'</td><td class="num">'+eur(r.revenue_cents)+'</td><td class="num">'+eur(r.cost_cents)+'</td><td class="num '+(r.margin_cents<0?'neg':'')+'">'+eur(r.margin_cents)+'</td><td class="num">'+pctTxt(r.margin_pct)+'</td></tr>').join('');
 else rows=m[mDim].map(g=>{const v=vrow[g.id]||{};return '<tr><td>'+esc(g.name)+'</td><td class="num">'+num(g.trips)+'</td><td class="num">'+num(g.km)+'</td><td class="num">'+eur0(g.revenue_cents)+'</td><td class="num">'+eur0(g.cost_cents)+(g.unallocated_cents?'<br><span class="tr-subtle">'+eur0(g.unallocated_cents)+' senza viaggi</span>':'')+'</td><td class="num '+(g.margin_cents<0?'neg':'')+'">'+eur0(g.margin_cents)+'</td><td class="num">'+pctTxt(g.margin_pct)+'</td><td class="num">'+(g.km?eur(Math.round(g.revenue_cents/g.km)):'—')+'</td><td class="num">'+(g.cost_per_km_cents!=null?'<span class="'+(refKm&&g.cost_per_km_cents>refKm?'neg':'')+'">'+eur(g.cost_per_km_cents)+'</span>':'—')+'</td>'+(mDim==='vehicles'?'<td class="num">'+(v.l100!=null?String(v.l100).replace('.',','):'—')+'</td>':'')+'</tr>';}).join('');
 const head=mDim==='trips'?'<th>Data</th><th>Tratta</th><th>Mezzo</th><th>Cliente</th><th class="num">Km</th><th class="num">Ricavo</th><th class="num">Costi</th><th class="num">Margine</th><th class="num">%</th>':'<th>'+({vehicles:'Mezzo',drivers:'Autista',customers:'Cliente'}[mDim])+'</th><th class="num">Viaggi</th><th class="num">Km</th><th class="num">Ricavi</th><th class="num">Costi</th><th class="num">Margine</th><th class="num">%</th><th class="num">Ricavo/km</th><th class="num">Costo/km</th>'+(mDim==='vehicles'?'<th class="num">l/100 km</th>':'');
 const be=A.breakeven_cents;
 view.innerHTML=kpis([[eur0(t.revenue_cents),'Ricavi'],[eur0(t.cost_cents),'Costi (fissi '+eur0(A.fixed_cents)+', variabili '+eur0(A.variable_cents)+')'],[eur0(t.margin_cents),'Margine · '+pctTxt(t.margin_pct)+' dei ricavi'],
   [A.revenue_per_km_cents!=null?eur(A.revenue_per_km_cents):'—','Ricavo per km'],[A.cost_per_km_cents!=null?eur(A.cost_per_km_cents):'—','Costo per km (fissi '+(A.fixed_per_km_cents!=null?eur(A.fixed_per_km_cents):'—')+' + variabili '+(A.variable_per_km_cents!=null?eur(A.variable_per_km_cents):'—')+')'+(refKm?' · riferimento '+eur(refKm):'')],
   [be!=null?eur0(be):'—','Punto di pareggio'+(be!=null?(A.breakeven_gap_cents>=0?' · sei sopra di '+eur0(A.breakeven_gap_cents):' · mancano '+eur0(-A.breakeven_gap_cents)):' (servono ricavi e costi)')]])
  +'<div class="tr-grid2"><section class="tr-panel"><h2>Andamento degli ultimi 6 mesi</h2>'+trendSvg(trend)+'</section>'
  +'<section class="tr-panel"><h2>Da guardare</h2>'+alertsHtml(A.alerts,'Niente da segnalare nel periodo.')+'</section></div>'
  +'<div class="tr-grid2"><section class="tr-panel"><h2>Struttura dei costi</h2><table class="tr-table"><thead><tr><th>Gruppo</th><th class="num">Costi</th><th class="num">%</th><th class="num">€/km</th></tr></thead><tbody>'
   +Object.entries(groups).map(([g,c])=>'<tr><td>'+g+'</td><td class="num">'+eur0(c)+'</td><td class="num">'+(t.cost_cents?Math.round(c*100/t.cost_cents)+'%':'—')+'</td><td class="num">'+(t.km?eur(Math.round(c/t.km)):'—')+'</td></tr>').join('')
   +'<tr><th>Totale</th><th class="num">'+eur0(t.cost_cents)+'</th><th></th><th class="num">'+(A.cost_per_km_cents!=null?eur(A.cost_per_km_cents):'—')+'</th></tr></tbody></table>'
   +'<p class="tr-subtle">Variabili: crescono con i km (carburante, AdBlue, pedaggi, pneumatici, officina, subvettori, trasferte, straordinari, autisti esterni). Fissi: ci sono anche col camion fermo (stipendi, leasing, assicurazione, bollo, spese generali). Margine di contribuzione '+eur0(A.contribution_cents)+' ('+pctTxt(A.contribution_pct)+'): copre i fissi oltre il punto di pareggio.</p></section>'
  +'<section class="tr-panel"><h2>Dove vanno i costi</h2><table class="tr-table"><tbody>'+kinds.map(([k,c])=>'<tr><td>'+esc(MRG.KIND_LABEL[k]||k)+'</td><td style="width:40%"><div class="tr-bar"><i style="width:'+Math.round(c*100/maxK)+'%"></i></div></td><td class="num">'+eur0(c)+'</td><td class="num">'+(t.cost_cents?Math.round(c*100/t.cost_cents)+'%':'')+'</td></tr>').join('')+'</tbody></table></section></div>'
  +'<section class="tr-panel"><div class="tr-toolbar">'+Object.entries(dims).map(([k,l])=>'<button class="tr-btn small'+(k===mDim?' blue':' ghost')+'" data-dim="'+k+'">'+l+'</button>').join('')+'<button class="tr-btn small ghost" id="xlsMargin" style="margin-left:auto">Scarica in Excel</button></div><table class="tr-table"><thead><tr>'+head+'</tr></thead><tbody>'+rows+'</tbody></table>'
  +'<p class="tr-subtle">Costi del viaggio: carburante segnalato e pedaggi abbinati. Costi del mezzo e dell\'autista ripartiti sui loro viaggi per km; spese generali su tutti i viaggi per km. Assicurazioni, bolli e buste paga contano per i giorni del periodo che coprono.</p></section>';
 view.querySelectorAll('[data-dim]').forEach(b=>b.onclick=()=>{mDim=b.dataset.dim;renderMargin();});
 $('xlsMargin').onclick=()=>{
  const g=(list,title)=>({name:title,columns:[{title:title.replace('Per ','').replace(/^./,c=>c.toUpperCase())},{title:'Viaggi',type:'int'},{title:'Km',type:'int'},{title:'Ricavi',type:'euro'},{title:'Costi',type:'euro'},{title:'di cui senza viaggi',type:'euro'},{title:'Margine',type:'euro'},{title:'Margine %',type:'number'},{title:'Ricavo per km',type:'euro'},{title:'Costo per km',type:'euro'}],
   rows:list.map(x=>[x.name,x.trips,x.km,x.revenue_cents/100,x.cost_cents/100,(x.unallocated_cents||0)/100,x.margin_cents/100,x.margin_pct,x.km?Math.round(x.revenue_cents/x.km)/100:null,x.cost_per_km_cents!=null?x.cost_per_km_cents/100:null])});
  xlsx('controllo-di-gestione-'+p.from+'-'+p.to+'.xlsx',[
   {name:'Riepilogo',columns:[{title:'Voce'},{title:'Valore',type:'euro'}],rows:[['Ricavi',t.revenue_cents/100],['Costi',t.cost_cents/100],['di cui variabili',A.variable_cents/100],['di cui fissi',A.fixed_cents/100],['Margine',t.margin_cents/100],['Margine di contribuzione',A.contribution_cents/100],['Punto di pareggio (ricavi)',be!=null?be/100:null],...kinds.map(([k,c])=>['Costi · '+(MRG.KIND_LABEL[k]||k),c/100])]},
   {name:'Andamento',columns:[{title:'Mese'},{title:'Ricavi',type:'euro'},{title:'Costi',type:'euro'},{title:'Margine',type:'euro'}],rows:trend.map(s=>[s.label,s.revenue/100,s.cost/100,(s.revenue-s.cost)/100])},
   g(m.vehicles,'Per mezzo'),g(m.drivers,'Per autista'),g(m.customers,'Per cliente'),
   {name:'Per viaggio',columns:[{title:'Data',type:'date'},{title:'Da'},{title:'A'},{title:'Mezzo'},{title:'Autista'},{title:'Cliente'},{title:'Km',type:'int'},{title:'Ricavo',type:'euro'},{title:'Costi diretti',type:'euro'},{title:'Costi ripartiti',type:'euro'},{title:'Margine',type:'euro'},{title:'Margine %',type:'number'}],
    rows:m.trips.map(r=>[r.date,r.origin,r.destination,veh(r.vehicle_id).plate,drv(r.driver_id).name,cus(r.customer_id).name,r.km,r.revenue_cents/100,Object.values(r.direct).reduce((s,x)=>s+x,0)/100,Object.values(r.allocated).reduce((s,x)=>s+x,0)/100,r.margin_cents/100,r.margin_pct])}]);
 };
}
// ---------- invoicing ----------
function renderInvoicing(){
 const p=period();const rows=MRG.invoiceRows({trips:data.trips,documents:data.documents,vehicles:data.vehicles,customers:data.customers,drivers:data.drivers,shipments:data.shipments,from:p.from,to:p.to});
 const byC=new Map();for(const r of rows){const key=r.customer_id||r.customer;const g=byC.get(key)||{id:r.customer_id,name:r.customer||'Cliente non indicato',n:0,c:0,zero:0};g.n++;g.c+=r.amount_cents;if(!r.amount_cents)g.zero++;byC.set(key,g);}
 const pod=new Set(data.documents.filter(d=>d.kind==='consegna').map(d=>d.trip_id));
 const co=data.company||{};const coMiss=!co.vat||!co.street||!co.cap||!co.comune;
 view.innerHTML='<section class="tr-panel"><h2>Da fatturare nel periodo</h2><p class="tr-muted">Viaggi chiusi, una riga per viaggio o per spedizione. Gli importi mancanti si calcolano dal listino del cliente. Per ogni cliente puoi scaricare la fattura elettronica (XML FatturaPA) da caricare nel programma di fatturazione o inviare allo SdI.</p>'
  +'<div class="tr-toolbar"><button class="tr-btn" id="rates">Calcola importi dal listino</button><button class="tr-btn ghost" id="ratesAll">Ricalcola anche quelli già da listino</button><button class="tr-btn ghost" id="xls"'+(rows.length?'':' disabled')+'>Scarica in Excel</button><button class="tr-btn ghost" id="csv"'+(rows.length?'':' disabled')+'>CSV</button><button class="tr-btn ghost" id="mark"'+(rows.length?'':' disabled')+'>Segna come fatturati</button></div>'
  +(coMiss?'<p class="tr-banner">Per la fattura elettronica servono i dati della tua azienda: compilali qui sotto.</p>':'')
  +'<table class="tr-table"><thead><tr><th>Cliente</th><th class="num">Righe</th><th class="num">Importo</th><th></th></tr></thead><tbody>'+[...byC.values()].map(g=>'<tr><td>'+esc(g.name)+(g.zero?' <span class="tr-pill flag">'+g.zero+' senza importo</span>':'')+'</td><td class="num">'+g.n+'</td><td class="num">'+eur(g.c)+'</td><td>'+(g.id?'<button class="tr-link" data-fpa="'+esc(g.id)+'">Fattura elettronica (XML)</button>':'<span class="tr-subtle">indica il cliente nel viaggio</span>')+'</td></tr>').join('')+'</tbody></table><div id="fpaOut"></div></section>'
  +'<section class="tr-panel"><table class="tr-table"><thead><tr><th>Cliente</th><th>Data</th><th>Documento</th><th>Tratta</th><th>Merce</th><th>Targa</th><th>Consegna</th><th class="num">Km</th><th class="num">Importo</th></tr></thead><tbody>'
  +rows.map(r=>'<tr><td>'+esc(r.customer)+'</td><td>'+dmy(r.date)+'</td><td>'+esc(r.doc)+'</td><td class="wrap">'+esc(r.origin+' → '+r.destination)+'</td><td>'+esc(r.goods)+'</td><td>'+esc(r.plate)+'</td><td>'+((r.delivered??pod.has(r.trip_id))?'<span class="tr-pill ok">firmata</span>':'<span class="tr-pill flag">manca</span>')+'</td><td class="num">'+num(r.km)+'</td><td class="num">'+eur(r.amount_cents)+(r.price_auto?'<br><span class="tr-subtle">da listino</span>':'')+'</td></tr>').join('')+'</tbody></table></section>'
  +'<section class="tr-panel" style="max-width:760px"><h2>Dati della tua azienda per la fattura</h2><form id="coForm" class="tr-form-grid">'
  +[['name','Ragione sociale'],['vat','Partita IVA'],['cf','Codice fiscale (se diverso)'],['street','Indirizzo'],['cap','CAP'],['comune','Comune'],['provincia','Provincia (sigla)'],['iban','IBAN per il pagamento'],['regime','Regime fiscale (RF01 ordinario)']].map(([k,l])=>'<label>'+esc(l)+'<input name="'+k+'" value="'+esc(co[k]||'')+'"></label>').join('')
  +'<label>Costo di riferimento €/km (per il margine)<input name="ref_km" inputmode="decimal" value="'+esc(co.ref_cost_km_cents!=null?(co.ref_cost_km_cents/100).toFixed(2).replace('.',','):'')+'"></label><button class="tr-btn">Salva</button></form><p class="tr-subtle">Il costo di riferimento al km è quello con cui confrontarsi, per esempio i valori indicativi pubblicati dal Ministero dei Trasporti per la tua categoria di mezzi.</p></section>';
 const runRates=only=>{const r=applyRates(only);say((r.done===0&&!r.miss.length?'Nessun importo da calcolare: i viaggi del periodo hanno già un importo. Usa «Ricalcola anche quelli già da listino» dopo aver cambiato un listino.':r.done+(r.done===1?' importo calcolato':' importi calcolati')+' dal listino.')+(r.miss.length?' Da controllare: '+r.miss.slice(0,3).join('; ')+(r.miss.length>3?'…':''):''),r.miss.length?'error':'ok');renderInvoicing();};
 $('rates').onclick=()=>runRates(true);$('ratesAll').onclick=()=>runRates(false);
 view.querySelectorAll('[data-fpa]').forEach(b=>b.onclick=()=>{
  const cid=b.dataset.fpa;const mine=rows.filter(r=>r.customer_id===cid&&r.amount_cents>0);
  const res=invoiceXml(cid,mine);const out=$('fpaOut');
  if(res.errors.length){out.innerHTML='<p class="tr-banner error">Per la fattura di '+esc(cus(cid).name)+' manca: '+esc(res.errors.join(', '))+'. I dati del cliente si completano in Anagrafiche.</p>';return;}
  download(res.file_name,res.xml,'application/xml');
  data.invoices=data.invoices||[];data.invoices.push({id:ST.uid(),customer_id:cid,number:res.number,date:res.date,taxable_cents:res.totals.taxable_cents,vat_cents:res.totals.vat_cents,total_cents:res.totals.total_cents,file_name:res.file_name,trip_ids:[...new Set(mine.map(r=>r.trip_id))],shipment_ids:mine.map(r=>r.shipment_id).filter(Boolean)});save();
  out.innerHTML='<p class="tr-banner ok">Fattura '+esc(res.number)+' per '+esc(cus(cid).name)+': imponibile '+eur(res.totals.taxable_cents)+', IVA '+eur(res.totals.vat_cents)+(res.totals.stamp?', bollo 2,00 €':'')+', totale '+eur(res.totals.total_cents)+'. File '+esc(res.file_name)+' scaricato. I trasporti internazionali sono non imponibili (art. 9): fai confermare le regole IVA al tuo commercialista.</p>';
 });
 $('coForm').onsubmit=e=>{e.preventDefault();const el=e.target.elements;const c=data.company;
  for(const k of ['name','vat','cf','street','cap','comune','provincia','iban','regime'])c[k]=(el[k].value||'').trim()||null;
  if(c.vat)c.vat=c.vat.replace(/^IT/i,'').replace(/\s/g,'');if(c.provincia)c.provincia=c.provincia.toUpperCase();
  if(c.vat&&!ANA.pivaOk(c.vat)){say('Partita IVA non valida: controlla le 11 cifre.','error');return;}
  const r=el.ref_km.value.trim();c.ref_cost_km_cents=r?Math.round((DOC.normNumber(r)||0)*100):null;
  save();say('Dati dell\'azienda salvati.','ok');renderInvoicing();};
 $('xls').onclick=()=>xlsx('viaggi-da-fatturare-'+p.from+'-'+p.to+'.xlsx',[
  {name:'Per cliente',columns:[{title:'Cliente'},{title:'Righe',type:'int'},{title:'Importo',type:'euro'}],rows:[...byC.values()].map(g=>[g.name,g.n,g.c/100])},
  {name:'Dettaglio',columns:[{title:'Cliente'},{title:'Data',type:'date'},{title:'Documento'},{title:'Da'},{title:'A'},{title:'Merce'},{title:'Peso kg',type:'number'},{title:'Targa'},{title:'Autista'},{title:'Km',type:'int'},{title:'Consegna firmata'},{title:'Importo',type:'euro'},{title:'Da listino'},{title:'Viaggio'}],
   rows:rows.map(r=>[r.customer,r.date,r.doc,r.origin,r.destination,r.goods,r.weight_kg===''?null:r.weight_kg,r.plate,r.driver,r.km===''?null:r.km,(r.delivered??pod.has(r.trip_id))?'sì':'no',r.amount_cents/100,r.price_auto?'sì':'',r.trip_id])}]);
 $('csv').onclick=()=>download('viaggi-da-fatturare-'+p.from+'-'+p.to+'.csv',MRG.toCsv(rows),'text/csv;charset=utf-8');
 $('mark').onclick=()=>{const ids=new Set(rows.map(r=>r.trip_id));for(const t of data.trips)if(ids.has(t.id))t.status='fatturato';save();renderInvoicing();};
}

// ---------- listini: how each customer is priced ----------
const MLAB=LIS.METHODS;
let rateEdit=null,rateTry=null;
function applyRates(onlyMissing){
 const p=period();let done=0;const miss=[];
 const cards=data.rate_cards||[];
 for(const t of data.trips){
  if(t.status!=='chiuso'||t.started_at.slice(0,10)<p.from||t.started_at.slice(0,10)>p.to)continue;
  const ships=(data.shipments||[]).filter(s=>s.trip_id===t.id);
  const targets=ships.length?ships:[t];
  for(const x of targets){
   if(x.revenue_cents!=null&&(onlyMissing||!x.price_auto))continue;
   const cid=x.customer_id||t.customer_id;const card=LIS.cardFor(cards,cid,t.started_at.slice(0,10));
   if(!card){miss.push((cus(cid).name||'Cliente non indicato')+': nessun listino');continue;}
   const r=LIS.price(card,LIS.jobOf(t,ships.length?x:null,ships,data.documents));
   if(r.amount_cents==null){miss.push((cus(cid).name||'')+' '+dmy(t.started_at)+': manca '+r.missing.join(', '));continue;}
   x.revenue_cents=r.amount_cents;x.price_auto=true;x.price_detail={card:card.name,lines:r.lines,missing:r.missing};done++;
  }
 }
 save();return {done,miss};
}
function renderRates(){
 const cards=data.rate_cards||[];
 const card=rateEdit&&rateEdit!=='new'?cards.find(c=>c.id===rateEdit):null;
 const sup=k=>(card&&card.supplements||[]).find(s=>s.kind===k)||{};
 const v=(x,d='')=>x==null?d:x;
 const money=c=>c==null?'':(c/100).toFixed(2).replace('.',',');
 const zonesTxt=card&&card.zones?card.zones.map(z=>((z.from||[]).length?z.from.join(', ')+' -> ':'')+(z.to||[]).join(', ')+' = '+money(z.amount_cents!=null?z.amount_cents:z.per_unit_cents)+(z.per_unit_cents?' /'+({pallet:'pallet',peso:'kg',capi:'capo',colli:'collo',metri:'m'}[z.basis]||'pallet'):'')).join('\n'):'';
 const bandsTxt=card&&card.bands?card.bands.map(b=>b.upto+' = '+money(b.amount_cents)+(b.per_unit?'/u':'')).join('\n'):'';
 const mine=t=>card&&card.customer_id&&(t.customer_id===card.customer_id||(data.shipments||[]).some(x=>x.trip_id===t.id&&x.customer_id===card.customer_id))?0:1;
 const closed=data.trips.filter(t=>t.status!=='aperto').sort((a,b)=>mine(a)-mine(b)||(a.started_at<b.started_at?1:-1)).slice(0,30);
 let tryOut='';
 if(card&&rateTry){const t=data.trips.find(x=>x.id===rateTry);if(t){const ships=(data.shipments||[]).filter(s=>s.trip_id===t.id);const r=LIS.price(card,LIS.jobOf(t,ships[0]||null,ships,data.documents));
  tryOut='<table class="tr-table"><tbody>'+r.lines.map(l=>'<tr><td class="wrap">'+esc(l.label)+'</td><td class="num">'+esc(l.qty)+' '+esc(l.unit)+'</td><td class="num">'+eur(l.amount_cents)+'</td></tr>').join('')+'<tr><th>Totale</th><td></td><th class="num">'+(r.amount_cents!=null?eur(r.amount_cents):'—')+'</th></tr></tbody></table>'+(r.missing.length?'<p class="tr-banner error">Manca: '+esc(r.missing.join(', '))+'</p>':'');}}
 view.innerHTML='<div class="tr-grid2"><section class="tr-panel"><div class="tr-toolbar"><h2 style="margin:0">Listini</h2><button class="tr-btn small" id="rateAdd" style="margin-left:auto">Nuovo listino</button></div>'
  +'<p class="tr-muted">Ogni cliente può avere il suo listino. Il listino senza cliente vale per tutti gli altri. In Fatturazione, «Calcola importi dal listino» applica il listino ai viaggi e alle spedizioni senza importo.</p>'
  +'<table class="tr-table"><thead><tr><th>Listino</th><th>Cliente</th><th>Metodo</th><th>Validità</th><th></th></tr></thead><tbody>'
  +cards.map(c=>'<tr'+(rateEdit===c.id?' class="sel"':'')+(c.active===false?' style="opacity:.55"':'')+'><td class="wrap"><strong>'+esc(c.name)+'</strong></td><td class="wrap">'+esc(c.customer_id?cus(c.customer_id).name||'?':'Tutti gli altri clienti')+'</td><td>'+esc((MLAB[c.method]||{}).label||c.method)+'</td><td>'+(c.valid_from||c.valid_to?esc((c.valid_from?dmy(c.valid_from):'…')+' – '+(c.valid_to?dmy(c.valid_to):'…')):'sempre')+'</td><td><button class="tr-link" data-rate="'+esc(c.id)+'">Modifica</button></td></tr>').join('')
  +'</tbody></table></section>'
  +'<section class="tr-panel">'+(rateEdit?'<h2>'+(card?'Modifica listino':'Nuovo listino')+'</h2><form id="rateForm" class="tr-rate">'
   +'<label>Nome<input name="name" required value="'+esc(card?card.name:'')+'"></label>'
   +'<label>Cliente<select name="customer"><option value="">Tutti gli altri clienti (predefinito)</option>'+data.customers.map(c=>'<option value="'+esc(c.id)+'"'+(card&&card.customer_id===c.id?' selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></label>'
   +'<label>Metodo<select name="method">'+Object.entries(MLAB).map(([k,m])=>'<option value="'+k+'"'+((card?card.method:'km')===k?' selected':'')+'>'+esc(m.label)+'</option>').join('')+'</select></label>'
   +'<div class="tr-row"><label>Valido dal<input type="date" name="valid_from" value="'+esc(card&&card.valid_from||'')+'"></label><label>al<input type="date" name="valid_to" value="'+esc(card&&card.valid_to||'')+'"></label></div>'
   +'<label data-m="fisso">Tratta<input name="route" placeholder="es. Mantova → Bologna" value="'+esc(card&&card.route||'')+'"></label><label data-m="fisso">Prezzo del viaggio €<input name="amount" inputmode="decimal" value="'+money(card&&card.amount_cents)+'"></label>'
   +'<label data-m="km">€ al km<input name="per_km" inputmode="decimal" value="'+money(card&&card.per_km_cents)+'"></label>'
   +'<label data-m="tonnellata">€ a tonnellata<input name="per_ton" inputmode="decimal" value="'+money(card&&card.per_ton_cents)+'"></label>'
   +'<label data-m="collo capo">€ per unità<input name="per_unit" inputmode="decimal" value="'+money(card&&card.per_unit_cents)+'"></label>'
   +'<label data-m="collo">Unità<select name="unit_basis"><option value="pallet"'+(card&&card.basis==='colli'?'':' selected')+'>pallet</option><option value="colli"'+(card&&card.basis==='colli'?' selected':'')+'>colli</option></select></label>'
   +'<label data-m="ora">€ all\'ora<input name="per_hour" inputmode="decimal" value="'+money(card&&card.per_hour_cents)+'"></label>'
   +'<label data-m="zone">Zone, una per riga<textarea name="zones" rows="6" placeholder="MN, CR, BS = 380&#10;Lombardia = 420&#10;FR = 1200&#10;VI -> FR = 110 /pallet">'+esc(zonesTxt)+'</textarea><span class="tr-subtle">Province (MN), regioni (Lombardia), paesi (FR, Francia), CAP (46*) o nomi di località. «da -> a» per le coppie di partenza e arrivo. «/pallet», «/kg», «/capo» per il prezzo a unità.</span></label>'
   +'<label data-m="fasce">Fasce in base a<select name="band_basis">'+Object.entries(LIS.BASES).map(([k,b])=>'<option value="'+k+'"'+((card&&card.basis||'peso')===k?' selected':'')+'>'+esc(b.label)+'</option>').join('')+'</select></label>'
   +'<label data-m="fasce">Fasce, una per riga<textarea name="bands" rows="5" placeholder="1000 = 120&#10;5000 = 300&#10;24000 = 0,08/u">'+esc(bandsTxt)+'</textarea><span class="tr-subtle">«fino a = importo». Con «/u» l\'importo è per unità (per kg, per pallet…).</span></label>'
   +'<label>Minimo fatturabile €<input name="min" inputmode="decimal" value="'+money(card&&card.min_cents)+'"></label>'
   +'<fieldset class="tr-fs"><legend>Supplementi</legend>'
   +'<div class="tr-row"><label>Gasolio di base €/l<input name="gas_base" inputmode="decimal" value="'+esc(v(sup('gasolio').base_eur_l))+'"></label><label>Incidenza gasolio %<input name="gas_inc" inputmode="decimal" value="'+esc(v(sup('gasolio').incidence_pct,''))+'"></label><label>Gasolio attuale €/l<input name="gas_cur" inputmode="decimal" value="'+esc(v(sup('gasolio').current_eur_l))+'"></label></div><p class="tr-subtle" style="grid-column:1/-1;margin:0">Gasolio attuale: il prezzo medio settimanale pubblicato dal Ministero (MIMIT) o quello pagato. Aggiornalo quando cambia; il viaggio può avere il suo.</p>'
   +'<div class="tr-row"><label>Sosta €/ora<input name="sosta" inputmode="decimal" value="'+money(sup('sosta').per_hour_cents)+'"></label><label>Ore di sosta gratuite<input name="sosta_free" inputmode="decimal" value="'+esc(v(sup('sosta').free_hours,''))+'"></label></div>'
   +'<div class="tr-row"><label>Scarico in più €<input name="scarico" inputmode="decimal" value="'+money(sup('scarico_extra').amount_cents)+'"></label><label>ADR €<input name="adr" inputmode="decimal" value="'+money(sup('adr').amount_cents)+'"></label></div>'
   +'<div class="tr-row"><label>Sponda idraulica €<input name="sponda" inputmode="decimal" value="'+money(sup('sponda').amount_cents)+'"></label><label>Consegna al piano €<input name="piano" inputmode="decimal" value="'+money(sup('piano').amount_cents)+'"></label></div>'
   +'<div class="tr-row"><label>Festivo o notturno %<input name="festivo" inputmode="decimal" value="'+esc(v(sup('festivo').pct,''))+'"></label><label>Supplemento fisso €<input name="fisso_extra" inputmode="decimal" value="'+money(sup('fisso').amount_cents)+'"></label></div></fieldset>'
   +'<p class="tr-error" id="rateErr" hidden></p><div class="tr-toolbar"><button class="tr-btn">Salva</button><button type="button" class="tr-btn ghost" id="rateCancel">Annulla</button>'+(card?'<button type="button" class="tr-btn ghost" id="rateOff">'+(card.active===false?'Riattiva':'Disattiva')+'</button>':'')+'</div></form>'
   +(card?'<h3>Prova su un viaggio</h3><select id="rateTry"><option value="">Scegli un viaggio chiuso</option>'+closed.map(t=>'<option value="'+esc(t.id)+'"'+(rateTry===t.id?' selected':'')+'>'+dmy(t.started_at)+' · '+esc((t.origin||'?')+' → '+(t.destination||'?'))+' · '+esc(cus(t.customer_id).name||'')+'</option>').join('')+'</select>'+tryOut:'')
   :'<h2>Metodi di calcolo</h2><ul class="tr-list"><li><strong>Prezzo fisso per tratta</strong>: un importo a viaggio.</li><li><strong>Al km</strong>: km del viaggio per la tariffa.</li><li><strong>A zone</strong>: per provincia, regione, paese o CAP di consegna, anche per coppia partenza → arrivo.</li><li><strong>A fasce</strong>: di peso, pallet, metri lineari, colli, km o capi.</li><li><strong>A tonnellata, a collo o pallet, a capo, all\'ora</strong>.</li></ul><p class="tr-muted">Su tutti: minimo fatturabile e supplementi (adeguamento gasolio, sosta oltre le ore gratuite, scarichi in più, ADR, sponda, consegna al piano, festivi).</p>')
  +'</section></div>';
 view.querySelectorAll('[data-rate]').forEach(b=>b.onclick=()=>{rateEdit=b.dataset.rate;rateTry=null;renderRates();});
 $('rateAdd').onclick=()=>{rateEdit='new';rateTry=null;renderRates();};
 const f=$('rateForm');if(!f)return;
 const show=()=>{const m=f.elements.method.value;f.querySelectorAll('[data-m]').forEach(el=>{el.hidden=!el.dataset.m.split(' ').includes(m);});};
 f.elements.method.onchange=show;show();
 $('rateCancel').onclick=()=>{rateEdit=null;renderRates();};
 if($('rateOff'))$('rateOff').onclick=()=>{card.active=card.active===false;save();renderRates();};
 if($('rateTry'))$('rateTry').onchange=e=>{rateTry=e.target.value||null;renderRates();};
 f.onsubmit=e=>{e.preventDefault();const el=f.elements,errs=[];
  const n=(k,label,{cents=true}={})=>{const raw=(el[k].value||'').trim();if(!raw)return null;const x=DOC.normNumber(raw);if(x==null||x<0){errs.push(label+' non valido.');return null;}return cents?Math.round(x*100):x;};
  const o={id:card?card.id:ST.uid(),name:el.name.value.trim(),customer_id:el.customer.value||null,method:el.method.value,valid_from:el.valid_from.value||null,valid_to:el.valid_to.value||null,active:card?card.active:true};
  if(!o.name)errs.push('Dai un nome al listino.');
  if(o.method==='fisso'){o.amount_cents=n('amount','Prezzo');o.route=el.route.value.trim()||null;if(o.amount_cents==null)errs.push('Indica il prezzo del viaggio.');}
  if(o.method==='km'){o.per_km_cents=n('per_km','€ al km');if(o.per_km_cents==null)errs.push('Indica i € al km.');}
  if(o.method==='tonnellata'){o.per_ton_cents=n('per_ton','€ a tonnellata');if(o.per_ton_cents==null)errs.push('Indica i € a tonnellata.');}
  if(o.method==='collo'||o.method==='capo'){o.per_unit_cents=n('per_unit','€ per unità');if(o.per_unit_cents==null)errs.push('Indica i € per unità.');if(o.method==='collo')o.basis=el.unit_basis.value;}
  if(o.method==='ora'){o.per_hour_cents=n('per_hour','€ all\'ora');if(o.per_hour_cents==null)errs.push('Indica i € all\'ora.');}
  if(o.method==='zone'){o.zones=LIS.parseZones(el.zones.value);const bad=o.zones.filter(z=>z.error);if(bad.length)errs.push(...bad.map(z=>z.error));if(!o.zones.length)errs.push('Scrivi almeno una zona.');}
  if(o.method==='fasce'){o.basis=el.band_basis.value;o.bands=LIS.parseBands(el.bands.value);const bad=o.bands.filter(z=>z.error);if(bad.length)errs.push(...bad.map(z=>z.error));if(!o.bands.length)errs.push('Scrivi almeno una fascia.');}
  o.min_cents=n('min','Minimo');
  const s=[];const gb=n('gas_base','Gasolio di base',{cents:false}),gi=n('gas_inc','Incidenza gasolio',{cents:false}),gc=n('gas_cur','Gasolio attuale',{cents:false});
  if(gb)s.push({kind:'gasolio',base_eur_l:gb,incidence_pct:gi||30,current_eur_l:gc||null});
  const so=n('sosta','Sosta');if(so)s.push({kind:'sosta',per_hour_cents:so,free_hours:n('sosta_free','Ore gratuite',{cents:false})||0});
  for(const [k,name,label] of [['scarico_extra','scarico','Scarico in più'],['adr','adr','ADR'],['sponda','sponda','Sponda'],['piano','piano','Consegna al piano'],['fisso','fisso_extra','Supplemento fisso']]){const a=n(name,label);if(a)s.push({kind:k,amount_cents:a});}
  const fe=n('festivo','Festivo',{cents:false});if(fe)s.push({kind:'festivo',pct:fe});
  o.supplements=s;
  if(o.valid_from&&o.valid_to&&o.valid_to<o.valid_from)errs.push('La data di fine è prima dell\'inizio.');
  if(errs.length){$('rateErr').textContent=errs.join(' ');$('rateErr').hidden=false;return;}
  data.rate_cards=data.rate_cards||[];const i=data.rate_cards.findIndex(x=>x.id===o.id);if(i>=0)data.rate_cards[i]=o;else data.rate_cards.push(o);
  rateEdit=o.id;save();say('Listino salvato.','ok');renderRates();};
}

// ---------- electronic invoice (FatturaPA) per customer ----------
function nextInvoiceNumber(date){const y=date.slice(0,4);const n=(data.invoices||[]).filter(i=>i.date.slice(0,4)===y).length+1;return n+'/'+y;}
function invoiceXml(customerId,rows){
 const k=cus(customerId);const date=ST.localIso(new Date()).slice(0,10);const number=nextInvoiceNumber(date);
 const co=data.company||{};
 const lines=rows.map(r=>{const a=LIS.placeOf(r.origin),b=LIS.placeOf(r.destination);
  return {description:'Trasporto '+(r.doc?r.doc+' ':'')+'del '+dmy(r.date)+': '+r.origin+' - '+r.destination+(r.goods?', '+r.goods:'')+(r.weight_kg?', '+num(r.weight_kg)+' kg':'')+(r.plate?', mezzo '+r.plate:''),
   amount_cents:r.amount_cents,load_country:a.country||'IT',delivery_country:b.country||'IT',ddt:r.doc_kind==='ddt'&&r.doc_number&&/^\d{4}-\d{2}-\d{2}$/.test(r.doc_date||'')?{numero:r.doc_number,data:r.doc_date}:null};});
 const res=FPA.build({company:{name:co.name,vat:co.vat,cf:co.cf,street:co.street,cap:co.cap,comune:co.comune,provincia:co.provincia,regime:co.regime,iban:co.iban},
  customer:{name:k.name,vat:k.vat,cf:k.cf,street:k.street,cap:k.cap,comune:k.comune,provincia:k.provincia,nazione:k.nazione||'IT',sdi:k.sdi,pec:k.pec},number,date,rows:lines,progressive:String((data.invoices||[]).length+1)});
 return {...res,number,date};
}

// ---------- costs ----------
// ---------- costs: supplier invoices and payslips loaded automatically, checked, confirmed ----------
let costPending=null,costBusy=null,costFilter={group:'',vehicle:'',source:''};
const COST_SOURCE={fattura:'Fattura',busta_paga:'Busta paga',spesa:'Spesa autista',manuale:'A mano'};
const kindSelect=(name,val,attrs)=>'<select name="'+name+'" '+(attrs||'')+'>'+['Viaggio','Autista','Mezzo','Azienda'].map(g=>'<optgroup label="'+g+'">'+Object.entries(MRG.KIND_LABEL).filter(([k])=>MRG.KIND_GROUP[k]===g).map(([k,l])=>'<option value="'+k+'"'+(k===val?' selected':'')+'>'+esc(l)+'</option>').join('')+'</optgroup>').join('')+'</select>';
const optList=(arr,lab,val,empty)=>'<option value="">'+esc(empty||'—')+'</option>'+arr.map(x=>'<option value="'+esc(x.id)+'"'+(x.id===val?' selected':'')+'>'+esc(lab(x))+'</option>').join('');
const knownDocKeys=()=>new Set((data.cost_documents||[]).filter(d=>d.status!=='scartato').map(d=>d.doc_key).filter(Boolean));

// one supplier invoice (parsed XML or AI reading) → document to check
function invoiceEntry(inv,file,via){
 const rows=CO.invoiceCosts(inv,{vehicles:data.vehicles,rules:data.supplier_rules}).map(r=>({...r,include:true}));
 // fuel already photographed by the drivers for the same vehicle and days: not selected, to avoid counting it twice
 for(const r of rows)if(r.kind==='carburante'&&r.vehicle_id){const a=r.period_from||String(r.date).slice(0,8)+'01',b=r.period_to||r.date;
  const seen=data.costs.filter(c=>c.kind==='carburante'&&c.vehicle_id===r.vehicle_id&&c.trip_id&&c.date>=a&&c.date<=b).reduce((x,c)=>x+c.amount_cents,0);
  if(seen){r.include=false;r.warn='Gli autisti hanno già registrato '+eur(seen)+' di rifornimenti di questo mezzo negli stessi giorni: riga non selezionata per non contarli due volte.';}}
 const key=rows.length?CO.docKey(rows[0]):null;const dup=key&&knownDocKeys().has(key);
 if(dup)rows.forEach(r=>r.include=false);
 return {id:ST.uid(),type:'fattura',via,file,key,dup,title:(inv.supplier&&inv.supplier.name||'Fornitore')+' · fattura '+(inv.number||'?')+' del '+dmy(inv.date),
  sub:'Imponibile '+eur(inv.taxable_cents)+(inv.total_cents!=null?' · totale '+eur(inv.total_cents):'')+(inv.credit_note?' · nota di credito':'')+(inv.supplier&&inv.supplier.vat?' · P.IVA '+inv.supplier.vat:''),
  meta:{supplier:inv.supplier&&inv.supplier.name,supplier_vat:inv.supplier&&inv.supplier.vat,number:inv.number,date:inv.date,taxable_cents:inv.taxable_cents,total_cents:inv.total_cents},check:inv.check||[],rows};
}
function payslipEntry(doc,file){
 const r=CO.payslipCosts(doc,data.drivers);const f=doc.campi||{};
 if(r.error)return {id:ST.uid(),type:'busta_paga',file,title:'Busta paga '+(f.dipendente||'?'),sub:r.error,error:r.error,rows:[],check:doc.da_controllare||[]};
 const key=CO.docKey(r.rows[0]);const dup=knownDocKeys().has(key);
 return {id:ST.uid(),type:'busta_paga',file,key,dup,driver_id:r.driver_id,matched_by:r.matched_by,title:'Busta paga '+(f.dipendente||'?')+' · '+monthLabel(r.month),
  sub:'Costo azienda '+eur(r.total_cents)+' · lordo '+eur(Math.round((f.lordo||0)*100))+' · netto '+eur(r.net_cents),
  meta:{employee:f.dipendente,tax_code:f.codice_fiscale,month:r.month,gross_cents:Math.round((f.lordo||0)*100),net_cents:r.net_cents,employer_contrib_cents:Math.round((f.contributi_azienda||0)*100),tfr_cents:Math.round((f.tfr||0)*100),overtime_cents:Math.round((f.straordinari||0)*100),allowances_cents:Math.round((f.trasferte||0)*100),company_cost_cents:r.total_cents,hours:f.ore_ordinarie,overtime_hours:f.ore_straordinario},
  check:doc.da_controllare||[],rows:r.rows.map(x=>({...x,include:!dup,warn:x.kind==='stipendio'&&estimatedWages(r.driver_id,r.month).length?'Sostituisce lo stipendio stimato inserito a mano per questo mese.':null}))};
}
// wages entered by hand for a driver in a month (an estimate until the payslip arrives)
const estimatedWages=(driverId,ym)=>driverId&&ym?data.costs.filter(c=>c.kind==='stipendio'&&c.driver_id===driverId&&(c.source||'manuale')==='manuale'&&String(c.period_from||c.date).slice(0,7)<=ym&&String(c.period_to||c.date).slice(0,7)>=ym):[];
const monthLabel=ym=>{if(!ym)return '';const n=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];return n[+ym.slice(5,7)-1]+' '+ym.slice(0,4);};

async function imageJpeg(file){
 const bmp=await createImageBitmap(file);const k=Math.min(1,1600/Math.max(bmp.width,bmp.height));
 const c=document.createElement('canvas');c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
 return {image:c.toDataURL('image/jpeg',0.78).split(',')[1],media_type:'image/jpeg'};
}
async function readCostPages(kind,pages,progress){
 const out=[];
 let i=0;
 while(i<pages.length){
  let part=pages.slice(i,i+CO.MAX_PAGES);while(part.length>1&&part.reduce((s,p)=>s+p.image.length,0)>3800000)part=part.slice(0,-1);
  progress('Leggo le pagine da '+(i+1)+' a '+(i+part.length)+' di '+pages.length+'…');
  let r;try{r=await fetch('/api/trasporti',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Radix-Trasporti':'1'},body:JSON.stringify({action:'costi.leggi',data:{kind,first:i+1,pages:part.map(p=>({image:p.image,media_type:p.media_type}))}})});}
  catch{throw new Error('Senza rete: riprova quando la connessione torna.');}
  let j={};try{j=await r.json();}catch{}
  if(!r.ok)throw new Error(r.status===401||r.status===403?'Per leggere PDF e foto serve l\'accesso all\'area riservata. Le fatture XML invece si leggono subito.':r.status===503?'Lettura automatica non attiva su questo ambiente: le fatture XML si leggono lo stesso; per PDF e foto prova «Prova con esempi».':(j.error||'Lettura non riuscita ('+r.status+').'));
  out.push(...(j.documents||[]));i+=part.length;
 }
 return out;
}
async function loadCostFiles(type,files){
 const entries=[],errors=[];
 const progress=t=>{costBusy=t;renderCosts();};
 for(const file of files){
  const name=file.name||'file';
  try{
   if(type==='fattura'&&/\.(xml|p7m)$/i.test(name)){
    progress('Leggo '+name+'…');
    const inv=CO.parseFatturaXml(new Uint8Array(await file.arrayBuffer()));
    if(inv.error){errors.push(name+': '+inv.error);continue;}
    for(const d of inv.documents)entries.push(invoiceEntry({supplier:inv.supplier,...d},name,'xml'));
    continue;
   }
   progress('Preparo '+name+'…');
   const pages=/\.pdf$/i.test(name)||file.type==='application/pdf'?await window.TrPratica.renderPages(file,progress):[await imageJpeg(file)];
   const docs=await readCostPages(type==='fattura'?'fattura_acquisto':'busta_paga',pages,progress);
   if(!docs.length){errors.push(name+': nessun documento riconosciuto.');continue;}
   for(const d of docs){
    if(type==='busta_paga'){entries.push(payslipEntry(d,name));continue;}
    const f=d.campi;
    entries.push(invoiceEntry({supplier:{name:f.fornitore,vat:String(f.partita_iva||'').replace(/^IT/i,'').replace(/\W/g,'')||null},number:f.numero,date:f.data,lines:d.righe||[],taxable_cents:f.imponibile!=null?Math.round(f.imponibile*100):null,total_cents:f.totale!=null?Math.round(f.totale*100):null,period:CO.periodIn(f.periodo),check:d.da_controllare},name,'ai'));
   }
  }catch(e){errors.push(name+': '+(e.message||'non letto.'));}
 }
 costBusy=null;
 if(entries.length)costPending={entries:(costPending?costPending.entries:[]).concat(entries)};
 if(errors.length)say(errors.join(' '),'error');else if(entries.length)say(entries.length+(entries.length===1?' documento letto':' documenti letti')+': controlla e conferma.','ok');
 renderCosts();
}
// examples (names invented) to try the flow without real files
function exampleCostEntries(){
 const p=period(),mo=p.to.slice(0,7),d=p.to;
 const line=(n,desc,eu)=>'<DettaglioLinee><NumeroLinea>'+n+'</NumeroLinea><Descrizione>'+desc+'</Descrizione><UnitaMisura>LT</UnitaMisura><PrezzoTotale>'+eu+'</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee>';
 const xml=(sup,vat,num,date,lines,tax,causale)=>'<?xml version="1.0" encoding="UTF-8"?><p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2"><FatturaElettronicaHeader><CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>'+vat+'</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>'+sup+'</Denominazione></Anagrafica></DatiAnagrafici></CedentePrestatore></FatturaElettronicaHeader><FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Data>'+date+'</Data><Numero>'+num+'</Numero><ImportoTotaleDocumento>'+(tax*1.22).toFixed(2)+'</ImportoTotaleDocumento>'+(causale?'<Causale>'+causale+'</Causale>':'')+'</DatiGeneraliDocumento></DatiGenerali><DatiBeniServizi>'+lines+'<DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>'+tax.toFixed(2)+'</ImponibileImporto><Imposta>'+(tax*0.22).toFixed(2)+'</Imposta></DatiRiepilogo></DatiBeniServizi></FatturaElettronicaBody></p:FatturaElettronica>';
 const plates=data.vehicles.map(v=>v.plate);
 const fuel=xml('Carte Carburante Esempio Spa','09999999991','FC-'+mo.replace('-',''),d,line(1,'Gasolio autotrazione targa '+plates[0]+' lt 1.850',(1850*1.38).toFixed(2))+line(2,'Gasolio autotrazione targa '+(plates[1]||plates[0])+' lt 1.420',(1420*1.38).toFixed(2))+line(3,'AdBlue targa '+plates[0]+' lt 60',(60*0.62).toFixed(2)),1850*1.38+1420*1.38+60*0.62,'Rifornimenti dal 01/'+mo.slice(5,7)+'/'+mo.slice(0,4)+' al '+dmy(d));
 const ins=xml('Assicurazioni Esempio Spa','09999999992','POL-77','2026-03-01','<DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione>Premio polizza RCA e furto incendio autocarro targa '+(plates[2]||plates[0])+' dal 01/03/2026 al 28/02/2027</Descrizione><PrezzoTotale>4380.00</PrezzoTotale><AliquotaIVA>0.00</AliquotaIVA><Natura>N1</Natura></DettaglioLinee>',4380,null);
 const shop=xml('Officina Esempio Snc','09999999993','212',mo+'-12','<DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione>Tagliando 120.000 km e filtri '+(plates[1]||plates[0])+'</Descrizione><PrezzoTotale>780.00</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee><DettaglioLinee><NumeroLinea>2</NumeroLinea><Descrizione>Sostituzione 2 pneumatici 315/80 R22.5</Descrizione><PrezzoTotale>920.00</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee>',1700,null);
 const out=[];
 for(const [x,n] of [[fuel,'carburante-esempio.xml'],[ins,'assicurazione-esempio.xml.p7m'],[shop,'officina-esempio.xml']]){const inv=CO.parseFatturaXml(x);for(const doc of inv.documents)out.push(invoiceEntry({supplier:inv.supplier,...doc},n,'xml'));}
 const c=v=>({valore:v,sicurezza:'alta'});
 const lul=CO.parseBatch(DOC,'busta_paga',{documenti:data.drivers.slice(0,3).map((dr,i)=>({pagine:[i+1],campi:{dipendente:c(dr.name.split(' ').reverse().join(' ').toUpperCase()),mese:c(mo),qualifica:c('Autista CE livello 3S'),ore_ordinarie:c(168),ore_straordinario:c(12+i*4),lordo:c(2650+i*120),straordinari:c(190+i*60),trasferte:c(820-i*90),netto:c(2050+i*80),contributi_azienda:c(810+i*35),tfr:c(196+i*9)}}))},1,3);
 for(const doc of lul)out.push(payslipEntry(doc,'LUL-'+mo+'-esempio.pdf'));
 return out;
}
function confirmCosts(){
 const known=knownDocKeys();let n=0,docs=0,learned=0;
 for(const e of costPending.entries){
  const rows=e.rows.filter(r=>r.include&&r.amount_cents);if(!rows.length)continue;
  if(e.key&&known.has(e.key)&&!e.force)continue;
  const docId=ST.uid();docs++;
  for(const r of rows){data.costs.push({id:ST.uid(),kind:r.kind,date:r.date||e.meta&&e.meta.date||nowIso().slice(0,10),amount_cents:r.amount_cents,vehicle_id:r.vehicle_id||null,driver_id:e.type==='busta_paga'?(e.driver_id||null):(r.driver_id||null),
   description:r.description||null,period_from:r.period_from||null,period_to:r.period_to||null,liters:r.liters||null,source:e.type,doc_key:e.key||null,document_id:docId,supplier:r.supplier||null});n++;}
  data.cost_documents.push({id:docId,kind:e.type==='busta_paga'?'busta_paga':e.via==='xml'?'fattura_xml':'fattura_pdf',file_name:e.file,doc_key:e.key||null,status:'confermato',created_at:nowIso(),...(e.meta||{})});
  if(e.type==='busta_paga'){const est=new Set(estimatedWages(e.driver_id,e.meta.month).map(c=>c.id));if(est.size)data.costs=data.costs.filter(c=>!est.has(c.id));
   data.payslips.push({id:ST.uid(),document_id:docId,driver_id:e.driver_id||null,...e.meta});
   const d=data.drivers.find(x=>x.id===e.driver_id);if(d&&!d.cf&&e.meta.tax_code)d.cf=String(e.meta.tax_code).toUpperCase();}
  // what the office chose for this supplier is proposed next time
  const vat=e.meta&&e.meta.supplier_vat;const kinds=[...new Set(rows.map(r=>r.kind))];
  if(e.type==='fattura'&&vat&&kinds.length===1&&kinds[0]!=='altro'){const vs=[...new Set(rows.map(r=>r.vehicle_id||''))];data.supplier_rules[vat]={kind:kinds[0],vehicle_id:vs.length===1&&vs[0]&&rows.length===1&&!CO.platesIn(rows[0].description).length?vs[0]:null,supplier:e.meta.supplier};learned++;}
 }
 costPending=null;save();say(n?'Registrati '+n+(n===1?' costo':' costi')+' da '+docs+(docs===1?' documento.':' documenti.'):'Nessun costo registrato.',n?'ok':'error');renderCosts();
}
function pendingHtml(){
 const E=costPending.entries;
 return '<section class="tr-panel"><div class="tr-toolbar"><h2 style="margin:0">Da controllare ('+E.length+')</h2><button class="tr-btn" id="costOk" style="margin-left:auto">Conferma e registra</button><button class="tr-btn ghost" id="costDrop">Annulla</button></div>'
  +'<p class="tr-muted">Voce di costo, mezzo e periodo sono proposti dalla fattura e da come hai registrato le fatture precedenti dello stesso fornitore. Cambia quello che serve: la prossima volta il sistema lo propone già così.</p>'
  +E.map((e,i)=>'<div class="tr-doc'+(e.dup?' dup':'')+'"><div class="tr-doc-head"><div><strong>'+esc(e.title)+'</strong><br><span class="tr-subtle">'+esc(e.sub||'')+' · '+esc(e.file||'')+(e.via==='ai'?' · letto dall\'AI':e.via==='xml'?' · XML letto esattamente':'')+'</span></div>'
   +(e.dup?'<span class="tr-pill bad">Già caricato</span>':e.check&&e.check.length?'<span class="tr-pill flag">Da controllare: '+esc(e.check.join(', '))+'</span>':'')+'</div>'
   +(e.type==='busta_paga'&&!e.error?'<label class="tr-inline">Autista<select data-e="'+i+'" data-f="driver_id">'+optList(data.drivers,x=>x.name,e.driver_id,'Non abbinato: scegli')+'</select>'+(e.matched_by?'<span class="tr-subtle">abbinato per '+esc(e.matched_by)+'</span>':'')+'</label>':'')
   +(e.rows.length?'<table class="tr-table"><thead><tr><th></th><th>Voce</th><th>Mezzo</th><th>Competenza</th><th>Descrizione</th><th class="num">Importo</th></tr></thead><tbody>'
    +e.rows.map((r,j)=>'<tr><td><input type="checkbox" data-e="'+i+'" data-r="'+j+'" data-f="include"'+(r.include?' checked':'')+' aria-label="Registra questa riga"></td>'
     +'<td>'+kindSelect('k',r.kind,'data-e="'+i+'" data-r="'+j+'" data-f="kind"')+(r.why?'<br><span class="tr-subtle">'+esc(r.why)+'</span>':'')+'</td>'
     +'<td><select data-e="'+i+'" data-r="'+j+'" data-f="vehicle_id">'+optList(data.vehicles,v=>v.plate,r.vehicle_id,'Nessuno')+'</select></td>'
     +'<td><input type="date" data-e="'+i+'" data-r="'+j+'" data-f="period_from" value="'+esc(r.period_from||'')+'" aria-label="Dal"><input type="date" data-e="'+i+'" data-r="'+j+'" data-f="period_to" value="'+esc(r.period_to||'')+'" aria-label="Al"></td>'
     +'<td class="wrap">'+esc(r.description||'')+(r.liters?'<br><span class="tr-subtle">'+num(r.liters)+' litri</span>':'')+(r.warn?'<br><span class="tr-flag">'+esc(r.warn)+'</span>':'')+'</td><td class="num">'+eur(r.amount_cents)+'</td></tr>').join('')+'</tbody></table>':'')+'</div>').join('')
  +'</section>';
}
function bindPending(){
 $('costOk').onclick=confirmCosts;$('costDrop').onclick=()=>{costPending=null;renderCosts();};
 view.querySelectorAll('[data-e]').forEach(el=>el.onchange=()=>{const e=costPending.entries[+el.dataset.e];const f=el.dataset.f;
  if(el.dataset.r==null){e[f]=el.value||null;return;}
  const r=e.rows[+el.dataset.r];r[f]=f==='include'?el.checked:(el.value||null);
  if(f==='kind'&&!r.period_from){const sp=CO.suggestPeriod(r.kind,r.date);if(sp){r.period_from=sp.from;r.period_to=sp.to;renderCosts();}}});
}
function renderCosts(){
 const p=period();
 const inP=data.costs.map(c=>{const s=MRG.share(c,p.from,p.to);return s?{...s,orig:c}:null;}).filter(Boolean);
 const groups={Viaggio:0,Autista:0,Mezzo:0,Azienda:0};for(const c of inP)groups[MRG.KIND_GROUP[c.kind]||'Azienda']+=c.amount_cents;
 const tot=Object.values(groups).reduce((a,b)=>a+b,0);
 const km=data.trips.filter(t=>t.status!=='aperto'&&t.started_at.slice(0,10)>=p.from&&t.started_at.slice(0,10)<=p.to).reduce((s,t)=>s+(t.km||0),0);
 const list=inP.filter(c=>(!costFilter.group||MRG.KIND_GROUP[c.kind]===costFilter.group)&&(!costFilter.vehicle||c.vehicle_id===costFilter.vehicle)&&(!costFilter.source||(c.source||'manuale')===costFilter.source)).sort((a,b)=>a.date<b.date?1:-1);
 const slips=(data.payslips||[]).slice().sort((a,b)=>a.month<b.month?1:a.month>b.month?-1:String(a.employee).localeCompare(String(b.employee)));
 view.innerHTML=kpis([[eur0(tot),'Costi del periodo'+(km?' · '+eur(Math.round(tot/km))+'/km':'')],...Object.entries(groups).map(([g,c])=>[eur0(c),g+(tot?' · '+Math.round(c*100/tot)+'%':'')])])
  +(costBusy?'<p class="tr-banner" role="status">'+esc(costBusy)+'</p>':'')
  +(costPending?pendingHtml():'')
  +'<section class="tr-panel"><h2>Carica i documenti</h2><div class="tr-drop" id="costDropZone"><div class="tr-drop-col"><h3>Fatture dei fornitori</h3><p class="tr-muted">Gli XML della fattura elettronica (anche firmati .p7m), scaricati dal cassetto fiscale o dal programma di fatturazione, si leggono subito e senza errori. PDF e foto li legge l\'AI. Carburante, pedaggi, officina, gomme, leasing, assicurazioni, subvettori, consulenti: ogni riga va alla sua voce e al mezzo se c\'è la targa.</p><button class="tr-btn" id="upInv">Carica fatture</button></div>'
  +'<div class="tr-drop-col"><h3>Buste paga</h3><p class="tr-muted">Il PDF del consulente del lavoro (anche il Libro Unico con tutti i dipendenti). Ogni busta va all\'autista giusto, per codice fiscale o nome, divisa in stipendio e contributi, straordinari e trasferte, sul mese di competenza.</p><button class="tr-btn" id="upPay">Carica buste paga</button></div></div>'
  +'<div class="tr-toolbar" style="margin-top:10px"><button class="tr-btn small ghost" id="costDemo">Prova con esempi</button><span class="tr-subtle">Puoi anche trascinare i file qui sopra.</span></div></section>'
  +'<section class="tr-panel"><div class="tr-toolbar"><h2 style="margin:0">Costi del periodo</h2>'
   +'<label>Gruppo<select id="cfG"><option value="">Tutti</option>'+['Viaggio','Autista','Mezzo','Azienda'].map(g=>'<option'+(g===costFilter.group?' selected':'')+'>'+g+'</option>').join('')+'</select></label>'
   +'<label>Mezzo<select id="cfV">'+optList(data.vehicles,v=>v.plate,costFilter.vehicle,'Tutti')+'</select></label>'
   +'<label>Origine<select id="cfS"><option value="">Tutte</option>'+Object.entries(COST_SOURCE).map(([k,l])=>'<option value="'+k+'"'+(k===costFilter.source?' selected':'')+'>'+l+'</option>').join('')+'</select></label>'
   +'<button class="tr-btn small ghost" id="xlsCosts" style="margin-left:auto">Scarica in Excel</button></div>'
  +'<table class="tr-table"><thead><tr><th>Data</th><th>Voce</th><th>Mezzo</th><th>Autista</th><th>Descrizione</th><th>Competenza</th><th>Origine</th><th class="num">Nel periodo</th><th></th></tr></thead><tbody>'
  +(list.length?list.map(c=>'<tr><td>'+dmy(c.date)+'</td><td>'+esc(MRG.KIND_LABEL[c.kind]||c.kind)+(c.kind==='altro'?' <span class="tr-flag">da classificare</span>':'')+'</td><td>'+esc(veh(c.vehicle_id).plate||'')+'</td><td>'+esc(drv(c.driver_id).name||'')+'</td><td class="wrap">'+esc(c.description||'')+(c.refund?' <span class="tr-flag">da rimborsare</span>':'')+'</td><td>'+(c.period_from?dmy(c.period_from)+' – '+dmy(c.period_to):'')+'</td><td>'+esc(COST_SOURCE[c.source]||(c.trip_id?'Autista':'A mano'))+'</td><td class="num">'+eur(c.amount_cents)+(c.full_cents?'<br><span class="tr-subtle">su '+eur(c.full_cents)+'</span>':'')+'</td><td>'+(c.trip_id?'':'<button class="tr-link" data-del="'+esc(c.id)+'" aria-label="Elimina costo">Elimina</button>')+'</td></tr>').join(''):'<tr><td colspan="9" class="tr-muted">Nessun costo con questi filtri.</td></tr>')
  +'</tbody></table></section>'
  +'<div class="tr-grid2"><section class="tr-panel"><h2>Buste paga caricate</h2>'+(slips.length?'<table class="tr-table"><thead><tr><th>Mese</th><th>Dipendente</th><th>Autista</th><th class="num">Lordo</th><th class="num">Netto</th><th class="num">Costo azienda</th></tr></thead><tbody>'+slips.slice(0,36).map(s=>'<tr><td>'+esc(monthLabel(s.month))+'</td><td>'+esc(s.employee||'')+'</td><td>'+(s.driver_id?esc(drv(s.driver_id).name||''):'<span class="tr-flag">non abbinato</span>')+'</td><td class="num">'+eur(s.gross_cents)+'</td><td class="num">'+eur(s.net_cents)+'</td><td class="num">'+eur(s.company_cost_cents)+'</td></tr>').join('')+'</tbody></table>':'<p class="tr-muted">Nessuna busta paga caricata.</p>')+'</section>'
  +'<section class="tr-panel"><details'+(data.costs.length?'':' open')+'><summary><strong>Aggiungi un costo a mano</strong></summary><form id="costForm" class="tr-form-grid" style="margin-top:10px"><label>Voce'+kindSelect('kind','generali')+'</label><label>Data<input type="date" name="date" required value="'+esc(p.to)+'"></label><label>Importo €<input name="amount" inputmode="decimal" required></label><label>Mezzo<select name="vehicle">'+optList(data.vehicles,v=>v.plate,null)+'</select></label><label>Autista<select name="driver">'+optList(data.drivers,d=>d.name,null)+'</select></label><label>Competenza dal<input type="date" name="pf"></label><label>al<input type="date" name="pt"></label><label style="grid-column:1/-1">Descrizione<input name="description"></label><p class="tr-error" id="costErr" hidden></p><button class="tr-btn">Aggiungi</button></form>'
  +'<p class="tr-subtle">Collega il costo al mezzo o all\'autista: il controllo di gestione lo ripartisce sui suoi viaggi per km. Con la competenza (es. un premio annuale) conta per i giorni che copre.</p></details></section></div>';
 const pick=(type,accept)=>{const inp=$('anyFile');inp.value='';inp.accept=accept;inp.multiple=true;inp.onchange=()=>{const fs=[...inp.files];inp.multiple=false;if(fs.length)loadCostFiles(type,fs);};inp.click();};
 $('upInv').onclick=()=>pick('fattura','.xml,.p7m,application/pdf,image/*');
 $('upPay').onclick=()=>pick('busta_paga','application/pdf,image/*');
 $('costDemo').onclick=()=>{costPending={entries:(costPending?costPending.entries:[]).concat(exampleCostEntries())};say('Esempi pronti: 3 fatture e il Libro Unico del mese. Controlla e conferma.','ok');renderCosts();};
 const dz=$('costDropZone');dz.ondragover=e=>{e.preventDefault();dz.classList.add('over');};dz.ondragleave=()=>dz.classList.remove('over');
 dz.ondrop=e=>{e.preventDefault();dz.classList.remove('over');const fs=[...e.dataTransfer.files];if(!fs.length)return;const xml=fs.filter(f=>/\.(xml|p7m)$/i.test(f.name));const other=fs.filter(f=>!xml.includes(f));
  if(xml.length)loadCostFiles('fattura',xml);if(other.length)say('Per PDF e foto usa «Carica fatture» o «Carica buste paga», così so cosa leggere.','error');};
 if(costPending)bindPending();
 $('cfG').onchange=e=>{costFilter.group=e.target.value;renderCosts();};$('cfV').onchange=e=>{costFilter.vehicle=e.target.value;renderCosts();};$('cfS').onchange=e=>{costFilter.source=e.target.value;renderCosts();};
 $('costForm').onsubmit=e=>{e.preventDefault();const f=e.target.elements;const n=DOC.normNumber(f.amount.value);
  if(n==null||n<=0){$('costErr').textContent='Importo non valido.';$('costErr').hidden=false;return;}
  if(f.pf.value&&f.pt.value&&f.pt.value<f.pf.value){$('costErr').textContent='La competenza finisce prima di iniziare.';$('costErr').hidden=false;return;}
  data.costs.push({id:ST.uid(),kind:f.kind.value,date:f.date.value,amount_cents:Math.round(n*100),vehicle_id:f.vehicle.value||null,driver_id:f.driver.value||null,description:f.description.value.trim()||null,period_from:f.pf.value||null,period_to:f.pt.value||null,source:'manuale'});save();say('Costo aggiunto.','ok');renderCosts();};
 view.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{data.costs=data.costs.filter(c=>c.id!==b.dataset.del);save();renderCosts();});
 $('xlsCosts').onclick=()=>xlsx('costi-'+p.from+'-'+p.to+'.xlsx',[{name:'Costi',columns:[{title:'Data',type:'date'},{title:'Gruppo'},{title:'Voce'},{title:'Mezzo'},{title:'Autista'},{title:'Descrizione'},{title:'Competenza dal',type:'date'},{title:'Competenza al',type:'date'},{title:'Origine'},{title:'Litri',type:'number'},{title:'Importo nel periodo',type:'euro'},{title:'Importo totale',type:'euro'}],
  rows:list.map(c=>[c.date,MRG.KIND_GROUP[c.kind]||'',MRG.KIND_LABEL[c.kind]||c.kind,veh(c.vehicle_id).plate,drv(c.driver_id).name,c.description,c.period_from||null,c.period_to||null,COST_SOURCE[c.source]||'A mano',c.liters??null,c.amount_cents/100,(c.full_cents||c.amount_cents)/100])},
  {name:'Buste paga',columns:[{title:'Mese'},{title:'Dipendente'},{title:'Autista'},{title:'Lordo',type:'euro'},{title:'Netto',type:'euro'},{title:'Contributi ditta',type:'euro'},{title:'TFR',type:'euro'},{title:'Straordinari',type:'euro'},{title:'Trasferte',type:'euro'},{title:'Costo azienda',type:'euro'}],
  rows:slips.map(s=>[s.month,s.employee,drv(s.driver_id).name,(s.gross_cents||0)/100,(s.net_cents||0)/100,(s.employer_contrib_cents||0)/100,(s.tfr_cents||0)/100,(s.overtime_cents||0)/100,(s.allowances_cents||0)/100,(s.company_cost_cents||0)/100])}]);
}

// ---------- master data ----------
const RATE={viaggio:'a viaggio',km:'al km',ton:'a tonnellata',ora:'all\'ora'};
const VKIND=['trattore','motrice','rimorchio','semirimorchio','furgone','bestiame','altro'];
const ENT={
 vehicles:{title:'Mezzi',one:'mezzo',fields:[['plate','Targa','plate',true],['label','Modello o nome','text'],['kind','Tipo',VKIND],['devices','Dispositivi pedaggio (Telepass, UnipolMove), separati da virgola','list'],['tracker','Localizzatore',Object.keys(LOC.PROVIDERS).filter(k=>k!=='file')],['tracker_ref','Codice nel localizzatore','text'],['vin','Telaio (VIN, per rFMS)','text'],['due_revisione','Scadenza revisione','date'],['due_assicurazione','Scadenza assicurazione','date'],['due_tachigrafo','Scadenza tachigrafo','date'],['due_bollo','Scadenza bollo','date'],['due_atp','Scadenza ATP (frigo)','date']],
  cols:v=>{const d=CT.deadlines([v],nowIso().slice(0,10))[0];return [v.plate,v.label,v.kind,(v.devices||[]).join(', '),LOC.PROVIDERS[v.tracker]?.label||'—',d?d.label+' '+dmy(d.date)+(d.days<0?' (scaduta)':''):'—'];},head:['Targa','Modello','Tipo','Pedaggi','Localizzatore','Prossima scadenza'],used:id=>data.trips.some(t=>t.vehicle_id===id)},
 drivers:{title:'Autisti',one:'autista',fields:[['name','Nome e cognome','text',true],['cf','Codice fiscale (per abbinare le buste paga)','cf'],['phone','Telefono','text'],['vehicle','Mezzo abituale','vehicle']],
  cols:d=>[d.name,d.phone,veh(d.vehicle).plate||'—'],head:['Autista','Telefono','Mezzo abituale'],used:id=>data.trips.some(t=>t.driver_id===id)},
 customers:{title:'Clienti',one:'cliente',fields:[['name','Ragione sociale','text',true],['vat','Partita IVA (con sigla del paese se estera, es. FR…)','vat'],['cf','Codice fiscale (se diverso)','text'],['street','Indirizzo','text'],['cap','CAP','text'],['comune','Comune','text'],['provincia','Provincia (sigla)','text'],['nazione','Paese (sigla, IT se vuoto)','text'],['sdi','Codice destinatario SdI (7 caratteri)','text'],['pec','PEC (se manca il codice SdI)','text'],['rate_kind','Tariffa semplice, se non ha un listino',Object.keys(RATE)],['rate','Importo tariffa semplice €','money']],
  cols:c=>[c.name,c.vat,[c.comune,c.provincia].filter(Boolean).join(' ')||'—',(data.rate_cards||[]).some(r=>r.customer_id===c.id&&r.active!==false)?'listino':c.rate_cents!=null?eur(c.rate_cents)+' '+(RATE[c.rate_kind]||''):'listino base'],head:['Cliente','Partita IVA','Sede','Prezzo'],used:id=>data.trips.some(t=>t.customer_id===id)},
 consignees:{title:'Destinatari e luoghi',one:'destinatario',fields:[['name','Nome','text',true],['kind','Tipo',['destinatario','carico','scarico']],['street','Indirizzo','text'],['cap','CAP','text'],['comune','Comune','text'],['provincia','Provincia','text'],['nazione','Paese (sigla)','text']],
  cols:c=>[c.name,c.kind,[c.comune,c.provincia||c.nazione].filter(Boolean).join(' ')||(c.address&&c.address.text)||'—'],head:['Nome','Tipo','Località'],used:()=>false}
};
let proposalsOpen=false;
function renderProposals(){
 const pr=ANA.proposals({documents:data.documents,shipments:data.shipments,customers:data.customers,consignees:data.consignees,own:data.company&&data.company.name});
 const list=ana==='customers'?pr.customers:pr.places;
 return '<section class="tr-panel"><h2>Proposte dai documenti</h2><p class="tr-muted">'+(ana==='customers'?'Committenti e mittenti letti da DDT e CMR che non sono ancora in anagrafica. La partita IVA, quando è scritta sul documento, è già controllata.':'Destinatari e luoghi di carico letti da DDT e CMR.')+'</p>'
  +(list.length?'<form id="propForm"><table class="tr-table"><thead><tr><th></th><th>Nome</th><th>Perché</th><th>Da</th></tr></thead><tbody>'+list.map((x,i)=>'<tr><td><input type="checkbox" name="p" value="'+i+'" checked aria-label="Crea '+esc(x.name)+'"></td><td class="wrap"><strong>'+esc(x.name)+'</strong>'+(x.vat?'<br><span class="tr-subtle">P.IVA '+esc(x.vat.country+' '+x.vat.code)+'</span>':'')+(x.address&&x.address.text?'<br><span class="tr-subtle">'+esc(x.address.text)+'</span>':'')+'</td><td>'+esc(x.why||x.kind)+'</td><td class="wrap">'+esc(x.sources.slice(0,3).join(', '))+(x.count>1?' <span class="tr-subtle">('+x.count+' documenti)</span>':'')+'</td></tr>').join('')+'</tbody></table><div class="tr-toolbar"><button class="tr-btn">Crea i selezionati</button><button type="button" class="tr-btn ghost" id="propClose">Chiudi</button></div></form>'
   :'<p>Nessuna proposta: tutto quello che c\'è nei documenti confermati è già in anagrafica.</p><button type="button" class="tr-btn ghost" id="propClose">Chiudi</button>')+'</section>';
}
function bindProposals(){
 const close=$('propClose');if(close)close.onclick=()=>{proposalsOpen=false;renderMaster();};
 const f=$('propForm');if(!f)return;
 f.onsubmit=e=>{e.preventDefault();
  const pr=ANA.proposals({documents:data.documents,shipments:data.shipments,customers:data.customers,consignees:data.consignees,own:data.company&&data.company.name});
  const list=ana==='customers'?pr.customers:pr.places;let n=0;
  for(const el of f.querySelectorAll('input[name=p]:checked')){const x=list[+el.value];if(!x)continue;const a=x.address||{};
   if(ana==='customers')data.customers.push({id:ST.uid(),name:x.name,vat:x.vat?(x.vat.country==='IT'?x.vat.code:x.vat.country+x.vat.code):null,street:a.street||null,cap:a.cap||null,comune:a.comune||null,provincia:a.provincia||null,nazione:a.nazione||'IT',source:'documento'});
   else data.consignees.push({id:ST.uid(),name:x.name,kind:x.kind,street:a.street||null,cap:a.cap||null,comune:a.comune||null,provincia:a.provincia||null,nazione:a.nazione||null,address:a,source:'documento'});
   n++;}
  proposalsOpen=false;save();say(n+(n===1?' voce creata':' voci create')+' dai documenti. Completa indirizzo e codice SdI dove mancano.','ok');renderMaster();};
}
function renderMaster(){
 const E=ENT[ana],list=data[ana].slice().sort((a,b)=>(a.active===false)-(b.active===false));
 const item=editing&&editing!=='new'?data[ana].find(x=>x.id===editing):null;
 const val=(k,type)=>{if(!item)return k==='tracker'?'telefono':'';if(type==='list')return (item[k]||[]).join(', ');if(type==='money')return item.rate_cents!=null?(item.rate_cents/100).toFixed(2).replace('.',','):'';return item[k]??'';};
 const field=([k,label,type,req])=>{
  if(Array.isArray(type))return '<label>'+esc(label)+'<select name="'+k+'"><option value="">—</option>'+type.map(o=>'<option value="'+esc(o)+'"'+(val(k)===o?' selected':'')+'>'+esc(k==='tracker'?LOC.PROVIDERS[o].label:k==='rate_kind'?RATE[o]:o)+'</option>').join('')+'</select></label>';
  if(type==='date')return '<label>'+esc(label)+'<input type="date" name="'+k+'" value="'+esc(val(k,type))+'"></label>';
  if(type==='vehicle')return '<label>'+esc(label)+'<select name="'+k+'"><option value="">—</option>'+data.vehicles.map(v=>'<option value="'+esc(v.id)+'"'+(val(k)===v.id?' selected':'')+'>'+esc(v.plate)+'</option>').join('')+'</select></label>';
  return '<label>'+esc(label)+'<input name="'+k+'" value="'+esc(val(k,type))+'"'+(req?' required':'')+(type==='money'?' inputmode="decimal"':'')+(type==='plate'?' autocapitalize="characters"':'')+'></label>';};
 view.innerHTML='<div class="tr-toolbar">'+Object.entries(ENT).map(([k,e])=>'<button class="tr-btn small'+(k===ana?' blue':' ghost')+'" data-ana="'+k+'">'+e.title+' ('+data[k].length+')</button>').join('')+'</div>'
  +(proposalsOpen?renderProposals():'')
  +'<div class="tr-grid2"><section class="tr-panel"><div class="tr-toolbar"><h2 style="margin:0">'+E.title+'</h2>'+(ana==='customers'||ana==='consignees'?'<button class="tr-btn small ghost" id="propOpen" style="margin-left:auto">Proposte dai documenti</button>':'')+'<button class="tr-btn small" id="addOne"'+(ana==='customers'||ana==='consignees'?'':' style="margin-left:auto"')+'>Aggiungi '+E.one+'</button></div><table class="tr-table"><thead><tr>'+E.head.map(h=>'<th>'+h+'</th>').join('')+'<th></th></tr></thead><tbody>'
  +list.map(x=>'<tr'+(x.active===false?' style="opacity:.55"':'')+(editing===x.id?' class="sel"':'')+'>'+E.cols(x).map((c,i)=>'<td'+(i===0?'':' class="wrap"')+'>'+(i===0?'<strong>'+esc(c)+'</strong>':esc(c??''))+(i===0&&x.active===false?' <span class="tr-chip">non attivo</span>':'')+'</td>').join('')+'<td><button class="tr-link" data-edit="'+esc(x.id)+'">Modifica</button></td></tr>').join('')+'</tbody></table></section>'
  +'<section class="tr-panel">'+(editing?'<h2>'+(item?'Modifica '+E.one:'Nuovo '+E.one)+'</h2><form id="anaForm">'+E.fields.map(field).join('')+'<p class="tr-error" id="anaErr" hidden></p><div class="tr-toolbar"><button class="tr-btn">Salva</button><button type="button" class="tr-btn ghost" id="anaCancel">Annulla</button>'+(item?(E.used(item.id)?'<button type="button" class="tr-btn warn" id="anaOff">'+(item.active===false?'Riattiva':'Disattiva')+'</button>':'<button type="button" class="tr-btn warn" id="anaDel">Elimina</button>'):'')+'</div>'+(item&&E.used(item.id)?'<p class="tr-subtle">Ha già dei viaggi: si può disattivare, non eliminare, così lo storico e il margine restano giusti.</p>':'')+'</form>'
   :'<h2>'+E.title+'</h2><p class="tr-muted">'+({vehicles:'Per ogni mezzo: i dispositivi di pedaggio (servono ad abbinare i transiti anche se la targa sulla fattura manca) e il localizzatore da cui leggere la posizione, con il codice del mezzo in quel sistema o il telaio per rFMS.',drivers:'Ogni autista usa l\'app sul proprio telefono; il mezzo abituale viene proposto all\'inizio della giornata.',customers:'Con la tariffa al km il ricavo del viaggio si calcola da solo quando l\'autista lo chiude con i km.'}[ana])+'</p>')+'</section></div>';
 view.querySelectorAll('[data-ana]').forEach(b=>b.onclick=()=>{ana=b.dataset.ana;editing=null;renderMaster();});
 view.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{editing=b.dataset.edit;renderMaster();});
 $('addOne').onclick=()=>{editing='new';renderMaster();};
 if($('propOpen'))$('propOpen').onclick=()=>{proposalsOpen=true;renderMaster();};
 bindProposals();
 const f=$('anaForm');if(!f)return;
 $('anaCancel').onclick=()=>{editing=null;renderMaster();};
 if($('anaDel'))$('anaDel').onclick=()=>{data[ana]=data[ana].filter(x=>x.id!==item.id);editing=null;save();renderMaster();};
 if($('anaOff'))$('anaOff').onclick=()=>{item.active=item.active===false;save();renderMaster();};
 f.onsubmit=e=>{e.preventDefault();const el=f.elements,err=$('anaErr');const o=item||{id:ST.uid()};const errs=[];
  for(const [k,label,type,req] of E.fields){const raw=(el[k].value||'').trim();
   if(type==='plate'){const v=raw.toUpperCase().replace(/[^A-Z0-9]/g,'');if(v.length<4||v.length>10)errs.push('Targa non valida.');else if(data.vehicles.some(x=>x.plate===v&&x.id!==o.id))errs.push('Targa già presente.');o[k]=v;}
   else if(type==='cf'){const v=raw.toUpperCase().replace(/\s/g,'');if(v&&!/^[A-Z0-9]{11,16}$/.test(v))errs.push('Codice fiscale non valido.');o[k]=v||null;}
   else if(type==='list')o[k]=raw.split(/[,;\s]+/).map(s=>s.trim()).filter(Boolean);
   else if(type==='vat'){const v=raw.toUpperCase().replace(/[\s.]/g,'').replace(/^IT(?=\d{11}$)/,'');if(v&&/^\d{11}$/.test(v)&&!ANA.pivaOk(v))errs.push('Partita IVA non valida: controlla le cifre.');o[k]=v||null;}
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
 view.innerHTML='<div class="tr-grid2"><section class="tr-panel"><h2>Localizzatori</h2><p class="tr-muted">Il localizzatore principale è il telefono dell\'autista con l\'app Plancia: registra la posizione solo da &laquo;Inizia viaggio&raquo; a &laquo;Chiudi viaggio&raquo;, senza costi né installazioni sul mezzo. Se il mezzo ha già un localizzatore (Webfleet, Verizon, rFMS…) si può collegare: Plancia usa quello e il telefono copre i momenti in cui tace.</p>'
  +'<table class="tr-table"><tbody>'+Object.entries(LOC.PROVIDERS).filter(([k])=>k!=='file').map(([k,p])=>'<tr><td><strong>'+esc(p.label)+'</strong><br><span class="tr-subtle wrap" style="white-space:normal">'+esc(p.note)+'</span></td><td class="num">'+(counts[k]||0)+' mezzi</td><td>'+(p.api?'<span class="tr-pill ok">API</span>':k==='telefono'?'<span class="tr-pill ok">principale</span>':'<span class="tr-pill flag">file</span>')+'</td></tr>').join('')+'</tbody></table>'
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
window.addEventListener('hashchange',()=>{editing=null;say('');render();});
window.addEventListener('storage',e=>{if(e.key===ST.KEY&&tab!=='anagrafiche')render();});
render();
})();
