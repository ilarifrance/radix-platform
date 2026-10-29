'use strict';
/* «Offerta grafica» on sales-vendite.html: the dialog #offerta, opened from a quote with RadixOfferta.open(doc, ctx).
   Three steps: 1) configurator (business type, goal, tone), 2) three looks of the same content, 3) touch-ups and
   print. No AI, no network: the content comes from the quote (sales/offerta-core.js); the print uses the browser's
   «Salva come PDF». The business type chosen is remembered per workspace in localStorage. */
(function(){
const C=window.RadixOffertaCore;if(!C)return;
const $=id=>document.getElementById(id);
const E=(t,text,cls)=>{const n=document.createElement(t);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const KEY=w=>'radix.offerta.business.'+w;
// The CRM's language switch (lib/radix-i18n.js) decides the language of the dialog and of the pages: it or en.
const EN=()=>!!(window.RadixI18n&&window.RadixI18n.en),lang=()=>EN()?'en':'it',T=(it,en)=>EN()?en:it;
const mem={get(w){try{return localStorage.getItem(KEY(w))||''}catch(e){return ''}},set(w,v){try{localStorage.setItem(KEY(w),v)}catch(e){}}};
const st={doc:null,ctx:null,step:1,answers:null,model:null,look:'elegante',useBrand:true,ai:null,aiBusy:false};
// The colours in use: the company's (Intestazione › Colori dell’offerta grafica) while the switch is on, else the look's.
const brand=()=>st.useBrand&&st.ctx.brand?st.ctx.brand:null;
function dialog(){let d=$('offerta');if(d)return d;d=E('dialog');d.id='offerta';d.className='of-dialog';d.setAttribute('aria-label',T('Offerta grafica','Graphic proposal'));d.lang=lang();document.body.append(d);d.addEventListener('close',()=>{d.replaceChildren()});return d}
function open(doc,ctx){st.ctx=ctx||{};st.doc={...doc,company_industry:st.ctx.industry||''};st.step=1;st.answers=null;st.model=null;st.look='elegante';st.useBrand=true;st.ai=null;st.aiBusy=false;render();const d=dialog();if(!d.open)d.showModal()}
function head(title,sub){const h=E('div',undefined,'of-head');h.append(E('h2',title),E('p',sub,'of-sub-text'));const steps=E('ol',undefined,'of-stepper');[['1',T('Configura','Set up')],['2',T('Scegli il look','Choose the look')],['3',T('Rifinisci e stampa','Refine and print')]].forEach(([n,l],i)=>{const li=E('li',undefined,i+1===st.step?'is-current':i+1<st.step?'is-done':'');li.append(E('b',n),E('span',l));steps.append(li)});h.append(steps);return h}
function render(){const d=dialog();d.replaceChildren();const close=B(T('Chiudi','Close'),()=>d.close(),'of-close');close.setAttribute('aria-label',T('Chiudi','Close'));d.lang=lang();d.append(close);
 if(st.step===1)d.append(step1());else if(st.step===2)d.append(step2());else d.append(step3())}
function step1(){
 const w=E('div',undefined,'of-step');w.append(head(T('Offerta grafica','Graphic proposal'),T('Tre domande, poi tre proposte di impaginazione del preventivo «','Three questions, then three layouts of the quote «')+(st.doc.title||st.doc.number||'')+T('». Nessuna chiamata AI, nessun invio.','». No AI call, nothing sent.')));
 const qs=C.questions(st.doc,mem.get(st.ctx.workspace),lang());const answers=Object.fromEntries(qs.map(q=>[q.id,q.value]));
 for(const q of qs){const f=E('fieldset',undefined,'of-q');f.append(E('legend',q.label));const row=E('div',undefined,'of-choices');
  for(const o of q.options){const l=E('label',undefined,'of-choice'+(o.value===q.value?' is-on':''));const i=E('input');i.type='radio';i.name='of-'+q.id;i.value=o.value;i.checked=o.value===q.value;i.addEventListener('change',()=>{answers[q.id]=o.value;row.querySelectorAll('.of-choice').forEach(x=>x.classList.toggle('is-on',x===l))});
   const t=E('span');t.append(E('b',o.label));if(o.hint)t.append(E('small',o.hint));l.append(i,t);row.append(l)}
  f.append(row);w.append(f)}
 const bar=E('div',undefined,'of-bar');bar.append(B(T('Mostra le 3 proposte','Show the 3 proposals'),()=>{st.answers=answers;mem.set(st.ctx.workspace,answers.business);st.model=C.plan(st.doc,answers,{lang:lang()});st.step=2;render()},'of-btn is-primary'));w.append(bar);return w;
}
function preview(lookId,scale){const box=E('div',undefined,'of-preview');const f=document.createElement('iframe');f.title=T('Anteprima ','Preview ')+lookId;f.setAttribute('sandbox','');f.loading='lazy';
 f.srcdoc='<!doctype html><html lang="'+lang()+'"><head><meta charset="utf-8"><link rel="stylesheet" href="'+location.origin+'/sales/offerta.css"><style>html,body{margin:0;background:#e9e6ef}body{zoom:'+scale+';display:flex;gap:6mm;padding:4mm;align-items:flex-start}.of-page{margin:0;flex:0 0 210mm}</style></head><body class="of-paper">'+C.html(st.model,lookId,brand())+'</body></html>';box.append(f);return box}
function brandSwitch(onChange){if(!st.ctx.brand)return null;const l=E('label',undefined,'of-switch');const i=E('input');i.type='checkbox';i.checked=st.useBrand;i.addEventListener('change',()=>{st.useBrand=i.checked;onChange()});
 const sw=E('span');sw.append(E('i',undefined,'of-swatch'),E('i',undefined,'of-swatch is-accent'));sw.querySelector('.of-swatch').style.background=st.ctx.brand.primary;sw.querySelector('.is-accent').style.background=st.ctx.brand.accent;
 l.append(i,sw,E('span',T('Colori della tua azienda','Your company colours')));return l}
function step2(){
 const w=E('div',undefined,'of-step');w.append(head(T('Scegli il look','Choose the look'),T('Stesso contenuto, tre impaginazioni. Scegline una: i testi si rifiniscono dopo.','Same content, three layouts. Pick one: the texts are refined afterwards.')));
 const grid=E('div',undefined,'of-looks');
 for(const L of C.looks(lang())){const card=E('div',undefined,'of-look'+(L.id===st.look?' is-on':''));card.append(preview(L.id,0.21));const t=E('div',undefined,'of-look-text');t.append(E('b',L.label),E('small',L.hint));card.append(t,B(T('Scegli «','Choose «')+L.label+'»',()=>{st.look=L.id;st.step=3;render()},'of-btn is-primary'));grid.append(card)}
 w.append(grid);const bar=E('div',undefined,'of-bar');const sw=brandSwitch(render);if(sw)bar.append(sw);bar.append(B(T('← Cambia le risposte','← Change the answers'),()=>{st.step=1;render()},'of-btn'));w.append(bar);return w;
}
function step3(){
 const w=E('div',undefined,'of-step of-step-3');w.append(head(T('Rifinisci e stampa','Refine and print'),T('Correggi i testi: l’anteprima si aggiorna. Gli importi sono quelli del preventivo e non si toccano qui.','Edit the texts: the preview follows. The amounts are the quote’s and are not changed here.')));
 const two=E('div',undefined,'of-two');const form=E('div',undefined,'of-form');
 const looks=E('div',undefined,'of-looksel');looks.append(E('span','Look'));for(const L of C.looks(lang())){const b=B(L.label,()=>{st.look=L.id;looks.querySelectorAll('button').forEach(x=>x.classList.toggle('is-on',x===b));repaint()},'of-chip'+(L.id===st.look?' is-on':''));looks.append(b)}const sw=brandSwitch(()=>repaint());if(sw)looks.append(sw);form.append(looks);
 for(const f of C.fields(st.model)){const l=E('label',f.label,'of-field');const i=f.multiline?E('textarea'):E('input');if(!f.multiline)i.type='text';i.value=f.value;i.maxLength=f.max;i.dataset.key=f.key;if(f.multiline)i.rows=f.value.split('\n').length>3?5:3;i.addEventListener('input',()=>{C.apply(st.model,f.key,i.value);repaint()});l.append(i);form.append(l)}
 const warn=E('ul',undefined,'of-warn');const paintWarn=()=>{warn.replaceChildren();C.check(st.model).forEach(t=>warn.append(E('li',t)));warn.hidden=!warn.children.length};
 const side=E('div',undefined,'of-side');let pv=preview(st.look,0.3);side.append(pv);
 const repaint=()=>{const n=preview(st.look,0.3);pv.replaceWith(n);pv=n;paintWarn()};paintWarn();
 // «Riscrivi con l’AI»: one call after a confirmation; the proposal is shown next to the fields and applied only on «Applica».
 const ai=E('div',undefined,'of-ai');const aiStatus=E('p','','of-ai-status');aiStatus.setAttribute('role','status');
 const aiBtn=B(T('✨ Riscrivi con l’AI','✨ Rewrite with AI'),async()=>{
  if(st.aiBusy)return;if(!window.confirm(T('Chiedere all’AI una riscrittura dei testi dell’offerta?\nUna chiamata AI, consuma crediti API. Le proposte si applicano solo con «Applica»; gli importi non cambiano. Nulla viene inviato o salvato.','Ask the AI to rewrite the texts of the proposal?\nOne AI call, it uses API credits. Proposals are applied only with «Apply»; the amounts do not change. Nothing is sent or saved.')))return;
  st.aiBusy=true;aiBtn.disabled=true;aiStatus.textContent=T('L’AI sta rileggendo l’offerta…','The AI is re-reading the proposal…');
  try{const r=await fetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({role:'crm-copilot',crmScope:{workspace:st.ctx.workspace},messages:[{role:'user',content:C.aiPrompt(st.model,st.answers)}]})});
   const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||T('AI non disponibile (','AI not available (')+r.status+').');
   const got=C.aiParse(d.reply,st.model);if(!got||!Object.keys(got.texts).length)throw new Error(T('Risposta dell’AI senza testi utilizzabili: riprova.','The AI answer has no usable texts: try again.'));
   st.ai=got;aiStatus.textContent='';paintAi()}
  catch(e){aiStatus.textContent=e.message||String(e)}finally{st.aiBusy=false;aiBtn.disabled=false}},'of-btn');
 const aiBox=E('div',undefined,'of-ai-proposal');
 const paintAi=()=>{aiBox.replaceChildren();const got=st.ai;if(!got)return;const labels=Object.fromEntries(C.fields(st.model).map(x=>[x.key,x.label]));
  aiBox.append(E('b',T('Proposta dell’AI: rileggila, poi applica quello che ti convince.','AI proposal: read it through, then apply what convinces you.')));
  if(got.dropped.length)aiBox.append(E('p',T('Scartate perché citavano importi non presenti nel preventivo: ','Dropped because they quoted amounts the quote does not have: ')+got.dropped.join(', ')+'.','of-ai-dropped'));
  for(const [k,t] of Object.entries(got.texts)){const row=E('div',undefined,'of-ai-row');row.append(E('span',labels[k]||k,'of-ai-label'),E('p',t));
   row.append(B(T('Applica','Apply'),()=>{C.apply(st.model,k,t);const i=form.querySelector('[data-key="'+k+'"]');if(i)i.value=t;delete got.texts[k];paintAi();repaint()},'of-btn is-primary'));aiBox.append(row)}
  if(Object.keys(got.texts).length>1)aiBox.append(B(T('Applica tutte','Apply all'),()=>{for(const [k,t] of Object.entries(got.texts)){C.apply(st.model,k,t);const i=form.querySelector('[data-key="'+k+'"]');if(i)i.value=t}got.texts={};paintAi();repaint()},'of-btn is-primary'));
  if(!Object.keys(got.texts).length)aiBox.append(E('p',T('Tutte le proposte sono state applicate o scartate.','Every proposal has been applied or dropped.'),'of-ai-status'))};
 ai.append(aiBtn,aiStatus,aiBox);form.insertBefore(ai,looks.nextSibling);paintAi();
 two.append(form,side);w.append(two,warn);
 const bar=E('div',undefined,'of-bar');bar.append(B(T('← Altro look','← Another look'),()=>{st.step=2;render()},'of-btn'),B(T('Stampa / salva PDF','Print / save PDF'),print,'of-btn is-primary'));w.append(bar);return w;
}
/* The print: the pages go into #vd-print (the same print container as the plain quote) with the offer class,
   the title becomes the file name proposed by «Salva come PDF». */
function print(){
 const box=$('vd-print');if(!box)return;box.className='vd-print is-offer';box.innerHTML=C.html(st.model,st.look,brand());
 const prev=document.title;document.title=(T('Offerta ','Proposal ')+(st.model.customer||'')+(st.model.number?' '+st.model.number.replace('/','-'):'')).trim();
 window.print();setTimeout(()=>{document.title=prev;box.className='vd-print'},800);
}
window.RadixOfferta={open};
})();
