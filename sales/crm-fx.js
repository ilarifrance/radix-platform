'use strict';
/* Two currencies on an opportunity (migration sales 025). A workspace that buys in one currency and sells in another names
   a second currency and a default exchange rate in Impostazioni › CRM › Valuta: «1 of the workspace currency = rate of the
   second». Each opportunity then has two amounts: typing one fills the other; the rate can be changed on the single
   opportunity and is saved with it, so a later change of the default never rewrites old opportunities.
   Core (also for the tests): parse, rate, toSecond, toMain, fmt. Browser: RadixCrmFx.load(ws), .attach(), .values(), .node(). */
(function(root){
const SIGNS={EUR:'€',GBP:'£',USD:'$',CHF:'CHF',JPY:'¥'};
const sign=code=>SIGNS[code]||code||'';
// «24.000», «24.000,50», «24,000.50», «24000.5» → cents; '' → null; anything else NaN (as crm-quick-core.js).
function parse(v){const s=String(v??'').replace(/[€£$\s  ']/g,'').replace(/^(EUR|GBP|USD|CHF)/i,'');if(!s)return null;if(!/^\d[\d.,]*$/.test(s)||/[.,]$/.test(s))return NaN;
 const m=/^(.*?)[.,](\d{1,2})$/.exec(s),int=m?m[1]:s,dec=m?m[2]:'';if(int&&!/^\d{1,3}([.,]?\d{3})*$/.test(int))return NaN;
 const c=Number(int.replace(/[.,]/g,'')||'0')*100+Number((dec+'00').slice(0,2));return Number.isSafeInteger(c)?c:NaN}
// «1,15» or «1.15» → 1.15; '' → null; not a rate → NaN. Six decimals at most, as the archive keeps.
function rate(v){if(typeof v==='number')return Number.isFinite(v)&&v>0&&v<=1e6?Math.round(v*1e6)/1e6:NaN;const s=String(v??'').trim().replace(/\s/g,'').replace(',','.');if(!s)return null;if(!/^\d+(\.\d+)?$/.test(s))return NaN;const n=Math.round(Number(s)*1e6)/1e6;return n>0&&n<=1e6?n:NaN}
const toSecond=(cents,r)=>Number.isSafeInteger(cents)&&r>0?Math.round(cents*r):null;
const toMain=(cents2,r)=>Number.isSafeInteger(cents2)&&r>0?Math.round(cents2/r):null;
// Text for an input: «24000» or «24000,50» (the same shape the amount input of the editor uses).
const fmt=c=>c==null||c===''||!Number.isFinite(Number(c))?'':(Number(c)%100?(Number(c)/100).toFixed(2).replace('.',','):String(Math.round(Number(c)/100)));
const fmtRate=r=>r==null||!Number.isFinite(Number(r))?'':String(Math.round(Number(r)*1e6)/1e6).replace('.',',');
const core={parse,rate,toSecond,toMain,fmt,fmtRate,sign};
if(typeof module==='object'&&module.exports){module.exports=core;return}

/* ---------- browser ---------- */
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
// Currency signs and codes written here are exact: the page's currency swap (lib/radix-i18n.js) must not touch them.
const exact=(text,cls)=>{const s=E('span',text,cls);s.setAttribute('data-i18n-skip','');return s};
let cache=null,cacheWs=null,loading=null;
async function load(ws,force){
 if(!ws)return null;if(!force&&cache&&cacheWs===ws)return cache;if(!force&&loading&&loading.ws===ws)return loading.p;
 const p=fetch('/api/sales?'+new URLSearchParams({entity:'workspace_settings',workspace:ws,offset:'0'}),{credentials:'same-origin',cache:'no-store'})
  .then(r=>r.ok?r.json():null).then(d=>{const s=(d&&d.settings)||{};cache={currency:s.currency||'EUR',second:s.second_currency||null,rate:Number(s.exchange_rate)>0?Number(s.exchange_rate):null,pending:!!s.fx_pending};cacheWs=ws;return cache})
  .catch(()=>{cache={currency:'EUR',second:null,rate:null,pending:true};cacheWs=ws;return cache}).finally(()=>{loading=null});
 loading={ws,p};return p}
const settings=()=>cache;
// The rate as the person reads it: «1,15» in Italian, «1.15» in English (both are accepted when typed).
const shown=r=>root.RadixI18n&&root.RadixI18n.en?fmtRate(r).replace(',','.'):fmtRate(r);
const active=()=>!!(cache&&cache.second&&!cache.pending);
const amount=(cents,code)=>{const n=Number(cents)/100;return sign(code)+(sign(code).length>1?' ':'')+n.toLocaleString(root.RadixI18n&&root.RadixI18n.en?'en-GB':'it-IT',{minimumFractionDigits:n%1?2:0,maximumFractionDigits:2})};
/* The two extra inputs of an opportunity form, appended to host: «Importo in <second>» and «Cambio». main is the amount
   input already in the form (its value is rewritten when the person types the second amount). → true when added. */
function attach(main,host,deal){
 if(!active()||!main||!host||host.querySelector('[data-fx]'))return false;const s=cache;
 const box=E('div',undefined,'fx-row');box.dataset.fx='1';
 const l2=E('label');l2.append('Importo nella seconda valuta ',exact('('+sign(s.second)+')'));const second=E('input');second.type='text';second.name='fx_amount2';second.inputMode='decimal';second.autocomplete='off';l2.append(second);
 const lr=E('label');lr.append('Cambio ',exact('(1 '+sign(s.currency)+' = … '+sign(s.second)+')'));const r=E('input');r.type='text';r.name='fx_rate';r.inputMode='decimal';r.autocomplete='off';lr.append(r);
 const startRate=deal&&Number(deal.exchange_rate)>0?Number(deal.exchange_rate):s.rate;r.value=shown(startRate);
 const hint=E('small',s.rate?'Scrivi uno dei due importi: l’altro si calcola con il cambio. Il cambio predefinito si cambia in Impostazioni › CRM.':'Imposta il cambio predefinito in Impostazioni › CRM, oppure scrivilo qui.','fx-hint');
 box.append(l2,lr,hint);host.append(box);
 const fromMain=()=>{const c=parse(main.value),x=rate(r.value);if(Number.isSafeInteger(c)&&x>0)second.value=fmt(toSecond(c,x));else if(c===null)second.value=''};
 const fromSecond=()=>{const c=parse(second.value),x=rate(r.value);if(Number.isSafeInteger(c)&&x>0){main.value=fmt(toMain(c,x));main.dispatchEvent(new Event('change',{bubbles:true}))}};
 if(deal&&deal.amount2_cents!=null)second.value=fmt(deal.amount2_cents);else fromMain();
 main.addEventListener('input',fromMain);second.addEventListener('input',fromSecond);r.addEventListener('input',fromMain);
 return true}
/* What a submitted form adds to the opportunity: {} when the workspace has one currency, {error} when a value is not
   readable, else {amount2_cents, exchange_rate} (null clears). */
function values(form){
 const second=form&&form.elements&&form.elements.fx_amount2,r=form&&form.elements&&form.elements.fx_rate;if(!active()||!second||!r)return {};
 const c=parse(second.value),x=rate(r.value);
 if(Number.isNaN(c)||(c!==null&&c>9000000000000))return {error:'Importo nella seconda valuta non valido: scrivi ad esempio 24.000 oppure 24.000,50.'};
 if(Number.isNaN(x))return {error:'Cambio non valido: scrivi un numero, ad esempio 1,15.'};
 return {amount2_cents:c,exchange_rate:c===null?null:x}}
// «€ 13.800 · cambio 1,15» for cards and panels, or null when the opportunity has no second amount.
function node(deal,cls,short){
 if(!active()||!deal||deal.amount2_cents==null)return null;
 const n=E('span',undefined,cls||'fx-second');n.append(exact(amount(deal.amount2_cents,cache.second)));
 if(!short&&Number(deal.exchange_rate)>0){n.append(' · ',E('span','cambio'),' ',exact(shown(deal.exchange_rate)))}return n}
root.RadixCrmFx={...core,load,settings,active,attach,values,node,amount,exact};
})(typeof globalThis!=='undefined'?globalThis:this);
