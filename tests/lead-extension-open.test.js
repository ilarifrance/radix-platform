'use strict';
// «Apri in RADIX» from the Chrome extension: Lead Intelligence opens the created contact job by its link.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const B=require('../lib/lead-contact-batches');
const WS='11111111-1111-4111-8111-111111111111',JOB='22222222-2222-4222-8222-222222222222';
const SCRIPT=fs.readFileSync(path.join(__dirname,'..','sales','lead-contact-workbench.js'),'utf8');

test('open link round trip and invalid hashes',()=>{
 assert.equal(B.openHash(WS,JOB),'#lead-job='+JOB+'&ws='+WS);
 assert.deepEqual(B.readOpenHash(B.openHash(WS,JOB)),{job:JOB,workspace:WS});
 assert.deepEqual(B.readOpenHash('lead-job='+JOB.toUpperCase()+'&ws='+WS),{job:JOB,workspace:WS});
 assert.equal(B.openHash('x',JOB),'');
 for(const h of ['','#lead-import','#lead-job='+JOB,'#lead-job=1&ws='+WS,'#lead-job='+JOB+'&ws=../x'])assert.equal(B.readOpenHash(h),null,h);
});

// Minimal DOM: elements by id, created on demand, with the few members the workbench uses.
function page({hash,workspaces=[WS],delay=0,rows,status=200}){
 const els={},events=[],calls=[];let scrolled=false;
 const el=id=>els[id]||(els[id]={id,value:'',textContent:'',hidden:false,disabled:false,options:[],files:null,children:[],
  replaceChildren(...c){this.children=c;if(id==='archive-workspace'||id==='contact-job-select')this.options=c},append(...c){this.children.push(...c);if(id==='archive-workspace'||id==='contact-job-select')this.options=this.children},
  dispatchEvent(e){events.push(id+':'+e.type)},scrollIntoView(){if(id==='lead-pipeline')scrolled=true},addEventListener(){}});
 const opt=v=>({value:v,textContent:v});
 setTimeout(()=>el('archive-workspace').replaceChildren(opt(''),...workspaces.map(opt)),delay);
 const location={hash,pathname:'/lead-intelligence.html',search:'',origin:'https://radix.test'};
 const payload={version:1,sourceUrl:'https://www.linkedin.com/sales/search/people',records:[{fullName:'Giulia Bianchi',profileUrl:'https://www.linkedin.com/sales/lead/A1',sourceUrl:'https://www.linkedin.com/sales/search/people'},{fullName:'Marco Rossi',profileUrl:'https://www.linkedin.com/sales/lead/A2',sourceUrl:'https://www.linkedin.com/sales/search/people'}],batches:[{id:'ext-1-0',signature:'x'}],total:2,duplicates:0};
 const fetch=async(url,opts)=>{calls.push(url);const body=url.includes('&id=')?{rows:rows??[{id:JOB,title:'LinkedIn Sales Navigator · 2 contatti',version:1,payload}]}:{rows:[]};return {ok:status===200,json:async()=>status===200?body:{error:'Accesso negato'}}};
 const window={RadixContactBatch:B,RadixProviderContacts:{convert:()=>[]},dispatchEvent(){},addEventListener(){},confirm:()=>{throw Error('no confirm expected')}};
 const ctx={window,document:{getElementById:el,createElement:()=>el('x'+Math.random()),body:el('body')},location,history:{replaceState:(a,b,u)=>{location.hash='';location.replaced=u}},fetch,setTimeout,Event:class{constructor(t){this.type=t}},CustomEvent:class{constructor(t){this.type=t}},URL,Blob:class{},navigator:{}};
 vm.runInNewContext(SCRIPT,ctx);
 return {els,events,calls,location,scrolled:()=>scrolled,window};
}
const settle=async(p,check)=>{for(let i=0;i<100&&!check();i++)await new Promise(r=>setTimeout(r,30))};

test('the extension link selects the workspace, opens the job and shows the Lead pipeline',async()=>{
 const p=page({hash:'#lead-job='+JOB+'&ws='+WS,delay:300});
 await settle(p,()=>p.scrolled());
 assert.equal(p.els['archive-workspace'].value,WS);
 assert.ok(p.events.includes('archive-workspace:change'));
 assert.ok(p.calls.includes('/api/sales?entity=lead_contact_jobs&workspace='+WS+'&id='+JOB));
 assert.equal(p.window.radixLeadContacts.records().length,2);
 assert.match(p.els['lp-open-status'].textContent,/2 contatti nella Lead pipeline/);
 assert.equal(p.els['lp-open-status'].hidden,false);
 assert.equal(p.location.replaced,'/lead-intelligence.html');
});

test('a failed open says so in Italian and points to the LinkedIn step',async()=>{
 const p=page({hash:'#lead-job='+JOB+'&ws='+WS,status:403});
 await settle(p,()=>/Non riesco/.test(p.els['lp-open-status']?.textContent||''));
 assert.match(p.els['lp-open-status'].textContent,/^Non riesco ad aprire i contatti importati: Accesso negato\. Puoi aprirli dal passo 1 › LinkedIn, nell’elenco delle importazioni\.$/);
 assert.equal(p.scrolled(),false);assert.equal(p.window.radixLeadContacts.records().length,0);
});

test('without the hash nothing is opened',async()=>{
 const p=page({hash:'#lead-import'});
 await new Promise(r=>setTimeout(r,100));
 assert.deepEqual(p.calls,[]);assert.equal(p.els['lp-open-status'],undefined);
});

test('Lead pipeline empty state points to step 1',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','lead-intelligence.html'),'utf8'),js=fs.readFileSync(path.join(__dirname,'..','sales','lead-pipeline.js'),'utf8');
 for(const s of [html,js])assert.match(s,/Nessun lead ancora\. Scegli da dove prenderli al passo 1: LinkedIn, file CSV\/Excel, provider o backup\./);
 assert.ok(html.includes('id="lp-open-status"'));
});
