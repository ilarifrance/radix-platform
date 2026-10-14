# RADIX Lead Intelligence — isolated archive activation

Status: **code and Preview UI are implemented; persistent archive is not activated**. Migration 005 has NOT been executed.

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
