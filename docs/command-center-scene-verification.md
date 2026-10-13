# Command Center: orbital scene verification

## Snapshot loading resilience — 11 October 2026

Implementation `568b92cf78065056efd10b94e6ded725a5a96b65` changes `control-center-v2.html`, `command-center-master.css` and `tests/network-navigation.test.js`. Snapshot requests now have a 15-second deadline including JSON parsing, abort stalled network operations, reject invalid snapshot shape, and suppress overlapping loads. Transient refresh errors preserve the previously loaded snapshot with a visible notice and retry button. Initial failure and 401/403 use a clearly labelled blocking panel with retry and workspace access; successful recovery dismisses failure UI.

36/36 tests pass and `git diff --check` passes. New isolated behavioral tests verify transient-error preservation, authentication-error distinction, successful recovery, overlap prevention and body-parsing timeout/abort. These failures were simulated in tests, not injected into the authenticated browser session.

Deployment `dpl_CmoEes1xNB5rZsJcLbRfyfHdi2bo` reached READY for the exact implementation SHA. Authenticated stable Preview loaded Francesco Ilari with 5 projects, no error notice and SNAPSHOT CARICATO. Browser regression verified workflow problem filter (1 of 6 workflows/21 tasks) and Knowledge Aura search (1 of 5 contexts). Only browser-extension metadata errors appeared in captured logs. Verified URL: https://radix-platform-git-codex-radix-c-f9dc2f-radix-innovation-studio.vercel.app/control-center-v2.html . Screenshot `/workspace/scratch/radix-session-regression-568b92c.jpg` contains real saved snapshot data, not a fixture; it shows successful-loading regression, not a simulated failure screen.

Remaining work: failure/retry UI is behaviorally tested but not browser-tested under forced network/authentication faults. Mobile/touch remains unverified. Approvals/external integrations are consultation or unsupported states, and full outputs/AI execution remain unverified. No database, credentials, protections, index.html or production changes. Next priority: validate operational views during snapshot refresh and complete supported detail navigation without inventing external capabilities.

Scope: `codex/radix-command-center-v1`. No production deployment or merge. No changes to `index.html`, database, credentials, or environment configuration.

## Implemented

- Project light bundles consist of five independently curved SVG filaments. Their endpoints remain on the core and project sphere edges while the pointer changes the curve.
- Explicitly attributed project task satellites use tilted orbital projection with near/far scale and opacity. Decorative motion does not indicate live execution.
- Hover and keyboard focus pause the selected satellite. The scene stops outside the viewport, when the document is hidden, and for reduced motion.
- Beam geometry is only rewritten when pointer displacement changes. Motion uses one animation loop with capped elapsed time.
- Unassigned catalog agents are not rendered as satellites. The configured roster remains available in Digital Team and Agents.
- A separate `/tests/network-visual.html` loads the actual cockpit renderer with clearly labelled synthetic fixtures. It does not call authentication/state/AI endpoints or replace the operational page's authentication.

## Automated verification

Command:

```sh
node --test tests/marketing-approval.test.js tests/network-navigation.test.js tests/network-refinement.test.cjs tests/network-scene.test.js
git diff --check
```

24 tests pass. Coverage includes orbit closure and near/far depth, beam endpoint stability, distinct bundle curves, reduced-motion scheduling, ownership rules, actual task identity on click, zoom bounds and pointer anchoring, expansion of more than 100 tasks, and saved-state accuracy.

## Browser evidence and limits — 10 October 2026

- Successfully signed in through the secure browser authentication flow on preview `radix-platform-r86rfk5az-radix-innovation-studio.vercel.app`. The v3.7 page displayed Francesco Ilari and the logout control.
- Opened `/control-center-v2.html` on that origin and observed 5 real projects, 6 unassigned saved workflows and 30 configured catalog agents. No AI request or database mutation was initiated.
- Verified an agent detail, the truthful Aura empty state, breadcrumbs, and pointer-driven beam curve changes. The endpoint coordinates stayed unchanged while control points changed.
- Isolated fixture: verified RADIX → Aura → workflow → task detail; zoom changed to 110%; expansion reset the camera to 100%; native drag produced `translate(40px, 20px) scale(1)`.
- Fixture iframe widths 390 and 768 pixels produced content viewport widths 375 and 753 pixels (scrollbar included) with matching body scroll widths: no horizontal overflow. This is a width check, not a real mobile-device test.
- Found and corrected black catalog circles caused by `circle:first-child` following an SVG title; changed the selector to `first-of-type`. Subsequently removed the catalog satellites entirely in response to the user's explicit project-only semantics.
- Fixed missing geometric-font fallbacks and increased curved filament readability.
- Verified fixture `fc1d94e`: 72 project task satellites, zero unassigned catalog satellites, and curved orbital tethers.
- Found a pointer targeting defect: an SVG group containing both a sphere and its long tether had a bounding box reaching the project hub. Commit `0d886f1` moves tethers outside the interactive groups.
- Keyboard activation on `0d886f1` opened Task di test 1 and the full RADIX → Aura → Workflow → Task breadcrumb. Pointer testing exposed a second issue: project label foreignObjects could cover satellites. Commit `fe79409` draws satellites above project labels and adds a transparent 24-unit hit target.
- Latest project satellites derive from explicitly owned workflow tasks; workflows without tasks retain one workflow satellite. Each satellite's light filament follows its tilted orbit and remains anchored to its project.

