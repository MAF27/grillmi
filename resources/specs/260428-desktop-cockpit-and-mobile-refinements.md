# Grillmi: Desktop Cockpit and Mobile Refinements

## Meta

- Status: Draft
- Branch: feature/desktop-cockpit
- Infra: none
- Runbook: none

This spec replaces and supersedes `260427-ipad-responsive-layout.md`, which was reviewed but never implemented. The roadmap step "Desktop redesign + iPad reuse" in `resources/docs/roadmap-apr-2026.md` folds that work into this one. The visual source of truth is the Claude Design handoff at `Grillmi-Desktop-Mobile2.zip`, extracted at `.tmp/grillmi-design/` during implementation.

---

## Business

### Goal

Add a first-class desktop cockpit direction to Grillmi, refresh a small set of mobile details from the same handoff, and visually align the four auth surfaces with the rest of the app. After this spec ships, Marco gets a real Mac experience for planning and watching a Grillade (sidebar nav, three-pane Grillen view, history of past Grilladen), the iPad picks up the same cockpit in landscape, the phone keeps the shipped Glühen direction with a small set of polish items, and `/login`, `/set-password`, `/forgot-password`, and `/account` adopt the dark ember language they currently lack.

### Proposal

Introduce a viewport-driven layout shell at `src/routes/+layout.svelte` that switches between the existing mobile direction (below 1024 px) and a new desktop cockpit (1024 px and above). The cockpit renders a 240 px sidebar (`Sidebar.svelte`) with five top-level sections (Übersicht, Planen, Grillen, Grilladen, Einstellungen) plus an account chip, and routes each existing route into a desktop-shaped pane: Übersicht is a new dashboard view of `/`, Planen is a three-pane variant of `/plan`, Grillen is a three-pane variant of `/session`, Grilladen is a new list-and-detail view backed by the existing `GET /api/grilladen` endpoint filtered to `status === 'finished'`, and Einstellungen is a left-rail-grouped variant of `/settings`. Two new design tokens (`--color-bg-panel`, `--color-border-hot`) join `src/app.css`, four new shared atoms (`Sidebar`, `AccountChip`, `SectionHeader`, `Toast`) join `src/lib/components/`, and a `SyncChip.svelte` reads queue depth and last-pull timestamp from the existing IDB stores. The four auth pages get a visual pass against the same tokens and shared atoms with no behavioural changes. Mobile gets three small refinements from the same package: alarm queue `+N` badge, manual-mode polish, and a sync chip in the top header.

### Behaviors

#### Responsive cutover

1. Below 1024 px viewport width the app renders exactly as it does today: per-route content, no chrome, mobile single-column layouts. Existing mobile breakpoints inside individual components stay untouched.
2. At and above 1024 px viewport width the layout shell mounts the desktop cockpit: a 240 px sidebar on the left and the active section's pane on the right. Each existing route maps to one of the five sidebar sections; navigating via in-app links swaps the pane and updates the highlighted sidebar item.
3. The breakpoint is observed via a `matchMedia('(min-width: 1024px)')` listener in the layout shell so an iPad rotated from portrait to landscape switches direction without a page reload.

#### Sidebar (desktop cockpit chrome)

1. The sidebar carries the wordmark "GRILLMI" with a small ember flame glyph at the top, then five nav items in order: Übersicht, Planen, Grillen, Grilladen, Einstellungen. Each item shows a 18 px monoline icon and a label.
2. The currently active item carries an ember tint background, ember-coloured icon and label, and a 3 px ember left bar. Inactive items show body text colour with muted icon.
3. The Grillen item carries a small "LIVE" pill in `emberInk` on `ember` whenever there is an active Grillade (status `running`); the pill is hidden otherwise.
4. The bottom of the sidebar mounts the account chip. Signed-in: 32 px gradient circle with the user's initials, name and email next to it. Signed-out: outlined "Anmelden" button with a placeholder circle. Tapping signed-in goes to Einstellungen with the Konto group preselected; tapping signed-out goes to `/login`.
5. Between the nav and the account chip, a `SyncChip` renders the current sync state.

#### Übersicht (desktop only, route `/`)

1. The pane shows a section header reading "Übersicht" with the kicker "GRILLMI". Below it, three stat cards in a row: today's planned Grillade count, total saved Grilladen, longest finished session duration. Empty values render as a dim "-" rather than zero.
2. A primary "Neue Session" CTA spans the full width below the stats. Tapping it navigates to Planen with a fresh empty plan.
3. A horizontal-scroll strip below the CTA lists the user's most-recent saved Menüs as compact pill cards. Tapping a pill loads the Menü into Plan and navigates to Planen, the same way the mobile home does today.
4. When the user has zero saved Menüs the strip and its eyebrow do not render at all.
5. The mobile home (`/` below 1024 px) renders the existing Glühen home unchanged.

#### Planen (desktop only at 1024 px+, route `/plan`)

1. The pane is a three-pane split: left is the persistent plan list (320 px wide), centre is the compose surface (flex), right is empty whitespace reserved for future use.
2. The compose surface holds the unified three-way segmented control ("Jetzt", "Auf Zeit", "Manuell") at the top, the eating-time card below it (in Jetzt and Auf Zeit modes only), then the items list, then the dashed add-item button, then the "Als Menü speichern" dashed button.
3. Manual mode swaps the items list for a two-column grid of timer cards reusing the existing `TimerCard.svelte`. Behaviour is identical to mobile manual mode: a "Los" button per card while unstarted, transitions through cooking, resting, ready, and finally exposes "Anrichten".
4. The eating-time card uses the new `TimePickerPopover` (a click-to-open numerals dropdown) on desktop instead of the bottom sheet `TimePickerSheet.svelte` used on mobile. The mobile sheet stays unchanged below 1024 px.
5. The sticky bottom CTA from mobile does not render on desktop. Instead a "Los, fertig um HH:MM" primary button mounts at the bottom of the centre pane below the items list. The button is disabled when the items list is empty and reads "Mindestens ein Eintrag nötig".
6. The persistent plan list on the left is a read-only summary of the items currently in compose: name plus cook time, no editing affordances. It exists so the cook can see the full plan while the centre pane is scrolled or specs sheet is open.
7. Mobile Plan (below 1024 px) renders the existing Glühen Plan layout unchanged.
8. The `AddItemSheet.svelte` mounts inline at the centre pane's right edge as a 480 px-wide right-side drawer on desktop; on mobile it stays the existing bottom sheet.

