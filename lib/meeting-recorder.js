/* RADIX Meeting recorder: the audio side of the «Meeting» app (meeting.html), in the browser only.
   - Store: meetings and their audio segments in IndexedDB, so a recording survives a reload, a crash or a closed tab
     until it is transcribed. Each segment is rewritten every few seconds while it records.
   - Recorder: «Di persona» records the microphone; «Call online» (computer) mixes the microphone with the audio of the
     shared tab or screen (Meet/Teams in the browser), because a web page cannot hear other apps directly.
     A segment closes on its own before SEGMENT_MAX_BYTES so each one fits one transcription call.
   - File: an audio file recorded elsewhere (phone voice memo, Teams recording) becomes segments: small files go as
     they are, larger ones are decoded and cut into 16 kHz mono WAV pieces.
   No network here: the page sends the segments to /api/integrations/transcribe after the person confirms. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixMeetingRecorder=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const DB='radix-meeting',VERSION=1;
const MAX_BYTES=2800000;
const TIMESLICE=4000;

// ---- store ----
let dbPromise=null;
function open(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  if(!root.indexedDB)return reject(Error('Questo browser non permette di salvare le registrazioni.'));
  const req=root.indexedDB.open(DB,VERSION);
  req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('meetings'))db.createObjectStore('meetings',{keyPath:'id'});if(!db.objectStoreNames.contains('audio'))db.createObjectStore('audio')};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>{dbPromise=null;reject(req.error||Error('Archivio locale non disponibile'))};
 });
 return dbPromise;
}
function tx(store,mode,fn){return open().then(db=>new Promise((resolve,reject)=>{const t=db.transaction(store,mode),s=t.objectStore(store);let out;const r=fn(s);if(r)r.onsuccess=()=>{out=r.result};t.oncomplete=()=>resolve(out);t.onerror=t.onabort=()=>reject(t.error||Error('Salvataggio locale non riuscito'))}))}
const store={
 list:()=>tx('meetings','readonly',s=>s.getAll()).then(a=>(a||[]).sort((x,y)=>String(y.createdAt).localeCompare(String(x.createdAt)))),
 get:id=>tx('meetings','readonly',s=>s.get(id)),
 put:m=>tx('meetings','readwrite',s=>s.put(m)).then(()=>m),
 audio:(id,n)=>tx('audio','readonly',s=>s.get(id+'#'+n)),
 putAudio:(id,n,blob)=>tx('audio','readwrite',s=>s.put(blob,id+'#'+n)),
 // A meeting and all its audio; the audio alone once the meeting is saved in RADIX (the text stays).
 remove:async id=>{const m=await store.get(id);await tx('audio','readwrite',s=>{(m&&m.segments||[]).forEach(x=>s.delete(id+'#'+x.n));return null});await tx('meetings','readwrite',s=>s.delete(id))},
 dropAudio:async m=>{await tx('audio','readwrite',s=>{(m.segments||[]).forEach(x=>s.delete(m.id+'#'+x.n));return null});m.audioDropped=true;return store.put(m)}
};
function newId(){const r=root.crypto&&root.crypto.randomUUID?root.crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);return 'mt-'+r}

// ---- what this browser can do ----
const MIMES=['audio/webm;codecs=opus','audio/webm','audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/ogg;codecs=opus'];
function pickMime(){const MR=root.MediaRecorder;if(!MR)return '';if(typeof MR.isTypeSupported!=='function')return '';return MIMES.find(m=>MR.isTypeSupported(m))||''}
function support(){const nav=root.navigator||{},md=nav.mediaDevices||{};const ua=String(nav.userAgent||'');const mobile=/Android|iPhone|iPad|iPod|Mobile/i.test(ua)||(nav.maxTouchPoints>1&&/Macintosh/.test(ua));
 return {record:!!(root.MediaRecorder&&md.getUserMedia),call:!!(root.MediaRecorder&&md.getDisplayMedia)&&!mobile,mobile,mime:pickMime()}}

// ---- recorder ----
// opts: {source:'room'|'call', meeting, onLevel(0..1), onState({state,seconds,segments,bytes}), onError(err)}
function createRecorder(opts){
 const o=opts||{},m=o.meeting,doc=root.document;
 let streams=[],mixed=null,ctx=null,analyser=null,rec=null,chunks=[],bytes=0,segN=(m.segments||[]).reduce((a,s)=>Math.max(a,s.n+1),0);
 let state='idle',segStart=0,segAcc=0,elapsed=m.seconds||0,levelTimer=null,wake=null,saving=Promise.resolve(),rotating=false;
 const emit=()=>{if(o.onState)try{o.onState({state,seconds:seconds(),segments:m.segments.length,bytes})}catch(e){}};
 const segSeconds=()=>segAcc+(state==='recording'&&segStart?(Date.now()-segStart)/1000:0);
 const seconds=()=>elapsed+segSeconds();
 async function wakeLock(on){try{if(on&&root.navigator.wakeLock&&!wake){wake=await root.navigator.wakeLock.request('screen');wake.addEventListener('release',()=>{wake=null})}else if(!on&&wake){await wake.release();wake=null}}catch(e){wake=null}}
 function level(){if(!analyser)return;const a=new Uint8Array(analyser.fftSize);analyser.getByteTimeDomainData(a);let peak=0;for(const v of a)peak=Math.max(peak,Math.abs(v-128));if(o.onLevel)o.onLevel(Math.min(1,peak/64))}
 async function streamsFor(source){
  const md=root.navigator.mediaDevices;
  const mic=await md.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}});
  const list=[mic];
  if(source==='call'){
   let screen;
   try{screen=await md.getDisplayMedia({video:true,audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},systemAudio:'include',selfBrowserSurface:'exclude',preferCurrentTab:false})}
   catch(e){mic.getTracks().forEach(t=>t.stop());throw Error('Condivisione annullata: scegli la scheda della call e spunta «Condividi audio».')}
   if(!screen.getAudioTracks().length){screen.getTracks().forEach(t=>t.stop());mic.getTracks().forEach(t=>t.stop());throw Error('Nessun audio nella condivisione: scegli la scheda di Meet/Teams e spunta «Condividi audio della scheda».')}
   list.push(screen);
  }
  return list;
 }
 function mix(list){
  const AC=root.AudioContext||root.webkitAudioContext;ctx=new AC();const dest=ctx.createMediaStreamDestination();analyser=ctx.createAnalyser();analyser.fftSize=512;
  list.forEach(s=>{if(!s.getAudioTracks().length)return;const src=ctx.createMediaStreamSource(new MediaStream(s.getAudioTracks()));src.connect(dest);src.connect(analyser)});
  return dest.stream;
 }
 function begin(){
  const mime=pickMime(),MR=root.MediaRecorder;chunks=[];bytes=0;rotating=false;
  rec=mime?new MR(mixed,{mimeType:mime,audioBitsPerSecond:32000}):new MR(mixed,{audioBitsPerSecond:32000});
  const n=segN++,type=(rec.mimeType||mime||'audio/webm').split(';')[0];
  const seg={n,mime:type,bytes:0,seconds:0,text:''};m.segments.push(seg);segStart=Date.now();segAcc=0;
  rec.ondataavailable=e=>{if(!e.data||!e.data.size)return;chunks.push(e.data);bytes+=e.data.size;seg.bytes=bytes;if(state==='recording'&&segStart||state==='paused'){seg.seconds=Math.round(segSeconds());m.seconds=Math.round(seconds())}
   const blob=new Blob(chunks,{type});saving=saving.then(()=>store.putAudio(m.id,n,blob)).then(()=>store.put(m)).catch(err=>o.onError&&o.onError(err));
   emit();if(bytes>=MAX_BYTES-150000&&state==='recording'&&!rotating){rotating=true;rotate()}};
  rec.onerror=e=>{if(o.onError)o.onError(e.error||Error('Registrazione interrotta'))};
  rec.start(TIMESLICE);
  return {rec,seg};
 }
 function closeSegment(r){return new Promise(resolve=>{if(!r||r.state==='inactive')return resolve();r.addEventListener('stop',()=>resolve(),{once:true});try{r.stop()}catch(e){resolve()}})}
 async function rotate(){const old=rec,cur=m.segments[m.segments.length-1];if(cur)cur.seconds=Math.round(segSeconds());elapsed+=segSeconds();segAcc=0;segStart=0;await closeSegment(old);await saving;if(state==='recording')begin();emit()}
 async function start(){
  if(state!=='idle')return;
  streams=await streamsFor(o.source);
  // When the person stops sharing from the browser bar, the call audio is gone: the recording stops cleanly.
  streams.forEach(s=>s.getTracks().forEach(t=>t.addEventListener('ended',()=>{if(state==='recording'||state==='paused')stop().catch(()=>{})})));
  mixed=mix(streams);m.mime=pickMime();state='recording';begin();await store.put(m);
  levelTimer=root.setInterval(level,120);wakeLock(true);
  if(doc)doc.addEventListener('visibilitychange',onVisible);
  emit();
 }
 function onVisible(){if(doc.visibilityState==='visible'&&state==='recording')wakeLock(true)}
 function pause(){if(state!=='recording'||!rec)return;rec.pause();segAcc+=(Date.now()-segStart)/1000;segStart=0;state='paused';wakeLock(false);emit()}
 function resume(){if(state!=='paused'||!rec)return;rec.resume();segStart=Date.now();state='recording';wakeLock(true);emit()}
 async function stop(){
  if(state==='idle'||state==='stopped')return m;
  const final=segSeconds(),last=m.segments[m.segments.length-1];state='stopping';emit();
  await closeSegment(rec);await saving;elapsed+=final;segAcc=0;segStart=0;if(last)last.seconds=Math.round(final);
  if(levelTimer)root.clearInterval(levelTimer);levelTimer=null;
  streams.forEach(s=>s.getTracks().forEach(t=>t.stop()));streams=[];
  try{if(ctx)await ctx.close()}catch(e){}ctx=null;analyser=null;
  wakeLock(false);if(doc)doc.removeEventListener('visibilitychange',onVisible);
  m.segments=m.segments.filter(s=>s.bytes>0);m.seconds=Math.round(elapsed);m.status=m.segments.length?'recorded':'empty';
  await store.put(m);state='stopped';emit();return m;
 }
 return {start,pause,resume,stop,get state(){return state},seconds};
}

// ---- audio files ----
function wav(samples,rate){const buf=new ArrayBuffer(44+samples.length*2),v=new DataView(buf);const w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};
 w(0,'RIFF');v.setUint32(4,36+samples.length*2,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){const s=Math.max(-1,Math.min(1,samples[i]));v.setInt16(44+i*2,s<0?s*0x8000:s*0x7fff,true)}
 return new Blob([buf],{type:'audio/wav'})}
const DIRECT=/^audio\/(webm|ogg|mp4|x-m4a|m4a|aac|mpeg|mp3|wav|x-wav|flac)$|^video\/(mp4|webm)$/;
function typeOf(file){const t=String(file.type||'').toLowerCase();if(t)return t;const ext=(String(file.name||'').split('.').pop()||'').toLowerCase();
 return {m4a:'audio/x-m4a',mp3:'audio/mpeg',wav:'audio/wav',webm:'audio/webm',ogg:'audio/ogg',mp4:'audio/mp4',aac:'audio/aac',flac:'audio/flac'}[ext]||''}
// The segments of an audio file; onProgress(text) while it works. Throws with a reason the page can show.
async function fromFile(file,meeting,onProgress){
 const type=typeOf(file);
 if(file.size<=MAX_BYTES&&DIRECT.test(type)){
  const seconds=await new Promise(resolve=>{try{const a=root.document.createElement('audio');a.preload='metadata';a.onloadedmetadata=()=>resolve(Number.isFinite(a.duration)?a.duration:0);a.onerror=()=>resolve(0);a.src=URL.createObjectURL(file)}catch(e){resolve(0)}});
  meeting.segments=[{n:0,mime:type,bytes:file.size,seconds:Math.round(seconds),text:''}];meeting.seconds=Math.round(seconds);
  await store.putAudio(meeting.id,0,file);meeting.status='recorded';await store.put(meeting);return meeting}
 if(file.size>300*1024*1024)throw Error('File troppo grande (oltre 300 MB).');
 if(onProgress)onProgress('Leggo il file audio…');
 const AC=root.AudioContext||root.webkitAudioContext;let ctx;try{ctx=new AC({sampleRate:16000})}catch(e){ctx=new AC()}
 let audio;try{audio=await ctx.decodeAudioData(await file.arrayBuffer())}catch(e){throw Error('Questo formato non si legge nel browser: esportalo in MP3 o M4A e riprova.')}finally{try{ctx.close()}catch(e){}}
 const rate=audio.sampleRate,step=rate/16000,len=Math.floor(audio.length/step),out=new Float32Array(len);
 const ch=[];for(let c=0;c<audio.numberOfChannels;c++)ch.push(audio.getChannelData(c));
 for(let i=0;i<len;i++){const j=Math.floor(i*step);let s=0;for(const d of ch)s+=d[j];out[i]=s/ch.length}
 const per=Math.floor((MAX_BYTES-100000)/2);meeting.segments=[];
 for(let n=0,off=0;off<len;n++,off+=per){const part=out.subarray(off,Math.min(len,off+per)),blob=wav(part,16000);
  meeting.segments.push({n,mime:'audio/wav',bytes:blob.size,seconds:Math.round(part.length/16000),text:''});await store.putAudio(meeting.id,n,blob);
  if(onProgress)onProgress('Preparo le parti del file: '+(n+1)+' di '+Math.ceil(len/per)+'…')}
 meeting.seconds=Math.round(len/16000);meeting.status='recorded';await store.put(meeting);return meeting}

function base64(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).replace(/^data:[^,]*,/,''));r.onerror=()=>reject(r.error||Error('Audio non leggibile'));r.readAsDataURL(blob)})}

return Object.freeze({MAX_BYTES,store,newId,support,pickMime,createRecorder,fromFile,base64,wav,typeOf});
});
