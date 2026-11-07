'use strict';
/* Opt-out and reply signals of a CRM contact, as SQL fragments over an alias of sales_contacts.
   Opted out when any of these holds (sales/crm-prospecting-core.js has the same rule for notes):
   - its notes mention «Disiscrizione» (the unsubscribe link writes «Disiscrizione dalle email commerciali tramite link: …»,
     a user can write one by hand when someone asks by reply or phone);
   - its timeline has a note titled «Disiscrizione…» (written by the unsubscribe link: it survives edits to the notes);
   - another contact of the workspace with the same address is opted out;
   - its address is in «Indirizzi disiscritti» (sales_email_suppressions, migration sales 017): the permanent list, by hash,
     that survives deleting the contact or importing it again.
   Reply signal: the newest interaction of the contact that is not an outbound email («Email: …», recorded by every send)
   nor the opt-out note itself. RADIX does not read the inbox: a reply counts once someone logs it on the contact. */
const crypto=require('node:crypto');

// «Indirizzi disiscritti»: an address is kept only as the SHA-256 (hex) of the address trimmed and lower-cased.
// HASH_SQL is the same function in Postgres, so the server can hash a contact's address without reading it.
const normalEmail=e=>String(e==null?'':e).trim().toLowerCase();
const emailHash=e=>{const n=normalEmail(e);return n?crypto.createHash('sha256').update(n,'utf8').digest('hex'):null};
const HASH_SQL=x=>`encode(sha256(convert_to(lower(btrim(${x})),'UTF8')),'hex')`;
const HASH=/^[0-9a-f]{64}$/;
const REASONS=Object.freeze(['unsubscribe','bounce','complaint','manual']);
const SUPPRESSED=t=>`(nullif(btrim(${t}.email),'') IS NOT NULL AND EXISTS(SELECT 1 FROM sales_email_suppressions os WHERE os.workspace_id=${t}.workspace_id AND os.email_hash=${HASH_SQL(t+'.email')}))`;

const OPTED_OUT=t=>`(coalesce(${t}.notes,'') ILIKE '%disiscrizione%'
 OR EXISTS(SELECT 1 FROM sales_interactions oi WHERE oi.workspace_id=${t}.workspace_id AND oi.contact_id=${t}.id AND oi.title ILIKE 'Disiscrizione%')
 OR (nullif(btrim(${t}.email),'') IS NOT NULL AND EXISTS(SELECT 1 FROM sales_contacts oc WHERE oc.workspace_id=${t}.workspace_id AND oc.id<>${t}.id AND lower(btrim(oc.email))=lower(btrim(${t}.email))
   AND (coalesce(oc.notes,'') ILIKE '%disiscrizione%' OR EXISTS(SELECT 1 FROM sales_interactions oj WHERE oj.workspace_id=oc.workspace_id AND oj.contact_id=oc.id AND oj.title ILIKE 'Disiscrizione%'))))
 OR ${SUPPRESSED(t)})`;
const LAST_REPLY=t=>`(SELECT to_char(max(greatest(ri.occurred_at,ri.created_at)) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM sales_interactions ri
 WHERE ri.workspace_id=${t}.workspace_id AND ri.contact_id=${t}.id AND ri.title NOT LIKE 'Email: %' AND ri.title NOT ILIKE 'Disiscrizione%')`;

/* The contact's current address goes on the list (hashed by Postgres, the clear address never leaves the database).
   A row already there keeps its first reason and date. → the rows written (0 or 1). */
function suppressContact(sql,workspace,contact,{reason='unsubscribe',source=null,user=null}={}){
 return sql(`INSERT INTO sales_email_suppressions(workspace_id,email_hash,reason,source,created_by)
  SELECT t.workspace_id,${HASH_SQL('t.email')},$3,$4,$5 FROM sales_contacts t WHERE t.workspace_id=$1 AND t.id=$2 AND nullif(btrim(t.email),'') IS NOT NULL
  ON CONFLICT (workspace_id,email_hash) DO NOTHING RETURNING email_hash`,[workspace,contact,reason,source,user]);
}
// Which of these addresses are on the workspace list → Set of the normalized addresses. Hashes go to the database, not addresses.
async function suppressedSet(sql,workspace,emails){
 const by=new Map();for(const e of emails||[]){const h=emailHash(e);if(h)by.set(h,normalEmail(e))}
 if(!by.size)return new Set();
 const rows=await sql('SELECT email_hash FROM sales_email_suppressions WHERE workspace_id=$1 AND email_hash=ANY($2::text[])',[workspace,[...by.keys()]]);
 return new Set(rows.map(r=>by.get(r.email_hash)).filter(Boolean));
}
module.exports={OPTED_OUT,LAST_REPLY,SUPPRESSED,HASH_SQL,HASH,REASONS,normalEmail,emailHash,suppressContact,suppressedSet};
