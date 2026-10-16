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

## Technical / legal boundaries

- LinkedIn restricts automated extraction under its terms, even if the user personally authenticates. An account may be limited or suspended. Use only where allowed and with a lawful basis for processing personal data.
- **No authenticated Sales Navigator end-to-end test has been performed**. The selectors are heuristics which may require updates for the current site UI, and the number of records depends on which fields are visibly rendered. It does not open each individual profile in v1. Missing fields remain empty, not invented.
- It does not solve CAPTCHA, bypass login checkpoints, conceal automation identity, rotate proxies or use hidden LinkedIn APIs. It stops when authentication is required.
- The server binds to 127.0.0.1 only and rejects non-local browser request origins. Do not expose it publicly.
- Jobs can be paused and resumed from local checkpoints, but UI changes or a changed search may prevent reliable resumption.
- No paid provider and no CRM intermediary are used.

Test from repo root: node --test tests/linkedin-local-agent.test.js. These unit tests do not prove real LinkedIn compatibility.
