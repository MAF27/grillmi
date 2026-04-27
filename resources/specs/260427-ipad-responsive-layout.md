# iPad Responsive Layout

## Meta

- Status: Draft
- Branch: feature/ipad-responsive-layout
- Infra: none
- Runbook: none

---

## Business

### Goal

Make Grillmi feel native on iPad — both in portrait (768px) and landscape (1024px) — by using the extra horizontal space sensibly instead of rendering a stretched phone layout.

### Proposal

Add responsive breakpoints to five routes so that on tablet-sized viewports the app adapts its layout: the Session timer grid gains a third column, the Plan route shows a persistent left panel alongside the item list, and Menus, Home, and Settings centre properly at wider widths.

### Behaviors

- **Session (768px portrait):** timer grid padding widens; layout unchanged otherwise.
- **Session (1024px landscape):** timer grid switches from two to three columns with a wider gap.
- **Plan (1024px landscape):** the eat-time card and Start button move into a sticky left panel (~280px). The item list, add buttons, and save-menu action occupy the scrollable right column. The mobile bottom Start bar disappears.
- **Plan (768px portrait):** single-column layout unchanged; improved eat card and item list spacing inherits from the existing `.scroll` padding.
- **Menus (768px+):** saved-menu cards render in a two-column grid instead of a single list.
- **Home (1024px+):** content column widens from 600px to 720px.
- **Settings:** no change — 600px centred column is correct for a settings list.
- **Sheets (AddItemSheet, TimePickerSheet):** already constrained to 600px centred — no CSS change required.
- **Plan menu-sheet:** gains `margin: 0 auto` to match the existing `max-width: 600px`, making it centred at iPad widths (currently it is left-anchored).

### Out of scope

- Desktop breakpoints (>1280px)
- Persistent sidebar or tab-bar navigation (separate feature)
- Session header or MasterClock restructure
- Native iPadOS split-screen or Slide Over testing
- Any new grilling features

---

## Technical

### Approach

All changes are CSS-only except for the Plan route, which requires a small HTML restructure. Every route uses component-scoped `<style>` blocks — `@media` queries go there, not in `app.css`, since Svelte scopes CSS to the component. CSS custom properties cannot be used as `@media` conditions, so breakpoint values are written as literal px values (`768px`, `1024px`), consistent with the reference values in `app.css`.

**Session** is the simplest change: add two `@media` blocks to the `<style>` in `session/+page.svelte`.

**Plan** requires extracting the eat-time card from inside `.scroll` into a new `<aside class="plan-aside">` sibling. A `<div class="plan-body">` wrapper groups `.plan-aside` and `.scroll`. At 1024px, `.plan-body` becomes a CSS Grid (280px + 1fr), `<main>` drops its `max-width: 600px` cap, `.plan-aside` becomes sticky, and `.bottom` (the mobile Start bar) is hidden. A second Start button (`class="start-desktop"`) lives inside `.plan-aside`, hidden at mobile and shown at 1024px.

**Menus** and **Home** require only a single `@media` block each.

**menu-sheet** centering fix is a one-line CSS addition to the existing `.menu-sheet` rule in `plan/+page.svelte`.

### Approach Validation

- Surveyed MDN responsive PWA guidance: component-scoped `@media` with literal breakpoint values is idiomatic; CSS custom properties are invalid in `@media` conditions.
- Verified existing sheet components: `AddItemSheet` and `TimePickerSheet` already have `max-width: 600px; margin: 0 auto` — no changes required there. `menu-sheet` in Plan has `max-width: 600px` but is missing `margin: 0 auto`, causing it to left-anchor on wide viewports.
- All other routes (`menus`, `settings`, `plan`, home) already have `max-width: 600px; margin: 0 auto` on their main containers — Plan's must be removed at 1024px to allow the two-column layout.
- For the Plan sticky panel, CSS `position: sticky; align-self: start` is the correct pattern — it keeps the eat card and Start button in view while the item list scrolls, without requiring JavaScript or a fixed-position panel.

