# Sales Orbis: il CRM venduto come sito a sé

Stesso codice di RADIX (questo repository, nessuna copia), pubblicato come **secondo progetto Vercel** con un **database proprio e vuoto**. I dati del CRM dentro RADIX restano dove sono.

## Come si riconosce il prodotto

Tutte le regole stanno in `sales/crm-product.js`.

- **Host:** `sales-orbis.*`, `sales-orbis-*.vercel.app` (il progetto Vercel «sales-orbis»), `salesorbis.*`, `app.salesorbis.*` oppure `crm.*`.
- **Deploy:** con `RADIX_PRODUCT=sales-orbis` ogni richiesta alle API è trattata come prodotto, qualunque sia l'host.
- **Pagine:** solo quelle in `PAGES` (CRM, Pipeline, Posta, Vendite, Lead Intelligence, LinkedIn, Campagne, Progetti commerciali, Impostazioni). Ogni altro indirizzo torna a `/crm` (`vercel.json`, test `tests/crm-product.test.js`).
- **API:** solo `auth`, `sales`, `chat` (agenti `crm-*` e `comm-*`), `parse-file`, `ms-oauth`, `admin` (solo con `ADMIN_SECRET`) e, fra le integrazioni, `status`, `send-email` e `send-queue`. Le altre rispondono 404 (`api/_product.js`, test `tests/sales-orbis-api.test.js`).

## Marchio

Sul prodotto nessun testo dice RADIX: `brand()` in `sales/crm-product.js` cambia «RADIX» e «Sales Orbit» in «Sales Orbis» in ogni testo dell'interfaccia (dopo la traduzione, in `lib/radix-i18n.js`), `applyHead()` mette icona (`sales/icons/sales-orbis.svg`) e manifest (`sales-orbis.webmanifest`) del prodotto. Il menu non ha il globo Sales Orbit né la guida esterna, i link a pagine RADIX restano nascosti (`html[data-product]` in `sales/sales-nav.css`) e la Regia RADIX non si carica: l'assistente è il Copilota del CRM. Test: `tests/sales-orbis-brand.test.js`.

## Accesso

`api/_auth_guard.js`: dopo 8 accessi sbagliati in 15 minuti per la stessa email (30 per lo stesso indirizzo) l'accesso risponde 429; «Password dimenticata?» manda un link firmato valido 30 minuti e usabile una volta sola (`/crm#reset=…`), con la stessa risposta che l'email esista o no. Gli errori del database non arrivano più a chi accede. I tentativi stanno in `auth_attempts` (`migrations/sales/022`); un database senza quella tabella (oggi RADIX) funziona come prima, senza limite. Test: `tests/auth-guard.test.js`.

## Piani

`api/_sales_plan.js` (migrazioni `migrations/sales/023` e `024`). Prezzi IVA inclusa, per utente al mese; i limiti sono per utente, per workspace e per mese di calendario (ora di Roma) e si azzerano il primo del mese.

| Piano | Prezzo | Include | Copilota (richieste AI) | Ricerche email a pagamento | Email in coda |
|---|---|---|---|---|---|
| `completo` | 8 € | il CRM | no | no | 1.000 |
| `avanzato` | 17 € | CRM e Copilota | 140 | no | 1.000 |
| `extreme` | 59 € | CRM, Copilota e Lead Intelligence | 350 | 300 | 1.500 |
| `prova` | gratis | tutto | 100 | 50 | 300 |

Margini al limite (stime, netto IVA 22%, quota fissa circa 2 € a utente con 20 clienti, commissione carta 1,5% + 0,25 €, AI circa 0,03 € a richiesta su Sonnet 5.5, ricerca a pagamento circa 0,035 €): Completo circa 64%, Avanzato circa 52%, Extreme circa 50%. Gli invii partono dalle caselle del cliente e non costano: il limite protegge la reputazione delle caselle.

Sul prodotto: senza Lead Intelligence nel piano le risorse di Lead Intelligence in `/api/sales` rispondono 403, il menu non la mostra e la pagina dice che è in Extreme; con `completo` `/api/chat` risponde 403 e il pulsante del Copilota sparisce; oltre il limite `/api/chat`, la ricerca email a pagamento e la messa in coda rispondono 429 (`sales_plan_usage`, preso prima e restituito se la chiamata fallisce). Impostazioni › CRM mostra piano, limiti e uso del mese. Prima della migrazione 024 il prodotto risponde 503 a queste tre azioni. RADIX non applica piani né limiti. Il piano lo cambia chi lo vende, mai il cliente: `node tools/sales-orbis/db.js plan --workspace <id> --plan avanzato` (poi i pagamenti, passo 10). Test: `tests/sales-orbis-plan.test.js`.

