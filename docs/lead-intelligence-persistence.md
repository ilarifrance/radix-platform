# RADIX Lead Intelligence — isolated archive activation

Status as of 2026-10-14: SQL migrations 001–005 were applied manually to the Neon **radix-leads-preview** schema-only branch according to the owner's SQL Editor screenshots; browser-authenticated write/read tests have NOT yet been run.

## Isolation requirement
As of 2026-10-14 Vercel project metadata shows one `DATABASE_URL` environment variable entry targeting both preview and production. Treat this as shared and never apply migration 005 there.

## Manual Preview activation
1. Create a separate Neon test branch/database with a test copy of the RADIX authentication/workspace schema (users, sales_workspaces, sales_memberships and migrations 001–004), including authorized synthetic users and membership fixtures.
2. Configure `LEAD_DATABASE_URL` as a secret **only for the Vercel Preview environment**, preferably limited to branch `integration/radix-unified-platform-20261013`. Do not share its value with ChatGPT or commit it.
3. Verify the Preview test database is different from the shared `DATABASE_URL`: different hostname or database name, and separate permissions; the app refuses identical host/database identity and all production deployments.
4. Apply `migrations/sales/005_lead_lists.sql` **manually to that separate database only**, after the preceding migrations. Application startup never executes SQL migrations.
5. Re-deploy Preview; log in as authorized test member; verify create/read/update/delete, version conflicts, viewer writes denied and cross-workspace isolation. Use synthetic contact data only.
6. Review retention, deletion, backup, data protection and production rollout separately. No production merge or migration is authorized by this document.

## Data contract and limits
Each versioned list stores ICP criteria, up to 250 prospect companies with public declared sources, and approved human contact reviews (verified email, source, legal basis, notes, optional personal email draft and three-step follow-up plan). It does not store unapproved scratch edits or automatically transmit any emails. Explicit save/load/delete only. Up to 40 lists per workspace and 190KB JSON per list.

The implementation relies on RADIX sessions, workspace roles and membership verification in each SQL query, plus optimistic concurrency. It cannot provide cross-device persistence until LEAD_DATABASE_URL is configured and migration 005 is applied in isolation. CRM company/contact links still require separate manual relinking after loading. No automatic retention scheduler exists yet.

## Current test authentication and workspace setup
The main RADIX login remains on the configured shared DATABASE_URL and signs an HttpOnly session containing the immutable integer user id. The isolated archive uses LEAD_DATABASE_URL for **both** workspace membership checks and list CRUD, and offers a dedicated read-only `/api/sales?entity=lead_workspaces` endpoint. Do not use regular CRM workspaces endpoint as a proxy for the isolated archive.

Neon schema-only branches have no user rows or memberships. For an **authorized** signed-in Preview user, obtain the integer id through `/api/auth/me` using the normal browser session; do not paste session cookies or credentials. In the isolated Preview database only, provision a minimal corresponding user with that same integer id, a non-login placeholder email on example.invalid and a deliberately unusable password_hash, then a synthetic sales_workspaces row and a sales_memberships row for that user (owner/member). No real password, password hash or customer data is copied. A matching id is essential; arbitrary auto-generated ids will fail membership checks.

For testing, use synthetic prospect data and always keep lead_workspaces/session membership checks scoped to the isolated database. Do not apply migrations in production or silently add real users.
