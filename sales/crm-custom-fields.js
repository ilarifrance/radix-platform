'use strict';
/* «Aggiungi campo» on Aziende and Contatti (migration sales 015). A field is created once for the whole
   workspace, from any record: name + value. The definitions come from /api/sales?entity=custom_fields;
   each record keeps its values in «custom» = { field id: text }. Used by the editor (sales.js), the
   «Dettagli» block (crm-record.js), the list views (crm-list.js) and CSV import/export (crm-tools.js). */
(function(root){
// «Budget 2026», «budget-2026 », «Bùdget 2026» are the same name.
const key=s=>String(s??'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('it').replace(/[^\p{L}\p{N}]+/gu,'');
function distance(a,b){if(a===b)return 0;const m=a.length,n=b.length;if(!m||!n)return m||n;let prev=Array.from({length:n+1},(_,j)=>j);
 for(let i=1;i<=m;i++){const cur=[i];for(let j=1;j<=n;j++)cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=cur}return prev[n]}
/* The existing field a new name points to: {field, exact}. Near names («Budget» / «Budjet», «Budget 2026» /
   «Budget») are proposed, never merged silently. */
function match(defs,entity,label){
 const k=key(label);if(!k)return null;const mine=(defs||[]).filter(d=>d.entity===entity);
 const same=mine.find(d=>key(d.label)===k);if(same)return {field:same,exact:true};
 const near=mine.find(d=>{const o=key(d.label);return (o.length>=4&&k.length>=4&&(o.includes(k)||k.includes(o)))||distance(o,k)<=(Math.min(o.length,k.length)>=6?2:1)});
 return near?{field:near,exact:false}:null}
const of=(defs,entity)=>(defs||[]).filter(d=>d.entity===entity).sort((a,b)=>a.position-b.position||String(a.id).localeCompare(String(b.id)));
// Values of the form ({id: text}) merged over the stored ones; null when nothing changed.
function merge(stored,form){
 const before=stored&&typeof stored==='object'?stored:{};const out={...before};
 for(const [id,v] of Object.entries(form||{})){const t=String(v??'').trim();if(t)out[id]=t;else delete out[id]}
 const a=JSON.stringify(Object.keys(before).sort().map(k=>[k,before[k]])),b=JSON.stringify(Object.keys(out).sort().map(k=>[k,out[k]]));
 return a===b?null:out}
// CSV: a header equal to a field name (same key) fills that field.
function columnsFor(defs,entity,headers){const out={};for(const d of of(defs,entity)){const h=(headers||[]).find(x=>key(x)===key(d.label));if(h)out[d.id]=h}return out}
const core={key,distance,match,of,merge,columnsFor};
if(typeof module==='object'&&module.exports){module.exports=core;return}

/* ---------- browser ---------- */
const app=()=>root.RadixSalesApp;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
let cache=null,cacheWs=null,loading=null;
async function load(force){
 const ws=app()?.state.workspace;if(!ws)return [];
 if(!force&&cache&&cacheWs===ws)return cache;
 if(!force&&loading)return loading;
 loading=app().api('custom_fields').then(r=>{cache=(r&&r.rows)||[];cacheWs=ws;return cache}).catch(()=>{cache=[];cacheWs=ws;return cache}).finally(()=>{loading=null});
 return loading}
const defs=()=>cacheWs===app()?.state.workspace?cache||[]:[];
async function create(entity,label){
 const ws=app().state.workspace;
 const r=await app().api('custom_fields',{body:{workspace:ws,entity:'custom_fields',action:'create',data:{entity,label}}});
 const f=r.rows?.[0];if(f){cache=[...defs(),f];cacheWs=ws;root.dispatchEvent?.(new CustomEvent('radix-custom-fields'))}return f}
function input(f,value){
 const wrap=E('div');const l=E('label',f.label);const i=E('input');i.type='text';i.maxLength=500;i.name='custom:'+f.id;i.value=value||'';l.append(i);wrap.append(l);wrap.dataset.customField=f.id;return wrap}
/* Editor section «Campi aggiunti»: one input per field of the workspace, then «Aggiungi campo». */
function section(entity,row,host){
 const box=E('details',undefined,'rf-sec rf-custom');box.dataset.section='custom';box.open=true;
 const sum=E('summary');sum.append(E('span','Campi aggiunti'));box.append(sum);
 const grid=E('div',undefined,'rf-grid');box.append(grid);
 const note=E('p','Caricamento…','muted rf-custom-note');box.append(note);
 const values=row?.custom||{};
 const add=E('div',undefined,'rf-custom-add');
 const open=E('button','+ Aggiungi campo','rf-copy');open.type='button';
 const form=E('div',undefined,'rf-grid');form.hidden=true;
 const name=E('input');name.type='text';name.maxLength=60;name.placeholder='Es. Budget 2026';
 const val=E('input');val.type='text';val.maxLength=500;val.placeholder='Es. 50.000 €';
 const ln=E('label','Nome del campo');ln.append(name);const lv=E('label','Cosa scrivere');lv.append(val);
 const ok=E('button','Aggiungi');ok.type='button';const no=E('button','Annulla');no.type='button';
 const acts=E('div',undefined,'actions');acts.append(ok,no);
 const msg=E('small',undefined,'rf-hint');
 const w1=E('div');w1.append(ln);const w2=E('div');w2.append(lv);form.append(w1,w2,acts,msg);
 add.append(open,form);box.append(add);host.append(box);
 const draw=()=>{const list=of(defs(),entity);note.textContent=list.length?'':'Nessun campo aggiunto: usa «Aggiungi campo» per crearne uno, poi lo trovi su tutte le schede.';
  for(const f of list)if(!grid.querySelector('[data-custom-field="'+f.id+'"]'))grid.append(input(f,values[f.id]))};
 const reset=()=>{name.value='';val.value='';msg.textContent='';form.hidden=true;open.hidden=false};
 open.addEventListener('click',()=>{form.hidden=false;open.hidden=true;name.focus()});
 no.addEventListener('click',reset);
 // Enter inside the small form adds the field instead of saving the whole record.
 for(const i of [name,val])i.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();ok.click()}});
 ok.addEventListener('click',async()=>{
  const label=name.value.trim().replace(/\s+/g,' ');if(!label){msg.textContent='Scrivi il nome del campo.';name.focus();return}
  let f=null;const m=match(defs(),entity,label);
  if(m&&(m.exact||root.confirm('Esiste già il campo «'+m.field.label+'». Vuoi usare quello invece di crearne uno nuovo?')))f=m.field;
  if(!f){ok.disabled=true;msg.textContent='Creazione del campo…';
   try{f=await create(entity,label)}catch(e){msg.textContent=e.message||'Campo non creato.';ok.disabled=false;return}
   ok.disabled=false}
  draw();const i=grid.querySelector('input[name="custom:'+f.id+'"]');if(i&&val.value.trim())i.value=val.value.trim();
  reset();i?.focus();
 });
 load().then(draw);
}
// The «custom» value of a submitted form, or null when unchanged (nothing to send).
function collect(formEl,row){const form={};for(const [k,v] of new FormData(formEl))if(k.startsWith('custom:'))form[k.slice(7)]=v;return Object.keys(form).length?merge(row?.custom,form):null}
// «Dettagli» group for Customer360.
function group(entity,row){const items=of(defs(),entity).filter(f=>row?.custom?.[f.id]).map(f=>({key:'custom:'+f.id,label:f.label,text:row.custom[f.id],type:'text',ref:null}));return items.length?{id:'custom',label:'Campi aggiunti',items}:null}
root.RadixCrmCustom={...core,load,defs,section,collect,group,create};
})(typeof globalThis!=='undefined'?globalThis:this);