- Final pointer verification on `fe79409` succeeded: clicking the first orbiting satellite opened Task di test 1 and the full ownership breadcrumb.
- Final mobile-width check on `fe79409`: network height 300 CSS pixels, body scroll width and viewport both 375 pixels for the 390-pixel iframe.
- Final verified fixture URL: `https://radix-platform-r7pazutuo-radix-innovation-studio.vercel.app/tests/network-visual.html`. It uses synthetic tasks explicitly labelled as tests; these are not real assignments.
- Screenshots saved: `radix-operational-192b7b6.jpg` (authenticated real data before project-only semantics), `radix-project-satellites-fe79409.jpg` (final synthetic fixture).

## Open work

1. Continue matching the master: globe surface detail, stronger light emitters, irregular cluster composition and beam density.
2. Complete a real-device touch and keyboard accessibility pass; reduced-motion scheduling is covered by automated tests, not yet an OS preference test.
3. Resolve selected-project handoff to v3.7. The workspace reads active project from shared saved state and does not read URL project parameters. A solution must respect the restriction on `index.html` and database changes.
4. Current real workflow records lack project assignment. No agents or tasks are arbitrarily attached to projects; empty project clusters are intentional.

## Shared workflow scope confirmed by Francesco

Francesco confirmed on 10 October that the existing unassigned workflows belong to all projects. The legacy projection now enables an explicit shared-workflow view flag. Their tasks appear in each real project cluster labelled “condivisa”; the same workflow and task IDs and saved states are retained. No database ownership field is changed, no workflow is duplicated or executed. Explicit project ownership still restricts a workflow to its original project. The isolated fixture has an optional `?shared` mode to verify this behavior.

Automated suite: 25 tests pass, including shared ownership, unchanged task identities and statuses, and exclusion from unknown project IDs. Earlier notes about empty real project clusters describe the state before this user-confirmed shared scope.

## Workflow grouping and authenticated verification — 11 October 2026

Implementation commit: `e3a1db4a0c9c33fd669720796eeeb32b3bbe0e5f` on the authorized branch only.
Changed implementation files: `control-center-v2.html`, `command-center-master.css`, `tests/network-navigation.test.js`.

- Root satellites now represent saved workflows, with their actual task counts. No execution, ownership, node identity or stored state is changed.
- Browser verified 30 satellites (6 workflows across 5 real projects), replacing 305 task satellites. Counts per shared cluster are 3, 21, 12, 13, 1 and 11: 61 tasks remain accessible, not 305 unique tasks or agents.
- Verified authenticated operational Preview: https://radix-platform-git-codex-radix-c-f9dc2f-radix-innovation-studio.vercel.app/control-center-v2.html . Session showed Francesco Ilari and SNAPSHOT CARICATO.
- Keyboard activation of an Aura satellite opened marketing-orchestrator with 3 tasks; activating its first task opened Copywriter, saved status done, the actual Fogher landing-page description and explicit shared scope. Breadcrumb showed RADIX → Aura → marketing-orchestrator → Copywriter.
- Closed detail, returned to RADIX through breadcrumb, changed zoom to 110% and reset to 100% in the browser.
- All 25 tests pass again; git diff --check passes. Tests retain 120-task expansion, ownership isolation, shared identity, zoom anchoring and reduced-motion coverage.
- Actual-data screenshots: `/workspace/scratch/radix-workflow-groups-before.jpg` and `/workspace/scratch/radix-workflow-groups-after.jpg`. These are operational data, not fixture screenshots. Screenshot files are session artifacts, not repository assets.
- A prior reload hit browser credential-observation restrictions. Opening a fresh document through the browser's prescribed recovery restored observation. No authentication protection was modified.

Remaining work: master fidelity is NOT complete. Orbiting spheres can still cross long project labels; root composition with five projects is tighter than the four-project master. Improve label clearance, distinct cluster arrangements and globe highlights next. Recheck responsive layout and pointer targeting after those changes. Sidebar Workflows currently shows running snapshot count (0), although six saved workflows exist: clarify this distinction. Full dedicated sections and agent execution remain unverified. The v3.7 selected-project handoff remains blocked by the restrictions on index.html and database writes. No workflow was executed, no production deployment or merge performed.

### Distinct cluster geometry pass

Commit `2aa8738738494414767a1084715885afb02c1853` adds a dedicated five-project layout, gives Aura the largest orbit, and assigns distinct radii, tilt, phase and speed to the remaining clusters. Project labels now have a restrained dark readability plate; workflow spheres have stronger local highlights. This does not change workflow data or imply live execution.

The authenticated stable Preview reached `SNAPSHOT CARICATO` with 5 projects and 30 workflow satellites. Visual inspection confirmed more separation and readable project names. Keyboard verification still opened RADIX → Aura → marketing-orchestrator, then the real Art Director task detail. Screenshot: `/workspace/scratch/radix-cluster-spacing-2aa8738.jpg` (actual authenticated Preview data; session artifact only). Automated suite remained 25/25 passing and `git diff --check` passed.

