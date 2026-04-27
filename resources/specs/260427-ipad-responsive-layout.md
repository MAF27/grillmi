# iPad Responsive Layout

## Meta

- Status: Reviewed
- Branch: feature/ipad-responsive-layout
- Infra: none
- Runbook: none

---

## Business

### Goal

Make Grillmi use iPad portrait (768px wide) and landscape (1024px wide) space without stretching the current 390px phone layout across the full viewport.

### Proposal

Add responsive breakpoints to five routes so that on tablet-sized viewports the app adapts its layout: the Session timer grid gains a third column, the Plan route shows a persistent left panel alongside the item list, Menus uses a two-column grid, Home widens its content column, and Settings remains capped at 600px.

### Behaviors

- **Session (768px portrait):** timer grid padding widens; layout unchanged otherwise.
- **Session (1024px landscape):** timer grid switches from two to three columns with a wider gap.
- **Plan (1024px landscape):** the eat-time card and Start button move into a sticky left panel (`280px`). The mode segmented control, item list, add buttons, and save-menu action occupy the scrollable right column. The mobile bottom Start bar disappears.
- **Plan (768px portrait):** single-column ordering remains: header, mode segmented control, eat-time card, item list, save-menu action, then the fixed bottom Start bar.
- **Menus (768px+):** saved-menu cards render in a two-column grid instead of a single list.
- **Home (1024px+):** content column widens from 600px to 720px.
- **Settings:** no layout change — keep the existing 600px centred column.
- **Sheets (AddItemSheet, TimePickerSheet):** already constrained to 600px centred — no CSS change required.
- **Plan menu-sheet:** no CSS change required; current code already sets `left: 0; right: 0; max-width: 600px; margin: 0 auto`.

### Out of scope

- Desktop breakpoints (>1280px)
- Persistent sidebar or tab-bar navigation (separate feature)
- Session header or MasterClock restructure
- Native iPadOS split-screen or Slide Over testing
- Any new grilling features

---

## Technical

### Approach

All changes are CSS-only except for the Plan route, which requires moving the eat-time card into a new sibling `<aside>`. Every route uses component-scoped `<style>` blocks — `@media` queries go there, not in `app.css`, since Svelte scopes CSS to the component. CSS custom properties cannot be used as `@media` conditions, so breakpoint values are written as literal px values (`768px`, `1024px`), consistent with the reference values in `app.css`.

**Session** adds two `@media` blocks to the `<style>` in `session/+page.svelte`.

**Plan** requires extracting the eat-time card from inside `.scroll` into a new `<aside class="plan-aside">` sibling. A `<div class="plan-body">` wrapper groups `.scroll` first and `.plan-aside` second in DOM order so the mode segmented control remains above the eat-time card on mobile. At 1024px, `.plan-body` becomes a CSS Grid (`280px minmax(0, 1fr)`), `.plan-aside` moves to the first visual column via `grid-column: 1`, `.scroll` moves to the second visual column via `grid-column: 2`, `<main>` drops its `max-width: 600px` cap, `.plan-aside` becomes sticky, and `.bottom` (the mobile Start bar) is hidden. A second Start button (`class="start-desktop"`) lives inside `.plan-aside`, hidden at mobile and shown at 1024px.

**Menus** and **Home** require only a single `@media` block each.

### Approach Validation

- Round 0 skipped external web research because this is a low-risk responsive CSS/layout change with no new product pattern, architecture, backend, data, secrets, deploy, or host changes.
- Verified `src/routes/session/+page.svelte`, `src/routes/plan/+page.svelte`, `src/routes/menus/+page.svelte`, `src/routes/+page.svelte`, and `src/routes/settings/+page.svelte` exist and use component-scoped `<style>` blocks, so route-local media queries match the codebase.
- Verified `AddItemSheet` and `TimePickerSheet` already have `max-width: 600px; margin: 0 auto`; no sheet work is required for those components. Verified Plan's `menu-sheet` already has `left: 0; right: 0; max-width: 600px; margin: 0 auto`; the earlier menu-sheet task was removed as already implemented.
- All other routes (`menus`, `settings`, `plan`, home) already have `max-width: 600px; margin: 0 auto` on their main containers. Plan's cap must be removed at 1024px to allow the two-column layout.
- For the Plan sticky panel, CSS `position: sticky; align-self: start` keeps the eat card and Start button in view while the item list scrolls, without requiring JavaScript or a fixed-position panel.
- Infra and runbook remain `none`: the work changes only Svelte markup, scoped CSS, and browser-side responsive tests.

Reference: [MDN PWA best practices](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Best_practices)

### Risks

| Risk | Mitigation |
| ---- | ---------- |
| Plan HTML restructure changes mobile order | Keep `.scroll` before `.plan-aside` in DOM order and use CSS Grid placement at 1024px; test 390px and 768px widths after the change |
| Duplicate Start button causes stale reactive state | Both buttons bind to the same `onclick={start}` handler; only CSS hides one at each breakpoint — no separate state |
| `.plan-aside` sticky fails when item list is shorter than viewport | Set `align-self: start` on `.plan-aside` within the grid so it does not stretch |
| Landscape Plan right column overflows because rows keep their intrinsic width | Use `minmax(0, 1fr)` for the right grid track and set `.scroll { min-width: 0 }`; verify no horizontal scroll at 1024px |

### Implementation Plan

**Phase 1: Session**

