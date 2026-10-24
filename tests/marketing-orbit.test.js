'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const crea=require('../agency/crea-core.js'),orbit=require('../agency/orbit-core.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const exists=href=>fs.existsSync(path.join(root,href.replace(/^\//,'').replace(/[?#].*$/,'')));

test('one planet per service area of «Cosa vuoi fare», in the panel order, each opening the panel filtered on it',()=>{
 const ps=orbit.planets();
 assert.deepEqual(ps.map(p=>p.group),crea.groups());
 assert.deepEqual(ps.map(p=>p.slug),['brand','strategia','web','social','email','stampa','immagini','video']);
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
 assert.match(js,/const asked=core\.fromQuery\(location\.search\)[,;]/);
 assert.match(js,/group=asked\.group\|\|remembered\(GROUP_KEY\)/);
 assert.match(js,/if\(asked\.open&&current\)openInline\(core\.card\(asked\.open\)\);/);
});

test('sections: every link is a page of the repo; studios open where they live',()=>{
 assert.deepEqual(orbit.SECTIONS.map(s=>s.title),['Cosa vuoi fare','Clienti','Progetti','Piano editoriale','Studi','Risultati','Approvazioni','Memoria']);
 for(const s of orbit.SECTIONS){assert.ok(exists(s.href),s.href);for(const l of s.links||[])assert.ok(exists(l.href),l.href)}
 assert.deepEqual(orbit.STUDIOS.map(s=>s.label),['Avatar','Immagini','Video','Sito','SEO e GEO','Identità','Stampa','Catalogo','Documenti']);
 for(const s of orbit.STUDIOS.slice(1)){const q=crea.fromQuery(new URL(s.href,'https://x').search);assert.ok(q.open&&crea.card(q.open).inline,s.label)}
 const res=orbit.SECTIONS.find(s=>s.id==='risultati');
 assert.deepEqual(res.links.map(l=>l.href),['/project-editorial.html#results','/agency/crea.html?open=seo']);
 assert.match(read('shell/ped-calendar.js'),/setSection\(location\.hash === '#results' \? 'results' : 'calendar'\)/);
 assert.match(read('editorial-workspace.js'),/location\.replace\('\?project='\+encodeURIComponent\(list\[0\]\.id\)\+location\.hash\)/,'the hash survives the first-project redirect');
});

test('counts are real or missing: never invented',()=>{
 assert.deepEqual(orbit.counts({}),{servizi:crea.listed().length,clienti:null,progetti:null,approvazioni:null});
 const c=orbit.counts({clients:[{id:'a'},{id:'b'}],projects:[{status:'active'},{status:'archived'},{}],dashboard:{approvalsSupported:true,metrics:{approvals:3}}});
 assert.deepEqual(c,{servizi:crea.listed().length,clienti:2,progetti:2,approvazioni:3});
 assert.equal(orbit.counts({dashboard:{approvalsSupported:false,metrics:{approvals:0}}}).approvazioni,null,'approvals not active: no number');
 assert.equal(orbit.counts({dashboard:{approvalsSupported:true,metrics:{approvals:'7'}}}).approvazioni,null);
 assert.equal(orbit.counts({dashboard:{approvalsSupported:true,metrics:{approvals:0}}}).approvazioni,0);
 assert.equal(orbit.countText(null,['x','y']),'');assert.equal(orbit.countText(1,['progetto attivo','progetti attivi']),'1 progetto attivo');
 assert.equal(orbit.countText(0,['cliente','clienti']),'0 clienti');
 for(const s of orbit.SECTIONS.filter(s=>s.count))assert.ok(s.count in orbit.counts({})&&s.unit.length===2,s.id);
});

test('orbit geometry: planets sit still on one ring, labels under them never touch a planet, a label or the core',()=>{
 const n=orbit.planets().length;
 for(let w=600;w<=1100;w+=20)for(const h of [480,500,540,580]){
  const r=orbit.ring(n,w,h),boxes=r.planets.flatMap(p=>[p.sphere,p.label]);
  assert.equal(r.planets.length,n);
  for(const [i,b] of boxes.entries()){
   assert.ok(b.x>=8&&b.y>=8&&b.x+b.w<=w-8&&b.y+b.h<=h-8,'inside the stage '+[w,h,i]);
   assert.ok(orbit.reach(r.cx,r.cy,b)>=r.core+8,'clear of the core '+[w,h,i]);
   for(const c of boxes.slice(i+1))assert.ok(!orbit.hit(b,c),'no overlap '+[w,h,i]);
  }
 }
 const r=orbit.ring(n,800,540);
 assert.ok(Math.abs(r.planets[0].x-r.cx)<1e-9&&r.planets[0].y<r.cy,'the first area sits on top');
 assert.ok(r.rx>r.ry,'a flattened ring, as seen from above');
 assert.ok(orbit.hit({x:0,y:0,w:10,h:10},{x:5,y:5,w:10,h:10})&&!orbit.hit({x:0,y:0,w:10,h:10},{x:10,y:0,w:10,h:10}));
});

test('one line icon set: every area, section and service card has a drawn icon, no unicode symbols',()=>{
 const look=require('../agency/marketing-look.js');
 for(const p of orbit.planets())assert.ok(look.has(p.icon),p.slug);
 for(const s of orbit.SECTIONS)assert.ok(look.has(s.icon),s.id);
 for(const c of crea.CARDS)assert.ok(look.has(look.CARDS[c.id]),c.id);
 assert.deepEqual(Object.keys(look.AREAS),Object.keys(crea.AREAS));
 for(const name of look.NAMES){const m=look.svg(name);assert.match(m,/^<svg class="ml-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1\.5"[^>]*aria-hidden="true"/);assert.ok(!/https?:/.test(m))}
});

test('the page: shell area, command bar as a combobox, globe links, pause button, reduced motion, no AI and no external URLs',()=>{
 const html=read('agency/orbit.html'),js=read('agency/orbit.js'),css=read('agency/orbit.css'),shared=read('shell/marketing-a.css'),globe=read('agency/marketing-globe.js');
 assert.match(html,/data-shell-area="agency"/);assert.match(html,/data-shell-page="agency-orbit"/);
 assert.match(html,/<form class="ma-command" id="moAskForm" action="\/agency\/crea\.html" method="get" role="search"/);
 assert.match(html,/<input[^>]*id="moAsk"[^>]*role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="moSuggest"/);
 assert.match(html,/<label class="ma-sr" for="moAsk">Cosa vuoi fare oggi\?<\/label>/);
 assert.match(html,/<ul class="ma-suggest" id="moSuggest" role="listbox"/);
 assert.match(html,/<button type="button" class="mo-pause" id="moPause" aria-pressed="false">/);
 assert.match(html,/<canvas class="mo-sky" id="moSky" aria-hidden="true">/);
 const at=s=>html.indexOf(s);
 for(const [a,b] of [['/sales/orbit-globe.js','/agency/marketing-globe.js'],['/agency/crea-core.js','/agency/orbit-core.js'],['/agency/marketing-look.js','/agency/orbit-core.js'],['/agency/orbit-core.js','/agency/orbit.js'],['/agency/marketing-globe.js','/agency/orbit.js'],['/shell/agency.css','/shell/marketing-a.css'],['/shell/marketing-a.css','/agency/orbit.css']])
  assert.ok(at(a)>0&&at(a)<at(b),a+' before '+b);
 for(const src of [html,js,css,shared,globe])assert.ok(!/https?:\/\//.test(src),'no external URL');
 assert.ok(!/RadixAgents|RadixConfirm|\/api\/chat|reply\(/.test(js),'no AI call from the home');
 assert.deepEqual([...js.matchAll(/fetch\('([^']+)'/g)].map(m=>m[1]).sort(),['/agency/catalog.json','/api/state?view=dashboard'],'catalogue and Command Center summary only');
 assert.match(js,/O\.suggest\(\{query:input\.value,project:state\.project,journey:state\.journey,tasks:state\.tasks\}\)/,'suggestions from the typed text and the real project state');
 assert.match(js,/e\.key==='ArrowDown'/);assert.match(js,/e\.key==='ArrowUp'/);assert.match(js,/e\.key==='Escape'/);assert.match(js,/setAttribute\('aria-activedescendant'/);
 assert.match(js,/O\.resolve\(input\.value,\{projectId:state\.project&&state\.project\.id\}\)/);
 assert.match(js,/layout=O\.globeLayout\(W,H,sizes,\{blocked\}\)/,'labels placed by the tested layout, with their measured sizes');
 assert.match(js,/a=node\('a','mo-gl'\);a\.href=p\.href/);assert.match(js,/setAttribute\('aria-label'/);
 assert.match(js,/prefers-reduced-motion: reduce/);assert.match(js,/document\.addEventListener\('visibilitychange'/);assert.match(js,/new IntersectionObserver/);
 assert.match(js,/'Nessun lavoro in corso'/,'honest empty state');
 assert.match(css,/@media \(max-width:640px\)/);assert.match(shared,/@media \(prefers-reduced-motion:reduce\)/);
 assert.match(globe,/root\.RadixGlobeLand/,'the land comes from the shared mask of sales/orbit-globe.js');
 for(const src of [js,globe])new vm.Script(src);
});

test('command bar suggestions: deterministic, from what is typed or from the project state, every link a page of the repo',()=>{
 const empty=orbit.suggest({});
 assert.deepEqual(empty.map(s=>s.id),['svc-strategy','svc-identita','svc-social','svc-site','svc-newsletter'],'no project: the first steps');
 assert.deepEqual(orbit.suggest({}),empty,'same input, same list');
 const fa={id:'forno-aurora',name:'Forno Aurora'};
 const ctx=orbit.suggest({project:fa,journey:{steps:[{id:'brief',state:'done'},{id:'ped',state:'waiting',detail:'3 contenuti da approvare'},{id:'tasks',state:'waiting'}]},tasks:[{status:'done'},{status:'done'},{status:'running'}]});
 assert.deepEqual(ctx.map(s=>s.label),['Rivedi 2 bozze da approvare','Approva i contenuti del piano','Crea dai post del piano','Scrivi la newsletter','Crea un’immagine']);
 assert.equal(ctx[0].href,'/agency/project-workspace.html?id=forno-aurora');assert.equal(ctx[1].href,'/project-editorial.html?project=forno-aurora#ped');
 assert.equal(ctx[4].href,'/agency/crea.html?open=images&project=forno-aurora');
 const fresh=orbit.suggest({project:fa,journey:{steps:[{id:'brief',state:'todo'},{id:'ped',state:'todo'}]},tasks:[]});
 assert.deepEqual(fresh.map(s=>s.id).slice(0,2),['svc-strategy','svc-social'],'a new project starts from the strategy');
 assert.equal(fresh[0].href,'/project-editorial.html?project=forno-aurora#brief');
 assert.deepEqual(orbit.suggest({query:'Rispondi alle recensioni'}).map(s=>s.id),['svc-google']);
 assert.equal(orbit.suggest({query:'post per il pane di Natale'})[0].id,'svc-social');
 assert.equal(orbit.suggest({query:'un volantino per l’open day'})[0].id,'svc-stampa');
 assert.equal(orbit.suggest({query:'traduci il sito in inglese'})[0].id,'svc-traduzione');
 assert.equal(orbit.suggest({query:'logo e colori'})[0].id,'svc-identita');
 assert.deepEqual(orbit.suggest({query:'zzz qwerty'}),[],'no match, no invented suggestion');
 assert.ok(orbit.suggest({query:'post'}).length<=5);
 for(const card of crea.CARDS)for(const pid of ['','forno-aurora']){const h=orbit.serviceHref(card,pid);assert.ok(exists(h),card.id+' '+h)}
 assert.equal(orbit.serviceHref(crea.card('avatar'),''),'/agency/avatar.html');
 assert.equal(orbit.serviceHref(crea.card('social'),''),'/project-editorial.html#ped');
 assert.equal(orbit.serviceHref(crea.card('seo'),'bad id!'),'/agency/crea.html?open=seo','an invalid project id is dropped');
});

test('command bar submit: the best service with the text, else «Cosa vuoi fare» with the text; nothing else',()=>{
 assert.equal(orbit.resolve('post per il pane di Natale',{projectId:'forno-aurora'}),'/project-editorial.html?project=forno-aurora&q=post%20per%20il%20pane%20di%20Natale#ped');
 assert.equal(orbit.resolve('rispondi alle recensioni'),'/agency/crea.html?open=google&q=rispondi%20alle%20recensioni');
 assert.equal(orbit.resolve('boh',{projectId:'p1'}),'/agency/crea.html?q=boh&project=p1');
 assert.equal(orbit.resolve(''),'/agency/crea.html');
 assert.ok(orbit.resolve('x'.repeat(500)).length<300,'the text is cut');
 assert.equal(orbit.withParams('/a.html#h',{q:'a b'}),'/a.html?q=a%20b#h');
});

test('work in progress: the open Agency tasks, drafts to review first, archived projects left out, nothing invented',()=>{
 const projects=[{id:'a',name:'Alfa',client_name:'Alfa Srl',status:'active',updated_at:'2026-10-20'},{id:'b',name:'Beta',status:'active',updated_at:'2026-10-21'},{id:'z',name:'Z',status:'archived'}];
 const plans=new Map([['a',{tasks:[{role:'copywriter',status:'running',instruction:'Testi'},{role:'seo-geo',status:'approved'},{role:'web-developer',status:'done',instruction:'Landing'}]}],
  ['b',{tasks:[{role:'video-producer',status:'error',instruction:'Video'},{role:'x',status:'weird'}]}],['z',{tasks:[{status:'done',instruction:'old'}]}]]);
 const j=orbit.jobs(projects,plans,{roles:{copywriter:'Copywriter'},status:{done:'Bozza da revisionare'}});
 assert.equal(j.total,3);assert.equal(j.review,1);
 assert.deepEqual(j.rows.map(r=>[r.title,r.status,r.tone]),[['Landing','done','review'],['Video','error','error'],['Testi','running','progress']]);
 assert.deepEqual(j.rows[0].progress,{done:1,total:3});assert.equal(j.rows[0].label,'Bozza da revisionare');assert.equal(j.rows[2].agent,'Copywriter');
 assert.equal(j.rows[0].href,'/agency/project-workspace.html?id=a');assert.ok(exists(j.rows[0].href));
 assert.deepEqual(orbit.jobs([],new Map()),{total:0,review:0,rows:[]});
 assert.deepEqual(orbit.jobs(null,null),{total:0,review:0,rows:[]});
 assert.equal(orbit.currentProject(projects,'a').id,'a','the project chosen in «Cosa vuoi fare»');
 assert.equal(orbit.currentProject(projects,'z').id,'b','archived: the most recent instead');
 assert.equal(orbit.currentProject([],'a'),null);
 assert.deepEqual([...orbit.FLOW],require('../lib/project-journey.js').PHASES.map(p=>p.label),'the same nine phases as the project journey');
 for(const slug of Object.keys(crea.AREAS))assert.ok(orbit.AREA_LINE[slug],slug);
});

// Exact geometry, independent of the layout's grid: does the segment p-q come within `pad` of box b?
function segNearBox(p,q,b,pad){const B={x:b.x-pad,y:b.y-pad,w:b.w+2*pad,h:b.h+2*pad};
 const inside=P=>P.x>=B.x&&P.x<=B.x+B.w&&P.y>=B.y&&P.y<=B.y+B.h;if(inside(p)||inside(q))return true;
 const o=(p1,p2,p3)=>Math.sign((p2.x-p1.x)*(p3.y-p1.y)-(p2.y-p1.y)*(p3.x-p1.x)),cross=(a,b2,c,d)=>o(a,b2,c)!==o(a,b2,d)&&o(c,d,a)!==o(c,d,b2);
 const C=[{x:B.x,y:B.y},{x:B.x+B.w,y:B.y},{x:B.x+B.w,y:B.y+B.h},{x:B.x,y:B.y+B.h}];
 return C.some((c,i)=>cross(p,q,c,C[(i+1)%4]));}
test('globe: at 1440 and 390 every label is off the orbit lines, the earth, the nodes and the other labels, inside the stage, in the areas order',()=>{
 const ps=orbit.planets();
 // Stage sizes of agency/orbit.css: 520x490 at 1440 (narrower up to 1240), 400 tall when stacked, 358x330 on a 390 phone.
 const cases=[[520,490,false],[480,490,false],[400,490,false],[700,400,false],[1000,400,false],[358,330,true],[342,330,true],[375,330,true]];
 for(const [W,H,compact] of cases){
  // The pause button sits in the bottom-right corner of the stage (orbit.css .mo-pause): nothing goes under it.
  const pause=compact?{x:W-176,y:H-44,w:176,h:44}:{x:W-170,y:H-32,w:170,h:32};
  const L=orbit.globeLayout(W,H,ps.map(p=>orbit.labelSize(p.group,compact)),{blocked:[pause]});assert.ok(L,'a layout at '+W+'x'+H);
  for(const b of L.labels)assert.ok(!orbit.hit(b,pause),'no label under the pause button at '+W+'x'+H);
  for(const n of L.nodes)assert.ok(orbit.toBox(n.x,n.y,pause)>=orbit.GLOBE.node,'no node under the pause button at '+W+'x'+H);
  assert.equal(L.labels.length,ps.length);assert.equal(L.nodes.length,ps.length);
  for(const [i,b] of L.labels.entries()){
   const tag=W+'x'+H+' '+ps[i].slug;
   assert.ok(b.x>=0&&b.y>=0&&b.x+b.w<=W&&b.y+b.h<=H,'inside '+tag);
   assert.ok(orbit.toBox(L.cx,L.cy,b)>=L.R*orbit.GLOBE.halo,'off the earth and its glow '+tag);
   for(const o of L.orbits){const N=2880;let prev=null;for(let s=0;s<=N;s++){const t=s/N*2*Math.PI,ex=Math.cos(t)*o.rx,ey=Math.sin(t)*o.ry;
    const p={x:L.cx+ex*Math.cos(o.a)-ey*Math.sin(o.a),y:L.cy+ex*Math.sin(o.a)+ey*Math.cos(o.a)};if(prev)assert.ok(!segNearBox(prev,p,b,3),'no orbit line through '+tag);prev=p}}
   for(const c of L.labels.slice(i+1))assert.ok(!orbit.hit({x:b.x-4,y:b.y-4,w:b.w+8,h:b.h+8},c),'labels apart '+tag);
   for(const n of L.nodes)assert.ok(orbit.toBox(n.x,n.y,b)>=orbit.GLOBE.node+4,'no node under '+tag);
  }
  for(const [i,n] of L.nodes.entries()){assert.ok(Math.hypot(n.x-L.cx,n.y-L.cy)>L.R*orbit.GLOBE.halo,'node beside the earth');for(const m of L.nodes.slice(i+1))assert.ok(Math.hypot(n.x-m.x,n.y-m.y)>=orbit.GLOBE.spread-1e-9,'nodes apart')}
  // The labels go round the earth in the areas' order, starting from Brand on top.
  const ang=L.labels.map(b=>Math.atan2((b.y+b.h/2-L.cy)/H,(b.x+b.w/2-L.cx)/W));let turn=0;for(let k=0;k<ang.length;k++){let d=ang[(k+1)%ang.length]-ang[k];while(d<=0)d+=2*Math.PI;turn+=d}
  assert.ok(Math.abs(turn-2*Math.PI)<1e-6,'clockwise order at '+W+'x'+H);
  assert.ok(L.labels[0].y+L.labels[0].h/2<L.cy,'Brand above the earth at '+W+'x'+H);
 }
 assert.equal(orbit.globeLayout(60,60,ps.map(p=>orbit.labelSize(p.group))),null,'no room: no labels rather than overlapping ones');
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

test('home «B»: header with the project and its switcher, «Cosa vuoi fare oggi?» beside «Aspettano te», KPI tiles, board with the globe on the side',()=>{
 const html=read('agency/orbit.html'),js=read('agency/orbit.js'),css=read('agency/orbit.css');
 const at=s=>{const i=html.indexOf(s);assert.ok(i>0,s);return i};
 assert.ok(at('id="moTitle"')<at('class="ma-glass mo-hero"')&&at('class="ma-glass mo-hero"')<at('id="moKpis"')&&at('id="moKpis"')<at('class="mo-board"'),'header, hero card, tiles, board');
 assert.ok(at('id="moAskForm"')<at('id="moWait"'),'the ask box first, «Aspettano te» beside it');
 assert.match(html,/<h2 class="mo-ask-title" id="moAskTitle">Cosa vuoi fare oggi\?<\/h2>/);
 assert.match(html,/<span id="moWaitTitle">Aspettano te<\/span>/);
 assert.match(html,/<label class="mo-switch" id="moSwitchBox" hidden>[^]*<select id="moSwitch" aria-label="Progetto"><\/select><\/label>/);
 assert.match(html,/id="moNewJob" href="\/agency\/crea\.html"/);
 assert.ok(at('id="moAreas"')<at('id="moJobs"')&&at('id="moJobs"')<at('id="moStage"'),'services left, work and the smaller globe in the side column');
 assert.match(js,/O\.waiting\(\{project:state\.project,journey:state\.journey,projects:state\.projects,plans:state\.plans,approvals:state\.dashboard&&state\.dashboard\.approvals,roles:state\.roles\}\)/);
 assert.match(js,/O\.kpis\(\{projects:state\.projects,plans:state\.plans,dashboard:state\.dashboard,approvals:c\.approvazioni\}\)/);
 assert.match(js,/k\.value==null\?'—'/,'a tile without data shows a dash, never a number');
 assert.match(js,/'Niente da decidere adesso: /,'honest empty state for «Aspettano te»');
 assert.match(js,/\.filter\(x=>x\.kind!=='step'\)/,'steps waiting for a person live in «Aspettano te», not twice');
 assert.match(js,/localStorage\.setItem\(KEY,p\.id\)/,'the switcher remembers the project, like «Cosa vuoi fare»');
 assert.match(js,/compact=phone\.matches\|\|W<440/,'in the side column the globe labels are a picture');
 assert.match(css,/\.mo-board\{display:grid;grid-template-columns:minmax\(0,1fr\) 380px/);
 assert.match(css,/\.mo-orbit \.mo-stage\{height:330px\}/);
 const phone=css.slice(css.indexOf('@media (max-width:640px)'));
 for(const s of ['.mo-ask .ma-option-link{min-height:44px}','.mo-head-actions>.ma-btn{flex:1 1 0;min-height:44px','.mo-switch select{width:100%;min-height:44px}','.mo-chip--link{min-height:44px}','.mo-job-link{min-height:44px}'])assert.ok(phone.includes(s),s);
 assert.match(css,/\.mo-board\{display:flex;flex-direction:column;align-items:stretch;gap:16px\}\.mo-col\{display:contents\}/,'one column: no section wider than the page');
 assert.match(css,/\.mo-wait-item\{[^}]*min-height:56px/);
 // the smaller globe: the side column (340 wide inside a 380 column, 300 at 1180px) and the phone (326) still lay out
 for(const [W,H] of [[340,330],[300,330],[326,330]]){const L=orbit.globeLayout(W,H,orbit.planets().map(p=>orbit.labelSize(p.group,true)),{blocked:[{x:W-176,y:H-44,w:176,h:44}]});assert.ok(L,W+'x'+H)}
});

test('«Aspettano te»: waiting steps, drafts and failed tasks per project, approvals awaiting a decision; nothing invented',()=>{
 const fa={id:'fa',name:'Forno Aurora',status:'active'},sf={id:'sf',name:'Studio Fisio',status:'active'},old={id:'z',name:'Z',status:'archived'};
 const plans=new Map([['fa',{tasks:[{role:'copywriter',status:'done'},{role:'seo-geo',status:'done'},{role:'x',status:'running'}]}],['sf',{tasks:[{role:'video-producer',status:'error'}]}],['z',{tasks:[{status:'done'}]}]]);
 const approvals=[{id:'a1',awaiting:true,title:'Strategia · Primavera',reason:'Studio Fisio',href:'/project-editorial.html?project=sf'},{id:'a2',awaiting:false,title:'Vecchia',href:'/x.html'},
  {id:'a3',awaiting:true,title:'Fuori',href:'https://evil.test/'},{id:'a4',awaiting:true,title:'Doppia barra',href:'//evil.test/'}];
 const w=orbit.waiting({project:sf,journey:{steps:[{id:'brief',state:'waiting',detail:'Strategia da approvare'},{id:'tasks',state:'waiting'},{id:'ped',state:'todo'}]},projects:[fa,sf,old],plans,approvals,roles:{copywriter:'Copywriter','video-producer':'Video Producer'}});
 assert.deepEqual(w.items.map(i=>i.label),['Approva la strategia','1 incarico non riuscito','Rivedi 2 bozze degli agenti','Strategia · Primavera'],'current project first, archived and external links left out');
 assert.equal(w.total,4);
 assert.equal(w.items[0].href,'/project-editorial.html?project=sf#brief');assert.equal(w.items[0].hint,'Studio Fisio · Strategia da approvare');
 assert.equal(w.items[1].hint,'Studio Fisio · Video Producer');assert.equal(w.items[2].hint,'Forno Aurora · Copywriter, seo-geo');
 assert.equal(w.items[2].href,'/agency/project-workspace.html?id=fa');
 for(const i of w.items)assert.ok(exists(i.href),i.href);
 assert.deepEqual(orbit.waiting({}),{total:0,items:[]});
 assert.equal(orbit.waiting({projects:[fa],plans,limit:1}).items.length,1);
});

test('KPI tiles and sparklines: counts from the plans and the Command Center, a series only from dated data, a dash when missing',()=>{
 const now=Date.parse('2026-10-22T12:00:00');
 assert.deepEqual(orbit.daily([],{now}),new Array(14).fill(0));
 const s=orbit.daily(['2026-10-22T09:00:00','2026-10-22T10:00:00','2026-10-20T10:00:00','2026-10-01T10:00:00','x',null],{now});
 assert.equal(s.length,14);assert.equal(s[13],2);assert.equal(s[11],1);assert.equal(s.reduce((a,b)=>a+b,0),3,'outside the window or unreadable: left out');
 assert.equal(orbit.sparkPath([0,0,0]),null,'no movement, no line');assert.equal(orbit.sparkPath([3]),null);
 assert.deepEqual(orbit.sparkPath([0,2],96,28),{line:'M2 26 L94 2',area:'M2 26 L94 2 L94 26 L2 26 Z'});
 const none=orbit.kpis({});
 assert.deepEqual(none.map(k=>[k.id,k.value]),[['open',null],['review',null],['approvals',null],['activity',null]]);
 for(const k of none){assert.equal(k.sub,'non disponibile');assert.ok(!k.series)}
 const projects=[{id:'a',status:'active'},{id:'z',status:'archived'}];
 const plans=new Map([['a',{tasks:[{status:'done'},{status:'done'},{status:'running'},{status:'approved'},{status:'error'},{status:'weird'}]}],['z',{tasks:[{status:'done'}]}]]);
 const act=Array.from({length:3},(_,i)=>({at:'2026-10-2'+i+'T10:00:00'}));
 const k=orbit.kpis({projects,plans,dashboard:{approvalsSupported:true,approvals:[{at:'2026-10-21T10:00:00'}],activity:act},approvals:1,now});
 assert.deepEqual(k.map(x=>x.value),[4,2,1,3]);
 assert.deepEqual(k[0].bar,{done:1,total:6});assert.match(k[1].sub,/1 non riuscito/);
 assert.equal(k[2].series.length,14);assert.equal(k[3].series.reduce((a,b)=>a+b,0),3);
 assert.equal(orbit.kpis({projects,plans,dashboard:{approvalsSupported:false,approvals:[]},approvals:null,now})[2].value,null,'approvals not active: no number');
 const full=Array.from({length:24},()=>({at:'2026-10-22T08:00:00'}));
 assert.equal(orbit.kpis({dashboard:{activity:full},now})[3].value,'24+','the summary keeps the last 24: at least, never exactly');
});