Residual visual issue: moving satellites can still temporarily approach the lower edge of very long two-line labels, especially Personal Brand and RADIX. The dark plate keeps the name readable, but a later pass should reserve a true exclusion zone in the orbital projection. The fifth real project also necessarily differs from the four-cluster master composition.

## Data-backed operational sections

Commit `78136a9be2ab0c8242da8cd7a0a7e2af0bd32976` activates Agents, Knowledge, Approvals, Analytics and Integrations in the left navigation. The views reuse the central cockpit panel and only render information present in the loaded snapshot. Unsupported capabilities have explicit empty or unavailable states; they do not become simulated features.

Authenticated Preview verification confirmed:

- Agents: 30 configured records, saved idle/done/error states and tasks; “live execution not verified” remains visible. Opening Stratega di Marca e Campagne showed its saved done status, Marketing team, real task and `marketing-orchestrator:5` workflow ID.
- Knowledge: five real project context cards with recorded summaries.
- Approvals: truthful empty state because the centralized module is unavailable; workflow errors are not presented as approvals.
- Analytics: 5 projects, 6 saved workflows, 61 saved tasks, 5 completed workflows and 1 error/block, labelled as snapshot-derived rather than live telemetry.
- Integrations: snapshot and v3.7 workspace availability are shown; external-system connection state remains explicitly unavailable.

The browser screenshot `/workspace/scratch/radix-agents-section-78136a9.jpg` contains authenticated operational data. The suite is now 26/26 passing and `git diff --check` passes. The sections are useful read-only surfaces; they do not start workflows or agents. Dedicated full-page modules, richer filtering and responsive interaction checks remain open.

## Saved workflow and live snapshot distinction

Commit `43c9cb245bae42899d1cbc57fae6d52943fe081a` removes the remaining ambiguity between configured data and current execution state. The sidebar badge now reports the six saved workflow records, with an accessible label that also states that zero are in progress in the snapshot. The header KPI continues to report zero because it intentionally represents in-progress work only.

The central panel now changes title and explanatory metadata for Network, Workflows, Projects, Agents, Knowledge, Approvals, Analytics and Integrations. Map-specific controls are hidden in data-backed operational views and restored in the map/workflow/project views.

Authenticated browser verification on the stable Preview reached `SNAPSHOT CARICATO` and confirmed:

- sidebar badge `6` with `6 workflow salvati; 0 in corso nello snapshot`;
- Workflows header and map toolbar visible;
- Agents header with the operational view visible and map toolbar hidden;
- Analytics header, toolbar hidden, and the real saved counts 5 projects, 6 workflows and 61 activities.

Screenshot: `/workspace/scratch/radix-analytics-43c9cb2.jpg` (authenticated operational data, not a fixture). Automated suite remains 26/26 passing and `git diff --check` passes. Vercel deployment `dpl_DcbNgmCBLE47He1p8oV524PkjGtW` for the exact commit reached `READY`; no production deployment was created.

## Protected project-label layer

Commit `2d102f87ca094ab58d2b907868896030d0839665` separates the project labels from their interactive hubs and renders them in a final, non-interactive SVG layer above the moving workflow satellites. The three-dimensional orbits and tethers remain unchanged, but spheres now pass visually behind the dark label plate instead of covering project names or intercepting clicks over the text area.

The automated suite is 27/27 passing, including a new markup-order assertion for the protected label layer; `git diff --check` passes. Deployment `dpl_BeqerqWdqPgUtfBjbQpcQxvLW8EX` for the exact commit reached `READY`.

Authenticated stable-Preview verification confirmed 5 protected project labels, 30 workflow satellites, `pointer-events: none` on label overlays and the label layer after every satellite in SVG paint order. Clicking the first moving satellite still opened `RADIX → Aura — assistente personale AI → marketing-orchestrator`, demonstrating that the readability layer does not break drill-down. Screenshot: `/workspace/scratch/radix-label-clearance-verified-2d102f8.jpg` (authenticated real snapshot; not fixture data).

Remaining visual priority: improve globe surface detail and light emitters against the approved master, then repeat the mobile/touch pass on the operational sections. The selected-project handoff to v3.7 remains constrained by the prohibition on `index.html` and database changes.

## RADIX globe and emitter pass

Commit `0643fe29446cef0a123871f2001aa95249477ee9` adds layered depth to the central RADIX globe: a stronger directional gradient, clipped latitude/longitude and contour lines, specular highlight, upper sweep, broad halo and 16 light emitters aligned with the origins of the energy rays. The emitters use a restrained staggered pulse and are static under `prefers-reduced-motion`.

The change is visual only and does not affect workflow state, project ownership or navigation. Automated verification is 28/28 passing, including the new surface/emitter markup checks; `git diff --check` passes. Vercel deployment `dpl_2gh1xNeyV1ZZnztFuufqfvJRtP8P` for the exact commit reached `READY`.

Authenticated browser verification on the stable Preview confirmed one core surface layer, one specular layer, 16 emitters, five real projects and 30 saved-workflow satellites after `SNAPSHOT CARICATO`. No application-origin console error was observed; the sole browser log error came from the browser extension metadata channel. Screenshot: `/workspace/scratch/radix-core-surface-0643fe2.jpg` (authenticated real snapshot, not fixture data).