## Lead Intelligence guidata

In cima a Lead Intelligence il «Percorso guidato» (`sales/lead-guide-core.js`, `sales/lead-guide.js`) dice il prossimo passo (prima lista, lead nel CRM, email mancanti, prima email) e lo stato di ogni fonte e servizio: estensione Chrome, file CSV/Excel e JSON e ricerca email gratuita sono sempre pronti; Captain Data, Hunter, Apollo e Dropcontact risultano «da collegare» finché il progetto non ha le loro chiavi (`CAPTAIN_DATA_API_KEY` e `CAPTAIN_DATA_USER_UID`, `HUNTER_API_KEY`, `APOLLO_API_KEY`, `DROPCONTACT_API_KEY`), da decidere con Francesco. Captain Data oggi è spento in produzione per scelta del codice (`api/_lead_provider_client.js`). Il percorso legge soltanto: nessuna ricerca parte da lì. Test: `tests/lead-guide.test.js`.

## Database separato

Il database va creato solo con l'ok di Francesco. Poi, una volta sola, su quel database vuoto:

```sh
node tools/sales-orbis/db.js schema | psql "$SALES_ORBIS_DATABASE_URL"
SALES_ORBIS_OWNER_PASSWORD='…' node tools/sales-orbis/db.js owner --email … --name "…" --workspace "…" | psql "$SALES_ORBIS_DATABASE_URL"
```

`schema` crea la tabella degli account e le migrazioni `migrations/sales` in ordine, senza nulla di RADIX. `owner` crea il primo account, il suo workspace vuoto e il ruolo owner. Lo strumento stampa solo SQL: non si collega a niente e non legge password dalla riga di comando.

La prova è `tests/sales-orbis-db.test.js`: applica lo schema a un Postgres in memoria (PGlite, `npm i --no-save @electric-sql/pglite`), crea l'owner e usa la vera API del CRM. Senza quel pacchetto la parte database viene saltata.

## Variabili d'ambiente del progetto Vercel «sales-orbis»

Tutte nuove, mai le stesse di RADIX. I valori non vanno mai scritti nel repository.

| Variabile | A cosa serve |
| --- | --- |
| `RADIX_PRODUCT` | `sales-orbis` |
| `DATABASE_URL` | il database Sales Orbis (Neon), mai quello di RADIX |
| `JWT_SECRET` | firma delle sessioni: diversa da RADIX, così un accesso a RADIX non vale su Sales Orbis |
| `ADMIN_SECRET` | per `/api/admin/*` del prodotto |
| `ANTHROPIC_API_KEY` | l'AI del CRM, con un limite di spesa proprio |
| `CRON_SECRET` | la coda degli invii email |
| `PUBLIC_URL` | l'indirizzo pubblico del prodotto (https), per il link di «Password dimenticata» |
| `AUTH_SMTP_HOST`, `AUTH_SMTP_PORT`, `AUTH_SMTP_USER`, `AUTH_SMTP_PASS`, `AUTH_MAIL_FROM` | la casella che spedisce il link di «Password dimenticata»; senza, il recupero risponde «non ancora attivo» |
| caselle email e Microsoft 365 | come nel CRM di RADIX, con credenziali del prodotto |

Dominio, database di produzione, chiavi e pagamenti: solo con l'ok esplicito di Francesco.

## Sito di prova (progetto Vercel «sales-orbis»)

Il progetto Vercel `sales-orbis` (team Radix Innovation Studio) pubblica questo stesso repository con `RADIX_PRODUCT=sales-orbis`. È protetto dall'accesso Vercel del team, salvo i domini propri. Mancano ancora, a cura di Francesco:

1. **Database:** da Vercel › sales-orbis › Storage › Create Database › Neon, regione Francoforte, collegato a tutti gli ambienti. Imposta `DATABASE_URL`. L'account Neon è gestito da Vercel, quindi non si crea dal connettore Neon. Il progetto Neon di RADIX non va usato.
2. **`JWT_SECRET`:** una stringa casuale lunga, di tipo Sensitive, per Production e Preview.

Poi: `node tools/sales-orbis/db.js schema` sul database nuovo (migrazioni 001-024), un account di prova con dati finti e la pubblicazione del ramo. Facoltativi: `ANTHROPIC_API_KEY` (Copilota), `MAILBOX_ENC_KEY` (caselle email), `AUTH_SMTP_*` (password dimenticata), le chiavi dei servizi «Trova email» (Extreme), `PUBLIC_URL`.
