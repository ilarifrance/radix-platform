'use strict';
(()=>{
 const KEY='radix.lead.icp.v1',MAX=12,$=id=>document.getElementById(id),fields=['country','industry','size','role'];
 const say=s=>{$('icp-profile-status').textContent=s};
 const name=s=>String(s||'').normalize('NFKC').trim();
 function read(){
  const raw=window.localStorage.getItem(KEY);if(raw===null)return [];
  if(raw.length>16000)throw Error('Archivio troppo grande');
  const rows=JSON.parse(raw);
  if(!Array.isArray(rows)||rows.length>MAX||!rows.every(p=>p&&typeof p.name==='string'&&p.name.length>=2&&p.name.length<=60&&p.name===name(p.name)&&p.values&&fields.every(f=>typeof p.values[f]==='string'&&p.values[f].length<=400)))throw Error('Archivio ICP non valido');
  if(new Set(rows.map(p=>p.name.toLocaleLowerCase('it'))).size!==rows.length)throw Error('Nomi duplicati');
  return rows;
 }
 function write(rows){if(rows.length)window.localStorage.setItem(KEY,JSON.stringify(rows));else window.localStorage.removeItem(KEY)}
 function refresh(selected=''){
  const sel=$('icp-profile-select');sel.replaceChildren();
  const blank=document.createElement('option');blank.value='';blank.textContent='Seleziona profilo';sel.append(blank);
  for(const p of read()){const o=document.createElement('option');o.value=p.name;o.textContent=p.name;sel.append(o)}
  sel.value=selected;$('icp-profile-load').disabled=!selected;$('icp-profile-delete').disabled=!selected;
 }
 function save(){
  try{
   const n=name($('icp-profile-name').value);if(n.length<2||n.length>60)throw Error('Nome: 2–60 caratteri');
   const values={};for(const f of fields){values[f]=$(f).value.trim();if(values[f].length>400)throw Error('Criterio troppo lungo')}
   if(!fields.some(f=>values[f]))throw Error('Almeno un criterio richiesto');
   const rows=read(),idx=rows.findIndex(p=>p.name.toLocaleLowerCase('it')===n.toLocaleLowerCase('it'));
   if(idx>=0&&!window.confirm('Sostituire il profilo ICP esistente?'))return;
   if(idx<0&&rows.length>=MAX)throw Error('Limite di 12 profili');
   const actual=idx>=0?rows[idx].name:n;if(idx>=0)rows[idx]={name:actual,values};else rows.push({name:actual,values});
   write(rows);refresh(actual);say('Profilo salvato in questo browser. Nessun dato prospect memorizzato.');
  }catch(e){say('Salvataggio non riuscito: '+e.message)}
 }
 function load(){
  try{
   const p=read().find(p=>p.name===$('icp-profile-select').value);if(!p)throw Error('Seleziona un profilo');
   for(const f of fields)$(f).value=p.values[f];$('icp-profile-name').value=p.name;
   $('country').dispatchEvent(new Event('input',{bubbles:true}));
   say('ICP caricato. Ricalcola lo score: le approvazioni precedenti sono invalidate.');
  }catch(e){say('Caricamento non riuscito: '+e.message)}
 }
 function remove(){
  try{
   const n=$('icp-profile-select').value,rows=read();if(!rows.some(p=>p.name===n))throw Error('Seleziona un profilo');
   if(!window.confirm('Eliminare questo profilo dal browser?'))return;
   write(rows.filter(p=>p.name!==n));refresh();say('Profilo eliminato dal browser.');
  }catch(e){say('Eliminazione non riuscita: '+e.message)}
 }
 $('icp-profile-save').addEventListener('click',save);
 $('icp-profile-load').addEventListener('click',load);
 $('icp-profile-delete').addEventListener('click',remove);
 $('icp-profile-select').addEventListener('change',()=>{const yes=!!$('icp-profile-select').value;$('icp-profile-load').disabled=!yes;$('icp-profile-delete').disabled=!yes});
 try{refresh();say('Caricamento manuale: i profili sono solo sul dispositivo.')}catch(e){say('Archivio ICP non disponibile: '+e.message)}
})();