/* CRM sequence in three proposals: what the follow-up is for, how long it lasts and which channels to use, then the
   CRM manager agent proposes three sequences of steps (day, email / call / task, what to do). The chosen one joins
   the «Sequenze automatiche» list (crm-campaigns.js box.addSequence) and «Avvia sulla selezione del segmento» works
   as for the built-in ones. Pure helpers run in Node for the tests. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else{root.RadixCrmSequenceIdeas=api;if(root.document)api.start()}})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const GOALS=[['Primo contatto','portare un contatto nuovo a una prima conversazione'],['Dopo un preventivo','arrivare a una risposta su un preventivo già inviato'],['Riattivare','riprendere chi non sentiamo da tempo'],['Dopo un evento','seguire chi abbiamo conosciuto a un evento o webinar']];
const SPANS=[['1 settimana',7],['2 settimane',14],['1 mese',30]];
const KINDS=[['email','Email'],['call','Telefonata'],['task','Attività']];
function prompt(a){const g=GOALS.find(x=>x[0]===a.goal)||GOALS[0],span=(SPANS.find(x=>x[0]===a.span)||SPANS[1])[1];
 const kinds=(a.kinds&&a.kinds.length?a.kinds:['email','call']).filter(k=>KINDS.some(x=>x[0]===k));
 return 'Proponi TRE sequenze di follow-up commerciale diverse. Scopo: '+g[1]+'. Durata massima: '+span+' giorni. '+
  'Canali ammessi: '+kinds.map(k=>KINDS.find(x=>x[0]===k)[1].toLowerCase()).join(', ')+'.'+(a.detail?' Contesto (unico fatto disponibile): '+String(a.detail).slice(0,600)+'.':'')+
  ' Ogni sequenza: 2-6 passi, giorno dal via (0-'+span+', crescente), canale, cosa fare in una frase con verbo iniziale. Le tre devono differire per ritmo e numero di tocchi. Non inventare numeri o clienti.\n'+
  'Rispondi SOLO con questo JSON: {"sequences":[{"name":"2-4 parole","why":"una frase","steps":[{"day":0,"kind":"'+kinds.join('|')+'","title":"…"}]}]}'}
const str=(v,n)=>String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,n);
// Clean sequences: allowed channels only, days within the span and increasing, 2-6 steps, unique ids.
function parse(text,opts){const o=opts||{},span=o.span||60,kinds=new Set(o.kinds&&o.kinds.length?o.kinds:KINDS.map(k=>k[0]));
 const m=/\{[\s\S]*\}/.exec(String(text||''));if(!m)return [];let d;try{d=JSON.parse(m[0])}catch(e){return []}
 const stamp=o.stamp||Date.now().toString(36);
 return (Array.isArray(d.sequences)?d.sequences:[]).slice(0,3).map((s,i)=>{let last=-1;
  const steps=(Array.isArray(s&&s.steps)?s.steps:[]).map(x=>({day:Math.round(Number(x&&x.day)),kind:String(x&&x.kind),title:str(x&&x.title,120)}))
   .filter(x=>Number.isFinite(x.day)&&x.day>=0&&x.day<=span&&kinds.has(x.kind)&&x.title).filter(x=>x.day>=last&&(last=x.day,true)).slice(0,6);
  return {id:'su-misura-'+stamp+'-'+(i+1),name:str(s&&s.name,40)||'Su misura '+(i+1),why:str(s&&s.why,240),steps}}).filter(s=>s.steps.length>=2)}

function start(){
 const doc=root.document,E=(t,x,c)=>{const n=doc.createElement(t);if(x!=null)n.textContent=x;if(c)n.className=c;return n};
 const KIND=Object.fromEntries(KINDS);
 function attach(box){if(box.dataset.ideas||typeof box.addSequence!=='function')return;box.dataset.ideas='1';
  const open=E('button','✦ 3 proposte guidate','crm-ideas-open');open.type='button';
  const panel=E('div',null,'crm-ideas');panel.hidden=true;
  const radios=(name,list)=>{const fs=E('fieldset');fs.append(E('legend',name));list.forEach(([label],i)=>{const l=E('label',null,'crm-ideas-chip'),r=E('input');r.type='radio';r.name='crm-seq-'+name;r.value=label;r.checked=i===(name==='Durata'?1:0);l.append(r,doc.createTextNode(' '+label));fs.append(l)});return fs};
  const ch=E('fieldset');ch.append(E('legend','Canali'));KINDS.forEach(([k,label])=>{const l=E('label',null,'crm-ideas-chip'),c=E('input');c.type='checkbox';c.value=k;c.checked=k!=='task';l.append(c,doc.createTextNode(' '+label));ch.append(l)});
  const dl=E('label','Un dettaglio da usare (offerta, evento, preventivo) · facoltativo'),detail=E('input');detail.maxLength=600;dl.append(detail);
  const go=E('button','Proponi 3 sequenze','primary');go.type='button';const state=E('p','','muted');state.setAttribute('role','status');const cards=E('div',null,'crm-ideas-cards');
  panel.append(radios('Scopo',GOALS),radios('Durata',SPANS),ch,dl,go,state,cards);
  const row=box.querySelector('.actions');row.insertBefore(open,row.firstChild);box.insertBefore(panel,row);
  open.onclick=()=>{panel.hidden=!panel.hidden};
  go.onclick=async()=>{const val=n=>(panel.querySelector('input[name="crm-seq-'+n+'"]:checked')||{}).value,kinds=[...ch.querySelectorAll('input:checked')].map(c=>c.value);
   if(!kinds.length){state.textContent='Scegli almeno un canale.';return}
   const a={goal:val('Scopo'),span:val('Durata'),kinds,detail:detail.value.trim()},span=(SPANS.find(x=>x[0]===a.span)||SPANS[1])[1];
   if(!root.confirm('Chiedere tre sequenze all’AI? La chiamata consuma crediti API.'))return;go.disabled=true;cards.replaceChildren();state.textContent='L’AI prepara tre sequenze…';
   try{const r=await root.fetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({role:'comm-crm-manager',messages:[{role:'user',content:prompt(a)}]})});
    const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'errore '+r.status);const list=parse(d.reply,{span,kinds});if(!list.length)throw Error('risposta senza sequenze leggibili, riprova');
    list.forEach(s=>{const c=E('article',null,'crm-ideas-card'),ol=E('ol',null,'crm-seq-steps');
     s.steps.forEach(x=>ol.append(E('li','Giorno '+x.day+' · '+KIND[x.kind]+': '+x.title)));
     const use=E('button','Usa questa');use.type='button';
     use.onclick=()=>{box.addSequence(s);cards.querySelectorAll('.crm-ideas-card').forEach(x=>x.dataset.chosen=String(x===c));use.disabled=true;state.textContent='«'+s.name+'» è nell’elenco delle sequenze: scegli il segmento e premi «Avvia sulla selezione del segmento».'};
     c.append(E('strong',s.name),E('p',s.why,'crm-ideas-body'),ol,use);cards.append(c)});state.textContent='Scegli la sequenza migliore.'}
   catch(err){state.textContent='Proposte non disponibili: '+err.message}finally{go.disabled=false}};
 }
 const scan=()=>doc.querySelectorAll('.crm-sequence').forEach(attach);scan();
 new MutationObserver(scan).observe(doc.body,{childList:true,subtree:true})}
return Object.freeze({GOALS,SPANS,KINDS,prompt,parse,start});
});
