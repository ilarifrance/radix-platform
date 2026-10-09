# RADIX Marketing Agency — Full-Service Product, Agent & UX Architecture v2
Date: 2026-10-10
Status: approved direction; architecture proposal, **not** a claim of implemented functionality.
Owner: RADIX product design. Independent design branch; do not merge without review.

## 0. Scope and preservation
RADIX Marketing Agency is an AI-supported **full-service managed marketing operation**, initially for internal projects, later potentially for external clients. PED means *Piano Editoriale*, one operational output and workbench inside Agency, not a standalone unrelated product. Preserve the existing `docs/RADIX_MARKETING_AGENCY_SPEC.md` editorial revision/approval invariants. Agency is distinct from planned CRM, Commercialisti AI and white-label SaaS.

Existing source of truth inspected:
- `index.html` AGENTS roster already defines `marketing-orchestrator`, `brand-strategist`, `strategist`, `copywriter`, `art-director`, `ai-specialist`, `social-media-manager`, `seo-geo`, `web-content`, `video-producer`, `paid-media`, `analytics`, and editorial `orchestrator` (pipeline); `web-developer` belongs to shared dev group.
- `marketing-agency.html` is a **local demo UI** containing Overview, PED/calendar, Content Studio, Approvals, Publishing and Analytics. It explicitly does **not** persist to the server or publish. Reuse its useful interaction ideas, **not** its mock data as production records.
- `lib/marketing-approval.js` and tests are groundwork; server-side persistence, verified connectors, and client isolation remain to be built.
- `docs/RADIX_PRODUCT_ARCHITECTURE_UX_BLUEPRINT.md` defines project ownership, agent assignments, auditable workflows, verified telemetry, authorization and gradual migration.
- Current v3.7 shared workspace state is transitional; not multi-tenant isolation.

## 1. Product north star
One brief creates a connected system of **strategy → production → approval → distribution → measurement → improvement**, spanning websites, landing pages, e-commerce, SEO, AI search/GEO, PPC, social/PED, email/newsletters, video, design, CRO, reporting and customer acquisition. Coordinate humans and reusable agents through traceable workflows. Never equate a role definition with a live AI worker.

### Domain divisions and typical deliverables
| Division | Operational screens | Deliverables / channels |
| --- | --- | --- |
| Strategy & Intelligence | Strategy Board, Competitor Radar, ICP, Budget Plan | positioning, brand plan, campaign brief, KPI tree |
| Brand & Creative Studio | Brand Kit, Creative Canvas, Asset Library, Review | identity, banners, brochures, ad creative, carousels |
| PED & Social Studio | Editorial calendar, Content Studio, Post queue | posts, scripts, channel previews, scheduling |
| Web Studio | Site Map, Page Builder, Preview, Releases | websites, landing pages, blogs, e-commerce, forms |
| SEO & GEO | Audit, Keyword/Topic Map, Page Recommendations | technical fixes, structured data, source transparency, AI discoverability experiments |
| Paid Media | Campaign Planner, Ad Creative, Spend Controls | Google/Meta/LinkedIn campaign plans, budget proposals, performance |
| Email & Lifecycle | List Segments, Journey Builder, Template Editor | newsletters, campaigns, opt-in flows, nurture |
| Video & Motion | Script/Storyboard, Asset Timeline, Render Jobs | short-form video, explainers, ad variants, subtitles |
| Analytics & CRO | Attribution, Funnel, Experiment Board | verified KPIs, funnel, A/B experiments, learning |

SEO and GEO outcomes cannot be guaranteed; show evidence, assumptions and measured changes. No advertising spend, sending, publication or deployments without explicit permitted action.

## 2. Agent operating model — reuse before adding
The roster above is an existing **catalog of roles**, not proof of active background execution. Treat `marketing-orchestrator` as a coordinating role, not a separate inference service by default.

Initial role-to-division mapping (use stable existing IDs):
- Director: `marketing-orchestrator` → orchestrates multidisciplinary requests, dependencies, approvals and handoffs.
- Strategy: `brand-strategist`, `strategist` → objectives, positioning, ICP, channels, editorial pillars.
- Editorial: `copywriter`, `social-media-manager`, `web-content`, `orchestrator` → copy, PED, SEO writing, per-post workflow.
- Brand/creative: `art-director`, `ai-specialist`, `video-producer` → visual direction, storyboard, approved provider calls.
- Demand: `seo-geo`, `paid-media` → audits, recommendations and controlled campaign actions.
- Measurement: `analytics` → instrumentation plans, grounded reporting, experiments.
- Shared developer: `web-developer` → previews, code review, release proposals under deployment gates.

