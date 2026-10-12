# CRM sprint — gate 14 ottobre 2026

## Checkpoint iniziale — 2026-10-11 22:16 UTC+1
- **Branch e SHA:** `nexus/radix-sales-v1` / `7a7798a8bb865935facfd989b961bf3d565102f8`; remoto verificato con `git ls-remote`, stesso SHA.
- **DONE verificato:** mandato letto integralmente; audit documenti/API/store/UI. Worktree RADIX-SALES corretto; RADIX su altro branch non modificato. Riutilizzo componenti esistenti, nessuna nuova dipendenza.
- **Test eseguiti con risultati:** baseline completa eseguita offline, fallimenti Marketing preesistenti; conteggi in raccolta.
- **NEXT:** primo P0 indipendente: ricerca anagrafiche server-side paginata, evitando filtro sulla sola prima pagina; regressioni API/store/UI.
- **BLOCKED:** E2E persistente: nessun target DB TEST comprovato isolato/autorizzato né Preview isolata con login/membership disponibile nelle indicazioni non segrete. URL app nei documenti non prova isolamento e non viene contattato. Nessuna connessione DB o migrazione eseguita; nessun .env letto. Gate 14 ottobre a rischio finché operatore non fornisce target isolato, autorizzazione migrazioni, login/membership e Preview.
- **File modificati:** questo checkpoint; `tests/marketing-demo.test.js` già modificato prima dello sprint, preservato e non incluso.
- **PR/Preview:** PR #3 intoccata; branch integrazione non concordato, nessuna PR inventata verso main.
- **Decisioni richieste:** ambiente isolato e autorizzazione DB esplicita; Preview autenticabile; branch integrazione.
- **Provenienza:** storia già pubblicata contiene demo CRM `6ea818e`, PM `4dcb268`, Marketing `fa66772` e rapporto `7a7798a`; non prodotti da questo sprint, non riscritti/ripubblicati come nuovi cambi.

## Checkpoint P0 ricerca — 2026-10-12 02:16 UTC+1
- **Data/ora:** 2026-10-12 02:16 UTC+1.
- **Branch e SHA:** `nexus/radix-sales-v1` / `eb45865c0e8bbbeefba873a9e016de1807f261c2` (implementazione; questo checkpoint segue in commit documentale).
- **DONE verificato:** recuperata ricerca API/store lasciata dal worker precedente e completata UI aziende/contatti. GET `/api/sales?workspace=UUID&entity=companies|contacts&search=TESTO&offset=N`: nome, sottostringa letterale case-insensitive secondo collation DB, trim, massimo 200 caratteri, controlli ASCII rifiutati; %, _ e backslash non sono wildcard. Query parametrizzata tenant/user guarded, filtro prima di LIMIT/OFFSET. Nessuna dipendenza aggiunta. Regex recuperata verificata dai test: non era necessario correggerla. UI con submit esplicito, reset, filtro mantenuto nella paginazione/reload, azzerato al cambio workspace e revoca; loading/error/empty distinti, viewer in lettura, protezione risposte tardive. Selettori restano limitati ai riferimenti caricati (ora anche filtrati), con preservazione riferimento corrente.
- **Test eseguiti con risultati e prove:** `node --test tests/sales*.test.js`: 61/61 PASS, 0 FAIL. `node --test tests/*.test.js`: 141 totali, 138 PASS, 3 FAIL Marketing preesistenti (exit 1); baseline parent 128/125/3, aggiunte 13 regressioni. Fallimenti invariati: snapshot boundary oversized (riga 26), snapshot history/input limits (32), upstream typing invalidation (35) in tests/marketing-demo.test.js. Log locale non versionato: sales-sprint-test-results.txt. `node --check` API/store/client e `git diff --check` + staged PASS. Prove offline DOM/fetch e SQL adapter statico, NON DB/browser/E2E; nessuna performance SQL certificata.
- **NEXT:** prossimo blocco P0: opportunità owner/expected close con contratto persistente/API/UI/test e review migrazione solo su file; poi filtri attività scadute/prossime e contratto JSON Qwen. Non applicare migrazioni senza ambiente/autorizzazione. Ricerca minima implementata offline, accettazione reale resta aperta.
- **BLOCKED:** DB TEST isolato autorizzato, esecuzione migrazioni, autenticazione/membership e Preview non disponibili. E2E persistente e gate reale 14 ottobre NON superati. Nessun DB, .env, Qwen, produzione, merge o deploy toccato.
- **File modificati:** api/_sales.js, api/_sales_store.js, sales/sales.js, tests/sales-client.test.js, nuovo tests/sales-search.test.js; questo registro. tests/marketing-demo.test.js preesistente preservato ed escluso dal commit.
- **PR/Preview:** PR #3 intoccata; PR consegna non aperta perché branch integrazione da concordare. Push ramo autorizzato in verifica dopo commit documentale. Issue #2 non aggiornata in quiet hours: rapporto al parent, nessun annuncio esterno ordinario.
- **Decisioni richieste:** target DB isolato con permesso esplicito migrazioni; login/membership e Preview; branch integrazione. Sprint NON completato.

## Checkpoint recupero P0 opportunità — 2026-10-12 08:17 UTC+1
- **Data/ora:** 2026-10-12 08:17 UTC+1.
- **Branch e SHA:** nexus/radix-sales-v1 / 4fb24c93c17f48845023d7ad6b3c5121627ca375 (base verificata; modifiche recuperate in preparazione commit).
- **DONE verificato:** revisionato lavoro interrotto owner/expected_close; API con owner intero PostgreSQL nullable e data calendario stretta YYYY-MM-DD (0001–9999), null esplicito per cancellare, omissione update invariata. Owner membership stesso workspace tramite FK composita, incluso viewer come assegnatario (non concede permessi); rimozione membership richiede prima riassegnazione. Migrazione 004 solo file, funzione 003 preservata salvo allowlist opportunità. UI create/edit e schede pipeline/Customer360; riferimenti fuori pagina preservati. Corrette due asserzioni test (regex dollaro SQL e valore option nel DOM mock), non bug produzione.
- **Test eseguiti con risultati:** node --test tests/sales*.test.js 71/71 PASS; node --test tests/*.test.js 151 totali, 148 PASS, 3 FAIL Marketing preesistenti alle righe 26/32/35; syntax API/store/client e git diff --check PASS. Log locali sales-sprint-opportunities-results.txt e sales-sprint-test-results.txt, non versionati. Solo mock DOM/fetch, adapter e static SQL: NON DB/browser/E2E.
- **NEXT:** commit selettivo, documentazione setup 004, filtri attività scadute/prossime e contratto JSON Qwen; sprint aperto.
- **BLOCKED:** DB TEST isolato/autorizzazione migrazioni, auth/membership e Preview non comprovati; nessun DB contattato, migrazione eseguita o segreto letto. Gate E2E 14 ottobre ancora non superato.
- **File modificati:** api/_sales.js, api/_sales_store.js, sales/sales.js, migrations/sales/004_opportunity_owner_close.sql, tests/sales-opportunities.test.js, tests/sales-client.test.js, questo registro. Marketing preesistente preservato/escluso.
- **PR/Preview:** PR3 intoccata; target integrazione non concordato, nessuna PR verso main. Issue2 da verificare tramite strumenti consentiti.
- **Decisioni richieste:** ambiente isolato e permesso migrazioni; account/membership e Preview; branch integrazione.
