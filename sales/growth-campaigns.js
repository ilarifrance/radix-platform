'use strict';
(()=>{
 const $=id=>document.getElementById(id),UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 const memo={get(){try{return localStorage.getItem('radix.workspace')||''}catch{return ''}},set(v){try{if(v)localStorage.setItem('radix.workspace',v)}catch{}}};
 let project=null,record=null,selected='',busy=false,dirty=false,localOnly=false,localTitle='';
 const say=(id,m)=>{$(id).textContent=m};
 const opt=(id,label)=>{const x=document.createElement('option');x.value=id;x.textContent=label;return x};
 const ws=()=>{const id=$('campaign-workspace').value;if(!UUID.test(id))throw Error('Seleziona un workspace');return id};
 const request=async(url,options={})=>{
  const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
  const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||'Archivio HTTP '+res.status);return data.rows||[];
 };
 const list=async()=>{
  const rows=await request('/api/sales?'+new URLSearchParams({entity:'lead_growth_projects',workspace:ws()}));
  const target=$('campaign-project');target.replaceChildren();target.append(opt('','Seleziona progetto'));
  for(const r of rows)target.append(opt(r.id,r.title+' · '+(r.state==='ready'?'pronto':'bozza')));
  return rows;
 };
 const applyLinks=()=>{
  const active=record?.id&&record?.workspace;
  const params=active?'?project='+encodeURIComponent(record.id)+'&workspace='+encodeURIComponent(record.workspace):'';
  $('campaign-edit-project').href='/sales-growth-projects.html'+params;
  $('campaign-to-leads').href='/lead-intelligence.html'+(active?'?growth_project='+encodeURIComponent(record.id)+'&growth_workspace='+encodeURIComponent(record.workspace):'');
 };
 async function open(id){
  if(!UUID.test(id))throw Error('Seleziona un progetto salvato');
  if(dirty&&!window.confirm('Cambiare progetto? Le modifiche locali non salvate saranno perse.'))return;
  const w=ws(),rows=await request('/api/sales?'+new URLSearchParams({entity:'lead_growth_projects',workspace:w,id}));
  const result=rows[0];if(!result?.payload||!Array.isArray(result.payload.campaigns))throw Error('Progetto non disponibile');
  project=result.payload;record={id:result.id,version:result.version,workspace:w,title:result.title};localOnly=false;localTitle=result.title;selected='';dirty=false;
  clear();show();applyLinks();$('campaign-project').value=id;
  say('campaign-status','Progetto '+record.title+' · versione '+record.version+' · '+project.campaigns.length+' campagne.');
 }
 const badge=v=>({draft:'Bozza',ready:'Pronta per revisione',paused:'In pausa'})[v]||'Bozza';
 function show(){
  const campaigns=project?.campaigns||[];
  say('campaign-total',String(campaigns.length));
  say('campaign-ready',String(campaigns.filter(x=>x.stage==='ready').length));
  say('campaign-draft',String(campaigns.filter(x=>x.stage==='draft').length));
  say('campaign-credit-total',String(campaigns.reduce((sum,x)=>sum+Number(x.creditBudget||0),0)));
  $('campaign-progress').style.width=Math.min(100,campaigns.length/10*100)+'%';
  say('campaign-save-state',record?'PROGETTO v'+record.version:localOnly?'FILE LOCALE':'SELEZIONA PROGETTO');
  const dest=$('campaign-list');dest.replaceChildren();
  if(!campaigns.length){const empty=document.createElement('p');empty.className='helper';empty.textContent='Nessuna campagna nel progetto. Crea una nuova campagna per iniziare.';dest.append(empty)}
  for(const c of campaigns){
   const card=document.createElement('article');card.className='campaign-card';
   const main=document.createElement('div'),h=document.createElement('h3');h.textContent=c.title;
   const p=document.createElement('p');p.textContent=c.goal||'Nessun obiettivo indicato';
   const info=document.createElement('small');info.textContent='Segmento: '+(c.segment||'da definire');
   main.append(h,p,info);
   const button=document.createElement('button');button.type='button';button.className='ghost';button.textContent='Modifica';button.onclick=()=>edit(c.id);
   const meta=document.createElement('div');meta.className='campaign-meta';const b=document.createElement('span');b.className='campaign-status '+c.stage;b.textContent=badge(c.stage);
   const n=document.createElement('span');n.className='helper';n.textContent=c.channel+' · budget massimo '+c.creditBudget+' cr';
   meta.append(b,n);card.append(main,button,meta);dest.append(card);
  }
 }
 function clear(){
  selected='';
  $('campaign-editor-heading').textContent='Nuova campagna';
  for(const id of ['campaign-title','campaign-segment','campaign-goal','campaign-notes'])$(id).value='';
  $('campaign-channel').value='manual';$('campaign-stage').value='draft';$('campaign-budget').value='0';
  say('campaign-edit-status','Inizia la configurazione; nessun invio viene eseguito.');
 }
 function edit(id){
  const p=project?.campaigns.find(c=>c.id===id);if(!p)return;
  if(dirty&&!window.confirm('Sostituire le modifiche non salvate dell’editor?'))return;
  selected=id;
  for(const field of ['title','channel','stage','segment','goal','notes'])$('campaign-'+field).value=p[field]||'';
  $('campaign-budget').value=p.creditBudget;dirty=false;
  say('campaign-editor-heading','Modifica campagna');say('campaign-edit-status','Modifica la campagna esistente. Il salvataggio aggiornerà la versione del progetto.');
  $('campaign-editor').scrollIntoView({behavior:'smooth',block:'start'});
 }
 const parsed=()=>{
  const title=$('campaign-title').value.trim(),credit=Number($('campaign-budget').value);
  if(title.length<2||title.length>120)throw Error('Nome campagna: da 2 a 120 caratteri');
  if(!Number.isSafeInteger(credit)||credit<0||credit>1000000)throw Error('Budget massimo 1.000.000 crediti');
  const stage=$('campaign-stage').value;
  if(stage==='ready'&&(!project||project.state!=='ready'))throw Error('Approva prima il progetto nella pagina Progetti commerciali');
  const id=selected||crypto.randomUUID();
  return {id,title,channel:$('campaign-channel').value,stage,segment:$('campaign-segment').value.trim(),goal:$('campaign-goal').value.trim(),notes:$('campaign-notes').value.trim(),creditBudget:String(credit)};
 };
 async function update(next,verb){
  if(!project)throw Error('Apri prima un progetto o importa un backup');
  if(localOnly){
   if(!window.confirm(verb+' in questa bozza locale? Esporta poi il JSON per non perdere le modifiche.'))return;
   project.campaigns=next;selected='';clear();dirty=true;show();say('campaign-edit-status','Modifiche locali pronte. Premi Esporta progetto e campagne per conservarle.');return;
  }
  if(!record)throw Error('Apri prima un progetto salvato');
  if(busy)return;busy=true;$('campaign-save').disabled=true;
  try{
   const w=ws();if(w!==record.workspace)throw Error('Il workspace è cambiato. Ricarica il progetto.');
   if(!window.confirm(verb+' nel workspace RADIX? L’operazione non invia messaggi e non consuma crediti.'))return;
   const result=await request('/api/sales',{method:'POST',headers:{'Content-Type':'application/json','x-radix-sales':'1'},body:JSON.stringify({workspace:w,entity:'lead_growth_projects',action:'update',data:{id:record.id,version:record.version,title:record.title,payload:{...project,campaigns:next}}})});
   if(!result[0]?.version)throw Error('Risposta archivio incompleta');
   record.version=result[0].version;project.campaigns=next;dirty=false;selected='';clear();show();
   say('campaign-status',verb+' completato · progetto versione '+record.version+'.');
   say('campaign-edit-status','Campagna salvata. Nessun invio esterno eseguito.');
  }catch(e){say('campaign-edit-status','Non salvato: '+e.message+'. In caso di conflitto, ricarica il progetto e verifica le modifiche.')}
  finally{busy=false;$('campaign-save').disabled=false}
 }
 $('campaign-save').onclick=async()=>{
  try{
   const item=parsed(),next=(project?.campaigns||[]).slice(),index=next.findIndex(x=>x.id===item.id);
   if(index>=0)next[index]=item;else{if(next.length>=30)throw Error('Limite 30 campagne per progetto');next.push(item)}
   await update(next,index>=0?'Aggiornamento campagna':'Creazione campagna');
  }catch(e){say('campaign-edit-status',e.message)}
 };
 $('campaign-delete').onclick=async()=>{
  try{if(!selected)throw Error('Seleziona una campagna esistente da eliminare');
   await update(project.campaigns.filter(c=>c.id!==selected),'Eliminazione campagna');
  }catch(e){say('campaign-edit-status',e.message)}
 };
 $('campaign-new').onclick=()=>{if(dirty&&!window.confirm('Annullare le modifiche non salvate?'))return;dirty=false;clear();$('campaign-editor').scrollIntoView({behavior:'smooth'})};
 $('campaign-clear').onclick=()=>{if(dirty&&!window.confirm('Annullare le modifiche non salvate?'))return;dirty=false;clear()};
 document.querySelectorAll('#campaign-editor input,#campaign-editor select,#campaign-editor textarea').forEach(el=>el.addEventListener('input',()=>{dirty=true;say('campaign-edit-status','Modifiche locali non ancora salvate.');}));
 $('campaign-reload').onclick=async()=>{try{const current=record?.id;if(current)await open(current);else await list()}catch(e){say('campaign-status',e.message)}};
 $('campaign-project').onchange=async()=>{try{if($('campaign-project').value)await open($('campaign-project').value)}catch(e){say('campaign-status',e.message)}};
 $('campaign-workspace').onchange=async()=>{
  try{if(dirty&&!window.confirm('Cambiare workspace? Le modifiche non salvate saranno perse.'))return;
   memo.set($('campaign-workspace').value);project=null;record=null;localOnly=false;localTitle='';dirty=false;selected='';clear();show();applyLinks();await list();
  }catch(e){say('campaign-status',e.message)}
 };
 const safeImport=p=>{
  if(!p||p.format!=='radix-growth-project'||p.version!==1||typeof p.title!=='string'||!p.title.trim()||p.title.length>120)throw Error('Backup RADIX non valido');
  if(!p.payload||p.payload.version!==1||!Array.isArray(p.payload.campaigns)||p.payload.campaigns.length>30)throw Error('Schema progetto incompatibile');
  const allowed={company:['name','website','industry','description'],icp:['geos','titles','industries','companySize'],offer:['core','differentiators','proof'],sending:['domains','mailboxes','provider'],linkedin:['profileUrl'],calendars:['bookingUrl','demoUrl']};
  const model={version:1,state:p.payload.state==='ready'?'ready':'draft',campaigns:[]};
  for(const [k,fields] of Object.entries(allowed)){
   if(!p.payload[k]||typeof p.payload[k]!=='object')throw Error('Sezione '+k+' mancante');
   model[k]={};for(const f of fields){const v=p.payload[k][f];if(typeof v!=='string'||v.length>1800)throw Error('Campo non valido: '+k+'/'+f);model[k][f]=v}
  }
  const fields=['id','title','stage','channel','segment','goal','notes','creditBudget'];
  const ids=new Set();
  for(const c of p.payload.campaigns){
   const row={};for(const f of fields){if(typeof c[f]!=='string'||c[f].length>2000)throw Error('Campo campagna non valido');row[f]=c[f]}
   if(!UUID.test(row.id)||ids.has(row.id))throw Error('ID campagna duplicato o non valido');ids.add(row.id);
   if(!['draft','ready','paused'].includes(row.stage)||!['email','linkedin','manual','multichannel'].includes(row.channel))throw Error('Stato o canale non valido');
   model.campaigns.push(row);
  }
  return {title:p.title,payload:model};
 };
 $('campaign-import-file').onchange=async()=>{
  try{
   const file=$('campaign-import-file').files?.[0];if(!file)throw Error('Seleziona prima un backup');
   if(file.size>150000||!file.name.toLowerCase().endsWith('.json'))throw Error('File non valido o troppo grande');
   const p=safeImport(JSON.parse(await file.text()));
   if((dirty||project)&&!window.confirm('Aprire questo backup? Le modifiche non esportate potrebbero andare perse.'))return;
   project=p.payload;localTitle=p.title;record=null;localOnly=true;selected='';dirty=false;
   $('campaign-project').value='';clear();show();applyLinks();
   say('campaign-status','Backup '+localTitle+' aperto localmente: '+project.campaigns.length+' campagne. Esporta le modifiche dopo il salvataggio.');
  }catch(e){say('campaign-status','Impossibile aprire backup: '+e.message)}
 };
 $('campaign-export-file').onclick=()=>{
  try{
   if(!project)throw Error('Seleziona un progetto o importa un backup');
   const contents=JSON.stringify({format:'radix-growth-project',version:1,title:record?.title||localTitle,payload:project},null,2);
   const blob=new Blob([contents],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download='radix-progetto-con-campagne.json';document.body.append(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
   if(localOnly)dirty=false;
   say('campaign-status','Backup progetto e campagne esportato. Custodisci il file in modo sicuro.');
  }catch(e){say('campaign-status',e.message)}
 };
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
 async function connect(){
  try{
   const r=await request('/api/sales?entity=lead_workspaces'),sel=$('campaign-workspace');
   sel.replaceChildren();sel.append(opt('','Seleziona workspace'));
   for(const v of r)sel.append(opt(v.id,v.name+' · '+v.role));
   const params=new URLSearchParams(location.search),workspace=params.get('workspace'),p=params.get('project');
   const kept=memo.get();if(workspace&&r.some(x=>x.id===workspace))sel.value=workspace;else if(r.some(x=>x.id===kept))sel.value=kept;else if(r.length===1)sel.value=r[0].id;memo.set(sel.value);
   if(sel.value){const projects=await list();if(p&&UUID.test(p)&&projects.some(x=>x.id===p))await open(p)}
   say('campaign-status',record?'Progetto '+record.title+' aperto.':'Seleziona un progetto salvato per pianificare una campagna.');
  }catch(e){say('campaign-status','Connessione archivio non disponibile: '+e.message+'.')}
 }
 applyLinks();show();connect();
})();
