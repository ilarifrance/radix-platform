'use strict';
// Rifinitura 3 of the Marketing area: no Marketing studio keeps a bare browser file picker (every visible file input is
// inside the .pf-drop drop zone), and the RADIX guide has its own entries for «Cosa vuoi fare», the Marketing home, the
// agency page and the strategy, instead of calling them «Command Center».
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const guide=require('../lib/radix-guide.js');

// The studios of «Cosa vuoi fare» and the libraries they load, plus the Marketing pages under agency/.
const studioFiles=()=>fs.readdirSync(path.join(ROOT,'lib')).filter(f=>/-studio\.js$/.test(f)||f==='seo-results.js').map(f=>'lib/'+f);
// Every file input built in code: the variable that gets type='file', whether it is hidden (a button opens it) and whether
// a label built as a .pf-drop zone appends it.
function fileInputs(src){const zones=new Set();let m;const zr=/(\w+)=(?:el|E)\('label',undefined,'pf-drop[ ']/g;while((m=zr.exec(src)))zones.add(m[1]);
 const out=[],re=/(\w+)\.type='file'/g;
 while((m=re.exec(src))){const v=m[1],tail=src.slice(m.index,m.index+700),app=new RegExp('\\b(\\w+)\\.append\\('+v+'\\b','g');let a,dropped=false;
  while((a=app.exec(src)))if(zones.has(a[1]))dropped=true;
  out.push({v,hidden:new RegExp('\\b'+v+'\\.hidden=true').test(tail),dropped})}
 return out}

test('studios: every visible file input sits in a .pf-drop zone with its text',()=>{
 const files=studioFiles();assert.ok(files.length>20,'studio files found');
 const bare=[];let n=0;
 for(const f of files){const s=read(f);for(const i of fileInputs(s)){n++;if(!i.hidden&&!i.dropped)bare.push(f+' '+i.v)}}
 assert.ok(n>=20,'file inputs found: '+n);
 assert.deepEqual(bare,[]);
});

test('studios: the zones of rifinitura 3 say what to choose and how',()=>{
 for(const [f,cls,text] of [
  ['lib/ad-studio.js','pf-drop ad-drop','JPG, PNG o WebP fino a 15 MB · trascinala qui o fai clic'],
  ['lib/newsletter-studio.js','pf-drop nl-drop','trascinala qui o fai clic · la riduco a 1200 px di larghezza'],
  ['lib/social-studio.js','pf-drop sc-drop','JPG, PNG o WebP · trascinala qui o fai clic'],
  ['lib/print-studio.js','pf-drop pr-drop','JPEG o PNG · trascinala qui o fai clic'],
  ['lib/large-format-studio.js','pf-drop pr-drop','JPEG o PNG · trascinala qui o fai clic'],
  ['lib/doc-studio.js','pf-drop ds-drop','JPG, PNG o WebP · trascinala qui o fai clic'],
  ['lib/gbp-studio.js','pf-drop gb-drop','Colonne autore, stelle, testo · trascinalo qui o fai clic'],
  ['lib/product-photo-studio.js','pf-drop fp-ref','JPG, PNG o WebP · trascinala qui o fai clic'],
  ['lib/seo-results.js','pf-drop sr-file','Anche più file insieme · trascinali qui o fai clic']]){
  const s=read(f);assert.ok(s.includes("'"+cls+"'"),f+' '+cls);assert.ok(s.includes(text),f+' text');assert.match(s,/'pf-drop-text'/,f)}
 // the old wrappers are gone, and no rule turns a zone back into a column or hides its input
 const c=read('shell/crea.css');
 assert.doesNotMatch(c,/\.ad-upload\{|\.gb-upload\{|\.sc-photo \.sc-file\{/);
 assert.match(c,/\.print-studio \.pr-photo label:not\(\.pf-drop\)\{display:flex;flex-direction:column/);
 assert.match(c,/\.doc-studio \.ds-photo label:not\(\.pf-drop\)\{display:flex;flex-direction:column/);
 assert.match(read('shell/seo-results.css'),/\.sr-upload label:not\(\.pf-drop\)\{display:flex;flex-direction:column/);
});

test('Marketing pages: no bare file input in agency/ studios (Studio Avatar uses the drop zone too)',()=>{
 const a=read('agency/avatar.html');
 assert.match(a,/<label class="av-drop pf-drop"><input type="file" id="avFile" accept="image\/jpeg,image\/png"><span class="pf-drop-text"><strong>Scegli una foto<\/strong>/);
 assert.match(read('shell/avatar.css'),/\.av-page \.av-form label\.pf-drop input\{position:absolute;inset:0;[^}]*opacity:0/);
 for(const f of fs.readdirSync(path.join(ROOT,'agency')).filter(f=>/\.html$/.test(f)&&f!=='new-project.html')){
  const s=read('agency/'+f),re=/<input[^>]*type="file"[^>]*>/g;let m;
  while((m=re.exec(s)))assert.match(s.slice(Math.max(0,m.index-120),m.index),/<label class="[^"]*pf-drop[^"]*">$/,f)}
});

test('guide: «Cosa vuoi fare» has its own entry, not the Command Center',()=>{
 const e=guide.forPage('agency-crea','/agency/crea.html','');
 assert.equal(e.id,'agency-crea');assert.equal(e.title,'Cosa vuoi fare');assert.match(e.what,/^Marketing · Servizi guidati/);
 assert.ok(e.start.length>=3&&e.start.length<=5);
 const all=e.start.join(' ');
 assert.match(all,/Scegli il progetto/);assert.match(all,/costo è scritto sulla scheda/);assert.match(all,/L’AI parte solo dopo la tua conferma/);assert.match(all,/resta nel progetto/);
 for(const s of e.start)assert.ok(s.length<=140,s);
 assert.match(guide.match('Quanto costa un servizio guidato?').a,/scheda prima di aprirla/);
});

test('guide: the other Marketing pages get the right entry',()=>{
 const at=(id,p,h)=>guide.forPage(id,p,h).id;
 assert.equal(at('agency-orbit','/agency/orbit.html'),'agency-orbit');
 assert.equal(at('agency','/agency/index.html'),'agency');
 assert.equal(at('agency-ped','/project-editorial.html',''),'agency-ped');
 assert.equal(at('agency-ped','/project-editorial.html','#brief'),'agency-strategy');
 assert.equal(at('agency-avatar','/agency/avatar.html'),'agency-avatar');
 assert.equal(at('agency-projects','/agency/new-project.html'),'agency-new');
 assert.equal(at('agency-projects','/agency/projects.html'),'agency-projects');
 assert.equal(at('agency-projects','/agency/project-workspace.html'),'agency-projects');
 assert.equal(at('cc','/control-center-v2.html'),'cc');
 // no Marketing page in the menu falls back to the Command Center
 for(const id of ['agency-orbit','agency-crea','agency-clients','agency-projects','agency-ped','agency-avatar','agency','agency-operations','agency-memory'])assert.ok(guide.GUIDE.some(g=>g.id===id),id);
 const js=read('lib/radix-guide.js');
 assert.match(js,/root\.addEventListener\('hashchange',\(\)=>\{const e=entryNow\(\)/);
 assert.match(js,/const href=g=>\{const \[base,hash\]=g\.href\.split\('#'\)/);
});
