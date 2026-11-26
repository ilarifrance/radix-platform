'use strict';
/* Impostazioni › CRM › Valuta (migration sales 021): settings of a whole workspace. The currency, an ISO code
   from the list lib/radix-i18n.js can show (CODES), euro by default. Every member reads it (the pages show amounts with it);
   only owner and admin change it. Before migration 021 reads answer euro and changes answer 503.
   Since migration 025 also a second currency and its default exchange rate («1 of the workspace currency = exchange_rate
   of the second»): each opportunity then carries both amounts (sales/crm-fx.js). Before 025 reads say fx_pending. */
const I18N=require('../lib/radix-i18n.js');
const plans=require('./_sales_plan');
const ENTITY='workspace_settings';
class SettingsError extends Error{constructor(status,message){super(message);this.status=status}}
const fail=(status,message)=>{throw new SettingsError(status,message)};
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const DEFAULTS=Object.freeze({currency:'EUR'});
const KEYS=['currency','second_currency','exchange_rate'];
function query(q){
 if(!object(q)&&typeof q!=='object')fail(400,'Parametri impostazioni non validi.');
 if(Object.keys(q).some(k=>!['entity','workspace','offset'].includes(k))||(q.offset!==undefined&&q.offset!=='0')||!uuid(q.workspace))fail(400,'Parametri impostazioni non validi.');
 return {workspace:q.workspace,entity:ENTITY};
}
function command(body){
 if(!object(body)||Object.keys(body).some(k=>!['workspace','entity','action','data'].includes(k))||body.entity!==ENTITY||body.action!=='update'||!uuid(body.workspace)||!object(body.data))fail(400,'Impostazioni non valide.');
 const keys=Object.keys(body.data);if(!keys.length||keys.some(k=>!KEYS.includes(k)))fail(400,'Impostazione non consentita.');
 const data={},code=v=>typeof v==='string'?v.trim().toUpperCase():'';
 if(keys.includes('currency')){const c=code(body.data.currency);if(!I18N.CODES.includes(c))fail(400,'Valuta non disponibile.');data.currency=c}
 // Second currency: a known code, or null / '' for none. Rate: a number above zero, at most six decimals are kept.
 if(keys.includes('second_currency')){const v=body.data.second_currency;if(v===null||v==='')data.second_currency=null;else{const c=code(v);if(!I18N.CODES.includes(c))fail(400,'Seconda valuta non disponibile.');data.second_currency=c}}
 if(keys.includes('exchange_rate')){const v=body.data.exchange_rate;if(v===null||v==='')data.exchange_rate=null;else{if(typeof v!=='number'||!Number.isFinite(v)||v<=0||v>1000000)fail(400,'Cambio non valido: un numero maggiore di zero, ad esempio 1,15.');data.exchange_rate=Math.round(v*1e6)/1e6;if(!data.exchange_rate)fail(400,'Cambio non valido: un numero maggiore di zero, ad esempio 1,15.')}}
 if(data.currency&&data.second_currency&&data.currency===data.second_currency)fail(400,'La seconda valuta deve essere diversa da quella del workspace.');
 return {workspace:body.workspace,entity:ENTITY,action:'update',data};
}
// plan: the Sales Orbis plan (api/_sales_plan.js), so the pages can show what it includes; read only, never set here.
// limits and usage: the plan's monthly limits and how much of them the caller used this month (Impostazioni › CRM › Piano).
async function read(sql,workspace,user){
 let out;
 try{const r=await sql('SELECT currency FROM sales_workspaces WHERE id=$1',[workspace]);out={...DEFAULTS,...(r[0]&&r[0].currency?{currency:r[0].currency}:{})}}
 catch(e){if(e&&e.code==='42703')out={...DEFAULTS,pending:true};else throw e}
 // Second currency and default rate (025). The rate is only meaningful with a second currency.
 try{const r=await sql('SELECT second_currency,exchange_rate FROM sales_workspaces WHERE id=$1',[workspace]);const x=r[0]||{},rate=Number(x.exchange_rate);
  out.second_currency=x.second_currency&&x.second_currency!==out.currency?x.second_currency:null;out.exchange_rate=out.second_currency&&Number.isFinite(rate)&&rate>0?rate:null}
 catch(e){if(e&&e.code==='42703'){out.second_currency=null;out.exchange_rate=null;out.fx_pending=true}else throw e}
 const plan=await plans.planOf(sql,workspace);
 return {...out,plan,limits:{...plans.limits(plan)},usage:user?await plans.usage(sql,workspace,user):{ai:0,lead:0,send:0}};
}
async function handle(c,{sql,role,method,user}){
 // rows: the shape every /api/sales read has (the pages check it); settings: the same object by name.
 const answer=settings=>({rows:[settings],settings});
 if(method!=='POST')return answer(await read(sql,c.workspace,user));
 if(!['owner','admin'].includes(role))fail(403,'Solo owner e admin cambiano la valuta del workspace.');
 const d=c.data;
 if(d.currency!==undefined){
  try{await sql('UPDATE sales_workspaces SET currency=$2 WHERE id=$1',[c.workspace,d.currency])}
  catch(e){if(e&&e.code==='42703')fail(503,'La valuta del workspace non è ancora attiva in questo archivio: serve la migrazione sales 021 (da approvare).');
   // The new currency equals the second one (check of 025): the second one is dropped, the change goes through.
   if(e&&e.code==='23514'){await sql('UPDATE sales_workspaces SET second_currency=NULL,exchange_rate=NULL,currency=$2 WHERE id=$1',[c.workspace,d.currency])}else throw e}
 }
 if(d.second_currency!==undefined||d.exchange_rate!==undefined){
  try{
   if(d.second_currency!==undefined)await sql('UPDATE sales_workspaces SET second_currency=$2 WHERE id=$1',[c.workspace,d.second_currency]);
   if(d.exchange_rate!==undefined)await sql('UPDATE sales_workspaces SET exchange_rate=$2 WHERE id=$1',[c.workspace,d.exchange_rate]);
  }catch(e){if(e&&e.code==='42703')fail(503,'Il cambio tra due valute non è ancora attivo in questo archivio: serve la migrazione sales 025 (da approvare).');
   if(e&&e.code==='23514')fail(400,'La seconda valuta deve essere diversa da quella del workspace.');throw e}
 }
 return answer(await read(sql,c.workspace,user));
}
module.exports={ENTITY,DEFAULTS,query,command,read,handle};
