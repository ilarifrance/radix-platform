# RADIX Sales Priority — isolated integration candidate

A deterministic, read-only follow-up attention engine using the existing validated Sales Intelligence Customer360 envelope.

**Purpose:** overdue tasks, urgent work, upcoming follow-ups, unassigned tasks, and stale recorded interactions. Returns an advisory `attentionScore` (0–100) representing *follow-up attention*, **not** lead quality, opportunity win probability or revenue forecast. Returns an explainable next-best-action suggestion; takes no action.

**Contract:** `require('./api/_sales_priority').evaluatePriority(envelope)`. Input must be a server-generated envelope that passes `validateEnvelope` from `api/_sales_intelligence.js`. The caller is responsible for authenticating the user, verifying workspace membership, fetching CRM data server-side and checking permissions.

**Test:** `node --test tests/sales-priority.test.js` from the repository root. Uses Node built-in test runner and no additional dependencies.

**Status:** isolated branch only. No HTTP endpoint, database query, CRM UI, migration, automated email, CRM write, merge or deployment has been performed. The current CRM activity reader uses partial snapshots; the output preserves data-quality warnings. Do not interpret zero alerts as no risks. Human review required before any follow-up.

**Integration next:** connect this pure function to the authenticated Customer360 reader, validate tenant scope, exercise against the Preview database with representative data, then build the CRM dashboard component and end-to-end tests.