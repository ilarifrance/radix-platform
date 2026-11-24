'use strict';
/* «Trova email» in the CRM (Contatti › selezione › «Trova email») and its «Ordine dei servizi» panel (Impostazioni ›
   Caselle email). Rules in sales/crm-email-finder-core.js, server in api/_sales_email_finder.js.
   Two confirmations: nothing is sent before the first (count, free steps, paid chain with costs); no paid provider is
   called before the second (how many remain, max searches per provider). Providers without a key show «da collegare». */
(function(root){
const F=()=>root.RadixCrmEmailFinderCore;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const app=()=>root.RadixSalesApp;
const post=(entity,action,data)=>app().api(entity,{body:{workspace:app().state.workspace,entity,action,data}});
const n=(k,one,many)=>k+' '+(k===1?one:many);

// GET answers {rows:[{chain,order,can_configure}]}, like every CRM read.
async function status(){return (await app().api('email_finder',{})).rows[0]}
// Selected contacts with their company name and website, as the core expects them.
function contactsOf(ids){
 const set=new Set(ids),companies=new Map(app().rows('companies').map(c=>[c.id,c]));
 return app().rows('contacts').filter(c=>set.has(c.id)).map(c=>{const co=companies.get(c.company_id)||{};return {...c,company:c.company||co.name||'',website:c.website||co.website||'',company_email:co.email||''}});
}
async function run(ids){
 const a=app();if(a.state.busy)return;
 let st;try{st=await status()}catch(e){a.error(e.message||String(e));return}
 const configured=Object.fromEntries(st.chain.map(p=>[p.id,p.state==='pronto']));
 a.lock(true);a.error('');
 let r;
 try{
  r=await F().runFinder(contactsOf(ids),{ask:t=>{a.lock(false);const ok=window.confirm(t);a.lock(true);return ok},api:(action,data)=>post('email_finder',action,data),
   progress:t=>a.notice(t),configured,order:st.order});
 }catch(e){a.error(e.message||String(e))}finally{a.lock(false)}
 if(!r)return;
 if(r.reason==='none'){a.notice('Nessun contatto da cercare: servono nome e azienda e nessuna email'+(r.skipped.email?' ('+r.skipped.email+' hanno già un’email)':'')+'.');return}
 if(r.reason==='cancelled'){a.notice('Ricerca annullata: nessun dato inviato.');return}
 const paid=Object.entries(r.paid).map(([id,x])=>(F().byId(id)||{}).label+': '+x.saved+' trovate');
 a.notice('Trova email: '+n(r.free.saved,'email trovata','email trovate')+' gratis sul sito aziendale'+(r.free.guessed?', '+r.free.guessed+' da verificare (schema del sito)':'')+(r.free.company?', '+n(r.free.company,'email aziendale salvata','email aziendali salvate')+' sull’azienda':'')+(paid.length?' · '+paid.join(' · '):'')+(r.reason==='paid-cancelled'?' · servizi a pagamento non usati':'')+(r.suppressed?' · '+n(r.suppressed,'indirizzo è','indirizzi sono')+' nella lista dei disiscritti: salvat'+(r.suppressed===1?'o ma non riceverà email':'i ma non riceveranno email'):'')+' · senza email buona: '+r.remaining+'.');
 try{await a.refresh(false)}catch{}
}
function button(ids){
 return Object.assign(B('Trova email',()=>run(ids())),{title:'Cerca l’email aziendale della persona: prima gratis sul sito dell’azienda, poi (con una seconda conferma) con i servizi a pagamento collegati.'});
}

// ---- «Trova email: ordine dei servizi» (owner/admin) ----
function settingsPanel(){
 const box=E('details',undefined,'panel crm-finder-settings');box.append(E('summary','Trova email: ordine dei servizi'));
 const body=E('div');box.append(body);box.addEventListener('toggle',()=>{if(box.open)draw()});box.refresh=draw;
 async function draw(){
  let st,row=null;try{st=await status();const d=await app().api('segments',{subject:'email_finder'});row=(d.rows||[])[0]||null}catch(e){body.replaceChildren(E('p',e.message,'notice'));return}
  body.replaceChildren(E('p','Prima le fonti gratuite (sito aziendale e DNS), poi i servizi a pagamento in quest’ordine, fermandosi al primo risultato buono per ogni contatto. Le chiavi si impostano nelle variabili d’ambiente di Vercel; i prezzi vanno controllati sul sito di ogni servizio.','muted'));
  const order=[...st.order],list=E('ol',undefined,'crm-finder-chain');
  const all=st.chain.map(p=>p.id);
  const items=()=>all.slice().sort((x,y)=>(order.includes(x)?order.indexOf(x):99)-(order.includes(y)?order.indexOf(y):99));
  const render=()=>{list.replaceChildren();for(const id of items()){const p=st.chain.find(x=>x.id===id),on=order.includes(id);
   const li=E('li',undefined,'crm-finder-item');li.dataset.state=on?p.state:'spento';
   const t=E('div');t.append(E('strong',p.label));if(p.cost&&p.cost!=='—')t.append(E('small',p.cost,'muted'));if(p.note)t.append(E('small',p.note,'muted'));else if(p.state==='da collegare')t.append(E('small','Da collegare: aggiungi '+p.env+' in Vercel (Production).','muted'));
   li.append(t,E('span',on?(p.state==='pronto'?'Attivo':p.state):'Spento','crm-mb-badge'));
   if(st.can_configure){const acts=E('div',undefined,'actions');
    if(on){acts.append(B('Su',()=>{const i=order.indexOf(id);if(i>0){order.splice(i,1);order.splice(i-1,0,id);render()}}),B('Giù',()=>{const i=order.indexOf(id);if(i<order.length-1){order.splice(i,1);order.splice(i+1,0,id);render()}}),B('Spegni',()=>{order.splice(order.indexOf(id),1);render()}))}
    else acts.append(B('Accendi',()=>{order.push(id);render()}));li.append(acts)}
   list.append(li)}};
  render();body.append(list);
  if(!st.can_configure){body.append(E('p','L’ordine lo decidono owner e admin.','muted'));return}
  body.append(B('Salva ordine',async()=>{const a=app();a.lock(true);a.error('');
   try{const filters={email_finder:{order}};if(row)await post('segments','update',{id:row.id,version:row.version,filters});else await post('segments','create',{name:F().RESERVED,filters});a.notice('Ordine dei servizi salvato.')}
   catch(e){a.error(e.message||String(e))}finally{a.lock(false)}draw()},'primary'));
 }
 return box;
}
root.RadixCrmEmailFinder={button,run,settingsPanel,contactsOf};
})(typeof globalThis!=='undefined'?globalThis:this);
