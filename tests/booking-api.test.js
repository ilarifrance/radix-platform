'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
process.env.JWT_SECRET=process.env.JWT_SECRET||'test-secret-for-ciuffo';
const B=require('../api/_booking');
const SHOP='11111111-1111-4111-8111-111111111111',A='22222222-2222-4222-8222-222222222222',SV='33333333-3333-4333-8333-333333333333';
const NOW=Date.parse('2026-11-23T08:00:00Z'); // Monday 09:00 in Rome
const shopRow=(extra={})=>({id:SHOP,slug:'salone-bea-padova',name:'Salone Bea',phone:'+39049123456',address:'Via Roma 1',city:'Padova',kind:'parrucchiere',timezone:'Europe/Rome',
 hours:{"2":[["09:00","13:00"],["14:30","19:00"]]},step_min:30,min_notice_min:60,max_days_ahead:30,cancel_notice_min:240,booking_open:true,welcome:null,
 staff:[{id:A,name:'Bea',active:true,hours:null}],services:[{id:SV,name:'Taglio',duration_min:30,buffer_min:0,price_cents:2000,staff_ids:[],active:true}],closures:[],busy:[],...extra});
function fakeStore(reads={}){
 const txs=[];return {txs,json:async(t,p)=>{for(const [k,v] of Object.entries(reads))if(t.includes(k))return typeof v==='function'?v(t,p):v;return null;},tx:async q=>{txs.push(q);return q.map(()=>[]);}};
}
function call(handler,{method='POST',body,query,headers,cookie}){
 return new Promise(resolve=>{const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(c){this.statusCode=c;return this;},json(o){resolve({status:this.statusCode,body:o,headers:this.headers});return this;}};
  handler({method,body,query:query||{},headers:{'content-type':'application/json','x-ciuffo':'1',host:'radix.test',...(cookie?{cookie}:{}),...headers}},res);});
}
const H=(store,owner,extra={})=>B.createHandler({getOwner:()=>owner||null,getStore:()=>store,now:()=>NOW,sendMail:null,...extra});
const reads=(extra)=>({"jsonb_build_object('timezone'":{timezone:'Europe/Rome'},'FROM bk_shops s WHERE s.slug':shopRow(extra)});

test('phone numbers become +39 numbers and slugs are url-safe',()=>{
 assert.equal(B.phone('347 123 4567'),'+393471234567');assert.equal(B.phone('0039 347 1234567'),'+393471234567');assert.equal(B.phone('+44 20 7946 0958'),'+442079460958');
 assert.throws(()=>B.phone('abc'),/non valido/);assert.equal(B.slugify('Salone Bèa & Co. — Padova'),'salone-bea-co-padova');
});

test('public shop and slots show only active services and the free times of the day',async()=>{
 const st=fakeStore(reads());
 const s=await call(H(st),{method:'GET',query:{resource:'shop',slug:'salone-bea-padova'}});
 assert.equal(s.status,200);assert.equal(s.body.services.length,1);assert.equal(s.body.staff[0].name,'Bea');assert.equal(s.body.busy,undefined,'no appointments leak');
 const r=await call(H(st),{method:'GET',query:{resource:'slots',slug:'salone-bea-padova',service:SV,date:'2026-11-24',days:'2'}});
 assert.equal(r.status,200);assert.equal(r.body.days[0].slots[0].time,'09:00');assert.equal(r.body.days[1].slots.length,0,'Wednesday closed in this shop');
 assert.equal((await call(H(st),{method:'GET',query:{resource:'slots',slug:'salone-bea-padova',service:'x',date:'2026-11-24'}})).status,400);
 assert.equal((await call(H(fakeStore()),{method:'GET',query:{resource:'shop',slug:'nessuno'}})).status,404);
});

test('a booking re-checks the slot, saves customer and appointment in one transaction and returns a private link',async()=>{
 const st=fakeStore(reads());
 const body={action:'book',data:{slug:'salone-bea-padova',service:SV,starts_at:'2026-11-24T09:00:00.000Z',name:'Giulia Rossi',phone:'347 1234567',consent:true}};
 const r=await call(H(st),{body});
 assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.staff,'Bea');assert.match(r.body.token,/^[A-Za-z0-9_-]{32}$/);
 const q=st.txs[0];assert.match(q[0][0],/INSERT INTO bk_customers/);assert.equal(q[0][1][3],'+393471234567');
 assert.match(q[1][0],/INSERT INTO bk_appointments/);assert.equal(q[1][1][2],A);assert.equal(q[1][1][6],'2026-11-24T09:30:00.000Z');
 assert.notEqual(q[1][1][9],r.body.token,'only the hash of the link is stored');
 // A time already taken, without consent, or without the header is refused before any write.
 const busy=fakeStore(reads({busy:[{staff_id:A,starts_at:'2026-11-24T09:00:00Z',blocks_until:'2026-11-24T09:30:00Z'}]}));
 assert.equal((await call(H(busy),{body})).status,409);assert.equal(busy.txs.length,0);
 assert.match((await call(H(st),{body:{...body,data:{...body.data,consent:false}}})).body.error,/consenso/);
 assert.equal((await call(H(st),{body,headers:{'x-ciuffo':undefined}})).status,403);
});

