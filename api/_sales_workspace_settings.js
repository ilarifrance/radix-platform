'use strict';
/* Impostazioni › CRM › Valuta (migration sales 021): settings of a whole workspace. Today only the currency, an ISO code
   from the list lib/radix-i18n.js can show (CODES), euro by default. Every member reads it (the pages show amounts with it);
   only owner and admin change it. Before migration 021 reads answer euro and changes answer 503. */
const I18N=require('../lib/radix-i18n.js');
const plans=require('./_sales_plan');
const ENTITY='workspace_settings';
class SettingsError extends Error{constructor(status,message){super(message);this.status=status}}
const fail=(status,message)=>{throw new SettingsError(status,message)};
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const DEFAULTS=Object.freeze({currency:'EUR'});
function query(q){
 if(!object(q)&&typeof q!=='object')fail(400,'Parametri impostazioni non validi.');
 if(Object.keys(q).some(k=>!['entity','workspace','offset'].includes(k))||(q.offset!==undefined&&q.offset!=='0')||!uuid(q.workspace))fail(400,'Parametri impostazioni non validi.');
 return {workspace:q.workspace,entity:ENTITY};
}
function command(body){
 if(!object(body)||Object.keys(body).some(k=>!['workspace','entity','action','data'].includes(k))||body.entity!==ENTITY||body.action!=='update'||!uuid(body.workspace)||!object(body.data))fail(400,'Impostazioni non valide.');
 const keys=Object.keys(body.data);if(keys.join()!=='currency')fail(400,'Impostazione non consentita.');
 const c=typeof body.data.currency==='string'?body.data.currency.trim().toUpperCase():'';
 if(!I18N.CODES.includes(c))fail(400,'Valuta non disponibile.');
 return {workspace:body.workspace,entity:ENTITY,action:'update',data:{currency:c}};
}
// plan: the Sales Orbis plan (api/_sales_plan.js), so the pages can show what it includes; read only, never set here.
// limits and usage: the plan's monthly limits and how much of them the caller used this month (Impostazioni › CRM › Piano).
async function read(sql,workspace,user){
 let out;
 try{const r=await sql('SELECT currency FROM sales_workspaces WHERE id=$1',[workspace]);out={...DEFAULTS,...(r[0]&&r[0].currency?{currency:r[0].currency}:{})}}
 catch(e){if(e&&e.code==='42703')out={...DEFAULTS,pending:true};else throw e}
 const plan=await plans.planOf(sql,workspace);
 return {...out,plan,limits:{...plans.limits(plan)},usage:user?await plans.usage(sql,workspace,user):{ai:0,lead:0,send:0}};
}
async function handle(c,{sql,role,method,user}){
 // rows: the shape every /api/sales read has (the pages check it); settings: the same object by name.
 const answer=settings=>({rows:[settings],settings});
 if(method!=='POST')return answer(await read(sql,c.workspace,user));
 if(!['owner','admin'].includes(role))fail(403,'Solo owner e admin cambiano la valuta del workspace.');
 try{await sql('UPDATE sales_workspaces SET currency=$2 WHERE id=$1',[c.workspace,c.data.currency])}
 catch(e){if(e&&e.code==='42703')fail(503,'La valuta del workspace non è ancora attiva in questo archivio: serve la migrazione sales 021 (da approvare).');throw e}
 return answer(await read(sql,c.workspace,user));
}
module.exports={ENTITY,DEFAULTS,query,command,read,handle};
