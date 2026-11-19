/* Plancia (Trasporti) — command center: upload a whole scanned PDF ("pratica") and turn it into shipments.
   The PDF is rendered page by page in the browser (pdf.js), sent to /api/trasporti in batches of page images
   (Vercel takes at most 4.5 MB per request), then lib/trasporti/pratiche merges the batches, collapses the copies,
   groups the documents into consignments and the office confirms them on a trip. */
(function(){
'use strict';
const PR=window.RadixTrPratiche,DOC=window.RadixTrDocumenti,ST=window.RadixTrStore;
const PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dmy=s=>s?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'';
const num=n=>n==null?'':new Intl.NumberFormat('it-IT').format(n);
const MAX_BATCH=3800000;

function loadPdfJs(){
 if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
 return new Promise((ok,ko)=>{const s=document.createElement('script');s.src=PDFJS+'pdf.min.js';s.onload=()=>{window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS+'pdf.worker.min.js';ok(window.pdfjsLib);};s.onerror=()=>ko(new Error('Non riesco a caricare il lettore PDF: controlla la connessione.'));document.head.appendChild(s);});
}
// PDF → JPEG page images, about 1500 px on the long side (enough for handwriting, small enough for the batches).
async function renderPages(file,progress){
 const lib=await loadPdfJs();
 const pdf=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
 if(pdf.numPages>200)throw new Error('PDF di '+pdf.numPages+' pagine: dividilo in file più piccoli (massimo 200 pagine).');
 const out=[];
 for(let i=1;i<=pdf.numPages;i++){
  progress('Preparo la pagina '+i+' di '+pdf.numPages+'…');
  const page=await pdf.getPage(i);const v0=page.getViewport({scale:1});const k=1500/Math.max(v0.width,v0.height);const v=page.getViewport({scale:k});
  const c=document.createElement('canvas');c.width=Math.round(v.width);c.height=Math.round(v.height);const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
  await page.render({canvasContext:ctx,viewport:v}).promise;
  const du=c.toDataURL('image/jpeg',0.72);out.push({image:du.split(',')[1],media_type:'image/jpeg',thumb:thumb(c)});page.cleanup();
 }
 return out;
}
function thumb(c){const t=document.createElement('canvas');const k=160/Math.max(c.width,c.height);t.width=Math.round(c.width*k);t.height=Math.round(c.height*k);t.getContext('2d').drawImage(c,0,0,t.width,t.height);return t.toDataURL('image/jpeg',0.6);}
function batches(pages){
 const out=[];let cur=null;
 pages.forEach((p,i)=>{if(!cur||cur.pages.length>=PR.MAX_PAGES||cur.size+p.image.length>MAX_BATCH){cur={first:i+1,pages:[],size:0};out.push(cur);}cur.pages.push(p);cur.size+=p.image.length;});
 return out;
}
async function readBatch(b){
 let r;try{r=await fetch('/api/trasporti',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Radix-Trasporti':'1'},body:JSON.stringify({action:'pratica.leggi',data:{first:b.first,pages:b.pages.map(p=>({image:p.image,media_type:p.media_type}))}})});}
 catch{const e=new Error('Senza rete: riprova quando la connessione torna.');throw e;}
 let j={};try{j=await r.json();}catch{}
 if(r.ok)return j;
 const e=new Error(j.error||'Lettura non riuscita ('+r.status+').');e.status=r.status;throw e;
}

/* Example answer of the AI for a 12-page bundle (names invented), used when the reading is not available here
   (not logged in, preview without key), so the flow can be tried end to end. */
function exampleBatches(){
 const c=(v,s='alta')=>({valore:v,sicurezza:s});
 return [PR.parseBatch({documenti:[
  {tipo:'contratto',pagine:[1],campi:{numero:c('2125BRXX 106'),data:c('2025-04-30'),venditore:c('Export Bovini Esempio'),acquirente:c('Azienda Agricola Esempio Uno'),destinazione:c('Canneto sull\'Oglio (MN)'),capi:c('15'),qualita:c('Broutards femelles'),resa:c('reso franco destino')}},
  {tipo:'cmr',pagine:[2],campi:{numero:c('1302'),mittente:c('Export Bovini Esempio'),destinatario:c('Azienda Agricola Esempio Uno'),luogo_carico:c('Pouilly-en-Auxois (FR)'),luogo_scarico:c('Canneto sull\'Oglio (MN)'),data_presa_in_carico:c('2025-04-30'),targa:c('FF902PW'),targa_rimorchio:c('XA449EE'),documenti_allegati:c('Certificat sanitaire 2125 BRXX 106 / INTRA.EU.FR.2025.0032291','media'),istruzioni:c('Prix rendu'),consegna_data:c('2025-05-01','media'),consegna_ricevuto_da:c('Az. Agr. Esempio Uno','bassa')}},
  {tipo:'pesata',pagine:[2],campi:{data:c('2025-05-01'),peso_entrata_kg:c('13320'),peso_uscita_kg:c('8800'),peso_netto_kg:c('4520')}},
  {tipo:'cmr',pagine:[3],copia:true,campi:{numero:c('1302'),mittente:c('Export Bovini Esempio'),destinatario:c('Azienda Agricola Esempio Uno')}},
  {tipo:'giornale',pagine:[4,5,6,7,8],campi:{numero:c('2125BRXX 106'),certificato_sanitario:c('INTRA.EU.FR.2025.0032291'),organizzatore:c('Export Bovini Esempio'),conducente:c('Luca Esempio'),specie:c('Bovini'),numero_animali:c('15'),peso_stimato_kg:c('4779'),luogo_partenza:c('Bellenot-sous-Pouilly (FR)'),partenza:c('2025-04-30 18:00'),luogo_destinazione:c('Canneto sull\'Oglio (MN)'),arrivo_previsto:c('2025-05-01 07:00'),arrivo_effettivo:c('2025-05-01 06:30','media'),targa:c('FF902PW'),animali_idonei_arrivo:c('15')}},
  {tipo:'cmr',pagine:[9],campi:{numero:c('1312'),mittente:c('Export Bovini Esempio'),destinatario:c('Società Agricola Esempio Due'),luogo_carico:c('Pouilly-en-Auxois (FR)'),luogo_scarico:c('Mogliano Veneto (TV)'),data_presa_in_carico:c('2025-04-30'),targa:c('FF902PW'),documenti_allegati:c('Certificat sanitaire 2125 BRXX 105 / INTRA.EU.FR.2025.0032289'),istruzioni:c('Prix rendu')}},
  {tipo:'contratto',pagine:[10],campi:{numero:c('2125BRXX 105'),venditore:c('Export Bovini Esempio'),acquirente:c('Società Agricola Esempio Due'),capi:c('20')}},
  {tipo:'giornale',pagine:[11,12],campi:{numero:c('2125BRXX 105'),certificato_sanitario:c('INTRA.EU.FR.2025.0032289'),specie:c('Bovini'),numero_animali:c('20'),peso_stimato_kg:c('6475'),luogo_partenza:c('Bellenot-sous-Pouilly (FR)'),partenza:c('2025-04-30 18:30'),luogo_destinazione:c('Mogliano Veneto (TV)')}}]},1,12).documents];
}

const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\b(srl|spa|sas|sarl|snc|ss|s\.?r\.?l\.?|societa|soc|agricola|az|azienda)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim();
function guessCustomer(data,s){
 const cands=[s.customer_hint,s.sender].filter(Boolean).map(norm);
 return data.customers.find(c=>{const n=norm(c.name);return n&&cands.some(x=>x&&(x.includes(n)||n.includes(x)));})||null;
}

/* The panel: host is a DOM element; ctx = {data, save, tripId, done(msg)} */
function open(host,ctx){
 const state={file:null,pages:null,shipments:null,demo:false,error:null,progress:null};
 const draw=()=>{
  if(state.progress){host.innerHTML='<section class="tr-panel"><h2>Carica una pratica</h2><p class="tr-muted">'+esc(state.progress)+'</p><div class="tr-bar"><i style="width:'+(state.pct||5)+'%"></i></div></section>';return;}
  if(!state.shipments){
   host.innerHTML='<section class="tr-panel"><h2>Carica una pratica (PDF)</h2><p class="tr-muted">Il PDF scansionato del viaggio, anche con più spedizioni: CMR (anche in più copie), DDT, contratto, giornale di viaggio animali, certificato, pesata. Plancia separa i documenti, scarta le copie, legge i campi e prepara una spedizione per ogni CMR o DDT.</p>'
    +(state.error?'<p class="tr-banner error">'+esc(state.error)+'</p>':'')
    +'<div class="tr-toolbar"><button class="tr-btn" id="prPick">Scegli il PDF</button><button class="tr-btn ghost" id="prDemo">Prova con una pratica di esempio</button><button class="tr-btn ghost" id="prClose">Chiudi</button></div></section>';
   host.querySelector('#prPick').onclick=pick;host.querySelector('#prDemo').onclick=()=>{state.demo=true;finish(exampleBatches());};host.querySelector('#prClose').onclick=()=>ctx.done();
   return;
  }
  const trips=ctx.data.trips.slice().sort((a,b)=>a.started_at<b.started_at?1:-1).slice(0,40);
  const veh=id=>ctx.data.vehicles.find(v=>v.id===id)||{};
  const opt=(sel)=>'<option value="new">Nuovo viaggio</option>'+trips.map(t=>'<option value="'+esc(t.id)+'"'+(t.id===sel?' selected':'')+'>'+esc(dmy(t.started_at)+' · '+(veh(t.vehicle_id).plate||'')+' · '+(t.origin||'?')+' → '+(t.destination||'?'))+'</option>').join('');
  host.innerHTML='<section class="tr-panel"><h2>'+esc(state.file||'Pratica di esempio')+': '+state.shipments.length+' spedizioni</h2>'
   +(state.demo?'<p class="tr-banner demo">Lettura di esempio: la lettura vera dei PDF funziona dopo l\'accesso. I numeri e i nomi qui sotto sono inventati.</p>':'')
   +(state.errors&&state.errors.length?'<p class="tr-banner error">'+state.errors.map(esc).join('<br>')+'</p>':'')
   +'<p class="tr-muted">Controlla, scegli il viaggio e il cliente da fatturare, poi conferma. Le copie della stessa CMR sono già unite.</p></section>'
   +state.shipments.map((s,i)=>'<section class="tr-panel" data-ship="'+i+'"><div class="tr-toolbar"><h3 style="margin:0">'+esc((s.kind==='altro'?'Documenti senza CMR':s.kind.toUpperCase()+' '+(s.number||'senza numero')))+'</h3>'
    +'<label style="margin-left:auto">Viaggio<select data-k="trip">'+opt(ctx.tripId)+'</select></label><label>Cliente<select data-k="customer"><option value="">—</option>'+ctx.data.customers.map(c=>'<option value="'+esc(c.id)+'"'+(s.customer_id===c.id?' selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></label>'
    +'<label style="flex-direction:row;display:flex;gap:6px;align-items:center"><input type="checkbox" data-k="skip" style="width:auto">Non importare</label></div>'
    +'<table class="tr-table"><tbody>'
    +[['Mittente',s.sender],['Destinatario',s.consignee],['Da',s.load_place+(s.load_date?' · '+dmy(s.load_date):'')],['A',s.delivery_place],['Consegnata',s.delivered_at?dmy(s.delivered_at)+(s.received_by?' · '+s.received_by:''):null],['Targhe',[s.plate,s.trailer].filter(Boolean).join(' · ')],
      ['Carico',[s.animals!=null?num(s.animals)+' capi'+(s.species?' ('+s.species+')':''):null,s.pallets!=null?num(s.pallets)+' pallet':null,s.weight_kg!=null?num(s.weight_kg)+' kg':null].filter(Boolean).join(' · ')],['Ordine (casella 13)',s.customer_hint]]
      .filter(r=>r[1]).map(r=>'<tr><th>'+esc(r[0])+'</th><td class="wrap">'+esc(r[1])+'</td></tr>').join('')
    +'<tr><th>Documenti</th><td class="wrap">'+s.documents.map(d=>'<span class="tr-pill ok">'+esc(d.label+(d.number?' '+d.number:''))+'</span> <span class="tr-subtle">pag. '+d.pages.join(', ')+(d.copy_pages.length?' · copie pag. '+d.copy_pages.join(', '):'')+'</span>').join('<br>')+'</td></tr>'
    +'</tbody></table>'
    +(s.lines&&s.lines.length?'<details><summary>'+s.lines.length+' righe</summary><table class="tr-table"><thead><tr><th class="num">Colli</th><th>Merce / mittente</th><th>DDT</th><th>Data</th><th class="num">Kg</th></tr></thead><tbody>'+s.lines.map(l=>'<tr><td class="num">'+num(l.colli)+'</td><td>'+esc(l.descrizione||'')+'</td><td>'+esc(l.ddt||'')+'</td><td>'+dmy(l.data)+'</td><td class="num">'+num(l.peso_kg)+'</td></tr>').join('')+'</tbody></table></details>':'')
    +s.warnings.map(w=>'<p class="tr-alert medio" style="margin-top:8px">'+esc(w)+'</p>').join('')+'</section>').join('')
   +'<div class="tr-toolbar"><button class="tr-btn" id="prOk">Conferma e collega ai viaggi</button><button class="tr-btn ghost" id="prBack">Annulla</button></div>';
  host.querySelector('#prBack').onclick=()=>ctx.done();
  host.querySelector('#prOk').onclick=confirm;
 };
 async function pick(){
  const f=document.getElementById('anyFile');f.value='';f.accept='application/pdf,.pdf';
  f.onchange=async()=>{const file=f.files[0];if(!file)return;state.file=file.name;state.error=null;
   try{
    state.progress='Apro il PDF…';draw();
    const pages=await renderPages(file,m=>{state.progress=m;draw();});state.pages=pages;
    const bs=batches(pages),read=[],errors=[];
    for(let i=0;i<bs.length;i++){
     state.progress='Leggo le pagine '+bs[i].first+'-'+(bs[i].first+bs[i].pages.length-1)+' di '+pages.length+'…';state.pct=Math.round((i+0.5)*100/bs.length);draw();
     try{const r=await readBatch(bs[i]);read.push(r.documents||[]);if(r.error)errors.push(r.error);}
     catch(e){if(e.status===401||e.status===404||e.status===503){state.demo=true;state.progress=null;state.error=(e.status===401?'Accedi per leggere i PDF veri. ':'La lettura automatica non è attiva qui. ')+'Puoi provare il flusso con la pratica di esempio.';draw();return;}errors.push('Pagine '+bs[i].first+'-'+(bs[i].first+bs[i].pages.length-1)+': '+e.message);}
    }
    state.errors=errors;finish(read);
   }catch(e){state.progress=null;state.error=e.message||'PDF non leggibile.';draw();}
  };f.click();
 }
 function finish(read){
  state.progress=null;
  const docs=PR.merge(read);state.docs=docs;
  state.shipments=PR.group(docs).map(c=>PR.shipmentOf(c,(ctx.data.company||{}).name)).map(s=>({...s,customer_id:(guessCustomer(ctx.data,s)||{}).id||null}));
  draw();
 }
 function confirm(){
  const data=ctx.data;const now=ST.localIso(new Date());const uploadId=ST.uid();let made=0,newTrips=0;
  data.shipments=data.shipments||[];
  host.querySelectorAll('[data-ship]').forEach(el=>{
   const s=state.shipments[+el.dataset.ship];if(el.querySelector('[data-k=skip]').checked)return;
   let tripId=el.querySelector('[data-k=trip]').value;const customer=el.querySelector('[data-k=customer]').value||null;
   if(tripId==='new'){
    // one new trip per truck and loading day: consignments of the same load share it
    const v=data.vehicles.find(x=>x.plate===s.plate)||data.vehicles[0];
    const same=data.trips.find(t=>t._upload===uploadId&&t.vehicle_id===v.id&&t.started_at.slice(0,10)===(s.load_date||now.slice(0,10)));
    if(same)tripId=same.id;
    else{const d=data.drivers.find(x=>x.vehicle===v.id)||data.drivers[0];tripId=ST.uid();newTrips++;
     data.trips.push({id:tripId,_upload:uploadId,vehicle_id:v.id,driver_id:d.id,customer_id:customer,status:s.delivered_at?'chiuso':'aperto',started_at:(s.load_date||now.slice(0,10))+'T06:00',ended_at:s.delivered_at?s.delivered_at+'T18:00':null,origin:s.load_place,destination:s.delivery_place,km:null,revenue_cents:null});}
   }
   const trip=data.trips.find(t=>t.id===tripId);if(!trip)return;
   if(!trip.customer_id&&customer)trip.customer_id=customer;
   let mainDoc=null;
   for(const d of s.documents){const full=state.docs.find(x=>x.id===d.id);if(!full)continue;
    const doc={id:ST.uid(),trip_id:tripId,kind:DOC.KINDS[full.kind]?full.kind:'altro',at:now,fields:{...full.fields,...(full.lines&&full.lines.length?{righe:full.lines}:{})},read:full.fields,pages:full.pages,copy_pages:full.copy_pages,upload:state.file||'pratica di esempio',upload_id:uploadId,confirmed:true,corrected:0,demo:state.demo,from_office:true};
    data.documents.push(doc);if(full.kind==='cmr'||full.kind==='ddt')mainDoc=doc;}
   data.shipments.push({id:ST.uid(),trip_id:tripId,document_id:mainDoc&&mainDoc.id,customer_id:customer,kind:s.kind,number:s.number,sender:s.sender,consignee:s.consignee,load_place:s.load_place,load_date:s.load_date,delivery_place:s.delivery_place,delivered_at:s.delivered_at,received_by:s.received_by,reserves:s.reserves,pallets:s.pallets,animals:s.animals,species:s.species||null,animal_ref:s.animal_ref||null,customer_hint:s.customer_hint||null,customer_why:s.customer_why||null,plate:s.plate||null,weight_kg:s.weight_kg,lines:s.lines||[],revenue_cents:null,status:s.delivered_at?'consegnata':'in_viaggio',warnings:s.warnings});
   made++;
  });
  for(const t of data.trips)delete t._upload;
  ctx.save();ctx.done(made+(made===1?' spedizione collegata':' spedizioni collegate')+(newTrips?' ('+newTrips+(newTrips===1?' nuovo viaggio':' nuovi viaggi')+')':'')+'.');
 }
 draw();
}
window.TrPratica={open,batches,exampleBatches};
})();