Do not duplicate agent IDs merely to create decorative extra nodes. Future optional specialist roles (e.g. CRM lifecycle/email strategist, marketing QA) require a documented capability gap and tests. An agent can use multiple tools while maintaining separate project/brand permissions.

Every assignment includes: project_id, agent_definition_id, role label, status (configured/available/running/blocked/completed), permissions, current workflow_run id if any, owner, input/output refs and last verified activity. **Running** requires valid backend heartbeat evidence. Disabled/unassigned agents must never appear as running.

## 3. UX information architecture
Global: RADIX Command Center → Project → Marketing Agency → division/workbench → deliverable.

Agency navigation:
1. Agency Overview (portfolio or selected project)
2. Strategy & Briefs
3. Campaigns (cross-channel parent container)
4. PED / Social
5. Creative Studio
6. Web Studio
7. SEO / GEO
8. Paid Media
9. Email & Lifecycle
10. Video Studio
11. Analytics & CRO
12. Assets & Knowledge
13. Approvals & Releases
14. Team & Agents
15. Settings / Integrations

Cross-cutting global components: project/brand switcher, contextual command bar (text first, voice later), notifications, permission-aware quick actions, breadcrumb, audit drawer, cross-module search, recent outputs, cost/budget visibility when measured.

### Three primary interface scales
**Agency executive cockpit**: dark RADIX shell; page title and active brand; 4-6 truthfully populated KPI cards; campaign health grid; active work (not decorative live status); blocked approvals; multi-channel timeline; agent/workflow network thumbnail; attention rail; recent deliverables.
**Division workbench**: specialized main body. PED calendar/kanban, Website visual editor+preview, Email journey diagram, Paid Campaign grid, SEO site tree, Video storyboard/timeline. Shared right inspector for evidence, reviewer and tasks.
**Object detail**: single campaign/post/page/ad/email/video with editable revision, attachments, source provenance, activity timeline, review decisions, links to parent campaign and measurable results.

### Visual blueprint
Stay close to approved master identity: deep #030906 background, emerald #1EF28F primary, elevated #0F2119, muted #78A18F, Inter and Space Grotesk. Use restrained section accents: blue for websites/data, violet for creative/video, amber for media spend, turquoise for analytics; red is error/risk only. Dense professional desktop UI, not an oversized marketing landing page.

Layout at 1440px: persistent left navigation 232px; top command/status 60-70px; center fluid; contextual right rail 300-340px optional. Responsive: collapse rail on tablet; mobile uses clear section switcher and stacked cards. Calendar and tables must scroll sanely. Preserved keyboard navigation, reduced motion support, accessibility labels, loading/empty/error/stale states.

Motion principles: animated transitions between Agency network → division → object; agent nodes pulse only on verified running work; hover highlights real connections and previews; click opens an inspector; focus zoom and pan; avoid constant excessive motion in tables/editors. At most decorative glows for idle nodes, never implied live status.

## 4. Cross-module domain and data contracts (planned)
Use project-scoped persistent IDs, immutable revisions and versioned outputs:
- AgencyClient/BrandProfile: client/brand identity, goals, industry, regions, brand rules, authorized owners.
- MarketingBrief: project_id, objectives, audience, channels, constraints, budget, status, revision.
- StrategyRevision: brief_ref, positioning, proposals, KPI definitions, assumptions, sources, approver.
- Campaign: project_id, brand_id, objectives, strategy_rev, channel plans, budget cap, owner, status.
- Deliverable: campaign_id, type (post/page/video/email/ad/etc), draft/revision status, assets, evidence refs.
- WorkflowDefinition/Run/Step: parent object, task graph, current step, heartbeat, logs, errors, retry semantics.
- MarketingTask: owners (human/agent), due date, dependencies, evidence and PM links.
- ApprovalDecision: exact revision/fingerprint, reviewer, destination, action type, timestamp, reason.
- ProviderConnection: credentials reference (never raw client token), scopes, status, resource owner.
- DistributionJob: schedule, destination, idempotency_key, approval_ref, receipt/error.
- MeasurementObservation: provider metric name, value, units, range, retrieved_at, source, attribution caveats.
- AuditEvent: actor, project, action, target, timestamp, previous/new state references.

Project membership authorization **server-side**. For future external clients, introduce audited tenant isolation before accepting customer data. Avoid parallel project-scoped copies of CRM, PM and DOC records: link by stable references, keep ownership in canonical domain.

