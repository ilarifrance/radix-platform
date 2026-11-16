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
| caselle email e Microsoft 365 | come nel CRM di RADIX, con credenziali del prodotto |

Dominio, database di produzione, chiavi e pagamenti: solo con l'ok esplicito di Francesco.
