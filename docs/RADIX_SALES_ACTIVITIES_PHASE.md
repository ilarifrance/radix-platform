# Sales — attività persistenti e Customer360 (2026-10-10)

## Perimetro reale
Implementazione sul solo branch nexus/radix-sales-v1, worktree RADIX-SALES. Preflight LIVE: HEAD locale e remoto GitHub ilarifrance/radix-platform entrambi c49b3fe193049ea72db9d84e3a12a62209ee5e1b; worktree pulito. Nessun merge/rebase/reset/stash o checkout. Nessun push in questa lane: review/pubblicazione restano al parent.

Nessuna installazione o dipendenza nuova: riutilizzati API/store/componenti nativi già presenti. Nessun DB, migrazione eseguita, provider, scraping, email, deploy o configurazione. Legacy index/state/auth e Command Center invariati. Questa fase NON è un CRM completo o una certificazione produzione.

## Deliverable
- api/_sales.js: attività con assignee_id intero PostgreSQL, priority low/normal/high/urgent, due_at UTC; interazioni CRUD title/kind/body/occurred_at e contesto; whitelist rigorosa; membership sconosciuta negata anche in lettura; errori datetime 400.
- api/_sales_store.js: membri paginati senza email/segreti; Customer360 su query persistita tenant-scoped, non su subset browser; timestamp JSON PostgreSQL normalizzati in UTC ISO Z con precisione millisecondi anche nei record annidati.
- migrations/sales/003_activities.sql: nuova migrazione VERSIONATA, 001/002 immutate. FK composite membership e contesto, trigger anti-bypass NULL e protezione riassociazioni parent, interazioni/versione/audit, indici letture; sostituzione transazionale sales_command con regole task esplicite.
- sales/sales.js, sales/sales.css, radix-sales.html: editor attività/interazioni, assegnatari membri sola lettura, regole stage, Customer360 read-only paginato, testi setup/relazioni, focus e invalidazione accesso. Nessun dato fittizio; email è solo un tipo di interazione registrata, non un invio.
- tests/sales-activities.test.js, tests/sales-client.test.js: nuove prove offline e regressioni.

## Contratti e semantica
GET entity=members: id intero, name, role; page size 100. Non esiste provisioning/escalation via API.
GET entity=customer360&workspace=UUID&subject=companies|contacts|opportunities&id=UUID&offset=N: rows di {entity,record}, massimo 100 totali per pagina. Root inesistente/altro workspace restituisce vuoto, non altri dati. Include aziende, contatti, opportunità, task e interazioni coerenti; non lead. Ordinamento globale tipo/id: anche root può arrivare in una pagina successiva. Nessuna inferenza da dati client e nessun accesso a workspace_state. Offset non è uno snapshot sotto scritture concorrenti.

Task manuali possono essere non assegnati/non scadenzati; priorità predefinita esplicita nel modulo/DB normal. L'assegnazione non nulla richiede membership nello stesso workspace (qualunque ruolo, incluso viewer; ruolo e assegnazione sono concetti distinti). La FK impedisce rimozione della membership con task/regole ancora assegnati: prima riassegnare/scollegare esplicitamente.

Una relazione contatto richiede company_id esattamente uguale al contatto, anche null. Task/interazione collegati a opportunità richiedono company_id e contact_id esattamente uguali all'opportunità. Combinazioni incoerenti sono 409, mai corrette silenziosamente. Interazione deve avere almeno una relazione. Parent già collegati non possono essere riassociati: scollegare esplicitamente i figli prima. Record FK non eliminabili finché collegati.

Timestamp input solo YYYY-MM-DDTHH:mm:ss[.SSS]Z, anni 0001–9999: niente date locali ambigue, offset o date impossibili. Output UTC millisecondi: microsecondi DB vengono troncati nella rappresentazione API. created_at/updated_at e audit server; occurred_at è dichiarato dall'utente. Scadenze passate ammesse perché possono rappresentare arretrati.

