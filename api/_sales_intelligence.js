'use strict';
// Internal, offline-only boundary. No route/provider/AI configuration is wired here.
const schema=require('../docs/CRM_SALES_INTELLIGENCE_CONTRACT.schema.json');
const {uuid,timestamp,calendarDate}=require('./_sales');
const nullableFields=['clientId','contactId','currency','probability','closeDate','ownerId','nextAction'];
const modelIssues=['currency_not_modeled','probability_not_modeled','next_action_not_modeled'];
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
// Deliberately only the vocabulary used by this pinned schema, not a generic JSON Schema engine.
// Schema vocabulary coverage is tested; unknown keywords fail closed.
const keywords=new Set(['$schema','title','type','additionalProperties','required','properties','const','format','pattern','minimum','maximum','anyOf','oneOf','enum','minLength','maxLength','maxItems','uniqueItems','items']);
function matches(s,v){
 if(Object.keys(s).some(k=>!keywords.has(k)))return false;
 if(s.anyOf&&!s.anyOf.some(x=>matches(x,v)))return false;
 if(s.oneOf&&s.oneOf.filter(x=>matches(x,v)).length!==1)return false;
 if(Object.hasOwn(s,'const')&&v!==s.const)return false;
 if(s.enum&&!s.enum.includes(v))return false;
 if(s.type==='null'&&v!==null)return false;
 if(s.type==='boolean'&&typeof v!=='boolean')return false;
 if(s.type==='integer'&&(!Number.isSafeInteger(v)||v<s.minimum||v>s.maximum))return false;
 if(s.type==='string'){
  if(typeof v!=='string')return false;
  const length=[...v].length;
  if(length<(s.minLength??0)||length>(s.maxLength??Infinity)||s.pattern&&!new RegExp(s.pattern).test(v))return false;
  if(s.format&&!({uuid,'date-time':timestamp,date:calendarDate}[s.format]?.(v)))return false;
 }
 if(s.type==='array'){
  if(!Array.isArray(v)||v.length>(s.maxItems??Infinity))return false;
  if(s.uniqueItems&&new Set(v.map(x=>JSON.stringify(x))).size!==v.length)return false;
  if(s.items&&!v.every(x=>matches(s.items,x)))return false;
 }
 if(s.type==='object'){
  if(!object(v)||s.required.some(k=>!Object.hasOwn(v,k)))return false;
  if(s.additionalProperties===false&&Object.keys(v).some(k=>!Object.hasOwn(s.properties,k)))return false;
  if(!Object.entries(s.properties).every(([k,x])=>matches(x,v[k])))return false;
 }
 return true;
}
function validateEnvelope(value){
 if(!matches(schema,value))return false;
 const q=value.dataQuality,missing=nullableFields.filter(k=>value[k]===null);
 if(missing.length!==q.missingFields.length||missing.some(k=>!q.missingFields.includes(k)))return false;
 if(q.completeness!==(q.activitiesComplete?'complete':'partial'))return false;
 if(modelIssues.some(k=>!q.issues.includes(k)))return false;
 if(q.activitiesComplete&&q.issues.some(k=>['offset_pagination_not_snapshot','duplicate_activities','activity_limit_exceeded','activities_not_loaded'].includes(k)))return false;
 const seen=new Set();
 for(const a of value.activities){const key=a.source+':'+a.id.toLowerCase();if(seen.has(key)||!a.title.trim())return false;seen.add(key);}
 return true;
}
function invalid(){throw new Error('Sales intelligence input unavailable or invalid.');}
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const nullableSame=(a,b)=>a===null&&b===null||same(a,b);
// workspace is a trusted caller's authorized scope, NOT a membership credential.
// Caller must provide server-fetched normalized Customer360 records, never request-body data.
function projectOpportunity({workspace,opportunityId,rows,asOf}){
 if(!uuid(workspace)||!uuid(opportunityId)||!timestamp(asOf)||!Array.isArray(rows)||rows.length>1100)invalid();
 for(const row of rows)if(!object(row)||!object(row.record)||!same(row.record.workspace_id,workspace)||!['companies','contacts','opportunities','tasks','interactions'].includes(row.entity))invalid();
 const roots=rows.filter(r=>r.entity==='opportunities');
 if(roots.length!==1||!same(roots[0].record.id,opportunityId))invalid();
 const r=roots[0].record,activities=[],seen=new Map();let duplicate=false;
 for(const row of rows){
  const a=row.record;
  if(row.entity==='companies'&&!same(a.id,r.company_id)||row.entity==='contacts'&&(!same(a.id,r.contact_id)||!nullableSame(a.company_id,r.company_id)))invalid();
  if(!['tasks','interactions'].includes(row.entity))continue;
  if(!same(a.opportunity_id,r.id)||!nullableSame(a.company_id,r.company_id)||!nullableSame(a.contact_id,r.contact_id)||!uuid(a.id))invalid();
  const key=row.entity+':'+a.id.toLowerCase();
  // Conflicting pages are rejected, identical duplicates explicitly disclosed.
  const projected=row.entity==='tasks'?{source:'tasks',id:a.id,version:a.version,type:'task',title:a.title,status:a.status,assigneeId:a.assignee_id,priority:a.priority,dueAt:a.due_at}:{source:'interactions',id:a.id,version:a.version,type:a.kind,title:a.title,occurredAt:a.occurred_at};
  const previous=seen.get(key);
  if(seen.has(key)){if(JSON.stringify(previous)!==JSON.stringify(projected))invalid();duplicate=true;continue;}
  seen.set(key,projected);activities.push(projected);
 }
 // Offset pages cannot prove a consistent snapshot. Never claim complete here.
 const issues=[...modelIssues,'offset_pagination_not_snapshot'];
 if(duplicate)issues.push('duplicate_activities');
 if(activities.length>1000)issues.push('activity_limit_exceeded');
 const value={contractVersion:'1.0.0',organizationId:workspace,clientId:r.company_id,contactId:r.contact_id,opportunityId:r.id,recordVersion:r.version,asOf,stage:{processId:r.process_id,id:r.stage_id},amount:r.amount_cents,amountUnit:'minor',currency:null,probability:null,closeDate:r.expected_close,ownerId:r.owner_id,activities:activities.slice(0,1000),nextAction:null};
 value.dataQuality={completeness:'partial',activitiesComplete:false,missingFields:nullableFields.filter(k=>value[k]===null),issues};
 // Validate every activity, including truncated records, before returning any data.
 if(!activities.every(a=>schema.properties.activities.items.oneOf.some(s=>matches(s,a)))||!validateEnvelope(value))invalid();
 return value;
}
module.exports={validateEnvelope,projectOpportunity};
