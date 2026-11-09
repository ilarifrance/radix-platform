'use strict';
// The two agency divisions pages (agency/index.html «Divisioni dell'agenzia», with #workflow, and agency/workspace.html,
// one division) in the light style «B» of the other Marketing pages: the Marketing menu, the shared neutrals and the
// indigo accent, Italian labels, no old dark/neon look. Look only: ids and scripts the pages and tests rely on stay.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const pages={index:read('agency/index.html'),workspace:read('agency/workspace.html')};
const styles=h=>[...h.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');

test('both divisions pages load the shell and the Marketing menu, menu stylesheet last',()=>{
 for(const [name,h] of Object.entries(pages)){
  assert.match(h,/data-shell-area="agency"/,name);
  assert.match(h,/<script src="\/shell\/radix-shell\.js" defer><\/script><script src="\/agency\/marketing-nav\.js" defer><\/script>/,name);
  assert.ok(h.indexOf('/agency/marketing-nav.css')>h.indexOf('/shell/agency.css'),name+': marketing-nav.css after agency.css');
 }
});

test('light palette «B»: page #f4f4f8, white cards, lines #e4e1ec, text #1d1a27, indigo #4f46e5; no old dark or neon look',()=>{
 for(const [name,h] of Object.entries(pages)){
  const css=styles(h);
  for(const token of ['#f4f4f8','#e4e1ec','#1d1a27','#4f46e5','#eef0ff'])assert.ok(css.includes(token),name+': '+token);
  assert.match(css,/body\{margin:0;background:#f4f4f8/,name+': plain light page');
  assert.doesNotMatch(css,/radial-gradient|background-clip:text|drop-shadow|#5bf4ff|#a54dca|Space Grotesk/,name+': no gradients, neon or unloaded fonts');
  assert.match(css,/@media\(max-width:767px\)/,name+': phone layout');
 }
 assert.doesNotMatch(pages.index,/planet-wrap|class="orbit/,'no second globe on the divisions page');
});

test('Italian labels; ids, anchors and scripts the other code reads are unchanged',()=>{
 const i=pages.index,w=pages.workspace;
 assert.match(i,/<h1 id="title">Divisioni dell’agenzia<\/h1>/);
 assert.match(i,/<title>RADIX Marketing · Divisioni dell’agenzia<\/title>/);
 assert.doesNotMatch(i,/FULL SERVICE|AI POWERED|Task recenti|PROCESSO PREVISTO|Creative Command Center/);
 for(const id of ['divisioni','divisions','workflow','agenti','agents','agentCount','recentTasks','search','sideNote'])assert.match(i,new RegExp('id="'+id+'"'),id);
 assert.doesNotMatch(w,/Agency Overview|Agency Workspace|Apri workspace ↗|PED ↗/);
 assert.match(w,/<a href="\.\/index\.html">Divisioni dell’agenzia<\/a>/,'a way back to the divisions');
 for(const id of ['title','description','actions','chatLink','work','workStatus','steps','deliverables','agents','liveTag','breadcrumb'])assert.match(w,new RegExp('id="'+id+'"'),id);
 for(const h of [i,w])for(const s of h.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(s[1]);
});
