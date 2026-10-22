/* Studio Foto: the guided Higgsfield flow. A few questions about the photo, three proposals with different
   framings, the person picks one and RADIX composes it with the post's headline and the project's style guide.
   Pure part (questions, prompts) runs in Node for the tests; photoStudio() is the browser widget.
   Every generation starts from a click with confirmation: three proposals are three Higgsfield generations. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixImageStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
// The styled RADIX confirmation (lib/radix-confirm.js) before every paid step; root.confirm only if it is missing.
const askConfirm=o=>{const C=root.RadixConfirm||(typeof require==='function'?require('./radix-confirm.js'):null);return C?C.ask(o):Promise.resolve(!!root.confirm([o.title,o.cost,o.message].filter(Boolean).join('\n')))};
// Italian label → words for the prompt. First entry is the default.
const QUESTIONS=[
 {id:'subject',label:'Cosa mostra la foto?',options:[['Un ambiente di lavoro','a real workspace scene'],['Un oggetto simbolico','a single symbolic object as the hero of the picture'],['Mani al lavoro','hands at work seen up close'],['Un luogo o paesaggio','an evocative place or landscape'],['Composizione astratta','an abstract composition of shapes, materials and textures']]},
 {id:'setting',label:'Dove?',options:[['Ufficio moderno','in a bright modern office'],['Studio con fondale','in a photo studio on a seamless backdrop'],['All’aperto','outdoors'],['Casa, smart working','in a calm home workspace'],['Laboratorio o fabbrica','in a clean workshop or factory']]},
 {id:'light',label:'Che atmosfera?',options:[['Luce naturale morbida','soft natural daylight, calm and trustworthy'],['Cinematografica','cinematic contrasted light with deep shadows'],['Minimal e luminosa','minimal, airy and bright, plenty of negative space'],['Calda, tramonto','warm golden-hour light']]},
 {id:'colors',label:'Colori',options:[['Dell’identità visiva','brand'],['Toni neutri','muted neutral tones'],['Vivaci','vivid saturated colours']]},
 {id:'people',label:'Persone',options:[['Nessuna persona','no people at all'],['Senza volti riconoscibili','people only from behind, cropped or out of focus, no recognizable faces']]},
 {id:'ratio',label:'Formato',options:[['4:5 · post','4:5'],['1:1 · quadrato','1:1'],['9:16 · storie e reel','9:16'],['16:9 · orizzontale','16:9']]}
];
// The three proposals differ in framing, so the choice is a real one.
const VARIANTS=[['Inquadratura ampia','wide shot showing the whole scene in context'],['Dettaglio ravvicinato','close-up detail with shallow depth of field'],['Spazio per il titolo','composition with generous empty space in the lower third for a headline']];
const PROMPT_MAX=2000;
const pick=(id,v)=>{const q=QUESTIONS.find(x=>x.id===id),o=q.options.find(x=>x[1]===v);if(v!=null&&!o)throw Error('Risposta non valida per «'+q.label+'».');return (o||q.options[0])[1]};
// What the post says, as the starting concept: title and first sentence, without the slide block.
function conceptFrom(text,title){const body=String(text||'').replace(/---SLIDES---[\s\S]*?---FINE---/g,' ').replace(/\s+/g,' ').trim(),first=(body.match(/^.{20,}?[.!?](?=\s|$)/)||[body])[0];
 return [String(title||'').trim(),first].filter(Boolean).join(': ').slice(0,300)}
// The post's headline on the photo: the first sentence, short.
function headlineFrom(text){const body=String(text||'').replace(/---SLIDES---[\s\S]*?---FINE---/g,' ').replace(/[#*_>]/g,'').replace(/\s+/g,' ').trim(),first=(body.match(/^.+?[.!?](?=\s|$)/)||[body])[0];return first.length<=90?first:first.slice(0,87).replace(/\s+\S*$/,'')+'…'}
function brandColours(guide,project){if(guide)return [guide.cover,guide.page,guide.key,guide.accent].filter((h,i,a)=>h&&a.indexOf(h)===i);const v=String(project&&project.visual||'');return [...new Set(v.match(/#[0-9a-fA-F]{6}/g)||[])].slice(0,4)}
// Three Higgsfield prompts from the answers. Throws a plain-Italian message when the concept is missing.
function prompts(answers,{concept,project,guide}={}){const a=answers||{},idea=String(concept||'').replace(/\s+/g,' ').trim();
 if(idea.length<10)throw Error('Scrivi in una frase cosa deve comunicare la foto.');
 const colours=pick('colors',a.colors)==='brand'?(brandColours(guide,project).length?'colour palette built on '+brandColours(guide,project).join(', '):'colours coherent with a sober professional brand'):pick('colors',a.colors);
 const ctx=project&&(project.kind||project.summary)?' Brand context: '+String(project.kind||project.summary).replace(/\s+/g,' ').slice(0,200)+'.':'';
 const base='Professional editorial photograph for a brand’s social media, authentic and not stock-like.'+ctx+' It must convey: “'+idea.slice(0,600)+'”. Subject: '+pick('subject',a.subject)+' '+pick('setting',a.setting)+'. Mood: '+pick('light',a.light)+'. '+colours.charAt(0).toUpperCase()+colours.slice(1)+'. '+pick('people',a.people).charAt(0).toUpperCase()+pick('people',a.people).slice(1)+'.';
 return VARIANTS.map(([label,frame])=>({label,prompt:(base+' Framing: '+frame+'. No text, no letters, no logos, no watermark.').slice(0,PROMPT_MAX)}))}
const ratioOf=answers=>pick('ratio',answers&&answers.ratio);
// Art Director check of the ready proposals before the person chooses: the agent looks at the images and
// flags what makes one unusable (letters or fake text, deformed hands or objects, recognizable faces when none
// were asked, colours off the brand, a subject that does not say the concept). One AI reply, no generation.
const REVIEW_MAX=3;
function reviewMessage(items,{concept,project}={}){const list=(items||[]).filter(x=>x&&x.url).slice(0,REVIEW_MAX);
 const text=['Sei l\'Art Director. Guarda le '+list.length+' proposte qui sopra, nell\'ordine, per una foto social del progetto'+(project&&project.name?' «'+String(project.name).slice(0,80)+'»':'')+'.',
  'Deve comunicare: «'+String(concept||'').replace(/\s+/g,' ').trim().slice(0,400)+'».',
  'Per ciascuna controlla: lettere o scritte finte, mani o oggetti deformati, volti riconoscibili, colori lontani dal brand, soggetto che non comunica il concetto, aspetto da foto di repertorio.',
  'Rispondi solo con JSON, senza testo prima o dopo: {"best":numero da 1 a '+list.length+',"items":[{"n":1,"score":da 1 a 10,"issues":["problema breve"],"note":"una riga"}]}. issues vuoto se non ci sono problemi. Giudica solo quello che vedi.'].join('\n');
 return {role:'user',content:list.map(x=>({type:'image',source:{type:'url',url:String(x.url)}})).concat([{type:'text',text}])}}
function parseReview(text,count){const m=String(text||'').match(/\{[\s\S]*\}/);if(!m)return null;let d;try{d=JSON.parse(m[0])}catch(e){return null}
 const n=Math.max(0,Math.min(REVIEW_MAX,count|0)),items=[];
 (Array.isArray(d.items)?d.items:[]).forEach(it=>{const i=(it&&it.n|0)-1;if(i<0||i>=n||items[i])return;
  items[i]={score:Math.max(1,Math.min(10,Math.round(+it.score)||1)),issues:(Array.isArray(it.issues)?it.issues:[]).map(x=>String(x).replace(/\s+/g,' ').trim().slice(0,90)).filter(Boolean).slice(0,4),note:String(it.note||'').replace(/\s+/g,' ').trim().slice(0,160)}});
 if(!items.some(Boolean))return null;
 let best=(d.best|0)-1;if(!items[best]){best=-1;items.forEach((it,i)=>{if(it&&(best<0||it.score>items[best].score))best=i})}
 return {best,items}}

// ---- browser widget ----
let counter=0;
const doc=()=>root.document;
const el=(tag,text,cls)=>{const n=doc().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=el('button',text,cls||'');b.type='button';return b};
async function json(res,fallback){const d=await res.json().catch(()=>({}));if(!res.ok)throw Error(d.error||fallback);return d}
const uuid=()=>root.crypto&&root.crypto.randomUUID?root.crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,ch=>{const r=Math.random()*16|0;return (ch==='x'?r:(r&3|8)).toString(16)});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function loadImage(src,cors){return new Promise((ok,ko)=>{const i=new Image();if(cors)i.crossOrigin='anonymous';i.onload=()=>ok(i);i.onerror=()=>ko(Error('Immagine non caricata'));i.src=src})}
// The photo of a Higgsfield request through the same-origin proxy (also used by «Scarica il post» in the PED).
async function photoBlob(requestId){const r=await root.fetch('/api/higgsfield?action=image&id='+encodeURIComponent(requestId),{credentials:'same-origin'});if(!r.ok){const d=await r.json().catch(()=>({}));throw Error(d.error||'Immagine non scaricabile')}return r.blob()}
// The chosen photo as an image the canvas can export: straight from the CDN when it allows it, else through RADIX.
async function canvasImage(choice){try{return await loadImage(choice.url,true)}catch(e){}
 const url=URL.createObjectURL(await photoBlob(choice.requestId));try{return await loadImage(url,false)}finally{setTimeout(()=>URL.revokeObjectURL(url),60000)}}
async function generateOne(prompt,ratio,onState){
 const d=await json(await root.fetch('/api/higgsfield',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action:'generate',prompt,aspectRatio:ratio,requestKey:uuid()})}),'Errore avvio generazione');
 let s=d;for(let i=0;!s.done&&i<=75;i++){onState('In preparazione… '+i*4+'s');await wait(i?4000:1500);s=await json(await root.fetch('/api/higgsfield?action=status&id='+encodeURIComponent(d.requestId),{credentials:'same-origin'}),'Errore stato immagine')}
 if(!s.done)throw Error('Ci sta mettendo troppo: riprova più tardi.');if(s.status!=='completed'||!s.images.length)throw Error(s.error||'Nessuna immagine (stato: '+s.status+').');
 return {requestId:d.requestId,url:s.images[0]}}
// ctx: {project, concept, headline, onUse(canvas, info)} — onUse attaches the composed image (PED); «Scarica» is always there, next to «Usa».
function photoStudio(ctx={}){
 const M=root.RadixAgentMedia,wrap=el('div',undefined,'tool photo-studio'),answers={},n=++counter;
 const steps=el('ol',undefined,'ps-steps');['Come la vuoi','Scegli tra 3','Componi'].forEach((t,i)=>{const li=el('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=n=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<n?'done':+li.dataset.step===n?'current':'todo');
 const form=el('div',undefined,'ps-form'),qs=el('div',undefined,'ps-questions');
 for(const q of QUESTIONS){const fs=el('fieldset'),lg=el('legend',q.label);fs.append(lg);q.options.forEach(([label,v],i)=>{const l=el('label',undefined,'ps-chip'),r=el('input');r.type='radio';r.name='ps-'+q.id+'-'+n;r.value=v;r.checked=i===0;r.onchange=()=>{answers[q.id]=v};l.append(r,doc().createTextNode(' '+label));fs.append(l)});qs.append(fs)}
 const cl=el('label','Cosa deve comunicare la foto'),concept=el('textarea');concept.rows=2;concept.maxLength=600;concept.value=ctx.concept||'';cl.append(concept);
 const go=button('Genera 3 proposte','primary'),cost=el('span','Tre generazioni Higgsfield: ti chiedo conferma prima.','muted'),status=el('p','','tool-status');status.setAttribute('role','status');
 const bar=el('div',undefined,'ps-actions');bar.append(go,cost);form.append(qs,cl,bar);
 const grid=el('div',undefined,'ps-grid'),compose=el('div',undefined,'ps-compose');grid.hidden=compose.hidden=true;
 wrap.append(steps,form,status,grid,compose);setStep(1);
 const radios=()=>wrap.querySelectorAll('input[type=radio]');
 go.onclick=async()=>{let list;try{list=prompts(answers,{concept:concept.value,project:ctx.project,guide:M&&M.styleGuide(ctx.project)})}catch(e){status.textContent=e.message;concept.focus();return}
  if(!await askConfirm({title:'Generare 3 proposte con Higgsfield?',cost:'Sono 3 generazioni: consumano il saldo API di Higgsfield. Poi l’Art Director AI dà un parere sulle proposte (una chiamata AI).',ok:'Genera le proposte'}))return;
  const ratio=ratioOf(answers);go.disabled=concept.disabled=true;radios().forEach(r=>r.disabled=true);setStep(2);status.textContent='Higgsfield prepara le 3 proposte…';grid.hidden=false;grid.replaceChildren();compose.hidden=true;
  const cards=list.map(p=>{const f=el('figure',undefined,'ps-card'),ph=el('div','In coda…','ps-ph'),cap=el('figcaption',p.label);f.style.setProperty('--ratio',ratio.replace(':','/'));f.append(ph,cap);grid.append(f);return {f,ph,p}});
  const results=await Promise.all(cards.map(async c=>{try{const r=await generateOne(c.p.prompt,ratio,t=>{c.ph.textContent=t});const img=el('img');img.src=r.url;img.alt='Proposta: '+c.p.label;c.ph.replaceWith(img);
    const use=button('Scegli questa','primary');use.onclick=()=>choose(Object.assign(r,{label:c.p.label,prompt:c.p.prompt,ratio}),c.f);c.f.append(use);return r}catch(e){c.ph.textContent='Non riuscita: '+e.message;return null}}));
  const ok=results.filter(Boolean).length;status.textContent=ok?'Scegli la proposta migliore.':'Nessuna proposta pronta: cambia le risposte e riprova.';
  go.disabled=concept.disabled=false;radios().forEach(r=>r.disabled=false);go.textContent='Rigenera 3 proposte';
  if(ok>1)artDirector(cards.map((c,i)=>results[i]&&{card:c.f,url:results[i].url}).filter(Boolean),concept.value)};
 // The Art Director's opinion on each card; the choice stays with the person. Silent when the check is not available.
 async function artDirector(ready,idea){const rt=root.RadixAgents;if(!rt||typeof rt.reply!=='function')return;
  const note=el('p','L\'Art Director sta guardando le proposte…','muted ps-ad-status');status.after(note);
  try{const r=await rt.reply({role:'art-director',project:ctx.project,memoryScope:ctx.memoryScope,messages:[reviewMessage(ready,{concept:idea,project:ctx.project})]}),rv=parseReview(r.text,ready.length);
   if(!rv){note.remove();return}
   ready.forEach((x,i)=>{const it=rv.items[i];if(!it)return;const box=el('div',undefined,'ps-ad'+(i===rv.best?' best':''));box.dataset.score=String(it.score);
    box.append(el('strong',(i===rv.best?'Consigliata · ':'')+it.score+'/10'));if(it.note)box.append(el('span',it.note));
    if(it.issues.length){const ul=el('ul');it.issues.forEach(t=>ul.append(el('li',t)));box.append(ul)}
    x.card.querySelector('.ps-ad')?.remove();x.card.querySelector('figcaption').after(box)});
   note.textContent='L\'Art Director ha dato un parere: la scelta resta tua.'}catch(e){note.remove()}}
 async function choose(choice,card){grid.querySelectorAll('.ps-card').forEach(x=>x.dataset.chosen=String(x===card));setStep(3);compose.hidden=false;compose.replaceChildren(el('p','Preparo la composizione…','muted'));
  let img;try{img=await canvasImage(choice)}catch(e){compose.replaceChildren(el('p','Non riesco a comporre la foto: '+e.message+'. ','muted'));const a=el('a','Apri la foto');a.href=choice.url;a.target='_blank';a.rel='noopener noreferrer';compose.firstChild.append(a);return}
  const hl=el('label','Titolo sulla foto (vuoto = solo foto)'),head=el('input');head.maxLength=120;head.value=ctx.headline||'';hl.append(head);
  const view=el('div',undefined,'ps-view');const draw=()=>{const c=M.renderPhotoPost(img,head.value,ctx.project,choice.ratio);c.className='ps-canvas';view.replaceChildren(c);return c};let canvas=draw();head.oninput=()=>{canvas=draw()};
  const acts=el('div',undefined,'ps-actions'),done=el('span','','muted');
  if(typeof ctx.onUse==='function'){const use=button('Usa questa immagine nel post','primary');use.onclick=async()=>{use.disabled=true;done.textContent='Allego…';try{await ctx.onUse(canvas,{requestId:choice.requestId,prompt:choice.prompt,headline:head.value.trim()});done.textContent='✓ Allegata al post.'}catch(e){done.textContent='Non allegata: '+e.message;use.disabled=false}};acts.append(use)}
  const dl=button('Scarica',typeof ctx.onUse==='function'?'':'primary');dl.onclick=()=>{const a=el('a');a.href=canvas.toDataURL('image/jpeg',.92);a.download='radix-foto.jpg';a.click()};acts.append(dl,done);compose.replaceChildren(hl,view,acts)}
 return wrap}
return Object.freeze({QUESTIONS,VARIANTS,photoBlob,loadImage,conceptFrom,headlineFrom,prompts,ratioOf,reviewMessage,parseReview,photoStudio});
});
