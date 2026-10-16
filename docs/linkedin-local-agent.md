# RADIX — LinkedIn Local Browser Agent · Preview only

This optional local module is independent of Captain Data and intermediary CRMs. It launches a visible Chromium browser, allows the user to sign in manually, then uses visible search cards and Next controls to build RADIX individual-contact job backups. It is scripted browser automation, **not an LLM agent** or a tested official LinkedIn integration.

## On your own computer

Requirements: Node.js 20+ and a Chromium-capable desktop.

From a local clone of the RADIX repo, run:

1. cd tools/linkedin-local-agent
2. npm install
3. npx playwright install chromium
4. npm start

Then open http://127.0.0.1:4317 in the same computer. Click **Apri Sales Navigator**, finish the LinkedIn sign-in yourself in the browser window, enter or prefill a Sales Navigator people search URL, then select a maximum between 1 and 5000 and click **Avvia agente**.

The local agent attempts to paginate the visible search results, records profile links/names/roles/companies when displayed, normalizes and deduplicates via RADIX native lib/lead-contact-batches.js, writes atomic checkpoint jobs under ~/.radix/linkedin-agent/jobs, and provides CSV or backup JSON. Session information is managed solely by the local Playwright-managed browser, with its private profile under ~/.radix/linkedin-agent/browser-profile. **Never share, commit or sync that directory.** The software does not request or export cookies or credentials and does not run on the Vercel server.

## Import to existing RADIX

Download **Backup RADIX JSON** from the agent running at `http://127.0.0.1:4317`. Open the matching Lead Intelligence **Preview** page, navigate to **Importa il backup Sales Navigator dal tuo Mac**, and select the ORIGINAL local JSON checkpoint. The file is inspected and normalized **only in the browser**:
1. Confirm the summary (raw records, unique people, missing companies, company-domain suggestions and identity conflicts).
2. Click **Carica contatti nel motore** to stage the transformed, native RADIX `version:1` job in the existing contact workbench. Recheck the confirmation shown by the workbench.
3. To persist the contact job, first select your authorized Preview workspace, then click **Salva contatti nel workspace** and confirm. This requires an operational isolated database and the Lead contact-job migration; opening a file alone does not upload anything.
4. Optionally click **Porta aziende alla qualificazione ICP** to add deduplicated company candidates (up to 250 total). Check missing country/domain, review sources and approve prospect records individually before taking CRM actions.
5. If the browser cannot pass the local File object to the native restore input, click **Scarica backup compatibile**, then use **Riprendi backup** with that downloaded converted file instead.

**Important:** Older instructions told users to upload the ORIGINAL local checkpoint directly into **Riprendi backup**; that was incompatible. The local agent stores people in `data.records`; the native RADIX restorer expects `records` at the top level. Use this bridge or the converted download. Neither path verifies an email address or creates a CRM lead automatically. The normal CRM handoff always requires manual prospect validation and confirmation.

The local JSON may contain personal data and the source's domain-approval evidence. The converter deliberately transfers only whitelisted contact fields; detailed original `freeEnrichment` provenance remains in the original local backup for audit and must be retained securely if required. Domain values do **not** certify the identity of a company.

## Optional visible-profile quality review

The search card export sometimes has a name/role but omits the employer: the four previously exported CSV samples (20/40/30/10 people) contain respectively 2/37/10/10 records with no company. This is not solved by CSV normalization alone.

If the user is authorized to access the individual profile data, select the local job under **Contatti ricevuti** and explicitly click **Esamina max 20 profili incompleti**. The agent navigates **up to 20 visible LinkedIn profile pages per request**, pauses if login/checkpoints appear and honours **Interrompi revisione** between pages. Data are accepted only if the visible profile name matches the saved contact identity. Only explicitly rendered `title`, `company-name` and `location` values can fill **empty** fields. No inferred employer, email, phone, hidden endpoint, cookie or credential is used.

Local `profileReview` checkpoints log the reviewed link, changed field names and a non-verified status, without storing the full page text. A page that does not expose an explicit company cannot be filled. **This browser interaction can be restricted by LinkedIn terms; use only when authorized.** No live authenticated test has been performed. The offline parser tests use mock visible fields, not real LinkedIn pages.

## Preview integration availability

As checked on 2026-10-16, the Vercel project has `LEAD_DATABASE_URL` configured only for the **integration branch's Preview environment**, not the feature branch's own PR Preview. Therefore this PR's Preview can stage data in browser memory and export backups, but **persistent workspace saves cannot be assumed operational there**. No fallback to `DATABASE_URL` is allowed. The integration branch must run the isolated Lead migration and pass the live workspace read/write/reload test when a merge is explicitly approved. Never point Lead data at production.

