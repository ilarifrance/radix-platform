'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const T=require('../api/_trading.js');
const SECRET='test-secret';

function fakeDb(){
 const rows=new Map();
 const db=(strings,...vals)=>{
  const q=strings.join('?');
  if(q.startsWith('SELECT')){const r=rows.get(vals[0]);return Promise.resolve(r?[r]:[])}
  if(q.startsWith('UPDATE')){const r=rows.get(vals[1]);if(r){r.snapshot=JSON.parse(vals[0]);r.received_at=new Date('2026-10-29T10:00:00Z')}return Promise.resolve([])}
  if(q.startsWith('INSERT')){const r=rows.get(vals[0])||{snapshot:null,received_at:null};r.token_issued_at=new Date(vals[1]);rows.set(vals[0],r);return Promise.resolve([])}
  throw new Error('query inattesa '+q);
 };
 return {db,rows};
}
function res(){return {code:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v},status(c){this.code=c;return this},json(b){this.body=b;return this}}}
const SNAP={versione:1,modalita:'paper',generato:'2026-10-29T10:00:00Z',backtest:{risultati:{}}};

test('token round trip, push and read back only for the same member',async()=>{
 const {db,rows}=fakeDb();let now=Date.parse('2026-10-29T10:00:00Z');
 const users={a:{uid:7},b:{uid:8}};
 const h=T.createHandler({getSql:()=>db,getSessionUser:req=>users[req.who]||null,env:{JWT_SECRET:SECRET},now:()=>now});
 let r=res();await h({method:'GET',headers:{},who:'a'},r);
 assert.equal(r.code,200);assert.equal(r.body.snapshot,null);assert.equal(r.body.linked,false);

 r=res();await h({method:'POST',headers:{},who:'a',body:{action:'token'}},r);
 assert.equal(r.code,403,'serve l\'intestazione x-radix-trading');

 r=res();await h({method:'POST',headers:{'x-radix-trading':'1'},who:'a',body:{action:'token'}},r);
 assert.equal(r.code,200);const tok=r.body.token;assert.match(tok,/^rtr1\./);

 r=res();await h({method:'POST',headers:{authorization:'Bearer '+tok},body:SNAP},r);
 assert.equal(r.code,200);assert.equal(rows.get(7).snapshot.versione,1);

 r=res();await h({method:'GET',headers:{},who:'a'},r);
 assert.equal(r.body.snapshot.generato,SNAP.generato);assert.equal(r.body.linked,true);
 r=res();await h({method:'GET',headers:{},who:'b'},r);
 assert.equal(r.body.snapshot,null,'un altro membro non vede i dati');

 // A newer token replaces the older one.
 now+=5000;r=res();await h({method:'POST',headers:{'x-radix-trading':'1'},who:'a',body:{action:'token'}},r);
 const tok2=r.body.token;
 r=res();await h({method:'POST',headers:{authorization:'Bearer '+tok},body:SNAP},r);
 assert.equal(r.code,401);assert.match(r.body.error,/sostituito/);
 r=res();await h({method:'POST',headers:{authorization:'Bearer '+tok2},body:JSON.stringify(SNAP)},r);
 assert.equal(r.code,200);
});

test('push rejects bad tokens, live data and wrong shapes',async()=>{
 const {db}=fakeDb();const now=Date.parse('2026-10-29T10:00:00Z');
 const h=T.createHandler({getSql:()=>db,getSessionUser:()=>null,env:{JWT_SECRET:SECRET},now:()=>now});
 let r=res();await h({method:'POST',headers:{authorization:'Bearer rtr1.abc.def'},body:SNAP},r);assert.equal(r.code,401);
 const forged=T.sign(7,'other-secret',now).token;
 r=res();await h({method:'POST',headers:{authorization:'Bearer '+forged},body:SNAP},r);assert.equal(r.code,401);
 const expired=T.sign(7,SECRET,now-366*86400000).token;
 assert.equal(T.verify(expired,SECRET,now),null);
 r=res();await h({method:'GET',headers:{}},r);assert.equal(r.code,401);
 assert.throws(()=>T.parseSnapshot({...SNAP,modalita:'live'}),/solo risultati di prova/);
 assert.throws(()=>T.parseSnapshot({...SNAP,versione:2}),/Versione/);
 assert.throws(()=>T.parseSnapshot('[1]'),/non valida/);
 assert.throws(()=>T.parseSnapshot('{'),/JSON non valido/);
 assert.throws(()=>T.parseSnapshot({...SNAP,big:'x'.repeat(1600000)}),/troppo grande/);
});

test('route, rewrite, migration and page are wired',()=>{
 const cfg=JSON.parse(fs.readFileSync('vercel.json','utf8'));
 assert.ok(cfg.rewrites.some(r=>r.source==='/api/trading'&&r.destination==='/api/integrations/trading'));
 assert.match(fs.readFileSync('api/integrations/[service].js','utf8'),/'trading': \(\) => require\('\.\.\/_trading'\)/);
 const sql=fs.readFileSync('migrations/core/002_trading.sql','utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS rx_trading_snapshots/);
 const page=fs.readFileSync('trading.html','utf8');
 assert.match(page,/data-shell-page="trading"/);
 assert.doesNotMatch(page,/innerHTML/,'i testi del Mac vanno mostrati come testo');
 assert.match(fs.readFileSync('shell/radix-shell.js','utf8'),/personal: 'rx-trading'/);
 assert.match(fs.readFileSync('.vercelignore','utf8'),/^trading\/$/m);
});
