# RADIX — Project → Strategy → PED: implementation contract (12 Oct 2026)

Status: proposed integration slice, **not implemented UI**, not an approval/security service. Isolated review branch `chatgpt/project-ped-gates-20261012`. Source: `docs/RADIX_MARKETING_AGENCY_SPEC.md`, `docs/RADIX_CORE_ROADMAP.md`, `docs/RADIX_COMMAND_CENTER_DATA_CONTRACT.md`.

## Product navigation

Command Center → Projects → Project detail → Strategy → Editorial plan (PED) → Content → Approvals → Publishing → Analytics.

Project detail is the **first page** after creating/selecting a project; the PED is not the landing page. Maintain the approved cockpit/emerald visual identity. Project context (projectId, client/brand, roles) persists across nested views; avoid routing by display names.

## Screens and concrete behaviors

| Screen | Read | User action | Guard / outcome |
| --- | --- | --- | --- |
| Projects | Authorized projects only | Create/select project | Stable projectId; no inferred membership |
| Project overview | Brief, owner, goals, audience, channels, brand assets, progress | Edit brief / assign operator | Creates brief revision; dependent strategy becomes review-needed |
| Strategy | Research references, positioning, tone of voice, pillars, KPI, channels, cadence, strategy revision | Submit / approve / request changes | Only authorized reviewer can approve exact revision; approval persisted server-side |
| PED | Calendar + list, topics, post/channel/date/owner, dependencies, approval status | Generate/edit plan, request plan approval | PED creation enabled only after approved current strategy; changing strategy blocks plan progression |
| Post detail | Copy, asset references, per-channel preview, revision history | Edit, request review | Every edit creates new post revision and invalidates prior approval |
| Approvals | Real pending records + revision diff | Approve/reject/request changes | Individual post approval mandatory; PED approval never implies post approval |
| Publishing | Verified queued jobs, provider receipts, failures | Schedule/retry authorized jobs | Revalidate exact post revision, destination and approval immediately before dispatch |
| Analytics | Provider-derived measurements | Compare and propose iteration | Never invent reach, impressions or publication receipts |

## State model and gates

**Strategy:** draft → in_review → approved / changes_requested / rejected. Every material change creates a new immutable revision. An approval binds `projectId + strategyRevisionId + reviewerId + decidedAt`.

**PED:** not_started → draft → in_review → approved / changes_requested / rejected. Creating a PED draft requires a current approved strategy. Approval of PED binds `strategyRevisionId + pedRevisionId`. On strategy change: show `needs_strategy_review`, freeze submission/production/publishing eligibility until reapproval and explicit plan revalidation; preserve historical data.

**Post:** draft → awaiting_approval → approved / needs_revision / rejected → scheduled → publishing → published / failed. Post approval must be independently granted per exact content revision; editing copy, assets, target profiles/channels, or scheduling-critical metadata invalidates it. No bulk approval in first release.

**Safety:** all gates checked server-side using trusted identity, project membership, immutable revision and audit event. Browser state, local demo snapshots, fingerprint alone, and agent messages are never sufficient authorization. No provider calls in the first slice.

## Minimum persistent records (proposed)

- `Project(id, workspaceId, clientId?, name, status, createdBy, createdAt)`
- `ProjectMembership(projectId, principalId, role)`
- `ProjectBriefRevision(id, projectId, revision, payload, createdBy, createdAt)`
- `StrategyRevision(id, projectId, briefRevisionId, revision, payload, createdBy, createdAt)`
- `StrategyDecision(id, strategyRevisionId, reviewerId, decision, decidedAt, note)`
- `EditorialPlanRevision(id, projectId, strategyRevisionId, revision, payload, createdBy, createdAt)`
- `EditorialPlanDecision(id, planRevisionId, reviewerId, decision, decidedAt, note)`
- Reuse the separately specified `EditorialPost`, `PostRevision`, `Approval`, `PublishJob`, `AuditEvent` entities.

Do not equate the Sales `workspace_id` with RADIX workspace state or legal organization without explicit mapping. No new multitenant or white-label provisioning in this slice.

## First build slice, with acceptance checks

1. Implement authenticated, project-scoped read-only **Project detail + Strategy** routes; render empty/loading/denied/stale states. No fictitious agent activity.
2. Add migrations for immutable strategy revisions and approval decisions, plus reversible migration and authorization tests.
3. Add strategy submit/decision endpoints with optimistic concurrency and append-only audit. Unauthorized approvals return 403; stale revision decisions return conflict.
4. Implement PED read view with disabled gate and clear explanation until the current strategy is approved; no fake calendar data.
5. Only then enable PED draft creation, versioned changes and explicit plan review.
6. Add post editor and per-post approval; do not connect publisher until provider capability and idempotency tests are demonstrated.

### Must-pass scenarios

- User opens project: project context remains consistent across routes.
- No project membership: no project detail, strategy or PED data.
- Strategy draft: PED creation disabled with visible reason.
- Current strategy approved: PED draft creation enabled.
- Strategy revision changes after approval: old approval does not authorize new PED operations.
- PED approved: individual posts still require explicit human approval.
- Post revision/destination changed: publishing remains blocked.
- Stale or forged browser approval: rejected by server.
- Failed provider integration: truthful blocked/error state, never "published".

## Integration responsibilities

- ChatGPT: cross-vertical contract, UX hierarchy and acceptance matrix.
- Nexus: implement server/API/DB and CRM/project linking on its own branch after review.
- Qwen: isolated suggestion modules, consume explicit Sales Intelligence contract; **no direct writes** to project/CRM/approval tables.
- Reviewer: confirm strategy and individual content approvals.

No merge, production deployment, scheduler, outbound publishing or external provider invocation authorized by this document.
