'use strict';
(()=>{
 const $=id=>document.getElementById(id),UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 const labels=['Azienda','ICP','Offerta','Canali','LinkedIn','Calendari','Revisione'];
 const shape={company:['name','website','industry','description'],icp:['geos','titles','industries','companySize'],offer:['core','differentiators','proof'],sending:['domains','mailboxes','provider'],linkedin:['profileUrl'],calendars:['bookingUrl','demoUrl']};
 const fresh=()=>({version:1,...Object.fromEntries(Object.entries(shape).map(([k,fields])=>[k,Object.fromEntries(fields.map(f=>[f,'']))])),campaigns:[],state:'draft'});
 let model=fresh(),step=0,record={id:'',version:0,workspace:'',dirty:false},busy=false;
 const say=(id,msg)=>{$(id).textContent=msg};
 const selectedWorkspace=()=>{const v=$('growth-workspace').value;if(!UUID.test(v))throw Error('Seleziona un workspace RADIX valido');return v};
 const title=()=>{const v=$('growth-title').value.trim();if(v.length<2||v.length>120)throw Error('Nome progetto: da 2 a 120 caratteri');return v};
 const option=(value,label)=>{const n=document.createElement('option');n.value=value;n.textContent=label;return n};
 const collect=()=>{
  for(const el of document.querySelectorAll('[data-field]')){const [section,key]=el.dataset.field.split('.');model[section][key]=el.value.trim()}
  return model;
 };
 const fill=()=>{
  document.querySelectorAll('[data-field]').forEach(el=>{const [section,key]=el.dataset.field.split('.');el.value=model[section][key]||''});
  $('growth-approved').checked=model.state==='ready';
 };
 function changed(){collect();model.state='draft';$('growth-approved').checked=false;record.dirty=true;renderMeta();}
 function progress(){
  const fields=[model.company.name,model.company.website,model.company.industry,model.icp.titles,model.icp.industries,model.icp.geos,model.offer.core,model.offer.differentiators,model.sending.domains,model.linkedin.profileUrl,model.calendars.bookingUrl];
  return Math.round(fields.filter(Boolean).length/fields.length*100);
 }
 function actions(){
  const params=record.id&&record.workspace?'?growth_project='+encodeURIComponent(record.id)+'&growth_workspace='+encodeURIComponent(record.workspace):'';
  $('growth-go-leads').href='/lead-intelligence.html'+params;
  $('growth-go-campaigns').href='/sales-growth-campaigns.html'+(record.id&&record.workspace?'?project='+encodeURIComponent(record.id)+'&workspace='+encodeURIComponent(record.workspace):'');
  $('growth-open-linkedin').href='/sales-linkedin.html'+(record.id&&record.workspace?'?project='+encodeURIComponent(record.id)+'&workspace='+encodeURIComponent(record.workspace):'');
 }
 function renderMeta(){
  const score=progress();say('growth-score',score+'%');$('growth-progress-bar').style.width=score+'%';
  say('growth-current-state',model.state==='ready'?'Pronto':'Bozza');
  say('growth-campaign-count',String(model.campaigns.length));
  say('growth-version',record.version?'v'+record.version:'Non salvato');
  say('save-indicator',record.dirty?'MODIFICHE NON SALVATE':record.version?'SALVATO IN WORKSPACE':'BOZZA LOCALE');
  actions();
 }
 const card=(heading,entries)=>{
  const outer=document.createElement('div');outer.className='review-card';
  const title=document.createElement('h4');title.textContent=heading;outer.append(title);
  const dl=document.createElement('dl');
  for(const [k,v] of entries){const dt=document.createElement('dt');dt.textContent=k;const dd=document.createElement('dd');dd.textContent=v||'Non indicato';dl.append(dt,dd)}
  outer.append(dl);return outer;
 };
 function review(){
  collect();const groups=[
   ['Azienda',[['Nome',model.company.name],['Sito',model.company.website],['Settore',model.company.industry],['Descrizione',model.company.description]]],
   ['ICP',[['Aree',model.icp.geos],['Ruoli',model.icp.titles],['Settori',model.icp.industries],['Dimensioni',model.icp.companySize]]],
   ['Offerta',[['Proposta',model.offer.core],['Differenziazione',model.offer.differentiators],['Referenze',model.offer.proof]]],
   ['Canali (opzionali)',[['Domini',model.sending.domains],['Caselle',model.sending.mailboxes],['Provider',model.sending.provider]]],
   ['LinkedIn',[['Profilo',model.linkedin.profileUrl]]],
   ['Calendari',[['Prenotazione',model.calendars.bookingUrl],['Demo',model.calendars.demoUrl]]]
  ];const dest=$('growth-review');dest.replaceChildren();for(const [title,rows] of groups)dest.append(card(title,rows));
 }
 function changeStep(to){
  if(to<0||to>6)return;collect();step=to;
  document.querySelectorAll('[data-step-panel]').forEach(p=>{p.hidden=Number(p.dataset.stepPanel)!==step});
  document.querySelectorAll('[data-step]').forEach(b=>{
   b.classList.toggle('active',Number(b.dataset.step)===step);
   b.classList.toggle('done',Number(b.dataset.step)<step);
   if(Number(b.dataset.step)===step)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current')
  });
  say('growth-step-name',labels[step]);say('growth-progress',String(step+1)+' / 7');
  $('growth-back').disabled=step===0;
  $('growth-next').textContent=step===6?'Vai ad Acquisizione →':'Continua →';
  if(step===6)review();
 }
 const request=async(url,options={})=>{
  const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...options}),data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(data.error||'Errore archivio: '+res.status);
  return data;
 };
 const getRows=async(entity,ws,id)=>{const q=new URLSearchParams({entity,workspace:ws});if(id)q.set('id',id);const res=await request('/api/sales?'+q);return res.rows||[]};
 const post=async(ws,action,data)=>{const res=await request('/api/sales',{method:'POST',headers:{'Content-Type':'application/json','x-radix-sales':'1'},body:JSON.stringify({workspace:ws,entity:'lead_growth_projects',action,data})});return res.rows?.[0]};
 async function listProjects(chosen=''){
  const ws=selectedWorkspace(),items=await getRows('lead_growth_projects',ws);
  const sel=$('growth-existing');sel.replaceChildren();sel.append(option('','Nuovo progetto'));
  for(const item of items)sel.append(option(item.id,item.title+' · '+(item.state==='ready'?'pronto':'bozza')+' · '+item.campaign_count+' campagne'));
  sel.value=chosen;
  say('growth-archive-status',items.length+' progetti nel workspace. Seleziona un progetto oppure crea una nuova bozza.');
 }
 async function load(id,ws){
  if(!UUID.test(id))throw Error('Seleziona un progetto valido');
  if(record.dirty&&!window.confirm('Aprire il progetto? Le modifiche non salvate verranno perse.'))return;
  const rows=await getRows('lead_growth_projects',ws,id),row=rows[0];
  if(!row?.payload)throw Error('Progetto non trovato');
  model=validate(row.payload);$('growth-title').value=row.title;
  record={id:row.id,version:row.version,workspace:ws,dirty:false};
  fill();changeStep(0);renderMeta();$('growth-existing').value=id;
  say('growth-archive-status','Progetto caricato dal workspace · versione '+row.version+'.');
 }
 function validate(p){
  if(!p||p.version!==1||typeof p!=='object'||!Array.isArray(p.campaigns)||p.campaigns.length>30||!['draft','ready'].includes(p.state))throw Error('Formato progetto incompatibile');
  const next=fresh();
  for(const [section,fields] of Object.entries(shape)){
   if(!p[section]||typeof p[section]!=='object')throw Error('Sezione '+section+' mancante');
   for(const f of fields){if(typeof p[section][f]!=='string'||p[section][f].length>1800)throw Error('Campo '+section+'.'+f+' non valido');next[section][f]=p[section][f]}
  }
  next.campaigns=p.campaigns.map(x=>({...x}));next.state=p.state;return next;
 }
 function verifyUrls(){
  for(const [value,name] of [[model.company.website,'Sito'],[model.linkedin.profileUrl,'LinkedIn'],[model.calendars.bookingUrl,'Calendario'],[model.calendars.demoUrl,'Video']]){
   if(!value)continue;const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)throw Error(name+': usa un URL HTTPS valido');
  }
 }
 async function save(){
  if(busy)return;busy=true;$('growth-save').disabled=true;
  try{
   const ws=selectedWorkspace(),name=title();collect();verifyUrls();
   if(record.id&&record.workspace!==ws)throw Error('Workspace cambiato: crea un nuovo progetto');
   if($('growth-approved').checked){
    if(!model.company.name||!(model.icp.titles||model.icp.industries)||!model.offer.core)throw Error('Per approvare servono azienda, target ICP e offerta principale');
    model.state='ready';
   }else model.state='draft';
   if(!window.confirm('Salvare il progetto nel workspace Preview RADIX? I dati commerciali saranno accessibili agli utenti autorizzati del workspace.'))return;
   const action=record.id?'update':'create',data={title:name,payload:model,...(record.id?{id:record.id,version:record.version}:{})};
   const row=await post(ws,action,data);if(!row?.id)throw Error('Archivio: risposta incompleta');
   record={id:row.id,version:row.version,workspace:ws,dirty:false};renderMeta();
   await listProjects(row.id);
   say('growth-archive-status','Progetto salvato nel workspace · versione '+row.version+'. Acquisizione e campagne ora possono collegarsi al progetto.');
  }catch(e){record.dirty=true;renderMeta();say('growth-archive-status','Salvataggio non riuscito: '+e.message+'. Puoi esportare il progetto in JSON.')}
  finally{busy=false;$('growth-save').disabled=false}
 }
 function reset(){
  if(record.dirty&&!window.confirm('Creare un nuovo progetto? Le modifiche non salvate andranno perse.'))return;
  model=fresh();record={id:'',version:0,workspace:'',dirty:false};$('growth-title').value='';$('growth-existing').value='';
  fill();changeStep(0);renderMeta();say('growth-archive-status','Nuova bozza. Nessun dato è stato eliminato dal server.');
 }
 async function connect(){
  try{
   const res=await request('/api/sales?entity=lead_workspaces');const rows=res.rows||[],select=$('growth-workspace');
   select.replaceChildren();select.append(option('','Seleziona workspace RADIX'));
   for(const w of rows)select.append(option(w.id,w.name+' · '+w.role));
   const params=new URLSearchParams(location.search),ws=params.get('workspace'),id=params.get('project');
   if(ws&&rows.some(r=>r.id===ws))select.value=ws;else if(rows.length===1)select.value=rows[0].id;
   if(select.value){try{await listProjects()}catch(e){say('growth-archive-status',e.message)}}
   if(ws&&id&&UUID.test(id)&&select.value===ws)await load(id,ws);
  }catch(e){say('growth-archive-status','Archivio non connesso: '+e.message+'. Compila la bozza e usa Esporta JSON.')}
 }
 const saveFile=(name,data)=>{
  const blob=new Blob([data],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)
 };
 document.querySelectorAll('[data-field]').forEach(el=>el.addEventListener('input',changed));
 $('growth-title').addEventListener('input',()=>{record.dirty=true;renderMeta()});
 document.querySelectorAll('[data-step]').forEach(btn=>btn.addEventListener('click',()=>changeStep(Number(btn.dataset.step))));
 $('growth-back').onclick=()=>changeStep(step-1);
 $('growth-next').onclick=()=>{if(step===6){const link=$('growth-go-leads').href;if(!record.id){say('growth-archive-status','Per associare l’acquisizione al progetto salvalo prima nel workspace; altrimenti esportalo in JSON.');return}location.assign(link)}else changeStep(step+1)};
 $('growth-approved').addEventListener('change',()=>{model.state='draft';record.dirty=true;renderMeta()});
 $('growth-new').onclick=reset;
 $('growth-list').onclick=async()=>{try{await listProjects(record.workspace===selectedWorkspace()?record.id:'')}catch(e){say('growth-archive-status',e.message)}};
 $('growth-load').onclick=async()=>{try{await load($('growth-existing').value,selectedWorkspace())}catch(e){say('growth-archive-status',e.message)}};
 $('growth-workspace').addEventListener('change',async()=>{try{await listProjects()}catch(e){say('growth-archive-status',e.message)}});
 $('growth-save').onclick=save;
 $('growth-delete').onclick=async()=>{
  try{const ws=selectedWorkspace();if(!record.id||record.workspace!==ws)throw Error('Apri prima il progetto da eliminare');
   if(!window.confirm('Eliminare definitivamente questo progetto e la sua configurazione delle campagne dal workspace?'))return;
   await post(ws,'delete',{id:record.id,version:record.version});
   model=fresh();record={id:'',version:0,workspace:'',dirty:false};$('growth-title').value='';fill();changeStep(0);renderMeta();await listProjects();
   say('growth-archive-status','Progetto eliminato dal workspace.');
  }catch(e){say('growth-archive-status','Eliminazione non riuscita: '+e.message)}
 };
 $('growth-export').onclick=()=>{try{collect();const name=title(),p={format:'radix-growth-project',version:1,title:name,payload:model};saveFile('radix-progetto-commerciale.json',JSON.stringify(p,null,2));say('growth-file-status','Backup JSON scaricato. Conserva il file in un luogo sicuro.')}catch(e){say('growth-file-status',e.message)}};
 $('growth-import').onchange=async()=>{
  try{const f=$('growth-import').files?.[0];if(!f)throw Error('Seleziona un file');
   if(f.size>150000||!f.name.toLowerCase().endsWith('.json'))throw Error('File JSON non valido o troppo grande');
   const p=JSON.parse(await f.text());if(p.format!=='radix-growth-project'||p.version!==1||typeof p.title!=='string'||p.title.length>120)throw Error('Backup RADIX non riconosciuto');
   const imported=validate(p.payload);if(record.dirty&&!window.confirm('Importare il backup? Le modifiche locali non salvate saranno perse.'))return;
   model=imported;record={id:'',version:0,workspace:'',dirty:true};$('growth-title').value=p.title;fill();changeStep(0);renderMeta();
   say('growth-file-status','Backup importato come nuova bozza locale. Salvalo nel workspace quando pronto.');
  }catch(e){say('growth-file-status','Importazione non riuscita: '+e.message)}
 };
 window.addEventListener('beforeunload',e=>{if(record.dirty){e.preventDefault();e.returnValue=''}});
 fill();changeStep(0);renderMeta();connect();
})();
