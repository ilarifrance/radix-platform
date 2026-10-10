# Command Center: orbital scene verification

Scope: `codex/radix-command-center-v1`. No production deployment or merge. No changes to `index.html`, database, credentials, or environment configuration.

## Implemented

- Project light bundles consist of five independently curved SVG filaments. Their endpoints remain on the core and project sphere edges while the pointer changes the curve.
- Configured RADIX roster satellites and explicitly attributed workflow satellites use tilted orbital projection with near/far scale and opacity. Decorative motion does not indicate live execution.
- Hover and keyboard focus pause the selected satellite. The scene stops outside the viewport, when the document is hidden, and for reduced motion.
- Beam geometry is only rewritten when pointer displacement changes. Motion uses one animation loop with capped elapsed time.
- Root mobile view provides an expandable configured-agent list with agent detail actions.
- A separate `/tests/network-visual.html` loads the actual cockpit renderer with clearly labelled synthetic fixtures. It does not call authentication/state/AI endpoints or replace the operational page's authentication.

## Automated verification

Command:

```sh
node --test tests/marketing-approval.test.js tests/network-navigation.test.js tests/network-refinement.test.cjs tests/network-scene.test.js
git diff --check
```

24 tests pass. Coverage includes orbit closure and near/far depth, beam endpoint stability, distinct bundle curves, reduced-motion scheduling, ownership rules, real agent identity on click, zoom bounds and pointer anchoring, expansion of more than 100 tasks, and saved-state accuracy.

## Browser evidence and limits

- Opened the isolated fixture for commit `ed2e075` at `https://radix-platform-cvpzyv8x9-radix-innovation-studio.vercel.app/tests/network-visual.html`.
- Observed the rendered scene and measured its SVG viewport (731.2 × 510 CSS pixels). The scene controller produced changing orbital transforms.
- Found an isolated-fixture CSS loading issue: configured satellite circles rendered black and external stylesheet references reported unavailable sheets. Commit `42453e3` inlines the production CSS into the fixture to correct this test-container issue; it changes no production styles.
- Reverification of that correction failed with a browser tool timeout (`timed out awaiting tools/call after 300s`). The browser session subsequently reset to `about:blank`.
- The secure RADIX sign-in request also timed out. Current operational-data access is unverified.

Do not treat the fixture screenshot as final visual approval. Hover feel, drag, viewport-specific responsive layout, the latest CSS rendering, and workspace project handoff remain unverified in this pass.

## Open work

1. Restore a stable browser session and verify the corrected fixture and authenticated cockpit.
2. Match master sphere highlights, luminous filament density, orbit depth, and spacing with actual screenshots.
3. Verify keyboard, pointer, drag, zoom, breadcrumbs and 390/768/1440 pixel layouts.
4. Resolve selected-project handoff to v3.7. The current workspace reads its active project from shared saved state; it does not read URL project parameters. A solution must respect the restriction on `index.html` and database changes.
5. Per-project agent assignment is absent from current real data. The configured roster stays around RADIX; agents are not arbitrarily attributed to projects.