## Technical / legal boundaries

- LinkedIn restricts automated extraction under its terms, even if the user personally authenticates. An account may be limited or suspended. Use only where allowed and with a lawful basis for processing personal data.
- **No authenticated Sales Navigator end-to-end test has been performed**. The selectors are heuristics which may require updates for the current site UI, and the number of records depends on which fields are visibly rendered. It does not open each individual profile in v1. Missing fields remain empty, not invented.
- It does not solve CAPTCHA, bypass login checkpoints, conceal automation identity, rotate proxies or use hidden LinkedIn APIs. It stops when authentication is required.
- The server binds to 127.0.0.1 only and rejects non-local browser request origins. Do not expose it publicly.
- Jobs can be paused and resumed from local checkpoints, but UI changes or a changed search may prevent reliable resumption.
- No paid provider and no CRM intermediary are used.

Test from repo root: node --test tests/linkedin-local-agent.test.js. These unit tests do not prove real LinkedIn compatibility.

## Manual company correction (October 16 update)

If the visible Sales Navigator search result or subsequent profile review does not include an employer, select the original job under **Contatti ricevuti**, click **Correggi** on that person, inspect the source profile and type the fields you verified: role, employer, country or official company domain. Saving requires a confirmation; overwriting existing fields additionally requires an explicit overwrite confirmation, and changing an employer with an existing domain requires a separate domain-reconfirmation gate. No email or telephone is fabricated or changed.

Corrections are checkpointed in `~/.radix/linkedin-agent/jobs/<id>.json` under `manualReviews` with date and field names. Previous accepted public-domain evidence is marked superseded if the company or domain changes; it no longer counts as current evidence. Download a fresh RADIX backup before importing to the web Preview.

## Optional official Brave Search API

A second source for company website discovery has been implemented, but it is **off by default** and is not a LinkedIn integration. It sends **only the selected company name** to Brave Search, never contact name, LinkedIn URL, cookie, email or phone. The site returned is a **proposal**, not proof of company identity.

To make the **optional** button available, configure all of these environment variables *only in the local Mac process* (never commit or paste API keys into RADIX web pages):

- `BRAVE_SEARCH_API_KEY`: your own Brave Search API credential.
- `RADIX_BRAVE_ENABLED=1`: explicit enable flag.
- `RADIX_BRAVE_DAILY_LIMIT=5`: example daily **request** cap; allowed 1–100, default 0 (disabled).

Before each request, RADIX shows a confirmation warning that the Brave account may be billed. The server checks and reserves one unit **before** contacting the official `api.search.brave.com` endpoint, stores the daily counter in the private local file `~/.radix/linkedin-agent/brave-usage.json`, and blocks further requests when the cap is exhausted. Corrupt counters and backward clock changes block new requests. Failed API calls may count toward the cap and **may still incur vendor charges**. No price or free allowance is guaranteed by RADIX.

Returned candidate websites must be reviewed manually; **Conferma** only after establishing the domain belongs to the selected company. Proposal URLs and confirmation are saved in the local checkpoint; the original file should be retained when an audit trail is required. No official Brave API call was made in development or testing; mocked tests are not a live integration check.

## Browser-to-CRM reviewed contact bridge

From the new Lead Intelligence Preview:
1. Select the original agent JSON checkpoint in **Importa il backup Sales Navigator dal tuo Mac**.
2. Inspect the statistics. For jobs exceeding the server's **4,000 contacts or 1.5 MB limit**, click **Scarica backup compatibile** repeatedly to download numbered, independently archivable segments, and import/save each segment separately. The UI prevents a single oversized cloud save.
3. For a supported single archive, click **Carica contatti nel motore**; save them in an authorized workspace only after verification.
4. Click **Porta aziende alla qualificazione ICP**; review and score the companies. RADIX allows 250 companies per ICP list, not 5,000. Split large projects into smaller lists.
5. In **Revisione prospect e contatti**, the **Seleziona il referente corretto** selector proposes individuals only for an exact company name and compatible domain/country identity. You must select a person, confirm, separately verify their email, source and lawful basis, and approve the prospect yourself. Email, consent flags and CRM records are **never created automatically**.

The browser bridge does not replace the existing protected CRM API or its database. As of this release, `LEAD_DATABASE_URL` is available only in the *integration branch Preview*; this feature branch Preview has no confirmed DB access. No production writes or merges have been performed. End-to-end save/reload and CRM creation remain release gates requiring the Mac and an authorized workspace.
