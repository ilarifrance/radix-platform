---
name: RADIX
version: 0.1 (draft 2026-10-15)
status: draft — points marked PROVISIONAL wait for Francesco's decision
mode: operate
theme: dark
colors:
  bg: "#02090B"
  bg-raised: "#041014"
  surface: "#041115"
  surface-2: "#07191E"
  border: "#133C3D"
  border-strong: "#1B5654"
  text: "#F1FAFB"
  text-muted: "#9BB4BD"
  text-subtle: "#718C96"
  core: "#00EAB5"
  core-soft: "#77FFE0"
  area-projects: "#65B8FF"
  area-sales: "#36EDBD"
  area-agency: "#B68CFF"
  area-studio: "#F4BD5F"
  area-venture: "#32D6C5"
  area-executive: "#FF6B70"
  area-knowledge: "#8EA9C0"
  status-success: "#1EF28F"
  status-warning: "#F4BD5F"
  status-error: "#FF6B70"
  status-info: "#65B8FF"
typography:
  display: "Space Grotesk, 600–700"
  body: "Inter, 400–600"
  mono: "ui-monospace, SFMono-Regular, Menlo"
  scale-px: [12, 13, 14, 16, 18, 22, 28, 36, 48]
  min-size-px: 12
radius-px: { sm: 8, md: 12, lg: 16, pill: 999 }
spacing-px: [4, 8, 12, 16, 20, 24, 32, 40, 56]
breakpoints-px: { mobile: 390, tablet: 768, desktop: 1280, wide: 1440 }
---

# RADIX — Design system

RADIX is an AI operating system for running a business: a **dark technological cockpit** where projects, agents and areas (Marketing, Sales, Studio, PM…) orbit around one core. This file is the single visual source of truth for every page and every AI or person writing UI code in this repo. When code and this file disagree, this file wins; change it deliberately, never page by page.

Approved references: `docs/RADIX_APPROVED_VISUAL_DIRECTION.md` (Command Center master, 9 Oct 2026) and `docs/RADIX_PRODUCT_ARCHITECTURE_UX_BLUEPRINT.md`. Review and mockup mapping: project file `radix/REVIEW_UX_UI_E_MOCKUP_2026-10-15.md`.

## 1. Principles

1. **One product, one shell.** Every page uses the same sidebar, top bar, Copilot rail and components. A module changes its accent color, never its layout language.
2. **Truth over decoration.** Never show invented numbers, agents, approvals or live activity. If data is missing, show a clear empty state. Glow and energy effects are decoration, never proof that something is running.
3. **Plain language.** UI copy speaks to the user, not the developer. Banned in visible copy: "snapshot", "offset", "pagine lette", "contract", "non modellata", stack traces, env var names. Data reliability goes in the data-state badge (§5), not in paragraphs.
4. **Operate first.** These are work tools: scanability, density and keyboard use beat spectacle. Spectacle (network, orbit, globe) lives only in the hero zone of a home page.
5. **Human in the loop.** Any action that leaves RADIX (send, publish, pay, sync) shows a confirmation step and is recorded.

## 2. Color

- Base is near-black teal (`bg`, `surface`). Panels are separated by 1px `border`, not by heavy shadows.
- `core` emerald is RADIX itself: the core node, primary buttons, focus ring, active nav item. Do not flood pages with it.
- Each area has one accent (`area-*`) used for its nodes, icons, active tab underline and chart series. Accent text on dark must keep ≥ 4.5:1 contrast.
- Status colors override area colors. Red/coral means risk or urgent action only, never decoration.
- Color is never the only signal: status always carries a text label or icon.
- **PROVISIONAL (D2):** Sales uses the teal-green accent `area-sales`, matching the PROD_2/PROD_3 mockups; the blue variant is not used.

## 3. Typography

- Display (page titles, KPI numbers, hero): Space Grotesk. Body and UI: Inter.
- Minimum visible text 12px; table body 13–14px; page title 28–36px; KPI value 28px.
- Sentence case for titles and buttons. Uppercase with letter-spacing only for small section labels (12px, max 3 words).
- Numbers use tabular figures (`font-variant-numeric: tabular-nums`); currency formatted `€ 1.234,56` (it-IT).

