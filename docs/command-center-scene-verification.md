# Command Center: orbital scene verification

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
