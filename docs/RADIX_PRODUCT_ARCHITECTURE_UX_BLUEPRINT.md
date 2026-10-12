# RADIX — Product Architecture & UX Blueprint v1.0
Date: 2026-10-08
Status: implementation direction; not a claim that proposed modules are already operational.

## Product thesis
RADIX is a project-centric AI operating system for real work, not an agent gallery. Command Center = supervisory layer. Projects = primary operating units. Agents, knowledge, workflows, approvals, outputs and cost telemetry belong to a project. Global agent library and integration hub offer reusable, permissioned capabilities.

## Information architecture
- Command Center: portfolio health, attention required, verifiable run states, project network, live activity only when genuinely instrumented, costs only when metered.
- Projects: project directory with search, ownership, status and tags.
- Project detail tabs: Overview, Agents, Workflows, Knowledge/Files, Tasks/Activity, Approvals, Outputs, Costs/Performance.
- Agent Library: catalog and configuration of globally reusable agent definitions, with project-specific assignments and permissions.
- Workflow Studio: run definitions, dependencies, retry/resume, human checkpoints, execution history.
- Executive/Approvals: centralized approval queue backed by persisted records, reviewer identity, timestamps and audit trail.
- Integrations: provider connectors, secrets references, scopes, verified health and cost controls.
- Settings: identity, roles, security, audit, organization-wide defaults.

## Navigation
Left navigation order: Command Center; Projects; Agents; Workflows; Approvals; Knowledge; Integrations; Settings. Recent projects can appear as shortcuts. Avoid presenting roadmap verticals as deployed applications.

## Project data model (future migration contract)
Project: id, name, slug, description, owner_id, lifecycle_status, created_at, updated_at.
ProjectMember: project_id, user_id, role.
AgentDefinition: id, role, version, configuration_reference.
ProjectAgent: project_id, agent_id, enabled, overrides, access_scope.
WorkflowDefinition: id, project_id, version, nodes, edges, approval_policy.
WorkflowRun: id, workflow_id, project_id, status, created_by, started_at, ended_at, heartbeat_at, error_code.
RunStep: id, run_id, agent_id, state, input_ref, output_ref, retry_count, timestamps.
KnowledgeAsset: id, project_id, owner, source, storage_reference, visibility, version.
Task: id, project_id, assigned_to, status, due_at, source_run_id.
Approval: id, project_id, run_id, decision, requested_by, assigned_to, created_at, decided_at, reason.
Output: id, project_id, run_id, asset_reference, type, version, approval_status.
UsageEvent: id, project_id, provider, model, tokens_in, tokens_out, estimated_cost, incurred_at.
AuditEvent: id, project_id, actor, action, target_ref, timestamp, metadata.
Enforce authorization by project membership on server. Never treat UI filtering as tenant isolation.

## Existing RADIX preservation
- Keep existing v3.7 index.html functional as agent execution workspace during rollout.
- Existing shared Postgres workspace_state is not project isolation. Its current projects and history are transitional data; do not claim per-project data separation.
- Existing flow execution resides in browser / history and is not durable background execution. Saved running statuses are not proof of execution now.
- Never manufacture pending approvals, integrations, cost amounts or active agent counts from decorative visuals.
- New read-only dashboard should read through authenticated endpoint. No raw chat history in response; no secrets; cache-control no-store.
- Preserve current /api/state POST contract until data migration and tests have passed.

## Master visual direction
Reference: approved RADIX dark technological cockpit. Preserve left sidebar, upper command/status bar, large central Network View, right attention/live-activity zone and lower operations panels. Use depth, contrast, semantic secondary accents; avoid uniform green floods. Primary typography Inter + Space Grotesk (as current v2).

## Design tokens (proposed)
Background #030906; surface #08140F; elevated #0F2119; border #214B3B; text #F1FFF8; muted #78A18F.
RADIX Core emerald #1EF28F; Projects blue #65B8FF; Sales amber #F4BD5F; Studio violet #B68CFF; Venture turquoise #32D6C5; Executive/attention coral #FF6B70; Knowledge slate #8EA9C0.
Semantic status overrides section colors: success green, warning amber, error coral, info blue. Avoid using red solely for Executive navigation; red denotes risk or urgent action.
Accessibility: color cannot be sole state signal; text labels, focus rings, contrast and reduced motion. Network graph must have list fallback and keyboard navigation.

## Operating UX
- Project switcher selects context and persists with appropriate permissions.
- Project home surfaces top priorities, current deliverables, latest runs and project memory.
- Workflow actions are deliberate and auditable: launch -> review inputs -> run -> check outputs -> approve when required -> publish/export.
- If no verified telemetry exists, show honest unavailable/empty state.
- Command bar searches and navigates first; execution commands require explicit confirmation or appropriate approval policy.

## Release sequence
P0 - Stabilize branch / establish baseline: inspect current v2 vs existing deployed app, inventory actual endpoints and states, safe preview and smoke tests.
P1 - Command Center cockpit: responsive, keyboard accessible, auth-protected verified read-only data; truthful network and activity.
P2 - Projects core: server data model, project access control, project directory, overview and context switching; migration away from one shared blob (with backup and rollback).
P3 - Project agents + knowledge: assign roles and data to projects, permissions, versioning, isolated outputs.
P4 - Durable workflows: server-side run persistence, accurate status/heartbeat, resumability, idempotent retry, logs, human checkpoints.
P5 - Approvals and outputs: persisted approval ledger, reviewer roles, audit, versioned deliverables.
P6 - Metrics/costs and connectors: server metering, provider verification, budgets, warnings.
P7 - Commercial verticals: Growth, Sales, Studio, Venture, Executive, Marketing Agency; later multi-tenant white-label only once internal operations are proven.

## Initial acceptance criteria
1. Existing index.html and /api/state operations still work.
2. Command Center shows no invented live jobs/approvals/costs.
3. 401 for unauthenticated data requests; no-store/private responses.
4. Empty, stale, partial and malformed state handled gracefully.
5. Responsive 390px to desktop and keyboard navigation.
6. Preview deployment reviewed before merging main.
7. No new dependency without explicit technical need.

## Immediate next implementation action
Implement P1 on codex/radix-command-center-v1 based on control-center-v2.html, with isolated read-only endpoint and tests. Verify the new endpoint against actual history[agentId][messageIndex].flow log {t,k,x}. Do not overwrite ongoing commits; inspect head before update.
