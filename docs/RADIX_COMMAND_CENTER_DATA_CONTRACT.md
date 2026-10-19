# RADIX Command Center — Data Contract (2026-10-08)

## Product decision
The Command Center is a read-only cockpit on top of the existing RADIX application. Preserve the approved dark-tech emerald reference. Keep `index.html` as the execution surface until durable server-side runs exist.

## Truthfulness requirements
- **Projects** come from `workspace_state.data.projects`; display configured projects only.
- **Runs/workflows** come from `history[agentId][messageIndex].flow`, not a single `state.flow` object. Browser-owned `running` flags are **not proof of live execution**.
- **Activity** comes from each flow's `log`, whose entries may use `{t,k,x}`; do not assume `{time,text}`.
- **Approvals** must show an explicit unavailable state until persisted approval records and authorization exist. Never fabricate pending approvals.
- **Integrations** must be labelled unverified until checked against actual providers.
- **Agent assignment** is not inferable from a decorative network orbit; label it illustrative.
- **Security**: authenticated GET, no-store, no raw chat histories, no internal SQL errors in dashboard responses.

## DAY01 implementation decision (2026-10-09)
V2 uses only `GET /api/state?view=dashboard`, authenticated by the existing session. No separate dashboard endpoint and no full-state fallback. `_dashboard.js` traverses history messages and delegates flow projection. Ordinary GET and POST persistence are unchanged. Raw log `x` is intentionally not returned: event summaries derive from allowlisted `k`, timestamp from `t`. Recent running snapshots become `unverified`, older/missing/future-only timestamps become `stale`. Counts precede preview limits; error nodes/workflows take priority and attention totals disclose omitted items. Limits: 100 project previews, 24 flows/attention/events, 80 nodes per flow. The entire saved row is still read server-side; pagination/storage redesign is future work.

## Safe rollout
1. Add and test the read-only endpoint; keep the current workspace untouched.
2. Integrate the V2 cockpit on the feature branch, preserving the reference composition.
3. Test auth, empty state, malformed timestamps, stale saved runs, keyboard/mobile.
4. Deploy preview, verify against real authenticated data, then review PR.
5. Do not merge to main until review. Later: durable runs, persisted approvals, project isolation, white-label.
