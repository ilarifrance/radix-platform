/* RADIX Trasporti — command center. Reads the same demonstration data as the driver app (trasporti/store.js) and
   computes everything with lib/trasporti: toll reconciliation by plate/device and time, margin per trip, vehicle,
   driver and customer, invoicing export (CSV for Excel). */
(function(){
'use strict';
const DOC=window.RadixTrDocumenti,TOLL=window.RadixTrPedaggi,MRG=window.RadixTrMargini,ST=window.RadixTrStore;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const EUR=new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}),EUR0=new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0});
const eur=c=>EUR.format((c||0)/100),eur0=c=>EUR0.format((c||0)/100);
const num=n=>new Intl.NumberFormat('it-IT').format(n||0);
const dmy=s=>s?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'';
const hm=s=>s?s.slice(11,16):'';
const pctTxt=p=>p==null?'—':String(p).replace('.',',')+'%';
const TABS=['oggi','viaggi','pedaggi','margine','fatturazione','costi'];
const view=$('view');
let data=ST.load(),tab='oggi',sel=null,mDim='vehicles';

function period(){
 const days=data.trips.map(t=>t.started_at.slice(0,10)).sort();
 if(!$('from').value)$('from').value=days[0]||ST.localIso(new Date()).slice(0,10);
 if(!$('to').value)$('to').value=ST.localIso(new Date()).slice(0,10);
 return {from:$('from').value,to:$('to').value};
}
const veh=id=>data.vehicles.find(v=>v.id===id)||{},drv=id=>data.drivers.find(d=>d.id===id)||{},cus=id=>data.customers.find(c=>c.id===id)||{};
function tollResult(){
 if(!data.tolls||!data.tolls.transits)return null;
 return TOLL.reconcile({transits:data.tolls.transits,vehicles:data.vehicles,trips:data.trips,positions:data.positions,nowAt:ST.localIso(new Date())});
}
function margin(){
 const p=period(),tr=tollResult();
 // transits of a known vehicle outside every trip are a cost of that vehicle, shared among its trips
 const extra=tr?tr.rows.filter(r=>r.status==='fuori_viaggio').map(r=>({id:r.id,kind:'pedaggio',date:r.date,amount_cents:r.amount_cents,vehicle_id:r.vehicle_id})):[];
 return MRG.compute({trips:data.trips.filter(t=>t.status!=='aperto'),costs:data.costs.concat(extra),tolls:tr,from:p.from,to:p.to,vehicles:data.vehicles,drivers:data.drivers,customers:data.customers});
}