Next priority: responsive/touch verification of the data-backed operational views and any fixes discovered there. Full selected-project handoff to v3.7 remains blocked by the explicit `index.html` and database-write restrictions.

## Responsive operational-view hardening

Commit `606dc058a55b965c3c4b21d999f12f4fae0f1497` corrects the responsive structure of Agents, Knowledge, Approvals, Analytics and Integrations. Operational cards move from three columns to two below 1000 px and one below 760 px. On small screens the operational view leaves the fixed-height network canvas, uses document scrolling instead of nested scrolling, stacks its header action, and gives the return button and cards minimum 44 px touch targets. Coarse-pointer rules also enlarge navigation, map controls and breadcrumb actions without changing desktop density.

Automated verification is 29/29 passing, including responsive structure and touch-target assertions; `git diff --check` passes. Deployment `dpl_4XngzTBDE6JgSsxUdsPg63RM5eBv` for the exact commit reached `READY`.

Authenticated desktop regression verification confirmed `SNAPSHOT CARICATO`, the Agents view with 30 real configured records, a three-column desktop grid, the map toolbar hidden and the central container preserved at 510 px. Screenshot: `/workspace/scratch/radix-responsive-agents-606dc05.jpg` (real authenticated snapshot).

Limit: this environment did not expose a browser viewport-resize control, so the small-width behavior is verified by CSS/test assertions rather than claimed as a physical-device touch test. A real phone or emulated-device interaction pass remains open.

## Functional workflow/task/agent navigation — 11 October 2026

Implementation `0211ec0bc59e6321c7eeae5ce78299e2d82591d6` changes `control-center-v2.html`, `command-center-master.css` and `tests/network-navigation.test.js`. Workflow drawer activities are now native keyboard-accessible buttons; every saved task can open a detail with original workflow/task IDs, saved status and description. The detail returns to its original workflow or opens the recorded agent. Agent details link back only to a workflow actually present in the loaded snapshot. No workflow execution or ownership mutation is introduced.

31/31 tests pass; `git diff --check` passes. New behavioral tests exercise 61-task reachability, the last task's original identity/error state, escaped descriptions, task-to-agent and return navigation, unknown task handling and suppression of nonexistent workflow links. Existing network navigation/ownership/reduced-motion tests remain passing.

Authenticated browser verification on https://radix-platform-git-codex-radix-c-f9dc2f-radix-innovation-studio.vercel.app/control-center-v2.html confirmed `SNAPSHOT CARICATO` and the actual marketing-orchestrator:9 workflow with three task buttons. Opened Art Director task marketing-orchestrator:9:2, verified saved done status and description, returned to the workflow, opened its agent and followed the agent back to the same workflow. The legal error workflow exposes all 21 saved tasks. Deployment dpl_AE9vycSMfr8VX6wFipveMenryGLX reached READY for the exact implementation SHA.

Before screenshot: /workspace/scratch/radix-workflow-task-before.jpg. Functional detail screenshot: /workspace/scratch/radix-task-detail-verified-0211ec0.jpg. Both contain authenticated real snapshot data, not synthetic fixtures. Visual inspection exposed native white backgrounds on the new drawer buttons; correction `184285da76dee9371490eef69c91c8f32077a796` gives them dark backgrounds, readable text and 44px minimum height.

Limits: descriptions remain the existing snapshot excerpts (220 characters); full generated outputs are not present in the cockpit projection and the task detail explicitly says so. No agent execution was tested, no external action performed. Mobile/touch verification and v3.7 selected-project handoff remain open. The map's existing task detail remains separate from the new workflow-drawer task detail; consolidating those paths and adding task/output search is the next functional priority. Approvals and external integrations remain unsupported/consultation states, not completed applications.

Final browser pass after `184285da76dee9371490eef69c91c8f32077a796`: deployment dpl_HUQjbaDXv4fkP51aDuqHcvZRoaxM reached READY. Stable Preview reloaded authenticated data and task detail remained navigable. Computed return-button background rgb(16,43,30), text rgb(161,244,197), height 44px. Final screenshot: /workspace/scratch/radix-task-detail-final-184285d.jpg. One immediate post-reload task click did not transition; inspection showed the workflow drawer unchanged, and clicking after the drawer had rendered succeeded. No application error was observed in captured error logs; browser-extension metadata errors were present. This is desktop verification, not mobile/touch verification.

## Task search and unified task detail — 11 October 2026

Implementation `7daa67bde62c645c9d0a5d976d719cbe5f938d36` changes `control-center-v2.html` and `tests/network-navigation.test.js`. Global search now indexes every saved workflow task by label, recorded agent ID, description and saved status. Selecting a task result opens the task by its original workflow and task IDs. Network View task nodes use the same `openTask` path as workflow-list and search results, removing the earlier divergent detail markup.

The full suite is 32/32 passing and `git diff --check` passes. The new behavioral test searches a saved task description, verifies the Italian activity result label, opens the exact workflow/task identity and checks the truthful empty-result state. Existing tests confirm map activation now targets the same original task identity for private and shared workflows.

