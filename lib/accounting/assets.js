/* RADIX Accounting — year-end adjustments: fixed-asset register and depreciation (ammortamenti), accruals and
   deferrals (ratei e risconti). The register is read from the ledger: every posted debit on a fixed-asset account
   is one asset. Rates are the account's indicative coefficient unless the caller passes its own. Pure functions. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./chart-of-accounts'):root.RadixChartOfAccounts);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixAssets=api})(typeof globalThis!=='undefined'?globalThis:this,function(coa){
'use strict';
const S=coa.SYSTEM;
// Indicative yearly coefficients (DM 31/12/1988, most common groups): the professional confirms them per sector.
const RATES=Object.freeze({'01.01':20,'01.10':10,'01.11':15,'01.12':20,'01.13':12,'01.14':25});
// Goods up to 516,46 € can be fully depreciated in the purchase year (art. 102 c.5 TUIR).
const SMALL_ASSET=51646;
const INTANGIBLE=new Set(['01.01']);
const DAY=864e5;
const t=d=>Date.parse(d+'T12:00:00Z');
const isDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(t(s)).toISOString().slice(0,10)===s;
const span=(a,b)=>Math.round((t(b)-t(a))/DAY)+1;

// Assets bought: debits on fixed-asset accounts (not the depreciation fund) in posted entries up to `to`.
function register(entries,accounts,{to}={}){
 const idx=coa.index(accounts),out=[];
 for(const e of entries||[]){if(e.status!=='posted'||(to&&e.date>to)||(e.source&&e.source.type==='depreciation'))continue;
  e.lines.forEach((l,n)=>{const a=idx.get(l.account);if(!a||a.group!=='immobilizzazioni'||l.account===S.depreciationFund||!(l.debit_cents>0))return;
   out.push({id:e.id+':'+(n+1),entry_id:e.id,account:l.account,account_name:a.name,description:l.description||e.description,date:e.date,cost_cents:l.debit_cents,project:l.project||null,cost_center:l.cost_center||null});});}
 return out.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
// Straight-line plan: half rate in the first year (fiscal rule), small assets in one year, last year takes the residual.
function schedule(asset,{rate,halfFirstYear=true,smallFull=true}={}){
 const r=rate===undefined?RATES[asset.account]:rate;
 if(!(r>0&&r<=100))return {rate:r??null,years:[]};
 const y0=+asset.date.slice(0,4),years=[];let done=0,y=y0;
 if(smallFull&&asset.cost_cents<=SMALL_ASSET)return {rate:r,years:[{year:y0,amount_cents:asset.cost_cents,accumulated_cents:asset.cost_cents,residual_cents:0}]};
 while(done<asset.cost_cents&&years.length<200){
  const full=Math.round(asset.cost_cents*r/100),amount=Math.min(asset.cost_cents-done,y===y0&&halfFirstYear?Math.round(full/2):full);
  done+=amount;years.push({year:y,amount_cents:amount,accumulated_cents:done,residual_cents:asset.cost_cents-done});y++;
 }
 return {rate:r,years};
}
// Depreciation of a year for the whole register: rows per asset and the closing entry (dare 64.0x, avere fondo).
function depreciation(entries,accounts,year,{rates={},halfFirstYear=true,smallFull=true}={}){
 const y=+year,to=y+'-12-31',rows=[],missing=[];
 for(const a of register(entries,accounts,{to})){
  const rate=Object.hasOwn(rates,a.account)?rates[a.account]:RATES[a.account];
  const plan=schedule(a,{rate,halfFirstYear,smallFull}),row=plan.years.find(r=>r.year===y);
  if(plan.rate==null){missing.push(a);continue;}
  if(row)rows.push({...a,rate:plan.rate,amount_cents:row.amount_cents,accumulated_cents:row.accumulated_cents,residual_cents:row.residual_cents});
 }
 const done=(entries||[]).filter(e=>e.source&&e.source.type==='depreciation'&&+e.source.year===y&&!(entries||[]).some(x=>x.reverses===e.id));
 const total=rows.reduce((s,r)=>s+r.amount_cents,0),lines=[];
 for(const kind of ['intangible','tangible']){const part=rows.filter(r=>INTANGIBLE.has(r.account)===(kind==='intangible'));
  for(const r of part)lines.push({account:kind==='intangible'?S.depreciationIntangible:S.depreciationTangible,debit_cents:r.amount_cents,credit_cents:0,project:r.project,cost_center:r.cost_center,description:('Amm. '+r.rate+'% '+r.description).slice(0,300)});}
 if(total)lines.push({account:S.depreciationFund,debit_cents:0,credit_cents:total,description:'Quota ammortamento '+y});
 return {year:y,rows,missing,total_cents:total,existing:done.map(e=>e.id),
  entry:total?{date:to,description:'Ammortamenti esercizio '+y,source:{type:'depreciation',year:y},lines}:null};
}
/* Ratei e risconti at the closing date. kind:
   risconto_attivo  cost already booked that belongs partly to next year   → dare 02.30 / avere costo
   rateo_attivo     revenue of this year not yet invoiced                  → dare 02.31 / avere ricavo
   rateo_passivo    cost of this year not yet invoiced                     → dare costo / avere 04.50
   risconto_passivo revenue already booked that belongs partly to next year→ dare ricavo / avere 04.51
   The adjustment is reversed on the first day of the next year (riapertura), so next year's invoice nets it. */
