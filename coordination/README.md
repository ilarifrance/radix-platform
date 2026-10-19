# RADIX — Protocollo di coordinamento e integrazione
Data: 2026-10-11 · Registro: [Issue #2](https://github.com/ilarifrance/radix-platform/issues/2)

## Ruoli e proprietà dei file
- **ChatGPT Work**: owner esclusivo del Command Center `control-center-v2.html`, Network View, CSS/JS collegati, `project-editorial.html` e PED Work. Branch `codex/radix-command-center-v1`.
- **ChatGPT Agency**: `agency/*`, `api/_agency-memory-*`, orchestrazione Agency, `coordination/*` e contratto di integrazione. Branch `design/radix-marketing-agency-v2`.
- **OpenClaw**: `api/sales.js`, `api/_sales*`, `sales/*`, `radix-sales.html`, `migrations/sales/*`, test Sales. Branch `nexus/radix-sales-v1`.
- **Qwen**: codice sperimentale nel repo `ilarifrance/radix-ai-lab` e branch `qwen/development`; integrazione SOLO dopo review, nel branch `review/qwen-nexus-integration-20261011`.
- **Utente**: approva cambiamenti di prodotto rilevanti, costi, database condivisi e produzione.

## Fonte di verità
1. `coordination/radix-registry.json` è l'inventario versionato: stato dichiarato come snapshot, non feed live.
2. GitHub Issue #2 è il registro condiviso di decisioni, handoff, problemi, owner e dipendenze.
3. Branch e commit GitHub + test riproducibili determinano ciò che è stato realmente sviluppato.
4. Preview Vercel READY non equivale a test E2E autenticati né a produzione pronta.
5. Conversazioni AI e memorie interne non sostituiscono il registro versionato.

## Consegna standard (da incollare nella issue)
```md
### Handoff RADIX — <componente>
Owner:
Branch:
Commit SHA:
File modificati:
Comportamento implementato:
Test eseguiti (comando, risultato):
Preview (URL e stato):
Dipendenze e API/ID interessati:
Limitazioni e rischi:
Richiesta di review / decisione:
```

## Gate di integrazione
1. **Preflight**: recuperare issue e manifest, verificare file owner e branch corrente.
2. **Sviluppo isolato**: non modificare file assegnati ad altri senza handoff esplicito.
3. **Review**: esaminare codice, auth, scope utente, CSRF, dati reali vs mock, costi e test.
4. **Integrazione controllata**: creare un branch dedicato dalla base concordata; cherry-pick selettivo o PR; risolvere conflitti senza sovrascrivere la UI Work.
5. **Verifica Preview**: build READY, test, browser autenticato, responsive, navigazione e DB isolato dove necessario.
6. **Promozione**: nessun merge su `main`, nessuna migrazione DB condiviso o deploy produzione senza approvazione dell'utente.

## Interfacce da stabilizzare
- Navigazione: `area`, `projectId`, `clientId`, `agentId`; deep link senza trigger AI.
- Autorizzazione: sessione autenticata e controllo owner server-side su progetti e memorie.
- Identità: non associare attività a progetti se il collegamento non è documentato; distinguere workflow condivisi.
- Stato: `proposed` → `approved` → `running` → `done` con eventi e audit reali; snapshot storici non sono prova di esecuzione.
- PED: un solo owner e un solo modulo finale; migrazione esplicita delle bozze locali.
- Memory Engine: agency/client/project/agent/shared; solo memorie confermate nei prompt; Preview DB isolato prima della migrazione.

## Roadmap immediata
1. Inventory e Control Room fisica nella Preview Agency (**implementati**).
2. Contratto di navigazione e handoff condiviso con Work/OpenClaw.
3. Decisione PED unico; adapter verso progetti esistenti.
4. Test e isolamento del database Memory Engine; persistenza reale.
5. Integrazione selettiva di Sales e moduli Qwen dopo review.
6. Test E2E delle cinque aree e consolidamento su Preview d'integrazione.

## Cosa NON è automatico
Questo registro non riceve da solo eventi delle altre chat né aggiorna i branch in tempo reale. Per una sincronizzazione automatica futura serve un processo CI/webhook autorizzato, con credenziali e regole di scrittura; non è stato attivato. Nessuna azione esterna o AI a pagamento è eseguita da questa pagina.