Vercel deployment `dpl_Ai9GQtmQFF57Fmdw8NxN8ZNJL5Cs` for the exact implementation SHA reached `READY`. Authenticated verification on the stable Preview loaded Francesco Ilari's snapshot. Searching `fotovoltaico` returned one project, one workflow and three actual saved tasks. Selecting Art Director opened `marketing-orchestrator:9:2`, status `done`, with the saved description. The Network View path RADIX → Aura → marketing-orchestrator → Art Director · condivisa opened the same detail and identity. No application-origin console error was captured; the observed errors were emitted by the browser metadata extension.

Screenshots: `/workspace/scratch/radix-task-search-7daa67b.jpg` shows the authenticated search result detail; `/workspace/scratch/radix-unified-task-detail-7daa67b.jpg` shows the same task reached through the Network View. These are real snapshot data, not fixture data.

Remaining limits: the cockpit snapshot still stores 220-character task excerpts rather than complete outputs. Project handoff to v3.7 remains blocked by the restrictions on `index.html` and database writes. Mobile/touch interaction remains unverified. Approvals and external integrations are honest consultation/empty states; they are not operational applications yet. Next functional priority is adding useful status/project filters to workflows and tasks, then improving Knowledge navigation without fabricating unavailable records.

## Knowledge context navigation — 11 October 2026

Implementation `31ff25a3409b8748449c89133cbe727328dfe05a`, with visual correction `c826b9cbb8f13dc272913312c55919aa8566aa96`, changes `control-center-v2.html`, `command-center-master.css` and `tests/network-navigation.test.js`. Knowledge now searches actual project names, types and complete saved summaries, opens the full project profile, and links to the project Network View or a project-scoped workflow list. Lower Knowledge & Resources cards are keyboard-accessible navigation buttons. The project drawer accurately describes shared workflow scope and explicitly warns that opening v3.7 does not set its active project.

34/34 tests pass and `git diff --check` passes. Behavioral tests exercise context search, empty results, filter reset, project navigation and rejection of unknown projects without data mutation. Authenticated stable Preview verified five real contexts, Doc Capital search returning one context, full saved summary, project scope `doc-capital` with six shared workflows/61 tasks, truthful no-result search and RADIX → Aura breadcrumb after project map navigation. No application-origin error was observed; errors logged by the metadata extension are unrelated to application execution.

Deployments `dpl_EVrgGzxV9Tx6nNtRLdiuRH3CdDhq` and `dpl_8odmM2S2e4ha7fTbH3hZBot9vyz4` reached READY for the exact respective implementation SHAs. Initial visual inspection exposed overly tall context cards; the correction limits previews to 220 characters while retaining the full saved summary in the drawer and full-text search. Final authenticated screenshot: `/workspace/scratch/radix-knowledge-final-c826b9c.jpg`; earlier visual evidence: `/workspace/scratch/radix-knowledge-verified-31ff25a.jpg`. Verified URL: https://radix-platform-git-codex-radix-c-f9dc2f-radix-innovation-studio.vercel.app/control-center-v2.html . These contain real saved snapshot data, not fixtures.

Limits: Knowledge is a searchable context browser, not a document archive or complete AI-memory system. No database, agents, production or external workflow was mutated. Mobile/touch remains unverified. Next priority: inspect session/loading/error resilience and supported Approvals/Integrations data paths; do not represent unsupported mutations as completed applications.

## Operational workflow filters — 11 October 2026

Implementation `87814401100430b2625ce455270967792f83f184` adds data-backed filtering to the Workflows view without changing stored records. Users can filter by project scope, workflow status and task status. Project scope includes shared unassigned workflows only when `sharedWorkflowCatalog` is enabled; explicit owners remain isolated, and a shared workflow keeps one original identity rather than becoming duplicated executions. Selecting a task status exposes direct task buttons that open the unified detail by original workflow/task IDs.

Changed files: `control-center-v2.html`, `command-center-master.css`, `tests/network-navigation.test.js`. The suite is 33/33 passing and `git diff --check` passes. Behavioral coverage verifies shared/private scope, unknown-project exclusion, problem and active status groups, matching task subsets and preservation of original objects.

Vercel deployment `dpl_CMdsKcrur5MXzxrva1YxKMqWip3V` reached `READY` for the exact implementation SHA. Authenticated browser verification on the stable Preview loaded Francesco Ilari's snapshot and confirmed:

- default result: 6 of 6 workflows and 61 activities;
- workflow problem filter: only `legal-orchestrator`, 1 of 6 workflows and 21 activities;
- Aura project scope: six shared workflows shown once each, not duplicated records;
- problem-task filter: 21 direct task buttons;
- opening the first result reached `legal-orchestrator:1:0`, saved status `error`, with its actual saved NDA description and truthful output-unavailable message.

Screenshot: `/workspace/scratch/radix-workflow-filters-8781440.jpg` (authenticated real snapshot, not a fixture). No application-origin console error was captured; logged errors came from the browser metadata extension. The project selector visually truncates long names at this desktop width but preserves the complete native option text. Mobile/touch interaction remains unverified. Next functional priority: connect Knowledge project cards to useful project/detail navigation, then improve supported Approvals and Integrations states without representing unavailable mutations as operational.

## Approvals workflow-block navigation — 11 October 2026

