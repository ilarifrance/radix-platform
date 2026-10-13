# RADIX — Consolidamento controllato (2026-10-13)

## Fonte di verità e limiti
Repository: `ilarifrance/radix-platform`.
Branch isolato di coordinamento: `chatgpt/sales-advisory-qwen-nexus-20261012`.
Nessun merge su `main`, nessuna migrazione in produzione, nessun outbound/invio commerciale.
Le modifiche a questo branch NON equivalgono a un'integrazione end-to-end.

## Sorgenti verificate
- Nexus CRM: `nexus/radix-sales-v1` @ `554825e881`.
- Qwen AI Lab: `qwen/development` @ `b075cd441c`.
- Command Center / PED: `codex/radix-command-center-v1` @ `92f24aa024`.
- Sales integrator: branch corrente; include Sales Pipeline premium (HTML/CSS/JS).
- Note dalle altre sessioni: prototipo Lead Intelligence e vari fix Qwen/Nexus verificati LOCALMENTE, non presenti sui rispettivi branch GitHub al momento della verifica. Non trattare patch o ZIP citati nelle chat come modifiche già incorporate.

## Consolidamenti pubblicati su questo branch
1. `lib/prospect-review.js`: collega `assessProspect` + `deduplicateCompanies` del motore ICP esistente con la coda che accetta `exportProspectReviewCsv`. Nessun provider, database, sincronizzazione né invio. I dati mancanti o i duplicati richiedono revisione.
2. `tests/prospect-review.test.js`: regressioni scritte per copertura, provenienza, duplicati, sicurezza review e limiti CSV.
3. `lib/marketing-approval.js`: impedisce self-approval al domain gate e non considera pubblicabile un record che ha requester/reviewer coincidenti o requester mancante.
4. `tests/marketing-approval.test.js`: nuovi casi di regressione per autoapprovazione e identità.
5. Pipeline premium su `sales-pipeline-premium.html`, `sales/pipeline-premium.css`, `sales/pipeline-premium.js`: Kanban read-only autenticato con sorgente `/api/sales`. I valori monetari sono esposti senza valuta inventata.

## Cosa NON è integrato
- Prototipo Lead Intelligence offline presente come ZIP/HTML in un'altra conversazione: codice non ancora recuperato e revisionato nel repository.
- Correzioni Qwen per UUID tie-break, zero/Infinity e margine lordo: test locali riportati nei resoconti, non pubblicati sul branch Qwen.
- Adapter Nexus-Qwen sviluppato altrove: solo locale, non collegato alle API reali.
- Database di test isolato, migrazione 004, sessioni E2E, test browser autenticati: non verificati.
- Approvazione Marketing: solo gate di dominio; non sostituisce autorizzazione server, ruoli e persistenza. I record passati dal client non sono attendibili.
- Viste Higgsfield: concetti statici, non tutti gli asset scaricati su GitHub. La nuova Pipeline è implementazione di riferimento, non replica pixel-perfect validata.

## Gate prima di un merge
1. Run `node --test tests/prospect-engine.test.js tests/prospect-review.test.js tests/marketing-approval.test.js` su checkout pulito Node 22+, più suite completa.
2. Verificare collisioni/risoluzione dei branch e invarianti multi-tenant.
3. Verificare migrazioni su database isolato, login, ruoli, errori, paginazione e navigazione nel browser.
4. Decidere mapping reale fase UUID -> stato di intelligence; non presumere denominazioni o probabilità.
5. Disabilitare ogni invio e mutazione CRM fino ad approvazione esplicita utente.

## Ordine operativo successivo
P0 test/regressioni e hardening pipeline; P1 importazione prototipo Lead Intelligence e sua riscrittura integrata; P2 adapter Qwen-Nexus read-only; P3 Customer360 premium e Sales Orbit; P4 email/calendario/outreach con connettori autorizzati.
