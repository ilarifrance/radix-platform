'use strict';
(function(root){
 const isEmail=s=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s||'').trim());
 const isSource=s=>/^https:\/\/[^/?#@\s]+\.[a-z]{2,}(?:[/?#]|$)/i.test(String(s||'').trim());
 function validate(entry,form){
  const errors=[],p=entry?.candidate||{};
  if(!p.name||!p.source||/Esempio RADIX/i.test(p.source)||/\.example$/i.test(p.domain||''))errors.push('Azienda o origine non verificata');
  if((entry?.reasons||[]).includes('Possibile duplicato'))errors.push('Duplicato da controllare');
  if(!isEmail(form.email))errors.push('Email non valida');
  if(!isSource(form.source))errors.push('Fonte HTTPS verificabile obbligatoria');
  if(!['consent','existing','legitimate'].includes(form.basis))errors.push('Base giuridica da documentare');
  if(form.basis==='legitimate'&&!String(form.notes||'').trim())errors.push('Motivare interesse legittimo');
  if(!form.checked||!form.privacy)errors.push('Verifica dati e privacy da confermare');
  return {ok:!errors.length,errors};
 }
 function makePlan(entry,draft,start,a,b){
  const d=new Date(start+'T12:00:00Z');a=Number(a);b=Number(b);
  if(!entry||!draft?.subject||!draft?.body||!/^\d{4}-\d{2}-\d{2}$/.test(start)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==start||!Number.isInteger(a)||!Number.isInteger(b)||a<1||b<=a||b>90)throw Error('Date o bozza non valide (intervalli crescenti fino a 90 giorni)');
  const date=n=>{const x=new Date(d);x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
  return [{date:date(0),step:'Primo messaggio',subject:draft.subject,body:draft.body},{date:date(a),step:'Follow-up 1',subject:'Re: '+draft.subject,body:'Buongiorno, riprendo la proposta relativa a '+entry.candidate.name+'. Resto a disposizione per un confronto.'},{date:date(b),step:'Follow-up 2',subject:'Re: '+draft.subject,body:'Buongiorno, un ultimo riscontro in merito a '+entry.candidate.name+'. Se non è di interesse, non invierò altri solleciti.'}];
 }
 function toCsv(rows,name,email){const cell=v=>{let s=String(v??'').replace(/[\r\n\t]+/g,' ').slice(0,2000);if(/^\s*[=+\-@\uFEFF]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};return '\uFEFF'+[['data','fase','azienda','email','oggetto','testo','stato'],...rows.map(r=>[r.date,r.step,name,email,r.subject,r.body,'bozza_non_inviata'])].map(row=>row.map(cell).join(';')).join('\r\n')+'\r\n'}
 const exports={validate,makePlan,toCsv};if(typeof module!=='undefined'&&module.exports)module.exports=exports;root.RadixOutreach=exports;
})(typeof window!=='undefined'?window:globalThis);
