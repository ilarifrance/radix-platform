'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {lookup}=require('../api/_lead_public_lookup');
const fake=async url=>({ok:true,headers:{get(){return null}},async text(){
 if(url.includes('wbsearchentities'))return JSON.stringify({search:[{id:'Q1234',label:'ACME SRL'}]});
 return JSON.stringify({entities:{Q1234:{claims:{P856:[{mainsnak:{datavalue:{value:'https://www.acme.it'}}}]}}}});
}});
test('public source returns suggestion only, with entity provenance and no forced write',async()=>{
 const result=await lookup({name:'ACME SRL',domain:''},fake);
 assert.equal(result.suggestions.length,1);assert.equal(result.suggestions[0].field,'domain');
 assert.equal(result.suggestions[0].value,'acme.it');assert.equal(result.suggestions[0].source,'https://www.wikidata.org/wiki/Q1234');
 assert.equal(result.suggestions[0].verified,false);
});
test('no exact name, wrong endpoint or existing domain produce no suggestion',async()=>{
 const missing=await lookup({name:'Different Business'},fake);assert.equal(missing.suggestions.length,0);
 const already=await lookup({name:'ACME SRL',domain:'acme.it'},fake);assert.equal(already.suggestions.length,0);
 await assert.rejects(()=>lookup({name:'AB'},fake),/Nome azienda/);
});
