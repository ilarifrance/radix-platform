'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=id=>fs.readFileSync('sales/'+id+'.js','utf8');
function fixture(){
 const elements=new Map(),listeners=new Map();
 const node=(tag='div')=>({tagName:tag.toUpperCase(),value:'',checked:false,disabled:false,hidden:false,textContent:'',children:[],listeners:{},
   replaceChildren(...items){this.children=[...items]},append(...items){this.children.push(...items)},
   addEventListener(type,fn){(this.listeners[type]??=[]).push(fn)}});
 const get=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id)};
 const win={addEventListener:(type,fn)=>{const a=listeners.get(type)||[];a.push(fn);listeners.set(type,a)},
  dispatchEvent:e=>{for(const fn of listeners.get(e.type)||[])fn(e)},confirm:()=>true};
 const sandbox={window:win,document:{getElementById:get,createElement:node,body:{append(){}}},CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts?.detail||{}}},Date,navigator:{clipboard:{writeText:async()=>{}}}};
 vm.runInNewContext(code('lead-outreach-core'),sandbox);
 vm.runInNewContext(code('lead-premium'),sandbox);
 vm.runInNewContext(code('lead-outreach'),sandbox);
 return{win,get};
}
const prospect={name:'Alfa SRL',domain:'alfa.it',country:'Italia',industry:'Industria',companySize:'PMI',contactRole:'CEO',source:'https://alfa.it/team'};
const review={index:0,contact:'Mario',email:'mario@alfa.it',source:'https://alfa.it/team',basis:'consent',notes:'',checked:true,privacy:true,
 draft:{subject:'Oggetto',body:'Ciao'},
 plan:[{date:'2026-11-01',step:'Primo messaggio',subject:'Oggetto',body:'Ciao'},{date:'2026-11-05',step:'Follow-up 1',subject:'Re: Oggetto',body:'Ciao'},{date:'2026-11-11',step:'Follow-up 2',subject:'Re: Oggetto',body:'Ciao'}]};
const payload={icp:{country:'Italia',industry:'Industria',size:'PMI',role:'CEO'},prospects:[prospect],reviews:[review]};
test('complete approved email/follow-up workflow survives archive restore',()=>{
 const {win}=fixture();win.radixLeadData.restore(payload);
 assert.equal(win.radixLeadWorkflow.restoreReviews(payload.reviews),1);
 const saved=win.radixLeadWorkflow.archiveReviews();
 assert.equal(saved.length,1);assert.equal(saved[0].draft.subject,'Oggetto');
 assert.equal(saved[0].plan.length,3);
 assert.equal(win.radixLeadData.export().prospects[0].domain,'alfa.it');
});
test('changed source invalidates archived approvals',()=>{
 const {win}=fixture(),changed=JSON.parse(JSON.stringify(payload));
 changed.prospects[0].source='Esempio RADIX';changed.prospects[0].domain='alfa.example';
 win.radixLeadData.restore(changed);
 assert.equal(win.radixLeadWorkflow.restoreReviews(changed.reviews),0);
 assert.equal(win.radixLeadWorkflow.archiveReviews().length,0);
});
test('archive list overwrite/delete blocked for a selected but not loaded list',()=>{
 const script=fs.readFileSync('sales/lead-archive.js','utf8');
 assert.match(script,/archive-list'\)\.value!==state\.listId/);
 assert.match(script,/archive-delete'\)\.disabled=.*archive-list/);
 assert.match(script,/Carica prima la lista selezionata/);
});
