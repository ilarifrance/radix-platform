# RADIX Marketing Agency — Screen-by-screen UX & interaction specification v1
Date: 2026-10-10
Implementation: proposed, not deployed. Companion to RADIX_MARKETING_AGENCY_FULL_SERVICE_V2.md.

## Product concept
A high-density, futuristic agency operating environment: Command Center supplies global context; Agency offers specialized workbenches connected by project, campaign, deliverable and approval records. PED is a division inside the Agency. Existing RADIX v3.7 marketing roster is authoritative; do not create duplicate AI definitions to fill a visual graph.

## Global shell
- Left: RADIX logo, project/brand switcher, Overview, Strategy, Campaigns, PED/Social, Creative, Web, SEO/GEO, Paid Media, Email, Video, Analytics, Assets, Approvals, Agents, Integrations.
- Top: breadcrumb `RADIX / {Project} / Marketing Agency / {Division} / {Object}`, searchable command bar (navigation and read-only first), verified connection and snapshot freshness indicators, quick-create and notifications.
- Central main pane flexible width: global overview or specialist tool. Right 310px inspector openable/collapsible: task context, provenance, activity log, reviewer state, linked documents and action history.
- Palette: deep #030906 / elevated #0F2119 / emerald #1EF28F; blue web; violet creative; amber spend; cyan analytics; red strictly errors. Inter + Space Grotesk. Explicit status tags and icons in addition to color.
- Overview may use rich orbital animations; editors, grids and tables prioritize efficiency, reduced distraction and keyboard controls.
- All screens show empty, loading, error and unavailable connector states. No display of fake live runs, costs, reach, conversion or approvals.

## Navigation examples
1. Project Doc Capital → Agency Overview → Campaign November → Content plan → PED post → revision/approval → provider action if authorized.
2. Project Doc Capital → Agency Overview → Web Studio → Landing page → preview/review → preview deploy → separate production release gate.
3. Project Doc Capital → Agency Overview → Paid Media → campaign → creative, audience, capped budget proposal → approval → verified external platform execution.
4. Global RADIX Network → Agency cluster → selected existing agent → assigned task → linked workbench and verified workflow-run detail.

## Screen A — Agency Overview
Desktop anatomy: upper KPI row (campaigns, verified pending approvals, due work, connected channels; no filler zeros as live data), major campaign status board left, attention/approvals rail right, below cross-channel timeline, recent outputs and agent/task graph. Each cell deep-links to filtered source records. Hero CTA `Nuovo brief` creates draft only, not external actions.
- Top-level selectors: brand, range, campaign state, assignee. Filters persist in URL for shareable state within authorization constraints.
- "Agent team" shows configured vs assigned vs verified executing, separately.
- Warning banners for missing connections, stale metrics or pending authorizations.

## Screen B — Strategy & Brief
Structured sections: business goals, ICP/persona, brand positioning, competitor evidence, market, channels, messaging, resources, currency/budget and constraints. Document uploads stored as knowledge references with provenance; preview compiled strategy. AI proposals are editable drafts tagged with evidence + confidence; strategy approval version-bound. Output links to a campaign creation wizard.

## Screen C — Campaign Control Room
Two-column campaign timeline and workstream board. Cross-channel map contains PED, website, SEO/GEO, paid, email and video deliverable swimlanes with owners and dependencies. Right panel contains budget proposal, channel allocation, blockers and approvals. Users can reassign task with audit; automated phase transition creates tasks idempotently; changes to sensitive release/spend require fresh review.

## Screen D — PED & Social Studio
Monthly/weekly calendar + Kanban + grid view switch; filters platform, brand, campaign, assignee, revision status. Post detail uses editor 60% and channel-specific preview 40%, revision history, media attachments, source references and per-platform constraints. Approval button requests review of immutable revision fingerprint; on revision changes old approval becomes invalid. Separate scheduling only after exact approved revision, verified authorized connector; schedule and actual publish statuses never conflated.

## Screen E — Creative Studio
Creative brief at top, left asset library and brand kit, central artboard/variant gallery, right metadata and QA inspector. Jobs have type, prompts/reference refs, provider, projected/actual metered cost when available, status and source/rights record. Generation requires provider connection and budget policy, not unrestricted API use. Edits create versions; reviewed asset can be attached to a PED post, landing page or advertisement.

