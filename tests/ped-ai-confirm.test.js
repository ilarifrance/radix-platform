'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','editorial-workspace.js'),'utf8');

test('guided start (?avvia=1) asks once before any AI call',()=>{
 const body=src.slice(src.indexOf('async function guidedStart'),src.indexOf('async function proposePlan'));
 const ask=body.indexOf('await askConfirm('),first=Math.min(...['fillBrief(','proposePlan('].map(k=>body.indexOf(k)).filter(i=>i>=0));
 assert.ok(ask>0&&ask<first,'the RADIX confirmation must come before fillBrief/proposePlan');assert.ok(!/[^.\w]confirm\(/.test(body),'no native confirm');
 assert.match(body,/crediti API/);
});

test('approving one content asks before the Art Director draws its graphics',()=>{
 const i=src.indexOf("if(decision==='approve'){const it=");assert.ok(i>0);
 const line=src.slice(i,src.indexOf('}};',i));
 assert.match(line,/it\.slides\|\|.*\|\|await askConfirm\(\{title:'Contenuto approvato\. Creare ora la grafica\?',cost:'L’Art Director AI consuma crediti API\.'.*ok:'Crea la grafica'.*\}\)\)autoGraphics\(it\)/);
});
