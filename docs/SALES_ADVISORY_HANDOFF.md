# RADIX Sales — Nexus × Qwen advisory handoff

Branch: `chatgpt/sales-advisory-qwen-nexus-20261012`. Base: Nexus Sales branch, not main. No deployment, merge, migration, new dependency, provider call or database write.

## What exists
- `api/_sales_intelligence.js` (Nexus): validated v1 contract and Customer360 projection. Pre-existing, unchanged.
- `lib/sales-advisory.js`: Qwen-inspired deterministic, read-only recommendations for overdue open tasks, stale **recorded** interaction (>14 days), and passed expected close date. Stage-independent, no invented currency, win probability or action.
- `lib/sales-advisory-adapter.js`: internal composition of trusted Nexus projection + validator + advisory. Returns only envelope metadata, data-quality indicators and evidence-backed suggestions.
- `tests/sales-advisory.test.js`: unit fixtures with injected validation.
- `tests/sales-advisory-integration.test.js`: offline integration against the **real** Nexus projector/validator.

## Running tests
`node --test tests/sales-advisory.test.js tests/sales-advisory-integration.test.js`

Do not claim tests pass until run in a checked-out branch. This branch was authored through the GitHub connector; there was no runnable checkout in the authoring environment.

## Safety and limitations
- **Not an API route.** The adapter accepts trusted server-fetched records only. It is not an authorization boundary: future caller must check authenticated session, workspace membership, opportunity ownership and pagination across all Customer360 pages.
- The Nexus projector declares activity history partial; a missing activity must never be interpreted as evidence that no contact occurred. Date threshold is provisional business rule pending owner review.
- No voice UI, email, newsletter, external lead enrichment, LLM provider or automatic execution here. Qwen source files are not copied verbatim: existing Qwen routines use different stage/status/value semantics and some have missing-field/validation defects.
- Human approval required for any future CRM mutation or outbound email.

## P0 next gate
1. Nexus reviews mapping and advisory business semantics; Qwen reviews recommendations.
2. Run both suites plus existing `tests/sales-intelligence-runtime.test.js` and regression tests.
3. Build an authenticated, read-only server route with explicit membership and bounded Customer360 pagination only after isolated Preview DB confirmed. No direct client-supplied rows.
4. Connect Sales UI with loading/partial/error states, evidence links and no execution affordances until authorization and confirmation flows are implemented.
5. Validate Preview with real test workspace, permission denial, cross-tenant access, concurrent record version changes and no sensitive field leakage.
