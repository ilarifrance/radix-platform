# RADIX · Growth Projects & Campaign Studio (2026-10-15)
Branch: `integration/radix-unified-platform-20261013`. Preview only, no production changes.

## Pages
- `/sales-growth-projects.html` — Seven-step company/ICP/offer/sending/LinkedIn-profile/calendar/review wizard; project list and workspace create/update/load/delete; versioned persistence API; explicit project approval (not outreach permission); portable JSON export and import.
- `/sales-growth-campaigns.html` — Campaigns tied to each saved project, with lead segment, intended channel, objective, notes, budget ceiling in **planned credits** and draft/ready-for-review/paused statuses. Save/update/delete inside the parent project, with optimistic version check.
- `/lead-intelligence.html` — Acquisitions and ICP scoring. When opened from a saved growth project, the context banner loads its ICP via the authenticated project API. Clicking **Applica ICP** requires human confirmation. Without a database, import a portable project JSON backup in the ICP panel.
- Command Center and Sales navigation link to these pages.

## Operational path before migration
1. Open Progetti commerciali. Fill in all seven stages (you may omit Sending and Calendars). Use **Esporta progetto JSON**; this downloads a file on your computer.
2. Open Campagne. Use **Apri backup progetto JSON**; create/edit up to 30 draft campaigns, save locally in the page, then **Esporta progetto e campagne**. This does not send emails or connect external services.
3. To continue editing the project, return to Progetti commerciali and import the updated backup. To prefill ICP in Lead Intelligence, use **Importa ICP da progetto RADIX** in the ICP section.
4. Data in browser memory is lost on navigation if not exported. Use the JSON backup; do not store credentials/cookies in it.

## Enabling Preview workspace persistence
1. Verify isolated `LEAD_DATABASE_URL` (Neon Preview) is distinct from `DATABASE_URL`; `api/_lead_db_guard.js` enforces isolation.
2. **Manually review and apply** migration `migrations/sales/007_lead_growth_projects.sql` ONLY to the isolated Preview database. No SQL migration has been executed in this development round. `migrations/sales/006_lead_contact_jobs.sql` for individual contact archive is also pending as previously reported.
3. Sign in to RADIX Preview, select an authorized workspace, click **Salva nel workspace**. Backend `/api/sales` uses `lead_growth_projects`, strict validation, membership roles, versioned SQL writes, and no overwriting another user's updates.
4. Open the saved project from Campagne, create/edit campaigns, check persistence after reloading. Repeat with a viewer account (read-only), a second workspace (isolation), and a concurrent edit (409 conflict).
5. Verify UI in authenticated Chrome and mobile before any merge. Production remains untouched.

## Schema
Payload version 1: `company{name,website,industry,description}`, `icp{geos,titles,industries,companySize}`, `offer{core,differentiators,proof}`, `sending{domains,mailboxes,provider}`, `linkedin{profileUrl}`, `calendars{bookingUrl,demoUrl}`, `state(draft|ready)`, `campaigns[]`.
Campaign: `id,title,stage(draft|ready|paused),channel(email|linkedin|multichannel|manual),segment,goal,notes,creditBudget`. URLs must be HTTPS. **No session cookies, passwords or LinkedIn authentication tokens are accepted.**

## Remaining work and limitations
- Apply the migration and conduct an authenticated, real Preview DB read-write-rollback test. This code is READY on Git/Vercel Preview but is **not** yet a verified operational cloud persistence workflow.
- Link approved individual contacts from Lead Intelligence to CRM campaign membership, outcomes and analytics. The current Campaign Studio organizes plans, not real sends.
- Link an authorized provider and validate actual results for Sales Navigator acquisition separately. No mass scraping, message sending or paid actions are active.
- Complete mobile screenshot comparison and usability tests in a signed-in Preview session.
