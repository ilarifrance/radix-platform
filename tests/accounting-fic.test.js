'use strict';
// Fatture in Cloud: token cifrato per azienda, lettura delle fatture elettroniche con un fetch finto.
const test=require('node:test');const assert=require('node:assert');
const fic=require('../api/_accounting_fic');
const env={MAILBOX_ENC_KEY:Buffer.alloc(32,7).toString('base64')};
const XML='<?xml version="1.0"?><p:FatturaElettronica versione="FPR12"><x/></p:FatturaElettronica>';

function fakeFetch(routes){const log=[];
 const f=async(url,opts)=>{log.push({url,auth:opts&&opts.headers&&opts.headers.Authorization});
  for(const [re,res] of routes){const m=url.match(re);if(m){const r=typeof res==='function'?res(url,m):res;
   if(r&&r.status)return {status:r.status,ok:r.status<400,json:async()=>({}),arrayBuffer:async()=>new ArrayBuffer(0)};
   const body=Buffer.isBuffer(r)?r:typeof r==='string'?Buffer.from(r):null;
   return {status:200,ok:true,json:async()=>r,arrayBuffer:async()=>body.buffer.slice(body.byteOffset,body.byteOffset+body.length)};}}
  return {status:404,ok:false};};
 f.log=log;return f;}

test('il token si apre solo con la stessa azienda e la stessa chiave',()=>{
 const s=fic.seal('tok_abcdefghijklmnopqrstuvwxyz','c1',env);
 assert.ok(s.startsWith('radix-fic-v1.'));assert.ok(!s.includes('tok_'));
 assert.strictEqual(fic.open(s,'c1',env),'tok_abcdefghijklmnopqrstuvwxyz');
 assert.throws(()=>fic.open(s,'c2',env),e=>e.status===409);
 assert.throws(()=>fic.open(s,'c1',{MAILBOX_ENC_KEY:Buffer.alloc(32,9).toString('base64')}),e=>e.status===409);
 assert.throws(()=>fic.seal('x','c1',{}),e=>e.status===503);
});

test('il token incollato viene ripulito e controllato',()=>{
 assert.strictEqual(fic.cleanToken('  Bearer a/very.long-token_value~12345  '),'a/very.long-token_value~12345');
 assert.throws(()=>fic.cleanToken('corto'),e=>e.status===400);
 assert.throws(()=>fic.cleanToken('con spazi dentro e non valido!!'),e=>e.status===400);
 assert.throws(()=>fic.cleanToken(null),e=>e.status===400);
});

test('le aziende del token e gli errori in italiano',async()=>{
 const f=fakeFetch([[/\/user\/companies$/,{data:{companies:[{id:9,name:'Ilari Group Srl',vat_number:'IT123',tax_code:null}]}}]]);
 assert.deepStrictEqual(await fic.companies(f,'T'),[{id:9,name:'Ilari Group Srl',vat:'IT123',tax_code:null}]);
 assert.strictEqual(f.log[0].auth,'Bearer T');
 for(const [st,re] of [[401,/scaduto o è stato revocato/],[403,/permessi/],[429,/rallentare/],[500,/errore \(500\)/]]){
  const g=fakeFetch([[/./,{status:st}]]);
  await assert.rejects(fic.companies(g,'T'),e=>re.test(e.message)&&!e.message.includes('T '));
 }
});

test('legge emesse e ricevute, salta quelle già viste e quelle senza XML',async()=>{
 const f=fakeFetch([
  [/issued_documents\?.*type=invoice/,{data:[{id:1,number:5,numeration:'/A',date:'2026-02-01'},{id:2,number:6,date:'2026-02-03'}]}],
  [/issued_documents\?.*type=credit_note/,{data:[]}],
  [/received_documents\?.*type=expense/,{data:[{id:7,invoice_number:'R-1',date:'2026-02-04'},{id:8,e_invoice:false},{id:9,invoice_number:'R-2'}]}],
  [/received_documents\?.*type=passive_credit_note/,{data:[]}],
  [/issued_documents\/1\/e_invoice\/xml/,XML],
  [/received_documents\/7\?/,{data:{attachment_url:'https://files.example/7.xml'}}],
  [/received_documents\/9\?/,{data:{attachment_url:'https://files.example/9.pdf'}}],
  [/files\.example\/7\.xml/,XML],[/files\.example\/9\.pdf/,'%PDF-1.4'],
 ]);
 const r=await fic.collect({fetchImpl:f,token:'T',fic:42,from:'2026-01-01',seen:new Set(['i:2'])});
 assert.deepStrictEqual(r.files.map(x=>x.key),['i:1','r:7']);
 assert.strictEqual(r.files[0].name,'fic-emessa-5/A');assert.strictEqual(r.files[1].name,'fic-ricevuta-R-1');
 assert.deepStrictEqual(r.skipped.map(x=>x.key),['r:9']);
 assert.strictEqual(r.more,false);
 assert.ok(f.log.some(l=>decodeURIComponent(l.url).includes("q=date >= '2026-01-01'")||l.url.includes('q=date+%3E%3D+%272026-01-01%27')));
 assert.ok(f.log.filter(l=>l.url.includes('files.example')).every(l=>!l.auth),'il file si scarica senza token');
});

test('si ferma a MAX_FILES e dice che ce ne sono altre',async()=>{
 const rows=Array.from({length:100},(_,i)=>({id:i+1,number:i+1}));
 const f=fakeFetch([[/issued_documents\?.*type=invoice.*page=1/,{data:rows,next_page_url:'x'}],[/issued_documents\?/,{data:[]}],[/received_documents\?/,{data:[]}],[/e_invoice\/xml/,XML]]);
 const r=await fic.collect({fetchImpl:f,token:'T',fic:1,from:'2026-01-01',seen:new Set()});
 assert.strictEqual(r.files.length,fic.MAX_FILES);assert.strictEqual(r.more,true);
});

test('xmlOf riconosce solo una FatturaPA',()=>{
 assert.ok(fic.xmlOf(Buffer.from('﻿'+XML)));
 assert.strictEqual(fic.xmlOf(Buffer.from('<html></html>')),null);
 assert.strictEqual(fic.xmlOf(Buffer.from('%PDF')),null);
 assert.strictEqual(fic.xmlOf(null),null);
});

// Vercel only bundles files reached by a literal require('...'): an aliased require left management.js out of
// /api/accounting in production (Cannot find module './management').
test('le librerie della contabilità usano require letterali',()=>{
 const fs=require('fs'),path=require('path'),dir=path.join(__dirname,'..','lib','accounting');
 for(const f of fs.readdirSync(dir).filter(x=>x.endsWith('.js'))){const s=fs.readFileSync(path.join(dir,f),'utf8');
  assert.ok(!/\?\s*require\s*:/.test(s)&&!/\b[a-z]\?[a-z]\('\.\//.test(s),f+': require passato come variabile');}
});
