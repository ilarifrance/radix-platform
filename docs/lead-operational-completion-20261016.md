# RADIX Lead Intelligence — handover operativo, 16 ottobre 2026

## Obiettivo effettivo

Pipeline prevista: ricerca Sales Navigator → checkpoint locale → revisione e completamento dei campi visibili → normalizzazione/deduplica → proposte di domini da Wikidata → qualificazione ICP → revisione umana → archivio autorizzato → CRM (azienda, referente, lead, task). Nessun login LinkedIn, cookie, email inventate o API commerciali acquistate in RADIX.

## Codice completato in PR #18

- `lib/lead-local-handoff.js`: conversione dello schema dell'agente locale `{sourceUrl,data:{records:[]}}` nel vero formato `version:1` del motore contatti, con validazione URL LinkedIn, whitelist dei campi, deduplica, controprova origine, qualità e statistiche.
- `lib/lead-local-handoff-ui.js` e `lead-intelligence.html`: area visibile per leggere il JSON originale, riepilogo e conflitti, importazione esplicita dei contatti nella sessione browser, download del backup convertito e trasferimento esplicito di aziende candidate nella lista ICP, preservando l'ICP attuale e rifiutando il superamento di 250 prospect.
- `lib/linkedin-profile-review.js`: scelta massima di 20 profili incompleti per passaggio, URL consentiti soltanto LinkedIn, confronto nomi, completamento conservativo soltanto da campi renderizzati espliciti; non sovrascrive valori già presenti.
- `tools/linkedin-local-agent/index.js`: nuova route localhost `POST /api/profile-review` con browser dell'utente, stop, checkpoint ad ogni visita e blocco durante acquisizione contemporanea. Ogni nuova visita richiede un'azione esplicita nell'interfaccia. Nessuna visita in background o oltre il limite per richiesta.
- `tools/linkedin-local-agent/index.html`: pulsante di revisione visiva, progress, stop e avvertenze.
- `docs/linkedin-local-agent.md`: procedura reale di importazione (precedente istruzione di caricare direttamente il JSON originario nel vecchio input era incompatibile).
- Test offline puri: `tests/lead-local-handoff.test.js` (5) e `tests/linkedin-profile-review.test.js` (3).

## Evidenze tecniche ottenute

I **8 test unitari nuovi** sono stati eseguiti in Node con i moduli nativi `lead-contact-batches` e `salesnav-source`, con **8 successi, 0 errori**. `node --check` dei moduli offline superato nel workspace di sviluppo. Non equivale al test dell'intero repository.

Convertitore applicato offline a quattro CSV già presenti nella conversazione, ricostruiti in memoria come checkpoint locali:
- Lotto 20: 20 contatti, 18 aziende candidate, 2 senza azienda.
- Lotto 40: 40 contatti, 3 aziende candidate, 37 senza azienda.
- Lotto 30: 30 contatti, 20 aziende candidate, 10 senza azienda.
- Lotto 10: 10 contatti, 0 aziende candidate, 10 senza azienda.
Questi risultati dimostrano il limite dei dati originari; non sono un collaudo live LinkedIn né una verifica delle ragioni della mancanza dei dati. Nessun nome personale è riportato in questo report.

La Preview Vercel del branch è in stato READY, **non verificata tramite browser autenticato**. Protezione SSO Vercel attiva.

## Funzioni precedenti disponibili nella base di integrazione

- Formati di importazione aziendali CSV/TSV/XLSX; lotti contatti JSON e backup, deduplica.
- Wikidata come sorgente pubblica di suggerimento domini, sempre con conferma.
- ICP e scoring, revisione prospect, email bozze non inviate, follow-up/to-do.
- CRM handoff di azienda, referente e lead con ricerca duplicati e conferme manuali.
- `lib/lead-provider-waterfall.js` quotazione offline e `lib/lead-brave-domain.js` parser offline; **nessuna ricerca Brave né email finder attiva**.

## Blocchi da non mascherare

1. **Suite integrale dopo queste modifiche:** la precedente suite sul commit `e78b8a9` era 453/453. Va ripetuta dal nuovo HEAD e dall'integrazione aggiornata, con cui il branch risulta divergente. Nessun GitHub Actions è stato trovato come test automatico su questo commit.
2. **LinkedIn reale:** serve il Mac dell'utente, login personale e collaudo di 3–5 profili nella pagina visibile; verificare i selettori, i limiti e l'eventuale necessità di autorizzazione contrattuale.
3. **Database Preview:** Vercel espone `LEAD_DATABASE_URL` per la sola Preview del branch `integration/radix-unified-platform-20261013`, non per la Preview di PR #18. Nessuna scrittura è stata provata; non ripiegare su `DATABASE_URL`. Richiede migrazione Lead e test di salvataggio/rilettura sul branch autorizzato.
4. **API commerciali:** chiavi, budget, prezzi, autorizzazioni e basi legali non ancora forniti. Brave è un parser offline; Hunter, Dropcontact, Snov, Prospeo, Findymail, Apollo e PDL sono inattivi. Non sostenere che gli indirizzi siano stati trovati/verificati.
5. **End-to-end in CRM:** disponibile flusso manuale, ma non è stato collaudato su workspace con contatti importati; il current CRM potrebbe non memorizzare email nei contatti.
6. **PR:** sempre DRAFT, base `integration/radix-unified-platform-20261013`, mai fondere senza approvazione esplicita dell'utente. Nessun cambiamento in `main`, deployment production o variabili ambiente.

## Come collaudare sul Mac

```bash
cd ~/radix-platform
git fetch origin
git switch chatgpt/lead-bulk-reconcile-providers-20261016
git pull --ff-only origin chatgpt/lead-bulk-reconcile-providers-20261016
node --test tests/lead-local-handoff.test.js tests/linkedin-profile-review.test.js
node --test tests/*.test.js tests/*.test.cjs labs/qwen/*/*.test.js
```

Dopo i test: avvia `cd tools/linkedin-local-agent && npm start`, apri `http://127.0.0.1:4317`, usa un job locale esistente, prova `Esamina max 20 profili incompleti` solo se autorizzato e misura campi migliorati/non migliorati. Scarica backup JSON, apri **la Preview PR**, usa **Importa il backup Sales Navigator dal tuo Mac**, controlla riepilogo, importa contatti, aggiungi aziende candidate ICP, approva e convalida. Per la persistenza occorre l'ambiente di integrazione con `LEAD_DATABASE_URL`, dopo decisione di merge e migrazione; poi verificare salvataggio/reload e associazione CRM senza duplicati.

## Requisito di rilascio

No merge / no produzione finché non esistono: suite completa superata sul commit attuale, prova Mac autorizzata, migrazione e database Lead isolato, test save/reload e handoff CRM, definizione di chi può utilizzare i provider a pagamento e con quale budget.
