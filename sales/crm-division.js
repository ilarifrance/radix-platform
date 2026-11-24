'use strict';
/* «Dipartimento» in the page header: one filter for the whole CRM (Panoramica, Oggi, Contatti, Aziende,
   Opportunità, Lead, Attività, Interazioni, Assistenza, Calendario, Analisi) and for the Pipeline page.
   Options come from the aziende and contatti loaded (crm-data.js announces every read with the
   «radix-crm-data» event; the Pipeline page hands its rows to source()). The choice is kept per workspace in
   localStorage; on change the page re-renders through RadixSalesApp.render() (or, elsewhere, listens to the
   «radix-division» event). Rules in crm-division-core.js. The select stays hidden while nothing has a department. */
(()=>{
const C=()=>window.RadixCrmDivisionCore;
const ws=document.getElementById('workspace');if(!ws)return;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const workspace=()=>typeof ws.value==='string'&&UUID.test(ws.value)?ws.value:null;
const E=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);return n};
// The control: static in radix-sales.html (<div><label for="division">…<select id="division">), built here on a page without it.
let sel=document.getElementById('division'),box;
if(!sel){sel=E('select');sel.id='division';const lab=E('label','Dipartimento');lab.htmlFor='division';const host=ws.parentElement;
 if(host&&host.tagName==='DIV'&&host.children.length===2&&host.querySelector('label[for="workspace"]')){box=E('div');box.append(lab,sel);host.after(box)}
 else{ws.after(lab,sel);box=null;sel.dataset.label='1'}}
else box=sel.parentElement&&sel.parentElement.tagName==='DIV'&&sel.parentElement.children.length===2?sel.parentElement:null;
const label=box?null:document.querySelector('label[for="division"]');
const show=on=>{if(box)box.hidden=!on;else{sel.hidden=!on;if(label)label.hidden=!on}};
show(false);
let source=null,sourceWs=null,value='',valueWs=null;
const load=w=>{try{return localStorage.getItem(C().key(w))||''}catch{return ''}};
const save=(w,v)=>{try{if(v)localStorage.setItem(C().key(w),v);else localStorage.removeItem(C().key(w))}catch{}};
// The remembered choice of the current workspace (a string of at most 120 characters, as the lists accept).
function current(){const w=workspace();if(!w)return '';if(valueWs!==w){valueWs=w;const v=load(w);value=typeof v==='string'&&v.length<=120?v:''}return value}
function draw(){const w=workspace(),v=current();const d=w&&sourceWs===w&&source?source:null;const core=C();if(!core)return;
 const opts=d?core.options(d.companies,d.contacts):[],none=d?core.hasNone(d.companies,d.contacts):false;
 sel.replaceChildren();const add=(val,t)=>{const o=E('option',t);o.value=val;sel.append(o)};add('','Tutti');
 for(const o of opts)add(o.value,o.value+' ('+o.count+')');
 if(v&&v!==core.NONE&&!opts.some(o=>core.fold(o.value)===core.fold(v)))add(v,v+' (0)');
 if(none||v===core.NONE)add(core.NONE,'Senza dipartimento');
 sel.value=v;if(sel.value!==v){sel.value='';value='';save(w,'')}
 show(!!(opts.length||v))}
// Aziende and contatti to take the options from: the shared loader's dataset (unfiltered) or the Pipeline page's rows.
function setSource(data){const w=workspace();if(!w||!data)return;source={companies:data.companies||[],contacts:data.contacts||[]};sourceWs=w;draw()}
document.addEventListener('radix-crm-data',e=>setSource(e.detail));
ws.addEventListener('change',()=>{if(sourceWs!==workspace())source=null;draw()});
sel.addEventListener('change',()=>{const w=workspace();if(!w)return;value=sel.value;valueWs=w;save(w,value);draw();
 document.dispatchEvent(new CustomEvent('radix-division',{detail:{workspace:w,division:value}}));
 window.RadixSalesApp?.render?.()});
// The filtered copy of the loader's dataset, computed once per (dataset, choice): the dataset itself is never changed.
let memo={raw:null,div:null,out:null};
const apply=data=>{const core=C(),v=current();if(!core||!data||!v)return data;if(memo.raw!==data||memo.div!==v)memo={raw:data,div:v,out:core.filterData(data,v)};return memo.out};
const rows=(kind,list,data)=>{const core=C();return core?core.filterRows(kind,list,data,current()):list};
window.RadixCrmDivision={current,apply,rows,source:setSource,options:()=>[...sel.options].map(o=>o.value),refresh:draw};
if(window.RadixCrmData?.raw)setSource(window.RadixCrmData.raw());else draw();
})();
