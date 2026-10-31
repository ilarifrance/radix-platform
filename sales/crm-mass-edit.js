'use strict';
/* «Modifica in blocco» button for the bulk bar of the Aziende and Contatti lists (sales/crm-list.js).
   One field, one value, a preview of how many records change, one confirmation, then one update per record
   through the same API as the edit form. A record changed meanwhile by someone else is skipped and reported. */
(function(){
const M=()=>window.RadixCrmMassEditCore,app=()=>window.RadixSalesApp;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
let busy=false,stop=false;

function choices(fd){
 if(fd.type==='select'||fd.type==='choice')return fd.options;
 if(fd.type==='member')return app().rows('members').map(m=>[String(m.id),app().title(m)]);
 return null;
}
function suggestions(key){return [...new Set([...app().rows('companies'),...app().rows('contacts')].map(r=>String(r?.[key]??'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it'))}

// Panel shown under the bulk bar. kind: 'companies'|'contacts'; ids(): the selected ids; done(): redraw.
function panel(kind,ids,opts){
 const box=E('div',undefined,'lv-mass');box.setAttribute('role','region');box.setAttribute('aria-label','Modifica in blocco');
 const fields=M().fieldsFor(kind,{added:opts&&opts.added});
 const fieldSel=E('select');fieldSel.setAttribute('aria-label','Campo da modificare');
 for(const fd of fields){const o=E('option',fd.label);o.value=fd.key;fieldSel.append(o)}
 const valWrap=E('span',undefined,'lv-mass-value');
 const out=E('p',undefined,'lv-mass-out');out.setAttribute('aria-live','polite');
 const apply=B('Applica',run,'primary');apply.disabled=true;
 const halt=B('Ferma',()=>{stop=true;out.textContent='Mi fermo dopo il record in corso…'},'lv-ghost');halt.hidden=true;
 let input=null,current=null;
 function drawValue(){
  const fd=fields.find(f=>f.key===fieldSel.value);if(!fd)return;
  const list=choices(fd);
  if(list){input=E('select');input.append(Object.assign(E('option','(vuoto: cancella il valore)'),{value:''}));for(const [v,l] of list){const o=E('option',l);o.value=v;input.append(o)}}
  else{input=E('input');input.type='text';input.maxLength=fd.max||200;input.placeholder='Nuovo valore (vuoto: cancella)';
   const s=suggestions(fd.key);if(s.length){const dl=E('datalist');dl.id='lv-mass-dl-'+kind;for(const v of s){const o=E('option');o.value=v;dl.append(o)}input.setAttribute('list',dl.id);valWrap.replaceChildren(input,dl)}}
  input.setAttribute('aria-label','Nuovo valore per '+fd.label);
  if(!input.isConnected)valWrap.replaceChildren(input);
  input.addEventListener(list?'change':'input',preview);preview();
 }
 function rowsSelected(){const s=new Set(ids());return app().rows(kind).filter(r=>s.has(r.id))}
 function preview(){
  if(busy)return;current=M().plan(kind,fieldSel.value,input.value,rowsSelected());
  if(current.error){out.textContent=current.error;apply.disabled=true;return}
  const n=current.changes.length;
  out.textContent=n?n+(n===1?' record cambia':' record cambiano')+(current.unchanged?', '+current.unchanged+' hanno già questo valore.':'.'):'Tutti i record selezionati hanno già questo valore.';
  apply.textContent=n?'Applica a '+n:'Applica';apply.disabled=!n||!app().writable(kind);
 }
 async function run(){
  if(busy||!current||current.error||!current.changes.length)return;
  const shown=input.tagName==='SELECT'?input.selectedOptions[0]?.textContent:'';
  if(!confirm(M().confirmText(current,kind,shown)))return;
  busy=true;stop=false;apply.disabled=true;fieldSel.disabled=true;input.disabled=true;halt.hidden=false;app().lock?.(true);
  const p=current,failed=[];let ok=0;
  try{
   for(const c of p.changes){
    if(stop)break;
    out.textContent='Aggiorno '+(ok+failed.length+1)+' di '+p.changes.length+'…';
    try{await app().api(kind,{body:{workspace:app().state.workspace,entity:kind,action:'update',data:M().payload(p,c)}});ok++}
    catch(e){failed.push(c.name+': '+(e&&e.message||'errore'))}
   }
  }finally{
   busy=false;halt.hidden=true;fieldSel.disabled=false;input.disabled=false;app().lock?.(false);
   const left=p.changes.length-ok-failed.length;
   const msg='Modifica in blocco di «'+p.label+'»: '+ok+' '+(ok===1?'record aggiornato':'record aggiornati')+(failed.length?', '+failed.length+' non aggiornati ('+failed.slice(0,5).join('; ')+(failed.length>5?'; …':'')+'). Un record cambiato nel frattempo da qualcun altro va riprovato.':'.')+(left?' Fermata: '+left+' non toccati.':'');
   out.textContent=msg;
   // The refresh redraws the lists (this panel included), so the outcome goes in the page notice after it.
   try{await app().refresh(false)}catch{}
   (failed.length?app().error:app().notice)(msg);
   opts&&opts.done&&opts.done();
  }
 }
 fieldSel.addEventListener('change',drawValue);
 box.append(E('strong','Modifica in blocco'),fieldSel,valWrap,apply,halt,B('Chiudi',()=>{if(!busy)box.hidden=true},'lv-ghost'),out);
 drawValue();box.refresh=preview;
 return box;
}
window.RadixCrmMassEdit=Object.freeze({panel});
})();
