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

## Existing branch conflict
`control-center.html` currently calls `/api/state?view=dashboard`. Its snapshot implementation reads `state.flow`, while the orchestrator stores `message.flow` under `state.history`. It therefore misses the real execution timeline. A separate `GET /api/dashboard` endpoint is preferred; do not replace `/api/state` POST or alter shared-state persistence during this UI integration.

## Safe rollout
1. Add and test the read-only endpoint; keep the current workspace untouched.
2. Integrate the V2 cockpit on the feature branch, preserving the reference composition.
3. Test auth, empty state, malformed timestamps, stale saved runs, keyboard/mobile.
4. Deploy preview, verify against real authenticated data, then review PR.
5. Do not merge to main until review. Later: durable runs, persisted approvals, project isolation, white-label.
