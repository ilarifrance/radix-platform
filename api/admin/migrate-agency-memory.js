// Explicit, admin-only Agency memory migration. Never runs automatically on Preview.
const { sql } = require('../_db');
const { isAdminRequest } = require('../_auth');
module.exports = async (req,res)=>{
 if(req.method!=='POST')return res.status(405).json({error:'Usa POST'});
 if(!isAdminRequest(req))return res.status(401).json({error:'Autorizzazione admin richiesta'});
 try{
 const db=sql();
 await db`CREATE TABLE IF NOT EXISTS agency_memory (
   id UUID PRIMARY KEY,
   owner_id TEXT NOT NULL,
   level TEXT NOT NULL CHECK (level IN ('agency','client','project','agent','shared')),
   kind TEXT NOT NULL CHECK (kind IN ('fact','decision','preference','feedback','outcome','handoff')),
   status TEXT NOT NULL CHECK (status IN ('proposed','confirmed')),
   project_id TEXT NOT NULL DEFAULT '',
   client_id TEXT NOT NULL DEFAULT '',
   agent_id TEXT NOT NULL DEFAULT '',
   title VARCHAR(140) NOT NULL,
   content TEXT NOT NULL,
   source VARCHAR(200) NOT NULL,
   revision INTEGER NOT NULL DEFAULT 1,
   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   CONSTRAINT agency_memory_revision_positive CHECK (revision > 0)
 )`;
 await db`CREATE INDEX IF NOT EXISTS agency_memory_owner_context_idx ON agency_memory(owner_id, project_id, client_id, updated_at DESC)`;
 res.status(200).json({ok:true,message:'Schema memoria Agency verificato'});
 }catch(e){res.status(500).json({error:'Migrazione memoria non riuscita'});}
};
