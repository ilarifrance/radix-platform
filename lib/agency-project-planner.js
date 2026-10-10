'use strict';
const ALLOWED_CHANNELS=['social','web','seo-geo','paid','email','video','analytics'];
const CHANNEL_ROLES={social:['strategist','copywriter','social-media-manager','orchestrator'],web:['web-developer','web-content','art-director'],'seo-geo':['seo-geo','web-content','analytics'],paid:['paid-media','copywriter','art-director','analytics'],email:['copywriter','web-content','analytics'],video:['video-producer','art-director','copywriter'],analytics:['analytics','strategist']};
function normalizeBrief(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw TypeError('Brief required');
 const pick=(k,n)=>typeof input[k]==='string'?input[k].trim().slice(0,n):'';
 const name=pick('name',120),goal=pick('goal',1000),audience=pick('audience',500);
 if(!name||!goal||!audience)throw TypeError('Name, goal and audience required');
 if(!Array.isArray(input.channels)||!input.channels.length||input.channels.some(x=>!ALLOWED_CHANNELS.includes(x)))throw TypeError('Valid channel required');
 const budget=input.budget==null||input.budget===''?null:Number(input.budget);
 if(budget!==null&&(!Number.isFinite(budget)||budget<0||budget>1e9))throw TypeError('Invalid budget');
 return {name,goal,audience,industry:pick('industry',120),market:pick('market',120),brandRules:pick('brandRules',2000),constraints:pick('constraints',2000),budget,channels:[...new Set(input.channels)]};
}
function buildPlan(input,roles){
 const brief=normalizeBrief(input),known=new Set(Object.keys(roles||{}));
 const tasks=[{id:'brief',title:'Validazione brief',agents:['marketing-orchestrator'],gate:'brief_review'},
 {id:'research',title:'Ricerca con fonti',agents:['brand-strategist','strategist']},
 {id:'strategy',title:'Strategia e KPI proposti',agents:['marketing-orchestrator','strategist'],gate:'strategy_approval'},
 ...brief.channels.map(ch=>({id:'produce-'+ch,title:'Produzione '+ch,channel:ch,agents:CHANNEL_ROLES[ch],gate:ch==='social'?'per_post_revision':null})),
 {id:'review',title:'Revisione deliverable',agents:['marketing-orchestrator'],gate:'exact_revision'},
 {id:'distribution',title:'Azioni esterne soggette ad approvazione',agents:['marketing-orchestrator'],gate:'external_action'},
 {id:'measurement',title:'Metriche da fonti verificate',agents:['analytics']}];
 return {schemaVersion:1,mode:'proposal_only',brief,tasks:tasks.map((t,i)=>({...t,order:i+1,state:'proposed',automated:false,assignedRoles:t.agents.filter(x=>known.has(x)),missingRoles:t.agents.filter(x=>!known.has(x))})),execution:{status:'not_started',providerConnected:false}};
}
module.exports={ALLOWED_CHANNELS,CHANNEL_ROLES,normalizeBrief,buildPlan};