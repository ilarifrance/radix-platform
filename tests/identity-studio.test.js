'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../lib/identity-studio.js'),Z=require('../lib/zip-lite.js'),pv=require('../lib/ped-views.js'),media=require('../lib/radix-agent-media.js');

const LOGO='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96"><circle cx="48" cy="48" r="30" fill="#2F5D50"/><text x="92" y="60" font-family="Fraunces" font-size="34" fill="#1C1C1E">Forno Bianchi</text></svg>';
const DIR=(name,p,extra)=>({name,rationale:'Il pane come rito quotidiano.',palette:[{role:'primary',hex:p,name:'Salvia'},{role:'secondary',hex:'#A0522D',name:'Crosta'},{role:'accent',hex:'#E3B448',name:'Grano'},{role:'dark',hex:'#1C1C1E',name:'Forno'},{role:'light',hex:'#F7F5F0',name:'Farina'}],
 fonts:[{heading:'Fraunces',body:'Inter'},{heading:'Playfair Display',body:'Lato'}],logo:LOGO,moodboard:{keywords:['farina','legno','mattino','mani','lievito','vicinato'],images:['Mani che impastano','Bancone di legno al mattino','Pane appena sfornato']},tone:['Caldo','Diretto','Di quartiere'],...extra});
const REPLY='Ecco le tre direzioni:\n```json\n'+JSON.stringify({directions:[DIR('Bottega di quartiere','#2F5D50'),DIR('Rito del mattino','#7A3E2B'),DIR('Grano moderno','#24435C')]},null,1)+'\n```\nFammi sapere.';

test('WCAG contrast: known ratios, levels and the flags of the palette pairs',()=>{
 assert.equal(S.contrast('#000000','#FFFFFF'),21);assert.equal(S.contrast('#FFF','#000'),21);assert.equal(S.contrast('#777777','#FFFFFF'),4.48);assert.equal(S.contrast('#767676','#FFFFFF'),4.54);
 assert.equal(S.contrast('#123456','#123456'),1);
 assert.deepEqual([7.2,4.6,3.1,2].map(S.level),['AAA','AA','AA grande','Insufficiente']);
 const pal=S.palette([{role:'primary',hex:'#E3B448'},{role:'secondary',hex:'#2F5D50'},{role:'accent',hex:'#FFD400'},{role:'dark',hex:'#1C1C1E'},{role:'light',hex:'#F7F5F0'}]);
 const c=S.contrastChecks(pal),by=l=>c.find(x=>x.label===l);
 assert.equal(c.length,6);assert.ok(by('Testo su fondo chiaro').ok);assert.equal(by('Testo su fondo chiaro').level,'AAA');
 assert.equal(by('Primario come testo su chiaro').ok,false,'yellow on ivory is flagged');assert.match(by('Primario come testo su chiaro').flag,/Non leggibile/);
 assert.equal(S.onColour(pal,'#1C1C1E').text,'#F7F5F0');assert.equal(S.onColour(pal,'#F7F5F0').text,'#1C1C1E');
});

test('palette: roles from a list or an object, short hex, missing neutrals filled, too few colours refused',()=>{
 const p=S.palette({primary:'#2f5d50',secondario:'#a52',accent:{hex:'#E3B448',name:'Grano'}});
 assert.deepEqual(p.map(c=>c.role),['primary','secondary','accent','dark','light']);
 assert.equal(p[1].hex,'#AA5522');assert.equal(p[2].name,'Grano');assert.equal(p[3].hex,'#1C1C1E');assert.equal(p[4].hex,'#F7F5F0');
 assert.deepEqual(S.palette([{hex:'#111111'},{hex:'nope'}]),[]);
 assert.deepEqual(S.palette(['#102030','#405060','#708090']).map(c=>c.hex),['#102030','#405060','#708090','#1C1C1E','#F7F5F0']);
});

