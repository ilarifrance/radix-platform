'use strict';const test=require('node:test'),assert=require('node:assert/strict');const B=require('../lib/lead-provider-budget');
test('quota is disabled by default and rejects exhausted usage',()=>{assert.deepEqual(B.status(null,'2026-10-16',0),{day:'2026-10-16',limit:0,used:0,remaining:0});assert.throws(()=>B.reserve(null,'2026-10-16',0),/disattivato/);assert.throws(()=>B.reserve({day:'2026-10-16',used:2},'2026-10-16',2),/esaurito/)});
test('persistent counter resets only at UTC day boundary',()=>{const first=B.reserve(null,'2026-10-16',2);assert.equal(B.reserve(first,'2026-10-16',2).used,2);assert.equal(B.reserve({day:'2026-10-16',used:2},'2026-10-17',2).used,1)});
test('fails closed on invalid budget setting',()=>{assert.throws(()=>B.status(null,'bad',2),/non valido/);assert.throws(()=>B.status(null,'2026-10-16',101),/non valido/);assert.throws(()=>B.status(null,'2026-10-16',-1),/non valido/)});

test('rollback of UTC clock cannot reopen consumed budget',()=>{assert.throws(()=>B.reserve({day:'2026-10-17',used:3},'2026-10-16',5),/Orologio/)});
