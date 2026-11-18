/* Ciuffo — small helpers shared by the pages: API calls and Italian date/money formats. */
(function(){
 'use strict';
 async function api(method,params,body){
  const url='/api/booking'+(method==='GET'?'?'+new URLSearchParams(params).toString():'');
  const r=await fetch(url,{method,credentials:'same-origin',headers:method==='GET'?{}:{'Content-Type':'application/json','x-ciuffo':'1'},body:method==='GET'?undefined:JSON.stringify(body)});
  let j={};try{j=await r.json();}catch{}
  if(!r.ok){const e=new Error(j.error||'Servizio non disponibile in questo momento.');e.status=r.status;throw e;}
  return j;
 }
 const TZ='Europe/Rome';
 const fmt=(o)=>new Intl.DateTimeFormat('it-IT',{timeZone:TZ,...o});
 const day=(d)=>fmt({weekday:'long',day:'numeric',month:'long'}).format(new Date(d.length===10?d+'T12:00:00Z':d));
 const dayShort=(d)=>{const x=new Date(d+'T12:00:00Z');return {wd:fmt({weekday:'short'}).format(x).replace('.',''),n:fmt({day:'numeric'}).format(x),m:fmt({month:'short'}).format(x).replace('.','')};};
 const time=(iso)=>fmt({hour:'2-digit',minute:'2-digit'}).format(new Date(iso));
 const money=(c)=>c==null?'':new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',minimumFractionDigits:c%100?2:0}).format(c/100);
 const dur=(m)=>m<60?m+' min':(Math.floor(m/60)+' h'+(m%60?' '+(m%60)+' min':''));
 const esc=(s)=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const tel=(p)=>{if(!p)return '';const m=/^\+39(3\d{2})(\d{3})(\d{3,4})$/.exec(p);return m?m[1]+' '+m[2]+' '+m[3]:p.replace(/^\+39/,'');};
 window.Ciuffo={api,day,dayShort,time,money,dur,esc,tel,TZ};
})();
