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

Download **Backup RADIX JSON** and open RADIX Preview lead-intelligence.html. In **Contatti individuali**, use **Ripristina backup**. Review all imported data; existing RADIX Preview persistence still requires LEAD_DATABASE_URL and migration 006_lead_contact_jobs.sql, neither configured nor modified here. No production database is accessed by this module.

## Technical / legal boundaries

- LinkedIn restricts automated extraction under its terms, even if the user personally authenticates. An account may be limited or suspended. Use only where allowed and with a lawful basis for processing personal data.
- **No authenticated Sales Navigator end-to-end test has been performed**. The selectors are heuristics which may require updates for the current site UI, and the number of records depends on which fields are visibly rendered. It does not open each individual profile in v1. Missing fields remain empty, not invented.
- It does not solve CAPTCHA, bypass login checkpoints, conceal automation identity, rotate proxies or use hidden LinkedIn APIs. It stops when authentication is required.
- The server binds to 127.0.0.1 only and rejects non-local browser request origins. Do not expose it publicly.
- Jobs can be paused and resumed from local checkpoints, but UI changes or a changed search may prevent reliable resumption.
- No paid provider and no CRM intermediary are used.

Test from repo root: node --test tests/linkedin-local-agent.test.js. These unit tests do not prove real LinkedIn compatibility.