test('SVG sanitizer: script, on* attributes, javascript: and external links, foreignObject and external images are removed',()=>{
 const dirty='<?xml version="1.0"?><!DOCTYPE svg><svg width="200" height="60" onload="alert(1)" xmlns:xlink="http://www.w3.org/1999/xlink"><!-- c --><script>alert(1)</script><script><![CDATA[ if(a<b)alert(2) ]]></script>'+
  '<a href="javascript:alert(1)"><text>link</text></a><image href="https://evil.example/x.png" width="10" height="10"/><image xlink:href="https://evil.example/y.png"/>'+
  '<foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml" onclick="x()">hi</div></foreignObject><style>@import url(https://evil.example/a.css)</style>'+
  '<circle cx="30" cy="30" r="20" fill="#123" onclick="steal()" ONMOUSEOVER="x()" style="fill:url(https://e)"/><rect width="5" height="5" fill="url(https://evil.example/#a)"/><rect width="5" height="5" fill="url(#g)"/>'+
  '<use href="#a"/><path d="M0 0L10 10" fill="&#106;avascript:alert(1)"/><text x="60" y="40" font-family="Inter">Forno &amp; Co &lt;b&gt;</text></svg>';
 const s=S.sanitizeSvg(dirty);
 assert.match(s,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 200 60" width="200" height="60">/);
 for(const bad of [/script/i,/\bon[a-z]+=/i,/javascript/i,/href/i,/foreignObject/i,/<image/i,/evil/i,/<style/i,/style=/i,/<a[\s>]/,/<use/,/<!--/,/<\?xml/,/DOCTYPE/,/>link</])assert.doesNotMatch(s,bad,String(bad));
 assert.match(s,/<circle cx="30" cy="30" r="20" fill="#123"\/>/);assert.match(s,/<rect width="5" height="5" fill="url\(#g\)"\/>/);assert.match(s,/<path d="M0 0L10 10"\/>/);
 assert.match(s,/<text x="60" y="40" font-family="Inter">Forno &amp; Co &lt;b&gt;<\/text><\/svg>$/);
 assert.equal(S.sanitizeSvg('<div><p>no svg</p></div>'),'');assert.equal(S.sanitizeSvg(''),'');
 assert.match(S.sanitizeSvg('<svg viewBox="0 0 10 10"><g><rect width="1" height="1"/>'),/<\/g><\/svg>$/,'unclosed tags are closed');
 assert.match(S.sanitizeSvg('<svg viewBox="bad"><rect width="1" height="1"/></svg>'),/viewBox="0 0 240 80"/);
});

test('negative logo: dark fills become the light neutral; the logo is shown as an image data URL',()=>{
 const pal=S.palette([{role:'primary',hex:'#2F5D50'},{role:'dark',hex:'#1C1C1E'},{role:'light',hex:'#F7F5F0'}]);
 const neg=S.negativeLogo(LOGO,pal);assert.match(neg,/fill="#2F5D50"/);assert.match(neg,/<text[^>]*fill="#F7F5F0"/);assert.doesNotMatch(neg,/#1C1C1E/);
 assert.match(S.negativeLogo('<svg viewBox="0 0 9 9"><rect fill="#24435C" width="9" height="9"/><text fill="#24435C">x</text></svg>',pal),/<rect fill="#24435C"[^>]*\/><text fill="#F7F5F0">/,'dark brand text turns light, shapes keep their colour');
 assert.match(S.negativeLogo('<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>',pal),/^<svg fill="#F7F5F0"/);
 assert.match(S.svgUrl(LOGO),/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
});

test('JSON parse fallback: fenced reply with prose, trailing commas and curly quotes; garbage gives no directions',()=>{
 const list=S.parseDirections(REPLY,'Forno Bianchi');
 assert.deepEqual(list.map(d=>d.name),['Bottega di quartiere','Rito del mattino','Grano moderno']);
 const d=list[0];assert.equal(d.palette.length,5);assert.equal(d.checks.length,6);assert.deepEqual(d.fonts,[{heading:'Fraunces',body:'Inter'},{heading:'Playfair Display',body:'Lato'}]);
 assert.equal(d.keywords.length,6);assert.equal(d.images.length,3);assert.equal(d.tone.length,3);assert.equal(d.logoFallback,false);assert.match(d.logo,/^<svg xmlns=/);
 assert.deepEqual(S.parseJson('Ecco: {“a”: [1, 2,], “b”: {“c”: “x”,},} fine'),{a:[1,2],b:{c:'x'}});
 const bare=S.parseDirections('[{"nome":"Solo","colori":{"primary":"#336699","light":"#FFFFFF"},"font":{"titoli":"Sora","testi":"Inter"},"logo":"<svg><script>x</script></svg>","tono":"Chiaro; Breve"}]','ACME');
 assert.equal(bare.length,1);assert.equal(bare[0].name,'Solo');assert.deepEqual(bare[0].fonts,[{heading:'Sora',body:'Inter'}]);assert.deepEqual(bare[0].tone,['Chiaro','Breve']);
 assert.equal(bare[0].logoFallback,true,'a logo with no shape left is replaced');assert.match(bare[0].logo,/>ACME<\/text>/);
 assert.deepEqual(S.parseDirections('Non riesco a rispondere.'),[]);assert.deepEqual(S.parseDirections('{"directions":[{"name":"x","palette":[]}]}'),[]);assert.deepEqual(S.parseDirections('{rotto'),[]);
 const big=S.parseDirections(JSON.stringify([DIR('Grande','#336699',{logo:'<svg viewBox="0 0 1 1">'+'<rect width="1" height="1"/>'.repeat(400)+'</svg>'})]),'X');
 assert.equal(big[0].logoFallback,true,'a logo over the size limit is replaced');
});

test('the prompt asks one JSON answer with the answers, chips and the limits of the logo',()=>{
 const p=S.identityPrompt({name:'Forno Bianchi',sector:'panificio artigianale a Bergamo',audience:'famiglie',values:['affidabile','Artigianale','boh'],styles:['caldo','minimale'],use:'verde salvia',avoid:'fluo',logo:'yes'},{project:{name:'Forno Bianchi — sito'}});
 assert.match(p,/^Prepara 3 direzioni di identità visiva/);assert.match(p,/«Forno Bianchi» \(progetto «Forno Bianchi — sito»\)/);assert.match(p,/Personalità e valori: affidabile, artigianale\./);assert.match(p,/Stile preferito: caldo, minimale\./);
 assert.match(p,/Colori da usare: verde salvia\./);assert.match(p,/Colori da evitare: fluo\./);assert.match(p,/Un logo esiste già/);assert.match(p,/al massimo 3 KB/);assert.match(p,/non generare immagini/);assert.match(p,/"directions":\[/);
 assert.throws(()=>S.identityPrompt({name:'',sector:'pane'}),/nome/);assert.throws(()=>S.identityPrompt({name:'ACME',sector:''}),/settore/);
 assert.deepEqual(S.prefill({name:'Forno Bianchi — sito',kind:'Progetto Agency',summary:'Panificio a Bergamo',audience:'famiglie'}),{name:'Forno Bianchi',sector:'Panificio a Bergamo',audience:'famiglie',values:[],styles:[],logo:'no'});
});

test('palette.css, palette.json and the README of the kit',()=>{
 const d=S.parseDirections(REPLY,'Forno Bianchi')[0],css=S.paletteCss(d,'Forno Bianchi');
 assert.equal(css,['/* Kit identità · Forno Bianchi · Bottega di quartiere */','/* Font: https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=Inter:wght@400;700&display=swap */',':root{',
  '  --color-primary: #2F5D50; /* Primario · Salvia */','  --color-secondary: #A0522D; /* Secondario · Crosta */','  --color-accent: #E3B448; /* Accento · Grano */','  --color-dark: #1C1C1E; /* Neutro scuro · Forno */','  --color-light: #F7F5F0; /* Neutro chiaro · Farina */',
  "  --font-heading: 'Fraunces', serif;","  --font-body: 'Inter', sans-serif;",'}',''].join('\n'));
 const j=JSON.parse(S.paletteJson(d,'Forno Bianchi'));assert.equal(j.brand,'Forno Bianchi');assert.equal(j.colors.length,5);assert.equal(j.colors[0].hex,'#2F5D50');assert.equal(j.contrast.length,6);assert.equal(j.contrast[0].level,'AAA');
 const r=S.readme(d,'Forno Bianchi',{date:'2026-10-21'});assert.match(r,/^KIT IDENTITÀ · Forno Bianchi\nDirezione: Bottega di quartiere\nPreparato con RADIX il 2026-10-21/);
 for(const s of ['Abbinamento 1: Fraunces per i titoli, Inter per i testi','TONO DI VOCE','- Caldo','Parole chiave: farina, legno','Immagine 3: Pane appena sfornato','UIBM, TMview e WIPO','nessuna immagine è stata generata'])assert.ok(r.includes(s),s);
 assert.equal(S.fontsCss(['Source Sans 3','bad;name']),'https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;700&display=swap');
});

test('the kit .zip has the five files, readable back',()=>{
 const d=S.parseDirections(REPLY,'Forno Bianchi')[0],files=S.kitFiles(d,'Forno Bianchi',{date:'2026-10-21'});
 assert.deepEqual(files.map(f=>f.name),['logo.svg','logo-negativo.svg','palette.css','palette.json','LEGGIMI.txt']);
 const back=Z.unzip(Z.zip(files)),txt=n=>new TextDecoder().decode(back.find(f=>f.name===n).data);
 assert.deepEqual(back.map(f=>f.name),['logo.svg','logo-negativo.svg','palette.css','palette.json','LEGGIMI.txt']);
 assert.equal(txt('logo.svg'),d.logo);assert.match(txt('logo-negativo.svg'),/fill="#F7F5F0"/);assert.match(txt('LEGGIMI.txt'),/KIT IDENTITÀ/);
 assert.equal(S.zipName(d,'Forno Bianchi'),'kit-identita-forno-bianchi-bottega-di-quartiere.zip');
});

test('saved in the project: the PED «Identità visiva» text is the one ped-views writes and agent-media reads back',()=>{
 const d=S.parseDirections(REPLY,'Forno Bianchi')[0],g=S.pedGuide(d,'Forno Bianchi');
 assert.deepEqual(g,{cover:'#2F5D50',page:'#F7F5F0',key:'#A0522D',accent:'#E3B448',text:'#1C1C1E',font:'Inter',signature:'FORNO BIANCHI'});
 assert.deepEqual(pv.identityProblems(g),[],'readable for the PED');
 const v=S.visualText(g,'Dal Kit identità «Bottega di quartiere»');assert.equal(v,pv.identityText(g,'Dal Kit identità «Bottega di quartiere»'));
 const back=media.styleGuide({visual:v});assert.deepEqual({...back},g);
 const light=S.parseDirections(JSON.stringify([DIR('Chiaro','#E3B448',{fonts:[{heading:'Playfair Display',body:'Lato'}]})]),'X')[0],lg=S.pedGuide(light,'X');
 assert.equal(lg.cover,'#1C1C1E','a primary too light for the cover falls back to the dark neutral');assert.equal(lg.font,'Playfair Display');
});

test('saveToProject writes the document in the Stratega thread and the profile with a fresh revision; profile:false keeps it',async()=>{
 const d=S.parseDirections(REPLY,'Forno Bianchi')[0];let saved=null,updates=[];
 const ws={ConflictError:class extends Error{},bind:()=>({load:async()=>({schemaVersion:1,conversations:{'brand-strategist':[{role:'user',content:'prima'}]}}),save:async x=>{saved=x;return x}}),
  projects:{get:async id=>({id,revision:7,profile:{audience:'famiglie',visual:'vecchia'}}),update:async(id,rev,ch)=>{updates.push([id,rev,ch]);return {id,revision:rev+1,...ch}}}};
 const r=await S.saveToProject(ws,'forno',d,'Forno Bianchi',{by:'Anna',at:'2026-10-21T10:00:00.000Z'});
 const th=saved.conversations['brand-strategist'];assert.equal(th.length,3);assert.equal(th[1].by,'Anna');assert.equal(th[2].agent,'brand-strategist');assert.equal(th[2].source,'identity-studio');
 assert.match(th[2].content,/---DOCUMENTO: Kit identità · Forno Bianchi · Bottega di quartiere---\n# Kit identità/);assert.match(th[2].content,/```svg\n<svg xmlns/);
 assert.equal(updates.length,1);const [id,rev,ch]=updates[0];assert.equal(id,'forno');assert.equal(rev,7);assert.equal(ch.profile.audience,'famiglie','the rest of the profile is kept');
 assert.match(ch.profile.visual,/^Dal Kit identità «Bottega di quartiere»\.\nCopertina e chiusura: #2F5D50\./);assert.equal(ch.profile.identityKit.direction,'Bottega di quartiere');assert.match(ch.profile.identityKit.logo,/^<svg/);
 assert.equal(r.project.revision,8);
 updates=[];const r2=await S.saveToProject(ws,'forno',d,'Forno Bianchi',{profile:false});assert.equal(updates.length,0);assert.equal(r2.project,null);
 await assert.rejects(S.saveToProject(null,'x',d,'X'),/Archivio/);
});
