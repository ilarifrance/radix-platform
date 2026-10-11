# RADIX FUNCTIONAL — recupero bounded 2026-10-11

## Preflight e perimetro
- Avvio verificato sul sistema: 2026-10-11T10:51:53+01:00 (09:51:53Z). Verifiche finali test: 10:52:59+01:00. Ciclo unico, entro 20 minuti e prima della deadline assoluta 14:49Z.
- Solo worktree RADIX-SALES, branch `nexus/radix-sales-v1`, HEAD `6ea818eed502b7ad92340f613f27af6afd088ed2`, ahead 1 rispetto al riferimento origin locale; nessun fetch o verifica remota.
- Nessun altro writer attivo secondo snapshot runtime e preflight watchdog forniti; stato iniziale corrispondente al mandato. Nessun figlio avviato.
- Preesistenti: 11 file tracked modificati e 7 untracked (API/store, Sales UI/test/doc/migrazione 003, PM e Marketing). Tutto preservato. Recuperato contesto da diff, documenti Sales e sorgenti/test, senza bisogno di history.

## Correzioni di questo ciclo
1. `sales/sales.js`: editor fasi conserva il processo corrente anche quando non presente nella pagina caricata. Il riferimento viene ora incluso nelle opzioni reali, usando lo stesso helper già esistente per le altre relazioni; nessuna nuova dipendenza o soluzione custom.
2. `tests/sales-client.test.js`: aggiunta regressione DOM mock che verifica presenza effettiva dell'opzione, non solo `.value`. Prima della correzione: 1 test mirato FAIL; dopo: PASS nella suite completa.
3. `tests/marketing-demo.test.js`: riparati tre literal regex con escape mancanti (estrazione script inline, percorso JS e rilevamento API outbound). Il file preesistente non compilava; conservati tutti i 12 test e le loro asserzioni.
4. Questo registro nuovo. Nessun altro file modificato da questo ciclo.

## Prove realmente eseguite
- Ispezionati package.json (nessuno script npm), import e harness test: node:test, filesystem locale, VM/DOM/fetch/SQL mock; nessun test con DB o chiamata remota. Nessuna installazione.
- Baseline `node --test tests/*.test.js`: 110 PASS, 1 FAIL (errore di parsing nel file Marketing; i suoi test non erano eseguiti).
- Dopo riparazione `node --test tests/marketing-demo.test.js`: 12 PASS, 0 FAIL.
- Riproduzione CRM: `node --test --test-name-pattern='stage editor preserves unloaded' tests/sales-client.test.js`: 0 PASS, 1 FAIL, prima del fix.
- Finale `node --test tests/*.test.js`: **123 PASS, 0 FAIL**, nessun test cancellato/skipped/todo, exit 0. Comprende regressioni CRM/Sales, PM/storage, Marketing/approval, dashboard e sintassi HTML inline.
- `node --check`: PASS su api/_sales.js, api/_sales_store.js, sales/sales.js, lib/pm-demo.js, lib/pm-demo-storage.js, lib/marketing-demo.js, tests/marketing-demo.test.js.
- `git diff --check`: PASS; avvisi Git LF/CRLF soltanto, nessun errore whitespace.
- Una ricerca iniziale PowerShell Select-String con regex malformata è fallita senza effetti; ripetuta con -SimpleMatch correttamente.

## Review e limiti
Review offline del diff API/store/Sales e migrazione 003: allowlist, scope Customer360, normalizzazione timestamp, ruoli, contesto relazioni e audit. Le prove SQL restano statiche/mock, NON parsing o esecuzione PostgreSQL. PM: regressioni graph, revisioni, progetti, date, opt-in storage e DOM mock tutte verdi. Marketing: revisioni approvate invalidate dalle modifiche, consenso storage, report sintetico e zero publishing coperti dai test ripristinati. Nessuna certificazione live o produzione-ready.

Nessun DB reale, migrazione eseguita, browser reale/E2E/AT, rete, provider, API pagata, segreto, configurazione, deploy, push, merge o altro branch. Nessun dato sintetico aggiunto al CRM persistente. PM/Marketing restano demo isolate, con storage locale solo esplicito.

## Git e backlog
**Nessun commit creato intenzionalmente**: i tre file corretti contengono lavoro precedente non committato (Marketing è untracked). Per non assorbire il ciclo interrotto in un commit di riparazione, lasciati tutti i cambi nel worktree e documentati gli hunk propri sopra. HEAD rimane quello del preflight; nessuno staging.

Prossimi gate: review/commit separati del lavoro recuperato da parte del parent; prove autorizzate su DB usa-e-getta per migrazioni 001/002/003, FK NULL e cross-workspace, locking/concorrenza/replay/rollback audit; browser reale con paginazione >100 e focus/tastiera/mobile; validazione operativa provisioning, retention e autorizzazioni prima rollout. Nessuna di queste prove reali è stata eseguita o dichiarata superata. Il piccolo backlog riferimenti editor fuori pagina è chiuso da questo ciclo.


