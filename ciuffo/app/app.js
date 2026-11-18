/* Ciuffo — the shop owner's agenda: day grid by staff member with free gaps, week list, clients, settings. */
(function(){
'use strict';
const C=window.Ciuffo,S=window.CiuffoSlots,$=id=>document.getElementById(id),esc=C.esc;
const PX=1.4; // pixels per minute in the day grid
const WD=['','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato','Domenica'];
const COLORS=['#E8705F','#6B3A5B','#5E9C76','#D9A441','#4F7CAC','#B5577A','#7A6A58','#3E8E8E'];
const st={me:null,shop:null,mode:'day',date:null,appts:[],view:'agenda',set:'orari'};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:C.TZ}).format(new Date());
const tz=()=>st.shop.timezone||C.TZ;
const local=iso=>S.utcToLocal(iso,tz());
const mins=iso=>S.toMin(local(iso).time);
const staffOf=id=>st.shop.staff.find(t=>t.id===id)||{name:'?',color:'#999'};
const activeStaff=()=>st.shop.staff.filter(t=>t.active);
const mondayOf=d=>S.addDays(d,1-S.weekday(d));

function toast(msg,err){const t=$('toast');t.textContent=msg;t.className='toast'+(err?' err':'');clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.add('hidden'),3200);}
async function call(action,data){return C.api('POST',null,{action,shop:st.shop.id,data});}

