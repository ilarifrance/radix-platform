/* Client facts sheet by guided questions: who the client is, experience, verified numbers, tools, credentials, what
   never to say, and up to five real cases (client or sector, problem, what was done, measured result, quotable or
   not). The answers become the «Scheda fatti» and «Casi reali» texts the specialists and the fact check read, in a
   fixed format that the interview can read back to edit them. No AI: only what the person writes ends up there.
   Works on any page with #facts and #cases (new project, project workspace). Pure helpers run in Node for the tests. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else{root.RadixFactsInterview=api;if(root.document)root.document.readyState==='loading'?root.document.addEventListener('DOMContentLoaded',()=>api.start()):api.start()}})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const FIELDS=[
 ['who','Chi siamo','Chi è il cliente in una riga: ruolo, azienda, cosa fa','Es. Consulente commerciale B2B, titolare di Studio Rossi'],
 ['experience','Esperienza','Da quanto lo fa e dove','Es. 15 anni nel B2B, prima direttore commerciale in un gruppo industriale'],
 ['numbers','Numeri verificati','Solo numeri veri e dimostrabili, con il periodo','Es. +1 M€ di fatturato annuo da direttore commerciale (2015-2020)'],
 ['tools','Strumenti e metodi','Strumenti, metodi, servizi che usa davvero','Es. RADIX, metodo in 4 incontri, CRM HubSpot'],
 ['credentials','Certificazioni e riconoscimenti','Titoli, certificazioni, premi, pubblicazioni','Es. Certificazione GCP'],
 ['avoid','Da non dire mai','Parole, promesse, nomi o temi da evitare','Es. non citare ChatGPT; niente promesse di risultati garantiti']
];
const CASE_FIELDS=[['client','Cliente o settore'],['problem','Problema'],['action','Cosa abbiamo fatto'],['result','Risultato misurato']];
const MAX_CASES=5;
const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
// The two texts, in the format read back by parse().
function compose(a){const ans=a||{};
 const facts=FIELDS.map(([k,label])=>clean(ans[k])?label+': '+clean(ans[k]):'').filter(Boolean);
 if(clean(ans.other))facts.push('Altro: '+clean(ans.other));
 const cases=(Array.isArray(ans.cases)?ans.cases:[]).filter(c=>c&&CASE_FIELDS.some(([k])=>clean(c[k]))).slice(0,MAX_CASES).map((c,i)=>
  'Caso '+(i+1)+' — '+(clean(c.client)||'cliente non indicato')+' ('+(c.quotable?'nome citabile':'nome non citabile')+')'+
  CASE_FIELDS.slice(1).map(([k,label])=>clean(c[k])?'\n  '+label+': '+clean(c[k]):'').join('')+
  (clean(c.result)?'':'\n  Risultato misurato: [da fornire]'));
 return {facts:facts.join('\n').slice(0,4000),cases:cases.join('\n').slice(0,4000)}}
// Back from the texts to the answers; lines that are not in the format go to «Altro» so nothing is lost.
function parse(factsText,casesText){const out={cases:[]},other=[];
 String(factsText||'').split(/\n+/).map(s=>s.trim()).filter(Boolean).forEach(line=>{const f=FIELDS.find(([,label])=>line.toLowerCase().startsWith(label.toLowerCase()+':'));
  if(f)out[f[0]]=line.slice(f[1].length+1).trim();else other.push(line.replace(/^Altro:\s*/,''))});
 if(other.length)out.other=other.join(' ');
 let cur=null;String(casesText||'').split(/\n/).forEach(raw=>{const line=raw.trim();if(!line)return;
  const head=/^Caso \d+\s*—\s*(.*?)(?:\s*\((nome citabile|nome non citabile)\))?$/.exec(line);
  if(head){cur={client:head[1]==='cliente non indicato'?'':head[1],quotable:head[2]==='nome citabile'};out.cases.push(cur);return}
  const f=CASE_FIELDS.slice(1).find(([,label])=>line.startsWith(label+':'));
  if(f&&cur){const v=line.slice(f[1].length+1).trim();cur[f[0]]=v==='[da fornire]'?'':v;return}
  // Free text written before the interview: kept as one case to edit.
  if(!cur||!f){cur={client:'',problem:line,quotable:false};out.cases.push(cur)}});
 out.cases=out.cases.slice(0,MAX_CASES);return out}

