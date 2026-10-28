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
const mem={get(w){try{return localStorage.getItem(KEY(w))||''}catch(e){return ''}},set(w,v){try{localStorage.setItem(KEY(w),v)}catch(e){}}};
const st={doc:null,ctx:null,step:1,answers:null,model:null,look:'elegante',useBrand:true};
// The colours in use: the company's (Intestazione › Colori dell’offerta grafica) while the switch is on, else the look's.
const brand=()=>st.useBrand&&st.ctx.brand?st.ctx.brand:null;
function dialog(){let d=$('offerta');if(d)return d;d=E('dialog');d.id='offerta';d.className='of-dialog';d.setAttribute('aria-label','Offerta grafica');document.body.append(d);d.addEventListener('close',()=>{d.replaceChildren()});return d}
function open(doc,ctx){st.ctx=ctx||{};st.doc={...doc,company_industry:st.ctx.industry||''};st.step=1;st.answers=null;st.model=null;st.look='elegante';st.useBrand=true;render();const d=dialog();if(!d.open)d.showModal()}
function head(title,sub){const h=E('div',undefined,'of-head');h.append(E('h2',title),E('p',sub,'of-sub-text'));const steps=E('ol',undefined,'of-stepper');[['1','Configura'],['2','Scegli il look'],['3','Rifinisci e stampa']].forEach(([n,l],i)=>{const li=E('li',undefined,i+1===st.step?'is-current':i+1<st.step?'is-done':'');li.append(E('b',n),E('span',l));steps.append(li)});h.append(steps);return h}
function render(){const d=dialog();d.replaceChildren();const close=B('Chiudi',()=>d.close(),'of-close');close.setAttribute('aria-label','Chiudi');d.append(close);
 if(st.step===1)d.append(step1());else if(st.step===2)d.append(step2());else d.append(step3())}
function step1(){
 const w=E('div',undefined,'of-step');w.append(head('Offerta grafica','Tre domande, poi tre proposte di impaginazione del preventivo «'+(st.doc.title||st.doc.number||'')+'». Nessuna chiamata AI, nessun invio.'));
 const qs=C.questions(st.doc,mem.get(st.ctx.workspace));const answers=Object.fromEntries(qs.map(q=>[q.id,q.value]));
 for(const q of qs){const f=E('fieldset',undefined,'of-q');f.append(E('legend',q.label));const row=E('div',undefined,'of-choices');
  for(const o of q.options){const l=E('label',undefined,'of-choice'+(o.value===q.value?' is-on':''));const i=E('input');i.type='radio';i.name='of-'+q.id;i.value=o.value;i.checked=o.value===q.value;i.addEventListener('change',()=>{answers[q.id]=o.value;row.querySelectorAll('.of-choice').forEach(x=>x.classList.toggle('is-on',x===l))});
   const t=E('span');t.append(E('b',o.label));if(o.hint)t.append(E('small',o.hint));l.append(i,t);row.append(l)}
  f.append(row);w.append(f)}
 const bar=E('div',undefined,'of-bar');bar.append(B('Mostra le 3 proposte',()=>{st.answers=answers;mem.set(st.ctx.workspace,answers.business);st.model=C.plan(st.doc,answers);st.step=2;render()},'of-btn is-primary'));w.append(bar);return w;
}
function preview(lookId,scale){const box=E('div',undefined,'of-preview');const f=document.createElement('iframe');f.title='Anteprima '+lookId;f.setAttribute('sandbox','');f.loading='lazy';
 f.srcdoc='<!doctype html><html lang="it"><head><meta charset="utf-8"><link rel="stylesheet" href="'+location.origin+'/sales/offerta.css"><style>html,body{margin:0;background:#e9e6ef}body{zoom:'+scale+';display:flex;gap:6mm;padding:4mm;align-items:flex-start}.of-page{margin:0;flex:0 0 210mm}</style></head><body class="of-paper">'+C.html(st.model,lookId,brand())+'</body></html>';box.append(f);return box}
