# RADIX Lead Intelligence — Captain Data / Contact Jobs
Updated 2026-10-15. Integration branch `integration/radix-unified-platform-20261013`.

## Implemented on branch
- Person-level JSON provider mapper with individual full name, first/last name, role, company, domain, profile, email, phone and source.
- Reusable multi-batch contact workbench with deduplication and idempotent batch identifiers, local JSON backup and CSV export.
- Versioned contact-job API (`/api/sales?entity=lead_contact_jobs&workspace=<id>`) and workspace-scoped SQL store using isolated Preview-only `LEAD_DATABASE_URL`. CRUD requires RADIX login and membership; deletion/saving requires write permissions.
- Preview-only inbound callback receiver reusing existing `/api/sales` function (no new Vercel function). It authenticates a static secret header with constant-time comparison, validates workspace and job UUIDs and exact `run_uid` binding, rejects Production, merges batches using optimistic versioning and rejects conflicting retries.
- Captain Data credential read-only health check at `GET /v4/users/{user_uid}`, using server environment only. It does not launch paid actions.
- Cockpit visual updates to contacts panel, color-coded metrics, better vault hierarchy and responsive layout.

## Required operational setup (NOT DONE)
1. **Authorize and verify provider/legal compatibility.** Captain Data automates third-party services and does not establish independent LinkedIn permission to scrape. Confirm actual Sales Navigator Advanced Plus support, permitted datasets, commercial terms and pricing before requesting an action. RADIX never needs the user's LinkedIn password or cookies.
2. **Review/apply migration** `migrations/sales/006_lead_contact_jobs.sql` to the isolated Preview Neon `LEAD_DATABASE_URL` only. Never run on `DATABASE_URL` or production. No migration is applied automatically by this commit.
3. **Configure Preview-only environment variables** securely in Vercel: `CAPTAIN_DATA_API_KEY`, `CAPTAIN_DATA_USER_UID` (provider user UID from the Captain Data workspace) and `CAPTAIN_DATA_CALLBACK_SECRET` (a fresh high-entropy secret of at least 32 characters). Redeploy Preview. Never put secrets in GitHub, the browser or chat.
4. **Verify read-only connection** in RADIX Lead Intelligence: select Preview workspace in the Lead archive; click `Controlla configurazione` and then `Testa chiave API` as owner/admin. The verified API URL is `https://api.captaindata.com/v4/users/{user_uid}`.
5. **Authorize/start the action externally** after compatibility and pricing approval. Captain Data's documented asynchronous action endpoint is `POST /v4/actions/salesnavigator-search-people/run/async`; RADIX does not currently initiate this call.
6. **Bind the provider run**: import a legitimate provider JSON batch to create the RADIX work, enter the real `run_uid` and save the work to the Preview archive. Click `Copia URL callback del lavoro`. Configure Captain Data's callback with that HTTPS URL and `X-Radix-Provider-Token: <matching server secret>` in its configurable callback headers. This shared-secret header is authentication, not a provider-generated HMAC message signature.
7. **Protected Vercel Preview:** Because the preview is authenticated, configure an authorized Vercel *Protection Bypass for Automation* secret, and set it in the provider callback headers as `x-vercel-protection-bypass`. Keep `X-Radix-Provider-Token` as a *separate*, independently generated application-level secret. Do **not** disable Vercel Authentication or expose secrets in GitHub, URLs, or the browser. Do not create a new bypass secret or change access policy without user authorization. See https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation.
8. **Run a small end-to-end test** with an authorized sample, then confirm returned field formats, multiple pages/batches, retries, persistence, deduplication, retention and CRM handoff before wider use. Backend returns 409 for concurrent version conflicts, allowing retry.

## Still to verify or build
- End-to-end provider callback delivery with a genuine Captain Data account and documented response payload.
- Actual Preview Neon migration and authenticated read/write test against that database.
- Automated outbound job creation, account identity integration, price authorization controls and more advanced enrichment/contact-to-CRM linking. No LinkedIn mass extraction is active.
- Final visual screenshot comparison in an authenticated browser and responsive device testing.

## References
- Captain Data async action: https://docs.captaindata.com/v4/api/actions/salesnavigator-search-people-async
- Captain Data GET user: https://docs.captaindata.com/v4/api/users/get
- Existing Preview: https://radix-platform-git-integration-r-6f2769-radix-innovation-studio.vercel.app/lead-intelligence.html
