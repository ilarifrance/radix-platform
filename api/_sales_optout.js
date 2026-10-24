'use strict';
/* Opt-out and reply signals of a CRM contact, as SQL fragments over an alias of sales_contacts (no new column).
   Opted out when any of these holds (sales/crm-prospecting-core.js has the same rule for notes):
   - its notes mention «Disiscrizione» (the unsubscribe link writes «Disiscrizione dalle email commerciali tramite link: …»,
     a user can write one by hand when someone asks by reply or phone);
   - its timeline has a note titled «Disiscrizione…» (written by the unsubscribe link: it survives edits to the notes);
   - another contact of the workspace with the same address is opted out.
   Reply signal: the newest interaction of the contact that is not an outbound email («Email: …», recorded by every send)
   nor the opt-out note itself. RADIX does not read the inbox: a reply counts once someone logs it on the contact. */
const OPTED_OUT=t=>`(coalesce(${t}.notes,'') ILIKE '%disiscrizione%'
 OR EXISTS(SELECT 1 FROM sales_interactions oi WHERE oi.workspace_id=${t}.workspace_id AND oi.contact_id=${t}.id AND oi.title ILIKE 'Disiscrizione%')
 OR (nullif(btrim(${t}.email),'') IS NOT NULL AND EXISTS(SELECT 1 FROM sales_contacts oc WHERE oc.workspace_id=${t}.workspace_id AND oc.id<>${t}.id AND lower(btrim(oc.email))=lower(btrim(${t}.email))
   AND (coalesce(oc.notes,'') ILIKE '%disiscrizione%' OR EXISTS(SELECT 1 FROM sales_interactions oj WHERE oj.workspace_id=oc.workspace_id AND oj.contact_id=oc.id AND oj.title ILIKE 'Disiscrizione%')))))`;
const LAST_REPLY=t=>`(SELECT to_char(max(greatest(ri.occurred_at,ri.created_at)) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM sales_interactions ri
 WHERE ri.workspace_id=${t}.workspace_id AND ri.contact_id=${t}.id AND ri.title NOT LIKE 'Email: %' AND ri.title NOT ILIKE 'Disiscrizione%')`;
module.exports={OPTED_OUT,LAST_REPLY};