## Screen F — Web Studio
Site tree and page routes left, design canvas/code preview center, content/SEO/accessibility inspector right. Viewport switch desktop/tablet/mobile; diff between revisions. Separate `Preview build` and `Production release` actions, each permissioned. Launch checklist: visual QA, accessibility, performance, structured data, form handling, cookie/privacy requirements, canonical tags. Existing shared `web-developer` role may be assigned; no clone web agent.

## Screen G — SEO / GEO
Audit issue table with URL, category, evidence, impact estimate and confidence. Detail includes suggested fix, responsible agent, diff/preview and verified post-release check. GEO views: crawl accessibility, structured content, question coverage, source quality, monitored search/AI visibility with dates and source caveats. No guarantee of AI model citations; do not invent rankings.

## Screen H — Paid Media
Channels and connected account health, campaigns grid, spend cap, targeting and creative versions, landing-page links, attribution configuration and optimization proposals. External mutating buttons disabled without verified scoped connection and explicit reviewer action. Separate proposal budgets from actual provider spend; currency and reporting windows mandatory.

## Screen I — Email & Lifecycle
Audience and consent provenance first, then segments, email templates and automation journey builder. Test rendering, link validation, sender identity, unsubscribe handling, deliverability warnings. Send/test actions have explicit destination and human approval. CRM owns contacts; the Agency stores segments and marketing consents/references with appropriate permissions.

## Screen J — Video Studio
Script and storyboard left, shot/scene grid center, preview/timeline right, render job history and media rights. Variant templates for social channels. Render estimated cost budget, review checkpoint, delivery/export. Rendering cannot claim completion without provider receipt.

## Screen K — Analytics & CRO
Cross-channel attribution and funnel with verified provider, fetched-at time, chosen attribution assumptions and date range. Comparison and experiment cards show variants, traffic allocation, confidence assumptions and recommended action. In disconnected state show connector setup and explanatory empty states, not demo business KPIs.

## Screen L — Approvals & Audit
Unified table of review requests with action_type, project/brand, object, immutable revision, requested_by, reviewer, status and deadline. Preview exact content and change diff. Approve / request changes / reject subject to server-side role check, audit ID, timestamp. A plan-level approval does not authorize constituent post publishing; ad spend, outbound email and production deploy have independent gates.

## Screen M — Agent Network
Agency Marketing Director hub `marketing-orchestrator`; orbit nodes by verified assignments with stable IDs from `index.html`; selected specialist expands activity/task graph, latest verified run and outputs. Node visibility scales with actual assignments; zoom and pan + full-screen detail + accessible list fallback. No decorative bubbles that imply configured/active agents. Project context preserved when opening task workbenches.

## Frontend architecture guideline
Route pattern (proposal): `/agency/:projectId`, `/agency/:projectId/campaigns/:campaignId`, `/agency/:projectId/ped/:postId`, `/agency/:projectId/web/:siteId`; actual framework choice after repository audit. Components: `AgencyShell`, `BrandSwitcher`, `CommandBar`, `StatusBadge`, `SourceFreshness`, `ApprovalGate`, `RevisionDiff`, `TaskInspector`, `AgentNetwork`, `ConnectorStatus`, `BudgetCap`, `AuditTimeline`. Build only if consistent with current stack; avoid premature dependencies.

## Earliest end-to-end slice
A project member opens Agency → creates brand-scoped brief → creates campaign → drafts PED post → revises → requests exact-version approval → authorized reviewer approves/rejects → state persists with audit; no external posting and no fictitious provider integrations. Add unit tests for state changes, access denial, revision invalidation, idempotency and project isolation; browser checks desktop and narrow viewport. Only then layer on connectors.

## Design acceptance checkpoints
1. Overall visual fidelity to approved RADIX cockpit but editor usability independently validated.
2. All tabs and cards navigate to real records or honest unavailable state.
3. Project/brand context survives back/forward/deep links and server validates membership.
4. Existing agent role IDs map correctly; labels distinguish assigned/idle/live.
5. Focus indicators, keyboard navigation, contrast, responsive, prefers-reduced-motion.
6. No outbound send, publish, spend or production deploy without explicit server-enforced permissions.
7. No demo records disguised as production data.
