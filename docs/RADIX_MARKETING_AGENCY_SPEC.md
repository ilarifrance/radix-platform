# RADIX Marketing Agency — operating specification v1
Date: 2026-10-08
Status: approved product direction; delivery implemented in phases.

## Correct business definitions
- PED = Piano Editoriale, NOT a commercial SaaS product. It is a plan of content and publication dates.
- RADIX Marketing Agency is an AI-assisted service business, operated internally first and potentially offered to external clients.
- The agency builds and implements an editorial plan, including content production, review, scheduling, publication, reporting and improvement.
- Every post requires explicit human approval by the authorized reviewer (initially Francesco) BEFORE scheduling or publishing. Approval of a PED does not implicitly approve its individual posts.
- CRM and Commercialisti AI are DISTINCT future subscription software products produced by RADIX. RADIX white-label is another separate later commercial opportunity.

## Editorial workflow
1. Select project/brand, channels, goals, audience, language, rules and brand knowledge; confirm strategy.
2. Agents research topics and prepare PED with individual planned posts, dates, channels and formats.
3. Strategist and operator review the PED; changes to the plan produce a new revision.
4. Copywriter, creative agents and specialist reviewers produce per-post copy, visual assets, hashtags and metadata. Cite content sources where relevant, flag uncertain claims.
5. Quality gate validates copy/asset readiness, channel constraints, brand compliance and links.
6. Submit **each individual post** for explicit human approval. Reviewer may approve, reject or request revision. Bulk approval is out of scope initially.
7. If and only if the **exact content version** was approved, enqueue scheduling and publishing through a verified, authorized provider connector.
8. Record provider's publication ID, success/error, timestamp and retry decisions; never claim publication from a mere scheduled state.
9. Collect analytics from verifiable provider data and propose PED iterations, again requiring approval for new post versions.

## Strict invariants
- No unapproved post may be scheduled for automatic publication or published.
- Changed copy, asset, channels, target account or scheduling-critical metadata invalidates prior approval.
- Approval binds an immutable content revision/fingerprint, reviewer identity, decision time and target destinations.
- The person who generated the content may not bypass reviewer authorization; approvals enforced on the server.
- Draft, awaiting_approval, approved, scheduled, publishing, published, failed, rejected and needs_revision are distinct states.
- Publisher rechecks approval and fingerprint immediately before dispatch; check the scheduling queue and outbound call.
- Connector secrets remain server-side. Require least-privilege OAuth scopes, token rotation and audit logs.
- Retry behavior must be idempotent to avoid duplicate posts; if provider returns ambiguous success, reconcile remotely rather than blindly retry.
- If authorization expires or platform capability is unavailable, mark blocked and alert human; no fictional publish status.
- Initial supported channels should be confirmed against provider API capabilities, especially personal LinkedIn and Instagram accounts.
- For external customers, implement strong project/client data separation, role-based access and a safe multitenant architecture before launch.
- The marketing agency's service model is distinct from eventual RADIX white-label licensing.

## RADIX Command Center / Project UX
- Project > Marketing Agency > PED: calendar with content status, assigned agents, campaign/project context.
- Project > Content: editor/preview for each destination and version history.
- Project > Approvals: decision queue with preview, diff from last approved version and clear approve/request-changes/reject.
- Project > Publishing: queue, delivery receipts, failures, reconnect actions.
- Project > Analytics: verified per-channel results and trend summaries.
- Global Command Center > Needs your attention: genuine persisted approval requests, not demo items.
- Global Marketing Agency operations view: client/project workloads and blocked posts.

## Data objects
EditorialPlan(id, project_id, status, version, owner_id, timeframe)
EditorialPost(id, plan_id, project_id, planned_at, time_zone, platforms, profile_ids, state)
PostRevision(id, post_id, content, media_asset_refs, destinations, fingerprint, created_by, created_at)
Approval(id, post_id, revision_id, fingerprint, reviewer_id, decision, decided_at)
PublishJob(id, post_id, revision_id, account_id, platform, status, idempotency_key, scheduled_at, submitted_at, provider_post_id, error)
AuditEvent(id, actor, project_id, action, target_id, at, metadata)

## Release order
M0: define independent approvals state model + unit tests; no public posting.
M1: project-aware persistence and security/permissions; migrations with backup and rollback.
M2: PED calendar, individual post editor, revision history, review UI and persisted approval events.
M3: verified social provider integrations and queued, idempotent publishing under strict approval gate.
M4: performance analytics and editorial optimization.
M5: customer-facing managed agency operation with explicit client isolation and contractual authorization.

## Acceptance scenarios
- Draft -> approval requested -> explicit approve -> eligible for queue.
- Draft or rejected -> cannot schedule/publish.
- Approved copy changed, image changed or channel changed -> approval invalidated.
- An approval of plan is NOT approval of a post.
- Publishing worker checks exact fingerprint against approval.
- Unauthorized person cannot approve.
- Connection lost -> safe blocked state + audit; no auto-publishing.
- Successfully published job cannot be automatically republished via retries.
- Every decision has author and timestamp.

## Notes on current reality
The existing RADIX v3.7 has marketing agents/orchestration, but does not thereby have a persisted approval ledger or verified social publisher. UI representations of pending posts must be backed by actual records.