Implementation `b9c844098a279978e7e66a9b9b2a7184cae1c4ab` changes `control-center-v2.html`, `command-center-master.css` and `tests/network-navigation.test.js`. The Approvals view continues to report the centralized module as unavailable and zero central requests. In a separately labelled section it now exposes only actual snapshot workflows whose saved status is `error` or `blocked`; these cards are explicitly marked as workflow blocks, not approvals, and open the original workflow detail. Duplicate attention records, unknown workflow IDs and completed workflows are excluded.

The snapshot refresh path now rerenders the operational view currently on screen, so Agents, Knowledge, Approvals, Analytics and Integrations do not retain stale content after a successful periodic or manual refresh. The full suite passes 37/37 tests and `git diff --check` passes. New behavioral coverage verifies workflow identity/status filtering, deduplication and visible-view refresh behavior.

Vercel deployment `dpl_Ehhig4C9nSxttgLsSW9zQXCiqeCf` reached `READY` for the exact implementation SHA. Authenticated verification on https://radix-platform-git-codex-radix-c-f9dc2f-radix-innovation-studio.vercel.app/control-center-v2.html loaded Francesco Ilari's snapshot with five projects and six saved workflows. Approvals showed no centralized request and one distinct real block, `legal-orchestrator`; opening it showed saved `error` state and all 21 original activities. Screenshot: `/workspace/scratch/radix-approvals-workflow-b9c8440.jpg` (authenticated real snapshot, not fixture data).

Limits: Approvals remains a truthful read-only consultation surface because the current snapshot exposes no approval records or mutation endpoint. No workflow, agent, external action, production deployment or database write was triggered. Mobile/touch interaction and the selected-project handoff to v3.7 remain open. Next functional priority is improving Integrations with verified connection diagnostics and actionable read-only paths where the snapshot supports them.

## Verified Integrations diagnostics — 11 October 2026

Implementation `c1573f7fe000f4c5ddfd0cf60a0881a44fa638fd` changes `control-center-v2.html` and `tests/network-navigation.test.js`. Integrations is now a read-only diagnostic hub derived from the loaded snapshot. It distinguishes authenticated snapshot/session data, the saved v3.7 orchestrator catalog, the existing workspace and external systems whose state is not exposed. It reports six saved workflows, 30 configured agents and unverified live execution from the actual snapshot; it does not infer active agents or external connections.

The Orchestratori v3.7 card navigates to the existing filtered workflow surface, where all six saved workflows and 61 activities remain reachable. The Workspace card preserves the existing link and explicitly states that the selected project is not transferred. No connection, permission or stored record is modified.

The complete suite passes 38/38 tests and `git diff --check` passes. Behavioral coverage verifies source identity, workflow/agent counts, verified/unverified flags, external-system empty state and the internal workflow navigation action. Vercel deployment `dpl_G6564bo9nHsAEWiFUMCbyep4R8oc` reached `READY` for the exact implementation SHA.

Authenticated browser verification on https://radix-platform-git-codex-radix-c-f9dc2f-radix-innovation-studio.vercel.app/control-center-v2.html confirmed Francesco Ilari's snapshot, the four diagnostic states and navigation from Integrations to Workflows showing 6 of 6 workflows and 61 activities. Screenshot: `/workspace/scratch/radix-integrations-c1573f7.jpg` (authenticated real snapshot, not fixture data).

Limits: external integration status remains unavailable because the snapshot has no connection inventory. The page therefore remains diagnostic rather than a connection-management application. Mobile/touch interaction and selected-project transfer to v3.7 remain open; the latter cannot be completed without changing the prohibited workspace entry path or persisted state.

## Agent roster search and filters — 11 October 2026

Implementation `3e5dcb6e18db27a7050cc45e87cdae9e8d0973c2` changes `control-center-v2.html`, `command-center-master.css` and `tests/network-navigation.test.js`. Agents now supports search across configured name, stable agent ID, team and saved task, plus team and saved-status filters. Result counts and truthful empty states update without changing the roster or snapshot. Error/blocked and running/pending/stale groupings remain distinct, and an agent without a saved record remains `idle`; configured agents are not presented as live executions.

The complete suite passes 39/39 tests and `git diff --check` passes. Behavioral coverage verifies name/task search, team filtering, problem and idle state selection, empty results and preservation of the original roster/state objects.

The automatic Vercel deployment `dpl_2ZKfjbNtu6sBtrZFnKehnZXuPsAM` reached `READY` for commit `5b1b3f35a74818a792c3e5079e8d86bbea5d0228`, which includes the implementation unchanged. Authenticated verification on the stable Preview loaded Francesco Ilari's snapshot with five projects, six saved workflows and 30 configured agents. Combining team `Legal` with the problem-status grouping reduced the roster to four real saved records. Opening `Esperto Privacy e GDPR` showed its saved `error` state, Legal team, actual Cookie Policy task and linked workflow `legal-orchestrator:1`; the workflow navigation action remained available. Screenshot: `/workspace/scratch/radix-agents-filter-5b1b3f3.jpg` (authenticated real snapshot, not fixture data).

No workflow, agent, external action, production deployment or database write was triggered. Remaining priorities: perform a real mobile/touch pass and verify the selected-project transfer to v3.7 if it can be completed without changing `index.html` or writing the database. Approvals and external integrations remain truthful read-only/diagnostic surfaces where the snapshot exposes no mutation endpoint.