function brandSwitch(onChange){if(!st.ctx.brand)return null;const l=E('label',undefined,'of-switch');const i=E('input');i.type='checkbox';i.checked=st.useBrand;i.addEventListener('change',()=>{st.useBrand=i.checked;onChange()});
 const sw=E('span');sw.append(E('i',undefined,'of-swatch'),E('i',undefined,'of-swatch is-accent'));sw.querySelector('.of-swatch').style.background=st.ctx.brand.primary;sw.querySelector('.is-accent').style.background=st.ctx.brand.accent;
 l.append(i,sw,E('span','Colori della tua azienda'));return l}
function step2(){
 const w=E('div',undefined,'of-step');w.append(head('Scegli il look','Stesso contenuto, tre impaginazioni. Scegline una: i testi si rifiniscono dopo.'));
 const grid=E('div',undefined,'of-looks');
 for(const L of C.LOOKS){const card=E('div',undefined,'of-look'+(L.id===st.look?' is-on':''));card.append(preview(L.id,0.21));const t=E('div',undefined,'of-look-text');t.append(E('b',L.label),E('small',L.hint));card.append(t,B('Scegli «'+L.label+'»',()=>{st.look=L.id;st.step=3;render()},'of-btn is-primary'));grid.append(card)}
 w.append(grid);const bar=E('div',undefined,'of-bar');const sw=brandSwitch(render);if(sw)bar.append(sw);bar.append(B('← Cambia le risposte',()=>{st.step=1;render()},'of-btn'));w.append(bar);return w;
}
function step3(){
 const w=E('div',undefined,'of-step of-step-3');w.append(head('Rifinisci e stampa','Correggi i testi: l’anteprima si aggiorna. Gli importi sono quelli del preventivo e non si toccano qui.'));
 const two=E('div',undefined,'of-two');const form=E('div',undefined,'of-form');
 const looks=E('div',undefined,'of-looksel');looks.append(E('span','Look'));for(const L of C.LOOKS){const b=B(L.label,()=>{st.look=L.id;looks.querySelectorAll('button').forEach(x=>x.classList.toggle('is-on',x===b));repaint()},'of-chip'+(L.id===st.look?' is-on':''));looks.append(b)}const sw=brandSwitch(()=>repaint());if(sw)looks.append(sw);form.append(looks);
 for(const f of C.fields(st.model)){const l=E('label',f.label,'of-field');const i=f.multiline?E('textarea'):E('input');if(!f.multiline)i.type='text';i.value=f.value;i.maxLength=f.max;if(f.multiline)i.rows=f.value.split('\n').length>3?5:3;i.addEventListener('input',()=>{C.apply(st.model,f.key,i.value);repaint()});l.append(i);form.append(l)}
 const warn=E('ul',undefined,'of-warn');const paintWarn=()=>{warn.replaceChildren();C.check(st.model).forEach(t=>warn.append(E('li',t)));warn.hidden=!warn.children.length};
 const side=E('div',undefined,'of-side');let pv=preview(st.look,0.3);side.append(pv);
 const repaint=()=>{const n=preview(st.look,0.3);pv.replaceWith(n);pv=n;paintWarn()};paintWarn();
 two.append(form,side);w.append(two,warn);
 const bar=E('div',undefined,'of-bar');bar.append(B('← Altro look',()=>{st.step=2;render()},'of-btn'),B('Stampa / salva PDF',print,'of-btn is-primary'));w.append(bar);return w;
}
/* The print: the pages go into #vd-print (the same print container as the plain quote) with the offer class,
   the title becomes the file name proposed by «Salva come PDF». */
function print(){
 const box=$('vd-print');if(!box)return;box.className='vd-print is-offer';box.innerHTML=C.html(st.model,st.look,brand());
 const prev=document.title;document.title=('Offerta '+(st.model.customer||'')+(st.model.number?' '+st.model.number.replace('/','-'):'')).trim();
 window.print();setTimeout(()=>{document.title=prev;box.className='vd-print'},800);
}
window.RadixOfferta={open};
})();
