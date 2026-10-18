/* Studio Avatar: questions → three proposals → choice → voice → saved on the project for the PED videos.
   Every HeyGen generation starts from a click and an explicit confirmation (it consumes credits). */
(function(){
'use strict';
const ws=window.RadixWorkspace,studio=window.RadixAvatarStudio,rt=window.RadixAgents,$=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
let projects=[],project=null,path='',chosen=null,voice=null,voices=null,busy=false;
const say=t=>{$('avMessage').textContent=t||''};
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function api(method,query,body){const r=await fetch('/api/heygen'+(query?'?'+query:''),{method,credentials:'same-origin',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'HeyGen non risponde ('+r.status+')');return d}
function step(n){document.querySelectorAll('[data-panel]').forEach(p=>{p.hidden=Number(p.dataset.panel)!==n});document.querySelectorAll('#avSteps li').forEach(li=>{const s=Number(li.dataset.step);li.dataset.state=s<n?'done':s===n?'current':'todo'});$('avSteps').hidden=false;window.scrollTo({top:0,behavior:'smooth'})}

// ---- project ----
function showSaved(){const a=studio.savedAvatar(project&&project.profile);$('avSaved').hidden=!a;if(!a)return;
 $('avSavedName').textContent=a.name;$('avSavedVoice').textContent=a.voiceName?'Voce: '+a.voiceName:'';const img=$('avSavedImg');img.hidden=!a.imageUrl;if(a.imageUrl)img.src=a.imageUrl;img.alt=a.name;
 $('avToPed').href='/project-editorial.html?project='+encodeURIComponent(project.id)+'#ped'}
async function openProject(id){project=await ws.projects.get(id);$('avProject').value=project.id;$('avTitle').textContent='L’avatar di '+project.name;
 const u=new URL(location.href);u.searchParams.set('project',project.id);history.replaceState(null,'',u);
 const a=studio.savedAvatar(project.profile);showSaved();document.querySelectorAll('[data-panel]').forEach(p=>{p.hidden=!!a||p.dataset.panel!=='1'});$('avSteps').hidden=!!a;if(!a)step(1);
 $('avName').value=$('avPhotoName').value=String(project.name||'').split(/\s[—–-]\s/)[0].slice(0,80);
 $('avAppearance').value=studio.appearanceHint(rt&&rt.profileFor?rt.profileFor(project):project.profile)}
async function load(){try{if(!(await ws.ready())){say('Accedi dal Command Center e riprova.');return}
  projects=(await ws.projects.list()).filter(p=>p.status!=='archived');if(!projects.length){say('Nessun progetto: creane uno da Agency.');return}
  $('avProject').replaceChildren(...projects.map(p=>{const o=node('option',p.name);o.value=p.id;return o}));
  const want=String(params.get('project')||'').toLowerCase();await openProject(projects.some(p=>p.id===want)?want:projects[0].id)}
 catch(e){say('Non riesco a caricare i progetti: '+e.message)}}

// ---- 1 · how do you want it ----
function renderQuestions(){$('avQuestions').replaceChildren(...studio.QUESTIONS.map(q=>{const f=node('fieldset');f.append(node('legend',q.label));
 q.options.forEach(([label,value],i)=>{const l=node('label',null,'av-chip'),r=node('input');r.type='radio';r.name=q.id;r.value=value;r.checked=i===0;l.append(r,node('span',label));f.append(l)});return f}))}
function answers(){const a={appearance:$('avAppearance').value};for(const q of studio.QUESTIONS){const c=document.querySelector('input[name="'+q.id+'"]:checked');if(c)a[q.id]=c.value}return a}
function choosePath(p){path=p;document.querySelectorAll('.av-path').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.path===p)));$('avDesign').hidden=p!=='design';$('avPhoto').hidden=p!=='photo';$('avLibrary').hidden=p!=='library';if(p==='library')loadLibrary()}
async function design(e){e.preventDefault();if(busy)return;let payload;try{payload=studio.designPayload(answers(),$('avName').value)}catch(err){say(err.message);return}
 if(!confirm('Generare le proposte con HeyGen? Consuma crediti HeyGen.'))return;busy=true;$('avGenerate').disabled=true;step(2);$('avExamples').replaceChildren();$('avProgress').textContent='HeyGen sta disegnando le proposte…';
 try{const {generationId}=await api('POST','',{action:'design',confirm:true,name:payload.name,answers:answers()});
  for(let i=0;i<80;i++){const g=await api('GET','action=generation&id='+encodeURIComponent(generationId));const st=String(g.status||'').toLowerCase();
   if(st==='success'||st==='completed'){if(!g.images.length)throw Error('HeyGen non ha restituito immagini.');showExamples(g.images);return}
   if(st==='failed'||st==='error')throw Error(g.error||'HeyGen non è riuscito a generare le proposte.');
   $('avProgress').textContent='HeyGen sta disegnando le proposte… ('+(i*3)+'s)';await wait(3000)}
  throw Error('Ci sta mettendo troppo: riprova tra poco.')}
 catch(err){$('avProgress').textContent='Non riuscito: '+err.message}finally{busy=false;$('avGenerate').disabled=false}}
