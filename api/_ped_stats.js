'use strict';
/* PED «Risultati» over time: once a day the numbers of every post RADIX sent to Buffer in the last 45 days are read
   from Buffer and stored as one row per post and day in rx_post_stats. Run by Vercel Cron (/api/integrations/ped-stats,
   «Authorization: Bearer <CRON_SECRET>») and, for one project, by the PED page when its numbers are older than a day
   (POST /api/workspace?resource=poststats). Reading Buffer numbers costs nothing. */
const pedResults=require('../lib/ped-results.js');
const DAYS_BACK=45;

// The latest version sent of each content, already out (due time passed) and not older than DAYS_BACK.
async function sentPosts(db,{projectId=null,now=Date.now()}={}){
 const since=new Date(now-DAYS_BACK*86400000).toISOString(),until=new Date(now).toISOString();
 return projectId
  ?db`SELECT DISTINCT ON (project_id,content_id) project_id,content_id,post_id,due_at FROM rx_publications
     WHERE project_id=${projectId} AND service='buffer' AND status='queued' AND post_id IS NOT NULL AND due_at BETWEEN ${since} AND ${until}
     ORDER BY project_id,content_id,revision DESC`
  :db`SELECT DISTINCT ON (project_id,content_id) project_id,content_id,post_id,due_at FROM rx_publications
     WHERE service='buffer' AND status='queued' AND post_id IS NOT NULL AND due_at BETWEEN ${since} AND ${until}
     ORDER BY project_id,content_id,revision DESC`;
}

// One reading per post and day: a second run on the same day replaces the first with the newer numbers.
// A post Buffer returns without any number (not read yet, or a network that gives none) is not stored.
async function collect(db,{apiKey,postStats,projectId=null,now=Date.now()}){
 const rows=await sentPosts(db,{projectId,now});
 if(!rows.length)return {posts:0,saved:0,empty:0,errors:[]};
 const {items,errors}=await postStats(apiKey,rows.map(r=>String(r.post_id)));
 const byPost=new Map(items.map(i=>[String(i.postId),i])),day=new Date(now).toISOString().slice(0,10);
 let saved=0,empty=0;
 for(const r of rows){
  const it=byPost.get(String(r.post_id));if(!it)continue;
  if(pedResults.METRICS.every(k=>it.metrics[k]==null)){empty++;continue}
  const published=it.publishedAt||(r.due_at instanceof Date?r.due_at.toISOString():r.due_at)||null;
  await db`INSERT INTO rx_post_stats(project_id,content_id,service,post_id,day,published_at,link,metrics,engagement_rate)
   VALUES(${r.project_id},${r.content_id},'buffer',${String(r.post_id)},${day},${published},${it.link||null},${JSON.stringify(it.metrics)}::jsonb,${it.engagementRate==null?null:it.engagementRate})
   ON CONFLICT (project_id,content_id,post_id,day) DO UPDATE SET metrics=EXCLUDED.metrics,engagement_rate=EXCLUDED.engagement_rate,link=EXCLUDED.link,published_at=EXCLUDED.published_at,fetched_at=now()`;
  saved++;
 }
 return {posts:rows.length,saved,empty,errors:errors.slice(0,5)};
}

// The readings of one project, oldest first, for the page (60 days is more than DAYS_BACK plus the 30-day age).
async function readings(db,projectId){
 return db`SELECT content_id,post_id,day,published_at,link,metrics,engagement_rate::float AS engagement_rate,fetched_at FROM rx_post_stats
  WHERE project_id=${projectId} AND fetched_at > now() - interval '80 days' ORDER BY fetched_at LIMIT 5000`;
}

function createHandler({getSql=()=>require('./_db').sql(),env=process.env,postStats=(k,ids)=>require('./_buffer').postStats(k,ids),authorized=require('./_sales_send_worker').authorized}={}){
 return async function(req,res){
  res.setHeader('Cache-Control','no-store');
  const ok=authorized(req,env);
  if(ok===null)return res.status(503).json({error:'Raccolta risultati non attiva: manca CRON_SECRET nelle variabili d’ambiente.'});
  if(!ok)return res.status(401).json({error:'Non autorizzato.'});
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Metodo non consentito.'})}
  if(!env.BUFFER_ACCESS_TOKEN)return res.status(503).json({error:'Buffer non collegato: manca BUFFER_ACCESS_TOKEN.'});
  try{return res.status(200).json({ok:true,...await collect(getSql(),{apiKey:env.BUFFER_ACCESS_TOKEN,postStats})})}
  catch(e){console.error('ped stats failed',e&&(e.status||e.code));return res.status(502).json({ok:false,error:'Lettura dei risultati da Buffer non riuscita in questo giro.'})}
 };
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
module.exports.collect=collect;
module.exports.readings=readings;
module.exports.sentPosts=sentPosts;