const KINDS=Object.freeze({risconto_attivo:{label:'Risconto attivo',side:'C',future:true,account:S.prepaidExpenses},rateo_attivo:{label:'Rateo attivo',side:'R',future:false,account:S.accruedIncome},
 rateo_passivo:{label:'Rateo passivo',side:'C',future:false,account:S.accruedExpenses},risconto_passivo:{label:'Risconto passivo',side:'R',future:true,account:S.deferredIncome}});
function accrual(o,accounts){
 const k=KINDS[o&&o.kind];if(!k)throw new Error('Tipo non valido: rateo o risconto, attivo o passivo.');
 if(!isDate(o.from)||!isDate(o.to)||o.from>o.to)throw new Error('Periodo di competenza non valido.');
 if(!Number.isSafeInteger(o.amount_cents)||o.amount_cents<=0)throw new Error('Importo non valido.');
 const closing=o.closing||o.from.slice(0,4)+'-12-31';if(!isDate(closing)||closing<o.from||closing>=o.to)throw new Error('La data di chiusura deve cadere dentro il periodo di competenza.');
 const a=coa.index(accounts).get(o.account);if(!a||a.kind!==k.side)throw new Error(k.side==='C'?'Scegli un conto di costo.':'Scegli un conto di ricavo.');
 const total=span(o.from,o.to),after=span(closing,o.to)-1,before=total-after;
 const amount=Math.round(o.amount_cents*(k.future?after:before)/total);
 if(!amount)throw new Error('La quota di competenza è zero.');
 const desc=(k.label+' '+(o.description||a.name)+' ('+o.from.split('-').reverse().join('/')+'–'+o.to.split('-').reverse().join('/')+')').slice(0,300);
 const debit=(k.side==='C')===k.future?k.account:o.account,credit=debit===k.account?o.account:k.account;
 const lines=[{account:debit,debit_cents:amount,credit_cents:0,project:o.project||null,cost_center:o.cost_center||null},{account:credit,debit_cents:0,credit_cents:amount,project:o.project||null,cost_center:o.cost_center||null}];
 const next=new Date(t(closing)+DAY).toISOString().slice(0,10);
 return {kind:o.kind,label:k.label,days_total:total,days_before:before,days_after:after,amount_cents:amount,
  entry:{date:closing,description:desc,source:{type:'accrual',kind:o.kind},lines},
  reversal:{date:next,description:('Riapertura '+desc).slice(0,300),source:{type:'accrual_reversal',kind:o.kind},lines:lines.map(l=>({...l,debit_cents:l.credit_cents,credit_cents:l.debit_cents}))}};
}
return {RATES,SMALL_ASSET,KINDS,register,schedule,depreciation,accrual};
});
