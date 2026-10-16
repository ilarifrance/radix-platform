# RADIX Lead Intelligence — consegna tecnica parziale (2026-10-16)

## Ambito e branch

Branch: `chatgpt/lead-bulk-reconcile-providers-20261016`, creato da `integration/radix-unified-platform-20261013`. Nessun merge o scrittura su `main`. Nessun database, webhook, configurazione Vercel o API commerciale modificati.

## Realizzato

- Importato il motore puro `lib/lead-domain-suggestions.js`: riunisce le proposte di dominio per azienda e paese, segnala conflitti tra fonti e non approva nulla.
- Il controllo del lotto nell'agente locale ora passa le proposte Wikidata al motore di riconciliazione. Vengono mostrati un riepilogo e l'esito per azienda; la conferma umana resta necessaria, con salvataggio nel lavoro locale solo tramite il percorso già esistente.
- Il raggruppamento delle ricerche tiene conto del paese **solo se presente nell'acquisizione**; in sua assenza il nome non diventa automaticamente una prova di identità aziendale. Le corrispondenze proposte restano non verificate.
- `lib/lead-brave-domain.js` interpreta **offline** una risposta Brave Search già ottenuta per altre vie e ne propone domini non verificati; **nessuna richiesta Brave è attiva**.
- `lib/lead-provider-waterfall.js` registra 7 candidate commerciali (Hunter, Dropcontact, Snov.io, Prospeo, Findymail, Apollo, People Data Labs) e Brave Search per ricerca domini, con status disabilitato. Il modulo confronta **prezzi EUR inseriti dall'utente**, calcola un tetto di spesa teorico prudenziale nell'ipotesi che tutti i provider falliscano e non trasferisce nominativi fuori dal client.
- Nuovi test: `lead-domain-suggestions.test.js`, `lead-provider-waterfall.test.js`, `lead-bulk-reconcile-ui.test.js`, `lead-local-provider-routes.test.js`.
- Audit di tariffe e condizioni in `docs/lead-intelligence/provider-audit-2026-10-15.md`: verificare nuovamente i prezzi e il costo effettivo dei risultati prima di sottoscrivere un servizio.

## Non ancora realizzato o verificato

- Accesso API con chiavi Brave / Hunter / Dropcontact / altri: **non collegato** e nessuna chiamata o credito consumato.
- Ricerca automatizzata del sito ufficiale su una seconda fonte: **non implementata**. Brave è soltanto un adapter di risposta disattivato.
- Verifica reale dell'arricchimento gratuito sui 20 contatti salvati sul Mac: **non eseguita**. Dati locali non accessibili in questa sessione.
- Collaudo completo end-to-end Lead → CRM: **non eseguito**.
- Suite completa Node: **da eseguire**. I controlli statici eseguiti sul codice remoto non provano il passaggio dei test.
- L'eventuale quota gratuita Brave non equivale a un permesso di chiamata gratuita illimitata.

## Prove prima della PR

Dal Mac, quando disponibile:

```bash
cd ~/radix-platform
git fetch origin
git switch chatgpt/lead-bulk-reconcile-providers-20261016
git pull origin chatgpt/lead-bulk-reconcile-providers-20261016
node --test tests/lead-domain-suggestions.test.js tests/lead-provider-waterfall.test.js tests/lead-bulk-reconcile-ui.test.js tests/lead-local-provider-routes.test.js tests/lead-free-bulk-ui.test.js
node --test tests/*.test.js tests/*.test.cjs labs/qwen/*/*.test.js
```

Solo dopo risultato reale documentato, aprire una PR verso `integration/radix-unified-platform-20261013`. Non fondere automaticamente. Nessuna prova LinkedIn da ripetere per i test offline.
