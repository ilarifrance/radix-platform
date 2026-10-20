/* Studio Video: the guided avatar video. A few questions, ONE AI call that writes three scripts sized to the
   chosen length, the person picks and edits one, then the project's saved HeyGen avatar says it in a draft video.
   Pure part (questions, word budget, prompt, parsing, HeyGen body) runs in Node for the tests; videoStudio() is the
   browser widget. Every paid step starts from a click with confirmation: the scripts are one AI call (API credits),
   the draft is one HeyGen generation (HeyGen credits) through the existing /api/heygen «generate» action. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixVideoStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
// Italian label → words for the prompt. `def` is the default option (first when missing).
const QUESTIONS=[
 {id:'goal',label:'Obiettivo del video',options:[['Presentazione','presentare chi siamo e cosa facciamo, a chi non ci conosce'],['Offerta','proporre un’offerta o un servizio preciso, con il beneficio concreto'],['Consiglio pratico','dare un consiglio pratico e utile subito, che mostra competenza'],['Invito a un evento','invitare a un evento: cosa, quando, perché venire'],['Domanda frequente','rispondere a una domanda che i clienti fanno spesso']]},
 {id:'length',label:'Durata',def:1,options:[['15 secondi','15'],['30 secondi','30'],['60 secondi','60']]},
 {id:'tone',label:'Tono',options:[['Cordiale','cordiale e vicino, come parlare a una persona'],['Professionale','professionale, sobrio e autorevole'],['Energico','energico e motivante, frasi brevi'],['Ironico leggero','con un filo di ironia leggera, mai sopra le righe']]},
 {id:'cta',label:'Cosa deve fare chi guarda',options:[['Scrivici','scriverci in messaggio privato'],['Visita il sito','visitare il sito (link in bio o nel post)'],['Prenota o chiama','prenotare una chiamata o un appuntamento'],['Iscriviti','iscriversi all’evento o alla newsletter'],['Seguici','seguire il profilo per i prossimi video'],['Nessuna','nessuna richiesta esplicita: chiudere con una frase che resta']]}
];
const WORDS_PER_SECOND=2.3,TOPIC_MAX=600,SCRIPT_MAX=1500,COUNT=3;
const question=id=>QUESTIONS.find(q=>q.id===id);
const fallback=q=>q.options[q.def||0][1];
function pick(id,v){const q=question(id),o=q.options.find(x=>x[1]===v);if(v!=null&&v!==''&&!o)throw Error('Risposta non valida per «'+q.label+'».');return o?o[1]:fallback(q)}
const labelOf=(id,v)=>{const q=question(id);return (q.options.find(x=>x[1]===v)||q.options[q.def||0])[0]};
// Spoken Italian at ~2.3 words a second; a little room either side so the AI is not counting to the word.
function wordBudget(seconds){const s=Math.max(5,Math.min(180,Number(seconds)||30)),target=Math.round(s*WORDS_PER_SECOND);
 return {seconds:s,target,min:Math.round(target*.85),max:Math.round(target*1.1)}}
const countWords=t=>(String(t||'').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)||[]).length;
const secondsFor=t=>Math.round(countWords(t)/WORDS_PER_SECOND);
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
// The project profile (RadixAgents.profileFor) → what the questions start from: the topic and a tone close to the brand voice.
function prefill(profile){const p=profile||{},first=s=>(clean(s).match(/^.{12,}?[.!?](?=\s|$)/)||[clean(s)])[0];
 const topic=first(p.summary||p.positioning||'').slice(0,TOPIC_MAX),v=clean(p.voice).toLowerCase();
 const tone=/ironi|scherz|leggero|simpatic/.test(v)?QUESTIONS[2].options[3][1]:/energ|dinamic|motiv|grint/.test(v)?QUESTIONS[2].options[2][1]:/profession|autorevol|sobri|formale|istituzional|tecnic/.test(v)?QUESTIONS[2].options[1][1]:QUESTIONS[2].options[0][1];
 return {topic,tone}}
// The one request to the Video Producer: three distinct scripts, spoken text only, in a format parseScripts() reads back.
function scriptsPrompt(answers,{topic,project,avatar}={}){const a=answers||{},idea=clean(topic);
 if(idea.length<10)throw Error('Scrivi in una frase di cosa parla il video.');
 const b=wordBudget(pick('length',a.length)),p=project||{},lines=[];
 lines.push('Scrivi '+COUNT+' copioni diversi tra loro per un video verticale breve (Reel, Stories, TikTok) in cui l’avatar del progetto'+(p.name?' «'+clean(p.name).slice(0,80)+'»':'')+(avatar&&avatar.name?', «'+clean(avatar.name).slice(0,60)+'»,':'')+' parla in camera in prima persona.');
 lines.push('Di cosa parla: «'+idea.slice(0,TOPIC_MAX)+'».');
 lines.push('Obiettivo: '+pick('goal',a.goal)+'.');
 lines.push('Tono: '+pick('tone',a.tone)+'.');
 lines.push('Chiusura (call to action): '+pick('cta',a.cta)+'.');
 lines.push('Durata: '+b.seconds+' secondi. Ogni copione deve avere tra '+b.min+' e '+b.max+' parole (circa '+b.target+'), perché in italiano si dicono circa 2,3 parole al secondo.');
 lines.push('I tre copioni devono avere attacchi diversi (per esempio: una domanda, un dato concreto, una piccola storia). Prima frase forte: deve fermare lo scroll.');
 lines.push('Usa solo i fatti del progetto che conosci: niente numeri, prezzi, date o promesse inventate. Se manca un dato, scrivi la frase senza.');
 lines.push('Solo il testo che l’avatar dice: niente indicazioni di regia, niente parentesi, niente emoji, niente hashtag, niente elenchi. Italiano naturale, parlato.');
 lines.push('Rispondi solo in questo formato, senza testo prima o dopo:');
 for(let i=1;i<=COUNT;i++)lines.push('===COPIONE '+i+'===\nTITOLO: (un titolo di 3-6 parole)\nTESTO:\n(il copione)');
 lines.push('===FINE===');
 return lines.join('\n')}
// What the avatar says: no stage directions, markdown, emoji or speaker labels. HeyGen reads it as is.
function cleanScript(t){return String(t||'').replace(/\[[^\]]*\]/g,' ').replace(/\((?:pausa|sorride|musica|stacco|cut|b-?roll|in camera|voce)[^)]*\)/gi,' ')
 .replace(/[*_#>`]+/g,'').replace(/^\s*(?:testo|voce|avatar|speaker)\s*:\s*/gim,'').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu,'')
 .split(/\n+/).map(l=>clean(l).replace(/\s+([.,!?;:])/g,'$1')).filter(Boolean).join('\n').slice(0,SCRIPT_MAX).trim()}