## 4. Layout and shell

```
┌ Sidebar 248px ┬ Top bar: ⌘K search · data-state badge · notifications · user ─────┐
│ RADIX logo    │ Page header: eyebrow · title · subtitle · primary action          │
│ Command Center│ ┌ Main content (12-col grid, 24px gap) ───────┐ ┌ Copilot 320px ┐ │
│ Areas…        │ │ KPI row → hero/primary panel → panels        │ │ (collapsible) │ │
│ Projects…     │ └──────────────────────────────────────────────┘ └───────────────┘ │
└───────────────┴───────────────────────────────────────────────────────────────────┘
```

- **Sidebar (PROVISIONAL, D4: one global sidebar):** Command Center · Projects · area groups (Marketing Agency, Sales Intelligence, Studio, upcoming areas) each expandable to its pages · Approvals · Knowledge · Integrations · Settings. Full viewport height, sticky. Collapses to 72px icons at < 1280px and to a drawer at < 768px.
- **Copilot rail:** right column at ≥ 1280px, a slide-over panel below that. Never pushed under the page content.
- Page width: fluid, max 1680px content. Mobile 390px must work with no horizontal scroll; tables become cards, kanban becomes a horizontal snap list inside its own scroller, network/orbit views fall back to a list.
- Long workflows (Lead Intelligence, new project) are steppers showing one step at a time, not one long page.

## 5. Components

- **Panel:** `surface` background, 1px `border`, radius `lg`, 20–24px padding, header row = title (16px/600) + optional action link "Vedi tutti →".
- **KPI card:** label (12px muted), value (28px display), delta or note (12px), optional sparkline (SVG, area accent). If unknown, value is "—" plus a reason in the tooltip, not in the card.
- **Data-state badge** (top bar, one per page): `Live` (core), `Demo` (warning), `Non collegato` (subtle), `Parziale` (info). Tooltip explains the source in plain words. It replaces the yellow "demo / non live" banners.
- **Buttons:** primary = `core` fill with dark text; secondary = transparent with `border-strong`; destructive = `status-error` outline. Height 40px (32px compact). One primary per view.
- **Inputs:** 40px, `surface-2`, focus ring 2px `core`.
- **Tables:** sticky header, 48px rows, row hover `surface-2`, actions in an overflow menu (not repeated buttons on every row).
- **Chips/status pills:** 24px, pill radius, dot + label.
- **Empty state:** icon, one sentence on what will appear, one action to make it appear.
- **Icons:** one SVG line icon set (1.5px stroke, 20px). No unicode symbols (◇ ▦ ♧) as icons.
- **Charts:** inline SVG, no new chart dependency; area accent for the main series, muted for comparison; axis labels 12px.

## 6. Signature visuals

- **Network view** (Command Center): RADIX core in the center, projects as orbiting nodes in their accent, only real agents as satellites. Has a list mode and keyboard navigation.
- **Orbit / globe** (Sales Orbit): hero only, built with SVG/Canvas or Three.js; companies as labelled nodes with real values. Decorative particles respect `prefers-reduced-motion`.
- **Calendar / PED:** week view with time grid, events as colored cards (type color + status chip), "now" line.
- Motion: 150–250ms ease-out for UI; ambient loops ≤ 1 per page and paused with reduced motion.

## 7. Brand

- **PROVISIONAL (D1):** logo is the "RADIX" wordmark set in Space Grotesk with wide tracking, plus the area name below in small caps (e.g. "SALES INTELLIGENCE"). It will be replaced by the final SVG.
- **PROVISIONAL (D3):** in Marketing Agency, "PED" means *Piano Editoriale* (as in current code) until Francesco confirms otherwise.
- **PROVISIONAL (D5):** the v3.7 agent workspace (`index.html`) moves to this dark theme after the shell exists.

## 8. Quality bar (check before every UI PR)

- Screenshots at 1440px and 390px; no horizontal scroll; no text < 12px.
- Keyboard: every action reachable, visible focus ring.
- Contrast AA for text; status not by color alone.
- No invented data; empty, loading and error states present.
- Same shell and tokens as this file; no page-local color hex outside tokens.