## Ciclo review e commit recupero - 2026-10-11 10:51Z
- Prima ora UTC verificata: 10:51:41.3978515Z; checkpoint pre-registro 10:53:38.5723366Z. Un solo ciclo, nessun figlio/writer avviato. Branch nexus/radix-sales-v1 sempre verificato prima delle scritture; HEAD iniziale 6ea818eed502b7ad92340f613f27af6afd088ed2. Stato iniziale: 11 tracked modificati + 8 untracked, indice vuoto, coerente con parent. Nessuna modifica concorrente rilevata nei checkpoint.
- Mandato esplicito di recuperare e committare i gruppi preesistenti: supera la scelta conservativa del ciclo precedente senza alterarne il resoconto storico. Review prima CRM (API/store/UI, contratto attivita, migrazione 003 e test), poi PM e Marketing (moduli, interfacce, storage/test e specifica Marketing). Componenti vanilla esistenti, nessuna dipendenza aggiunta.
- CRM: review allowlist, ACL, contesto relazioni, timestamp UTC, Customer360 tenant-scoped e sola lettura, regole attivita e audit. Nessun nuovo bug dimostrato in questo ciclo. Migrazione letta soltanto: SQL statico/mock, mai eseguito.
- PM: recuperati progetti e task editabili, date/assegnazioni descrittive, grafo e revoca approvazioni, archivio locale isolato con opt-in. Nessun nuovo bug dimostrato. Nessuna esecuzione agente/scheduler.
- Marketing: corretti due bug riprodotti offline. Snapshot con nextId inferiore a ID futuri era accettato e produceva duplicati (p4,p3,p4); ora rifiutato anche per ID multidigit e campagne. Snapshot valido con PED vuoto causava errore UI su posts[0].id; ora editor vuoto e creazione primo contenuto funzionano. Modificati lib/marketing-demo.js, marketing-agency.html e aggiunte due regressioni in tests/marketing-demo.test.js.
- Evidenza: baseline 123 PASS; due regressioni nuove prima del fix 0 PASS / 2 FAIL; Marketing dopo fix 14 PASS. Suite completa finale node --test tests/*.test.js: 125 PASS, 0 FAIL/cancelled/skipped/todo. Syntax node --check dei sette JS API/client/moduli/test Marketing: PASS; git diff --check e check staged di ogni gruppo: PASS (soli avvisi LF/CRLF). Corretto durante verifica anche un escape regex del fix, sostituito con classe [0-9] e coperto da caso multidigit.
- Due comandi diagnostici iniziali non riusciti senza effetti: Get-Date -AsUTC non disponibile su questa PowerShell (usato DateTime.UtcNow); node -e perdeva le virgolette (ripetuto con here-string su stdin). Nessuna installazione o loop.

### Commit locali verificati (nessun push)
1. dde3053ff3981c9bbb1e899334de0496f500a68d - CRM attivita / Customer360: 10 file, incluse migrazione 003, documenti Sales, API/store/UI/test.
2. 4dcb26881039d027829dce95b837b4440d9927ae - PM demo: 5 file (lib/pm-demo.js, lib/pm-demo-storage.js, radix-pm-concept.html, tests/pm-demo.test.js, tests/pm-demo-storage.test.js).
3. fa667723eb63c0c0476c38e1c93a621e7256223e - Marketing demo e fix snapshot: 3 file (lib/marketing-demo.js, marketing-agency.html, tests/marketing-demo.test.js).
Registro incluso in successivo commit documentale; SHA finale nel rapporto di chiusura e git log, senza autoreferenza. Staging sempre nominativo, mai add indiscriminato; hook disabilitati solo per invocazione commit per evitare effetti non offline, nessuna config persistente modificata.

### Limiti e backlog bounded
1. Prima rollout CRM: review DB indipendente e autorizzazione per PostgreSQL usa-e-getta; applicazione 001/002/003, FK incluse transizioni NULL, concorrenza/lock, replay e rollback audit. NON eseguiti.
2. Browser reale: Customer360 oltre 100 record, editor fuori pagina, tastiera/focus/mobile; PM storage/dialog e Marketing PED vuoto. Finora solo VM/DOM mock, non E2E/AT.
3. Marketing: ulteriori limiti dimensionali import/storico e hardening input; revisione accessibilita tab. Demo non e autorizzazione server, ledger audit, scheduler o publisher. Eventuali difetti di encoding del testo preesistente non normalizzati globalmente.
Nessuna rete/push, produzione, deploy, merge, altro branch, DB reale, migrazione eseguita, segreto, configurazione OpenClaw/modello o API pagata. Tutte le prove offline; dati sintetici confinati alle demo, non inseriti nel CRM persistente.
