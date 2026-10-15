# RADIX Lead Intelligence — Provider Connection (Preview)

Updated 2026-10-15. Branch: `integration/radix-unified-platform-20261013`. No production deployment or production DB changes.

## What is implemented

- Browser-local contact workbench, distinct from the company-only lead list (limit 250 per list). Imports provider JSON records and Captain Data-style async callback payloads, up to 500 contacts per internal chunk; repeated uploads with the same batch UID are idempotent, different content with the same UID is rejected.
- Contact-level fields and source URL; export CSV with spreadsheet-formula escaping; explicit local JSON backup and restore; last 20 records preview. No implicit upload to RADIX or a provider.
- Read-only Captain Data API key test, accessible through the existing authenticated `/api/sales` handler. This test does not launch paid actions.

## To set up together with the user

1. Confirm with Captain Data that their current plan supports the user's **Sales Navigator Advanced Plus** license and intended use, as well as applicable LinkedIn terms. Their older compatibility documentation explicitly lists Sales Navigator Core, not necessarily Advanced Plus. Do not assume support or permission.
2. Set a genuine `CAPTAIN_DATA_API_KEY` only in the **Vercel Preview** environment; never commit it or paste it into the browser or chat. Redeploy Preview to apply.
3. Sign in to RADIX Preview and select the existing Lead Intelligence workspace (in Archivio). Use the **Controlla configurazione** control, then **Testa chiave API (sola lettura)**; owner/admin membership is required to test. Backend performs GET `https://api.captaindata.com/v4/users` using `X-API-Key` with an 8-second timeout. API key is not returned.
4. Use a provider-generated authorized data export or callback JSON. In `Motore contatti`, provide the HTTPS source, select a .json file, and press `Acquisisci lotto contatti`. Callback `run_uid` and `batch_uid` automatically become a stable idempotency key. Save the JSON backup before leaving; optionally export CSV.

## Not yet implemented

- No live execution of Captain Data actions, identity management or login, and no automatic Sales Navigator search/pagination. **No LinkedIn login credentials or cookies are handled by RADIX.**
- No authenticated inbound provider webhook endpoint or persistent person-level DB archive yet; use explicit local JSON backup. The existing Neon `sales_lead_lists` archive stores a different company-centric schema and has a separate 250-company limit.
- No claim of a fully functioning authorized data acquisition workflow until vendor compatibility, authorization, cost, sample payload, connectivity, and end-to-end tests have been verified.

## Architecture/next steps

1. Verify provider identity/API support and authorization before designing any outbound paid action. Require a separate explicit confirmation before triggering costs.
2. Add Preview-only `sales_lead_contact_jobs` migration, workspace-scoped authorization, versioned insert/update/read, and replay-safe batch ingestion. Manually migrate **only** the isolated `LEAD_DATABASE_URL` Preview branch after review; do not modify the shared database.
3. Add an authenticated webhook with a separate signed callback secret and replay check for provider async callbacks; do not store callback tokens or social network credentials in client code.
4. Validate a provider-generated 50-contact sample end-to-end, then 200 and 500 contacts, verify error handling and deduplication, and finally connect approved CRM handoff.

## Files

- `lib/lead-provider-contacts.js` normalizes external provider results.
- `lib/lead-provider-callback.js` validates provider callback run/batch IDs.
- `lib/lead-contact-batches.js` merges idempotent contact batches.
- `sales/lead-contact-workbench.js` provides browser staging, backup, CSV, and Preview connection checks.
- `api/_lead_provider_client.js` contains the Preview-only, read-only server API test.
- `api/_sales.js` enforces RADIX session and workspace membership before provider readiness/test routes.
