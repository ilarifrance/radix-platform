'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const schema=require('../docs/CRM_SALES_INTELLIGENCE_CONTRACT.schema.json');const {calendarDate,timestamp,uuid}=require('../api/_sales');
test('STATIC intelligence schema closes every object and requires all declared fields',()=>{
 let objects=0;function visit(s){if(!s||typeof s!=='object')return;if(s.type==='object'){objects++;assert.equal(s.additionalProperties,false);assert.deepEqual(s.required,Object.keys(s.properties));}if(s.pattern)assert.doesNotThrow(()=>new RegExp(s.pattern));for(const value of Object.values(s))if(value&&typeof value==='object')Array.isArray(value)?value.forEach(visit):visit(value);}visit(schema);assert.equal(objects,5);
 assert.equal(schema.properties.contractVersion.const,'1.0.0');assert.equal(schema.properties.amount.maximum,9000000000000);assert.equal(schema.properties.amountUnit.const,'minor');for(const key of ['currency','probability','nextAction'])assert.equal(schema.properties[key].type,'null');assert.equal(schema.properties.activities.maxItems,1000);
});
test('STATIC intelligence example parses and carries explicit unknowns matching current API primitives',()=>{
 const doc=fs.readFileSync('docs/CRM_SALES_INTELLIGENCE_CONTRACT.md','utf8');const example=JSON.parse(doc.split('```json')[1].split('```')[0]);assert.deepEqual(Object.keys(example),schema.required);assert.equal(example.contractVersion,'1.0.0');assert.ok(uuid(example.organizationId));assert.ok(uuid(example.opportunityId));assert.ok(timestamp(example.asOf));assert.match(example.asOf,new RegExp(schema.properties.asOf.pattern));
 assert.deepEqual(example.dataQuality.missingFields,['clientId','contactId','currency','probability','closeDate','ownerId','nextAction']);for(const key of example.dataQuality.missingFields)assert.equal(example[key],null);assert.equal(example.dataQuality.activitiesComplete,false);assert.equal(example.dataQuality.completeness,'partial');
 const dateSchema=schema.properties.closeDate.anyOf[0];assert.ok(calendarDate('2024-02-29'));assert.match('2024-02-29',new RegExp(dateSchema.pattern));assert.equal(calendarDate('2026-02-29'),false);assert.equal(dateSchema.format,'date');assert.doesNotMatch('0000-01-01',new RegExp(dateSchema.pattern));
});
test('STATIC intelligence activities exclude bodies credentials and unsupported automatic actions',()=>{
 const variants=schema.properties.activities.items.oneOf;assert.deepEqual(variants.map(v=>v.properties.source.const),['tasks','interactions']);for(const s of variants)for(const key of ['body','email','password','token','prompt','execute'])assert.equal(Object.hasOwn(s.properties,key),false);assert.deepEqual(variants[0].properties.status.enum,['todo','doing','done']);assert.deepEqual(variants[1].properties.type.enum,['note','call','meeting','email']);
});
