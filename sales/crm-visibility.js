'use strict';
/* «Visibilità dei record» (hooked by sales/crm-tools.js on the Membri section): the switch «I member vedono solo i propri record»
   for owners and admins, and the note «Vedi solo i tuoi record» in the CRM header for members and viewers when it is on.
   The meaning is sales/crm-visibility-core.js; the server enforces it (api/_sales_visibility.js): this page only shows and saves
   the «__visibilita__» row of sales_segments, read once per workspace. */
(function(root){
const V=root.RadixCrmVisibility;if(!V)return;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const app=()=>root.RadixSalesApp;
const post=(entity,action,data)=>app().api(entity,{body:{workspace:app().state.workspace,entity,action,data}});
const canEdit=()=>['owner','admin'].includes(app().role());
let shared=null;
// The «__visibilita__» row, read once per workspace. → {row,settings,loaded,error}; a failed read is not kept.
function load(fresh){
 const a=app(),ws=a&&a.state.workspace;if(!ws)return Promise.resolve(null);
 if(!fresh&&shared&&shared.ws===ws)return shared.promise;
 const entry={ws,value:null};
 entry.promise=(async()=>{const out={row:null,settings:V.DEFAULTS,loaded:false,error:''};
  try{const d=await a.api('segments',{subject:'visibility'});out.row=(d.rows||[])[0]||null;out.settings=V.settings(out.row);out.loaded=true}
  catch(e){out.error=e.message||String(e)}
  entry.value=out;if(!out.loaded&&shared===entry)shared=null;
  if(shared===entry)note();
  return out})();
 shared=entry;return entry.promise;
}
// Header note for members and viewers while the switch is on.
function note(){
 const head=document.querySelector('body>header');if(!head)return;
 let n=head.querySelector('.crm-vis-note');
 const ws=app()?.state.workspace,v=shared&&shared.ws===ws&&shared.value;
 const on=!!v&&V.limits(v.row,app().role());
 if(!on){if(n)n.hidden=true;return}
 if(!n){n=E('span',V.NOTE,'crm-vis-note');n.title='Il workspace mostra a member e viewer solo i record propri o collegati ai propri: lo decide un owner o un admin in «Membri».';(head.querySelector('.badge')||head.firstElementChild).after(n)}
 n.hidden=false;
}
function panel(){
 const box=E('details',undefined,'crm-vis-settings');box.append(E('summary','Visibilità dei record'));
 const body=E('div',undefined,'crm-vis-body');box.append(body);
 let st=null;
 const draw=()=>{body.replaceChildren();if(!st){body.append(E('p','Caricamento dell’impostazione…','muted'));return}
  body.append(E('p','Con l’opzione attiva member e viewer vedono, cercano, esportano e contano solo i propri record; il Copilota AI riceve solo quelli. Owner e admin vedono sempre tutto. Pipeline, fasi, segmenti, prodotti e listini restano condivisi.','muted'));
  const ul=E('ul',undefined,'crm-vis-rule');for(const r of V.RULE)ul.append(E('li',r));body.append(ul);
  if(st.error)body.append(E('p','Impostazione non leggibile: '+st.error,'notice'));
  const lab=E('label',undefined,'crm-vis-switch'),cb=E('input');cb.type='checkbox';cb.checked=st.settings.ownOnly===true;cb.disabled=!st.loaded;
  lab.append(cb,document.createTextNode(' I member vedono solo i propri record'));body.append(lab);
  const acts=E('div',undefined,'actions');acts.append(B('Salva visibilità',()=>save(cb.checked),'primary'));if(st.loaded)body.append(acts);
 };
 async function save(on){
  const a=app();if(a.state.busy||!st||!st.loaded)return;
  if(on!==(st.settings.ownOnly===true)&&!window.confirm(on?'Da ora member e viewer vedranno solo i propri record (trattative, attività, ticket, contatti e aziende collegati). Continuare?':'Da ora member e viewer vedranno di nuovo tutti i record del workspace. Continuare?'))return;
  a.lock(true);a.error('');a.notice('Salvo la visibilità dei record…');
  try{const row=st.row;
   if(row&&!on)await post('segments','delete',{id:row.id,version:row.version});
   else if(row)await post('segments','update',{id:row.id,version:row.version,filters:{visibility:{ownOnly:true}}});
   else if(on)await post('segments','create',{name:V.RESERVED,filters:{visibility:{ownOnly:true}}});
   a.notice(on?'Visibilità salvata: member e viewer vedono solo i propri record.':'Visibilità salvata: tutti vedono tutti i record.')}
  catch(e){a.error(e.message||String(e));a.notice('Visibilità non salvata.')}
  finally{a.lock(false)}
  st=await load(true);draw();
 }
 draw();load().then(r=>{st=r||{row:null,settings:V.DEFAULTS,loaded:false,error:'workspace non scelto.'};draw()});
 return box;
}
// Membri section: the panel for owners and admins (before the member list); the header note follows every render.
function section(sec){
 load().then(()=>note());note();
 if(!canEdit())return;
 const head=sec.querySelector(':scope>.row');const p=panel();if(head)head.after(p);else sec.prepend(p);
}
Object.assign(V,{load,note,section});
})(typeof globalThis!=='undefined'?globalThis:this);
