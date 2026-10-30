/* CRM campaign email in three proposals: what the email is for, the tone and one detail, then the Email Outreach
   agent writes three versions and one click puts the chosen one in the campaign's subject and text.
   It sits next to the campaign panel (sales/crm-campaigns.js) without changing it: the panel's fields stay the
   source of truth and «Prepara gli invii» works as before. Pure helpers run in Node for the tests. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else{root.RadixCrmEmailIdeas=api;if(root.document)api.start()}})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const GOALS=[['Primo contatto','presentarsi a chi non ci conosce e aprire una conversazione'],['Proporre un incontro','ottenere una call o un incontro di 20 minuti'],['Presentare un’offerta','presentare un’offerta concreta e chiedere se interessa'],['Riattivare chi è fermo','riprendere i contatti con chi non sentiamo da tempo'],['Invitare a un evento','invitare a un evento o a un webinar']];
const TONES=[['Diretto','diretto e concreto'],['Cordiale','cordiale e caldo'],['Formale','formale e sobrio']];
const PLACEHOLDERS=['{nome}','{nome_completo}','{azienda}','{ruolo}'];
function prompt(a){const g=GOALS.find(x=>x[0]===a.goal)||GOALS[0],t=TONES.find(x=>x[0]===a.tone)||TONES[0];
 return 'Scrivi TRE versioni diverse di una email per una campagna CRM. Scopo: '+g[1]+'. Tono: '+t[1]+'.'+(a.detail?' Dettaglio da usare (unico fatto disponibile, non inventarne altri): '+String(a.detail).slice(0,600)+'.':' Non citare numeri, clienti o risultati: non ne abbiamo forniti.')+
  ' Usa i segnaposto {nome} e {azienda}; massimo 120 parole di corpo; una sola richiesta finale. Le tre versioni devono differire per apertura e angolo.\n'+
  'Rispondi SOLO con questo JSON: {"emails":[{"angle":"2-4 parole","subject":"…","body":"…"}]}'}
// The three versions from the reply: JSON first, else the agent's own «Oggetto: / Corpo:» blocks.
function parse(text){const s=String(text||''),clip=(v,n)=>String(v||'').trim().slice(0,n);let out=[];
 const m=/\{[\s\S]*\}/.exec(s);if(m){try{const d=JSON.parse(m[0]);out=(Array.isArray(d.emails)?d.emails:[]).map(e=>({angle:clip(e&&e.angle,60),subject:clip(e&&e.subject,200).replace(/\s+/g,' '),body:clip(e&&e.body,4000)}))}catch(e){}}
 // (Subject / Body / Version: the same blocks when the reply is in English.)
 if(!out.length)out=s.split(/^\s*\**(?:Oggetto|Subject)\**\s*:/mi).slice(1).map(b=>{const [subj,...rest]=b.split('\n');const body=rest.join('\n').replace(/^\s*\**(?:Corpo|Body)\**\s*:\s*/i,'').replace(/\n+(?:#+|\**(?:Versione|Version))[^\n]*\s*$/i,'');return {angle:'',subject:clip(String(subj).replace(/\*+/g,''),200),body:clip(body,4000)}});
 return out.filter(e=>e.subject&&e.body).slice(0,3)}
// Placeholders the CRM does not know would be sent as they are: report them.
function unknownPlaceholders(text){return [...new Set(String(text||'').match(/\{[a-z_]+\}/gi)||[])].filter(p=>!PLACEHOLDERS.includes(p.toLowerCase()))}

// ---- browser ----
function start(){
 const doc=root.document;
 const E=(t,x,c)=>{const n=doc.createElement(t);if(x!=null)n.textContent=x;if(c)n.className=c;return n};
 function attach(box){if(box.dataset.ideas)return;const [subject,body]=[box.querySelector('input'),box.querySelector('textarea')];if(!subject||!body)return;box.dataset.ideas='1';
  const open=E('button','✦ 3 proposte guidate','crm-ideas-open');open.type='button';
  const panel=E('div',null,'crm-ideas');panel.hidden=true;
  const pick=(name,list)=>{const fs=E('fieldset'),lg=E('legend',name);fs.append(lg);list.forEach(([label],i)=>{const l=E('label',null,'crm-ideas-chip'),r=E('input');r.type='radio';r.name='crm-ideas-'+name;r.value=label;r.checked=i===0;l.append(r,doc.createTextNode(' '+label));fs.append(l)});return fs};
  const goal=pick('Scopo',GOALS),tone=pick('Tono',TONES),dl=E('label','Un dettaglio da usare (offerta, evento, novità) · facoltativo'),detail=E('input');detail.maxLength=600;dl.append(detail);
  const go=E('button','Scrivi 3 versioni','primary');go.type='button';const state=E('p','','muted');state.setAttribute('role','status');const cards=E('div',null,'crm-ideas-cards');
  panel.append(goal,tone,dl,go,state,cards);
  const row=box.querySelector('.actions');(row||box).insertBefore(open,row?row.firstChild:null);box.insertBefore(panel,row||null);
  open.onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden)detail.focus()};
  go.onclick=async()=>{const val=n=>(panel.querySelector('input[name="crm-ideas-'+n+'"]:checked')||{}).value;
   if(!root.confirm('Chiedere tre versioni all’AI? La chiamata consuma crediti API.'))return;go.disabled=true;cards.replaceChildren();state.textContent='L’AI scrive tre versioni…';
   try{const r=await root.fetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({role:'comm-email-outreach',messages:[{role:'user',content:prompt({goal:val('Scopo'),tone:val('Tono'),detail:detail.value.trim()})}]})});
    const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'errore '+r.status);const list=parse(d.reply);if(!list.length)throw Error('risposta senza versioni leggibili, riprova');
    list.forEach((e,i)=>{const c=E('article',null,'crm-ideas-card'),h=E('strong',e.angle||'Versione '+(i+1)),s=E('p',e.subject,'crm-ideas-subject'),b=E('p',e.body,'crm-ideas-body'),use=E('button','Usa questa');use.type='button';
     const bad=unknownPlaceholders(e.subject+' '+e.body);if(bad.length)c.append(E('p','Segnaposto da sistemare: '+bad.join(', '),'crm-ideas-warn'));
     use.onclick=()=>{subject.value=e.subject;body.value=e.body;[subject,body].forEach(x=>x.dispatchEvent(new Event('input',{bubbles:true})));cards.querySelectorAll('.crm-ideas-card').forEach(x=>x.dataset.chosen=String(x===c));state.textContent='Versione inserita in oggetto e testo: correggila se serve, poi «Prepara gli invii».'};
     c.prepend(h);c.append(s,b,use);cards.append(c)});state.textContent='Scegli la versione migliore.'}
   catch(err){state.textContent='Proposte non disponibili: '+err.message}finally{go.disabled=false}};
 }
 const scan=()=>doc.querySelectorAll('.crm-campaign').forEach(attach);scan();
 new MutationObserver(scan).observe(doc.body,{childList:true,subtree:true})}
return Object.freeze({GOALS,TONES,prompt,parse,unknownPlaceholders,start});
});