// ---------- boot ----------
async function boot(){
 try{st.me=await C.api('GET',{resource:'me'});}catch(e){if(e.status===401){location.href='/ciuffo/accedi.html';return;}document.body.innerHTML='<p class="notice err" style="margin:20px">'+esc(e.message)+'</p>';return;}
 if(!st.me.shops.length){document.body.innerHTML='<p class="notice" style="margin:20px">Questo account non ha ancora un salone.</p>';return;}
 await loadSetup(st.me.shops[0].id);
 st.date=today();
 if(new URLSearchParams(location.search).get('benvenuto'))welcome();
 renderLink();show('agenda');
}
async function loadSetup(id){st.shop=await C.api('GET',{resource:'setup',shop:id});$('shopname').textContent=st.shop.name;document.title='Agenda · '+st.shop.name;}
function publicUrl(){return location.origin+'/ciuffo/p/'+st.shop.slug;}
function renderLink(){
 const open=st.shop.booking_open;
 $('linkbar').innerHTML='<div class="url"><span class="lbl">'+(open?'La tua pagina «Prenota»: mettila su Instagram, Google e WhatsApp':'Prenotazioni online chiuse: la pagina mostra il tuo numero')+'</span><span class="u">'+esc(publicUrl())+'</span></div>'+
  '<button type="button" class="btn small" id="copy">Copia link</button><a class="btn ghost small" href="'+esc(publicUrl())+'" target="_blank" rel="noopener">Apri</a>';
 $('copy').onclick=async()=>{try{await navigator.clipboard.writeText(publicUrl());toast('Link copiato');}catch{prompt('Copia il link:',publicUrl());}};
}
function welcome(){
 const w=$('welcome');w.classList.remove('hidden');
 w.innerHTML='<h3>Benvenuta, benvenuto: la tua agenda è pronta</h3><p class="muted">Abbiamo messo orari e servizi tipici di un salone. Tre passi e sei online:</p><ol><li>Controlla <a href="#" data-go="orari">gli orari</a> e <a href="#" data-go="servizi">i servizi con durata e prezzo</a>.</li><li>Aggiungi <a href="#" data-go="operatori">chi lavora con te</a>, se non sei da solo.</li><li>Copia il link qui sotto e mettilo nella bio di Instagram e su Google.</li></ol><button type="button" class="btn ghost small" id="wclose" style="margin-top:10px">Ho capito</button>';
 w.addEventListener('click',e=>{const a=e.target.closest('[data-go]');if(a){e.preventDefault();st.set=a.dataset.go;show('impostazioni');}});
 $('wclose').onclick=()=>{w.classList.add('hidden');history.replaceState(null,'','/ciuffo/app/');};
}
function show(view){
 st.view=view;for(const v of ['agenda','clienti','impostazioni'])$('v-'+v).classList.toggle('hidden',v!==view);
 document.querySelectorAll('.tabs button').forEach(b=>{if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 if(view==='agenda')loadAgenda();if(view==='clienti')loadClients();if(view==='impostazioni')renderSettings();
}
document.querySelector('.tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)show(b.dataset.view);});
$('logout').onclick=async()=>{await C.api('POST',null,{action:'auth.logout',data:{}}).catch(()=>{});location.href='/ciuffo/accedi.html';};

// ---------- agenda ----------
async function loadAgenda(){
 const from=st.mode==='day'?st.date:mondayOf(st.date),to=st.mode==='day'?st.date:S.addDays(from,6);
 $('datelabel').textContent=st.mode==='day'?C.day(st.date):('Settimana dal '+C.day(from).replace(/^\S+\s/,''));
 $('board').innerHTML='<p class="muted pad">Carico…</p>';
 try{st.appts=await C.api('GET',{resource:'agenda',shop:st.shop.id,from,to});}catch(e){$('board').innerHTML='<p class="notice err">'+esc(e.message)+'</p>';return;}
 st.mode==='day'?drawDay():drawWeek(from);
}
const live=a=>a.status==='confirmed'||a.status==='done';
function hoursFor(member,date){const h=(member.hours&&Object.keys(member.hours).length?member.hours:st.shop.hours)||{};return S.closedOn(st.shop.closures,date,member.id)?[]:(h[String(S.weekday(date))]||[]);}
function drawDay(){
 const date=st.date,staff=activeStaff(),appts=st.appts.filter(a=>a.status!=='cancelled');
 let lo=24*60,hi=0;
 for(const t of staff)for(const [a,b] of hoursFor(t,date)){lo=Math.min(lo,S.toMin(a));hi=Math.max(hi,S.toMin(b));}
 for(const a of appts){lo=Math.min(lo,mins(a.starts_at));hi=Math.max(hi,mins(a.ends_at));}
 if(hi<=lo){lo=9*60;hi=19*60;}
 lo=Math.floor(lo/60)*60;hi=Math.ceil(hi/60)*60;
 const H=(hi-lo)*PX,cols=staff.length;
 let html='<div class="grid" style="--cols:'+cols+';grid-template-columns:56px repeat('+cols+',minmax(170px,1fr))"><div class="colhead"></div>';
 for(const t of staff)html+='<div class="colhead"><span class="dot" style="background:'+esc(t.color||'#999')+'"></span>'+esc(t.name)+'</div>';
 html+='<div class="timecol" style="height:'+H+'px">';for(let m=lo;m<=hi;m+=60)html+='<span style="top:'+((m-lo)*PX)+'px">'+S.fromMin(m%1440)+'</span>';html+='</div>';
 const nowL=local(new Date().toISOString());
 for(const t of staff){
  html+='<div class="col" style="height:'+H+'px" data-staff="'+t.id+'">';
  for(let m=lo;m<hi;m+=60)html+='<div class="hour" style="top:'+((m-lo)*PX)+'px"></div>';
  // Closed time (outside this member's hours) is shaded.
  let cur=lo;for(const [a,b] of hoursFor(t,date)){const x=S.toMin(a),y=S.toMin(b);if(x>cur)html+='<div class="closed" style="top:'+((cur-lo)*PX)+'px;height:'+((x-cur)*PX)+'px"></div>';cur=Math.max(cur,y);}
  if(cur<hi)html+='<div class="closed" style="top:'+((cur-lo)*PX)+'px;height:'+((hi-cur)*PX)+'px"></div>';
  const busy=appts.filter(a=>a.staff_id===t.id&&live(a));
  for(const g of S.gaps({date,tz:tz(),hours:st.shop.hours,member:t,busy,closures:st.shop.closures},15)){
   if(date===nowL.date&&g.to<=nowL.time)continue;
   html+='<button type="button" class="gap" data-staff="'+t.id+'" data-time="'+g.from+'" style="top:'+((S.toMin(g.from)-lo)*PX+2)+'px;height:'+(g.minutes*PX-4)+'px">Libero '+g.from+'–'+g.to+'</button>';
  }
  for(const a of appts.filter(a=>a.staff_id===t.id)){
   const top=(mins(a.starts_at)-lo)*PX,h=Math.max(22,(mins(a.ends_at)-mins(a.starts_at))*PX-2);
   html+='<button type="button" class="appt '+(a.source==='web'?'web ':'')+a.status+'" data-id="'+a.id+'" style="top:'+top+'px;height:'+h+'px;border-left-color:'+esc(t.color||'#999')+'"><b>'+esc(a.customer)+'</b><span class="t">'+C.time(a.starts_at)+' · '+esc(a.service)+'</span></button>';
  }
  if(date===nowL.date){const m=S.toMin(nowL.time);if(m>lo&&m<hi)html+='<div class="nowline" style="top:'+((m-lo)*PX)+'px"></div>';}
  html+='</div>';
 }
 html+='</div>';
 $('board').innerHTML=staff.length?html:'<p class="notice">Aggiungi almeno un operatore in Impostazioni.</p>';
 if(date===nowL.date){const m=S.toMin(nowL.time);if(m>lo)$('board').scrollTop=Math.max(0,(m-lo)*PX-80);}
}
function drawWeek(from){
 let html='<div class="week">';
 for(let i=0;i<7;i++){
  const d=S.addDays(from,i),list=st.appts.filter(a=>a.status!=='cancelled'&&local(a.starts_at).date===d);
  const open=activeStaff().some(t=>hoursFor(t,d).length);
  html+='<div class="wd'+(d===today()?' today':'')+'"><h3><a href="#" data-day="'+d+'">'+esc(C.day(d))+'</a></h3>'+(list.length?'<p class="count">'+list.length+' appuntament'+(list.length===1?'o':'i')+'</p>':'');
  if(!open&&!list.length)html+='<p class="closedday">Chiuso</p>';
  for(const a of list){const t=staffOf(a.staff_id);html+='<button type="button" class="item" data-id="'+a.id+'" style="border-left-color:'+esc(t.color||'#999')+'"><b>'+C.time(a.starts_at)+'</b> '+esc(a.customer)+'<br><span class="muted">'+esc(a.service)+' · '+esc(t.name)+'</span></button>';}
  html+='</div>';
 }
 $('board').innerHTML=html+'</div>';
}
$('board').addEventListener('click',e=>{
 const g=e.target.closest('.gap');if(g)return newAppt({staff_id:g.dataset.staff,date:st.date,time:g.dataset.time});
 const a=e.target.closest('[data-id]');if(a)return apptDetail(st.appts.find(x=>x.id===a.dataset.id));
 const d=e.target.closest('[data-day]');if(d){e.preventDefault();st.date=d.dataset.day;setMode('day');}
});
function setMode(m){st.mode=m;document.querySelectorAll('.seg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===m)));loadAgenda();}
document.querySelector('.seg').addEventListener('click',e=>{const b=e.target.closest('button');if(b)setMode(b.dataset.mode);});
$('prev').onclick=()=>{st.date=S.addDays(st.date,st.mode==='day'?-1:-7);loadAgenda();};
$('next').onclick=()=>{st.date=S.addDays(st.date,st.mode==='day'?1:7);loadAgenda();};
$('today').onclick=()=>{st.date=today();loadAgenda();};
$('newappt').onclick=()=>newAppt({date:st.date});

// ---------- dialogs ----------
const dlg=$('dlg'),form=$('dlgform');
function open(html,onSubmit){form.innerHTML=html;form.onsubmit=async e=>{if(e.submitter&&e.submitter.value==='cancel')return;e.preventDefault();const btn=e.submitter;if(btn)btn.disabled=true;try{if(await onSubmit(btn&&btn.value)!==false)dlg.close();}catch(err){toast(err.message,true);}finally{if(btn)btn.disabled=false;}};dlg.showModal();}
const opts=(list,sel)=>list.map(x=>'<option value="'+x.id+'"'+(x.id===sel?' selected':'')+'>'+esc(x.name)+'</option>').join('');
const v=id=>form.querySelector('#'+id).value;
function newAppt(pre){
 const svcs=st.shop.services.filter(s=>s.active),staff=activeStaff();
 open('<h3>Nuovo appuntamento</h3>'+
  '<div class="field"><label for="f-c">Cliente</label><input id="f-c" autocomplete="off" placeholder="Cerca per nome o numero, o scrivi un nome nuovo" required></div><div class="suggest hidden" id="f-sug"></div>'+
  '<div class="field" id="f-telw"><label for="f-tel">Cellulare <span class="muted small">(per i promemoria)</span></label><input id="f-tel" type="tel" inputmode="tel"></div>'+
  '<div class="row2"><div class="field"><label for="f-s">Servizio</label><select id="f-s">'+svcs.map(s=>'<option value="'+s.id+'">'+esc(s.name)+' · '+C.dur(s.duration_min)+'</option>').join('')+'</select></div>'+
  '<div class="field"><label for="f-o">Con</label><select id="f-o">'+opts(staff,pre.staff_id)+'</select></div></div>'+
  '<div class="row2"><div class="field"><label for="f-d">Giorno</label><input id="f-d" type="date" value="'+(pre.date||st.date)+'" required></div><div class="field"><label for="f-t">Ora</label><input id="f-t" type="time" step="300" value="'+(pre.time||'10:00')+'" required></div></div>'+
  '<div class="field"><label for="f-n">Note</label><input id="f-n" maxlength="500"></div>'+
  '<div class="foot"><button class="btn ghost" value="cancel" formnovalidate>Annulla</button><button class="btn" value="ok">Salva</button></div>',
  async()=>{
   const start=new Date(S.localToUtc(v('f-d'),S.toMin(v('f-t')),tz())).toISOString();
   const data={service_id:v('f-s'),staff_id:v('f-o'),starts_at:start,note:v('f-n')||undefined};
   if(form.dataset.cust)data.customer_id=form.dataset.cust;else data.customer={name:v('f-c'),phone:v('f-tel')||undefined};
   let r=await call('appointment.create',data);
   if(r.needs_confirm){if(!confirm(r.message))return false;r=await call('appointment.create',{...data,force:true});}
   toast('Appuntamento salvato');st.date=v('f-d');loadAgenda();
  });
 form.dataset.cust='';
 const inp=form.querySelector('#f-c'),sug=form.querySelector('#f-sug');let timer;
 inp.addEventListener('input',()=>{form.dataset.cust='';form.querySelector('#f-telw').classList.remove('hidden');clearTimeout(timer);const q=inp.value.trim();if(q.length<2){sug.classList.add('hidden');return;}
  timer=setTimeout(async()=>{const list=await C.api('GET',{resource:'customers',shop:st.shop.id,q}).catch(()=>[]);
   sug.innerHTML=list.map(c=>'<button type="button" data-id="'+c.id+'" data-name="'+esc(c.name)+'">'+esc(c.name)+(c.phone?' <span class="muted small">'+esc(c.phone)+'</span>':'')+'</button>').join('');sug.classList.toggle('hidden',!list.length);},250);});
 sug.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;form.dataset.cust=b.dataset.id;inp.value=b.dataset.name;sug.classList.add('hidden');form.querySelector('#f-telw').classList.add('hidden');});
}
const STATUS={confirmed:'Confermato',done:'Fatto',no_show:'Non si è presentato',cancelled:'Disdetto'};
const SOURCE={web:'Online, dalla pagina Prenota',owner:'Dal salone',whatsapp:'WhatsApp',phone:'Telefono'};
function apptDetail(a){
 const t=staffOf(a.staff_id),wa=a.phone?'https://wa.me/'+a.phone.replace('+',''):null;
 open('<h3>'+esc(a.customer)+'</h3><dl class="kv"><dt>Quando</dt><dd>'+esc(C.day(a.starts_at))+', '+C.time(a.starts_at)+'–'+C.time(a.ends_at)+'</dd><dt>Servizio</dt><dd>'+esc(a.service)+(a.price_cents!=null?' · '+C.money(a.price_cents):'')+'</dd><dt>Con</dt><dd>'+esc(t.name)+'</dd><dt>Stato</dt><dd>'+STATUS[a.status]+'</dd><dt>Arrivato da</dt><dd>'+SOURCE[a.source]+'</dd>'+
  (a.phone?'<dt>Cellulare</dt><dd><a href="tel:'+esc(a.phone)+'">'+esc(C.tel(a.phone))+'</a> · <a href="'+wa+'" target="_blank" rel="noopener">WhatsApp</a></dd>':'')+(a.note?'<dt>Note</dt><dd>'+esc(a.note)+'</dd>':'')+'</dl>'+
  '<details><summary class="small" style="cursor:pointer;margin-bottom:10px">Sposta</summary><div class="row2"><div class="field"><label for="m-d">Giorno</label><input id="m-d" type="date" value="'+local(a.starts_at).date+'"></div><div class="field"><label for="m-t">Ora</label><input id="m-t" type="time" step="300" value="'+local(a.starts_at).time+'"></div></div><div class="field"><label for="m-o">Con</label><select id="m-o">'+opts(activeStaff(),a.staff_id)+'</select></div><button class="btn small" value="move">Sposta qui</button></details>'+
  '<div class="foot">'+(a.status==='confirmed'?'<button class="btn ghost small" value="cancelled">Disdici</button><button class="btn ghost small" value="no_show">Non si è presentato</button><button class="btn small" value="done">Fatto</button>':'<button class="btn ghost small" value="confirmed">Riporta a confermato</button>')+'<button class="btn ghost small" value="cancel" formnovalidate>Chiudi</button></div>',
  async(val)=>{
   if(val==='move'){const start=new Date(S.localToUtc(v('m-d'),S.toMin(v('m-t')),tz())).toISOString();const data={id:a.id,service_id:a.service_id,staff_id:v('m-o'),starts_at:start};
    let r=await call('appointment.move',data);if(r.needs_confirm){if(!confirm(r.message))return false;r=await call('appointment.move',{...data,force:true});}toast('Appuntamento spostato');st.date=v('m-d');}
   else{if(val==='cancelled'&&!confirm('Disdire l\'appuntamento? L\'orario torna libero.'))return false;await call('appointment.status',{id:a.id,status:val});toast(val==='cancelled'?'Disdetto: l\'orario è di nuovo libero':'Fatto');}
   loadAgenda();
  });
}

// ---------- clients ----------
let ct;
async function loadClients(){const q=$('csearch').value.trim();
 const list=await C.api('GET',{resource:'customers',shop:st.shop.id,q}).catch(e=>{toast(e.message,true);return [];});
 $('clist').innerHTML=list.length?list.map(c=>'<div class="list-row"><div><b>'+esc(c.name)+'</b><div class="sub">'+(c.phone?'<a href="tel:'+esc(c.phone)+'">'+esc(C.tel(c.phone))+'</a> · ':'')+c.visits+' appuntament'+(c.visits==1?'o':'i')+(c.last?' · ultimo '+esc(C.day(c.last)):'')+'</div></div>'+(c.phone?'<a class="btn ghost small" href="https://wa.me/'+esc(c.phone.replace('+',''))+'" target="_blank" rel="noopener">WhatsApp</a>':'<span></span>')+'</div>').join(''):'<p class="muted">'+(q?'Nessun cliente trovato.':'I clienti compaiono qui dalla prima prenotazione.')+'</p>';}
$('csearch').addEventListener('input',()=>{clearTimeout(ct);ct=setTimeout(loadClients,250);});

// ---------- settings ----------
document.querySelector('.subtabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;st.set=b.dataset.set;renderSettings();});
async function reload(){await loadSetup(st.shop.id);renderLink();renderSettings();}
function renderSettings(){
 document.querySelectorAll('.subtabs button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.set===st.set)));
 ({orari:setHours,servizi:setServices,operatori:setStaff,chiusure:setClosures,salone:setShop})[st.set]();
}
function setHours(){
 const h=st.shop.hours||{};let html='<h3>Orari di apertura</h3><p class="muted small">Per la pausa pranzo usa due fasce. Le prenotazioni online finiscono in tempo per chiudere all\'orario indicato.</p>';
 for(let d=1;d<=7;d++){const b=h[String(d)]||[];const two=b.length>1;
  html+='<div class="hours-row" data-d="'+d+'"><b>'+WD[d]+'</b><label class="switch"><input type="checkbox" class="open"'+(b.length?' checked':'')+'> Aperto</label><div class="bands'+(b.length?'':' hidden')+'">'+
   '<input type="time" class="a1" value="'+(b[0]?b[0][0]:'09:00')+'" aria-label="Apre"> – <input type="time" class="b1" value="'+(b[0]?b[0][1]:(two?'13:00':'19:00'))+'" aria-label="Chiude">'+
   '<label class="switch"><input type="checkbox" class="split"'+(two?' checked':'')+'> pausa</label><span class="band2'+(two?'':' hidden')+'"><input type="time" class="a2" value="'+(b[1]?b[1][0]:'14:30')+'" aria-label="Riapre"> – <input type="time" class="b2" value="'+(b[1]?b[1][1]:'19:00')+'" aria-label="Chiude"></span></div></div>';}
 html+='<div style="margin-top:16px"><button type="button" class="btn" id="savehours">Salva orari</button></div>';
 $('setbox').innerHTML=html;
 $('setbox').onchange=e=>{const r=e.target.closest('.hours-row');if(!r)return;r.querySelector('.bands').classList.toggle('hidden',!r.querySelector('.open').checked);r.querySelector('.band2').classList.toggle('hidden',!r.querySelector('.split').checked);};
 $('savehours').onclick=async()=>{const out={};
  for(const r of document.querySelectorAll('.hours-row')){if(!r.querySelector('.open').checked)continue;const q=c=>r.querySelector(c).value;const b=[[q('.a1'),q('.b1')]];if(r.querySelector('.split').checked)b.push([q('.a2'),q('.b2')]);out[r.dataset.d]=b;}
  try{await call('shop.save',{hours:out});toast('Orari salvati');await reload();}catch(e){toast(e.message,true);}};
}
function setServices(){
 const list=st.shop.services;
 $('setbox').innerHTML='<h3>Servizi</h3><p class="muted small">La durata decide quanto tempo blocca in agenda. «Pausa dopo» serve per pulire la postazione o far posare il colore.</p>'+
  list.map(s=>'<div class="list-row"><div><b>'+esc(s.name)+'</b>'+(s.active?'':'<span class="tag">Nascosto</span>')+'<div class="sub">'+C.dur(s.duration_min)+(s.buffer_min?' + '+s.buffer_min+' min di pausa':'')+(s.price_cents!=null?' · '+C.money(s.price_cents):'')+(s.staff_ids.length?' · solo '+s.staff_ids.map(i=>esc(staffOf(i).name)).join(', '):'')+'</div></div><button type="button" class="btn ghost small" data-edit="'+s.id+'">Modifica</button></div>').join('')+
  '<div style="margin-top:16px"><button type="button" class="btn" id="addsvc">+ Aggiungi servizio</button></div>';
 $('setbox').onclick=e=>{const b=e.target.closest('[data-edit]');if(b)editService(list.find(s=>s.id===b.dataset.edit));if(e.target.id==='addsvc')editService(null);};
}
function editService(s){
 const staff=activeStaff();
 open('<h3>'+(s?'Modifica servizio':'Nuovo servizio')+'</h3><div class="field"><label for="s-n">Nome</label><input id="s-n" required maxlength="80" value="'+esc(s?s.name:'')+'"></div>'+
  '<div class="row2"><div class="field"><label for="s-d">Durata (minuti)</label><input id="s-d" type="number" min="5" max="480" step="5" required value="'+(s?s.duration_min:30)+'"></div><div class="field"><label for="s-b">Pausa dopo (minuti)</label><input id="s-b" type="number" min="0" max="120" step="5" value="'+(s?s.buffer_min:0)+'"></div></div>'+
  '<div class="row2"><div class="field"><label for="s-p">Prezzo (€)</label><input id="s-p" type="number" min="0" step="0.5" value="'+(s&&s.price_cents!=null?s.price_cents/100:'')+'"></div><div class="field"><label for="s-a">Visibile online</label><select id="s-a"><option value="1">Sì</option><option value="0"'+(s&&!s.active?' selected':'')+'>No, solo dal salone</option></select></div></div>'+
  (staff.length>1?'<div class="field"><span style="font-weight:600;font-size:.92rem">Chi lo fa</span>'+staff.map(t=>'<label class="check"><input type="checkbox" class="s-st" value="'+t.id+'"'+(!s||!s.staff_ids.length||s.staff_ids.includes(t.id)?' checked':'')+'> '+esc(t.name)+'</label>').join('')+'</div>':'')+
  '<div class="field"><label for="s-x">Descrizione breve <span class="muted small">(facoltativa)</span></label><input id="s-x" maxlength="300" value="'+esc(s&&s.description||'')+'"></div>'+
  '<div class="foot"><button class="btn ghost" value="cancel" formnovalidate>Annulla</button><button class="btn" value="ok">Salva</button></div>',
  async()=>{const price=v('s-p');const picked=[...form.querySelectorAll('.s-st')].filter(x=>x.checked).map(x=>x.value);
   const data={name:v('s-n'),duration_min:Number(v('s-d')),buffer_min:Number(v('s-b')||0),price_cents:price===''?null:Math.round(Number(price)*100),active:v('s-a')==='1',description:v('s-x')||null,staff_ids:picked.length===staff.length?[]:picked};
   if(s)data.id=s.id;await call('service.save',data);toast('Servizio salvato');await reload();});
}
function setStaff(){
 const list=st.shop.staff;
 $('setbox').innerHTML='<h3>Chi lavora in salone</h3><p class="muted small">Ogni persona ha la sua colonna in agenda. Chi prenota online può scegliere con chi, oppure «chiunque sia libero».</p>'+
  list.map(t=>'<div class="list-row"><div><b><span class="sw" style="background:'+esc(t.color||'#999')+';border-radius:50%;margin-right:8px"></span>'+esc(t.name)+'</b>'+(t.active?'':'<span class="tag">Non attivo</span>')+'<div class="sub">'+(t.hours?'Orari suoi':'Orari del salone')+'</div></div><button type="button" class="btn ghost small" data-edit="'+t.id+'">Modifica</button></div>').join('')+
  '<div style="margin-top:16px"><button type="button" class="btn" id="addstaff">+ Aggiungi persona</button></div>';
 $('setbox').onclick=e=>{const b=e.target.closest('[data-edit]');if(b)editStaff(list.find(t=>t.id===b.dataset.edit));if(e.target.id==='addstaff')editStaff(null);};
}
function editStaff(t){
 let color=t&&t.color||COLORS[st.shop.staff.length%COLORS.length];
 open('<h3>'+(t?'Modifica':'Nuova persona')+'</h3><div class="field"><label for="p-n">Nome</label><input id="p-n" required maxlength="80" value="'+esc(t?t.name:'')+'"></div>'+
  '<div class="field"><span style="font-weight:600;font-size:.92rem">Colore in agenda</span><div class="colorpick">'+COLORS.map(c=>'<button type="button" data-c="'+c+'" style="background:'+c+'" aria-pressed="'+(c===color)+'" aria-label="Colore '+c+'"></button>').join('')+'</div></div>'+
  (t?'<label class="check"><input type="checkbox" id="p-a"'+(t.active?' checked':'')+'> Attivo (compare in agenda e online)</label>':'')+
  '<div class="foot"><button class="btn ghost" value="cancel" formnovalidate>Annulla</button><button class="btn" value="ok">Salva</button></div>',
  async()=>{const data={name:v('p-n'),color};if(t){data.id=t.id;data.active=form.querySelector('#p-a').checked;}await call('staff.save',data);toast('Salvato');await reload();});
 form.querySelector('.colorpick').onclick=e=>{const b=e.target.closest('button');if(!b)return;color=b.dataset.c;form.querySelectorAll('.colorpick button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));};
}
function setClosures(){
 const list=st.shop.closures;
 $('setbox').innerHTML='<h3>Chiusure e ferie</h3><p class="muted small">Nei giorni indicati la pagina Prenota non offre orari. Puoi chiudere tutto il salone o una sola persona.</p>'+
  (list.length?list.map(c=>'<div class="list-row"><div><b>'+esc(C.day(c.from_date))+(c.to_date!==c.from_date?' → '+esc(C.day(c.to_date)):'')+'</b><div class="sub">'+(c.staff_id?esc(staffOf(c.staff_id).name):'Tutto il salone')+(c.note?' · '+esc(c.note):'')+'</div></div><button type="button" class="btn ghost small" data-del="'+c.id+'">Togli</button></div>').join(''):'<p class="muted">Nessuna chiusura in programma.</p>')+
  '<h3 style="margin-top:20px;font-size:1.05rem">Aggiungi</h3><div class="row2"><div class="field"><label for="cl-f">Dal</label><input id="cl-f" type="date" value="'+today()+'"></div><div class="field"><label for="cl-t">Al</label><input id="cl-t" type="date" value="'+today()+'"></div></div>'+
  '<div class="row2"><div class="field"><label for="cl-s">Chi</label><select id="cl-s"><option value="">Tutto il salone</option>'+opts(activeStaff())+'</select></div><div class="field"><label for="cl-n">Nota</label><input id="cl-n" maxlength="200" placeholder="Ferie, corso…"></div></div><button type="button" class="btn" id="addcl">Aggiungi chiusura</button>';
 $('setbox').onclick=async e=>{const d=e.target.closest('[data-del]');const g=id=>$('setbox').querySelector('#'+id).value;
  try{if(d){await call('closure.delete',{id:d.dataset.del});toast('Tolta');await reload();}
   if(e.target.id==='addcl'){await call('closure.save',{from_date:g('cl-f'),to_date:g('cl-t'),staff_id:g('cl-s')||null,note:g('cl-n')||null});toast('Chiusura aggiunta');await reload();}}catch(err){toast(err.message,true);}};
}
function setShop(){
 const s=st.shop,sel=(id,vals,cur)=>'<select id="'+id+'">'+vals.map(([k,l])=>'<option value="'+k+'"'+(k==cur?' selected':'')+'>'+l+'</option>').join('')+'</select>';
 $('setbox').innerHTML='<h3>Salone e prenotazioni</h3>'+
  '<div class="row2"><div class="field"><label for="x-n">Nome</label><input id="x-n" value="'+esc(s.name)+'"></div><div class="field"><label for="x-t">Telefono</label><input id="x-t" type="tel" value="'+esc(s.phone||'')+'"></div></div>'+
  '<div class="row2"><div class="field"><label for="x-a">Indirizzo</label><input id="x-a" value="'+esc(s.address||'')+'"></div><div class="field"><label for="x-c">Città</label><input id="x-c" value="'+esc(s.city||'')+'"></div></div>'+
  '<div class="field"><label for="x-w">Messaggio sulla pagina Prenota</label><input id="x-w" maxlength="500" value="'+esc(s.welcome||'')+'" placeholder="Es. Per trattamenti sposa chiamaci."></div>'+
  '<div class="field"><label for="x-s">Indirizzo della pagina</label><input id="x-s" value="'+esc(s.slug)+'"><span class="small muted">'+esc(location.origin)+'/ciuffo/p/<b>'+esc(s.slug)+'</b></span></div>'+
  '<div class="row2"><div class="field"><label for="x-st">Orari proposti ogni</label>'+sel('x-st',[[10,'10 minuti'],[15,'15 minuti'],[20,'20 minuti'],[30,'30 minuti'],[60,'1 ora']],s.step_min)+'</div>'+
  '<div class="field"><label for="x-mn">Preavviso minimo</label>'+sel('x-mn',[[0,'Nessuno'],[30,'30 minuti'],[60,'1 ora'],[120,'2 ore'],[240,'4 ore'],[1440,'1 giorno']],s.min_notice_min)+'</div></div>'+
  '<div class="row2"><div class="field"><label for="x-md">Prenotabile fino a</label>'+sel('x-md',[[14,'2 settimane'],[30,'1 mese'],[60,'2 mesi'],[90,'3 mesi']],s.max_days_ahead)+'</div>'+
  '<div class="field"><label for="x-cn">Disdetta online fino a</label>'+sel('x-cn',[[60,'1 ora prima'],[240,'4 ore prima'],[1440,'1 giorno prima'],[2880,'2 giorni prima']],s.cancel_notice_min)+'</div></div>'+
  '<label class="check"><input type="checkbox" id="x-o"'+(s.booking_open?' checked':'')+'> Prenotazioni online aperte</label>'+
  '<div style="margin-top:16px"><button type="button" class="btn" id="saveshop">Salva</button></div>';
 $('saveshop').onclick=async()=>{const g=id=>$('setbox').querySelector('#'+id).value;
  try{await call('shop.save',{name:g('x-n'),phone:g('x-t')||null,address:g('x-a')||null,city:g('x-c')||null,welcome:g('x-w')||null,slug:g('x-s').trim().toLowerCase(),step_min:Number(g('x-st')),min_notice_min:Number(g('x-mn')),max_days_ahead:Number(g('x-md')),cancel_notice_min:Number(g('x-cn')),booking_open:$('setbox').querySelector('#x-o').checked});
   toast('Salvato');await reload();}catch(e){toast(e.message,true);}};
}
boot();
})();