- [ ] `src/routes/session/+page.svelte`: Add `@media (min-width: 768px)` block — set `.grid-wrap` padding to `0 24px 120px`
- [ ] `src/routes/session/+page.svelte`: Add `@media (min-width: 1024px)` block — set `.grid` to `grid-template-columns: 1fr 1fr 1fr` and `gap: 16px`

**Phase 2: Plan route restructure**

- [ ] `src/routes/plan/+page.svelte`: Add `<div class="plan-body">` wrapper directly inside `<main>` after `<header>`, enclosing the existing `<div class="scroll">` first and the new `<aside class="plan-aside">` second
- [ ] Move the `<button class="eatcard">` block (and its `{#if !isManual}` guard) out of `.scroll` and into `.plan-aside`; remove it from `.scroll`
- [ ] Inside `.plan-aside`, after the eat card, add a second `<Button variant="primary" size="lg" fullWidth disabled={plan.items.length === 0} onclick={start} class="start-desktop">{goLabel}</Button>` (this is the desktop-only Start button)
- [ ] Style `.plan-aside` at mobile: `display: flex; flex-direction: column; gap: 16px; padding: 0 24px 16px` and `.plan-aside .start-desktop { display: none }`
- [ ] Style `.plan-body` at mobile: `display: flex; flex-direction: column; flex: 1`
- [ ] Add `@media (min-width: 1024px)` block for Plan: set `main { max-width: none; padding-bottom: 0 }`, `.plan-body { display: grid; grid-template-columns: 280px minmax(0, 1fr); flex: 1; align-items: start }`, `.plan-aside { grid-column: 1; grid-row: 1; position: sticky; top: 0; align-self: start; padding: 24px; gap: 24px }`, `.plan-aside .start-desktop { display: flex }`, `.scroll { grid-column: 2; grid-row: 1; min-width: 0; padding-top: 24px }`, `.bottom { display: none }`

**Phase 3: Menus route**

- [ ] `src/routes/menus/+page.svelte`: Add `@media (min-width: 768px)` block — set `.list { display: grid; grid-template-columns: 1fr 1fr; gap: 12px }`

**Phase 4: Home route**

- [ ] `src/routes/+page.svelte`: Add `@media (min-width: 1024px)` block — set `.content { max-width: 720px }`

**Phase 5: Automated responsive coverage**

- [ ] Add `tests/e2e/ipad-responsive.spec.ts` using Playwright.
- [ ] In that spec, use `page.setViewportSize({ width: 768, height: 1024 })` and assert `/menus` renders two visible menu cards in one row by comparing the first two card bounding boxes (`abs(y1 - y2) <= 2`).
- [ ] In that spec, use `page.setViewportSize({ width: 1024, height: 768 })`, seed a session with at least three items in IndexedDB, open `/session`, and assert three timer cards are visible in one row by comparing the first three card bounding boxes (`abs(y1 - y2) <= 2`).
- [ ] In that spec, use `page.setViewportSize({ width: 1024, height: 768 })`, open `/plan` with one planned item, and assert `.plan-aside` and `.scroll` are side by side (`asideBox.x < scrollBox.x`) with no horizontal overflow (`document.documentElement.scrollWidth <= window.innerWidth`).
- [ ] In that spec, use `page.setViewportSize({ width: 390, height: 844 })`, open `/plan` with one planned item, and assert the mode segmented control appears above `.eatcard` and `.bottom` is visible.

**Phase 6: Verification**

- [ ] Run `pnpm check && pnpm test:e2e -- tests/e2e/ipad-responsive.spec.ts`
- [ ] Run `pnpm build && pnpm preview` to start the preview server.
- [ ] Use Playwright screenshot capture at `viewport: 768x1024` for routes: `/`, `/plan`, `/menus`, `/settings`.
- [ ] Use Playwright screenshot capture at `viewport: 1024x768` for all five routes: `/`, `/plan`, `/menus`, `/settings`, `/session`; seed session data before capturing `/session`.
- [ ] Verify each screenshot shows no horizontal overflow, no phone-width content stretched across the full viewport, and Plan's two-column layout visible at 1024px landscape.

---

## Testing

CSS layout changes have no unit test surface. Add Playwright responsive assertions in `tests/e2e/ipad-responsive.spec.ts` for the route-level layout changes, then use screenshots as visual review evidence.

### E2E Tests (`tests/e2e/ipad-responsive.spec.ts`)

- [ ] `test_ipad_portrait_menus_use_two_columns`: seed two saved menus, set viewport to `768x1024`, open `/menus`, and assert the first two menu cards share the same row.
- [ ] `test_ipad_landscape_session_uses_three_columns`: seed a session with three items, set viewport to `1024x768`, open `/session`, and assert the first three timer cards share the same row.
- [ ] `test_ipad_landscape_plan_uses_left_panel`: seed one planned item, set viewport to `1024x768`, open `/plan`, and assert `.plan-aside` is left of `.scroll`, `.bottom` is hidden, `.start-desktop` is visible, and `scrollWidth <= innerWidth`.
- [ ] `test_mobile_plan_order_is_unchanged`: seed one planned item, set viewport to `390x844`, open `/plan`, and assert the mode segmented control appears above `.eatcard` and the fixed bottom Start bar remains visible.

### Manual Verification (Marco)

- [ ] Open the app on a real iPad (any model) and confirm the Session timer grid shows three columns in landscape and two in portrait
- [ ] On the Plan route in landscape, confirm the eat-time card and Start button stay visible in the left panel as you scroll the item list
- [ ] Confirm the Add Item sheet centres itself on iPad and does not stick to one side