## Project brief → PED workspace — 11 October 2026

Implementation commit `5ca3b16a58c89b911067cf5284bdd1ba63a3f738` adds `project-editorial.html`, `editorial-workspace.css`, `editorial-workspace.js`, `editorial-core.js`, `tests/editorial-flow.test.js` and updates `control-center-v2.html`. Project PED buttons and project-detail links now preserve the original project ID in the dedicated workspace URL. The page verifies the authenticated account and reads the original project from `/api/state`; it never changes the v3.7 active project or writes the database.

The brief page shows the saved project context, editable goal/audience/channels/period/voice, missing-field checks and a confirmation gate. The PED route offers chronological content cards, search/channel/status filters, a content editor, local revisions, request-review/approve/request-changes transitions and JSON export. Editing a content version invalidates its previous approval; changing the brief invalidates readiness and prior content approvals. Storage is browser-local and keyed by account plus project. These local approvals are not server approvals and never authorize publication. No content is prepopulated and no agent is called.

Coordination: read the Marketing Agency branch without modifying it. `agency/new-project.html` already prepares briefs and requests orchestrator plans; `agency/project-workspace.html` handles specialist drafts and dependency approvals; `agency/ped.html` is still explicitly a disconnected UX fixture. The new Command Center workspace does not copy its AI routing, Operations or Memory Engine. Server synchronization and the handoff from approved specialist outputs into the real PED remain future integration work. Personal Context confirmed the existing Agency sequence and pending Preview-database isolation for memory migration; no migration was attempted.

Verification: 44/44 tests passed (39 regression tests plus five behavioral editorial-flow tests); both new JavaScript files parse and `git diff --check` passes. GitHub commit status reports `success / Deployment has completed` for the exact implementation commit, with target `https://vercel.com/radix-innovation-studio/radix-platform/7D2VbEpMaNx19sZP7CvykKNbD7NK`. Vercel MCP deployment listing returned HTTP 403 for the requested team scope; no Vercel CLI was available, so API inspection of READY/gitSource was not claimed. The stable Preview was reloaded and the new project-to-PED link and pages were directly verified.

Authenticated browser path verified: Command Center → Projects → PROVA → PED → brief → confirmed brief → PED. URL actually opened: `https://radix-platform-git-codex-radix-c-f9dc2f-radix-innovation-studio.vercel.app/project-editorial.html?project=prova#ped`. The underlying project context is real authenticated data. Entered brief fields and one content are clearly marked `VERIFICA UI` and are synthetic browser-local test input, not real scheduled work. Verified saving v1, requesting review, local approval, editing to v2/draft, empty search results and persistence after reload. The captured error log showed only browser-extension metadata messages.

Screenshots: `/workspace/scratch/radix-project-brief-5ca3b16.jpg` shows real authenticated context before test input; `/workspace/scratch/radix-ped-revision-5ca3b16.jpg` shows the synthetic test content at v2/draft after approval invalidation. No publication, external action, paid AI invocation or database write was performed. Synthetic local test input remains clearly labeled in this isolated browser.

Limits: this is an initial functional local editorial workspace, not the final master-faithful PED or a connected AI campaign execution system. It currently provides chronological cards, not a full monthly calendar. JSON export is implemented but not browser-tested. Mobile/touch, cross-tab conflict handling, shared persistence and import are not verified/implemented. Next priority: connect the approved Agency deliverables using a shared project identity and agreed data contract, then add the full calendar and final PED composition; preserve separate branches and obtain an isolated Preview data store before server writes or memory migration.

## Versioned project strategy — 11 October 2026, evening

Expanded the existing project page into brand/context, offer, objective, audience, channels, period, tone, positioning, messages, editorial topics, cadence, KPIs, materials and explicit gaps. Strategy approval now records the exact revision and a local timestamp. Prior strategy snapshots remain visible; content revisions preserve previous copy and metadata. Strategy changes flag existing content for review without deleting it. Legacy boolean approvals are revalidated rather than silently approving the expanded strategy.

Files: editorial-core.js, editorial-workspace.js, editorial-workspace.css, project-editorial.html, tests/editorial-flow.test.js and this report. Remote baseline b37058281b5b64c2789a913c9d30292cf0f014d7; no AGENTS.md found in its recursive tree. Agency directory inspected read-only; its separate workflow was not copied or modified.

Verification: 47/47 tests pass including exact-version strategy approval/history, legacy approval invalidation and whitespace-normalized no-op saves; JS syntax and diff checks pass. Browser verification pending at commit preparation. Storage and approvals remain browser-local. Calendar composition, separate planning approval, Agency handoff and authenticated end-to-end recheck remain next priorities; no publishing or paid AI connected.

Browser follow-up for implementation 4c1322176be3ec02d1cb03ff9d35252dd0fba2fa: GitHub exact-commit deployment status success. Reloaded authenticated Preview https://radix-platform-git-codex-radix-c-f9dc2f-radix-innovation-studio.vercel.app/project-editorial.html?project=prova#brief showed all strategy fields. Synthetic local VERIFICA UI values were approved at v1 and opened PED; returning and changing topics produced v2 awaiting approval, with v1 approved retained in the visible history. Screenshot /workspace/scratch/radix-strategy-4c13221.jpg. No real campaign or AI execution occurred. Desktop visual inspection passed for field readability and history; the form is long and needs further navigation refinement. Mobile, calendar and orchestrator integration remain unverified/incomplete.