function showExamples(images){$('avProgress').textContent='Ecco '+images.length+(images.length===1?' proposta':' proposte')+': scegli quella che ti rappresenta meglio.';
 $('avExamples').replaceChildren(...images.map((im,i)=>{const card=node('figure',null,'av-example'),img=node('img');img.src=im.url;img.alt='Proposta '+(i+1);const b=node('button','Scegli questa','av-primary');b.type='button';b.onclick=()=>createFrom(im.key,im.url,$('avName').value,b);card.append(img,node('figcaption','Proposta '+(i+1)),b);return card}))}
async function createFrom(imageKey,imageUrl,name,btn){if(busy)return;if(!confirm('Creare l’avatar su HeyGen con questa immagine? Consuma crediti HeyGen.'))return;if(btn)btn.disabled=true;if(!(await createFromConfirmed(imageKey,imageUrl,name))&&btn)btn.disabled=false}
// The photo shrunk to at most 1280px, as JPEG, so it stays under the upload limit.
function shrink(file){return new Promise((ok,ko)=>{const u=URL.createObjectURL(file),img=new Image();img.onload=()=>{const k=Math.min(1,1280/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(u);ok(c.toDataURL('image/jpeg',.9))};img.onerror=()=>{URL.revokeObjectURL(u);ko(Error('Foto non leggibile.'))};img.src=u})}
let photoData='';
async function pickPhoto(){const f=$('avFile').files[0];photoData='';$('avUsePhoto').disabled=true;if(!f)return;if(!/^image\/(jpeg|png)$/.test(f.type)){say('Carica una foto JPG o PNG.');return}
 try{photoData=await shrink(f);const p=$('avPhotoPreview');p.src=photoData;p.hidden=false;$('avUsePhoto').disabled=false;say('')}catch(e){say(e.message)}}
async function usePhoto(e){e.preventDefault();if(!photoData||busy)return;if(!confirm('Caricare la foto su HeyGen e crearne l’avatar? Consuma crediti HeyGen.'))return;busy=true;$('avUsePhoto').disabled=true;say('Carico la foto su HeyGen…');
 try{const up=await api('POST','',{action:'upload',dataUrl:photoData});busy=false;await createFromConfirmed(up.imageKey,up.url||photoData,$('avPhotoName').value)}catch(err){say('Foto non caricata: '+err.message);$('avUsePhoto').disabled=false}finally{busy=false}}
// Returns true when the avatar exists on HeyGen and the voice step is open.
async function createFromConfirmed(imageKey,imageUrl,name){busy=true;say('Creo l’avatar su HeyGen…');
 try{const d=await api('POST','',{action:'createAvatar',confirm:true,imageKey,name});chosen={type:'talking_photo',id:d.avatarId,groupId:d.groupId||'',name:String(name||'Avatar').trim()||'Avatar',imageUrl:d.imageUrl||(/^https:/.test(imageUrl)?imageUrl:'')};
  say(d.trainError?'Avatar creato. HeyGen non ha avviato l’addestramento per nuovi look ('+d.trainError+'): per i video non serve.':'Avatar creato.');busy=false;await toVoices();return true}
 catch(err){say('Avatar non creato: '+err.message);$('avUsePhoto').disabled=false;return false}finally{busy=false}}
async function loadLibrary(){const box=$('avLibrary');box.replaceChildren(node('p','Carico gli avatar del tuo account HeyGen…','av-muted'));
 try{const d=await api('GET','action=avatars');const list=(d.avatars||[]).slice(0,30);if(!list.length){box.replaceChildren(node('p','Nessun avatar sul tuo account HeyGen: prova «Lo disegna l’AI».','av-muted'));return}
  box.replaceChildren(...list.map(a=>{const card=node('figure',null,'av-example');if(/^https:/.test(a.previewImageUrl||'')){const img=node('img');img.src=a.previewImageUrl;img.alt=a.name;card.append(img)}const b=node('button','Usa '+a.name,'av-primary');b.type='button';b.onclick=()=>{chosen={type:'avatar',id:a.id,name:a.name,imageUrl:a.previewImageUrl||''};toVoices()};card.append(node('figcaption',a.name),b);return card}))}
 catch(e){box.replaceChildren(node('p','Non riesco a leggere gli avatar: '+e.message,'av-muted'))}}

// ---- 3 · voice ----
async function toVoices(){step(3);const box=$('avVoices');box.replaceChildren(node('p','Carico le voci…','av-muted'));
 try{if(!voices)voices=(await api('GET','action=voices')).voices||[];const g=(document.querySelector('input[name="gender"]:checked')||{}).value;const three=studio.pickVoices(voices,{gender:path==='design'?g:''});
  box.replaceChildren(...(three.length?three:voices.slice(0,3)).map(v=>{const card=node('div',null,'av-voice');card.append(node('b',v.name),node('small',[v.language,v.gender].filter(Boolean).join(' · ')));if(v.previewAudio){const a=node('audio');a.controls=true;a.preload='none';a.src=v.previewAudio;card.append(a)}const b=node('button','Scegli questa voce','av-primary');b.type='button';b.onclick=()=>chooseVoice(v);card.append(b);return card}));
  const all=$('avAllVoices');all.replaceChildren(node('option','Scegli un’altra voce…'),...voices.map(v=>{const o=node('option',v.name+(v.language?' ('+v.language+')':''));o.value=v.id;return o}));all.onchange=()=>{const v=voices.find(x=>x.id===all.value);if(v)chooseVoice(v)}}
 catch(e){box.replaceChildren(node('p','Non riesco a leggere le voci: '+e.message,'av-muted'))}}
function chooseVoice(v){voice=v;step(4);$('avChosen').textContent=chosen.name+' · voce '+v.name;const img=$('avChosenImg');img.hidden=!chosen.imageUrl;if(chosen.imageUrl)img.src=chosen.imageUrl;img.alt=chosen.name}

// ---- 4 · try and save ----
async function save(){if(busy)return;let record;try{record=studio.avatarRecord({...chosen,voiceId:voice&&voice.id,voiceName:voice&&voice.name})}catch(e){say(e.message);return}
 busy=true;$('avSave').disabled=true;try{const saved=await ws.projects.update(project.id,project.revision,{profile:{...(project.profile||{}),avatar:record}});project={...project,...saved};showSaved();document.querySelectorAll('[data-panel]').forEach(p=>{p.hidden=true});$('avSteps').hidden=true;say('Avatar salvato: i video del piano editoriale partono con '+record.name+'.')}
 catch(e){say('Non salvato: '+e.message+(/revision|versione|modificat/i.test(e.message)?' Ricarica la pagina e riprova.':''))}finally{busy=false;$('avSave').disabled=false}}
async function tryVideo(){if(busy||!chosen||!voice)return;const script=$('avScript').value.trim();if(!script){say('Scrivi un testo di prova.');return}
 if(!confirm('Generare un video di prova su HeyGen? Consuma crediti HeyGen.'))return;busy=true;$('avTry').disabled=true;const st=$('avTryState');st.textContent='Avvio il video…';
 try{const d=await api('POST','',{action:'generate',script,voiceId:voice.id,...(chosen.type==='talking_photo'?{talkingPhotoId:chosen.id}:{avatarId:chosen.id})});
  for(let i=0;i<100;i++){const s=await api('GET','action=status&videoId='+encodeURIComponent(d.videoId));const x=String(s.status||'').toLowerCase();
   if(['completed','success','done'].includes(x)){st.textContent='Video di prova pronto.';if(/^https:\/\//.test(s.videoUrl||'')){const v=node('video');v.controls=true;v.src=s.videoUrl;$('avVideo').replaceChildren(v)}return}
   if(x==='failed'||x==='error')throw Error(s.error||'HeyGen ha segnalato un errore.');st.textContent='Genero il video… ('+i*6+'s)';await wait(6000)}
  throw Error('Ci sta mettendo troppo: lo trovi poi su HeyGen.')}
 catch(e){st.textContent='Non riuscito: '+e.message}finally{busy=false;$('avTry').disabled=false}}

renderQuestions();
document.querySelectorAll('.av-path').forEach(b=>b.onclick=()=>choosePath(b.dataset.path));
$('avDesign').onsubmit=design;$('avPhoto').onsubmit=usePhoto;$('avFile').onchange=pickPhoto;$('avAgain').onclick=()=>step(1);
$('avSave').onclick=save;$('avTry').onclick=tryVideo;$('avProject').onchange=()=>openProject($('avProject').value);
$('avRedo').onclick=()=>{$('avSaved').hidden=true;chosen=voice=null;step(1)};
load();
})();
