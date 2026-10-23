'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const pv=require('../lib/ped-views.js'),core=require('../editorial-core.js'),{createPost}=require('../api/_buffer.js');

test('a clip is a video post on LinkedIn and its prompt keeps to the long script',()=>{
 assert.equal(pv.mediaKind({channel:'LinkedIn',format:'video'}),'video');
 assert.equal(pv.mediaKind({channel:'LinkedIn'}),'image');
 const p=pv.clipPrompt({brand:'Personal brand di Francesco'},{title:'Delegare la vendita',copy:'Script lungo del video'});
 assert.match(p,/30-40 secondi/);assert.match(p,/75 a 100 parole/);assert.match(p,/Script lungo del video/);assert.match(p,/prima persona singolare/);
 const c=pv.parseClip('---POST---\n**Gancio** forte\n---SCRIPT---\n'+'parola '.repeat(80)+'\n---FINE---');
 assert.equal(c.post,'Gancio forte');assert.equal(c.script.split(/\s+/).length,80);
 assert.throws(()=>pv.parseClip('solo testo'),/spezzone/);
 assert.doesNotMatch(pv.copyPrompt({},{channel:'LinkedIn',format:'video',script:'s',title:'t'}),/solo lo script parlato/);
});

test('the clip script is kept with the content and is part of the approved version',()=>{
 const state={briefApproved:true,strategyRevision:1,contents:[]};
 const a=core.updateContent(state,{id:'v',title:'T',channel:'LinkedIn',date:'2026-10-30',copy:'Post',script:'Script uno',format:'video'});
 assert.equal(a.script,'Script uno');assert.equal(a.format,'video');
 state.contents[0].status='approved';
 const same=core.updateContent(state,{id:'v',title:'T',channel:'LinkedIn',date:'2026-10-30',copy:'Post'});
 assert.equal(same.status,'approved');assert.equal(same.script,'Script uno');
 assert.deepEqual(core.sameWordRevisions(same),[2,1]);
 const changed=core.updateContent(state,{id:'v',title:'T',channel:'LinkedIn',date:'2026-10-30',copy:'Post',script:'Script due'});
 assert.equal(changed.status,'draft');assert.equal(core.approvalPayload(changed).script,'Script due');
 assert.equal('script' in core.approvalPayload({title:'T',channel:'LinkedIn',date:'',copy:'x',revision:1}),false);
});

test('createPost sends a video as the only asset',async()=>{
 const seen=[],old=global.fetch;
 global.fetch=async(url,opts)=>{seen.push(JSON.parse(opts.body));return {ok:true,status:200,json:async()=>({data:{createPost:{post:{id:'p1',text:'t',dueAt:null}}}})}};
 try{await createPost('k',{channelId:'c',text:'Ciao',video:'https://blob.test/v.mp4',images:['https://x.test/a.jpg']});
  assert.match(seen[0].query,/assets: \[\{ video: \{ url: "https:\/\/blob.test\/v.mp4" \} \}\]/);assert.doesNotMatch(seen[0].query,/image/)}
 finally{global.fetch=old}
});

test('a video still rendering keeps its HeyGen id with the content',()=>{
 const state={briefApproved:true,strategyRevision:1,contents:[]};
 core.updateContent(state,{id:'y',title:'T',channel:'YouTube',date:'2026-10-30',copy:'Script',video:{id:'abc_123',at:'2026-10-23T20:00:00Z'}});
 assert.deepEqual(state.contents[0].video,{id:'abc_123',at:'2026-10-23T20:00:00Z'});
 core.updateContent(state,{id:'y',title:'T',channel:'YouTube',date:'2026-10-30',copy:'Script',video:{id:'bad id!'}});
 assert.equal(state.contents[0].video,undefined);
});

test('a clip is cut into 3-5 scenes that rotate the avatar looks and the framing',()=>{
 const script='Ho firmato io tutti i contratti per anni. Poi ho capito una cosa. Se la vendita passa solo da te, l’azienda si ferma. Il primo passo è scrivere come vendi. Il secondo è misurare la pipeline. Il terzo è affiancare chi vende. Da dove partiresti tu? Scrivimelo nei commenti.';
 const sc=pv.clipScenes(script,['a','b','a']);
 assert.ok(sc.length>=3&&sc.length<=5);assert.deepEqual(sc.slice(0,3).map(x=>x.talkingPhotoId),['a','b','a']);
 assert.equal(sc.map(x=>x.text).join(' '),script);assert.equal(sc[0].scale,1);assert.ok(sc[1].scale>1);
 assert.deepEqual(pv.clipScenes(script,[]),[]);
});