function start(){
 const doc=root.document,facts=doc.getElementById('facts'),cases=doc.getElementById('cases');if(!facts||!cases||facts.dataset.interview)return;facts.dataset.interview='1';
 const E=(t,x,c)=>{const n=doc.createElement(t);if(x!=null)n.textContent=x;if(c)n.className=c;return n};
 const open=E('button','✎ Compila con domande guidate','fi-open');open.type='button';
 const dlg=E('dialog',null,'fi-dialog');dlg.setAttribute('aria-label','Scheda fatti con domande guidate');
 const form=E('form');form.method='dialog';dlg.append(form);
 const head=E('div',null,'fi-head');const close=E('button','Chiudi');close.type='button';close.onclick=()=>dlg.close();head.append(E('h2','Scheda fatti del cliente'),close);
 form.append(head,E('p','Scrivi solo fatti veri: gli specialisti useranno questi e il controllo automatico toglie tutto il resto. Lascia vuoto quello che non sai.','fi-note'));
 const inputs={};FIELDS.forEach(([k,label,help,ph])=>{const l=E('label',null,'fi-field'),t=E('textarea');t.rows=2;t.maxLength=600;t.placeholder=ph;inputs[k]=t;l.append(E('b',label),E('small',help),t);form.append(l)});
 const other=E('textarea');other.rows=2;other.maxLength=800;const ol=E('label',null,'fi-field');ol.append(E('b','Altro'),E('small','Fatti che non stanno sopra'),other);form.append(ol);
 form.append(E('h3','Casi reali'));const list=E('div',null,'fi-cases');form.append(list);
 const add=E('button','＋ Aggiungi un caso');add.type='button';
 function caseBox(c){const box=E('fieldset',null,'fi-case');box.append(E('legend','Caso'));
  CASE_FIELDS.forEach(([k,label])=>{const l=E('label',null,'fi-field'),i=E('input');i.dataset.k=k;i.maxLength=400;i.value=(c&&c[k])||'';if(k==='result')i.placeholder='Con il numero esatto, o lascia vuoto';l.append(E('b',label),i);box.append(l)});
  const q=E('label',null,'fi-check'),cb=E('input');cb.type='checkbox';cb.dataset.k='quotable';cb.checked=!!(c&&c.quotable);q.append(cb,doc.createTextNode(' Il nome del cliente si può citare'));
  const rm=E('button','Togli questo caso');rm.type='button';rm.onclick=()=>{box.remove();add.disabled=false};box.append(q,rm);list.append(box);add.disabled=list.children.length>=MAX_CASES}
 add.onclick=()=>caseBox();form.append(add);
 const ok=E('button','Inserisci nella scheda','primary');ok.type='button';const st=E('p','','fi-note');st.setAttribute('role','status');form.append(E('div',null,'fi-actions'));form.lastChild.append(ok,st);
 open.onclick=()=>{const a=parse(facts.value,cases.value);FIELDS.forEach(([k])=>{inputs[k].value=a[k]||''});other.value=a.other||'';list.replaceChildren();(a.cases.length?a.cases:[{}]).forEach(caseBox);st.textContent='';dlg.showModal()};
 ok.onclick=()=>{const a={other:other.value,cases:[...list.querySelectorAll('.fi-case')].map(b=>{const c={};b.querySelectorAll('[data-k]').forEach(i=>{c[i.dataset.k]=i.type==='checkbox'?i.checked:i.value});return c})};
  FIELDS.forEach(([k])=>{a[k]=inputs[k].value});const t=compose(a);facts.value=t.facts;cases.value=t.cases;
  [facts,cases].forEach(x=>x.dispatchEvent(new Event('input',{bubbles:true})));
  const save=doc.getElementById('saveFacts');if(save)save.click();dlg.close();open.textContent='✎ Modifica con domande guidate'};
 facts.parentNode.insertBefore(open,facts);doc.body.append(dlg);
 if(facts.value.trim())open.textContent='✎ Modifica con domande guidate'}
return Object.freeze({FIELDS,CASE_FIELDS,compose,parse,start});
});