#### Grillen (desktop only at 1024 px+, route `/session`)

1. The pane is a three-pane split: left is the plan list with status dots (280 px), centre is the live cockpit (flex), right is the alarm panel and activity log (320 px).
2. The centre pane top shows the master countdown: an 88 px display-font numeral for the eating time and a 56 px display-font numeral for the live countdown to it. Below the numerals, a 3-column grid of `BigTimerCard` (a 132 px stroke-7 progress ring variant of `TimerCard`) renders one card per item. Card colour tracks status: pending slate, cooking ember, resting amber, ready green, plated muted.
3. The right pane top mounts the `AlarmBanner.svelte` with the same gradient and pulse animation as mobile, sticky to the top of the right pane, only rendered when at least one alarm is active. When more than one alarm queues, the banner shows a `+N` badge for the additional ones.
4. Below the alarm banner the right pane holds an activity log: a chronological list of timeline events ("Auflegen", "Wenden", "Ruhen", "Fertig", "Anrichten") with the item name and a relative timestamp. Newest event on top. Each event row carries a coloured dot matching the event kind.
5. The left pane plan list mirrors Planen's left pane shape but adds a status dot per row showing the item's current state in the timeline.
6. The wake-lock chip and end-session button from `SessionHeader.svelte` move to the top-right of the centre pane, above the master countdown.
7. Mobile Grillen (below 1024 px) renders the existing Glühen Session layout unchanged. The alarm banner stays sticky bottom on mobile and sticky top of the right pane on desktop.
8. Hitting "Plate it" on a `BigTimerCard` triggers the same flow as mobile (transition to plated), updating the activity log on both viewports.

#### Grilladen (new route, desktop only at 1024 px+, route `/grilladen`)

1. The Grilladen list view shows past finished Grilladen as a masonry-like grid of `GrilladeCard` tiles. Saved Grilladen (`saved: true` flag in the row) render first; unsaved finished Grilladen follow in reverse `ended_at` order. Each card shows the title (or "Grillade vom <date>" if untitled), the relative date, the item count, and the duration.
2. Tapping a card opens the detail view in the same pane: a header with title, date, duration, guest count, and item count; a two-column body with items table on the left and an actions column on the right (load as plan, save/unsave, delete).
3. The actions column carries a 500 ms hold-to-confirm delete button using the existing `HoldButton.svelte`. Successful delete returns the user to the list and shows a toast reading "Grillade gelöscht".
4. "Als Plan laden" turns the past Grillade into a fresh plan and navigates to Planen. A toast reads `„<title>" als Plan geladen`.
5. The Grilladen route reads from the existing `grilladen` IDB store and filters client-side to rows where `status === 'finished'` and `deleted_at IS NULL`. Sort is `ended_at desc`. The existing pull mechanism keeps the list current.
6. Below 1024 px the route still mounts (so deep links work) but renders a single-column mobile variant: stacked cards, full-width detail view, no two-column actions. This means the route is reachable from both viewports.
7. The route is added to the auth-required path set in `src/routes/+layout.ts` (it is not a public route).
8. When there are zero finished Grilladen, the empty state shows the section header plus a single dashed card reading "Noch keine Grilladen abgeschlossen" with a secondary CTA "Neue Session planen" linking to Planen.

#### Einstellungen (desktop only at 1024 px+, route `/settings`)

1. The pane is a two-pane split: left rail (220 px) holds five group labels (Darstellung, Signale, Geräte, Konto, Über), right body holds the active group's content.
2. The Darstellung group hosts the existing theme three-way segmented control (System, Hell, Dunkel).
3. The Signale group hosts the existing tone-per-event picker (Auflegen, Wenden, Fertig) plus the vibrate toggle.
4. The Geräte group hosts the active session list from `GET /api/auth/sessions` with per-row revoke. This was previously inside `/account`; on desktop it lives here. The mobile `/account` page keeps the inline list.
5. The Konto group hosts email read-only, "Passwort ändern" button, and the hold-to-delete account button. This was previously inside `/account`; on desktop it lives here.
6. The Über group shows the version label and the "App installieren" hint that today lives elsewhere.
7. Mobile Einstellungen (below 1024 px) renders the existing settings page unchanged. The `/account` route stays as a separate page on mobile and renders its full content there.

#### Sync status chip

1. Renders a single chip with one of three states: "Synchronisiert" (green dot, 0 pending writes, last pull within 5 minutes), "<N> ausstehend" (ember dot, pending writes in the queue or last pull older than 5 minutes), "Offline" (slate dot, `navigator.onLine === false`).
2. The chip reads `sync_queue` length and `LAST_PULL_KEY` from `src/lib/stores/db.ts` reactively. State recomputes on every IDB write the queue performs and on `online`/`offline` window events.
3. On desktop the chip mounts inside the sidebar between nav and the account chip. On mobile the chip mounts in the existing `+layout.svelte` header slot at the top-right of every authenticated route.
4. The chip is read-only in this spec (no popover, no inspector). Click does nothing; the chip exists for at-a-glance reassurance.

#### Auth surface re-skin

1. `/login`, `/set-password`, `/forgot-password` re-skin against the design tokens and shared atoms: the existing card layout stays, the typography moves to display-font titles ("Anmelden", "Passwort setzen", "Passwort zurücksetzen"), inputs adopt the new ember focus border, error banners adopt the new red token.
2. `/account` rebuilds against the shared atoms: section headers via `SectionHeader.svelte`, buttons via the existing `Button.svelte`, the device list rows match the design system's row pattern. No flow changes (revoke, password change, hold-to-delete still work as today). On desktop, this entire content moves into the Einstellungen pane's Konto and Geräte groups; the route still resolves and renders the full page (so mobile links continue to work) but the desktop sidebar Konto group is the canonical entry point.
3. The auth pages adopt the same `+layout.svelte` chrome behaviour: signed-in chrome (sidebar on desktop, header on mobile) does not render on `/login`, `/set-password`, or `/forgot-password`.
4. The `next` redirect parameter behaviour from `260428-accounts-and-sync.md` stays unchanged.

#### Mobile refinements (carry-over from the design package)

1. The alarm banner shows a `+N` badge when more than one alarm queues, mirroring the desktop right-pane behaviour.
2. Manual mode on Plan adopts the same `BigTimerCard` proportions as desktop where viewport allows (mobile keeps the smaller 92 px ring to fit two columns at 390 px width).
3. The mobile header gains the `SyncChip` at the top-right of every authenticated route.

