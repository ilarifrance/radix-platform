'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const crea=require('../agency/crea-core.js'),orbit=require('../agency/orbit-core.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const exists=href=>fs.existsSync(path.join(root,href.replace(/^\//,'').replace(/[?#].*$/,'')));

test('one planet per service area of «Cosa vuoi fare», in the panel order, each opening the panel filtered on it',()=>{
 const ps=orbit.planets();
 assert.deepEqual(ps.map(p=>p.group),crea.groups());
 assert.deepEqual(ps.map(p=>p.slug),['brand','strategia','web','social','stampa','immagini','video']);
 for(const p of ps){
  assert.equal(p.href,'/agency/crea.html?area='+p.slug);
  assert.equal(p.count,crea.inGroup(p.group).length);assert.ok(p.count>0);
  assert.deepEqual(p.services,crea.inGroup(p.group).map(c=>c.title));
  assert.match(p.color,/^#[0-9a-f]{6}$/);
  assert.deepEqual(crea.fromQuery(new URL(p.href,'https://x').search),{group:p.group,open:''},'the link lands on its filter');
 }
 assert.equal(new Set(ps.map(p=>p.color)).size,ps.length,'one colour each');
 assert.equal(ps[0].color,'#ff5fa2','Marketing pink from the Command Center');
});

test('?area= and ?open= pick the filter and the studio in «Cosa vuoi fare»; unknown values change nothing',()=>{
 assert.deepEqual(crea.fromQuery('?area=web'),{group:'Web e annunci',open:''});
 assert.deepEqual(crea.fromQuery('?area=VIDEO'),{group:'Video',open:''});
 assert.deepEqual(crea.fromQuery('?open=seo'),{group:'Web e annunci',open:'seo'},'the studio group when no area');
 assert.deepEqual(crea.fromQuery('?area=brand&open=images'),{group:'Brand',open:'images'});
 assert.deepEqual(crea.fromQuery('?open=avatar'),{group:'Video',open:''},'a card with its own page is not opened inline');
 for(const q of ['','?area=boh','?open=boh','?area=constructor','?open=__proto__',null,undefined])assert.deepEqual(crea.fromQuery(q),{group:'',open:''},String(q));
 for(const [slug,group] of Object.entries(crea.AREAS)){assert.ok(crea.GROUPS.includes(group));assert.equal(crea.areaOf(group),slug)}
 const js=read('agency/crea.js');
 assert.match(js,/const asked=core\.fromQuery\(location\.search\);/);
 assert.match(js,/group=asked\.group\|\|remembered\(GROUP_KEY\)/);
 assert.match(js,/if\(asked\.open&&current\)openInline\(core\.card\(asked\.open\)\);/);
});

test('sections: every link is a page of the repo; studios open where they live',()=>{
 assert.deepEqual(orbit.SECTIONS.map(s=>s.title),['Cosa vuoi fare','Clienti','Progetti','Piano editoriale','Studi','Risultati','Approvazioni','Memoria']);
 for(const s of orbit.SECTIONS){assert.ok(exists(s.href),s.href);for(const l of s.links||[])assert.ok(exists(l.href),l.href)}
 assert.deepEqual(orbit.STUDIOS.map(s=>s.label),['Avatar','Immagini','Video','Sito','SEO e GEO','Identità','Stampa','Catalogo']);
 for(const s of orbit.STUDIOS.slice(1)){const q=crea.fromQuery(new URL(s.href,'https://x').search);assert.ok(q.open&&crea.card(q.open).inline,s.label)}
 const res=orbit.SECTIONS.find(s=>s.id==='risultati');
 assert.deepEqual(res.links.map(l=>l.href),['/project-editorial.html#results','/agency/crea.html?open=seo']);
 assert.match(read('shell/ped-calendar.js'),/setSection\(location\.hash === '#results' \? 'results' : 'calendar'\)/);
 assert.match(read('editorial-workspace.js'),/location\.replace\('\?project='\+encodeURIComponent\(list\[0\]\.id\)\+location\.hash\)/,'the hash survives the first-project redirect');
});

test('counts are real or missing: never invented',()=>{
 assert.deepEqual(orbit.counts({}),{servizi:crea.CARDS.length,clienti:null,progetti:null,approvazioni:null});
 const c=orbit.counts({clients:[{id:'a'},{id:'b'}],projects:[{status:'active'},{status:'archived'},{}],dashboard:{approvalsSupported:true,metrics:{approvals:3}}});
 assert.deepEqual(c,{servizi:crea.CARDS.length,clienti:2,progetti:2,approvazioni:3});
 assert.equal(orbit.counts({dashboard:{approvalsSupported:false,metrics:{approvals:0}}}).approvazioni,null,'approvals not active: no number');
 assert.equal(orbit.counts({dashboard:{approvalsSupported:true,metrics:{approvals:'7'}}}).approvazioni,null);
 assert.equal(orbit.counts({dashboard:{approvalsSupported:true,metrics:{approvals:0}}}).approvazioni,0);
 assert.equal(orbit.countText(null,['x','y']),'');assert.equal(orbit.countText(1,['progetto attivo','progetti attivi']),'1 progetto attivo');
 assert.equal(orbit.countText(0,['cliente','clienti']),'0 clienti');
 for(const s of orbit.SECTIONS.filter(s=>s.count))assert.ok(s.count in orbit.counts({})&&s.unit.length===2,s.id);
});

test('orbit geometry: planets stay on the stage, two rings, depth drives scale',()=>{
 const n=7;
 for(const [w,h] of [[780,520],[1100,560],[358,210]])for(let t=0;t<200;t+=7.3)for(let i=0;i<n;i++){
  const p=orbit.orbitPoint(i,n,t,w,h);
  assert.ok(p.x>=0&&p.x<=w&&p.y>=0&&p.y<=h,[w,h,t,i,p.x,p.y].join(' '));
  assert.ok(p.depth>=-1&&p.depth<=1&&p.scale>=.84&&p.scale<=1);
 }
 assert.equal(orbit.orbitPoint(0,n,0,800,500).ring,0);assert.equal(orbit.orbitPoint(1,n,0,800,500).ring,1);
 assert.ok(orbit.orbitPoint(1,n,0,800,500).rx<orbit.orbitPoint(0,n,0,800,500).rx,'inner ring is smaller');
 const a=orbit.orbitPoint(0,n,0,800,500),b=orbit.orbitPoint(2,n,0,800,500);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>100,'planets of a ring are spread');
});

test('the page: shell area, planets as real links, pause button, reduced motion, no AI and no external URLs',()=>{
 const html=read('agency/orbit.html'),js=read('agency/orbit.js'),css=read('agency/orbit.css');
 assert.match(html,/data-shell-area="agency"/);assert.match(html,/data-shell-page="agency-orbit"/);
 assert.match(html,/<a class="mo-cta" href="\/agency\/crea\.html">Cosa vuoi fare oggi\?/);
 assert.match(html,/<button type="button" class="mo-pause" id="moPause" aria-pressed="false">/);
 assert.match(html,/<canvas class="mo-sky" id="moSky" aria-hidden="true">/);
 const at=s=>html.indexOf(s);assert.ok(at('/agency/crea-core.js')<at('/agency/orbit-core.js')&&at('/agency/orbit-core.js')<at('/agency/orbit.js'));
 for(const src of [html,js,css])assert.ok(!/https?:\/\//.test(src),'no external URL');
 assert.ok(!/RadixAgents|\/api\/chat|reply\(/.test(js),'no AI call');
 assert.deepEqual([...js.matchAll(/fetch\('([^']+)'/g)].map(m=>m[1]),['/api/state?view=dashboard'],'only the Command Center summary');
 assert.match(js,/prefers-reduced-motion: reduce/);assert.match(js,/a=node\('a','mo-planet'\);a\.href=p\.href/);assert.match(js,/setAttribute\('aria-label'/);
 assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);assert.match(css,/@media \(max-width:640px\)/);
 new vm.Script(js,{filename:'agency/orbit.js'});
});

test('menu: Marketing Orbit first, the group label opens it, Command Center sends Marketing there',()=>{
 const shell=read('shell/radix-shell.js');
 const block=shell.slice(shell.indexOf("{ group: 'agency'"),shell.indexOf("{ group: 'sales'"));
 assert.match(block,/^\{ group: 'agency', text: 'Marketing Agency', icon: 'spark', href: '\/agency\/orbit\.html', items: \[/);
 assert.deepEqual([...block.matchAll(/text: '([^']+)'/g)].map(m=>m[1]).slice(1),['Marketing Orbit','Cosa vuoi fare','Clienti','Progetti','Piano editoriale','Studio Avatar','Agenzia e divisioni','Divisioni','Agenti AI','Workflow','Operations','Memoria']);
 for(const m of block.matchAll(/href: '([^']+)'/g))assert.ok(exists(m[1]),m[1]);
 assert.match(shell,/n\.href \? '<a class="rx-group-link" href="' \+ esc\(n\.href\) \+ '">' \+ esc\(n\.text\) \+ '<\/a>' : esc\(n\.text\)/);
 assert.match(read('shell/radix-shell.css'),/a\.rx-group-link\{color:inherit/);
 const cc=read('shell/cc-universe.js');
 assert.match(cc,/\{ id: 'marketing', name: 'Marketing Agency', sub: '[^']*', href: '\/agency\/orbit\.html', color: '#ff5fa2', pages: \[\['Marketing Orbit', '\/agency\/orbit\.html'\]/);
});
