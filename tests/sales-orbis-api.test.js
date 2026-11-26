'use strict';
// «Sales Orbis» on the server (api/_product.js): on a product host, or on the product's own deployment
// (RADIX_PRODUCT=sales-orbis), the RADIX endpoints answer 404 and never run; on RADIX hosts nothing changes.
// Stubs only: no database, no AI call.
const test=require('node:test'),assert=require('node:assert/strict');
const product=require('../api/_product.js');
function res(){const r={statusCode:200,headers:{},body:undefined,status(c){this.statusCode=c;return this},json(b){this.body=b;return this},setHeader(k,v){this.headers[k.toLowerCase()]=v},end(b){this.body=b;return this}};return r}
const req=(host,extra={})=>({method:'GET',headers:{host},query:{},...extra});

test('isProductRequest: host or deployment',()=>{
  assert.equal(product.isProductRequest(req('sales-orbis.example.com'),{}),true);
  assert.equal(product.isProductRequest(req('crm.example.com:443'),{}),true);
  assert.equal(product.isProductRequest(req('radix-platform.vercel.app'),{}),false);
  assert.equal(product.isProductRequest(req('radix-platform.vercel.app'),{RADIX_PRODUCT:'sales-orbis'}),true);
  assert.equal(product.isProductRequest({headers:{}},{}),false);
});
test('radixOnly: 404 on the product, the handler untouched elsewhere',async()=>{
  let ran=0;const h=product.radixOnly(async(q,r)=>{ran++;r.status(200).json({ok:true})},{});
  const a=res();await h(req('sales-orbis.example.com'),a);assert.equal(a.statusCode,404);assert.equal(ran,0);
  const b=res();await h(req('radix-platform.vercel.app'),b);assert.equal(b.statusCode,200);assert.equal(ran,1);
});
test('the RADIX endpoints are wrapped: state, workspace, agency memory, accounting',async()=>{
  for(const f of ['state','workspace','agency-memory','accounting']){
    const h=require('../api/'+f+'.js'),r=res();
    await h(req('sales-orbis.example.com',{method:'POST',body:{}}),r);
    assert.equal(r.statusCode,404,f);
  }
  // accounting keeps its raw-body config and the Stripe webhook export.
  const acc=require('../api/accounting.js');assert.deepEqual(acc.config,{api:{bodyParser:false}});assert.equal(typeof acc.stripeWebhook,'function');
});
test('integrations: on the product only status and send-email (and the queue cron) answer',async()=>{
  const h=require('../api/integrations/[service].js');
  for(const s of ['heygen','higgsfield','trading','call','transcribe','site-publish','openai-image','buffer']){
    const r=res();await h(req('crm.example.com',{query:{service:s}}),r);assert.equal(r.statusCode,404,s);
  }
});
test('chat: on the product only the CRM agents, and no RADIX profiles in the status',async()=>{
  const h=require('../api/chat.js');
  const old=process.env.JWT_SECRET;process.env.JWT_SECRET='test-secret-not-real';
  try{
    const {signSessionToken}=require('../api/_auth.js');
    const cookie='radix_session='+encodeURIComponent(signSessionToken({uid:1,email:'a@example.com',name:'A'}));
    const g=res();await h(req('sales-orbis.example.com',{headers:{host:'sales-orbis.example.com',cookie}}),g);
    assert.equal(g.statusCode,200);assert.ok(!('presets' in g.body));
    const g2=res();await h(req('radix-platform.vercel.app',{headers:{host:'radix-platform.vercel.app',cookie}}),g2);
    assert.ok(Array.isArray(g2.body.presets));
    const oldKey=process.env.ANTHROPIC_API_KEY;process.env.ANTHROPIC_API_KEY='sk-test-not-real';
    try{
      for(const role of ['strategist','radix-director',undefined]){
        const r=res();await h(req('sales-orbis.example.com',{method:'POST',headers:{host:'sales-orbis.example.com',cookie},body:{role,messages:[{role:'user',content:'x'}]}}),r);
        assert.equal(r.statusCode,404,String(role));
      }
    }finally{if(oldKey===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=oldKey}
  }finally{if(old===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=old}
});
