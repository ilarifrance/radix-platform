'use strict';
// GET /api/integrations/status — which external services have their key configured on this deployment.
// Booleans only: no value, length or prefix of any secret ever leaves the server. "Configured" means
// the key exists, not that the provider accepted it; each service still checks on first real use.
const auth=require('./_auth');
const SERVICES=Object.freeze([
 {id:'anthropic',label:'Agenti AI (Anthropic)',use:'Chat e orchestratori degli agenti',env:['ANTHROPIC_API_KEY']},
 {id:'database',label:'Database RADIX',use:'Registro, memoria del team, approvazioni',env:['DATABASE_URL']},
 {id:'buffer',label:'Buffer',use:'Coda di pubblicazione del PED',env:['BUFFER_ACCESS_TOKEN']},
 {id:'blob',label:'Archivio immagini pubblico (Vercel Blob)',use:'Immagini del PED raggiungibili da Buffer anche in anteprima',env:['BLOB_READ_WRITE_TOKEN']},
 {id:'openai-image',label:'Immagini (OpenAI)',use:'Sfondi delle slide dei caroselli',env:['OPENAI_API_KEY']},
 {id:'heygen',label:'HeyGen',use:'Video con avatar',env:['HEYGEN_API_KEY']},
 {id:'email',label:'Email (Gmail)',use:'Invio email dagli agenti commerciali',env:['GMAIL_USER','GMAIL_APP_PASSWORD']},
 {id:'higgsfield',label:'Higgsfield',use:'Generazione di immagini e video per Agency e PED',env:['HIGGSFIELD_API_KEY']},
 {id:'vercel-sites',label:'Siti online (Vercel)',use:'«Metti online il sito» dallo Studio Sito',env:['VERCEL_SITES_TOKEN']},
 {id:'captain-data',label:'Captain Data',use:'Verifica dei lead in Lead Intelligence',env:['CAPTAIN_DATA_API_KEY','CAPTAIN_DATA_USER_UID']},
 {id:'hunter',label:'Hunter',use:'«Trova email» nel CRM (primo servizio a pagamento)',env:['HUNTER_API_KEY']},
 {id:'apollo',label:'Apollo.io',use:'«Trova email» nel CRM (secondo servizio a pagamento)',env:['APOLLO_API_KEY']},
 {id:'dropcontact',label:'Dropcontact',use:'«Trova email» nel CRM (ultimo servizio a pagamento)',env:['DROPCONTACT_API_KEY']}
]);
function status(env){
 return SERVICES.map(s=>({id:s.id,label:s.label,use:s.use,configured:s.env.every(k=>typeof env[k]==='string'&&env[k].trim()!=='')}));
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!auth.getSessionUser(req))return res.status(401).json({error:'Accesso RADIX richiesto'});
 if(req.method!=='GET')return res.status(405).json({error:'Metodo non consentito'});
 return res.status(200).json({items:status(process.env),environment:process.env.VERCEL_ENV||'local'});
};
module.exports.status=status;
module.exports.SERVICES=SERVICES;
