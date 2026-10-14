'use strict';
const {randomUUID}=require('node:crypto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES=190000,MAX_PROSPECTS=250;
const fail=(status,message)=>{const err=new Error(message);err.status=status;throw err};
const object=x=>Boolean(x)&&typeof x==='object'&&!Array.isArray(x);
const text=(x,n,label,required=false)=>{
 if(typeof x!=='string'||x.length>n||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x)||(required&&!x.trim()))fail(400,label+' non valido.');
 return x;
};
const keys=(x,allowed,label)=>{if(!object(x)||Object.keys(x).some(k=>!allowed.includes(k)))fail(400,label+' non valido.');return x};
const integer=(n,max,label)=>{if(!Number.isInteger(n)||n<0||n>max)fail(400,label+' non valido.');return n};
const uuid=x=>typeof x==='string'&&UUID.test(x);
const fields=['name','domain','country','industry','companySize','contactRole','source'];
function payload(raw){
 keys(raw,['icp','prospects','reviews'],'Archivio');
 const icp=keys(raw.icp,['country','industry','size','role'],'ICP');
 for(const k of ['country','industry','size','role'])text(icp[k],400,'Criterio ICP');
 if(!Array.isArray(raw.prospects)||raw.prospects.length>MAX_PROSPECTS)fail(400,'Massimo 250 prospect per lista.');
 const prospects=raw.prospects.map(p=>{
  keys(p,fields,'Prospect');
  for(const f of fields)text(p[f],f==='source'?500:250,'Campo prospect');
  if(!p.name.trim()&&!p.domain.trim())fail(400,'Prospect privo di azienda e dominio.');
  if(/Esempio RADIX/i.test(p.source)||/\.example$/i.test(p.domain))fail(400,'Dati dimostrativi non archiviabili.');
  return p;
 });
 if(!Array.isArray(raw.reviews)||raw.reviews.length>MAX_PROSPECTS)fail(400,'Revisioni non valide.');
 const unique=new Set();
 const reviews=raw.reviews.map(r=>{
  keys(r,['index','contact','email','source','basis','notes','checked','privacy','draft','plan'],'Revisione');
  integer(r.index,MAX_PROSPECTS-1,'Indice');if(r.index>=prospects.length||unique.has(r.index))fail(400,'Revisione duplicata o senza prospect.');
  unique.add(r.index);
  for(const [f,n] of [['contact',160],['email',254],['source',500],['notes',2000]])text(r[f],n,'Revisione '+f);
  if(!['consent','existing','legitimate'].includes(r.basis)||r.checked!==true||r.privacy!==true||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email) || !/^https:\/\/[^/?#@\s]+\.[a-z]{2,}/i.test(r.source)||
    r.basis==='legitimate'&&!r.notes.trim())fail(400,'Revisione non approvata o incompleta.');
  if(!prospects[r.index].source||/\.example/i.test(prospects[r.index].domain))fail(400,'Fonte prospect non verificabile.');
  if(r.draft!==null){
   keys(r.draft,['subject','body'],'Bozza');
   text(r.draft.subject,200,'Oggetto',true);text(r.draft.body,3000,'Corpo',true);
  }
  if(!Array.isArray(r.plan)||!(r.plan.length===0||r.plan.length===3)||r.plan.length&&r.draft===null)fail(400,'Sequenza non valida.');
  r.plan.forEach((p,i)=>{
   keys(p,['date','step','subject','body'],'Tappa');
   if(typeof p.date!=='string'||! /^\d{4}-\d{2}-\d{2}$/.test(p.date)||Number.isNaN(Date.parse(p.date+'T00:00:00Z'))||new Date(p.date+'T00:00:00Z').toISOString().slice(0,10)!==p.date)fail(400,'Data non valida.');
   text(p.step,60,'Fase',true);text(p.subject,200,'Oggetto',true);text(p.body,3000,'Corpo',true);
   if(i>0&&p.date<=r.plan[i-1].date)fail(400,'Date sequenza non crescenti.');
  });
  return r;
 });
 if(Buffer.byteLength(JSON.stringify(raw))>MAX_BYTES)fail(413,'Lista troppo grande: dividi i prospect in più liste.');
 return {icp,prospects,reviews};
}
function command(body){
 keys(body,['workspace','entity','action','data'],'Comando');
 if(body.entity!=='lead_lists'||!uuid(body.workspace)||!['create','update','delete'].includes(body.action))fail(400,'Comando archivio non valido.');
 const data=body.data;
 if(body.action==='delete'){
  keys(data,['id','version'],'Eliminazione');
  if(!uuid(data.id))fail(400,'ID lista non valido.');
  integer(data.version,2147483646,'Versione');if(data.version<1)fail(400,'Versione non valida.');
  return {workspace:body.workspace,entity:'lead_lists',action:'delete',data};
 }
 keys(data,body.action==='create'?['title','payload']:['id','version','title','payload'],'Lista');
 const title=text(data.title,120,'Nome lista',true).trim();
 if(body.action==='update'&&(!uuid(data.id)||!Number.isInteger(data.version)||data.version<1||data.version>2147483646))fail(400,'ID o versione non validi.');
 const document=payload(data.payload);
 return {workspace:body.workspace,entity:'lead_lists',action:body.action,data:{...data,title,payload:document,...(body.action==='create'?{id:randomUUID()}:{} )}};
}
module.exports={command,payload,uuid,MAX_BYTES,MAX_PROSPECTS};
