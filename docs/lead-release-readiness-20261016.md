# RADIX Lead Intelligence — release candidate / controlli finali

**Data:** 2026-10-16. **PR:** #18, branch `chatgpt/lead-bulk-reconcile-providers-20261016`, base `integration/radix-unified-platform-20261013`. La produzione e `main` non sono stati modificati. Nessun merge autorizzato/eseguito.

## Funzionalità implementate nel branch

1. Agente locale avviabile dal Mac, login personale nel browser; checkpoint JSON/CSV dei contatti visibili con deduplica; stop/ripresa.
2. Dashboard locale di consultazione e revisione. `Correggi`: inserimento consapevole di ruolo, datore di lavoro, Paese e dominio con doppia conferma in caso di sovrascrittura. Audit locale di nome profilo/campi modificati e invalidazione delle evidenze dominio superate. Mai email/telefono dedotti.
3. Controllo esplicito di massimo 20 profili incompleti per richiesta, lettura di campi realmente mostrati e confronto identità; niente automazione stealth o aggiramenti. Può essere limitato dalle condizioni LinkedIn, usare solo se autorizzati.
4. Ricerca pubblica Wikidata manuale/massiva limitata, riconciliazione azienda+Paese e blocco di fonti in conflitto.
5. **Nuovo** Brave Search API per il **solo nome azienda**, cap giornaliero persistente e bloccante (`RADIX_BRAVE_DAILY_LIMIT`, 0 di default), chiave esclusivamente sul Mac, opt-in esplicito (`RADIX_BRAVE_ENABLED=1`), conferma singola richiesta e approvazione umana per dominio. Le chiamate possono essere fatturate dal provider; **nessuna chiamata Brave reale è stata effettuata qui**.
6. Conversione del backup originale dell'agente (schema `data.records`) in formato RADIX nativo; preserva dati whitelist, deduplica, identifica azienda e propone prospect ICP senza caricamento automatico.
7. Suddivisione dei backup troppo grandi in parti indipendenti entro 4.000 contatti e 1,5 MB ciascuna; l'interfaccia fa scaricare ogni parte e richiede salvataggi separati.
8. Selezione assistita di contatto per una azienda nella pagina Lead Intelligence: confronto nome azienda, dominio, Paese e identità del profilo. Solo precompilazione del referente dopo conferma; email, basi giuridiche, checkbox privacy e CRM restano da controllare e approvare personalmente.
9. Scoring ICP, gestione storico/review, email bozza, to-do, handoff azienda/referente/lead in CRM presenti nell'integrazione originale. Restano necessari test reali del DB e dell'intero percorso.
10. Waterfall multi-provider ancora **offline**: i listini e costi sono soltanto simulazioni; Hunter, Dropcontact, Snov, Prospeo, Findymail, Apollo, PDL non vengono chiamati.

## Prove effettivamente svolte

- **25/25 test di unità offline** eseguiti con Node.js 22 su moduli di conversione, profili, revisione manuale, confronto referente/azienda, quote/provider e HTTP Brave con risposta mock. Tutti superati (0 fail). Questo è un **sottoinsieme isolato**, non la suite RADIX completa.
- Nuovi test di wiring/HTML/route presenti nel branch `tests/lead-operational-wiring.test.js` e `tests/lead-brave-provider-wiring.test.js`; **non ancora eseguiti sull'intero repository**.
- **453/453** test dell'intero repository superati sul precedente commit `e78b8a9` dall'utente sul Mac. Il risultato **non dimostra** la compatibilità del codice nuovo.
- Vercel segnala i deployment della Preview **READY**. La pagina protetta da SSO e l'end-to-end non sono stati verificati con browser autenticato.
- Nessuna prova live LinkedIn/Brave, nessuna email commerciale inviata, nessun acquisto di crediti.

## Blocchi ancora esterni allo sviluppo

1. Eseguire dal Mac sul commit finale del branch:
   `node --test tests/*.test.js tests/*.test.cjs labs/qwen/*/*.test.js`.
2. Collaudo locale login manuale/ricerca e correzione di 3–5 contatti, arresto, ricampionamento, esportazione e importazione nella Preview.
3. Verificare che `LEAD_DATABASE_URL` sia attivo nel **Preview integration** e applicare, dopo backup e revisione autorizzata, le migrazioni Lead richieste (inclusa `migrations/sales/006_lead_contact_jobs.sql`). Il branch PR non dispone del medesimo database Preview. **Mai** usare `DATABASE_URL` per il modulo Lead.
4. Test end-to-end in workspace autorizzato: salva contatti, ricarica, esamina correlazioni azienda/persona, controlla duplicati, approva e crea esplicitamente azienda/referente/opportunità. Attuale CRM potrebbe non memorizzare email o provenienza nella scheda contatto.
5. Prima di attivare Brave: creare account e chiave sul tuo Mac, scegliere un limite di richieste e verificare prezzi/consenso; test con 1 azienda non personale. Tutte le altre API email provider richiedono scelta e specifiche proprie.
6. Sincronizzare la PR con il branch di integrazione che è avanzato durante il lavoro e verificare assenza conflitti, eseguendo la suite completa. Nessuna modifica a produzione.

## Sequenza sul Mac

```bash
cd ~/radix-platform
git fetch origin
git switch chatgpt/lead-bulk-reconcile-providers-20261016
git pull --ff-only origin chatgpt/lead-bulk-reconcile-providers-20261016
node --test tests/lead-local-handoff.test.js tests/lead-contact-crm-stage.test.js tests/linkedin-contact-review.test.js tests/lead-provider-budget.test.js tests/lead-brave-lookup.test.js tests/lead-operational-wiring.test.js tests/lead-brave-provider-wiring.test.js
node --test tests/*.test.js tests/*.test.cjs labs/qwen/*/*.test.js
cd tools/linkedin-local-agent
npm start
```

Aprire `http://127.0.0.1:4317` sul Mac. Il provider Brave è **spento** con le impostazioni predefinite; è utilizzabile solo con le tre variabili locali indicate nelle istruzioni aggiornate `docs/linkedin-local-agent.md`. Accedere alla Preview dall'app browser autenticata Vercel, non a `radix-platform.vercel.app/lead-intelligence.html` (file non ancora su `main`).

**Criterio di rilascio:** ogni blocco necessario al caso d'uso deve avere un collaudo effettivo; un deployment READY non equivale a collaudo. Non effettuare merge senza approvazione esplicita.
