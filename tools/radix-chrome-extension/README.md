# RADIX — Importa in RADIX (estensione Chrome)

Estensione Chrome (Manifest V3) che porta in RADIX i contatti **visibili** in una ricerca persone o in una lista lead di LinkedIn Sales Navigator. Sostituisce, come modo consigliato, l'agente locale da terminale (`tools/linkedin-local-agent`), che resta disponibile.

Si usa nel proprio Chrome di tutti i giorni, già collegato a LinkedIn: niente terminale, niente Node.js, niente browser separato.

## Installazione (5 minuti, una volta sola)

1. Scarica la cartella `tools/radix-chrome-extension` (oppure lo zip che ti abbiamo mandato ed estrailo).
2. In Chrome apri `chrome://extensions`.
3. In alto a destra attiva **Modalità sviluppatore**.
4. Premi **Carica estensione non pacchettizzata** e scegli la cartella `radix-chrome-extension` (quella che contiene `manifest.json`).
5. Fissa l'icona viola **R** nella barra di Chrome (icona puzzle › puntina).

Se Sales Navigator era già aperto, **ricarica la pagina** dopo l'installazione.

## Collegamento a RADIX (una volta ogni 14 giorni)

1. In RADIX apri **Lead Intelligence**, scegli il workspace nell'**Archivio** e premi **Collega estensione Chrome**.
2. Premi **Copia codice**.
3. Apri l'estensione (icona **R**), incolla il codice e premi **Collega a RADIX**.

Il codice permette all'estensione **solo** di creare nuovi lavori di contatti in quel workspace: non può leggere il CRM, modificare o cancellare nulla. Scade dopo 14 giorni; se vieni rimosso dal workspace smette subito di funzionare. Non condividerlo.

Per una **Preview** di RADIX genera il codice dalla Preview stessa: il codice contiene già l'indirizzo giusto. Chrome chiederà il permesso di contattare quell'indirizzo (nelle **Impostazioni** dell'estensione). L'indirizzo si può anche cambiare a mano nelle Impostazioni; di norma resta `https://radix-platform.vercel.app`. Se la Preview è protetta da Vercel, devi aver effettuato l'accesso a Vercel nello stesso Chrome.

## Importare i contatti

1. Apri in Sales Navigator una **ricerca persone** (`/sales/search/people`) o una **lista lead** (`/sales/lists/people/…`).
2. Apri l'estensione: vedi quante persone sono visibili nella pagina.
3. Scegli il massimo (25, 100, 250 o 1000) e premi **Importa in RADIX**. In basso a destra nella pagina compare il badge **R** con l'avanzamento e il tasto **Ferma**.
4. L'estensione scorre la pagina, legge le schede visibili e preme **Avanti** con pause casuali di alcuni secondi, come farebbe una persona. Puoi chiudere il popup; lascia aperta la scheda.
5. Alla fine invia i contatti a RADIX: in **Lead Intelligence › Contatti individuali › Archivio contatti RADIX** premi **Aggiorna archivio** e apri il lavoro «LinkedIn Sales Navigator · data · N contatti».

Se l'invio non riesce (rete, collegamento scaduto) i contatti restano nell'estensione: premi **Invia a RADIX** dopo aver risolto, oppure **Backup JSON** e poi in Lead Intelligence **Riprendi backup** (stesso formato del «Backup RADIX JSON» dell'agente locale).

Campi importati: nome completo, nome, cognome, ruolo, azienda, località, link al profilo Sales Navigator, fonte (URL della ricerca). I campi non visibili restano **vuoti**: l'estensione non apre i singoli profili e non indovina email o telefoni.

## Limiti tecnici e rischio legale

- **LinkedIn vieta l'estrazione automatizzata nei suoi termini d'uso, anche se sei tu ad accedere con il tuo account.** L'account può essere limitato o sospeso. Usa l'estensione solo dove consentito e con una base giuridica per trattare dati personali (GDPR): informativa, finalità, conservazione e opposizione restano a tuo carico.
- Legge solo ciò che è visibile nella pagina. Non legge i cookie, non usa API nascoste di LinkedIn, non nasconde di essere un'automazione, non ruota proxy e non risolve CAPTCHA.
- Si ferma da sola a qualsiasi pagina di accesso, verifica (checkpoint) o CAPTCHA: completala tu e riparti.
- **Non è stato fatto alcun test su Sales Navigator reale con un account autenticato.** I selettori sono euristiche testate su una pagina finta: se LinkedIn cambia l'interfaccia possono servire aggiornamenti. Il numero di contatti dipende da ciò che LinkedIn mostra.
- Massimo 1000 contatti per importazione e 40 lavori per workspace (limite dell'archivio RADIX). Per volumi maggiori fai più importazioni, distanziate nel tempo.
- Nessun servizio a pagamento e nessun CRM intermediario.

## Per sviluppatori

- `src/extract.js` lettura delle schede visibili (porting di `lib/linkedin-browser-extract.js`) · `src/core.js` logica pura (codice di collegamento, dedupe, lotti, payload, invio) · `src/lead-contact-batches.js` copia identica di `lib/lead-contact-batches.js` (un test ne verifica l'uguaglianza: se cambi la libreria, ricopiala).
- Lato server: `api/_lead_import_token.js` (token HMAC derivato da `JWT_SECRET`, scope `lead-import`, 14 giorni, nessuna tabella nuova) instradato da `api/sales.js`. Header `Authorization: Bearer rli1…` + `x-radix-sales: 1`; permette solo `lead_contact_jobs` `create` nel workspace del token e la verifica `GET /api/sales?entity=lead_import_check`. Nessuna modifica CORS: le richieste partono dal service worker con `host_permissions`.
- Test: `node --test tests/radix-chrome-extension.test.js tests/lead-import-token.test.js`. Test del content script su una pagina Sales Navigator finta (Chromium di Playwright, nessun accesso a LinkedIn): `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node --test tools/radix-chrome-extension/test/content.e2e.js` (usa Playwright installato globalmente o nel progetto).
- Icone: `node tools/radix-chrome-extension/scripts/make-icons.js`.
- Zip da condividere (senza npm): `sh tools/radix-chrome-extension/scripts/pack.sh` crea `~/radix-chrome-extension.zip` (oppure il percorso passato come argomento). Su Windows/macOS va bene anche «Comprimi» sulla cartella.
