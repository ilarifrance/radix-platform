'use strict';
/* «Suggerisci la prossima email» in the «Report campagne» (crm-campaign-report.js draws one block per selected
   campaign through RadixCrmCampaignNext.section). On click, after a confirmation, ONE /api/chat call on the same
   Copilota path as crm-follow-up.js and crm-linkedin-message.js (role crm-copilot, crmScope: the server adds the
   workspace snapshot). Prompt and parsing are pure in crm-campaign-next-core.js. The suggestions are cards:
   «Usa come bozza» fills subject and text of the campaign composer of the same panel (crm-campaigns.js, like
   «Usa questa» of crm-email-ideas.js), «Copia» copies. Nothing is sent or saved. */
(function(){
const N=window.RadixCrmCampaignNextCore;if(!N)return;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const app=()=>window.RadixSalesApp;
const n=v=>new Intl.NumberFormat('it-IT').format(v||0);
// «Suggerisci la prossima email»: one AI call on click, after a confirmation. Suggestions are kept per campaign key.
function section(c,rep,st,out,redraw){
 const box=E('div',undefined,'crm-crep-next');
 box.append(E('h6','Prossima email'));
 if(!st.next)st.next=new Map();
 const res=st.next.get(c.key)||null,status=E('p','','muted crm-crep-next-status');status.setAttribute('role','status');
 const go=B(res?'Rigenera i suggerimenti':'Suggerisci la prossima email',async()=>{
  const a=app();if(!a||a.state.busy)return;
  if(!window.confirm('Chiedere all’AI suggerimenti per la prossima email dopo «'+c.name+'»?\nUna chiamata AI, consuma crediti API. Usa solo i numeri di questo report (le aperture non sono misurate). Nulla viene inviato o salvato.'))return;
  const f=N.facts(c,rep.days);let got=null;
  a.lock(true);a.error('');a.notice('L’AI sta leggendo i risultati della campagna…');
  try{const r=await fetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({role:'crm-copilot',crmScope:{workspace:a.state.workspace},messages:[{role:'user',content:N.prompt(f)}]})});
   const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'AI non disponibile ('+r.status+').');
   got=N.parse(d.reply,f);if(!got)throw new Error('Risposta dell’AI senza suggerimenti leggibili: riprova.')}
  catch(e){a.error(e.message||String(e));return}finally{a.lock(false)}
  st.next.set(c.key,{...got,days:rep.days});a.notice('Suggerimenti pronti: sono proposte da rileggere, nulla è stato inviato.');
  redraw();out.querySelector('.crm-crep-next h6')?.focus()},'crm-crep-next-go');
 box.append(go);
 if(!res){box.append(E('p','Una chiamata AI legge invii, clic, link più cliccati, disiscrizioni e conversioni di questa campagna e propone tre spunti e tre email successive per segmento. Nulla viene inviato.','muted'));return box}
 box.querySelector('h6').tabIndex=-1;
 if(res.days!==rep.days)box.append(E('p','Suggerimenti calcolati con le conversioni entro '+res.days+' giorni.','muted'));
 if(res.insights.length){const ul=E('ul',undefined,'crm-crep-insights');for(const t of res.insights)ul.append(E('li',t));box.append(E('strong','Cosa dicono i numeri'),ul)}
 if(res.dropped)box.append(E('p',res.dropped+(res.dropped===1?' osservazione scartata: citava':' osservazioni scartate: citavano')+' numeri non presenti nel report o metriche non misurate.','muted'));
 // The composer of this same campaign panel (crm-campaigns.js): «Usa come bozza» fills its subject and text.
 const panel=out.closest('.crm-campaign'),subject=panel?.querySelector(':scope > label > input'),body=panel?.querySelector(':scope > label > textarea');
 const cards=E('div',undefined,'crm-crep-cards');
 for(const p of res.proposals){const card=E('article',undefined,'crm-crep-card');
  card.append(E('span',p.segmentLabel+(p.segmentSize===null?'':' · '+n(p.segmentSize)+(p.segmentSize===1?' contatto':' contatti')),'crm-crep-card-seg'),E('strong',p.subject,'crm-crep-card-subj'));
  if(p.preview)card.append(E('p',p.preview,'crm-crep-card-prev'));
  const ol=E('ol');for(const l of p.outline)ol.append(E('li',l));card.append(ol);
  const meta=E('p',undefined,'crm-crep-card-meta');meta.append(E('span',p.sendDay?'Invio suggerito: '+p.sendDay:'Giorno di invio non indicato'));if(p.why)meta.append(E('span',p.why));card.append(meta);
  const acts=E('div',undefined,'actions');
  if(subject&&body)acts.append(B('Usa come bozza',()=>{
   if((subject.value.trim()||body.value.trim())&&!window.confirm('Sostituire oggetto e testo della campagna con questa proposta?'))return;
   const d=N.draft(p);subject.value=d.subject;body.value=d.body;[subject,body].forEach(x=>x.dispatchEvent(new Event('input',{bubbles:true})));
   app()?.notice('Proposta inserita nella campagna: è una scaletta, scrivi il testo e scegli il segmento «'+p.segmentLabel+'» ('+N.EXCLUDED.toLowerCase().replace(/\.$/,'')+') prima di «Prepara gli invii».');
   subject.scrollIntoView({block:'center'});subject.focus()},'primary'));
  acts.append(B('Copia',async()=>{const t=N.copyText(p);try{await navigator.clipboard.writeText(t);status.textContent='Proposta copiata.'}catch{status.textContent='Copia non disponibile su questo browser.'}}));
  card.append(acts);cards.append(card)}
 if(res.proposals.length)box.append(E('strong','Proposte per la prossima email'),cards,E('p',N.EXCLUDED+' Le proposte non partono da sole: «Usa come bozza» compila soltanto oggetto e testo qui sopra.','muted'));
 box.append(status);return box;
}
window.RadixCrmCampaignNext={section};
})();
