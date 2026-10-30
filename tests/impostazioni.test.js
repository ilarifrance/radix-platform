'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const core=require('../shell/settings-core.js');
const realAuth=require('../api/_auth.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

// api/auth/[action].js with a fake database and session; hashing is the real one.
function loadRoute({users=[],session=null,fail=false}={}){
 const filename=path.resolve(__dirname,'../api/auth/[action].js'),orig=Module._load,calls=[];
 Module._load=function(request,parent){
  if(parent&&parent.filename===filename&&request==='../_db')return {sql:()=>async(parts,...values)=>{const q=parts.join('?');calls.push({q,values});if(fail)throw new Error('boom');
   if(/^SELECT/.test(q))return users.filter(u=>u.id===values[0]);
   if(/^UPDATE users SET password_hash/.test(q)){const u=users.find(x=>x.id===values[1]);if(u)u.password_hash=values[0];return []}
   return []}};
  if(parent&&parent.filename===filename&&request==='../_auth')return {...realAuth,getSessionUser:()=>session};
  return orig.apply(this,arguments);
 };
 try{delete require.cache[filename];const h=require(filename);h.calls=calls;return h}finally{Module._load=orig}
}
const res=()=>({code:200,headers:{},data:null,status(n){this.code=n;return this},setHeader(k,v){this.headers[k]=v},json(v){this.data=v;return this}});
const req=(body,extra)=>({method:'POST',query:{action:'password'},headers:{'x-radix-settings':'1'},body,...extra});
const user=()=>({id:7,email:'a@b.test',password_hash:realAuth.hashPassword('vecchia-123')});

test('password: success stores a new scrypt hash that verifies, never the plain text',async()=>{
 const u=user(),old=u.password_hash,h=loadRoute({users:[u],session:{uid:7,email:'a@b.test'}}),r=res();
 await h(req({current:'vecchia-123',password:'nuova-segreta',confirm:'nuova-segreta'}),r);
 assert.equal(r.code,200);assert.deepEqual(r.data,{ok:true});assert.equal(r.headers['Cache-Control'],'no-store');
 assert.notEqual(u.password_hash,old);assert.ok(realAuth.verifyPassword('nuova-segreta',u.password_hash));assert.ok(!realAuth.verifyPassword('vecchia-123',u.password_hash));
 const upd=h.calls.find(c=>/^UPDATE/.test(c.q));assert.ok(upd);assert.ok(!upd.values.includes('nuova-segreta'),'only the hash reaches the database');assert.equal(upd.values[1],7);
 assert.ok(!JSON.stringify(r.data).includes('hash'));
});
test('password: wrong current password → 400, hash unchanged',async()=>{
 const u=user(),old=u.password_hash,h=loadRoute({users:[u],session:{uid:7}}),r=res();
 await h(req({current:'sbagliata',password:'nuova-segreta',confirm:'nuova-segreta'}),r);
 assert.equal(r.code,400);assert.match(r.data.error,/attuale non è corretta/);assert.equal(u.password_hash,old);
 assert.ok(!h.calls.some(c=>/^UPDATE/.test(c.q)));
});
test('password: short, mismatched or unchanged new password → 400 before any database call',async()=>{
 for(const body of [{current:'vecchia-123',password:'corta',confirm:'corta'},{current:'vecchia-123',password:'nuova-segreta',confirm:'altra-segreta'},{current:'vecchia-123',password:'vecchia-123'},{password:'nuova-segreta'},{current:'vecchia-123',password:'x'.repeat(201)}]){
  const h=loadRoute({users:[user()],session:{uid:7}}),r=res();await h(req(body),r);
  assert.equal(r.code,400,JSON.stringify(body));assert.equal(h.calls.length,0);
 }
 const r=res();await loadRoute({users:[user()],session:{uid:7}})(req({current:'vecchia-123',password:'1234567'}),r);assert.match(r.data.error,/almeno 8 caratteri/);
});
test('password: no session → 401; GET → 405; missing guard header → 400; unknown user → 401; db error → 500 without details',async()=>{
 let r=res();await loadRoute({users:[user()]})(req({current:'vecchia-123',password:'nuova-segreta'}),r);assert.equal(r.code,401);
 r=res();await loadRoute({session:{uid:7}})({method:'GET',query:{action:'password'},headers:{}},r);assert.equal(r.code,405);
 r=res();await loadRoute({users:[user()],session:{uid:7}})(req({current:'vecchia-123',password:'nuova-segreta'},{headers:{}}),r);assert.equal(r.code,400);
 r=res();await loadRoute({users:[],session:{uid:99}})(req({current:'vecchia-123',password:'nuova-segreta'}),r);assert.equal(r.code,401);
 r=res();await loadRoute({users:[user()],session:{uid:7},fail:true})(req({current:'vecchia-123',password:'nuova-segreta'}),r);assert.equal(r.code,500);assert.ok(!/boom/.test(r.data.error));
 r=res();await loadRoute({users:[user()],session:{uid:7}})(req(JSON.stringify({current:'vecchia-123',password:'nuova-segreta'})),r);assert.equal(r.code,200,'a JSON string body is parsed');
});
test('password rule: page and server give the same answer',()=>{
 const server=loadRoute().passwordProblem;
 for(const b of [{},{current:'a'},{current:'a',password:'1234567'},{current:'a',password:'12345678'},{current:'a',password:'12345678',confirm:'1234567x'},{current:'12345678',password:'12345678'},{current:'a',password:'y'.repeat(200)},{current:'a',password:'y'.repeat(201)}])
  assert.equal(core.passwordProblem(b),server(b),JSON.stringify(b));
 assert.equal(core.passwordProblem({current:'a',password:'abcdefgh',confirm:'abcdefgh'}),'');
});

test('sections: seven, deep-linkable by #hash, aliases and fallback to Profilo',()=>{
 assert.deepEqual(core.IDS,['profilo','membri','caselle','calendari','collegamenti','crm','crediti']);assert.equal(core.sectionFromHash('#calendars'),'calendari');
 assert.equal(core.sectionFromHash('#caselle'),'caselle');assert.equal(core.sectionFromHash('#crm?x=1'),'crm');assert.equal(core.sectionFromHash('#MEMBRI'),'membri');
 assert.equal(core.sectionFromHash('#members'),'membri');assert.equal(core.sectionFromHash('#mailboxes'),'caselle');assert.equal(core.sectionFromHash('#sla'),'crm');
 assert.equal(core.sectionFromHash(''),'profilo');assert.equal(core.sectionFromHash('#<script>'),'profilo');assert.equal(core.sectionFromHash(undefined),'profilo');
 assert.ok(core.SECTIONS.filter(s=>s.crm).map(s=>s.id).join()==='membri,caselle,calendari,crm');
});
test('collegamenti: every service of /api/integrations/status, booleans only, unknown state when unreadable',()=>{
 const server=require('../api/_integrations-status.js').SERVICES.map(s=>s.id).sort();
 assert.deepEqual(core.SERVICES.map(s=>s.id).sort(),server,'same services as the server');
 for(const s of core.SERVICES)assert.ok(s.does.length>10&&s.does.length<90,s.id);
 const rows=core.connections({anthropic:true,buffer:false,'nuovo-servizio':true,heygen:'sì'});
 const by=Object.fromEntries(rows.map(r=>[r.id,r]));
 assert.equal(by.anthropic.text,'Chiave configurata');assert.equal(by.buffer.text,'Non collegato');assert.equal(by.heygen.state,null,'non-boolean is not trusted');
 assert.equal(rows[rows.length-1].id,'nuovo-servizio');
 assert.ok(core.connections(null).every(r=>r.state===null&&r.text==='Stato non disponibile'));
 for(const label of ['Anthropic','OpenAI','Buffer','HeyGen','Higgsfield','Gmail','Vercel siti','Captain Data'])assert.ok(core.SERVICES.some(s=>s.label===label),label);
});
test('helpers: roles, initials, languages',()=>{
 assert.equal(core.canManage('owner'),true);assert.equal(core.canManage('admin'),true);assert.equal(core.canManage('member'),false);assert.equal(core.canManage(undefined),false);
 assert.equal(core.initials('Francesco Rossi Bianchi'),'FB');assert.equal(core.initials('','anna@x.it'),'A');assert.equal(core.initials('',''),'?');
 assert.deepEqual(core.LANGUAGES.filter(l=>l.active).map(l=>l.id),['it']);assert.equal(core.LANGUAGES.find(l=>l.id==='en').note,'in arrivo');
});

test('wiring: page, sidebars, mounted CRM modules, no inline code, no secrets',()=>{
 const html=read('impostazioni.html');
 assert.ok(!/<script(?![^>]*src=)/.test(html),'no inline script');assert.ok(!/style="/.test(html),'no inline style');
 assert.match(html,/data-shell-page="impostazioni"/);assert.match(html,/Content-Security-Policy/);
 const order=['/shell/settings-area.js','/shell/radix-shell.js','/lib/radix-workspace-client.js','/shell/settings-core.js','/sales/crm-custom-fields.js','/sales/crm-mailboxes.js','/sales/crm-visibility-core.js','/sales/crm-visibility.js','/sales/crm-sla-core.js','/sales/crm-sla.js','/sales/crm-dates-core.js','/sales/crm-freebusy-core.js','/sales/crm-calendars.js','/shell/settings.js'];
 let at=-1;for(const s of order){const i=html.indexOf('src="'+s+'"');assert.ok(i>at,s);at=i}
 for(const css of ['/sales/crm-light.css','/sales/crm-mailboxes.css','/sales/crm-calendars.css','/shell/settings.css'])assert.ok(html.includes('href="'+css+'"'),css);
 assert.match(read('shell/radix-shell.js'),/\{ id: 'impostazioni', text: 'Impostazioni', href: '\/impostazioni\.html'/);
 assert.match(read('sales/sales-nav.js'),/href: '\/impostazioni\.html\?area=sales', text: 'Impostazioni'/);assert.ok(fs.existsSync(path.join(__dirname,'../sales/icons/sliders.svg')));
 assert.match(read('sales/crm-visibility.js'),/Object\.assign\(V,\{load,note,section,panel\}\)/);
 assert.match(read('sales/crm-sla.js'),/Object\.assign\(S,\{load,current,mount,section,settingsPanel\}\)/);
 const js=read('shell/settings.js');
 assert.match(js,/'\/api\/auth\/password'/);assert.match(js,/'x-radix-settings':'1'/);assert.match(js,/RadixWorkspace;[\s\S]*integrations\(\)/);
 assert.match(js,/\/lead-intelligence\.html#radix-extension-link/);assert.match(js,/Le chiavi si impostano dall’amministratore/);
 assert.match(js,/if\(!root\.RadixSalesApp\)root\.RadixSalesApp=/,'never replaces the CRM app on radix-sales.html');
 assert.ok(!/console\./.test(js)&&!/process\.env|API_KEY|sk-/.test(js+read('shell/settings-core.js')),'no logs, no keys');
 assert.ok(!/\.innerHTML\s*=/.test(js),'text only, no HTML injection');
 assert.match(read('sales/crm-tools.js'),/Gestisci le caselle in Impostazioni/);
});

test('area: from a Sales page Impostazioni keeps the Sales menu (query, referrer, tab memory); elsewhere the global shell',()=>{
 const A=require('../shell/settings-area.js'),o='https://radix.test';
 assert.equal(A.areaOf({search:'?area=sales'}),'sales');
 assert.equal(A.areaOf({search:'?area=sales',referrer:o+'/control-center-v2.html',origin:o}),'sales','the query wins');
 assert.equal(A.areaOf({search:'?area=system',referrer:o+'/sales-posta.html',origin:o,stored:'sales'}),'system');
 for(const p of ['/sales-posta.html','/radix-sales.html','/lead-intelligence.html','/sales-orbit-higgsfield.html'])assert.equal(A.areaOf({referrer:o+p+'#x',origin:o}),'sales',p);
 assert.equal(A.areaOf({referrer:'https://altro.test/sales-posta.html',origin:o}),'system','another origin does not count');
 assert.equal(A.areaOf({referrer:o+'/control-center-v2.html',origin:o,stored:'sales'}),'sales','the tab remembers between sections');
 assert.equal(A.areaOf({referrer:o+'/agency/projects.html',origin:o}),'system');assert.equal(A.areaOf({}),'system');
 const js=read('shell/settings-area.js');
 assert.match(js,/setAttribute\('data-rx-shell-off',''\)/);assert.match(js,/nav\.src='\/sales\/sales-nav\.js';side\.after\(nav\)/,'sales-nav.js reads the aside before it');
 assert.match(js,/regia\.src='\/sales\/regia-loader\.js'/);assert.match(js,/sessionStorage\.setItem\('rx-settings-area',area\)/);
 assert.match(read('shell/radix-shell.js'),/window\.__radixShell \|\| document\.documentElement\.hasAttribute\('data-rx-shell-off'\)\) return;/);
 assert.match(read('shell/settings.css'),/body\.st-sales\{display:grid;grid-template-columns:220px minmax\(0,1fr\)/);
 assert.match(read('sales/crm-tools.js'),/'\/impostazioni\.html\?area=sales#caselle'/);
 assert.ok(!/console\./.test(js)&&!/innerHTML/.test(js));
});

test('calendari: the CRM calendar boxes live in Impostazioni; crm-calendars reads the workspace from the host there',()=>{
 const js=read('shell/settings.js'),cal=read('sales/crm-calendars.js');
 assert.match(js,/async calendari\(out\)\{\s*await workspaces\(\);if\(needWorkspace\(out\)\)return;/);
 assert.match(cal,/const wsOf=\(\)=>window\.RadixCrmData\?\.workspace\(\)\|\|window\.RadixSalesApp\?\.state\?\.workspace\|\|null;/);
 assert.equal(cal.split('window.RadixCrmData?.workspace()').length-1,1,'every lookup goes through wsOf()');
 assert.match(read('shell/settings.css'),/\.st-cal \.cal-card\{background:transparent/);
});