### Out of scope

1. Light theme rework. The existing tonal-inversion light theme stays; this spec touches only dark-mode visual surfaces.
2. Sign in with Apple. Deferred per `roadmap-apr-2026.md`.
3. Push notifications and the `pending_notifications` table. Deferred per `roadmap-apr-2026.md`.
4. New product features beyond what the design package shows.
5. The `/diag` route does not get a desktop cockpit treatment and does not appear in the sidebar nav. It stays as a public dev URL.
6. Backend schema changes. The existing `grilladen` schema (status enum, ended_at, soft delete) supports Grilladen-history client-side filtering; no new endpoints, no new columns.
7. Backend additions of "saved" or "guests" or "note" or "mood" columns implied by the prototype's `HISTORY` sample data. Those fields are not persisted server-side. Grilladen list and detail render only fields that exist on the live `grilladen` and `grillade_items` rows: title (`name`), date (`ended_at`), duration (`ended_at - started_at`), item count, and item list. The "save/unsave star" and "guests" and "note" prototype affordances are out of scope; the actions column on the detail view ships with "Als Plan laden" and "Löschen" only.
8. The desktop "load past Grillade as plan" affordance does not preserve item-level specs that the prototype invents (the prototype constructs cook times from `durationSec / itemCount`). This spec implements load-as-plan by copying the item rows verbatim from the past Grillade's `grillade_items` into a fresh plan, no estimation maths.
9. Tablet portrait (768-1023 px) does not get a dedicated direction. It keeps the mobile direction with widened gutters from existing components. The cockpit is desktop and landscape-iPad only.
10. The persistent left plan list on Planen and Grillen does not gain editing affordances in this spec. It is a read-only summary; all editing happens in the centre pane.

---

## Technical

### Approach

The cutover happens entirely in the SvelteKit frontend. No backend changes, no schema changes, no Doppler additions, no Caddy or Ansible work. The branch builds on `main` after `feature/accounts-and-sync` lands; it picks up the `authStore`, sync queue, IDB v4 schema, and `grilladen` API surface as foundations.

The viewport split is driven by a single `matchMedia('(min-width: 1024px)')` observer in `src/routes/+layout.svelte`. The match result lives in a Svelte rune (`$state`) on a layout-level singleton that every route can read. Each route's `+page.svelte` tests the rune and renders one of two trees: the existing mobile tree, or a new desktop tree imported from `src/lib/components/desktop/`. Component-scoped CSS keeps the rest of the responsive sizing (gutters, max-widths) per-component as today; the only layout-shell `@media` query is the one that loads the sidebar.

New shared atoms live under `src/lib/components/` (alongside the existing components, not in a subfolder, to match the established pattern). New desktop-only screen components live under `src/lib/components/desktop/` to keep them grouped without polluting the mobile component namespace. The `Toast.svelte` atom replaces ad-hoc `setTimeout`-based banners and is the single source of confirmation feedback for both viewports.

The Grilladen client-side filter is implemented in a new `src/lib/stores/grilladenHistoryStore.svelte.ts` rune that subscribes to the existing `grilladen` IDB store and exposes a `finished` derived list ordered by `ended_at desc`. Adding a new row with `status = 'finished'` to IDB (which already happens at session end via the existing flow) reactively updates the derived list. No code path other than this new store touches Grilladen-history rendering.

The `SyncChip` reads from `src/lib/sync/queue.ts` (queue length) and `src/lib/sync/pull.ts` (last-pull timestamp). Both surfaces already exist; the chip subscribes to a small new derived store that polls the queue length every 1000 ms while the chip is mounted. Polling is acceptable here because the chip is only mounted on signed-in chrome and the cost is one IDB count call per second.

The four auth pages adopt the shared atoms by importing them; their existing form logic, store wiring, and CSRF flow stay byte-for-byte the same. Visual changes are CSS-only on `/login`, `/set-password`, `/forgot-password`. `/account` rebuilds the markup but keeps every API call, error path, and toast trigger identical to today.

The `260427-ipad-responsive-layout.md` spec is marked superseded in its Meta block as part of this work; no code in that spec was implemented, so there is no rollback to perform.

### Approach Validation

