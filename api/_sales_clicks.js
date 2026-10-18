'use strict';
/* Click tracking for CRM campaign emails. Each link in a campaign email is rewritten to
   /api/sales?click=<token>&k=<campaign>&u=<url>: opening it records the click and redirects to the url.
   The token signs workspace + contact + campaign + url, so the redirect can only lead where the email
   already pointed (no open redirect) and nobody can count clicks for someone else.
   The first click of a contact on a campaign also lands in the CRM timeline as an «email» interaction
   (so score and Sales Orbit see it) and opens a high-priority follow-up task for whoever last emailed
   that contact (otherwise whoever created the contact, otherwise the workspace owner). A failed write still redirects. */
const crypto=require('node:crypto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_URL=2000,MAX_CAMPAIGN=80;
const key=secret=>{if(typeof secret!=='string'||secret.length<16)throw new Error('JWT_SECRET is not set in the environment.');return crypto.createHmac('sha256',secret).update('radix-crm-click-v1').digest()};
const toBytes=u=>Buffer.from(u.replace(/-/g,''),'hex');
const toUuid=b=>{const h=b.toString('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20)};
const validUrl=u=>{if(typeof u!=='string'||!u||u.length>MAX_URL||/[\u0000-\u0020\u007f]/.test(u))return false;try{const x=new URL(u);return (x.protocol==='https:'||x.protocol==='http:')&&!x.username&&!x.password}catch{return false}};
const validCampaign=k=>typeof k==='string'&&k.trim().length>0&&k.length<=MAX_CAMPAIGN&&!/[\u0000-\u001f\u007f]/.test(k);
const mac=(secret,ids,campaign,url)=>crypto.createHmac('sha256',key(secret)).update(Buffer.concat([ids,Buffer.from('\n'+campaign+'\n'+url)])).digest().subarray(0,16);
function sign(secret,workspace,contact,campaign,url){
 if(!UUID.test(workspace)||!UUID.test(contact)||!validCampaign(campaign)||!validUrl(url))throw new Error('invalid click link');
 const ids=Buffer.concat([toBytes(workspace),toBytes(contact)]);
 return Buffer.concat([ids,mac(secret,ids,campaign,url)]).toString('base64url');
}
function verify(secret,token,campaign,url){
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{64}$/.test(token)||!validCampaign(campaign)||!validUrl(url))return null;
 const raw=Buffer.from(token,'base64url');if(raw.length!==48)return null;
 const ids=raw.subarray(0,32);
 if(!crypto.timingSafeEqual(mac(secret,ids,campaign,url),raw.subarray(32)))return null;
 return {workspace:toUuid(ids.subarray(0,16)),contact:toUuid(ids.subarray(16))};
}
const one=v=>Array.isArray(v)?undefined:v;
async function handle(req,res,{getSql,secret}){
 res.setHeader('Referrer-Policy','no-referrer');
 const q=req.query||{},campaign=one(q.k),url=one(q.u);
 let who=null;try{who=verify(secret,one(q.click),campaign,url)}catch{who=null}
 if(!who){res.setHeader('Content-Type','text/plain; charset=utf-8');return res.status(400).send('Link non valido o incompleto.')}
 // Link scanners often probe with HEAD: redirect without counting.
 if(req.method==='GET'){
  try{
   await getSql()(`WITH c AS (SELECT id,company_id,name,created_by FROM sales_contacts WHERE workspace_id=$1 AND id=$2),
 first AS (SELECT NOT EXISTS(SELECT 1 FROM sales_email_clicks WHERE workspace_id=$1 AND contact_id=$2 AND campaign=$3) AS yes),
 ins AS (INSERT INTO sales_email_clicks(workspace_id,contact_id,campaign,url) SELECT $1,c.id,$3,$4 FROM c RETURNING 1),
 task AS (INSERT INTO sales_tasks(workspace_id,id,title,contact_id,company_id,assignee_id,priority,status,due_at)
  SELECT $1,gen_random_uuid(),left('Richiama '||c.name||': ha cliccato «'||$3||'»',200),c.id,c.company_id,
   COALESCE((SELECT i.created_by FROM sales_interactions i JOIN sales_memberships m ON m.workspace_id=i.workspace_id AND m.user_id=i.created_by AND m.role IN ('owner','admin','member')
    WHERE i.workspace_id=$1 AND i.contact_id=$2 AND i.kind='email' AND i.created_by IS NOT NULL ORDER BY i.occurred_at DESC LIMIT 1),
    (SELECT m.user_id FROM sales_memberships m WHERE m.workspace_id=$1 AND m.user_id=c.created_by AND m.role IN ('owner','admin','member')),
    (SELECT m.user_id FROM sales_memberships m WHERE m.workspace_id=$1 AND m.role='owner' ORDER BY m.user_id LIMIT 1)),
   'high','todo',now()+interval '1 day' FROM c,first WHERE first.yes RETURNING 1)
 INSERT INTO sales_interactions(workspace_id,id,title,kind,occurred_at,body,contact_id,company_id)
 SELECT $1,gen_random_uuid(),left('Clic sull’email: '||$3,200),'email',now(),left('Ha aperto il link '||$4,4000),c.id,c.company_id FROM c,first WHERE first.yes`,[who.workspace,who.contact,campaign,url]);
  }catch(e){console.error('click tracking failed',e&&e.code)}
 }
 res.setHeader('Location',url);return res.status(302).end();
}
// Tracked links for the contacts of one workspace: {contactId:[token per url, same order]}.
async function links(sql,workspace,ids,campaign,urls,secret){
 const rows=await sql('SELECT id FROM sales_contacts WHERE workspace_id=$1 AND id=ANY($2::uuid[])',[workspace,ids]);
 return Object.fromEntries(rows.map(r=>[r.id,urls.map(u=>sign(secret,workspace,r.id,campaign,u))]));
}
// Per campaign: clicks, people who clicked, last click; who clicked most recently; every contact who ever clicked (segments).
// rows repeats people because the CRM client rejects GET answers without rows.
async function report(sql,workspace){
 const [campaigns,people,contacts]=await Promise.all([
  sql('SELECT campaign,count(*)::int AS clicks,count(DISTINCT contact_id)::int AS people,max(clicked_at) AS last_at FROM sales_email_clicks WHERE workspace_id=$1 GROUP BY campaign ORDER BY max(clicked_at) DESC LIMIT 50',[workspace]),
  sql('SELECT k.contact_id,c.name,k.campaign,count(*)::int AS clicks,max(k.clicked_at) AS last_at FROM sales_email_clicks k JOIN sales_contacts c ON c.workspace_id=k.workspace_id AND c.id=k.contact_id WHERE k.workspace_id=$1 GROUP BY k.contact_id,c.name,k.campaign ORDER BY max(k.clicked_at) DESC LIMIT 100',[workspace])
,
  sql('SELECT DISTINCT contact_id FROM sales_email_clicks WHERE workspace_id=$1 LIMIT 5000',[workspace])
 ]);
 return {rows:people,campaigns,people,contacts:contacts.map(r=>r.contact_id)};
}
module.exports={sign,verify,handle,links,report,validUrl,validCampaign,MAX_CAMPAIGN};
