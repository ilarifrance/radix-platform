const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('shell/cc-universe.js','utf8');
const css=fs.readFileSync('shell/cc.css','utf8');
const shell=fs.readFileSync('shell/radix-shell.js','utf8');
// the two tables, evaluated straight from the source
function table(name){const m=new RegExp('var '+name+' = (\\[[\\s\\S]*?\\n  \\]);').exec(source);assert.ok(m,name+' not found');return vm.runInNewContext(m[1]);}
const SERVICES=table('SERVICES'),LINKS=table('SERVICE_LINKS');

test('services come from the shell nav and every page exists in the repo',()=>{
 const ids=SERVICES.map(s=>s.id);
 for(const id of ['marketing','crm','lead','pm','agents','studio'])assert.ok(ids.includes(id),id);
 for(const s of SERVICES){
  assert.match(s.color,/^#[0-9a-f]{6}$/);
  for(const href of [s.href,...s.pages.map(p=>p[1])]){
   const file=href.replace(/^\//,'').replace(/[#?].*$/,'');
   assert.ok(fs.existsSync(file),href+' is not a page of the repo');
   assert.ok(shell.includes("href: '"+href.replace(/#.*$/,'')),href+' is not in the shell NAV');
  }
 }
 // one colour per service, none equal to the RADIX green
 assert.equal(new Set(SERVICES.map(s=>s.color)).size,SERVICES.length);
 assert.ok(!SERVICES.some(s=>s.color==='#2dffa8'));
});

test('direct links join existing services, once each, and each is documented with its code evidence',()=>{
 const ids=new Set(SERVICES.map(s=>s.id)),seen=new Set();
 for(const [a,b,label] of LINKS){
  assert.ok(ids.has(a)&&ids.has(b)&&a!==b,a+'↔'+b);assert.ok(label.length>4);
  const k=[a,b].sort().join('|');assert.ok(!seen.has(k),'duplicate '+k);seen.add(k);
  assert.ok(new RegExp('//  '+a+' ↔ '+b).test(source),'no evidence comment for '+a+' ↔ '+b);
 }
 for(const k of ['crm|lead','crm|marketing','marketing|pm'])assert.ok(seen.has(k),k);
 // agents talk to every other service
 for(const s of SERVICES)if(s.id!=='agents')assert.ok(seen.has(['agents',s.id].sort().join('|')),'agents ↔ '+s.id);
 // the integrations the comments cite are really in the code
 assert.ok(fs.readFileSync('lead-intelligence.html','utf8').includes('Porta nel CRM'));
 assert.ok(fs.readFileSync('editorial-workspace.js','utf8').includes('radix-crm-campaign-draft')&&fs.readFileSync('sales/crm-campaigns.js','utf8').includes('radix-crm-campaign-draft'));
 assert.ok(fs.readFileSync('radix-pm-concept.html','utf8').includes('views.syncFromPed('));
 assert.ok(fs.readFileSync('sales/lead-newsletter.js','utf8').includes("role:'comm-email-outreach'"));
 assert.ok(fs.readFileSync('sales/crm-copilot.js','utf8').includes("/api/chat"));
 for(const f of ['radix-pm-concept.html','project-editorial.html','commercial/index.html','legal/index.html','accounting/index.html'])assert.ok(fs.readFileSync(f,'utf8').includes('radix-agent-runtime.js'),f);
});

test('services are real links with Italian names, a panel of sub-pages and the services they exchange data with',()=>{
 assert.ok(source.includes("var a = node('a', 'cc-hub'); a.href = s.href;"));
 assert.ok(source.includes("a.setAttribute('aria-label', 'Apri ' + s.name"));
 assert.ok(source.includes("tip.setAttribute('aria-label', 'Pagine di ' + s.name)"));
 assert.ok(source.includes("node('a', 'cc-sat cc-sat-page'); e.href = p[1]"));
 assert.ok(source.includes("'Scambia dati con'"));
 // the map's drag-to-pan must not swallow a click on a link
 assert.ok(source.includes("e.target.closest('a[href]')) e.stopPropagation()"));
});

test('projects stay one switch away and keep the map drill-down',()=>{
 assert.ok(source.includes("[['servizi', 'Servizi'], ['progetti', 'Progetti']]"));
 assert.ok(source.includes("b.setAttribute('aria-pressed', String(mode === m[0]))"));
 assert.ok(source.includes("localStorage.setItem('cc-network-mode', mode)")&&/try \{ localStorage\.setItem/.test(source));
 assert.ok(source.includes("items = mode === 'servizi' ? buildServices() : buildProjects();"));
 // inside a project the page's own map and legend come back, in both modes
 assert.ok(source.includes("function atRoot() { return !deeper() && (mode === 'servizi' || hasProjects()); }"));
 assert.ok(source.includes('l.innerHTML = legendHtml'));
 for(const t of ["'servizio'","'verso RADIX'","'scambio diretto'","'nucleo progetto'"])assert.ok(source.includes(t),t);
});

test('beams react to the pointer and to the focused service, reduced motion keeps a still frame',()=>{
 assert.ok(source.includes("world.addEventListener('pointermove'")&&source.includes("world.addEventListener('pointerleave'"));
 assert.ok(source.includes('ptr.k = reduce.matches ? 0 :'));
 assert.ok(/function nearness\(c\)/.test(source)&&source.includes('mx += (ptr.x - mx) * pull'));
 assert.ok(source.includes('f = f * f * 14 * pk'));
 // hover and keyboard focus light the same beams and dim the rest, and repaint under reduced motion
 assert.ok(source.includes("wrap.addEventListener('focusin', hot(true))"));
 assert.ok(source.includes('if (reduce.matches) paintOnce();'));
 assert.ok(css.includes('.cc-proj.cc-dim{opacity:.32}'));
 // a single loop, still paused when hidden or off-screen
 assert.equal((source.match(/requestAnimationFrame\(/g)||[]).length,1);
});

test('the dots are crisp: a solid core with a hard edge and a thin halo, sprites big enough for dpr 2',()=>{
 assert.ok(source.includes('c.width = c.height = 64'));
 assert.ok(source.includes('gr.addColorStop(.42, rgba(color, 1));'));
 assert.ok(source.includes("gr.addColorStop(.5, rgba(color, .28))"));
 assert.ok(source.includes("imageSmoothingQuality = 'high'"));
});

test('phone layout: the switch is centred and the view has no horizontal scroll',()=>{
 assert.ok(css.includes('.cc-world.cc-small .cc-modes{left:50%;transform:translateX(-50%)}'));
 assert.ok(css.includes('@media (max-width:640px){.network-wrap:has(.cc-world-on){height:auto!important;overflow:hidden}'));
});
