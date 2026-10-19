'use strict';
const {randomUUID}=require('node:crypto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const err=(message,status=400)=>{const e=new Error(message);e.status=status;throw e};
function only(v,names,label){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!names.includes(k)))err(label+' non valido');return v}
function str(v,max,label){if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))err(label+' non valido (max '+max+')');return v.trim()}
function group(p,shape,name){only(p,Object.keys(shape),name);const o={};for(const [k,n] of Object.entries(shape))o[k]=str(p[k],n,name+'/'+k);return o}
function secureUrl(u,label){if(!u)return u;let v;try{v=new URL(u)}catch{err(label+' URL non valido')}if(v.protocol!=='https:'||v.username||v.password||u.length>500)err(label+' deve essere HTTPS');return u}
const parts={
 company:{name:200,website:500,industry:200,description:1800},
 icp:{geos:500,titles:500,industries:500,companySize:300},
 offer:{core:1800,differentiators:1800,proof:1800},
 sending:{domains:500,mailboxes:600,provider:120},
 linkedin:{profileUrl:500},
 calendars:{bookingUrl:500,demoUrl:500}
};
const campaignFields={id:36,title:120,stage:30,channel:30,segment:200,goal:600,notes:2000,creditBudget:8};
function payload(p){
 only(p,['version','company','icp','offer','sending','linkedin','calendars','campaigns','state'],'Progetto commerciale');
 if(p.version!==1)err('Versione modello non valida');
 const o={version:1};
 for(const [k,shape] of Object.entries(parts))o[k]=group(p[k],shape,k);
 for(const [k,label] of [['website','Sito aziendale'],['profileUrl','Profilo LinkedIn']])secureUrl(k==='website'?o.company[k]:o.linkedin[k],label);
 for(const k of ['bookingUrl','demoUrl'])secureUrl(o.calendars[k],k);
 if(!Array.isArray(p.campaigns)||p.campaigns.length>30)err('Massimo 30 campagne per progetto');
 const ids=new Set();
 o.campaigns=p.campaigns.map(c=>{
  const v=group(c,campaignFields,'Campagna');
  if(!UUID.test(v.id)||ids.has(v.id))err('ID campagna non valido o duplicato');ids.add(v.id);
  if(v.title.length<2)err('Titolo campagna richiesto');
  if(!['draft','ready','paused'].includes(v.stage))err('Stato campagna non valido');
  if(!['email','linkedin','multichannel','manual'].includes(v.channel))err('Canale campagna non valido');
  if(!/^\d{1,8}$/.test(v.creditBudget)||Number(v.creditBudget)>1000000)err('Budget crediti non valido');
  return v;
 });
 if(!['draft','ready'].includes(p.state))err('Stato progetto non valido');
 o.state=p.state;
 if(o.state==='ready'&&(!o.company.name||!o.icp.titles&&!o.icp.industries||!o.offer.core))err('Per completare il progetto servono azienda, ICP e offerta');
 if(Buffer.byteLength(JSON.stringify(o))>120000)err('Progetto troppo grande',413);
 return o;
}
function command(body){
 only(body,['workspace','entity','action','data'],'Comando');
 if(!UUID.test(body.workspace)||body.entity!=='lead_growth_projects'||!['create','update','delete'].includes(body.action))err('Comando non valido');
 const d=body.data;
 if(body.action==='delete'){
  only(d,['id','version'],'Eliminazione');if(!UUID.test(d.id)||!Number.isInteger(d.version)||d.version<1)err('Identificativo o versione non validi');
  return body;
 }
 only(d,body.action==='create'?['title','payload']:['title','payload','id','version'],'Progetto');
 const title=str(d.title,120,'Titolo progetto');
 if(title.length<2)err('Titolo progetto minimo 2 caratteri');
 if(body.action==='update'&&(!UUID.test(d.id)||!Number.isInteger(d.version)||d.version<1||d.version>2147483646))err('Identificativo o versione non validi');
 return {...body,data:{...d,title,payload:payload(d.payload),...(body.action==='create'?{id:randomUUID()}:{})}};
}
module.exports={payload,command,parts};
