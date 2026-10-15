'use strict';
const {randomUUID}=require('node:crypto'),B=require('../lib/lead-contact-batches');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(s){const e=new Error(s);e.status=400;throw e}
const exact=(o,fields)=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(x=>!fields.includes(x)))fail('Schema non valido');return o};
function payload(p){
 exact(p,['version','sourceUrl','records','batches','total','duplicates','last']);
 if(p.version!==1||!Array.isArray(p.records)||p.records.length>4000||!Array.isArray(p.batches)||p.batches.length>100)fail('Limite archivio superato');
 let source;try{source=B.start(p.sourceUrl).sourceUrl}catch{fail('Fonte HTTPS richiesta')}
 const records=p.records.map(r=>{exact(r,B.names);try{return B.person(r,source)}catch(e){fail(e.message)}});
 const seen=new Set(),batches=p.batches.map(b=>{
  exact(b,['id','signature']);
  if(typeof b.id!=='string'||!/^[a-zA-Z0-9_.-]{1,100}$/.test(b.id)||seen.has(b.id))fail('ID lotto duplicato/non valido');
  seen.add(b.id);
  if(typeof b.signature!=='string'||b.signature.length>300000)fail('Contenuto lotto non valido');
  return {id:b.id,signature:b.signature};
 });
 if(!Number.isSafeInteger(p.total)||p.total<records.length||p.total>100000||!Number.isSafeInteger(p.duplicates)||p.duplicates<0||p.total<records.length+p.duplicates)fail('Statistiche non valide');
 const result={version:1,sourceUrl:source,records,batches,total:p.total,duplicates:p.duplicates};
 if(Buffer.byteLength(JSON.stringify(result))>1500000){const e=new Error('Lavoro troppo grande: dividi in più lavori');e.status=413;throw e}
 return result;
}
function command(b){
 exact(b,['workspace','entity','action','data']);
 if(b.entity!=='lead_contact_jobs'||!UUID.test(b.workspace)||!['create','update','delete'].includes(b.action))fail('Comando non valido');
 const allowed=b.action==='delete'?['id','version']:b.action==='create'?['title','payload']:['id','version','title','payload'];
 exact(b.data,allowed);
 if(b.action!=='create'&&(!UUID.test(b.data.id)||!Number.isInteger(b.data.version)||b.data.version<1))fail('ID e versione richiesti');
 if(b.action==='delete')return b;
 if(typeof b.data.title!=='string'||!b.data.title.trim()||b.data.title.length>120)fail('Titolo non valido');
 return {...b,data:{...b.data,title:b.data.title.trim(),payload:payload(b.data.payload),...(b.action==='create'?{id:randomUUID()}:{})}};
}
module.exports={command,payload};
