'use strict';
// /api/booking — Ciuffo (shop agenda, public «Prenota» page, assistant on WhatsApp and phone).
// Logic in api/_booking.js and api/_booking_assistant.js, slots in lib/booking/slots.js.
// Body parsing is off: the Meta webhook signature is computed on the exact bytes received, so the body is read
// here once, kept as req.rawBody, and parsed as JSON or as a form (Twilio).
const {createHandler,getOwner}=require('./_booking');
const getStore=()=>{const sql=require('./_db').sql();return {
 json:async(text,params)=>{const rows=await sql(text,params||[]);return rows[0]?rows[0].v??null:null;},
 tx:queries=>sql.transaction(queries.map(([t,p])=>sql(t,p)))};};
const handler=createHandler({getOwner,getStore});
async function readBody(req){
 const chunks=[];let n=0;for await(const c of req){n+=c.length;if(n>1000000){const e=new Error('Richiesta troppo grande.');e.status=413;throw e;}chunks.push(Buffer.from(c));}
 return Buffer.concat(chunks);
}
module.exports=async function(req,res){
 if(req.method!=='GET'&&req.method!=='HEAD'&&req.body===undefined){
  try{
   const raw=await readBody(req);req.rawBody=raw;const type=String((req.headers||{})['content-type']||'');
   if(/application\/x-www-form-urlencoded/i.test(type))req.body=Object.fromEntries(new URLSearchParams(raw.toString('utf8')));
   else req.body=raw.length?raw.toString('utf8'):undefined;
  }catch(e){res.setHeader('Cache-Control','no-store');return res.status(e.status||400).json({error:e.status?e.message:'Richiesta non leggibile.'});}
 }
 return handler(req,res);
};
module.exports.config={api:{bodyParser:false}};