function render(){
 data=ST.load();
 $('company').textContent=data.company.name;
 tab=TABS.includes(location.hash.slice(1))?location.hash.slice(1):'oggi';
 document.querySelectorAll('#tabs a').forEach(a=>{if(a.dataset.tab===tab)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 ({oggi:renderToday,viaggi:renderTrips,pedaggi:renderTolls,margine:renderMargin,fatturazione:renderInvoicing,costi:renderCosts})[tab]();
}

// ---------- vehicles now ----------
function renderToday(){
 const m=margin();
 const rows=data.vehicles.map(v=>{
  const open=data.trips.find(t=>t.vehicle_id===v.id&&t.status==='aperto');
  const last=data.positions.filter(p=>p.vehicle_id===v.id).sort((a,b)=>a.at<b.at?1:-1)[0];
  const g=m.vehicles.find(x=>x.id===v.id)||{};
  return '<tr><td><strong>'+esc(v.plate)+'</strong><br><span class="tr-subtle">'+esc(v.label)+'</span></td>'
   +'<td>'+(open?'<span class="tr-pill ok">In viaggio</span><br><span class="tr-subtle">'+esc(drv(open.driver_id).name)+' · dalle '+hm(open.started_at)+'</span>':'<span class="tr-pill">Fermo</span>')+'</td>'
   +'<td>'+(last?dmy(last.at)+' '+hm(last.at)+' <a href="https://www.openstreetmap.org/?mlat='+last.lat+'&mlon='+last.lon+'#map=12/'+last.lat+'/'+last.lon+'" target="_blank" rel="noopener">mappa</a><br><span class="tr-subtle">da '+esc(last.source)+'</span>':'—')+'</td>'
   +'<td class="num">'+num(g.trips)+'</td><td class="num">'+num(g.km)+'</td><td class="num">'+eur0(g.revenue_cents)+'</td><td class="num '+((g.margin_cents||0)<0?'neg':'')+'">'+eur0(g.margin_cents)+'</td></tr>';
 }).join('');
 const t=m.totals;
 view.innerHTML=kpis([[eur0(t.revenue_cents),'Ricavi del periodo'],[eur0(t.cost_cents),'Costi'],[eur0(t.margin_cents),'Margine ('+pctTxt(t.margin_pct)+')'],[num(t.trips),'Viaggi chiusi'],[num(t.km)+' km','Percorsi']])
  +'<section class="tr-panel"><h2>Mezzi</h2><table class="tr-table"><thead><tr><th>Mezzo</th><th>Stato</th><th>Ultima posizione</th><th class="num">Viaggi</th><th class="num">Km</th><th class="num">Ricavi</th><th class="num">Margine</th></tr></thead><tbody>'+rows+'</tbody></table>'
  +'<p class="tr-subtle">Posizione dal localizzatore già montato sul mezzo (collegamento al fornitore GPS: prossimo passo) o dal telefono dell\'autista durante il viaggio.</p></section>';
}
const kpis=list=>'<div class="tr-kpis">'+list.map(([b,s])=>'<div class="tr-kpi"><b>'+b+'</b><span>'+esc(s)+'</span></div>').join('')+'</div>';

// ---------- trips & documents ----------
function renderTrips(){
 const p=period();
 const trips=data.trips.filter(t=>t.started_at.slice(0,10)>=p.from&&t.started_at.slice(0,10)<=p.to).sort((a,b)=>a.started_at<b.started_at?1:-1);
 const docsOf=id=>data.documents.filter(d=>d.trip_id===id);
 const corrected=data.documents.filter(d=>d.corrected).length,total=data.documents.length;
 view.innerHTML=kpis([[num(trips.length),'Viaggi nel periodo'],[num(trips.filter(t=>!docsOf(t.id).length).length),'Senza documento'],[num(total),'Documenti archiviati'],[total?Math.round((total-corrected)*100/total)+'%':'—','Letti senza correzioni']])
  +'<div class="tr-grid2"><section class="tr-panel"><h2>Viaggi</h2><table class="tr-table"><thead><tr><th>Data</th><th>Mezzo</th><th>Autista</th><th>Tratta</th><th>Documenti</th><th>Stato</th></tr></thead><tbody>'
  +trips.map(t=>{const ds=docsOf(t.id);return '<tr data-trip="'+esc(t.id)+'"'+(sel===t.id?' class="sel"':'')+' style="cursor:pointer"><td>'+dmy(t.started_at)+'<br><span class="tr-subtle">'+hm(t.started_at)+'–'+hm(t.ended_at)+'</span></td><td>'+esc(veh(t.vehicle_id).plate)+'</td><td>'+esc(drv(t.driver_id).name)+'</td><td class="wrap">'+esc((t.origin||'?')+' → '+(t.destination||'?'))+'</td><td>'+(ds.length?ds.map(d=>'<span class="tr-pill'+(d.corrected?' flag':' ok')+'">'+esc(DOC.KINDS[d.kind]?.label||d.kind)+'</span>').join(' '):'<span class="tr-pill bad">manca</span>')+'</td><td>'+esc(t.status)+'</td></tr>';}).join('')
  +'</tbody></table></section><section class="tr-panel" id="detail">'+tripDetail(sel)+'</section></div>';
 view.querySelectorAll('[data-trip]').forEach(r=>r.onclick=()=>{sel=r.dataset.trip;renderTrips();});
}
function tripDetail(id){
 const t=data.trips.find(x=>x.id===id);if(!t)return '<h2>Dettaglio</h2><p class="tr-muted">Scegli un viaggio per vedere i documenti letti dalle foto.</p>';
 const ds=data.documents.filter(d=>d.trip_id===id);
 return '<h2>'+esc((t.origin||'?')+' → '+(t.destination||'?'))+'</h2><p class="tr-muted">'+dmy(t.started_at)+' · '+esc(veh(t.vehicle_id).plate)+' · '+esc(drv(t.driver_id).name)+' · '+esc(cus(t.customer_id).name||'')+(t.km?' · '+num(t.km)+' km':'')+(t.revenue_cents?' · '+eur(t.revenue_cents):'')+'</p>'
  +(ds.length?ds.map(d=>{const k=DOC.KINDS[d.kind];return '<h3>'+esc(k?k.name:d.kind)+(d.corrected?' <span class="tr-pill flag">'+d.corrected+' campi corretti dall\'autista</span>':'')+(d.demo?' <span class="tr-pill">lettura di esempio</span>':'')+'</h3><table class="tr-table"><tbody>'
   +(k?k.fields:[]).filter(([key])=>d.fields[key]!=null).map(([key,label])=>'<tr><th>'+esc(label)+'</th><td class="wrap">'+esc(d.fields[key])+(d.read&&JSON.stringify(d.read[key])!==JSON.stringify(d.fields[key])?' <span class="tr-subtle">(letto: '+esc(d.read[key]??'vuoto')+')</span>':'')+'</td></tr>').join('')+'</tbody></table>';}).join(''):'<p class="tr-muted">Nessun documento per questo viaggio: senza documento non si fattura.</p>');
}

// ---------- tolls ----------
function renderTolls(){
 const r=tollResult();
 let html='<section class="tr-panel"><h2>Fatture autostradali</h2><p class="tr-muted">Carica il dettaglio transiti (CSV esportato da Telepass, UnipolMove o altri: data, ore e caselli di entrata e uscita, targa o dispositivo, importo). Ogni transito viene abbinato al viaggio che quel mezzo stava facendo a quell\'ora.</p>'
  +'<div class="tr-toolbar"><button class="tr-btn" id="tollUp">Carica CSV</button><button class="tr-btn ghost" id="tollDemo">Usa il file di esempio</button>'+(data.tolls?'<span class="tr-subtle">Ultimo file: '+esc(data.tolls.name)+', '+num(data.tolls.transits.length)+' transiti'+(data.tolls.skipped?', '+data.tolls.skipped+' righe non lette':'')+'</span>':'')+'</div></section>';
 if(r){
  const t=r.totals,label={abbinato:['Abbinato','ok'],fuori_viaggio:['Fuori viaggio','flag'],mezzo_sconosciuto:['Mezzo sconosciuto','bad'],da_controllare:['Da controllare','flag']};
  const order={fuori_viaggio:0,mezzo_sconosciuto:1,da_controllare:2,abbinato:3};
  html+=kpis([[eur(t.amount_cents),num(t.count)+' transiti'],[eur(t.matched_cents),num(t.matched)+' abbinati a un viaggio'],[eur(t.outside_cents),'Fuori da ogni viaggio'],[eur(t.unknown_cents),'Mezzo sconosciuto o senza orario']])
   +'<section class="tr-panel"><h2>Transiti</h2><table class="tr-table"><thead><tr><th>Stato</th><th>Data</th><th>Entrata</th><th>Uscita</th><th>Targa</th><th class="num">Importo</th><th>Viaggio</th><th>Nota</th></tr></thead><tbody>'
   +r.rows.slice().sort((a,b)=>order[a.status]-order[b.status]||(a.exitAt||'').localeCompare(b.exitAt||'')).map(x=>{const tr=data.trips.find(y=>y.id===x.trip_id);const l=label[x.status];return '<tr><td><span class="tr-pill '+l[1]+'">'+l[0]+'</span></td><td>'+dmy(x.date)+'</td><td>'+hm(x.entryAt)+' '+esc(x.entry||'')+'</td><td>'+hm(x.exitAt)+' '+esc(x.exit||'')+'</td><td>'+esc(x.plate||x.device)+'</td><td class="num">'+eur(x.amount_cents)+'</td><td>'+(tr?esc((tr.origin||'?')+' → '+(tr.destination||'?'))+' <span class="tr-subtle">'+esc(drv(tr.driver_id).name)+'</span>':'—')+'</td><td class="wrap tr-subtle">'+esc(x.reason||'')+'</td></tr>';}).join('')
   +'</tbody></table></section>';
 }
 view.innerHTML=html;
 $('tollUp').onclick=()=>{const f=$('tollFile');f.value='';f.onchange=async()=>{const file=f.files[0];if(!file)return;importTolls(file.name,await file.text());};f.click();};
 $('tollDemo').onclick=()=>importTolls('telepass-esempio.csv',ST.sampleTollCsv(data));
}
function importTolls(name,text){
 const p=TOLL.parseTransits(text);
 if(p.error){alertBanner(p.error);return;}
 data.tolls={name,importedAt:ST.localIso(new Date()),transits:p.transits,skipped:p.skipped.length};ST.save(data);renderTolls();
}
function alertBanner(msg){const b=$('banner');b.className='tr-banner error';b.textContent=msg;}

// ---------- margin ----------
function renderMargin(){
 const m=margin(),t=m.totals;
 const dims={vehicles:'Per mezzo',drivers:'Per autista',customers:'Per cliente',trips:'Per viaggio'};
 const kinds=Object.entries(m.by_kind).sort((a,b)=>b[1]-a[1]);const maxK=Math.max(1,...kinds.map(k=>k[1]));
 let rows;
 if(mDim==='trips')rows=m.trips.map(r=>'<tr><td>'+dmy(r.date)+'</td><td class="wrap">'+esc((r.origin||'?')+' → '+(r.destination||'?'))+'</td><td>'+esc(veh(r.vehicle_id).plate)+'</td><td class="num">'+num(r.km)+'</td><td class="num">'+eur(r.revenue_cents)+'</td><td class="num">'+eur(r.cost_cents)+'</td><td class="num '+(r.margin_cents<0?'neg':'')+'">'+eur(r.margin_cents)+'</td><td class="num">'+pctTxt(r.margin_pct)+'</td></tr>').join('');
 else rows=m[mDim].map(g=>'<tr><td>'+esc(g.name)+'</td><td class="num">'+num(g.trips)+'</td><td class="num">'+num(g.km)+'</td><td class="num">'+eur0(g.revenue_cents)+'</td><td class="num">'+eur0(g.cost_cents)+(g.unallocated_cents?'<br><span class="tr-subtle">'+eur0(g.unallocated_cents)+' senza viaggi</span>':'')+'</td><td class="num '+(g.margin_cents<0?'neg':'')+'">'+eur0(g.margin_cents)+'</td><td class="num">'+pctTxt(g.margin_pct)+'</td><td class="num">'+(g.cost_per_km_cents!=null?eur(g.cost_per_km_cents):'—')+'</td></tr>').join('');
 const head=mDim==='trips'?'<th>Data</th><th>Tratta</th><th>Mezzo</th><th class="num">Km</th><th class="num">Ricavo</th><th class="num">Costi</th><th class="num">Margine</th><th class="num">%</th>':'<th>'+({vehicles:'Mezzo',drivers:'Autista',customers:'Cliente'}[mDim])+'</th><th class="num">Viaggi</th><th class="num">Km</th><th class="num">Ricavi</th><th class="num">Costi</th><th class="num">Margine</th><th class="num">%</th><th class="num">Costo/km</th>';
 view.innerHTML=kpis([[eur0(t.revenue_cents),'Ricavi'],[eur0(t.cost_cents),'Costi'],[eur0(t.margin_cents),'Margine'],[pctTxt(t.margin_pct),'Margine sui ricavi'],[t.km?eur(Math.round(t.cost_cents/t.km)):'—','Costo per km']])
  +(t.missing_revenue?'<p class="tr-banner">'+t.missing_revenue+' viaggi senza ricavo: indica la tariffa del cliente o l\'importo del viaggio.</p>':'')
  +'<section class="tr-panel"><div class="tr-toolbar">'+Object.entries(dims).map(([k,l])=>'<button class="tr-btn small'+(k===mDim?'':' ghost')+'" data-dim="'+k+'">'+l+'</button>').join('')+'</div><table class="tr-table"><thead><tr>'+head+'</tr></thead><tbody>'+rows+'</tbody></table>'
  +'<p class="tr-subtle">Costi del viaggio: carburante segnalato e pedaggi abbinati. Costi del mezzo (leasing, manutenzione, pedaggi fuori viaggio) e del personale ripartiti sui viaggi in proporzione ai km.</p></section>'
  +'<section class="tr-panel" style="max-width:760px"><h2>Dove vanno i costi</h2><table class="tr-table"><tbody>'+kinds.map(([k,c])=>'<tr><td>'+esc(MRG.KIND_LABEL[k]||k)+'</td><td style="width:45%"><div class="tr-bar"><i style="width:'+Math.round(c*100/maxK)+'%"></i></div></td><td class="num">'+eur0(c)+'</td><td class="num">'+(t.cost_cents?Math.round(c*100/t.cost_cents)+'%':'')+'</td></tr>').join('')+'</tbody></table></section>';
 view.querySelectorAll('[data-dim]').forEach(b=>b.onclick=()=>{mDim=b.dataset.dim;renderMargin();});
}

// ---------- invoicing ----------
function renderInvoicing(){
 const p=period();const rows=MRG.invoiceRows({trips:data.trips,documents:data.documents,vehicles:data.vehicles,customers:data.customers,drivers:data.drivers,from:p.from,to:p.to});
 const byC=new Map();for(const r of rows){const g=byC.get(r.customer)||{n:0,c:0};g.n++;g.c+=r.amount_cents;byC.set(r.customer,g);}
 view.innerHTML='<section class="tr-panel"><h2>Da fatturare nel periodo</h2><p class="tr-muted">Viaggi chiusi con i dati del documento confermato dall\'autista. Scarica il file per Excel o per il programma di fatturazione.</p>'
  +'<div class="tr-toolbar"><button class="tr-btn" id="csv"'+(rows.length?'':' disabled')+'>Scarica per Excel (CSV)</button><button class="tr-btn ghost" id="mark"'+(rows.length?'':' disabled')+'>Segna come fatturati</button></div>'
  +'<table class="tr-table"><thead><tr><th>Cliente</th><th class="num">Viaggi</th><th class="num">Importo</th></tr></thead><tbody>'+[...byC].map(([k,g])=>'<tr><td>'+esc(k)+'</td><td class="num">'+g.n+'</td><td class="num">'+eur(g.c)+'</td></tr>').join('')+'</tbody></table></section>'
  +'<section class="tr-panel"><table class="tr-table"><thead><tr><th>Cliente</th><th>Data</th><th>Documento</th><th>Tratta</th><th>Merce</th><th>Targa</th><th class="num">Km</th><th class="num">Importo</th></tr></thead><tbody>'
  +rows.map(r=>'<tr><td>'+esc(r.customer)+'</td><td>'+dmy(r.date)+'</td><td>'+esc(r.doc)+'</td><td class="wrap">'+esc(r.origin+' → '+r.destination)+'</td><td>'+esc(r.goods)+'</td><td>'+esc(r.plate)+'</td><td class="num">'+num(r.km)+'</td><td class="num">'+eur(r.amount_cents)+'</td></tr>').join('')+'</tbody></table></section>';
 $('csv').onclick=()=>{const blob=new Blob([MRG.toCsv(rows)],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='viaggi-da-fatturare-'+p.from+'-'+p.to+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
 $('mark').onclick=()=>{const ids=new Set(rows.map(r=>r.trip_id));for(const t of data.trips)if(ids.has(t.id))t.status='fatturato';ST.save(data);renderInvoicing();};
}

// ---------- costs ----------
function renderCosts(){
 const p=period();const list=data.costs.filter(c=>c.date>=p.from&&c.date<=p.to).sort((a,b)=>a.date<b.date?1:-1);
 const opts=(arr,lab)=>'<option value="">—</option>'+arr.map(x=>'<option value="'+esc(x.id)+'">'+esc(lab(x))+'</option>').join('');
 view.innerHTML='<section class="tr-panel"><h2>Aggiungi un costo</h2><p class="tr-muted">Buste paga, leasing, manutenzioni, assicurazioni. Collega il costo al mezzo o all\'autista: il margine lo ripartisce sui suoi viaggi. Lettura automatica delle buste paga e import delle carte carburante: prossimo passo.</p>'
  +'<form id="costForm" class="tr-toolbar"><label>Tipo<select name="kind">'+Object.entries(MRG.KIND_LABEL).map(([k,l])=>'<option value="'+k+'">'+esc(l)+'</option>').join('')+'</select></label><label>Data<input type="date" name="date" required value="'+esc(p.to)+'"></label><label>Importo €<input name="amount" inputmode="decimal" required></label><label>Mezzo<select name="vehicle">'+opts(data.vehicles,v=>v.plate)+'</select></label><label>Autista<select name="driver">'+opts(data.drivers,d=>d.name)+'</select></label><label>Descrizione<input name="description"></label><button class="tr-btn">Aggiungi</button></form><p class="tr-error" id="costErr" hidden></p></section>'
  +'<section class="tr-panel"><table class="tr-table"><thead><tr><th>Data</th><th>Tipo</th><th>Mezzo</th><th>Autista</th><th>Descrizione</th><th class="num">Importo</th></tr></thead><tbody>'
  +list.map(c=>'<tr><td>'+dmy(c.date)+'</td><td>'+esc(MRG.KIND_LABEL[c.kind]||c.kind)+'</td><td>'+esc(veh(c.vehicle_id).plate||'')+'</td><td>'+esc(drv(c.driver_id).name||'')+'</td><td class="wrap">'+esc(c.description||'')+'</td><td class="num">'+eur(c.amount_cents)+'</td></tr>').join('')+'</tbody></table></section>';
 $('costForm').onsubmit=e=>{e.preventDefault();const f=e.target.elements;const n=DOC.normNumber(f.amount.value);
  if(n==null||n<=0){$('costErr').textContent='Importo non valido.';$('costErr').hidden=false;return;}
  data.costs.push({id:ST.uid(),kind:f.kind.value,date:f.date.value,amount_cents:Math.round(n*100),vehicle_id:f.vehicle.value||null,driver_id:f.driver.value||null,description:f.description.value.trim()||null});ST.save(data);renderCosts();};
}

$('from').onchange=$('to').onchange=render;
$('reset').onclick=()=>{if(!confirm('Cancello i dati di questa dimostrazione e ricreo l\'azienda di esempio?'))return;data=ST.reset();$('from').value='';$('to').value='';render();};
window.addEventListener('hashchange',render);
window.addEventListener('storage',e=>{if(e.key==='radix-trasporti-demo-v1')render();});
render();
})();
