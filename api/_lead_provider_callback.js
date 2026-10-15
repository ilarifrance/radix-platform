'use strict';
const {timingSafeEqual}=require('node:crypto');
const R=require('../lib/lead-provider-callback');
const P=require('../lib/lead-provider-contacts');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(status,message)=>{const e=new Error(message);e.status=status;throw e};
async function receive(req,store,env=process.env){
 if(env.VERCEL_ENV==='production')fail(503,'Callback disabilitati in produzione');
 const expected=env.CAPTAIN_DATA_CALLBACK_SECRET,provided=req.headers?.['x-radix-provider-token'];
 if(typeof expected!=='string'||expected.length<32)fail(503,'Segreto callback Preview non configurato');
 if(typeof provided!=='string'||Buffer.byteLength(provided)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))fail(403,'Callback non autorizzato');
 if(req.method!=='POST'||!/application\/json/i.test(req.headers?.['content-type']||''))fail(405,'Metodo callback non valido');
 if(!UUID.test(req.query?.workspace||'')||!UUID.test(req.query?.job||''))fail(400,'Destinazione callback non valida');
 const bytes=Buffer.byteLength(JSON.stringify(req.body||{}));
 if(bytes>1000000)fail(413,'Lotto callback troppo grande');
 const event=R.read(req.body);
 if(!event||!req.body?.run?.run_uid)fail(400,'Evento provider non riconosciuto');
 let records;try{records=P.convert(event.raw,'')}catch(e){fail(400,'Dati contatti non validi: '+e.message)}
 return store.leadContactJobs.receive(req.query.workspace,req.query.job,req.body.run.run_uid,records,event.id);
}
module.exports={receive};