1. Round 0 web research checked SvelteKit responsive-layout patterns. The community pattern for viewport-conditional layouts is a single `matchMedia` observer in the root layout exposed via context or a store, with each route consuming the value. Reference: SvelteKit docs on `+layout.svelte` and `matchMedia`. Container queries were considered and rejected because the cockpit branch needs to hide or show entire navigation chrome, which is a layout-level concern not a per-component concern.
2. Verified the design package's implied desktop minimum width: 240 sidebar + 280 left + flex centre + 320 right = ~1200 px wanted at the high end, but the package renders sample screens at smaller widths with proportional shrink. 1024 px is the user-confirmed cutover; the centre flex absorbs the squeeze. The Grillen 3-column timer grid drops to 2 columns at the 1024 px end via a component-scoped breakpoint inside `BigTimerCard`'s wrapper; this keeps cards readable without reaching for a 1280 px floor.
3. Verified that `grilladen` table and `GET /api/grilladen` surface enough fields for a useful history list and detail view (`name`, `status`, `started_at`, `ended_at`, `target_finish_at`, `position`, `updated_at`, `deleted_at` plus item rows). Confirmed the existing `pull.ts` already brings finished Grilladen down on every foregrounding, so the history list stays fresh without new API calls.
4. Verified that `sync_queue` and `LAST_PULL_KEY` already exist in IDB (see `src/lib/sync/queue.ts` and `src/lib/sync/pull.ts`) so the `SyncChip` is purely a presentational addition.
5. Verified token coverage: `app.css` already carries `--color-bg-base` (#0b0a09), `--color-bg-surface` (#16140f), `--color-bg-surface-2` (#1f1b15), `--color-bg-elev` (#26211a), `--color-accent-default` (#ff7a1a), `--color-ember-dim` (#8a3f0a), `--color-ember-ink` (#1a0a02), and the four status colours. The two missing tokens, `bgPanel` (#100e0b) and `borderHot` (rgba(255,122,26,0.28)), are additive and do not affect any shipped surface.
6. Considered consolidating the `/account` page into the desktop Einstellungen pane only, with a redirect on mobile. Rejected: Marco shares activation links via Mail.app; the link target must always render its own page on mobile so the activation flow does not break across deep-linked entrypoints. The mobile `/account` route stays.

Reference reading: SvelteKit layout docs, the existing `260426-redesign-gluehen.md` and `260428-accounts-and-sync.md` specs in this repo.

### Risks

| Risk | Mitigation |
| ---- | ---------- |
| 3-pane Grillen feels cramped at 1024 px | `BigTimerCard` grid drops from 3 cols to 2 cols at <1280 px via component-scoped media query; right pane width caps at 320 px not flex |
| `matchMedia` observer flicker on initial paint | Read the match value once before mount and gate the cockpit/mobile branch in the layout's `<script>` so SSR-less first paint already picks the right tree |
| iPad rotation while session is running drops state | The layout switch is component-tree pivot only; route stores (`grilladeStore`) live above the pivot and survive the swap |
| Grilladen history filters client-side, fetching every Grillade ever | `pull.ts` already bounds responses by the `since` watermark; total per-user volume is small (one Grillade per cookout), no pagination needed for the foreseeable future |
| New atoms collide with existing component names | Atoms named `Sidebar`, `AccountChip`, `SectionHeader`, `Toast`, `SyncChip` are not currently used in `src/lib/components/`; verified before naming |
| Auth re-skin breaks the existing E2E auth specs in `tests/e2e/auth.spec.ts` | Specs assert on element labels and German strings; visual changes preserve text and aria-labels. Re-run the suite as part of Phase 11 |
| Sidebar mounts on auth pages before login completes | Layout shell checks `authStore.isAuthenticated` before rendering the sidebar; pre-auth pages render unchromed regardless of viewport |

### Implementation Plan

The phases are ordered foundation, then atoms, then responsive shell, then desktop screens in sidebar order, then mobile and auth surfaces, then visual reconciliation. Tests live in the Testing section, not inline in phases.

**Phase 1: Tokens and superseded-spec marker**

- [ ] Extract the design package once at the start of implementation: `rm -rf .tmp/grillmi-design && mkdir -p .tmp/grillmi-design && unzip -q Grillmi-Desktop-Mobile2.zip -d .tmp/grillmi-design`. The `.tmp` path is gitignored.
- [ ] Add two new tokens to `src/app.css`'s `@theme` block: `--color-bg-panel: #100e0b;` and `--color-border-hot: rgba(255,122,26,0.28);`. Place them adjacent to the existing surface and border tokens. Do not change any existing token value.
- [ ] Mark `resources/specs/260427-ipad-responsive-layout.md` as superseded by editing its Meta block: `Status: Superseded by 260428-desktop-cockpit-and-mobile-refinements.md`. Do not delete the file.

**Phase 2: Shared atoms (cockpit chrome and shared primitives)**

- [ ] Implement `src/lib/components/Sidebar.svelte` with props `{ items: Array<{ id, label, icon, badge? }>, current: string, onChange: (id) => void, accent? }`. Renders a vertical icon-plus-label list. Active item shows ember tint background, ember icon and label, 3 px ember left bar. Reads accent default from CSS var `--color-accent-default`.
- [ ] Implement `src/lib/components/AccountChip.svelte` with props `{ user: { name, email, initials } | null, onSignedInClick, onSignedOutClick, compact? }`. Signed-in: 32 px gradient circle + name/email. Signed-out: outlined "Anmelden" button.
- [ ] Implement `src/lib/components/SectionHeader.svelte` with props `{ kicker?, title, action? }`. Kicker is uppercase ember 10 px; title is display-font 22 px uppercase; action is a slot for an optional right-side button.
- [ ] Implement `src/lib/components/Toast.svelte` with props `{ msg, action?, onAction?, kind: 'info' | 'success' | 'warn', duration: number }` and a self-managed `setTimeout`. Position absolute bottom-centre, z-index above sticky. Animates in via `transform: translateY(8px) → 0` and `opacity: 0 → 1` over 180 ms.
- [ ] Implement `src/lib/components/Card.svelte` with props `{ padding?, style? }` and a default child slot. Wraps content in `bgSurface` background, hairline border, 16 px radius.
- [ ] Implement `src/lib/components/BigTimerCard.svelte` mirroring `TimerCard.svelte`'s API but rendering at 132 px ring stroke 7 with the desktop-grid layout. Reuses the existing `ProgressRing.svelte`. Same status, label, time, and action props as the smaller card.
- [ ] Implement `src/lib/components/TimePickerPopover.svelte` with the same input contract as `TimePickerSheet.svelte` (`value: Date, onConfirm, onCancel`), rendered as a small dropdown anchored under a clicked numeral. Two scrollable columns (hours, minutes) with snap-to-centre. ESC or outside-click closes without committing. Width 240 px, height 320 px, 16 px radius.
- [ ] Implement `src/lib/components/SyncChip.svelte` with no props. Reads queue length via a 1 s polling derived store on `db.ts`'s `sync_queue` table and last-pull via `LAST_PULL_KEY` from `sync_meta`. Renders one of three states (synced, pending, offline) with the matching dot colour and German label. Returns null while polling has not yet produced a first value (avoids flash on mount).
- [ ] Implement `src/lib/components/desktop/GrilladeCard.svelte` for the Grilladen list tile, with props `{ grillade, onClick }`. Renders title (or "Grillade vom <date>" fallback), relative date, item count, duration.
- [ ] Implement `src/lib/components/desktop/ActivityLog.svelte` for the Grillen right-pane log, with props `{ events: Array<{ kind, itemName, at }> }`. Newest first. Coloured dot per kind.
- [ ] Implement `src/lib/components/desktop/PlanSummaryList.svelte` for the persistent left pane on Planen and Grillen, with props `{ items, statusByItem? }`. Read-only; renders name plus cook time per row, plus an optional status dot when `statusByItem` is provided.

**Phase 3: Responsive layout shell**

- [ ] Implement `src/lib/runtime/viewport.svelte.ts` exposing a singleton rune `viewport` with `{ isDesktop: boolean }`. Initialises from `matchMedia('(min-width: 1024px)').matches` synchronously, then attaches a listener that updates the rune on change. Tear-down removes the listener.
- [ ] Update `src/routes/+layout.svelte` to import the viewport rune and the new `Sidebar.svelte`, `AccountChip.svelte`, `SyncChip.svelte`. When `viewport.isDesktop && authStore.isAuthenticated`, render a two-column grid (240 px sidebar plus flex content) with `<Sidebar>` and `<AccountChip>` and `<SyncChip>` mounted in the sidebar; otherwise render the existing single-column tree. The pre-auth pages (`/login`, `/set-password`, `/forgot-password`) render unchromed regardless of viewport.
- [ ] Add the sidebar `current` mapping in `+layout.svelte`: derive from `$page.url.pathname` so `/` maps to "home", `/plan` to "plan", `/session` to "cook", `/grilladen` to "grilladen", `/settings` to "settings". `onChange` calls `goto(...)` with the matching path.
- [ ] Add the LIVE badge logic to the Grillen sidebar item: read `grilladeStore.session.status === 'running'` and pass a `badge: 'LIVE'` to the `Sidebar` items array when true.
- [ ] Add a mobile-header SyncChip slot to `+layout.svelte` that mounts the chip top-right when `!viewport.isDesktop && authStore.isAuthenticated`. The chip mounts above the route content with `position: sticky; top: 0; right: 16px`.

**Phase 4: Übersicht (desktop /)**

- [ ] Update `src/routes/+page.svelte` to branch on `viewport.isDesktop`. When desktop, render the new `Übersicht` tree: section header, three stat cards via `Card.svelte`, primary "Neue Session" CTA, recent-Menüs horizontal scroll. When mobile, render the existing Glühen home unchanged.
- [ ] Compute the three stat values from the existing stores: today's planned Grillade count from `grilladeStore` (filter `status === 'planned'` and date matches today), total saved Grilladen from the new `grilladenHistoryStore.finished.length`, longest finished session duration from `grilladenHistoryStore.finished` reducing on `(ended_at - started_at)` max.
- [ ] The "Neue Session" CTA navigates to `/plan` and clears the current draft plan via `grilladeStore.resetDraft()` (existing API).
- [ ] The recent-Menüs strip reuses the existing `menusStore` and the existing `MenuCard.svelte` component in compact mode; tapping a card invokes the existing "load Menü into plan" flow and navigates to `/plan`.

**Phase 5: Planen (desktop /plan)**

- [ ] Implement `src/lib/components/desktop/PlanCompose.svelte` as the desktop centre-pane component for `/plan`. Receives the same props the existing mobile Plan consumes (mode, eatAt, items, callbacks). Renders the three-way segmented control, eating-time card, items list, dashed add-item button, "Als Menü speichern" button, and the "Los, fertig um HH:MM" primary button.
- [ ] Update `src/routes/plan/+page.svelte` to branch on `viewport.isDesktop`. Desktop: render a three-pane wrapper with `<PlanSummaryList>` on the left, `<PlanCompose>` in the centre, empty pane on the right. Mobile: render the existing Glühen Plan tree unchanged.
- [ ] Wire the `TimePickerPopover.svelte` into `<PlanCompose>` as the click target on the eating-time card. The popover receives the same `value` and `onConfirm` callbacks the existing `TimePickerSheet.svelte` receives.
- [ ] Mount `AddItemSheet.svelte` as a 480 px right-side drawer on desktop when add-item is triggered. Add a `placement: 'sheet' | 'drawer'` prop to `AddItemSheet.svelte` and switch between the existing bottom-sheet markup and a right-anchored panel based on the prop. Default `'sheet'` preserves mobile behaviour.
- [ ] Manual mode on desktop renders a 2-column grid of `BigTimerCard` instead of the mobile `TimerCard` grid. The card actions ("Los", "Anrichten") wire to the same `grilladeStore` actions as today.

**Phase 6: Grillen (desktop /session)**

- [ ] Implement `src/lib/components/desktop/CockpitLive.svelte` as the desktop pane for `/session`. Renders the centre pane (master countdown plus `BigTimerCard` grid) and the right pane (alarm banner sticky top plus activity log).
- [ ] Update `src/routes/session/+page.svelte` to branch on `viewport.isDesktop`. Desktop: render `<PlanSummaryList statusByItem>` left, `<CockpitLive>` centre and right. Mobile: render the existing Glühen Session tree unchanged.
- [ ] The master countdown reuses `MasterClock.svelte` at the existing typography. The 88 px and 56 px desktop sizes apply via a `size: 'desktop'` prop added to `MasterClock.svelte` that switches the inner numeral classes; the default keeps the mobile sizes.
- [ ] The `BigTimerCard` grid reads from `grilladeStore.session.items` and renders one card per item. Card status colour and progress wire to the existing per-item store fields (no new state shape).
- [ ] The activity log reads from a new `grilladeStore.session.timeline` array that the store appends to on every state transition (cooking, resting, ready, plated). The append is a small addition to the existing transition handlers; no schema change.
- [ ] The desktop alarm banner reuses `AlarmBanner.svelte` with a new `placement: 'top' | 'bottom'` prop. Default `'bottom'` preserves the mobile behaviour; desktop passes `'top'` and pins it to the right pane's top.
- [ ] The wake-lock chip and end-session button from `SessionHeader.svelte` move to the centre-pane top on desktop. Add a `placement: 'mobile' | 'desktop'` prop to `SessionHeader.svelte` switching layout; mobile default unchanged.

**Phase 7: Grilladen (new /grilladen route)**

- [ ] Create `src/routes/grilladen/+page.svelte` and `src/routes/grilladen/+page.ts`. The page rune reads from the new `grilladenHistoryStore` and renders either the list view or the detail view based on a local `selectedId: string | null` state.
- [ ] Add `/grilladen` to the auth-required path set in `src/routes/+layout.ts` (the route is gated by the existing `GET /api/auth/me` redirect).
- [ ] Implement `src/lib/stores/grilladenHistoryStore.svelte.ts` exposing a `finished` derived list filtered to `status === 'finished' && deleted_at == null`, sorted by `ended_at desc`. The store subscribes to the existing `grilladen` IDB store and re-derives on every change.
- [ ] Implement the list view in `src/routes/grilladen/+page.svelte` using `<GrilladeCard>` tiles in a CSS Grid (`grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`). Saved Grilladen render in a separate group above unsaved.
- [ ] Implement the detail view in `src/routes/grilladen/+page.svelte` showing the header (title, date, duration, item count), a two-column body (items table left, actions right), and the "Als Plan laden" and hold-to-confirm "Löschen" buttons.
- [ ] Implement "Als Plan laden": copy the past Grillade's items into a fresh plan via a new `grilladeStore.loadFromPastGrillade(grilladeId)` action that reads the past row's items, builds a new draft plan with the same item rows verbatim (including specs and cook seconds), and navigates to `/plan`. Toast on success.
- [ ] Implement "Löschen": call the existing soft-delete flow (`PATCH /api/grilladen/{id}` with `deleted_at`) via the existing `grilladeStore.softDelete(id)` action and return to the list. Toast on success.
- [ ] Empty state: when `grilladenHistoryStore.finished.length === 0`, render the dashed "Noch keine Grilladen abgeschlossen" card with a secondary CTA to `/plan`.
- [ ] Below 1024 px the route renders the same data in a single-column layout: stacked cards, full-width detail. Use the existing component-scoped CSS pattern; no separate mobile component.

**Phase 8: Einstellungen (desktop /settings)**

- [ ] Implement `src/lib/components/desktop/SettingsCockpit.svelte` with a 220 px left rail (group labels) and a flex right body. Group state lives in the component as a `$state` rune.
- [ ] Update `src/routes/settings/+page.svelte` to branch on `viewport.isDesktop`. Desktop: render `<SettingsCockpit>` with the five group bodies (Darstellung, Signale, Geräte, Konto, Über). Mobile: render the existing settings page unchanged.
- [ ] The Darstellung body wires the existing theme three-way segmented control.
- [ ] The Signale body wires the existing tone-per-event picker (Auflegen, Wenden, Fertig) and vibrate toggle.
- [ ] The Geräte body fetches `GET /api/auth/sessions` on mount and renders the device list with per-row revoke. Reuses the same `apiFetch` and store wiring as `/account` today.
- [ ] The Konto body shows email read-only, a "Passwort ändern" button (calls `POST /api/auth/forgot-password` for the current email), and the hold-to-delete account `HoldButton`. Same logic as `/account` today.
- [ ] The Über body shows the version label and the install hint.
- [ ] Sidebar account-chip click navigates to `/settings?group=konto`. The `SettingsCockpit` reads the search param on mount and preselects the matching group.

**Phase 9: Auth surface re-skin**

- [ ] Re-skin `src/routes/login/+page.svelte`: replace bespoke title and label markup with `<SectionHeader>`; replace inputs with the design-token-aligned input style (ember focus border, surface background); replace the submit button with the existing `Button.svelte` primary variant. Preserve every form field name, every API call, every error path, and the existing `?next=` handling.
- [ ] Re-skin `src/routes/set-password/+page.svelte` the same way. Preserve the activation-versus-reset bifurcation and the existing `runFirstLoginImport` call.
- [ ] Re-skin `src/routes/forgot-password/+page.svelte` the same way. Preserve the always-the-same German confirmation toast.
- [ ] Rebuild `src/routes/account/+page.svelte` against `<SectionHeader>`, `<Card>`, `Button.svelte`, and the existing `HoldButton.svelte`. Sections: E-Mail (read-only), Passwort (button), Aktive Geräte (device list), Konto (hold-to-delete). Preserve every API call, every error handler, the toast triggers, and the `clear()` plus navigate-to-`/login` flow on delete.
- [ ] Verify the existing E2E auth spec assertions in `tests/e2e/auth.spec.ts` still pass against the new markup; no test file changes are needed unless a test references a removed class or DOM shape.

**Phase 10: Mobile refinements**

- [ ] Update `src/lib/components/AlarmBanner.svelte` to render a `+N` badge when more than one alarm queues. Read queue length from the existing alarms array; render the badge only when length > 1.
- [ ] Update `src/routes/plan/+page.svelte` mobile manual-mode rendering so that when only one item is in the plan the single card spans the full row width; two-or-more items use the existing two-column grid.
- [ ] Mount the `<SyncChip>` in the mobile header slot in `+layout.svelte` (covered in Phase 3, listed here for surface completeness).

**Phase 11: Visual reconciliation**

- [ ] Serve the design package locally so the prototype is screenshot-able: `python3 -m http.server 8001 --directory .tmp/grillmi-design >/dev/null 2>&1 &`. Confirm the prototype loads at `http://localhost:8001/Grillmi%20Desktop.html`.
- [ ] Build the app and serve it on `http://localhost:5173` via `pnpm dev`.
- [ ] Capture prototype screenshots at 1440 px wide via `agent-browser` for each desktop section: Übersicht, Planen empty, Planen filled, Planen manual, Grillen mid-cook with one alarm, Grilladen list, Grilladen detail, Einstellungen Konto, Einstellungen Geräte. Save under `screenshot_proto_<section>.png` at the project root.
- [ ] Capture the running app at the same viewport for the same sections. Save under `screenshot_app_<section>.png` at the project root.
- [ ] Diff each pair via visual inspection. Fix any drift exceeding 4 px on spacing, any colour or typography mismatch, any missing motion on alarm or toast.
- [ ] Capture mobile screenshots at 390 px wide for the three mobile refinements (alarm `+N`, manual single-item full-row, sync chip in header) plus the four re-skinned auth pages. Save under `screenshot_app_mobile_<section>.png`.
- [ ] Run the full test suite: `pnpm test:unit && pnpm test:e2e`. Fix any failure introduced by markup changes; never disable a test to make it pass.

**Phase 12: Cleanup**

- [ ] Remove the local prototype server (the background process) and the `.tmp/grillmi-design` extraction. The package zip stays at the repo root for reproducibility.
- [ ] Delete or compress the screenshot pairs from Phase 11 once the diff pass is signed off; do not commit them.
- [ ] Confirm `260427-ipad-responsive-layout.md` Meta block carries the superseded marker added in Phase 1.

---

## Testing

Tests are implementation tasks. The implementer writes and passes each one. The Manual Verification section at the end is a single block executed by Marco after every other task is green.

### Unit Tests (`tests/unit/`)

- [ ] `tests/unit/viewport.test.ts::test_initial_value_matches_media_query`: stubs `matchMedia` to return `{ matches: true }`, the rune reads `isDesktop === true` synchronously.
- [ ] `tests/unit/viewport.test.ts::test_listener_updates_rune_on_change`: triggers a `change` event, the rune updates without a re-mount.
- [ ] `tests/unit/grilladenHistoryStore.test.ts::test_filters_to_finished_only`: seeds IDB with three rows (planned, running, finished), `finished` derives to one row.
- [ ] `tests/unit/grilladenHistoryStore.test.ts::test_excludes_soft_deleted`: a row with `deleted_at` set is filtered out.
- [ ] `tests/unit/grilladenHistoryStore.test.ts::test_sorts_by_ended_at_desc`: three finished rows with different `ended_at`, derived list is in reverse chronological order.
- [ ] `tests/unit/SyncChip.test.ts::test_synced_state_renders_when_queue_empty_and_pull_recent`: stubs queue length 0 and last pull within 5 min, renders "Synchronisiert" with a green dot.
- [ ] `tests/unit/SyncChip.test.ts::test_pending_state_renders_when_queue_nonempty`: stubs queue length 3, renders "3 ausstehend" with an ember dot.
- [ ] `tests/unit/SyncChip.test.ts::test_offline_state_renders_when_navigator_offline`: stubs `navigator.onLine = false`, renders "Offline" with a slate dot.
- [ ] `tests/unit/SyncChip.test.ts::test_no_render_before_first_poll`: returns null before the first poll completes.
- [ ] `tests/unit/Sidebar.test.ts::test_active_item_renders_accent_treatment`: passes `current = 'plan'`, the Plan item carries the active class.
- [ ] `tests/unit/Sidebar.test.ts::test_live_badge_renders_only_when_provided`: passes `badge: 'LIVE'` on Grillen, the pill renders; without badge, no pill.
- [ ] `tests/unit/AccountChip.test.ts::test_signed_in_shows_initials_and_name`: passes a user, renders initials in the gradient circle and the name and email.
- [ ] `tests/unit/AccountChip.test.ts::test_signed_out_shows_anmelden_button`: passes `null`, renders the outlined "Anmelden" button.
- [ ] `tests/unit/Toast.test.ts::test_auto_dismiss_after_duration`: mounts with `duration: 100`, fires `onClose` after 100 ms.
- [ ] `tests/unit/Toast.test.ts::test_action_button_calls_handler`: mounts with `action` and `onAction`, clicking the action button invokes `onAction`.
- [ ] `tests/unit/TimePickerPopover.test.ts::test_outside_click_closes_without_commit`: mounts open, clicks outside, fires `onCancel`, never fires `onConfirm`.
- [ ] `tests/unit/TimePickerPopover.test.ts::test_escape_key_closes_without_commit`: presses Escape, fires `onCancel`.
- [ ] `tests/unit/BigTimerCard.test.ts::test_renders_at_132_ring`: mounts with a sample item, the ring SVG is sized 132 px.
- [ ] `tests/unit/BigTimerCard.test.ts::test_status_colour_matches_state`: mounts in cooking state, ring stroke is the ember token; in resting, amber; in ready, green.
- [ ] `tests/unit/PlanSummaryList.test.ts::test_status_dot_renders_only_when_provided`: with `statusByItem`, dot renders; without it, no dot.
- [ ] `tests/unit/grilladeStore.loadFromPastGrillade.test.ts::test_copies_items_verbatim`: stub a finished Grillade with three items, calling `loadFromPastGrillade(id)` produces a draft plan with the same three items including specs and cook seconds.

### E2E Tests (`tests/e2e/`)

- [ ] `tests/e2e/cockpit.spec.ts::test_sidebar_renders_at_1024px_when_signed_in`: signed-in user, viewport 1024 px wide, the sidebar mounts with the five nav items and the account chip.
- [ ] `tests/e2e/cockpit.spec.ts::test_sidebar_does_not_render_below_1024px`: viewport 1023 px wide, the sidebar does not mount.
- [ ] `tests/e2e/cockpit.spec.ts::test_sidebar_does_not_render_on_login_page`: navigate to `/login` at 1440 px wide, the sidebar does not mount.
- [ ] `tests/e2e/cockpit.spec.ts::test_clicking_sidebar_item_navigates`: click "Grillen" in the sidebar, URL becomes `/session`.
- [ ] `tests/e2e/cockpit.spec.ts::test_live_badge_appears_when_session_running`: start a Grillade, the Grillen sidebar item shows the LIVE pill; end it, the pill disappears.
- [ ] `tests/e2e/cockpit.spec.ts::test_account_chip_signed_in_navigates_to_konto_group`: signed-in, click the account chip, URL becomes `/settings?group=konto` and the Konto group is preselected.
- [ ] `tests/e2e/cockpit.spec.ts::test_viewport_rotation_switches_layout`: viewport from 1023 px to 1024 px, the sidebar appears without a page reload.
- [ ] `tests/e2e/uebersicht.spec.ts::test_three_stat_cards_render`: at 1440 px on `/`, three stat cards render with non-zero values when test fixtures seed history.
- [ ] `tests/e2e/uebersicht.spec.ts::test_neue_session_cta_navigates_to_plan_with_empty_draft`: click "Neue Session", URL becomes `/plan` and the items list is empty.
- [ ] `tests/e2e/uebersicht.spec.ts::test_recent_menus_strip_loads_into_plan`: click a Menü pill, URL becomes `/plan` and the items list contains the Menü's items.
- [ ] `tests/e2e/planen.spec.ts::test_three_pane_layout_renders_at_desktop`: at 1440 px on `/plan`, the left summary, centre compose, and right pane all mount.
- [ ] `tests/e2e/planen.spec.ts::test_eating_time_popover_opens_on_click`: click the eating-time numeral, the `TimePickerPopover` opens; outside-click closes without committing.
- [ ] `tests/e2e/planen.spec.ts::test_add_item_renders_as_drawer_on_desktop`: trigger add-item at 1440 px, the sheet renders as a 480 px right drawer; at 390 px it renders as the bottom sheet.
- [ ] `tests/e2e/planen.spec.ts::test_manual_mode_grid_uses_big_timer_cards`: switch to Manuell at 1440 px, the cards render at the 132 px ring size.
- [ ] `tests/e2e/planen.spec.ts::test_los_button_disabled_when_empty`: empty plan, the "Los, fertig um HH:MM" button reads "Mindestens ein Eintrag nötig" and is disabled.
- [ ] `tests/e2e/grillen.spec.ts::test_three_pane_session_renders`: at 1440 px on `/session` with a running Grillade, the left summary, centre cockpit (with master countdown plus big timer grid), and right pane (alarm banner area plus activity log) all mount.
- [ ] `tests/e2e/grillen.spec.ts::test_alarm_banner_pins_top_right_pane_on_desktop`: trigger an alarm, the banner mounts at the top of the right pane; on mobile (390 px) it stays bottom-pinned.
- [ ] `tests/e2e/grillen.spec.ts::test_alarm_plus_n_badge_renders_with_multiple_alarms`: queue two alarms, the banner shows a `+1` badge.
- [ ] `tests/e2e/grillen.spec.ts::test_activity_log_appends_on_state_transition`: a state transition fires (cooking to resting), a new event row appears at the top of the log with the kind and item name and a fresh relative timestamp.
- [ ] `tests/e2e/grilladen.spec.ts::test_list_filters_to_finished_only`: seed three Grilladen (planned, running, finished), the list shows only the finished one.
- [ ] `tests/e2e/grilladen.spec.ts::test_list_excludes_soft_deleted`: seed a finished Grillade with `deleted_at` set, the list does not show it.
- [ ] `tests/e2e/grilladen.spec.ts::test_detail_view_shows_items_and_metadata`: click a card, detail view shows title, date, duration, item count, and the items table.
- [ ] `tests/e2e/grilladen.spec.ts::test_load_as_plan_navigates_with_items`: click "Als Plan laden" on a finished Grillade with three items, URL becomes `/plan` and the items list contains the same three items.
- [ ] `tests/e2e/grilladen.spec.ts::test_hold_to_delete_removes_row`: hold "Löschen" for 500 ms, the row disappears from the list and the `PATCH /api/grilladen/{id}` request fires with `deleted_at` set.
- [ ] `tests/e2e/grilladen.spec.ts::test_empty_state_renders_when_no_finished`: seed zero finished Grilladen, the empty state card renders with the "Neue Session planen" CTA.
- [ ] `tests/e2e/grilladen.spec.ts::test_route_renders_below_1024px_in_single_column`: viewport 390 px on `/grilladen`, list renders stacked, detail view full-width.
- [ ] `tests/e2e/einstellungen.spec.ts::test_left_rail_groups_render_at_desktop`: at 1440 px on `/settings`, the five group labels render and clicking a label switches the right body.
- [ ] `tests/e2e/einstellungen.spec.ts::test_konto_group_preselected_via_query_param`: navigate to `/settings?group=konto` at 1440 px, the Konto group is preselected.
- [ ] `tests/e2e/einstellungen.spec.ts::test_geraete_group_lists_active_sessions`: seed two active sessions, the Geräte body renders both rows with revoke buttons.
- [ ] `tests/e2e/einstellungen.spec.ts::test_konto_delete_hold_clears_session_and_navigates_to_login`: hold the delete button for 500 ms, the account is deleted, IDB is cleared, URL becomes `/login`.
- [ ] `tests/e2e/einstellungen.spec.ts::test_mobile_settings_page_unchanged`: at 390 px on `/settings`, the existing single-column settings layout renders (no left rail).
- [ ] `tests/e2e/auth-reskin.spec.ts::test_login_page_renders_section_header`: on `/login`, the new `<SectionHeader>` markup is present with the "Anmelden" title.
- [ ] `tests/e2e/auth-reskin.spec.ts::test_account_page_uses_section_headers`: on `/account` at 390 px, the four sections (E-Mail, Passwort, Aktive Geräte, Konto) each render a `<SectionHeader>`.
- [ ] `tests/e2e/auth-reskin.spec.ts::test_existing_auth_e2e_specs_still_pass`: re-run the full `tests/e2e/auth.spec.ts` and `tests/e2e/account.spec.ts` suites, all existing tests pass without changes.
- [ ] `tests/e2e/sync-chip.spec.ts::test_synced_state_renders_when_idle`: signed-in, queue empty, last pull recent, the chip reads "Synchronisiert".
- [ ] `tests/e2e/sync-chip.spec.ts::test_pending_state_renders_during_offline_writes`: airplane mode on, edit a Grillade, the chip reads "1 ausstehend"; reconnect, the chip flips back to "Synchronisiert" within 1 second.
- [ ] `tests/e2e/sync-chip.spec.ts::test_offline_state_renders_when_navigator_offline`: offline, the chip reads "Offline" with a slate dot.
- [ ] `tests/e2e/sync-chip.spec.ts::test_chip_mounts_in_sidebar_on_desktop_and_header_on_mobile`: at 1440 px the chip is inside the sidebar; at 390 px it is in the layout header slot.

### Manual Verification (Marco)

These steps require physical devices and Marco's eyes. Every step is one item. Run after the full test suite is green and the visual reconciliation phase is signed off.

- [ ] On the Mac in Safari at fullscreen, open `https://grillmi.cloud`. The sidebar mounts on the left with the five nav items and the LIVE pill is hidden. Click each nav item in turn and confirm the pane swaps. The Übersicht stat cards show non-zero values for the existing data.
- [ ] On the Mac, click "Neue Session" from Übersicht. Compose a plan with three items including one thickness-doneness cut. The eating-time numeral opens the popover; pick a new time; the numeral updates without a sheet. Hit "Los, fertig um HH:MM"; the pane swaps to Grillen with the master countdown ticking and three big timer cards in the centre.
- [ ] On the Mac mid-cook, wait for the first put-on alarm. The alarm banner pulses at the top of the right pane. The activity log on the right shows the matching event with a coloured dot. Confirm the alarm; the banner clears.
- [ ] On the Mac, open Grilladen. Past finished cookouts render as cards. Click one; the detail view shows the items table and the actions column. Hit "Als Plan laden"; the pane swaps to Plan with the same items. Hold "Löschen" on a different past Grillade for 500 ms; the row disappears and the toast confirms.
- [ ] On the Mac, open Einstellungen. The left rail shows the five groups. Click Geräte; the active session list renders with the Mac and the iPhone. Click Konto; the email, password change, and hold-to-delete render against the design system.
- [ ] On the iPad in landscape on Safari at `https://grillmi.cloud`, the sidebar mounts and the cockpit layout matches the Mac. Rotate to portrait; the sidebar disappears and the mobile direction takes over. Rotate back; the sidebar returns without a page reload.
- [ ] On the iPhone PWA at the grill, start a Grillade with two items. The mobile session screen renders unchanged from the shipped Glühen direction. The sync chip in the top-right reads "Synchronisiert". Trigger an alarm; the alarm banner shows the `+N` badge when a second alarm queues behind it.
- [ ] On the iPhone PWA, open `/login` (sign out first). The page renders with the new section header and the ember focus border on the inputs. Sign in; land on Home with all data present. Open `/account`; the four sections render against the design system.
- [ ] On the iPhone PWA, toggle airplane mode on, edit a Grillade item name. The sync chip flips to "1 ausstehend". Toggle airplane mode off. Within five seconds the chip flips back to "Synchronisiert" and the Mac picks up the edit on next foreground.
- [ ] On the iPhone PWA, open Grilladen via the URL bar (the sidebar does not exist on mobile). The route renders the same finished list in a single column. Tap a row; detail view renders full-width.
