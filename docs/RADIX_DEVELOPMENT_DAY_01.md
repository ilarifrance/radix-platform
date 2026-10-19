# RADIX DEVELOPMENT DAY 01 — 2026-10-09

## Perimetro e risultato
Implementazione locale sul solo branch `nexus/radix-development` (HEAD iniziale/finale e298895), inizialmente pulito. Riferimento locale origin/codex/radix-command-center-v1 riusato con git show, nessun checkout. Nessun commit, fetch/pull/push/merge/deploy, installazione, servizio esterno, email, dato cliente, credenziale o configurazione scheduler. Le modifiche restano nel working tree per review.

## File effettivi
- Command Center: control-center-v2.html; api/_dashboard.js, api/_dashboard_flow.js, api/_dashboard_helpers.js; aggiunta mirata in api/state.js.
- CRM: radix-crm-concept.html, lib/crm-demo.js, tests/crm-demo.test.js.
- PM: radix-pm-concept.html, lib/pm-demo.js, tests/pm-demo.test.js.
- Marketing riusato: marketing-agency.html, lib/marketing-approval.js, tests/marketing-approval.test.js.
- Test aggiunti: tests/dashboard.test.js, tests/dashboard-client.test.js, tests/html-syntax.test.js.
- Documentazione: questo rapporto, RADIX_CORE_ROADMAP.md, RADIX_COMMAND_CENTER_DATA_CONTRACT.md aggiornato e RADIX_MARKETING_AGENCY_SPEC.md riusato dal riferimento.

## Command Center — tecnico
V2 legge esclusivamente GET /api/state?view=dashboard, autenticazione esistente, no-store anche su 401, errori dashboard neutri. GET ordinario e POST persistente restano invariati; index.html è byte-identico al branch (git diff --quiet exit 0).
La proiezione percorre history[agentId][messageIndex].flow; log {t,k,x}, con testo evento neutro derivato da k e timestamp t (x non esposto). Nessuna cronologia, output o errore SQL grezzo al cockpit. Running è sempre snapshot unverified/stale, mai live; timestamp null/invalidi/futuri trattati in modo conservativo. Conteggi precedono i limiti; nodi/flow errore hanno priorità, attention espone totale e quantità mostrata. Agenti conteggiati su tutti i nodi prima del taglio preview.
Client single-flight, timeout 12s AbortController, recovery periodica e stop/clear su 401; enum e numeri limitati. Test sintetici esercitano pending concorrente, abort/retry, 401 e pulizia dati. Focus visibile, schede/SVG da tastiera, drawer con focus trap/ripristino e background inert.
Limiti: legge ancora l'intero blob sul server; nessun run persistente/live, assegnazione agente-progetto o approval centralizzata verificata. Flow preview 24, nodi 80, progetti 100; totale blocchi resta visibile anche oltre il limite.

## Visivo
Riutilizzata composizione V2: cockpit scuro smeraldo, sidebar/topbar, network RADIX Core/progetti, attention/activity a destra e workflow/team/knowledge sotto. Nessun redesign dell'app approvata. Rimosso caricamento font remoto: usa fallback locali, quindi tipografia può differire. Immagine originale non disponibile: fedeltà visiva NON certificata. Nessun rendering browser/screenshot o test assistive technology eseguito; responsive e focus implementati ma da verificare visivamente.

## CRM demo
Vanilla offline con libreria relativa locale, particelle dinamiche, pausa e reduced motion. Percorso testo completo; voce NON INTEGRATA, nessuna registrazione o riconoscimento. Aziende/contatti/lead, opportunità e pipeline modificabile, attività, note collegate e storico in memoria. Parser a regole dichiarato non AI: nota → bozza editabile → prove testuali → conferma esplicita. Esempio sintetico 35000 EUR / 60%; prossimo martedì resta ambiguo, nessuna data inventata. Briefing/rischi e KPI semplici calcolati sulla demo, follow-up editabile non inviato. Documenti, preventivi, KPI avanzati e integrazioni marcati futuri. Ricaricare cancella le modifiche.

## PM demo
Doc Capital è solo nome pilota sintetico. Sottoprogetti, task/milestone, responsabili, scadenze, filtri, creazione/dettaglio/cambio stato; dipendenze bloccano avvio e completamento. Approvazione simulata esplicita necessaria dove richiesta, riapertura protetta e approvazione invalidata. Documenti/decisioni sono segnaposto/esempi, storico locale non audit. Agenti ASSEGNATI non live; ricorrenze solo descrittive, nessuno scheduler.

## Marketing e Core
Riusati modulo, libreria e test dal riferimento, senza rifarli. Ogni post ha revisione/decisione; edit contenuto/canale/giorno demo invalida approvazione. Gate di dominio ora include scheduledAt/timezone nella fingerprint e rifiuta destinazioni vuote. Pubblicazione NON ATTIVATA. La demo non invoca la libreria Node come autorizzazione, né il gate è un confine server: oggetti approvazione forniti dal chiamante sono falsificabili, richiedono trusted storage e permessi server futuri. Nessuna certificazione delle API publishing legacy, non modificate.
Roadmap Core condiviso: auth/progetti/artifact/revision/approval/audit, poi integrazione CRM/PM/Marketing. Commercialisti AI con validazione professionale; white-label futuro, senza complessità multi-tenant prematura.

## Prove locali
Comando: node --test tests/*.test.js. Ultima suite completa prima del rapporto: 40/40 PASS (CRM 11, PM 10, marketing 5, dashboard API/proiezione 6, client 3, HTML/statico 5). Test solo sintetici/mock, nessun DB/provider reale. Sintassi JS inline di tutti i quattro HTML verificata con vm.Script. git diff --check pulito; index.html invariato; api/state.js solo 12 righe aggiuntive per vista dashboard.
Due errori iniziali nelle fixture/checker locali sono stati corretti prima della suite finale; nessun errore residuo noto dalla suite. Nessun blocco di approval incontrato.

## Prossimi passi, non avviati
1. Review diff e visuale browser desktop/mobile/tastiera con riferimento originale disponibile.
2. Prova autenticata dell'endpoint in ambiente autorizzato, senza cambiare persistenza.
3. Validare schema Core, archivio revisioni/approvazioni e audit server prima di qualsiasi publishing o persistenza CRM/PM.
4. Eventuali commit/PR/deploy soltanto con mandato separato. Nessun lavoro continuativo o schedulato attivo da questa esecuzione.
