'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../editorial-core.js'),media=require('../lib/radix-agent-media.js');

// A canvas that records what is drawn: text with its fill colour, rectangles with their colour.
function fakeDocument(){const log={texts:[],rects:[]};
 const ctx={fillStyle:'',globalAlpha:1,font:'',textBaseline:'',letterSpacing:'',
  measureText:t=>({width:String(t).length*(Number((/(\d+)px/.exec(ctx.font)||[0,20])[1]))*.55}),
  drawImage(){},fillRect(x,y,w,h){log.rects.push({x,y,w,h,fill:ctx.fillStyle})},fillText(t,x,y){log.texts.push({t,x,y,fill:ctx.fillStyle,font:ctx.font})},
  createLinearGradient:()=>({addColorStop(){}})};
 return {log,document:{createElement:()=>({width:0,height:0,getContext:()=>ctx})}}}
const img={width:1000,height:1000};
const project={id:'p1',name:'FRANCESCO ILARI – GCP'};// no style guide: white text, accent #FFD54A, dark text on the accent

test('photo post: label, headline with highlighted words, line under it, signature; the fade replaces the solid band',()=>{
 const {log,document}=fakeDocument();globalThis.document=document;
 try{
  const c=media.renderPhotoPost(img,'Non assumi un commerciale per creare un [[metodo]]',project,'4:5',{kicker:'Processo commerciale',sub:'Lo assumi per replicarne uno.'});
  assert.equal(c.width,1080);assert.equal(c.height,1350);
  const t=x=>log.texts.find(e=>e.t===x);
  assert.ok(t('PROCESSO COMMERCIALE'),'label in capitals');
  assert.equal(t('metodo').fill,'#111111','highlighted word on the accent band uses the dark colour');
  assert.ok(log.rects.some(r=>r.fill==='#FFD54A'),'accent band behind the key word');
  assert.ok(t('Non'),'other words drawn in the light colour');assert.equal(t('Non').fill,'#FFFFFF');
  assert.ok(log.texts.some(e=>/replicarne/.test(e.t)),'line under the headline');
  assert.ok(log.texts.some(e=>/GCP|FRANCESCO/i.test(e.t)),'signature');
  const none=fakeDocument();globalThis.document=none.document;
  media.renderPhotoPost(img,'Tre parole in fila',project,'4:5');
  assert.ok(none.log.texts.some(e=>e.t==='fila'&&e.fill==='#111111'),'without markers the last two words are highlighted');
  assert.ok(none.log.texts.every(e=>e.t!=='PROCESSO COMMERCIALE'));
  const empty=fakeDocument();globalThis.document=empty.document;media.renderPhotoPost(img,'',project,'4:5');
  assert.equal(empty.log.texts.length,1,'no headline: only the signature');
 }finally{delete globalThis.document}
});

test('the label and the line under the headline of a photo post are kept by the plan, trimmed and only when set',()=>{
 const st=core.createState?core.createState():null;
 const state=st||{briefApproved:true,contents:[],strategyRevision:1};state.briefApproved=true;
 core.updateContent(state,{id:'a',title:'Post',channel:'LinkedIn',date:'2026-11-01',time:'08:00',copy:'Testo',photo:{source:'upload',headline:'Titolo',kicker:'  Processo  ',sub:'Una riga',at:'2026-10-26T10:00:00Z'}});
 const a=state.contents.find(c=>c.id==='a');
 assert.equal(a.photo.kicker,'Processo');assert.equal(a.photo.sub,'Una riga');
 core.updateContent(state,{id:'b',title:'Post 2',channel:'LinkedIn',date:'2026-11-02',time:'08:00',copy:'Testo',photo:{requestId:'req1',headline:'Titolo',at:'2026-10-26T10:00:00Z'}});
 const b=state.contents.find(c=>c.id==='b');assert.equal(b.photo.kicker,undefined);assert.equal('sub' in b.photo,false);
 core.updateContent(state,{id:'a',title:'Post',channel:'LinkedIn',date:'2026-11-01',time:'08:00',copy:'Testo nuovo'});
 assert.equal(state.contents.find(c=>c.id==='a').photo.kicker,'Processo','editing the text keeps the photo and its label');
});

test('studio and page pass the label and line through to the composition and the download',()=>{
 const fs=require('fs'),r=f=>fs.readFileSync(require('path').join(__dirname,'..',f),'utf8');
 const studio=r('lib/image-studio.js'),ws=r('editorial-workspace.js');
 assert.match(studio,/renderPhotoPost\(img,head\.value,ctx\.project,choice\.ratio,\{kicker:kick\.value,sub:sub\.value\}\)/);
 assert.match(studio,/kicker:kick\.value\.trim\(\),sub:sub\.value\.trim\(\)/);
 assert.match(ws,/\{kicker:info\.kicker,sub:info\.sub\}/);
 assert.match(ws,/\{kicker:item\.photo\.kicker,sub:item\.photo\.sub\}/);
});
