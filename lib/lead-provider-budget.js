'use strict';
// Deterministic request quota, independent of provider price/subscription terms.
function status(saved,utcDate,limit){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(utcDate)||!Number.isSafeInteger(limit)||limit<0||limit>100)throw Error('Limite richieste non valido');
 if(saved?.day&&saved.day>utcDate)throw Error('Orologio spostato indietro: quota bloccata');
 const used=saved&&saved.day===utcDate&&Number.isSafeInteger(saved.used)&&saved.used>=0?saved.used:0;
 return {day:utcDate,limit,used,remaining:Math.max(0,limit-used)};
}
function reserve(saved,utcDate,limit){const result=status(saved,utcDate,limit);if(!limit||result.used>=limit)throw Error('Limite giornaliero Brave esaurito o disattivato');return {day:utcDate,used:result.used+1}}
module.exports={status,reserve};
