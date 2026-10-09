# RADIX Sales V1 — foundation (2026-10-09)

## Stato reale
Implementazione locale, NON produzione-ready. Nuovo worktree RADIX-SALES, branch nexus/radix-sales-v1 dalla base esatta 3e6d4014b8d2959a40f82cd9bd25f3e9f4d99aeb. Repository originale RADIX sul branch nexus/radix-development lasciato invariato. Nessuna installazione, connessione DB, migrazione eseguita, deploy, provider, email o credenziale letta. Nessun seed fittizio in Sales.

## File e comportamento
- migrations/sales/001_foundation.sql: workspace, membership esplicita owner/admin/member/viewer, aziende, contatti, lead, processi/stadi, opportunità, task, audit e idempotenza.
- migrations/sales/002_commands.sql: funzione SECURITY INVOKER sales_command. Un singolo statement Neon è una transazione DB; nessun BEGIN/COMMIT su richieste HTTP separate. Lock membership/utente, record FOR UPDATE, versione ottimistica, advisory transaction lock per workspace+attore+chiave. Transizione opportunità, eventuale task configurato, audit e risultato idempotente atomici. Replay restituisce risultato originale; stessa chiave con payload diverso confligge. La chiave esclude il task_id generato per permettere retry identici. Audit registra anche task generato.
- api/_sales.js: sessione radix_session tramite helper esistente, UID validato, membership e utente persistenti verificati, deny default, ruoli server, allowlist dati/azioni, limiti, header JSON/custom anti-CSRF, no-store, errori neutrali. Login NON crea workspace/membership.
- api/_sales_store.js: riusa api/_db.js senza modificarlo; SQL parametrizzato. Identificatori dinamici esclusivamente allowlist chiusa. Reads ri-verificano membership+utente nello statement. FK composite workspace+id rendono tenant-safe tutte le relazioni e legano fase al processo e processo al tipo.
- api/sales.js: endpoint GET/POST, caricamento lazy della dipendenza per negare accesso non autenticato anche prima del setup.
- radix-sales.html + sales/: UI smeraldo indipendente, solo dati API, CRUD essenziale, Kanban opportunità/stati task, editor processi/stadi, conferme, focus/dialog nativi, paginazione esplicita, messaggi setup, nessuna interpolazione HTML dei dati. Chiavi transizione conservate in memoria della scheda per retry incerti. Nessun dato CRM persistito nel browser.
- tests/sales.test.js: 12 test offline aggiuntivi; suite totale 52/52 PASS. node --check sui quattro JS aggiunti PASS. git diff --check PASS (ripetuto dopo staging).

## Contratto API
GET /api/sales?entity=workspaces: solo workspace con membership esplicita (utente eliminato non ottiene righe).
GET /api/sales?workspace=UUID&entity=companies|contacts|leads|opportunities|tasks|processes|stages|dashboard&offset=0: {rows,limit:100,offset}. Pagine successive offset +100. Dashboard è aggregato sull'intero workspace, non sulla pagina caricata.
POST JSON {workspace,entity,action:create|update|delete|transition,data}, header x-radix-sales:1. Create ID generato server; update/delete richiedono id/version; transizione opportunità richiede id/version/stage_id/key UUID. Non è consentito bypassare transizione con update stage_id. Member modifica CRM, admin/owner anche configurazione, viewer sola lettura. Nessun endpoint provisioning/escalation ruoli.
Importi interi in centesimi, stessa valuta operativa concordata per workspace (valuta non ancora modellata). Campo storico API open_amount_cents è **somma di tutte le opportunità**, UI etichettata valore pipeline: non esiste ancora semantica won/lost o forecast. Task ha stato todo/doing/done e processo/fase opzionali configurabili nell'editor; Kanban task usa lo stato, non raggruppamento per fasi personalizzate. Una transizione opportunità può generare un task todo senza processo; nessuna azione esterna.

## Setup MANUALE, non eseguito
1. Review schema/funzione e test indipendenti prima di ogni applicazione. Le migrazioni sono versionate e una tantum, NON idempotenti; nessun runner automatico o endpoint di migrazione.
2. Ottenere ambiente PostgreSQL/Neon isolato autorizzato con schema users compatibile (id integer), dipendenza Neon già prevista dal package.json e configurazione esistente gestita dall'operatore. Nessun valore di ambiente va nel repository. Dipendenza locale @neondatabase/serverless attualmente ASSENTE.
3. Applicare 001, poi 002 una volta, tracciando versione con processo operativo del DB. Non usare DB produzione. Non cambiare auth o workspace_state.
4. Provisionare manualmente un workspace UUID e membership per utente esistente, dopo scelta esplicita amministrativa; nessuna auto-enrollment, nessun seed. Creare processi/stadi tramite API/UI con ruolo admin/owner.
5. Verificare login esistente sullo stesso origin e aprire radix-sales.html in ambiente isolato. Non configurare CORS permissivo: gate custom-header presuppone same-origin.

## Prove e limiti
Suite node --test tests/*.test.js: 52 PASS, 0 FAIL. Tutto offline/sintetico. Adapter stub verifica autorizzazione, scope, validazione, statement parametrizzato, error mapping. Modello MOCK di transazione prova soltanto il contratto atteso per replay/rollback/versione; NON esegue SQL, NON certifica locking, migrazioni o Neon runtime. Check statici SQL non sono parser/DB test. Nessun browser visuale/assistive-technology e nessun E2E reale eseguito.

Gate SQL futuri obbligatori in DB usa-e-getta autorizzato: applicazione migrazioni; CRUD tutte entità; FK cross-workspace per ogni relazione; stadio di processo/tipo errato; viewer/member/admin e revoca membership concorrente; due sessioni simultanee stessa chiave (un solo task/audit), stessa chiave payload diverso, stessa versione chiavi diverse (un vincitore); audit failure in transazione (zero modifiche); delete con riferimenti (409, niente perdita); importo massimo; rollback integrale; query dashboard; compatibilità funzione/Neon. Nessuna di queste prove è stata eseguita.

Limiti intenzionali: no RLS (confine attuale API, DB connection fidata; non esporre funzione/credenziale a client), niente audit UI o retention, nessuna gestione membri self-service, nessun allegato/AI/voce/email, niente automazioni esterne. Idempotenza solo transizione; create CRUD non idempotente, dopo timeout ricaricare prima di ripetere. Audit append-only via API, non tamper-proof per amministratori DB. Offset pagination può muoversi sotto modifiche concorrenti. Relazioni azienda-contatto entrambe tenant-safe ma non impongono che contatto appartenga all'azienda selezionata. Valori finanziari non forecast/ricavi.

## Git e prossimi passi
Identità Git già configurata trovata (nessuna identità inventata/modificata). Commit locale previsto sul solo branch dedicato. Push NON effettuato: grant/identità GitHub remota non disponibili nel preflight, nessun aggiramento. Nessun fetch: riferimento codex remoto segnalato b7564b7858df0379e7e1c3502632d7694751b649 differisce dal cached 335afe5, non usato come base né integrato. Confronto remoto resta non verificato.
Review indipendente parent, test SQL/Neon isolati, E2E browser/tastiera e hardening deploy sono gate prima di considerare un rollout. Nessun merge, produzione/main/codex toccato.