Sources: [MDN PWA best practices](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Best_practices), [Handling sticky elements in responsive layouts](https://medium.com/@Adekola_Olawale/handling-fixed-and-sticky-elements-in-responsive-layouts-7a79a70a014b)

### Risks

| Risk | Mitigation |
| ---- | ---------- |
| Plan HTML restructure breaks mobile layout | `.plan-aside` renders inline at mobile (eat card was already in `.scroll`); test at 375px after the change |
| Duplicate Start button causes stale reactive state | Both buttons bind to the same `onclick={start}` handler; only CSS hides one at each breakpoint — no separate state |
| `.plan-aside` sticky fails when item list is shorter than viewport | Set `align-self: start` on `.plan-aside` within the grid so it does not stretch |
| `menu-sheet` centering regression at mobile | `left: 0; right: 0; max-width: 600px; margin: 0 auto` is proven to centre fixed sheets on mobile too — verify at 390px |

### Implementation Plan

**Phase 1: Session**

- [ ] `src/routes/session/+page.svelte`: Add `@media (min-width: 768px)` block — set `.grid-wrap` padding to `0 24px 120px`
- [ ] `src/routes/session/+page.svelte`: Add `@media (min-width: 1024px)` block — set `.grid` to `grid-template-columns: 1fr 1fr 1fr` and `gap: 16px`

**Phase 2: Plan route restructure**

- [ ] `src/routes/plan/+page.svelte`: Add `<div class="plan-body">` wrapper directly inside `<main>` after `<header>`, enclosing both the new `<aside class="plan-aside">` and the existing `<div class="scroll">`
- [ ] Move the `<button class="eatcard">` block (and its `{#if !isManual}` guard) out of `.scroll` and into `.plan-aside`; remove it from `.scroll`
- [ ] Inside `.plan-aside`, after the eat card, add a second `<Button variant="primary" size="lg" fullWidth disabled={plan.items.length === 0} onclick={start} class="start-desktop">{goLabel}</Button>` (this is the desktop-only Start button)
- [ ] Style `.plan-aside` at mobile: `display: flex; flex-direction: column; gap: 16px; padding: 0 24px` and `& .start-desktop { display: none }`
- [ ] Style `.plan-body` at mobile: `display: flex; flex-direction: column; flex: 1`
- [ ] Add `@media (min-width: 1024px)` block for Plan: set `main { max-width: none; padding-bottom: 0 }`, `.plan-body { display: grid; grid-template-columns: 280px 1fr; flex: 1 }`, `.plan-aside { position: sticky; top: 0; align-self: start; padding: 24px; gap: 24px }`, `.plan-aside .start-desktop { display: flex }`, `.scroll { padding-top: 24px }`, `.bottom { display: none }`

**Phase 3: Plan menu-sheet centering fix**

- [ ] `src/routes/plan/+page.svelte`: Add `margin: 0 auto` to the existing `.menu-sheet` CSS rule

**Phase 4: Menus route**

- [ ] `src/routes/menus/+page.svelte`: Add `@media (min-width: 768px)` block — set `.list { display: grid; grid-template-columns: 1fr 1fr; gap: 12px }`

**Phase 5: Home route**

- [ ] `src/routes/+page.svelte`: Add `@media (min-width: 1024px)` block — set `.content { max-width: 720px }`

**Phase 6: Verification**

- [ ] Run `pnpm build && pnpm preview` to start the preview server
- [ ] Use agent-browser to capture screenshots at `viewport: 768×1024` (iPad portrait) for routes: `/`, `/plan`, `/menus`, `/settings`
- [ ] Use agent-browser to capture screenshots at `viewport: 1024×768` (iPad landscape) for all five routes: `/`, `/plan`, `/menus`, `/settings`, `/session` (seed session data before capturing session)
- [ ] Verify each screenshot shows the expected layout — no horizontal overflow, no stretched empty whitespace, Plan two-column visible at 1024px landscape

---

## Testing

CSS layout changes have no unit or integration test surface. Verification is by screenshot capture (Phase 6 above). No Playwright spec is added for this pass.

### Manual Verification (Marco)

- [ ] Open the app on a real iPad (any model) and confirm the Session timer grid shows three columns in landscape and two in portrait
- [ ] On the Plan route in landscape, confirm the eat-time card and Start button stay visible in the left panel as you scroll the item list
- [ ] Confirm the Add Item sheet centres itself on iPad and does not stick to one side
