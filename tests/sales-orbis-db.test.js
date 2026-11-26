'use strict';
// «Sales Orbis» database (tools/sales-orbis/db.js): the CRM-only schema on an empty Postgres, the first owner, and the real
// /api/sales handler working on it. The database is PGlite (real Postgres compiled to WebAssembly, in memory): fake data,
// nothing leaves the machine. Without the optional package the database part is skipped and says how to run it.
const test=require('node:test'),assert=require('node:assert/strict');
const DB=require('../tools/sales-orbis/db.js');
let PGlite=null;try{PGlite=require('@electric-sql/pglite').PGlite}catch{PGlite=null}
const SKIP=PGlite?false:'optional: npm i --no-save @electric-sql/pglite to run the schema on a real (in-memory) Postgres';

test('schema: accounts and the CRM migrations in order, nothing of RADIX',()=>{
  const s=DB.schema(),files=DB.migrations().map(m=>m.file);
  assert.ok(files.length>=21&&files[0].endsWith('001_foundation.sql'));
  assert.deepEqual(files,[...files].sort());
  let at=s.indexOf('CREATE TABLE IF NOT EXISTS users');assert.ok(at>0);
  for(const f of files){const i=s.indexOf('-- '+f);assert.ok(i>at,f+' in order');at=i}
  for(const radix of ['workspace_state','agency_memory','registry_','acc_'])assert.ok(!s.includes('CREATE TABLE IF NOT EXISTS '+radix)&&!s.includes('CREATE TABLE '+radix),radix);
});
test('owner: checks its input, hashes the password, never prints it',()=>{
  const sql=DB.owner({email:' A@Example.com ',name:'Ada',workspace:'Demo Srl',password:'password-di-prova',id:'11111111-1111-4111-8111-111111111111'});
  assert.match(sql,/'a@example\.com'/);assert.ok(!sql.includes('password-di-prova'));
  assert.match(sql,/INSERT INTO sales_memberships .* 'owner'/);
  for(const bad of [{email:'x'},{name:''},{workspace:''},{password:'corta'}])
    assert.throws(()=>DB.owner({email:'a@b.it',name:'A',workspace:'W',password:'password-ok',...bad}));
  assert.equal(DB.owner({email:"o'neil@b.it",name:"D'Amico",workspace:"L'Azienda",password:'password-ok'}).includes("'D''Amico'"),true);
});

// The neon() tag of api/_db.js on top of PGlite: tagged template or (text, params), rows back.
function neonLike(db){
  return async function sql(strings,...values){
    if(Array.isArray(strings)&&strings.raw){let text='';strings.forEach((s,i)=>{text+=s+(i<values.length?'$'+(i+1):'')});return (await db.query(text,values)).rows}
    return (await db.query(strings,values[0]||[])).rows;
  };
}
function call(handler,{uid,method='GET',query={},body}){
  return new Promise((resolve,reject)=>{
    const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(c){this.statusCode=c;return this},json(b){resolve({status:this.statusCode,body:b});return this},end(b){resolve({status:this.statusCode,body:b})}};
    const req={method,query,body,headers:method==='POST'?{'x-radix-sales':'1','content-type':'application/json'}:{}};
    Promise.resolve(handler(req,res)).catch(reject);
  });
}
test('an empty Sales Orbis database: schema, first owner, an empty CRM that works',{skip:SKIP},async()=>{
  const db=new PGlite();
  await db.exec(DB.schema());
  const ws='22222222-2222-4222-8222-222222222222';
  await db.exec(DB.owner({email:'owner@example.com',name:'Owner Prova',workspace:'Azienda di prova',password:'password-di-prova',id:ws}));
  const uid=(await db.query("SELECT id FROM users WHERE email='owner@example.com'")).rows[0].id;
  const {createHandler}=require('../api/_sales.js'),{createStore}=require('../api/_sales_store.js');
  const h=createHandler({getSessionUser:()=>({uid}),getStore:()=>createStore(neonLike(db))});
  const w=await call(h,{query:{entity:'workspaces'}});
  assert.equal(w.status,200);assert.deepEqual(w.body.rows.map(r=>[r.id,r.role]),[[ws,'owner']]);
  for(const entity of ['companies','contacts','opportunities','tasks','processes']){
    const r=await call(h,{query:{entity,workspace:ws}});assert.equal(r.status,200,entity+': '+JSON.stringify(r.body));assert.deepEqual(r.body.rows,[],entity+' starts empty');
  }
  const cur=await call(h,{query:{entity:'workspace_settings',workspace:ws}});assert.equal(cur.body.settings.currency,'EUR');
  const set=await call(h,{method:'POST',body:{workspace:ws,entity:'workspace_settings',action:'update',data:{currency:'CHF'}}});
  assert.equal(set.status,200,JSON.stringify(set.body));assert.equal(set.body.settings.currency,'CHF');
  const c=await call(h,{method:'POST',body:{workspace:ws,entity:'companies',action:'create',data:{name:'Prima azienda Srl'}}});
  assert.equal(c.status,200,JSON.stringify(c.body));
  const list=await call(h,{query:{entity:'companies',workspace:ws}});assert.deepEqual(list.body.rows.map(r=>r.name),['Prima azienda Srl']);
  // A stranger (no membership) sees nothing.
  const other=createHandler({getSessionUser:()=>({uid:uid+1}),getStore:()=>createStore(neonLike(db))});
  assert.equal((await call(other,{query:{entity:'companies',workspace:ws}})).status,403);
  await db.close();
});