Generazione da transizione opportunità: task_title + task_assignee_id + task_priority + task_due_days tutti presenti oppure tutti null. Giorni 0–3650, durata esatta di 24h da now() della transazione UTC, non giorni lavorativi/calendario locale. Nessun fallback all'attore. Regola incompleta, membership mancante, contesto invalido o audit fallito annullano tutto. Advisory key + fingerprint, row/version lock, task, audit e risultato idempotente nello stesso statement/funzione. Replay restituisce risultato originale, non rigenera task né ricalcola scadenza. Idempotenza resta limitata alle transizioni opportunità, non CRUD/manual task; dopo timeout verificare prima di ripetere.

Interazioni create/update/delete e ogni comando hanno audit before/after con attore/timestamp; task generato conserva snapshot e origine. Eliminare un'interazione non elimina audit. Audit non esposto in UI, non tamper-proof per amministratori DB; note possono contenere dati personali: definire retention/autorizzazioni DB prima rollout.

## Setup manuale — NON eseguito
1. Review indipendente e DB usa-e-getta autorizzato con users compatibile; applicare 001 → 002 → 003 una volta. Nessun runner automatico.
2. 003 fallisce atomicamente se esistono vecchie regole task_title senza le nuove regole complete o contesti legacy incoerenti. Nessun backfill implicito. Operatore deve pianificare una remediation esplicita e revisionata: disabilitare temporaneamente regole automatiche incompiute prima della migrazione, riattivarne la configurazione completa dopo; per task legacy collegati, valutare una migrazione di remediation dedicata e autorizzata. NON applicare 003 a dati reali senza questa review.
3. I timestamp created_at introdotti sui task esistenti rappresentano l'istante di migrazione, non una data storica ricostruita. Annotare questo limite nella decisione operativa.
4. Provisioning manuale workspace/membership resta esplicito, login non iscrive nessuno. DB e funzione non devono essere esposti a client; confine API con connessione fidata, non RLS.

## Prove e review
Suite completa eseguita: node --test tests/*.test.js **87 PASS, 0 FAIL**. Include 10 nuove prove server/statiche e 10 nuove UI, più 67 regressioni. Syntax node --check API/store/client PASS; git diff --check PASS.
Review interna indipendente read-only ha rilevato incompatibilità timestamptz PostgreSQL (+00:00/microsecondi) con input Z, anno zero e documentazione setup obsoleta: corretti con normalizzazione output/test, validazione/mapping errori e questo rapporto.

Le prove SQL sono ispezioni statiche; adapter SQL e DOM/fetch sono MOCK. Non provano parsing PL/pgSQL, FK effettive, isolamento, concorrenza, Neon o E2E browser. Nessun browser reale/AT o DB eseguito.
Gate obbligatori futuri: applicazione 001/002/003 e rollback preflight; CRUD incluse date/snapshot audit; assegnatario altro workspace/inesistente; tutte coppie parent/child compresi NULL→valore; modifica contatto senza cambiare company; concorrenza riassociazione vs inserimento figlio; ruolo viewer/admin e revoca concorrente; due sessioni stessa chiave/chiavi diverse stessa versione; rollback su audit failure; scadenze UTC e replay stabile; Customer360 con >100 righe, root mancante/cross-workspace; query e parametri Neon reali; browser tastiera/mobile/focus. Nessuno di questi gate reali è dichiarato superato.

## Residui intenzionali
Nessun AI Sales Director/Lead Intelligence implementato in questa fase: priorità al core delimitato, provider rimangono assenti/disabilitati. Nessun calendario, notifiche, ricorrenze, import CSV, multicurrency, forecast, ownership opportunità o servizio di provisioning. Kanban mantiene processi/fasi configurabili e stato task indipendente, non inventa mapping stato/fase. Selettori mostrano solo pagine caricate e preservano riferimenti correnti non caricati. Audit retention e policy DB restano decisioni operative prima del rollout.
