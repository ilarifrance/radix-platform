/* RADIX agent actions — the v3.7 tools that turn an agent's output into something real:
   carousel slides (PNG, optional AI photo backgrounds), HeyGen draft videos, Buffer queue and email.
   Ported from index.html v3.7 with the same safety rule: nothing leaves RADIX without a person
   pressing the button and confirming. The external services stay behind the existing /api/integrations. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixAgentMedia=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const RADIX_HEX=['#0F2D24','#6B7F72','#EDE6DE','#FAF9F6','#1F1F1F'];
const doc=()=>root.document;
const el=(tag,text,cls)=>{const n=doc().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=el('button',text,cls||'');b.type='button';return b};
// Local fallback; pages pass ctx.prefs {get,set} to share choices with the team.
const pref=(key,value)=>{try{if(value===undefined)return root.localStorage.getItem('radix-agent-pref:'+key);root.localStorage.setItem('radix-agent-pref:'+key,value)}catch(e){return null}};
async function json(res,fallback){const d=await res.json().catch(()=>({}));if(!res.ok)throw Error(d.error||fallback);return d}

// ---- carousel (---SLIDES--- n|#bg|#fg|testo ---FINE---) ----
function parseSlides(text){
 const m=/---SLIDES---([\s\S]*?)---FINE---/.exec(text||'');if(!m)return [];
 return m[1].split('\n').map(l=>l.trim()).filter(Boolean).map(l=>l.split('|')).filter(p=>p.length>=4).map(p=>({num:p[0].trim(),bg:p[1].trim(),fg:p[2].trim(),text:p.slice(3).join('|').trim()}))
  .filter(s=>/^#[0-9a-fA-F]{6}$/.test(s.bg)&&/^#[0-9a-fA-F]{6}$/.test(s.fg)&&s.text).slice(0,20);
}
const stripSlides=t=>String(t||'').replace(/\n?---SLIDES---[\s\S]*?---FINE---/,'').trim();
function shortLabel(p){if(!p)return 'RADIX';if(p.id==='radix')return 'RADIX';if(p.id==='personal')return 'FRANCESCO ILARI';return String(p.name||'').split(/\s[—–-]\s/)[0].toUpperCase().slice(0,28)}
function palette(p){const hexes=p&&p.visual?(String(p.visual).match(/#[0-9a-fA-F]{6}/g)||[]):[];return hexes.length>=2?hexes:RADIX_HEX}
function rgba(hex,a){const h=hex.replace('#','');return 'rgba('+parseInt(h.slice(0,2),16)+','+parseInt(h.slice(2,4),16)+','+parseInt(h.slice(4,6),16)+','+a+')'}
function wrapText(ctx,text,cx,cy,maxWidth,lineHeight){
 const lines=[];let line='';
 String(text).split(' ').forEach(w=>{const t=line?line+' '+w:w;if(ctx.measureText(t).width>maxWidth&&line){lines.push(line);line=w}else line=t});
 if(line)lines.push(line);const startY=cy-((lines.length-1)*lineHeight)/2;ctx.textAlign='center';lines.forEach((l,i)=>ctx.fillText(l,cx,startY+i*lineHeight));ctx.textAlign='left';
}
// Same design as v3.7 v2.5: 4:5 slide, glow alternating sides, numbered badge, progress dots.
function renderSlide(slide,index,total,bgImage,project){
 const c=doc().createElement('canvas');c.width=1080;c.height=1350;const ctx=c.getContext('2d'),fg=bgImage?'#FFFFFF':slide.fg;
 if(bgImage){
  const s=Math.max(c.width/bgImage.width,c.height/bgImage.height),w=bgImage.width*s,h=bgImage.height*s;ctx.drawImage(bgImage,(c.width-w)/2,(c.height-h)/2,w,h);
  const o=ctx.createLinearGradient(0,0,0,c.height);o.addColorStop(0,'rgba(15,15,15,0.35)');o.addColorStop(.55,'rgba(15,15,15,0.4)');o.addColorStop(1,'rgba(15,15,15,0.72)');ctx.fillStyle=o;ctx.fillRect(0,0,c.width,c.height);
 }else{
  ctx.fillStyle=slide.bg;ctx.fillRect(0,0,c.width,c.height);
  const right=index%2===0,bx=right?c.width*.88:c.width*.1,by=c.height*.1,g=ctx.createRadialGradient(bx,by,0,bx,by,c.width*.62);
  g.addColorStop(0,rgba(slide.fg,.14));g.addColorStop(1,rgba(slide.fg,0));ctx.fillStyle=g;ctx.fillRect(0,0,c.width,c.height);
  ctx.strokeStyle=rgba(slide.fg,.16);ctx.lineWidth=2;ctx.beginPath();if(right)ctx.arc(0,c.height,190,-Math.PI/2,0);else ctx.arc(c.width,c.height,190,Math.PI,Math.PI*1.5);ctx.stroke();
 }
 const kicker=shortLabel(project);ctx.fillStyle=fg;ctx.globalAlpha=.75;ctx.font='700 26px Montserrat, sans-serif';ctx.textBaseline='alphabetic';ctx.fillText(kicker,64,80);
 const kw=ctx.measureText(kicker).width;ctx.globalAlpha=1;ctx.strokeStyle=rgba(fg,.4);ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(64,96);ctx.lineTo(64+kw,96);ctx.stroke();
 const r=27,bx2=c.width-64-r,by2=64+r;ctx.beginPath();ctx.arc(bx2,by2,r,0,Math.PI*2);ctx.fillStyle=rgba(fg,.15);ctx.fill();ctx.fillStyle=fg;ctx.font='700 21px Inter, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(index+1),bx2,by2+1);ctx.textAlign='left';
 const len=slide.text.length,size=len<45?68:len<80?58:len<130?48:len<190?40:34;ctx.fillStyle=fg;ctx.font='800 '+size+'px Montserrat, sans-serif';ctx.textBaseline='middle';wrapText(ctx,slide.text,c.width/2,c.height/2,c.width-176,Math.round(size*1.2));
 if(total>1){const dr=5,gap=16,tw=total*dr*2+(total-1)*gap,sx=c.width/2-tw/2+dr,dy=c.height-60;for(let d=0;d<total;d++){ctx.beginPath();ctx.arc(sx+d*(dr*2+gap),dy,d===index?dr+1.5:dr,0,Math.PI*2);ctx.fillStyle=rgba(fg,d===index?.95:.3);ctx.fill()}}
 if(index===0&&total>1){ctx.fillStyle=fg;ctx.globalAlpha=.55;ctx.font='600 20px Inter, sans-serif';ctx.textAlign='right';ctx.fillText('scorri →',c.width-60,c.height-110);ctx.textAlign='left';ctx.globalAlpha=1}
 return c;
}
function downloadCanvas(canvas,name){canvas.toBlob(b=>{if(!b)return;const u=URL.createObjectURL(b),a=el('a');a.href=u;a.download=name;doc().body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)},'image/png')}
function slideImagePrompt(slide,project){
 const subject=project&&project.id!=='radix'&&project.summary?'un\'ambientazione coerente con questo progetto: '+String(project.summary).slice(0,220):'un ambiente business/startup italiano moderno (ufficio, team al lavoro, una presentazione)';
 return 'Fotografia professionale in stile editoriale per un post LinkedIn B2B, non uno scatto da stock photo generico. Soggetto: '+subject+'. Atmosfera e composizione legate a questo concetto: "'+slide.text+
  '". Illuminazione naturale, palette cromatica tenue coerente con questi colori (la palette del brand): '+palette(project).slice(0,3).join(', ')+'. Nessun testo, nessuna scritta, nessun logo nell\'immagine. Composizione con aree di spazio negativo, pensata per avere del testo sovrapposto sopra.';
}
async function slideBackground(slide,project){
 const d=await json(await root.fetch('/api/openai-image',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({prompt:slideImagePrompt(slide,project)})}),'Errore generazione immagine');
 if(!/^data:image\//.test(String(d.image||'')))throw Error('Immagine ricevuta non valida');
 return new Promise((res,rej)=>{const img=new Image();img.onload=()=>res(img);img.onerror=()=>rej(Error('Immagine ricevuta non valida'));img.src=d.image});
}
function carouselTool(text,{project,prefix='radix-carosello'}={}){
 const slides=parseSlides(text);if(!slides.length)return null;
 const wrap=el('div',undefined,'tool'),open=button('🎨 Genera immagini carosello ('+slides.length+')','primary'),bg=new Array(slides.length).fill(null);let lastError='';
 wrap.append(open);
 async function draw(){
  try{if(doc().fonts&&doc().fonts.ready)await doc().fonts.ready}catch(e){}
  const box=el('div',undefined,'gallery'),thumbs=el('div',undefined,'thumbs'),canvases=slides.map((s,i)=>renderSlide(s,i,slides.length,bg[i],project));
  canvases.forEach((c,i)=>{const t=el('div',undefined,'thumb');c.setAttribute('role','img');c.setAttribute('aria-label','Slide '+(i+1)+': '+slides[i].text);const b=button('Scarica '+(i+1));b.onclick=()=>downloadCanvas(c,prefix+'-slide'+(i+1)+'.png');t.append(c,b);thumbs.append(t)});
  const row=el('div',undefined,'actions'),all=button('Scarica tutte ('+canvases.length+')','primary');all.onclick=()=>canvases.forEach((c,i)=>setTimeout(()=>downloadCanvas(c,prefix+'-slide'+(i+1)+'.png'),i*250));
  const ai=button(bg.some(Boolean)?'🖼️ Rigenera sfondi AI':'🖼️ Genera sfondi fotografici AI (beta)'),st=el('span',lastError,'tool-status');
  ai.title='Usa la chiave OpenAI configurata su Vercel e consuma crediti a ogni immagine';
  ai.onclick=async()=>{
   if(!root.confirm('Generare '+slides.length+' immagini con OpenAI? Ogni immagine consuma crediti API.'))return;
   ai.disabled=true;lastError='';
   for(let i=0;i<slides.length;i++){ai.textContent='Genero '+(i+1)+'/'+slides.length+'…';try{bg[i]=await slideBackground(slides[i],project)}catch(e){lastError=e.message||'Errore generazione sfondo AI';if(/OPENAI_API_KEY/.test(lastError))break}}
   const next=await draw();box.replaceWith(next);
  };
  row.append(all,ai,st);box.append(thumbs,row);return box;
 }
 open.onclick=async()=>{open.hidden=true;wrap.append(await draw())};
 return wrap;
}

// ---- HeyGen draft video (AI Specialist) ----
let heygenLists=null;
async function heygenOptions(){
 if(heygenLists)return heygenLists;
 const [a,v]=await Promise.all([root.fetch('/api/heygen?action=avatars',{credentials:'same-origin'}).then(r=>json(r,'Errore avatar')),root.fetch('/api/heygen?action=voices',{credentials:'same-origin'}).then(r=>json(r,'Errore voci'))]);
 return heygenLists={avatars:a.avatars||[],voices:v.voices||[]};
}
function select(labelText,items,saved){const l=el('label',labelText),s=el('select');items.forEach(i=>{const o=el('option',i.name+(i.language?' ('+i.language+')':''));o.value=i.id;s.append(o)});if(saved&&items.some(i=>i.id===saved))s.value=saved;l.append(s);return [l,s]}
function videoTool(text,ctx={}){
 const P=prefsOf(ctx),script=String(text||'').trim();if(!script)return null;
 const wrap=el('div',undefined,'tool'),open=button('🎬 Genera video bozza (HeyGen)','primary');wrap.append(open);
 open.onclick=async()=>{
  open.disabled=true;open.textContent='Carico avatar e voci…';
  try{
   const lists=await heygenOptions();open.hidden=true;const panel=el('div',undefined,'panel'),status=el('p','','tool-status');
   if(!lists.avatars.length||!lists.voices.length){status.textContent='Nessun avatar o voce trovati sull’account HeyGen collegato.';panel.append(status);wrap.append(panel);return}
   const [al,as]=select('Avatar',lists.avatars,P.get('heygen-avatar')),[vl,vs]=select('Voce',lists.voices,P.get('heygen-voice')),go=button('Genera bozza','primary');
   panel.append(al,vl,go,status);wrap.append(panel);
   go.onclick=async()=>{
    if(!root.confirm('Generare un video bozza su HeyGen? Consuma crediti HeyGen; il video resta una bozza da controllare.'))return;
    go.disabled=as.disabled=vs.disabled=true;P.set('heygen-avatar',as.value);P.set('heygen-voice',vs.value);status.textContent='Avvio la generazione…';
    try{
     const d=await json(await root.fetch('/api/heygen',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action:'generate',script,avatarId:as.value,voiceId:vs.value})}),'Errore avvio generazione');
     for(let attempt=0;attempt<=100;attempt++){
      const s=await json(await root.fetch('/api/heygen?action=status&videoId='+encodeURIComponent(d.videoId),{credentials:'same-origin'}),'Errore stato video'),state=String(s.status||'').toLowerCase();
      if(['completed','success','done'].includes(state)){
       status.textContent='Bozza pronta: da controllare prima di pubblicare (il link scade dopo 7 giorni).';
       if(/^https:\/\//.test(String(s.videoUrl||''))){const v=el('video');v.controls=true;v.src=s.videoUrl;const a=el('a','Apri / scarica video');a.href=s.videoUrl;a.target='_blank';a.rel='noopener noreferrer';panel.append(v,a)}
       return;
      }
      if(state==='failed'||state==='error')throw Error(s.error?String(s.error):'HeyGen ha segnalato un errore nella generazione.');
      status.textContent='Genero il video bozza… ('+attempt*6+'s, stato: '+(state||'in corso')+')';await new Promise(r=>setTimeout(r,6000));
     }
     throw Error('Il video sta impiegando più del previsto. Riprova più tardi da HeyGen.');
    }catch(e){status.textContent='Non riuscito: '+e.message;go.disabled=as.disabled=vs.disabled=false}
   };
  }catch(e){open.disabled=false;open.textContent='🎬 Genera video bozza (HeyGen)';wrap.append(el('p','Non riuscito: '+e.message,'tool-status'))}
 };
 return wrap;
}

// ---- Buffer queue (Copywriter) ----
let bufferChannels=null;
// opts.locked keeps the text read-only (PED: only the approved version goes out); opts.onQueued records the result.
function bufferTool(text,opts={}){
 const body=String(text||'').trim();if(!body)return null;
 const wrap=el('div',undefined,'tool'),open=button('📤 Invia a Buffer','primary');wrap.append(open);
 open.onclick=async()=>{
  open.disabled=true;open.textContent='Carico i canali…';
  try{
   bufferChannels=bufferChannels||((await json(await root.fetch('/api/buffer?action=channels',{credentials:'same-origin'}),'Errore canali Buffer')).channels||[]);
   open.hidden=true;const panel=el('div',undefined,'panel'),status=el('p','','tool-status');
   if(!bufferChannels.length){status.textContent='Nessun canale trovato sull’account Buffer collegato.';panel.append(status);wrap.append(panel);return}
   const [cl,cs]=select('Canale',bufferChannels.map(c=>({id:c.id,name:c.name+(c.service?' ('+c.service+')':'')})),prefsOf(opts).get('buffer-channel'));
   const lt=el('label','Testo del post'),ta=el('textarea');ta.value=body;ta.rows=8;ta.readOnly=!!opts.locked;lt.append(ta);const go=button('Metti in coda su Buffer','primary');
   panel.append(cl,lt,go,status);wrap.append(panel);
   go.onclick=async()=>{
    const ch=bufferChannels.find(c=>c.id===cs.value);
    if(!root.confirm('Questo mette DAVVERO in coda di pubblicazione su Buffer, canale "'+(ch?ch.name:cs.value)+'": verrà pubblicato al prossimo slot libero del calendario, non è una bozza salvata. Confermi l’invio?'))return;
    go.disabled=cs.disabled=ta.disabled=true;prefsOf(opts).set('buffer-channel',cs.value);status.textContent='Invio in corso…';
    try{const d=await json(await root.fetch('/api/buffer',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action:'create',channelId:cs.value,text:ta.value})}),'Errore invio');
     status.textContent='Messo in coda su Buffer'+(d.dueAt?': uscirà il '+new Date(d.dueAt).toLocaleString('it-IT'):'')+'.';
     if(typeof opts.onQueued==='function')opts.onQueued({service:'buffer',channelId:cs.value,channelName:ch?ch.name:'',dueAt:d.dueAt||null,queuedAt:new Date().toISOString()})}
    catch(e){status.textContent='Non riuscito: '+e.message;go.disabled=cs.disabled=ta.disabled=false}
   };
  }catch(e){open.disabled=false;open.textContent='📤 Invia a Buffer';wrap.append(el('p','Non riuscito: '+e.message,'tool-status'))}
 };
 return wrap;
}

// ---- email (Specialista Email Outreach): one recipient, edited and confirmed each time ----
function parseEmailDraft(text){const t=String(text||''),s=/Oggetto:\s*(.+)/i.exec(t),b=/Corpo:\s*([\s\S]*)/i.exec(t);return {subject:s?s[1].trim():'',body:b?b[1].trim():t.trim()}}
function emailTool(text){
 const draftText=String(text||'').trim();if(!draftText)return null;const draft=parseEmailDraft(draftText);
 const wrap=el('div',undefined,'tool'),open=button('✉️ Invia questa email','primary');wrap.append(open);
 open.onclick=()=>{
  open.hidden=true;const panel=el('div',undefined,'panel'),status=el('p','','tool-status');
  const lto=el('label','A'),to=el('input');to.type='email';to.placeholder='destinatario@azienda.it';lto.append(to);
  const ls=el('label','Oggetto'),subj=el('input');subj.value=draft.subject;ls.append(subj);
  const lb=el('label','Testo'),ta=el('textarea');ta.rows=10;ta.value=draft.body;lb.append(ta);const go=button('Invia email','primary');
  panel.append(lto,ls,lb,go,status);wrap.append(panel);
  go.onclick=async()=>{
   const dest=to.value.trim();if(!dest||!to.checkValidity()){status.textContent='Inserisci un destinatario valido.';return}
   if(!root.confirm('Questo invia DAVVERO un’email a "'+dest+'" dalla tua casella: non è una bozza salvata. Confermi l’invio?'))return;
   go.disabled=to.disabled=subj.disabled=ta.disabled=true;status.textContent='Invio in corso…';
   try{await json(await root.fetch('/api/send-email',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({to:dest,subject:subj.value,body:ta.value,confirm:true})}),'Errore invio');status.textContent='Email inviata a '+dest+'.'}
   catch(e){status.textContent='Non riuscito: '+e.message;go.disabled=to.disabled=subj.disabled=ta.disabled=false}
  };
 };
 return wrap;
}

// Which tools an agent's output gets, as in v3.7 renderMessages.
function prefsOf(ctx){const p=ctx&&ctx.prefs;return p&&typeof p.get==='function'&&typeof p.set==='function'?p:{get:k=>pref(k),set:(k,v)=>pref(k,v)}}
const SERVICE_NAMES={heygen:'HeyGen',buffer:'Buffer',email:'l’email (Gmail)'};
// A tool whose service has no key on this deployment stays visible but disabled, with the reason.
function markService(tool,service){
 if(!tool||!root.RadixWorkspace||!root.RadixWorkspace.integrations)return tool;
 tool.dataset.service=service;
 root.RadixWorkspace.integrations().then(map=>{
  if(!map||map[service]!==false)return;
  tool.querySelectorAll('button').forEach(b=>{b.disabled=true});tool.dataset.connected='false';
  tool.append(el('p','Non collegato: manca la chiave di '+SERVICE_NAMES[service]+' sul server. Chiedi all’amministratore di aggiungerla su Vercel.','tool-status'));
 });
 return tool;
}
function toolsFor(agentId,text,ctx){
 const list=[];
 if(agentId==='art-director')list.push(carouselTool(text,ctx));
 if(agentId==='ai-specialist')list.push(markService(videoTool(text,ctx),'heygen'));
 if(agentId==='copywriter')list.push(markService(bufferTool(text,{prefs:ctx&&ctx.prefs}),'buffer'));
 if(agentId==='comm-email-outreach')list.push(markService(emailTool(text),'email'));
 return list.filter(Boolean);
}

return Object.freeze({RADIX_HEX,parseSlides,stripSlides,shortLabel,palette,slideImagePrompt,parseEmailDraft,renderSlide,carouselTool,videoTool,bufferTool,emailTool,toolsFor});
});
