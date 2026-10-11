'use strict';
// Minimal DOM contract harness inspired by sales-client.test.js; NOT browser/E2E.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function client(){
 const ids={};class Element{
 constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.style={};this._value='';this.textContent='';this.classList={toggle(){}};}
 set id(value){this._id=value;ids[value]=this;}get id(){return this._id;}
 set value(v){this._value=String(v);}get value(){return this.tag==='select'&&!this.children.some(n=>n.value===this._value)?'':this._value;}
 get selectedIndex(){return this.children.findIndex(n=>n.value===this._value);}set selectedIndex(i){this._value=this.children[i]?.value||'';}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}
 setAttribute(k,v){this[k]=v;}addEventListener(k,fn){this.listeners[k]=fn;}focus(){}
 }
 const html=fs.readFileSync('radix-crm-concept.html','utf8');
 for(const m of html.matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"/g)){const el=new Element(m[1]);el.id=m[2];}
 const option=new Element('option');option.value='companies';ids['record-type'].append(option);ids['record-type'].value='companies';
 const document={getElementById:id=>ids[id],createElement:tag=>new Element(tag),body:new Element('body')};
 const window={RadixCRM:require('../lib/crm-demo'),confirm:()=>true,matchMedia:()=>({matches:true,addEventListener(){}})};
 const ctx=vm.createContext({document,window,Intl});vm.runInContext([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1]+'\n globalThis.app={state,render,renderRecords,renderRecordFields,renderCustomer};',ctx);
 return {ids,app:ctx.app,choose(type,id=''){if(!ids['record-type'].children.some(n=>n.value===type)){const o=new Element('option');o.value=type;ids['record-type'].append(o);}ids['record-type'].value=type;ids['record-type'].onchange();ids['record-id'].value=id;ids['record-id'].onchange();},submit(){ids['record-form'].onsubmit({preventDefault(){}});}};
}
const text=n=>[n.textContent,...n.children.map(text)].join(' ');
test('CRM DOM mock boots and creates edits deletes without touching API',()=>{
 const c=client();assert.equal(c.app.state.companies.length,2);c.ids['record-name'].value='<img onerror=bad> Demo';c.submit();assert.equal(c.app.state.companies.length,3);const id=c.ids['record-id'].value;assert.ok(id);assert.equal(c.ids['record-name'].value,'<img onerror=bad> Demo');assert.match(text(c.ids.companies),/<img onerror=bad> Demo/);
 c.ids['record-name'].value='Revised demo';c.submit();assert.equal(c.app.state.companies.find(x=>x.id===id).name,'Revised demo');c.ids['record-delete'].onclick();assert.equal(c.app.state.companies.length,2);assert.match(c.ids['record-message'].textContent,/eliminato/);
});
test('CRM DOM mock keeps errors and cannot delete linked customer',()=>{
 const c=client();c.choose('companies','c1');c.ids['record-delete'].onclick();assert.match(c.ids['record-message'].textContent,/collegata/);assert.equal(c.app.state.companies.length,2);
 c.choose('activities');c.ids['record-title'].value='Follow up';c.ids['record-companyId'].value='c2';c.ids['record-opportunityId'].value='o1';c.submit();assert.match(c.ids['record-message'].textContent,/incoerenti/);assert.equal(c.app.state.activities.length,1);
 c.ids['record-companyId'].value='c1';c.ids['record-owner'].value='Owner sintetico';c.ids['record-priority'].value='high';c.submit();assert.equal(c.app.state.activities.length,2);assert.match(text(c.ids['customer-detail']),/Owner sintetico/);assert.doesNotMatch(text(c.ids['activity-list']),/undefined/);
});
test('CRM DOM mock Customer360 opens exact scoped record and preserves zero',()=>{
 const c=client();c.ids['customer-company'].value='c2';c.ids['customer-company'].onchange();const content=text(c.ids['customer-detail']);assert.match(content,/Luca Mori/);assert.doesNotMatch(content,/Elena Riva/);
 c.choose('opportunities','o2');c.ids['record-amount'].value='0';c.ids['record-probability'].value='0';c.submit();assert.equal(c.app.state.opportunities[1].amount,0);assert.equal(c.ids['record-amount'].value,'0');
 c.ids['record-amount'].value='';c.submit();assert.match(c.ids['record-message'].textContent,/Valore EUR/);
});
