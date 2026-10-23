'use strict';
// The Marketing menu (agency/marketing-nav.js + agency/marketing-nav.css), as the Sales one: the Marketing entries get
// the room, the platform entries shrink to one small link and two folded groups. Every entry is a link the shell
// already builds (data-rx-id of shell/radix-shell.js), the script and the stylesheet are on every Marketing page, and
// the light palette of direction «B» stays in the shared tokens.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const js=read('agency/marketing-nav.js'),navCss=read('agency/marketing-nav.css'),shell=read('shell/radix-shell.js');
const PAGES=['project-editorial.html','agency/avatar.html','agency/clients.html','agency/crea.html','agency/index.html','agency/memory.html',
 'agency/new-project.html','agency/operations.html','agency/orbit.html','agency/project-workspace.html','agency/projects.html','agency/workspace.html'];
const MARKETING=[['agency-orbit','Panoramica'],['agency-crea','Cosa vuoi fare'],['agency-clients','Clienti'],['agency-projects','Progetti'],
 ['agency-ped','Piano editoriale'],['agency-avatar','Studio Avatar'],['agency','Agenzia e divisioni'],['agency-workflow','Workflow'],
 ['agency-operations','Operations'],['agency-memory','Memoria']];
const shellIds=new Set([...shell.matchAll(/\{\s*id:\s*'([\w-]+)'/g)].map(m=>m[1]));

// ---- a small DOM, enough for the script: elements, classes, attributes and the selectors it uses ----
class El{
 constructor(tag,attrs={},text=''){this.tagName=tag.toUpperCase();this.attrs={...attrs};this.children=[];this.parent=null;this._text=text;this.open=false;
  const el=this;this.classList={add:(...c)=>{const s=new Set(el.cls());c.forEach(x=>s.add(x));el.attrs.class=[...s].join(' ')},contains:c=>el.cls().includes(c),remove:c=>{el.attrs.class=el.cls().filter(x=>x!==c).join(' ')}}}
 cls(){return (this.attrs.class||'').split(/\s+/).filter(Boolean)}
 get className(){return this.attrs.class||''}set className(v){this.attrs.class=v}
 get href(){return this.attrs.href}set href(v){this.attrs.href=v}
 get title(){return this.attrs.title}set title(v){this.attrs.title=v}
 get textContent(){return this._text+this.children.map(c=>c.textContent).join('')}set textContent(v){this._text=v;this.children=[]}
 set innerHTML(v){this._html=v}
 get firstChild(){return this.children[0]||null}
 getAttribute(n){return n in this.attrs?this.attrs[n]:null}setAttribute(n,v){this.attrs[n]=String(v)}removeAttribute(n){delete this.attrs[n]}
 append(...k){k.forEach(c=>{if(c.parent)c.remove();c.parent=this;this.children.push(c)})}
 insertBefore(c,ref){if(c.parent)c.remove();c.parent=this;const i=ref?this.children.indexOf(ref):-1;i<0?this.children.push(c):this.children.splice(i,0,c)}
 remove(){if(this.parent){this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null}}
 all(){return this.children.flatMap(c=>[c,...c.all()])}
 matches(sel){const m=/^([a-z]*)((?:\.[\w-]+)*)((?:\[[\w-]+(?:="?[^\]"]*"?)?\])*)$/i.exec(sel.trim());if(!m)throw new Error('selector '+sel);
  if(m[1]&&this.tagName!==m[1].toUpperCase())return false;
  for(const c of m[2].split('.').filter(Boolean))if(!this.cls().includes(c))return false;
  for(const a of m[3].match(/\[[^\]]+\]/g)||[]){const [,n,v]=/^\[([\w-]+)(?:="?([^"]*)"?)?\]$/.exec(a);if(!(n in this.attrs))return false;if(v!==undefined&&this.attrs[n]!==v)return false}
  return true}
 querySelectorAll(sel){if(sel.startsWith(':scope >')){const s=sel.slice(8);return this.children.filter(c=>c.matches(s))}
  const parts=sel.trim().split(/\s+/);return this.all().filter(e=>{if(!e.matches(parts[parts.length-1]))return false;let p=e.parent,i=parts.length-2;while(i>=0&&p&&p!==this){if(p.matches(parts[i]))i--;p=p.parent}return i<0})}
 querySelector(sel){return this.querySelectorAll(sel)[0]||null}
}
function shellSidebar(current){
 // the links shell/radix-shell.js builds: one per NAV id, with an icon and a label, the current page with aria-current
 const side=new El('div',{id:'rx-sidebar',class:'rx-sidebar'});side.append(new El('a',{class:'rx-brand',href:'/control-center-v2.html'}));
 const nav=new El('nav',{class:'rx-nav'}),foot=new El('nav',{class:'rx-nav rx-foot'});
 for(const id of shellIds){const a=new El('a',{class:'rx-item','data-rx-id':id,href:'/'+id});if(id===current)a.setAttribute('aria-current','page');
  a.append(new El('svg'),new El('span',{},'shell '+id));(id==='impostazioni'||id==='admin'?foot:nav).append(a)}
 side.append(nav,foot);return side}
function run({page='agency-orbit',pathname='/agency/orbit.html',hash=''}={}){
 const side=shellSidebar(page),body=new El('body',{'data-shell-area':'agency','data-shell-page':page}),html=new El('html');
 const listeners={},location={pathname,hash};
 const document={body,documentElement:html,getElementById:id=>id==='rx-sidebar'?side:null,createElement:t=>new El(t),createElementNS:(ns,t)=>new El(t)};
 vm.runInNewContext(js,{document,location,window:{addEventListener:(t,f)=>{listeners[t]=f}}});
 return {side,html,location,listeners}}
const labels=box=>box.children.filter(c=>c.tagName==='A').map(a=>a.getAttribute('data-rx-id'));

test('every menu entry is a link the shell already builds (no new pages)',()=>{
 for(const [id] of MARKETING)assert.ok(shellIds.has(id),id);
 const ids=[...js.matchAll(/\{ id: '([\w-]+)'/g)].map(m=>m[1]);assert.ok(ids.length>=20);
 for(const id of [...ids,'cc','impostazioni','admin'])assert.ok(shellIds.has(id),'shell NAV has '+id);
 assert.ok(!/href\s*=\s*['"]\/(?!agency\/orbit\.html)/.test(js),'the only href set is the brand back to the Marketing home');
});

test('the menu: Panoramica first, the Marketing and Agenzia groups with the Marketing names, Command Center as one small link',()=>{
 const {side,html}=run();
 assert.ok(side.classList.contains('mk-side'));assert.ok(html.classList.contains('mk-shell'));
 const navs=side.children.filter(c=>c.tagName==='NAV');assert.equal(navs.length,2,'the shell menus are replaced by one menu and the foot');
 const [nav,foot]=navs;assert.equal(nav.getAttribute('aria-label'),'Menu Marketing');assert.ok(foot.classList.contains('mk-foot'));
 assert.equal(nav.children[0].getAttribute('data-rx-id'),'cc');assert.ok(nav.children[0].classList.contains('mk-back'),'Command Center is the small back link');
 const [mk,ag]=nav.children.filter(c=>c.tagName==='DIV');
 assert.deepEqual(labels(mk),MARKETING.slice(0,6).map(x=>x[0]));assert.deepEqual(labels(ag),MARKETING.slice(6).map(x=>x[0]));
 assert.equal(mk.children[0].textContent,'Marketing');assert.equal(ag.children[0].textContent,'Agenzia');
 for(const [id,text] of MARKETING){const a=side.querySelector('a[data-rx-id="'+id+'"]');assert.equal(a.querySelector('span').textContent,text,id);assert.ok(a.classList.contains('mk-link'))}
 assert.equal(side.querySelector('.rx-brand').href,'/agency/orbit.html');
});

test('the global entries are compact: two folded groups, closed when the page is not in them, the system links in the foot',()=>{
 const {side}=run();const folds=side.querySelectorAll('details.mk-fold');
 assert.deepEqual(folds.map(d=>d.children[0].textContent),['Piattaforma','Altre aree']);
 assert.ok(folds.every(d=>!d.open),'closed on a Marketing page');
 assert.deepEqual(labels(folds[0]),['cc-projects','cc-approvals','agents','cc-knowledge','cc-analytics','cc-integrations','archive']);
 assert.ok(labels(folds[1]).includes('sales-orbit'));
 assert.deepEqual(labels(side.querySelector('nav.mk-foot')),['impostazioni','admin']);
 assert.match(navCss,/html\.rx-shell \.mk-side \.mk-fold a\.rx-item\.mk-link\{min-height:32px;padding:6px 12px;font-size:13px\}/,'smaller rows in the folds');
});

test('the active state: the shell page stays current, a fold with the current page opens, #workflow wins on the overview',()=>{
 let r=run({page:'agency-ped',pathname:'/project-editorial.html'});
 assert.equal(r.side.querySelectorAll('[aria-current]').map(a=>a.getAttribute('data-rx-id')).join(),'agency-ped');
 r=run({page:'agents',pathname:'/agents.html'});assert.ok(r.side.querySelectorAll('details.mk-fold')[0].open,'Piattaforma opens on its page');
 r=run({page:'agency',pathname:'/agency/index.html',hash:'#workflow'});
 assert.equal(r.side.querySelectorAll('[aria-current]').map(a=>a.getAttribute('data-rx-id')).join(),'agency-workflow');
 r.location.hash='';r.listeners.hashchange();
 assert.equal(r.side.querySelectorAll('[aria-current]').map(a=>a.getAttribute('data-rx-id')).join(),'agency');
 assert.match(navCss,/a\.rx-item\.mk-link\[aria-current="page"\]\{background:var\(--mk-accent-soft\);[^}]*color:var\(--mk-accent-ink\);[^}]*box-shadow:inset 3px 0 0 var\(--mk-accent\)\}/);
});

test('only on Marketing pages, only once',()=>{
 const side=shellSidebar('crm'),body=new El('body',{'data-shell-area':'sales'});
 vm.runInNewContext(js,{document:{body,documentElement:new El('html'),getElementById:()=>side},location:{pathname:'/sales/crm.html',hash:''},window:{addEventListener(){}}});
 assert.ok(!side.classList.contains('mk-side'),'Sales keeps its own menu');
});

test('every Marketing page loads the menu right after the shell, and its stylesheet',()=>{
 for(const f of PAGES){const h=read(f);
  assert.ok(h.includes('<script src="/shell/radix-shell.js" defer></script><script src="/agency/marketing-nav.js" defer></script>'),f);
  assert.ok(h.includes('<link rel="stylesheet" href="/agency/marketing-nav.css">'),f);
  assert.match(h,/data-shell-area="agency"/,f);assert.ok(!/color-scheme:dark|name="color-scheme" content="dark/.test(h),f+' is light')}
});

test('light direction «B»: the shell and the shared tokens are white and grey with one indigo accent, at AA',()=>{
 assert.match(navCss,/--rx-bg:#f4f4f8;--rx-bg-raised:#fff;--rx-surface:#fff;/);assert.match(navCss,/--rx-text:#1d1a27;--rx-muted:#55516a;--rx-subtle:#6b6780;/);
 assert.match(navCss,/--mk-accent:#4f46e5;--mk-accent-ink:#4338ca;--mk-accent-soft:#eef0ff;/);
 const ma=read('shell/marketing-a.css');
 assert.match(ma,/\.ma,\.ma-root\{--ma-bg:#f4f4f8;--ma-panel:#fff;/);assert.match(ma,/--ma-tx:#1d1a27;--ma-tx2:#55516a;--ma-mut:#6b6780;--ma-link:#4338ca;/);
 assert.match(ma,/--ma-vi:#4f46e5;/);
 const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
 const ratio=(a,b)=>{const x=lum(a)+.05,y=lum(b)+.05;return Math.max(x,y)/Math.min(x,y)};
 for(const [fg,bg,min] of [['#1d1a27','#f4f4f8',4.5],['#55516a','#f4f4f8',4.5],['#6b6780','#f4f4f8',4.5],['#4338ca','#eef0ff',4.5],['#ffffff','#4f46e5',4.5],['#4f46e5','#ffffff',4.5]])
  assert.ok(ratio(fg,bg)>=min,fg+' on '+bg+' '+ratio(fg,bg).toFixed(2));
 assert.match(navCss,/:focus-visible\{outline:2px solid var\(--mk-accent\)/,'visible focus');
});

test('phone and tablet: 44px rows in the drawer, an icon rail on the tablet',()=>{
 assert.match(navCss,/@media \(max-width:767px\)\{[^@]*a\.rx-item\.mk-link[^{]*\{min-height:44px\}/);
 assert.match(navCss,/@media \(max-width:1279px\) and \(min-width:768px\)\{\s*html\.rx-shell\[data-rx-area="agency"\]\{--rx-sidebar:72px\}/);
});