function item(title,text,n){const body=cleanScript(text);return body&&countWords(body)>=5?{title:clean(String(title||'').replace(/[*_#"«»]/g,'')).slice(0,80)||'Copione '+n,text:body,words:countWords(body),seconds:secondsFor(body)}:null}
// The reply → up to three scripts. Reads the requested markers, tolerating markdown around them; falls back to
// a JSON list or to «Copione 1:» headings. Returns [] when nothing usable is there (the widget says so).
function parseScripts(text){const raw=String(text||'').replace(/\r/g,'').replace(/```[a-z]*\n?|```/gi,''),out=[];
 const marker=/^[ \t]*[=#*\-_ ]*\s*COPIONE\s*(?:N[°.]?\s*)?(\d)\s*[=#*\-_:. ]*[ \t]*(.*)$/gim;const heads=[];let m;
 while((m=marker.exec(raw)))heads.push({i:m.index,end:m.index+m[0].length,n:+m[1],rest:m[2]});
 if(heads.length){heads.forEach((h,k)=>{let body=raw.slice(h.end,k+1<heads.length?heads[k+1].i:raw.length).replace(/^[ \t]*[=#*_-]{2,}[ \t]*FINE\b[\s\S]*$/m,'');
   let title=(body.match(/^\s*[*_]*\s*TITOLO\s*[*_]*\s*:\s*(.+)$/im)||[])[1]||clean(h.rest.replace(/^[–—:\-\s]+/,'').replace(/[=*#_]+$/,''));
   body=body.replace(/^\s*[*_]*\s*TITOLO\s*[*_]*\s*:.*$/im,'').replace(/^\s*[*_]*\s*TESTO\s*[*_]*\s*:\s*/im,'').replace(/^\s*[*_]*\s*(?:DURATA|PAROLE)\s*[*_]*\s*:.*$/gim,'');
   const it=item(title,body,out.length+1);if(it&&out.length<COUNT)out.push(it)});
  if(out.length)return out}
 const j=raw.match(/[[{][\s\S]*[\]}]/);if(j){try{let d=JSON.parse(j[0]);if(d&&!Array.isArray(d))d=d.scripts||d.copioni||[];
   (Array.isArray(d)?d:[]).forEach(x=>{const it=typeof x==='string'?item('',x,out.length+1):x&&item(x.title||x.titolo,x.text||x.testo||x.script,out.length+1);if(it&&out.length<COUNT)out.push(it)})}catch(e){}}
 return out}
// The saved avatar on the project profile (Studio Avatar), the same rule as RadixAvatarStudio.savedAvatar.
const savedAvatar=profile=>{const a=profile&&profile.avatar;return a&&a.id&&a.voiceId?a:null};
// The body for POST /api/heygen — the same «generate» action Studio Avatar and the PED video tool use.
function draftBody(avatar,script){const a=avatar&&avatar.id&&avatar.voiceId?avatar:null;if(!a)throw Error('Il progetto non ha ancora un avatar salvato.');
 const s=cleanScript(script);if(countWords(s)<5)throw Error('Il copione è vuoto o troppo corto.');
 return {action:'generate',script:s,voiceId:String(a.voiceId),...(a.type==='talking_photo'?{talkingPhotoId:String(a.id)}:{avatarId:String(a.id)})}}

// ---- browser widget ----
let counter=0;
const doc=()=>root.document;
const el=(tag,text,cls)=>{const n=doc().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=el('button',text,cls||'');b.type='button';return b};
async function json(res,fallback){const d=await res.json().catch(()=>({}));if(!res.ok)throw Error(d.error||fallback);return d}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// ctx: {project (profile for the AI), memoryScope, avatar (saved or null), avatarUrl (Studio Avatar for this project), pollMs}
function videoStudio(ctx={}){
 const n=++counter,answers={},wrap=el('div',undefined,'tool photo-studio video-studio'),pre=prefill(ctx.project),avatar=ctx.avatar&&ctx.avatar.id&&ctx.avatar.voiceId?ctx.avatar:null;
 answers.tone=pre.tone;
 const steps=el('ol',undefined,'ps-steps');['Le domande','Scegli tra 3 copioni','Bozza video'].forEach((t,i)=>{const li=el('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 const who=el('div',undefined,'vs-who');
 const missing=()=>{const p=el('p','Questo progetto non ha ancora un avatar salvato: i copioni puoi scriverli, ma per la bozza video serve prima l’avatar. ','vs-missing');const a=el('a','Crea l’avatar nello Studio Avatar →');a.href=ctx.avatarUrl||'/agency/avatar.html';p.append(a);return p};
 if(avatar){if(/^https:\/\//.test(avatar.imageUrl||'')){const img=el('img');img.src=avatar.imageUrl;img.alt=avatar.name||'Avatar';who.append(img)}who.append(el('span','Parla '+(avatar.name||'l’avatar del progetto')+(avatar.voiceName?' · voce '+avatar.voiceName:'')))}
 else who.append(missing());
 const form=el('div',undefined,'ps-form'),qs=el('div',undefined,'ps-questions');
 for(const q of QUESTIONS){const fs=el('fieldset');fs.append(el('legend',q.label));q.options.forEach(([label,v])=>{const l=el('label',undefined,'ps-chip'),r=el('input');r.type='radio';r.name='vs-'+q.id+'-'+n;r.value=v;r.checked=v===(answers[q.id]||fallback(q));r.onchange=()=>{answers[q.id]=v;budget()};l.append(r,doc().createTextNode(' '+label));fs.append(l)});qs.append(fs)}
 const tl=el('label','Di cosa parla il video'),topic=el('textarea');topic.rows=2;topic.maxLength=TOPIC_MAX;topic.value=pre.topic;topic.placeholder='Es. perché conviene farsi seguire da un commercialista dal primo giorno di attività';tl.append(topic);
 const go=button('✦ Scrivi 3 copioni','primary'),cost=el('span','','muted'),status=el('p','','tool-status');status.setAttribute('role','status');
 const budget=()=>{const b=wordBudget(pick('length',answers.length));cost.textContent='Circa '+b.target+' parole per '+b.seconds+' secondi. Una chiamata AI al Video Producer: ti chiedo conferma prima.'};budget();
 const bar=el('div',undefined,'ps-actions');bar.append(go,cost);form.append(qs,tl,bar);
 const grid=el('div',undefined,'ps-grid vs-grid'),draft=el('div',undefined,'vs-draft');grid.hidden=draft.hidden=true;
 wrap.append(steps,who,form,status,grid,draft);setStep(1);
 const lock=on=>{go.disabled=topic.disabled=on;wrap.querySelectorAll('.ps-questions input').forEach(r=>r.disabled=on)};
 go.onclick=async()=>{let prompt;try{prompt=scriptsPrompt(answers,{topic:topic.value,project:ctx.project,avatar})}catch(e){status.textContent=e.message;topic.focus();return}
  const rt=root.RadixAgents;if(!rt||typeof rt.reply!=='function'){status.textContent='Gli agenti non si sono caricati: ricarica la pagina.';return}
  if(!root.confirm('Scrivere 3 copioni con il Video Producer AI? È una sola chiamata AI: usa crediti API.'))return;
  lock(true);setStep(2);status.textContent='Il Video Producer scrive i 3 copioni…';grid.hidden=false;grid.replaceChildren();draft.hidden=true;
  try{const r=await rt.reply({role:'video-producer',project:ctx.project,memoryScope:ctx.memoryScope,messages:[{role:'user',content:prompt}]});const list=parseScripts(r&&r.text);
   if(!list.length)throw Error('la risposta non contiene copioni leggibili. Riprova.');
   const b=wordBudget(pick('length',answers.length));status.textContent=(list.length<COUNT?'Sono arrivati '+list.length+' copioni su '+COUNT+'. ':'')+'Leggili, correggi se serve e scegli quello da far dire all’avatar.';
   grid.replaceChildren(...list.map((s,i)=>card(s,i,b)));go.textContent='↺ Riscrivi 3 copioni'}
  catch(e){status.textContent='Copioni non scritti: '+e.message;setStep(1);grid.hidden=true}
  finally{lock(false)}};
 function card(s,i,b){const f=el('article',undefined,'ps-card vs-card'),h=el('h3',(i+1)+' · '+s.title),ta=el('textarea'),meta=el('span','','muted vs-meta'),use=button('Scegli questo','primary');
  ta.rows=8;ta.maxLength=SCRIPT_MAX;ta.value=s.text;ta.setAttribute('aria-label','Copione '+(i+1));
  const upd=()=>{const w=countWords(ta.value);meta.textContent=w+' parole · circa '+secondsFor(ta.value)+' s'+(w>b.max*1.25?' · lungo per '+b.seconds+' s':'');meta.dataset.long=String(w>b.max*1.25)};upd();ta.oninput=upd;
  use.onclick=()=>choose(ta,f);f.append(h,ta,meta,use);return f}
 function choose(ta,card){grid.querySelectorAll('.vs-card').forEach(x=>x.dataset.chosen=String(x===card));setStep(3);draft.hidden=false;
  const head=el('h3','La bozza video');if(!avatar){draft.replaceChildren(head,missing());draft.scrollIntoView&&draft.scrollIntoView({behavior:'smooth',block:'nearest'});return}
  const make=button('🎬 Crea la bozza video','primary'),st=el('p','Il video usa il copione scelto, così come l’hai corretto. Formato verticale 9:16.','tool-status'),view=el('div',undefined,'vs-view');st.setAttribute('role','status');
  const acts=el('div',undefined,'ps-actions');acts.append(make,el('span','Una generazione HeyGen: ti chiedo conferma prima.','muted'));
  draft.replaceChildren(head,acts,st,view);draft.scrollIntoView&&draft.scrollIntoView({behavior:'smooth',block:'nearest'});
  make.onclick=async()=>{let body;try{body=draftBody(avatar,ta.value)}catch(e){st.textContent=e.message;return}
   if(!root.confirm('Creare la bozza video su HeyGen con «'+(avatar.name||'l’avatar')+'»? Consuma crediti HeyGen; il video resta una bozza da controllare.'))return;
   make.disabled=true;grid.querySelectorAll('button,textarea').forEach(x=>x.disabled=true);st.textContent='Avvio la bozza su HeyGen…';view.replaceChildren();
   try{const d=await json(await root.fetch('/api/heygen',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),'HeyGen non risponde');
    const every=ctx.pollMs==null?6000:ctx.pollMs;
    for(let i=0;i<=100;i++){const s=await json(await root.fetch('/api/heygen?action=status&videoId='+encodeURIComponent(d.videoId),{credentials:'same-origin'}),'Errore stato video'),x=String(s.status||'').toLowerCase();
     if(['completed','success','done'].includes(x)){st.textContent='Bozza pronta: guardala prima di pubblicarla (il link HeyGen scade dopo 7 giorni).';
      if(/^https:\/\//.test(String(s.videoUrl||''))){const v=el('video');v.controls=true;v.playsInline=true;v.src=s.videoUrl;if(/^https:\/\//.test(String(s.thumbnailUrl||'')))v.poster=s.thumbnailUrl;const a=el('a','Apri / scarica il video');a.href=s.videoUrl;a.target='_blank';a.rel='noopener noreferrer';view.replaceChildren(v,a)}
      else view.replaceChildren(el('p','HeyGen non ha dato il link: trovi il video nel tuo account HeyGen.','muted'));return}
     if(x==='failed'||x==='error')throw Error(s.error?String(s.error):'HeyGen ha segnalato un errore.');
     st.textContent='HeyGen genera la bozza… ('+i*Math.round(every/1000)+'s, stato: '+(x||'in corso')+')';await wait(every)}
    throw Error('Ci sta mettendo più del previsto: lo trovi poi nel tuo account HeyGen.')}
   catch(e){st.textContent='Bozza non creata: '+e.message;make.disabled=false;grid.querySelectorAll('button,textarea').forEach(x=>x.disabled=false)}}}
 return wrap}
return Object.freeze({QUESTIONS,WORDS_PER_SECOND,wordBudget,countWords,secondsFor,prefill,scriptsPrompt,cleanScript,parseScripts,savedAvatar,draftBody,labelOf,videoStudio});
});