## Stale content approval guard — 12 October 2026

Fixed a verified behavioral gap: reapproving a changed strategy previously allowed requesting review and approving an old content revision still marked needsStrategyReview. Review/approval now require a content version saved against the current strategy; request-changes remains available. Existing copy/history stays intact. Files: editorial-core.js, tests/editorial-flow.test.js and this report. 48/48 tests pass, including full approve → change strategy → reapprove strategy → stale review rejected → revise content → approve path. Baseline 326376dd3cd7506e19ced7da8cbc641e87ed317d. Browser verification for this change remains pending; no new screenshot or visual change claimed. Planning approval and calendar UI are still incomplete; all editorial persistence remains local. No production/DB/AI/external workflow changes.

## Separate editorial planning approval — 12 October 2026

Implementation adds a distinct local planning approval, separate from strategy and per-content approval. The approved plan is bound to the current strategy revision and an exact deterministic fingerprint of content identity, title, channel, date and revision. Approval requires at least one dated content and rejects items awaiting strategy review. Adding, rescheduling or revising content, or changing strategy, invalidates plan approval without deleting work. The interface states explicitly that planning approval does not authorize publication.

Files: editorial-core.js, editorial-workspace.js, editorial-workspace.css, project-editorial.html, tests/editorial-flow.test.js and this report. Baseline 2a157ebc44bcfc8fcda37ba132051cf047b029d5. 50/50 tests pass, JavaScript syntax and diff checks pass. Browser/deployment verification pending. Storage and all three approvals remain browser-local; calendar composition, Agency handoff and publishing remain unconnected.

Browser verification exposed that the initial d2c054f2b8e45a0ac6d32be4a78bd0149eb9a38f markup and core logic deployed, but the planning approval button had no click listener because the mechanical source edit omitted it. Corrective commit adds the listener. The browser did successfully verify authenticated project loading, strategy gating, synthetic local content creation and the truthful unapproved planning state before correction. Exact post-correction browser verification remains required.

Post-correction browser verification for 75ea109599b2ddbe4a2cbfe44cb431cf334858ea: exact-commit GitHub deployment status success. Authenticated Preview loaded project PROVA. With explicitly synthetic browser-local VERIFICA UI strategy and one dated LinkedIn draft, the planning action changed the visible state to “Pianificazione approvata localmente · nessuna pubblicazione autorizzata” and disabled repeated approval. Screenshot: /workspace/scratch/radix-plan-approval-75ea109.jpg. This validates the separate planning approval UI and persistence path; no real content, publishing, AI, database or external action occurred. Calendar remains the next priority.

## Functional PED calendar — 12 October 2026

Added a data-driven editorial calendar with Day, Week, Month and Year views, previous/next/today navigation, Europe/Rome planning label, real empty states and clickable content cards that reopen the existing editor. Content now supports an optional validated HH:MM time; time is preserved in revision history and included in the exact planning approval fingerprint, so rescheduling invalidates approval. No sample events, collaborators or live agents are generated.

Files: editorial-core.js, editorial-workspace.js, editorial-workspace.css, project-editorial.html, tests/editorial-flow.test.js and this report. Baseline 72c9a3ec2496fab8cf8f2252b5addac350993260. 52/52 tests pass, including deterministic calendar ranges, invalid dates/views, time validation/history and planning invalidation; both JavaScript files parse and diff checks pass. Browser/deployment verification pending. This is a functional calendar composition but further visual tuning against the approved reference remains expected; drag-and-drop and server collaboration are not implemented.


### Browser verification — commit 81b3c72

GitHub reported a successful deployment for the exact implementation commit `81b3c72f6abc9108106c7d89e21cc6d0e9a3429c`. Authenticated browser verification on the stable Preview completed the project strategy → exact strategy approval → PED path using only explicitly labelled `VERIFICA UI` browser-local synthetic data.

Verified interactions: empty PED state; creation of a dated LinkedIn draft with time 09:30; Month rendering on 4 November 2026; clickable calendar card reopening the same content/version; Day, Week, Month and Year view switching; previous/next/today navigation; Europe/Rome label; and separate planning approval. The visible final state was “Pianificazione approvata localmente · nessuna pubblicazione autorizzata”. No publishing, AI generation, database write, external workflow or production deployment occurred.

Verified URL: https://radix-platform-git-codex-radix-c-f9dc2f-radix-innovation-studio.vercel.app/project-editorial.html?project=prova#ped . Screenshot: `/workspace/scratch/radix-ped-calendar-81b3c72.jpg` (real authenticated project context plus clearly marked synthetic local test content).

Automated verification remains 52/52 passing; both JavaScript files parse and `git diff --check` passes. Residual work: closer visual tuning to the approved PED reference, drag-and-drop/rescheduling, mobile/touch verification, shared/server persistence, Agency output handoff and orchestrator integration. Current approvals remain local records and never authorize publication.
