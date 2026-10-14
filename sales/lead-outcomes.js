'use strict';
(()=>{
 const $=id=>document.getElementById(id),stages={contacted:'Contatto manuale',replied:'Risposta ricevuta',meeting:'Incontro fissato',won:'Conversione confermata',lost:'Non interessato'};
 let prospects=[],events=[];
 const current=()=>Number($('outcome-prospect').value);
 const approved=i=>Boolean(window.radixLeadWorkflow?.approvalFor(i));
 const el=(tag,value)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=String(value);return n};
 const status=s=>{$('outcome-status').textContent=s};
 function render(){
  const count=window.RadixLeadOutcomes.summarize(events);
  for(const key of ['contacted','replied','meeting','won'])$('outcome-'+key).textContent=String(count[key]);
  $('outcome-export').disabled=!events.length;
  const box=$('outcome-history');box.replaceChildren();
  const rows=events.filter(e=>e.index===current()).slice(-10).reverse();
  if(!rows.length)box.append(el('p','Nessun esito registrato per questo prospect.'));
  for(const e of rows){const p=el('p');p.append(el('strong',stages[e.stage]+' · '),el('time',new Date(e.at).toLocaleString('it-IT')));box.append(p)}
 }
 function refresh(items){
  prospects=Array.isArray(items)?items.slice(0,250):[];events=[];
  const select=$('outcome-prospect');select.replaceChildren();
  prospects.forEach((p,i)=>{const option=el('option',p.name||p.domain||'Prospect '+(i+1));option.value=String(i);select.append(option)});
  if(!prospects.length)select.append(el('option','Qualifica prima una lista'));
  select.disabled=!prospects.length;$('outcome-record').disabled=!prospects.length;
  render();status('Solo esiti dichiarati dall’operatore, non verificati automaticamente. Nessun invio email.');
 }
 function record(){
  const index=current(),p=prospects[index],stage=$('outcome-stage').value;
  if(!p||!approved(index)){status('Prima approva il prospect nella sezione Revisione.');return}
  if(!Object.hasOwn(stages,stage)){status('Esito non valido.');return}
  if(!window.confirm('Confermi che '+stages[stage]+' è realmente avvenuto per '+(p.name||p.domain)+'? Nessuna comunicazione sarà inviata.'))return;
  if(events.filter(e=>e.index===index).length>=50){status('Limite 50 eventi per prospect. Esporta lo storico prima di proseguire.');return}
  events.push({index,stage,at:new Date().toISOString()});render();status('Esito manuale registrato solo in questa sessione. Esporta prima di chiudere.');
 }
 function csvCell(v){let s=String(v??'').replace(/[\r\n\t]/g,' ').slice(0,500);if(/^\s*[=+\-@\uFEFF]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
 function exportCsv(){
  if(!events.length)return;
  const data=[['azienda','esito_dichiarato','data_utc','verifica'],...events.map(e=>[prospects[e.index]?.name||prospects[e.index]?.domain||'',e.stage,e.at,'manuale_non_verificato'])];
  const value='\uFEFF'+data.map(r=>r.map(csvCell).join(';')).join('\r\n')+'\r\n';
  const url=URL.createObjectURL(new Blob([value],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');
  link.href=url;link.download='RADIX_esiti_manuali.csv';document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
  status('Esiti esportati. Nessun invio o tracciamento automatico.');
 }
 window.addEventListener('radix:lead-reviewed',e=>refresh(e.detail?.prospects));
 window.addEventListener('radix:lead-approval-changed',e=>{
  if(e.detail?.approved===false){events=events.filter(row=>row.index!==Number(e.detail.index));render();status('Approvazione revocata: cancellati gli esiti locali del prospect.')}
 });
 $('outcome-prospect').addEventListener('change',render);
 $('outcome-record').addEventListener('click',record);
 $('outcome-export').addEventListener('click',exportCsv);
 refresh([]);
})();
