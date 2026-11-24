'use strict';
const test=require('node:test');const assert=require('node:assert');const fs=require('node:fs');const path=require('node:path');
// A record opened in Customer360 is shown in every CRM view: moving to another view must close it.
test('sales-views closes Customer360 on hashchange before switching view',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','sales','sales-views.js'),'utf8');
  assert.match(src,/addEventListener\('hashchange',\(\)=>\{window\.RadixSalesApp\?\.closeCustomer\?\.\(\);decorate\(\)/);
  const app=fs.readFileSync(path.join(__dirname,'..','sales','sales.js'),'utf8');
  assert.match(app,/closeCustomer:\(\)=>\{if\(customer&&!state\.busy\)\{customer=null;render\(\);\}\}/);
});
