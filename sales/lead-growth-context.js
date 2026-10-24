'use strict';
(()=>{
 const params=new URLSearchParams(location.search),id=params.get('growth_project'),ws=params.get('growth_workspace');
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
 const backupInput=document.getElementById('lead-growth-import-file');
 if(backupInput)backupInput.onchange=async()=>{
  const status=document.getElementById('lead-growth-import-status');
  try{
   const f=backupInput.files?.[0];if(!f||f.size>150000||!f.name.toLowerCase().endsWith('.json'))throw Error('Scegli un backup RADIX JSON valido (max 150 KB)');
   const data=JSON.parse(await f.text());
   if(data?.format!=='radix-growth-project'||data.version!==1||!data.payload?.icp)throw Error('File progetto non riconosciuto');
   const i=data.payload.icp,values={country:i.geos,industry:i.industries,size:i.companySize,role:i.titles};
   if(Object.values(values).some(v=>typeof v!=='string'||v.length>500))throw Error('Criteri ICP non validi');
   if(!window.confirm('Applicare l’ICP del progetto '+String(data.title||'')+' ai campi correnti?'))return;
   for(const [key,value] of Object.entries(values)){const input=document.getElementById(key);if(!input)throw Error('Campo ICP non trovato: '+key);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))}
   window.radixLeadGrowthProject={title:String(data.title||''),payload:data.payload};window.dispatchEvent(new CustomEvent('radix:lead-growth-project'));
   status.textContent='ICP importato dal backup del progetto. Ricalcola lo score per aggiornare i risultati.';
  }catch(e){status.textContent='Importazione ICP non riuscita: '+e.message}
 };
 if(!id&&!ws)return;
 const $=id=>document.getElementById(id),panel=$('lead-growth-context');if(!panel)return;panel.hidden=false;
 const say=s=>$('lead-growth-context-status').textContent=s;
 if(!UUID.test(id||'')||!UUID.test(ws||'')){say('Parametri progetto non validi. Apri il progetto dal suo archivio.');return}
 const suffix='?project='+encodeURIComponent(id)+'&workspace='+encodeURIComponent(ws);
 $('lead-growth-edit').href='/sales-growth-projects.html'+suffix;
 $('lead-growth-campaigns').href='/sales-growth-campaigns.html'+suffix;
 (async()=>{
  try{
   const url='/api/sales?'+new URLSearchParams({entity:'lead_growth_projects',workspace:ws,id});
   const r=await fetch(url,{credentials:'same-origin',cache:'no-store'}),body=await r.json();
   if(!r.ok)throw Error(body.error||'Archivio non disponibile');
   const project=body.rows?.[0];if(!project?.payload?.icp)throw Error('Progetto non trovato');
   $('lead-growth-project-title').textContent=project.title;
   // The Newsletter tab offers the project's facts (company, offer, references) as a starting point.
   window.radixLeadGrowthProject=project;window.dispatchEvent(new CustomEvent('radix:lead-growth-project'));
   $('lead-growth-project-caption').textContent=(project.payload.company?.name||'Azienda non definita')+' · '+(project.payload.state==='ready'?'progetto pronto':'bozza');
   say('Contesto caricato. L’ICP non viene modificato automaticamente.');
   $('lead-growth-apply-icp').onclick=()=>{
    try{
     const fields={country:project.payload.icp.geos,industry:project.payload.icp.industries,size:project.payload.icp.companySize,role:project.payload.icp.titles};
     if(!window.confirm('Sostituire i criteri ICP attuali con quelli del progetto '+project.title+'?'))return;
     for(const [k,v] of Object.entries(fields)){const input=$(k);if(!input)throw Error('Campo ICP '+k+' non trovato');input.value=v||'';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))}
     say('ICP del progetto applicato. Ricalcola lo score e verifica manualmente i prospect.');
     const step=$('lead-icp');if(step)step.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){say('Impossibile applicare ICP: '+e.message)}
   };
  }catch(e){say('Progetto non caricato: '+e.message)}
 })();
})();
