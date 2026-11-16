# Sales Orbis: il CRM venduto come sito a sé

Stesso codice di RADIX (questo repository, nessuna copia), pubblicato come **secondo progetto Vercel** con un **database proprio e vuoto**. I dati del CRM dentro RADIX restano dove sono.

## Come si riconosce il prodotto

Tutte le regole stanno in `sales/crm-product.js`.

- **Host:** `sales-orbis.*`, `sales-orbis-*.vercel.app` (il progetto Vercel «sales-orbis») oppure `crm.*`.
- **Deploy:** con `RADIX_PRODUCT=sales-orbis` ogni richiesta alle API è trattata come prodotto, qualunque sia l'host.
- **Pagine:** solo quelle in `PAGES` (CRM, Pipeline, Posta, Vendite, Lead Intelligence, LinkedIn, Campagne, Progetti commerciali, Impostazioni). Ogni altro indirizzo torna a `/crm` (`vercel.json`, test `tests/crm-product.test.js`).
- **API:** solo `auth`, `sales`, `chat` (agenti `crm-*` e `comm-*`), `parse-file`, `ms-oauth`, `admin` (solo con `ADMIN_SECRET`) e, fra le integrazioni, `status`, `send-email` e `send-queue`. Le altre rispondono 404 (`api/_product.js`, test `tests/sales-orbis-api.test.js`).

## Marchio

Sul prodotto nessun testo dice RADIX: `brand()` in `sales/crm-product.js` cambia «RADIX» e «Sales Orbit» in «Sales Orbis» in ogni testo dell'interfaccia (dopo la traduzione, in `lib/radix-i18n.js`), `applyHead()` mette icona (`sales/icons/sales-orbis.svg`) e manifest (`sales-orbis.webmanifest`) del prodotto. Il menu non ha il globo Sales Orbit né la guida esterna, i link a pagine RADIX restano nascosti (`html[data-product]` in `sales/sales-nav.css`) e la Regia RADIX non si carica: l'assistente è il Copilota del CRM. Test: `tests/sales-orbis-brand.test.js`.

## Accesso

`api/_auth_guard.js`: dopo 8 accessi sbagliati in 15 minuti per la stessa email (30 per lo stesso indirizzo) l'accesso risponde 429; «Password dimenticata?» manda un link firmato valido 30 minuti e usabile una volta sola (`/crm#reset=…`), con la stessa risposta che l'email esista o no. Gli errori del database non arrivano più a chi accede. I tentativi stanno in `auth_attempts` (`migrations/sales/022`); un database senza quella tabella (oggi RADIX) funziona come prima, senza limite. Test: `tests/auth-guard.test.js`.

## Piani

`api/_sales_plan.js` (migrazione `migrations/sales/023`): ogni workspace ha un piano, `prova` (tutto, il predefinito), `base` (tutto tranne Lead Intelligence) o `completo` (tutto). Sul prodotto, con `base`, le risorse di Lead Intelligence in `/api/sales` rispondono 403, il menu non mostra Lead Intelligence e la pagina dice che è nel Completo; Impostazioni › CRM mostra il piano. RADIX non applica i piani. Il piano lo cambia chi lo vende, mai il cliente: `node tools/sales-orbis/db.js plan --workspace <id> --plan base` (poi i pagamenti, passo 10). Durata della prova e prezzi: da decidere. Test: `tests/sales-orbis-plan.test.js`.

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