## 5. Canonical operational workflows
**Agency kickoff**: Client/project → brand profile → brief → research → strategy draft → human strategy approval → campaign scaffolding → PM tasks and roles.
**PED**: approved strategy → plan revision → post creation → per-item revision → human approval of exact version → authorized scheduling → provider receipt → metrics → recommendations. Approving PED ≠ approving posts.
**Website**: brief → sitemap → copy/UX/design → preview build → QA/accessibility/SEO/performance → explicit approval → preview deploy → release approval → production deploy (separate permission) → monitoring.
**SEO/GEO**: permitted crawl/source ingestion → evidence-based audit → issues ranked by impact/confidence → propose page changes → preview/diff → review → release and track; no claims of guaranteed AI citation.
**Paid media**: campaign brief → creative/targeting/budget proposals → policy/privacy checks → reviewer approval of account, spend and exact assets → authorized platform action → reconciled provider status/actual spend → optimization proposals.
**Email**: lawful audience/provenance and consent → segmentation → template revision → QA+test send to approved internal recipients → explicit send approval → connector send → bounces/unsubscribes/reports.
**Video**: script/storyboard → asset sourcing and usage-rights check → provider/job budget guard → preview render → approval → export/publish with channel-specific authorization.
**Analytics**: verified integrations → source-labeled metrics → attribution caveats → recommendation → change request and permission checks.

## 6. AI action and safety control plane
Separate: `suggest` (read-only), `draft` (internal writes), `approve`, `external_action` (send/post/spend/deploy). Approval is exact-version bound; material change invalidates it. Explicitly separate user request from allowed automatic actions.
Server-enforced quotas, budgets, rate limits, retries, and audit. Persistent execution required to call workflows "running"; UI must not claim browser history equals live run. All expensive creative API operations require caps and estimates; credentials use server-only secrets. For newsletters require unsubscribe/consent and destination validation, for PPC spending caps, for website production controlled releases.

## 7. Phased delivery without duplicate systems
**A0 Inventory/contract** (now): inventory existing 12 marketing specialist/coordinator roles plus shared Web Developer, existing HTML demo and approval invariants; no agent ID renaming; compatibility mapping.
**A1 Agency Foundation**: project-scoped brands/briefs/strategy/campaign objects, read/write API, scoped auth, audit, initial genuine dashboard; no fake metrics.
**A2 PED vertical slice**: real persisted calendar, post revision editor, exact-version human approvals, unit+integration tests; keep social publishing disabled.
**A3 Creative/Video & Web**: asset/revision management, preview-only website builder flow, creative generation behind budget guard and review.
**A4 SEO/GEO, Email and PPC**: verified provider integrations progressively; typed provider adapters; no unsupported "connected" badges.
**A5 Omnichannel analytics and coordinated agency**: verified source KPIs, cross-channel campaigns, optimization and scalable customer operations.

Do not build independent clone CRMs, task managers or document stores. RADIX Sales owns CRM records; PM owns work items where established; DOC/Knowledge owns documents and provenance. Establish minimal shared contracts if these services are not yet operational, and mark unavailable capabilities honestly.

## 8. Acceptance / handoff checklist
- [ ] Master visual compared on desktop, laptop and mobile; screenshots stored in development artifacts.
- [ ] Project/brand switch always updates context and authorizations.
- [ ] Existing marketing roles reused; no duplicate agent definitions or imagined running agents.
- [ ] Campaign → PED → post revision → request approval → approve exact revision persists and is audited.
- [ ] Unapproved or changed content cannot be sent/published/scheduled.
- [ ] Preview web deploy never implicitly promotes to production.
- [ ] Email and paid action remain disabled until provider OAuth scopes, spending policy and approval tests pass.
- [ ] All source-dependent analytics visibly identify provider and freshness.
- [ ] Empty states honest, keyboard interactions accessible and reduced motion respected.
- [ ] No production deployment or branch merge without human review.

## 9. Immediate next implementation brief
1. Keep Work on `codex/radix-command-center-v1` and OpenClaw CRM on an independent verified branch.
2. Implement Agency only after choosing an independent implementation branch and checking current head. Do **not** edit Work files or production `index.html`.
3. First deliver UI specification/component map and data contracts, then Agency Foundation and PED slice; unit tests and browser preview before any claim of completion.
4. Reuse existing `marketing-agency.html` prototype as UX starting point. Replace local demo data only when authenticated project-scoped persisted API and tests exist.