test('database conflicts become clear Italian messages',async()=>{
 const err=code=>({json:fakeStore(reads()).json,tx:async()=>{throw Object.assign(new Error('x'),{code});}});
 const body={action:'book',data:{slug:'salone-bea-padova',service:SV,starts_at:'2026-11-24T10:00:00.000Z',name:'Anna',phone:'3331112222',consent:true}};
 assert.match((await call(H(err('23P01')),{body})).body.error,/appena stato preso/);
 assert.equal((await call(H(err('42P01')),{body})).status,503);
 assert.equal((await call(H(err('XX000')),{body})).status,500);
});

test('owner calls need the Ciuffo session; writes check the role first; off-hours bookings ask to confirm',async()=>{
 const st=fakeStore({'bk_role($1::uuid,$2::integer)) AS v':'owner','FROM bk_shops s WHERE s.id':shopRow()});
 assert.equal((await call(H(st,null),{method:'GET',query:{resource:'me'}})).status,401);
 assert.equal((await call(H(st,null),{body:{action:'shop.save',shop:SHOP,data:{name:'X'}}})).status,401);
 const ok=await call(H(st,{uid:7}),{body:{action:'shop.save',shop:SHOP,data:{name:'Salone Bea',hours:{"2":[["09:00","18:00"]]}}}});
 assert.equal(ok.status,200);assert.match(st.txs[0][0][0],/bk_role/);assert.match(st.txs[0][1][0],/hours=\$3::jsonb/);
 assert.match((await call(H(st,{uid:7}),{body:{action:'shop.save',shop:SHOP,data:{hours:{"2":[["19:00","09:00"]]}}}})).body.error,/dopo/);
 assert.match((await call(H(st,{uid:7}),{body:{action:'shop.save',shop:SHOP,data:{evil:1}}})).body.error,/non consentito/);
 const off=await call(H(st,{uid:7}),{body:{action:'appointment.create',shop:SHOP,data:{service_id:SV,staff_id:A,starts_at:'2026-11-24T19:00:00.000Z',customer:{name:'Mario'}}}});
 assert.equal(off.body.needs_confirm,true);
 const n=st.txs.length;const forced=await call(H(st,{uid:7}),{body:{action:'appointment.create',shop:SHOP,data:{service_id:SV,staff_id:A,starts_at:'2026-11-24T19:00:00.000Z',customer:{name:'Mario',phone:'3331234567'},force:true}}});
 assert.equal(forced.status,200);assert.equal(st.txs.length,n+1);assert.match(st.txs[n].at(-2)[0],/'owner'/);
 assert.equal((await call(H(st,{uid:7}),{body:{action:'nope',shop:SHOP,data:{}}})).body.error,'Azione non riconosciuta.');
});

test('sign-up creates the owner, the shop with default hours, one staff member and starter services',async()=>{
 const st=fakeStore({"nextval(pg_get_serial_sequence":42,"FROM bk_shops WHERE slug=$1 OR":['salone-bea-padova']});
 const r=await call(H(st),{body:{action:'auth.signup',data:{name:'Beatrice Verdi',email:'Bea@Example.it',password:'una-password-lunga',accept:true,shop:{name:'Salone Bea',city:'Padova',phone:'049 123456'}}}});
 assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.slug,'salone-bea-padova-2');assert.match(r.headers['Set-Cookie'],/^ciuffo_session=/);
 const q=st.txs[0];assert.equal(q[0][1][1],'bea@example.it');assert.match(q[1][0],/INSERT INTO bk_shops/);assert.equal(q[3][1][2],'Beatrice');
 assert.equal(JSON.parse(q[4][1][1]).length,4);
 assert.ok(B.verifyOwner(decodeURIComponent(r.headers['Set-Cookie'].split(';')[0].split('=')[1])).uid===42);
 assert.match((await call(H(st),{body:{action:'auth.signup',data:{name:'X',email:'x@y.it',password:'corta',accept:true,shop:{name:'S'}}}})).body.error,/10 caratteri/);
});

test('the migration keeps two appointments of one staff member from overlapping',()=>{
 const m=fs.readFileSync('migrations/booking/001_foundation.sql','utf8');
 for(const s of ['CREATE EXTENSION IF NOT EXISTS btree_gist','EXCLUDE USING gist (staff_id WITH =, tstzrange(starts_at,blocks_until','manage_token_hash text UNIQUE','UNIQUE(shop_id,phone)','BEGIN;','COMMIT;'])assert.ok(m.includes(s),s);
});
