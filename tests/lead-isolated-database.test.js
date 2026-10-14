'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{isolatedUrl}=require('../api/_lead_db_guard');
const shared='postgresql://user:pw@shared.neon.tech/main?sslmode=require',other='postgresql://user:pw@preview.neon.tech/lead_preview?sslmode=require';
test('sensitive archive refuses same/shared DB and changed query parameters',()=>{
 for(const value of ['',shared,'postgresql://user:pw@shared.neon.tech/main?sslmode=other'])
  assert.throws(()=>isolatedUrl(value,shared,'preview'),e=>e.status===503);
});
test('separate Preview URL is accepted, production is blocked',()=>{
 assert.equal(isolatedUrl(other,shared,'preview'),other);
 assert.throws(()=>isolatedUrl(other,shared,'production'),e=>e.status===503);
});
