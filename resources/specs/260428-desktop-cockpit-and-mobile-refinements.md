# Grillmi: Desktop Cockpit and Mobile Refinements

## Meta

- Status: Implemented on `feature/desktop-cockpit`. Spec rewritten on 2026-05-01 to match the app as shipped. Scope was reduced during implementation: the Übersicht overview screen, the auth-surface re-skin, the SyncChip mount, and the formal visual-reconciliation pipeline were dropped. The desktop home at `/` redirects straight to `/grillen` (the Grillen cockpit); account management lives entirely in the Einstellungen cockpit instead of a separate `/account` route. See **Out of scope** for the full list of intentionally dropped items. Vocabulary follows `CONTEXT.md` (Grillade, Grillstück, Modus, Chronik).
- Branch: feature/desktop-cockpit
- Infra: none
- Runbook: none

This spec replaces and supersedes `260427-ipad-responsive-layout.md`, which was reviewed but never implemented. The roadmap step "Desktop redesign + iPad reuse" in `resources/docs/roadmap-apr-2026.md` folds that work into this one. The visual source of truth is the Claude Design handoff at `Grillmi-Desktop-Mobile2.zip`, extracted at `.tmp/grillmi-design/` during implementation. Implementation is required to match `Grillmi Desktop.html`, `Grillmi Mobile.html`, and `Grillmi Design System.html` at the screenshot targets in this spec; "close enough" styling is a defect.

### Amendments

- 2026-04-29: Cockpit merge. Planen and Grillen are no longer two separate desktop sections. They collapse into a single sidebar entry called "Grillen" that renders one cockpit screen for both pre-start planning and post-start live state. The same Grillstücke list is shown across both states (sourced from `session.items` when a session exists, `plan.items` otherwise). The sidebar entry carries the LIVE pill while a session is running. Mobile keeps `/grillen` and `/session` as two separate routes with their existing Glühen layouts; the merge is desktop only.
- 2026-04-29: History rename. The sidebar entry and route `/grilladen` are renamed to "Chronik" and `/chronik`. The `grilladen` IDB store, the `/api/grilladen` backend endpoints, and the `GrilladeRow` shape stay unchanged; only the user-visible label and the SvelteKit route move. "Grillade" / "Grilladen" remain the entity terms per `project_grillade_terminology.md`.

---

## Business

### Goal

Add a first-class desktop cockpit direction to Grillmi, refresh a small set of mobile details from the same handoff, and visually align the four auth surfaces with the rest of the app. After this spec ships, Marco gets a real Mac experience for planning and watching a Grillade (sidebar nav, one unified Grillen cockpit covering pre-start planning and post-start live state, a Chronik of past Grilladen), the iPad picks up the same cockpit in landscape, the phone keeps the shipped Glühen direction with a small set of polish items, and `/login`, `/set-password`, `/forgot-password`, and `/account` adopt the dark ember language they currently lack.

### Proposal

Introduce a viewport-driven layout shell at `src/routes/+layout.svelte` that switches between the existing mobile direction (below 1024 px) and a desktop cockpit (1024 px and above). The cockpit renders a 240 px sidebar (`Sidebar.svelte`) with three top-level entries (Grillen, Chronik, Einstellungen) plus an account chip, and routes each existing route into a desktop-shaped pane: Grillen is a single three-pane cockpit covering both `/grillen` (pre-start) and `/session` (post-start) with the same Grillstücke list shown throughout, Chronik is a list-and-detail view at `/chronik` backed by the existing `GET /api/grilladen` endpoint filtered to `status === 'finished'`, and Einstellungen is the package's left-rail grouped settings view. The desktop home at `/` redirects to `/grillen` so the Grillen cockpit is the canonical landing page; the mobile home keeps the existing Glühen direction. The design system tokens and shared atoms join `src/app.css` and `src/lib/components/`. The four auth pages keep their existing markup; account management consolidates into the Einstellungen Konto group. Mobile gets two small refinements from the same package: alarm queue `+N` badge and manual-mode single-Grillstück full-row polish.

### Pixel Target Contract

All visual implementation work is governed by the design package, not by approximation from prose. The implementer must keep these constants exact unless a test proves the package itself uses a different value:

- Design source files: `Grillmi Desktop.html`, `Grillmi Mobile.html`, `Grillmi Design System.html`, `desktop.jsx`, `desktop-shared.jsx`, `mobile.jsx`, `shared.jsx`.
- Viewports for comparison: desktop `1440x900`, desktop-narrow `1024x768`, mobile `390x844`, iPad landscape `1024x768`, iPad portrait `820x1180`.
- Font stack: display `"Barlow Condensed", "DIN Condensed", "Oswald", system-ui, sans-serif`; body `Inter, -apple-system, system-ui, sans-serif`; numeric labels use the same condensed display stack with tabular figures, not a code monospace.
- Core colours: `bg #0b0a09`, `bgSurface #16140f`, `bgSurface2 #1f1b15`, `bgElev #26211a`, `bgPanel #100e0b`, `border rgba(255,255,255,0.06)`, `borderStrong rgba(255,255,255,0.12)`, `borderHot rgba(255,122,26,0.28)`, `text #f5f1ea`, `textMuted rgba(245,241,234,0.55)`, `textDim rgba(245,241,234,0.32)`, `ember #ff7a1a`, `emberDim #8a3f0a`, `emberInk #1a0a02`, `resting #f5b341`, `ready #4ade80`, `pending #7c89a4`, `red #ef4444`.
- Desktop shell: two-column grid `240px 1fr`, sidebar `bgPanel`, sidebar border-right `1px solid border`, sidebar padding `24px 16px`, logo block margin-bottom `28px`.
- Sidebar nav: nav gap `2px`; item min-height `40px`; item padding `10px 12px`; icon slot `20px`; icon SVG `18x18` with stroke width `1.6`; active background `${ember}1f`; active left bar width `3px`, left `-1px`, top/bottom `8px`, radius `2px`; item radius `10px`; label size `14px`; active weight `600`; inactive weight `500`; badge padding `2px 6px`, radius `6px`, size `10px`.
- Account chip: signed-in padding `8px 10px`, gap `10px`, radius `12px`, background `bgSurface`, border `1px solid border`, avatar `32px` circle with `linear-gradient(135deg, ember 0%, emberDim 100%)`, initials size `12px`, name size `13px`, email size `11px`. Signed-out chip uses padding `10px 12px`, placeholder circle `28px`, and `borderStrong`.
- Section header: flex baseline layout, margin-bottom `14px`; kicker size `10px`, letter-spacing `0.14em`, weight `700`, uppercase, margin-bottom `4px`; title size `22px`, weight `600`, uppercase, letter-spacing `0.01em`.
- Desktop buttons: radius `10px`; sizes `sm 32px`, `md 40px`, `lg 52px`; primary background `ember`, text `emberInk`; secondary background transparent, text `text`, border `borderStrong`; danger text `red`, border `rgba(239,68,68,0.4)`.
- Desktop cards: background `bgSurface`, border `1px solid border`, radius `16px`, default padding `20px 22px`.
- Toast: fixed bottom-center (`left 50%`, `bottom 24px`, translateX `-50%`), background `bgPanel`, border `borderStrong`, radius `10px`, padding `12px 16px`, gap `14px`, shadow `0 12px 32px rgba(0,0,0,0.35)`, enter animation from `translate(-50%, 8px)` to `translate(-50%, 0)` over `180ms`.
- Mobile package baseline: `Grillmi Mobile.html` keeps the iPhone-framed Glühen direction. Mobile refinements must not flatten the hero glow, typography, bottom buttons, or existing alarm slab styling.
- Pixel tolerance: after deterministic data seeding, Playwright screenshot diffs against the package may differ only for dynamic text values, live countdown numerals, real user email/name, browser font antialiasing, and fields explicitly listed under Data Model Substitutions. Any fixed layout element more than `4px` off in position or size, any token colour mismatch beyond antialiasing, any missing package element, or any extra visible chrome is a blocker.

### Data Model Substitutions

The package contains prototype-only history fields (`saved`, `guests`, `note`, `mood`) in `desktop-shared.jsx`. This spec does not add backend columns for those fields, but the layout slots still exist so the implemented screen remains visually comparable.

- Saved star: render the star affordance in the Chronik list and detail action column. The saved state is local-only in this spec, persisted in IDB sync meta under a `historySaved:<grilladeId>` key, and it is out of cross-device sync until a backend schema spec adds it.
- Guests: keep the Personen metric tile in detail. When no guest count exists, render a dim "-" value in the same tile.
- Note: keep the note block and note action. Notes are local-only in this spec, persisted in IDB sync meta under `historyNote:<grilladeId>`, and out of cross-device sync until a backend schema spec adds it.
- Mood: do not render a mood field because the package uses it only as sample metadata, not a visible UI control.
- Item count and item list: use embedded local `session.items` when present; otherwise fetch item rows from `GET /api/grilladen/{id}/items?since=1970-01-01T00:00:00Z`. When offline and no embedded items exist, preserve the package layout and show a dim unavailable state in the items card.

### Behaviors

#### Responsive cutover

- Below 1024 px viewport width the app renders exactly as it does today: per-route content, no chrome, mobile single-column layouts. Existing mobile breakpoints inside individual components stay untouched.
- At and above 1024 px viewport width the layout shell mounts the desktop cockpit: a 240 px sidebar on the left and the active section's pane on the right. Each existing route maps to one of the five sidebar sections; navigating via in-app links swaps the pane and updates the highlighted sidebar item.
- The breakpoint is observed via a `matchMedia('(min-width: 1024px)')` listener in the layout shell so an iPad rotated from portrait to landscape switches direction without a page reload.

#### Sidebar (desktop cockpit chrome)

- The sidebar carries the wordmark "Grillmi" with a small ember flame glyph at the top (display, not a link), then three nav items in order: Grillen, Chronik, Einstellungen. Each item shows a small monoline glyph and a label. There is no separate Übersicht entry; the desktop home at `/` redirects to `/grillen` via a layout-level effect so the Grillen cockpit is the canonical landing page.
- The currently active item carries an ember tint background, ember-coloured icon and label, and a 3 px ember left bar. Inactive items show body text colour with muted icon.
- The Grillen item is the unified cockpit entry. It always renders. It carries a small "LIVE" pill in `emberInk` on `ember` whenever there is an active Grillade (status `running`); the pill is hidden otherwise. There is no separate "Planen" entry; pre-start planning happens inside the Grillen cockpit.
- The Grillen entry navigates to `/grillen` when no session exists and to `/session` when a session is running, so the URL stays semantic. Both routes render the same desktop cockpit component, so visually the entry is one stable destination. The `currentSection` derivation in `+layout.svelte` maps both `/grillen` and `/session` to the Grillen entry.
- The bottom of the sidebar mounts the account chip. Signed-in: 32 px gradient circle with the user's initials, name and email next to it. Signed-out: outlined "Anmelden" button with a placeholder circle. Tapping signed-in goes to Einstellungen with the Konto group preselected (`/settings?group=account`); tapping signed-out goes to `/login`.

#### Home (`/`)

- On desktop (1024 px and above), `+layout.svelte` runs an effect that redirects `/` to `/grillen` so the user lands directly in the Grillen cockpit. There is no overview screen and no `/` content rendered.
- On mobile (below 1024 px), `/` renders the existing Glühen direction: hero glow, brand wordmark, "Bereit zum Grillen?" hero, recent Grilladen pills, primary "Grillen" CTA with LIVE badge when a Session is running, plus secondary "Chronik" and "Einstellungen" buttons.

#### Grillen (desktop only at 1024 px+, routes `/grillen` and `/session`)

The Grillen cockpit is one screen that covers both pre-start planning and post-start live state. Both routes render the same `DesktopCockpit.svelte` component on desktop. Mobile keeps `/grillen` and `/session` as two separate Glühen layouts and is unchanged.

**Layout (both states):**

- A three-pane split: left is the persistent Grillstücke list (280 px wide), centre is the working surface (flex), right is the alarm + activity column (320 px).
- The left list reads from `session.items` when a session is running, otherwise from `plan.items`. Pre-start it is a read-only summary (name plus cook time). Post-start it gains a status dot per row matching the item's current timeline state. The list never goes empty during the transition from pre-start to post-start.
- The right pane is empty pre-start (reserved whitespace, no chrome). Post-start it mounts `AlarmBanner.svelte` (sticky top, only when at least one alarm is active, with a `+N` badge when more than one queues) and below it the in-memory activity log for the current cockpit lifetime: a chronological list of timeline events ("Auflegen", "Wenden", "Ruhen", "Fertig", "Anrichten") with the item name and a relative timestamp, newest event on top, coloured dot per kind.

**Centre pane, pre-start (no session):**

- A unified three-way segmented control ("Jetzt", "Auf Zeit", "Manuell") at the top, the eating-time card below it (in Jetzt and Auf Zeit modes only), then the Grillstücke list, then the dashed add-item button, then the "Als Menü speichern" dashed button.
- Manual mode swaps the items list for a two-column grid of timer cards reusing the existing `TimerCard.svelte`. Behaviour is identical to mobile manual mode: a "Los" button per card while unstarted, transitions through cooking, resting, ready, and finally exposes "Anrichten".
- The eating-time card uses `TimePickerPopover` (click-to-open numerals dropdown) on desktop instead of the bottom sheet `TimePickerSheet.svelte` used on mobile.
- A "Los, fertig um HH:MM" primary button mounts at the bottom of the centre pane. Disabled when the items list is empty, reading "Mindestens ein Eintrag nötig".
- The `AddItemSheet.svelte` mounts as a 480 px-wide right-side drawer on desktop; on mobile it stays the existing bottom sheet.

**Centre pane, post-start (session active):**

- Top: wake-lock chip and end-session button from `SessionHeader.svelte` (placement `desktop` keeps them inline at the top-right of the centre pane).
- Below the header: the master countdown via `MasterClock.svelte` (size `desktop`), an 88 px display-font numeral for the eating time and a 56 px display-font numeral for the live countdown. While a manual-mode session is unstarted, an "Auflegen Vorlauf" affordance replaces the countdown.
- Below the countdown: a grid of `TimerCard` size `lg` (a 132 px stroke-7 progress ring variant) renders one card per item. 3 columns above 1280 px, 2 columns at 1024 to 1279 px. Card colour tracks status: pending slate, cooking ember, resting amber, ready green, plated muted.
- Hitting "Anrichten" on a card transitions the item to plated and updates the activity log. When every item is plated (or the items list becomes empty), the cockpit ends the Grillade and returns to the Grillen pre-start state at `/grillen`.

**Transition behaviour:**

- Clicking "Los, fertig um HH:MM" calls `grilladeStore.startSession()` (or `startManualSession()` in Manuell mode) and navigates from `/grillen` to `/session`. The same DesktopCockpit instance reads from `session.items` going forward; the centre pane swaps from compose to live state without a layout shift.
- Adding Grillstücke during a live session (Auflegen Vorlauf) appends a new pending item with a far-future `putOnEpoch` sentinel, surfaced in the centre grid with a "Los" affordance until the cook clicks it. The left summary picks the item up immediately.
- "Beenden" on the SessionHeader confirms, ends the Grillade, replays the items into a fresh draft plan via `grilladeStore.endSession()`, and returns the cockpit to pre-start state. URL navigates to `/`.

#### Chronik (new route, desktop only at 1024 px+, route `/chronik`)

- The Chronik list view matches `DesktopGrilladen` in `desktop.jsx`: wrapper padding `32px 36px`, section header kicker `Chronik`, title `Was du schon gegrillt hast`, grid `repeat(auto-fill, minmax(280px, 1fr))`, gap `14px`.
- Each Grillade card uses `bgPanel`, border `1px solid border` or `1px solid ember` when locally saved, radius `12px`, padding `18px 20px`. The top row shows relative date plus full date in uppercase `11px` metadata; the right side shows a 24px star button (`★` saved, `☆` unsaved).
- Card title uses body font `16px`, weight `600`, line-height `1.2`, margin-bottom `8px`. Item summary uses `13px` muted text, line-height `1.4`, two-line clamp. Footer uses condensed numeric font `12px`, dim text, gap `14px`, and shows item count, duration, and Personen value (`- Personen` when no guest count exists).
- Tapping a card opens the detail view matching `GrilladeDetail`: wrapper padding `24px 36px 36px`; back control text `Zurück zur Chronik`; metadata row shows relative/full date and a `Gespeichert` pill when locally saved; title size `36px`, line-height `1.05`, margin-bottom `24px`.
- Detail metrics render as four tiles in `repeat(4, 1fr)`, gap `12px`: Personen, Grillstücke, Dauer, Fenster. Missing Personen renders dim "-"; Fenster derives from started/ended timestamps.
- Detail body renders as `grid-template-columns: 1fr 280px`, gap `18px`. The left card lists items under "Was auf dem Rost war" with the right header "Garzeit", index numbers padded to two digits, row padding `12px 0`, and note block below a top border. The right action column contains "Erneut grillen", saved toggle, note edit/add, spacer `8px`, and delete confirmation controls.
- Delete follows the package's two-step confirmation visual, not a hold button: initial ghost "Löschen"; after click, a `bgSurface` confirmation box with "Wirklich löschen?", danger "Ja, löschen", and ghost "Abbrechen". Successful delete returns to the list and shows a toast reading "Grillade gelöscht".
- "Erneut grillen" turns the past Grillade into a fresh plan and navigates to the Grillen cockpit pre-start state at `/grillen`. A toast reads `„<title>" als Plan geladen`.
- The Chronik route reads from the existing `grilladen` IDB store and filters client-side to rows where `status === 'finished'` and `deletedEpoch === null`. Sort is `endedEpoch desc`. The existing pull mechanism keeps the list current. The IDB store name and the `/api/grilladen` endpoint paths stay unchanged; only the user-visible label and the SvelteKit route move from `/grilladen` to `/chronik`.
- If a finished Grillade has no embedded item rows and the device is offline, the detail view keeps the metadata header visible, shows "Details offline nicht verfügbar" in the items area, and disables "Erneut grillen" until item rows can be fetched.
- Below 1024 px the route still mounts (so deep links work) but renders a single-column mobile variant: stacked cards, full-width detail view, no two-column actions. This means the route is reachable from both viewports.
- The route inherits the existing auth gate in `src/routes/+layout.ts` because only `/login`, `/set-password`, and `/forgot-password` are public paths.
- When there are zero finished Grilladen, the empty state shows the section header plus a single dashed card reading "Noch keine Grilladen abgeschlossen" with a secondary CTA "Neue Grillade planen" linking to `/grillen`.

#### Einstellungen (desktop only at 1024 px+, route `/settings`)

- The pane matches `DesktopSettingsStub`: shell grid `220px 1fr`; left rail background `bgPanel`, border-right `border`, padding `24px 14px`; body padding `36px 48px`.
- The left rail heading reads "Einstellungen" in uppercase `10px`, letter-spacing `0.16em`, muted, padding `0 10px 12px`.
- Left rail groups are exactly: "Signale & Alarme", "Darstellung", "Einheiten & Sprache", "Geräte", "Konto & Datenschutz". Selected group has background `${ember}14`, border-left `2px solid ember`, radius `8px`, label weight `600`, and right chevron `›`.
- The Signale & Alarme group contains rows for Wenden-Signal, Fertig-Signal, Auflegen-Erinnerung, plus a small "Vorlauf" section with Wenden-Vorlauf and Fertig-Vorlauf steppers. Existing tone picker data backs these rows; visual row geometry follows the package.
- The Darstellung group contains Theme segmented control, Akzentfarbe colour swatches, Dichte segmented control, and Fortschrittsringe zeigen toggle. If a setting is not yet persisted, the control is local-only for this spec and resets on reload.
- The Einheiten & Sprache group contains Masssystem, Temperatur, and Sprache segmented controls. If the live app does not yet support imperial, Fahrenheit, or English, disabled options still render in the package geometry with disabled opacity and no behaviour.
- The Geräte group renders active sessions from `GET /api/auth/sessions` using the package row geometry: 44px icon tile, name, subline, active/sleeping status dot and label, and "Abmelden" button. Missing device icons fall back to the same glyph classes used in the package (`◐`, `▢`, `▭`).
- The Konto & Datenschutz group renders avatar `56px`, name/email, "Passwort ändern", a small "Daten" section, "Daten exportieren", "Grilladen löschen", "Abmelden", and "Konto löschen". Buttons whose behaviour is outside this spec render disabled with the same dimensions; account deletion keeps the existing hold/delete safety flow inside the package's danger button styling.
- Mobile Einstellungen (below 1024 px) renders the existing settings page unchanged. The `/account` route stays as a separate page on mobile and renders its full content there.

#### Auth surfaces

- `/login`, `/set-password`, `/forgot-password` keep their existing markup. Form fields, every API call, every error path, and the existing `next` redirect handling from `260428-accounts-and-sync.md` are unchanged.
- The `/account` route is removed. Account management lives in the Einstellungen pane's Konto group on desktop (`/settings?group=account` preselects it) and in the existing settings page on mobile. The desktop AccountChip click and any "Konto" link in the app target `/settings?group=account`.
- The auth pages still render unchromed regardless of viewport: `+layout.svelte`'s `publicPage` derivation hides the sidebar on `/login`, `/set-password`, and `/forgot-password`.

#### Mobile refinements (carry-over from the design package)

- The alarm banner shows a `+N` badge when more than one alarm queues, mirroring the desktop right-pane behaviour.
- Manual Modus on the Grillen route (`/grillen` mobile branch) renders a single Grillstück card full-width when the plan has only one item, falling back to the existing two-column grid for two or more items.

### Out of scope

- Light theme rework. The existing tonal-inversion light theme stays; this spec touches only dark-mode visual surfaces.
- Sign in with Apple. Deferred per `roadmap-apr-2026.md`.
- Push notifications and the `pending_notifications` table. Deferred per `roadmap-apr-2026.md`.
- New product features beyond what the design package shows.
- The `/diag` route does not get a desktop cockpit treatment and does not appear in the sidebar nav. It stays as a public dev URL.
- Backend schema changes. The existing `grilladen` schema (status enum, ended_at, soft delete) supports Chronik client-side filtering; no new endpoints, no new columns.
- Backend additions of "saved", "guests", "note", or "mood" columns implied by the prototype's `HISTORY` sample data. The visible saved, Personen, and note slots still render per Data Model Substitutions, but persistence is local-only in this spec.
- The "Erneut grillen" affordance does not preserve item-level specs that the prototype invents (the prototype constructs cook times from `durationSec / itemCount`). It loads the past Grillade's items verbatim from `grillade_items` into a fresh Grillade with no estimation maths.
- Tablet portrait (768-1023 px) does not get a dedicated direction. It keeps the mobile direction with widened gutters from existing components. The cockpit is desktop and landscape-iPad only.
- The persistent left Grillstück list on the unified Grillen cockpit does not gain editing affordances. It is a read-only summary; all editing happens in the centre pane.

The following items appeared in earlier drafts of this spec and were intentionally dropped during implementation. They are out of scope for this spec and have no follow-up unless explicitly re-opened:

- **Übersicht overview screen.** Earlier drafts called for a dashboard at `/` with a hero, stat cards, and a "Loszündeln" CTA. It was dropped entirely; the desktop `/` redirects to `/grillen` so the Grillen cockpit is the only landing surface. The sidebar consolidated to three entries: Grillen, Chronik, Einstellungen.
- **Auth surface re-skin.** `/login`, `/set-password`, and `/forgot-password` keep their existing styling. The token-aligned input style, `SectionHeader.svelte` adoption, and re-skin of error banners are not part of this spec.
- **Standalone `/account` route.** Account management is consolidated into the Einstellungen Konto group; there is no `/account` page. Activation emails and any external link must target `/settings?group=account`.
- **`SyncChip.svelte` mounting.** The component exists in `src/lib/components/SyncChip.svelte` but is not imported by `+layout.svelte` or any other surface. The chip is dead code; see Cleanup follow-ups.
- **Formal visual-reconciliation pipeline.** Design and app captures live under `.tmp/visual-diff/` and `.tmp/pixel-verify/` from one-shot Playwright passes during implementation. There is no `test:visual-design` script in `package.json`, no automated `pixelmatch` gate, and no recurring CI step. The diff pass that survives is the user's own end-to-end use of the app.
- **Tests under the names listed in earlier drafts.** Coverage exists, but in `tests/e2e/cockpit-merge.spec.ts`, `tests/e2e/walkthrough.spec.ts`, `tests/unit/grilladenHistoryStore.test.ts`, `tests/unit/ticker.test.ts`, `tests/unit/alarms.test.ts`, and the component tests under `tests/components/`, not under `cockpit.spec.ts`, `uebersicht.spec.ts`, `planen.spec.ts`, `grillen.spec.ts`, `chronik.spec.ts`, `einstellungen.spec.ts`, `auth-reskin.spec.ts`, or `sync-chip.spec.ts`. The spec's Testing section enumerates the actual files.

---

## Technical

### Approach

The cutover happens entirely in the SvelteKit frontend. No backend changes, no schema changes, no Doppler additions, no Caddy or Ansible work. The branch builds on `main` after `feature/accounts-and-sync` lands; it picks up the `authStore`, sync queue, IDB v4 schema, and `grilladen` API surface as foundations.

The viewport split is driven by a single `matchMedia('(min-width: 1024px)')` observer in `src/routes/+layout.svelte`. The match result lives in a Svelte rune (`$state`) on a layout-level singleton that every route can read. Each route's `+page.svelte` tests the rune and renders one of two trees: the existing mobile tree, or a new desktop tree imported from `src/lib/components/desktop/`. Component-scoped CSS keeps the rest of the responsive sizing (gutters, max-widths) per-component as today; the only layout-shell `@media` query is the one that loads the sidebar.

New shared atoms live under `src/lib/components/` (alongside the existing components, not in a subfolder, to match the established pattern). New desktop-only screen components live under `src/lib/components/desktop/` to keep them grouped without polluting the mobile component namespace. The `Toast.svelte` atom replaces ad-hoc `setTimeout`-based banners and is the single source of confirmation feedback for both viewports.

The Grilladen client-side filter is implemented in a new `src/lib/stores/grilladenHistoryStore.svelte.ts` rune that reads the existing `grilladen` IDB store and exposes a `finished` derived list ordered by `endedEpoch desc`. Adding a new row with `status = 'finished'` to IDB (which already happens at session end via the existing flow) updates the derived list after the store refreshes. Detail items are loaded on demand from embedded local `session.items` or from the existing `/api/grilladen/{id}/items` endpoint. No code path other than this new store touches Grilladen-history rendering.

The `SyncChip` reads from `src/lib/stores/db.ts`: `listSyncQueue()` for queue length and `getSyncMeta('lastPullEpoch')` for the last-pull timestamp written by `src/lib/sync/pull.ts`. The chip owns a small mounted poll that runs every 1000 ms and stops on destroy. Polling is acceptable here because the chip is only mounted on signed-in chrome and the cost is one IDB read per second.

The four auth pages adopt the shared atoms by importing them; their existing form logic, store wiring, and CSRF flow stay byte-for-byte the same. Visual changes are CSS-only on `/login`, `/set-password`, `/forgot-password`. `/account` rebuilds the markup but keeps every API call, error path, and toast trigger identical to today.

The `260427-ipad-responsive-layout.md` spec is marked superseded in its Meta block as part of this work; no code in that spec was implemented, so there is no rollback to perform.

### Approach Validation

- Round 0 web research checked SvelteKit responsive-layout patterns. The community pattern for viewport-conditional layouts is a single `matchMedia` observer in the root layout exposed via context or a store, with each route consuming the value. Reference: SvelteKit docs on `+layout.svelte` and `matchMedia`. Container queries were considered and rejected because the cockpit branch needs to hide or show entire navigation chrome, which is a layout-level concern not a per-component concern.
- Verified the design package's implied desktop minimum width: 240 sidebar + 280 left + flex centre + 320 right = ~1200 px wanted at the high end, but the package renders sample screens at smaller widths with proportional shrink. 1024 px is the user-confirmed cutover; the centre flex absorbs the squeeze. The Grillen 3-column timer grid drops to 2 columns at the 1024 px end via a component-scoped breakpoint inside `BigTimerCard`'s wrapper; this keeps cards readable without reaching for a 1280 px floor.
- Verified that `grilladen` table and `GET /api/grilladen` surface enough fields for a useful history list (`name`, `status`, `started_at`, `ended_at`, `target_finish_at`, `position`, `updated_at`, `deleted_at`). Confirmed `src/lib/sync/pull.ts` maps those into the IDB `GrilladeRow` shape (`startedEpoch`, `endedEpoch`, `deletedEpoch`) and already brings finished Grilladen down on every foregrounding, so the list stays fresh without new API calls. Detail item rows require the existing `GET /api/grilladen/{id}/items?since=...` endpoint unless the row has embedded local `session.items`.
- Round 0 research confirmed the approach: SvelteKit's layout model supports root-level app chrome, MDN documents `matchMedia()` plus the `change` event as the correct browser primitive for viewport changes, and sidebar UX guidance for web apps puts labelled sidebars in the 220-260 px range while avoiding sidebars on mobile. The spec keeps the desktop sidebar at 240 px and preserves mobile's route-first layout. Sources: https://svelte.dev/docs/kit/routing, https://developer.mozilla.org/en-US/docs/Web/API/Window/matchMedia, https://developer.mozilla.org/en-US/docs/Web/API/MediaQueryList/change_event, https://www.alfdesigngroup.com/post/improve-your-sidebar-design-for-web-apps.
- Verified token coverage: `app.css` already carries `--color-bg-base` (#0b0a09), `--color-bg-surface` (#16140f), `--color-bg-surface-2` (#1f1b15), `--color-bg-elev` (#26211a), `--color-accent-default` (#ff7a1a), `--color-ember-dim` (#8a3f0a), `--color-ember-ink` (#1a0a02), and the four status colours. The two missing tokens, `bgPanel` (#100e0b) and `borderHot` (rgba(255,122,26,0.28)), are additive and do not affect any shipped surface.
- Consolidated the `/account` page into the Einstellungen cockpit on both desktop and mobile. The earlier concern that activation emails must deep-link to a standalone `/account` page is resolved by making `/settings?group=account` the single canonical destination; activation emails and any external link target it directly.

Reference reading: SvelteKit layout docs, the existing `260426-redesign-gluehen.md` and `260428-accounts-and-sync.md` specs in this repo.

### Risks

| Risk | Mitigation |
| ---- | ---------- |
| 3-pane Grillen feels cramped at 1024 px | `BigTimerCard` grid drops from 3 cols to 2 cols at <1280 px via component-scoped media query; right pane width caps at 320 px not flex |
| `matchMedia` observer flicker on initial paint | Read the match value once before mount and gate the cockpit/mobile branch in the layout's `<script>` so SSR-less first paint already picks the right tree |
| iPad rotation while session is running drops state | The layout switch is component-tree pivot only; route stores (`grilladeStore`) live above the pivot and survive the swap |
| Grilladen history filters client-side, fetching every Grillade ever | `pull.ts` already bounds responses by the `since` watermark; total per-user volume is small (one Grillade per cookout), no pagination needed for the foreseeable future |
| New atoms collide with existing component names | Atoms named `Sidebar`, `AccountChip`, `SectionHeader`, `Toast`, `SyncChip` are not currently used in `src/lib/components/`; verified before naming |
| Sidebar mounts on auth pages before login completes | Layout shell checks `authStore.isAuthenticated` and a `publicPage` derivation; pre-auth pages render unchromed regardless of viewport |

### Implementation Plan

The phases are ordered foundation, then atoms, then responsive shell, then desktop screens in sidebar order, then mobile and auth surfaces, then visual reconciliation. Tests live in the Testing section, not inline in phases.

**Phase 1: Tokens and superseded-spec marker**

- [x] Extract the design package once at the start of implementation: `rm -rf .tmp/grillmi-design && mkdir -p .tmp/grillmi-design && unzip -q Grillmi-Desktop-Mobile2.zip -d .tmp/grillmi-design`. The `.tmp` path is gitignored.
- [x] Add two new tokens to `src/app.css`'s `@theme` block: `--color-bg-panel: #100e0b;` and `--color-border-hot: rgba(255,122,26,0.28);`. Place them adjacent to the existing surface and border tokens. Do not change any existing token value.
- [x] Confirm `resources/specs/260427-ipad-responsive-layout.md` Meta block remains `Status: Superseded by 260428-desktop-cockpit-and-mobile-refinements.md`. Do not delete the file.

**Phase 2: Shared atoms (cockpit chrome and shared primitives)**

- [x] Implement `src/lib/components/Sidebar.svelte` with props `{ items: Array<{ id, label, icon, badge? }>, current: string, onChange: (id) => void, accent? }`. Renders a vertical icon-plus-label list. Active item shows ember tint background, ember icon and label, 3 px ember left bar. Reads accent default from CSS var `--color-accent-default`.
- [x] Implement `src/lib/components/AccountChip.svelte` with props `{ user: { name, email, initials } | null, onSignedInClick, onSignedOutClick, compact? }`. Signed-in: 32 px gradient circle + name/email. Signed-out: outlined "Anmelden" button.
- [x] Implement `src/lib/components/SectionHeader.svelte` with props `{ kicker?, title, action? }`. Kicker is uppercase ember 10 px; title is display-font 22 px uppercase; action is a slot for an optional right-side button.
- [x] Implement `src/lib/components/Toast.svelte` with props `{ msg, action?, onAction?, onClose?, kind: 'info' | 'success' | 'warn', duration: number }` and a self-managed `setTimeout`. Position absolute bottom-centre, z-index above sticky. Animates in via `transform: translateY(8px) -> 0` and `opacity: 0 -> 1` over 180 ms. Calls `onClose` after the timeout so tests and parent state can remove it.
- [x] Implement `src/lib/components/Card.svelte` with props `{ padding?, style? }` and a default child slot. Wraps content in `bgSurface` background, hairline border, 16 px radius, and default padding `20px 22px`, matching `DCard` in `desktop-shared.jsx`.
- [x] Implement `src/lib/components/BigTimerCard.svelte` mirroring `TimerCard.svelte`'s API but rendering at 132 px ring stroke 7 with the desktop-grid layout. Reuses the existing `ProgressRing.svelte`. Same status, label, time, and action props as the smaller card.
- [x] Implement `src/lib/components/TimePickerPopover.svelte` with the same input contract as `TimePickerSheet.svelte` (`value: Date, onConfirm, onCancel`), rendered as a small dropdown anchored under a clicked numeral. Two scrollable columns (hours, minutes) with snap-to-centre. ESC or outside-click closes without committing. Width 240 px, height 320 px, 8 px radius.
- [x] Implement `src/lib/components/SyncChip.svelte` with no props. Reads queue length via a 1 s mounted poll using `listSyncQueue()` and reads last pull via `getSyncMeta('lastPullEpoch')`. Renders one of three states (synced, pending, offline) with the matching dot colour and German label. Returns null while polling has not yet produced a first value (avoids flash on mount).
- [x] Implement `src/lib/components/desktop/GrilladeCard.svelte` for the Grilladen list tile, with props `{ grillade, onClick }`. Renders title (or "Grillade vom <date>" fallback), relative date, item count, duration.
- [x] Implement `src/lib/components/desktop/ActivityLog.svelte` for the Grillen right-pane log, with props `{ events: Array<{ kind, itemName, at }> }`. Newest first. Coloured dot per kind.
- [x] Implement `src/lib/components/desktop/PlanSummaryList.svelte` for the persistent left pane on Planen and Grillen, with props `{ items, statusByItem? }`. Read-only; renders name plus cook time per row, plus an optional status dot when `statusByItem` is provided.

**Phase 3: Responsive layout shell**

- [x] Implement `src/lib/runtime/viewport.svelte.ts` exposing a singleton rune `viewport` with `{ isDesktop: boolean }`. Initialises from `matchMedia('(min-width: 1024px)').matches` synchronously, then attaches a listener that updates the rune on change. Tear-down removes the listener.
- [x] Update `src/routes/+layout.svelte` to import the viewport rune and the new `Sidebar.svelte` and `AccountChip.svelte`. When `viewport.isDesktop && authStore.isAuthenticated && !publicPage`, render a two-column grid (240 px sidebar plus flex content) with `<Sidebar>` and `<AccountChip>` mounted in the sidebar; otherwise render the existing single-column tree. The pre-auth pages (`/login`, `/set-password`, `/forgot-password`) render unchromed regardless of viewport.
- [x] Add the sidebar `current` mapping in `+layout.svelte`: derive from `page.url.pathname` so `/grillen` and `/session` both map to "cook" (the unified Grillen entry, see Phase 5), `/chronik` to "chronik", `/settings` to "settings". The fallthrough default is "cook" so the home route at `/` highlights the Grillen entry. `onChange` calls `goto(...)` with the matching path; the cook target depends on Session state per Phase 5.
- [x] Add the LIVE badge logic to the Grillen sidebar item: read `grilladeStore.session` truthiness and pass a `badge: 'LIVE'` to the `Sidebar` items array when a Session is running.
- [x] Mobile authenticated header band is out of scope (see Out of scope: SyncChip mounting). The mobile layout renders the route content directly without an extra header.

**Phase 4: Home redirect (desktop / to /grillen)**

- [x] Add a `$effect` in `src/routes/+layout.svelte` that redirects to `/grillen` whenever `showDesktopShell && pathname === '/'`, so the Grillen cockpit is the canonical landing page on desktop.
- [x] Add `grilladeStore.resetDraft()` so any caller that wants a fresh Grillade can reset the plan and persist it before navigating into Grillen.
- [x] Keep `src/routes/+page.svelte` mobile-only: the desktop branch renders nothing because the layout redirects before the page ever shows.

**Phase 5: Grillen unified cockpit (desktop `/grillen` and `/session`)**

This phase replaces the earlier split between Planen and Grillen. Both routes render the same `DesktopCockpit.svelte` component on desktop. Mobile branches in each route stay as today.

- [x] Add the `placement: 'top' | 'bottom'` prop to `AlarmBanner.svelte`. Default `'bottom'` preserves mobile behaviour; desktop passes `'top'`.
- [x] Add the `size: 'desktop'` prop to `MasterClock.svelte` switching the inner numeral classes between 76 px (mobile) and 88 px / 56 px (desktop).
- [x] Add the `size: 'lg'` variant to `TimerCard.svelte` for the 132 px stroke-7 desktop progress ring. Wire the same status colours, label, time, and action props as the mobile size.
- [x] Add the `placement: 'mobile' | 'desktop'` prop to `SessionHeader.svelte`. Desktop placement keeps the wake-lock chip and end-session button inline at the top of the centre pane.
- [x] Ship the desktop split in `src/routes/grillen/+page.svelte` and `src/routes/session/+page.svelte` as separate inline desktop branches (interim shape before Phase 5 cleanup).
- [x] Build `src/lib/components/desktop/DesktopCockpit.svelte`. The component renders one three-pane layout for both pre-start and post-start states. Left rail: `<PlanSummaryList items={session?.items ?? plan.items} statusByItem={session ? itemStatusMap : undefined} />`. Right rail: empty whitespace pre-start, `<AlarmBanner placement="top">` plus `<ActivityLog>` post-start. Centre: pre-start renders the SegmentedControl, eat-time card, items list, AddItemSheet trigger, and Los button; post-start renders `<SessionHeader placement="desktop">`, `<MasterClock size="desktop">`, and a `<TimerCard size="lg">` grid. The component owns the ticker, wakeLock, alarm queue, and end-session lifecycle when a session is live, mirroring the logic currently inlined in `src/routes/session/+page.svelte`.
- [x] Update `src/routes/grillen/+page.svelte` so the desktop branch renders `<DesktopCockpit />` directly, replacing the inlined three-pane wrapper. Mobile branch unchanged. Remove the desktop auto-redirect from `/grillen` to `/session`; the redirect stays for mobile only (the mobile flow still uses two routes). The mobile branch keeps calling `grilladeStore.startSession()` then `goto('/session')`.
- [x] Update `src/routes/session/+page.svelte` so the desktop branch renders `<DesktopCockpit />` directly, replacing the inlined live-cockpit markup. Mobile branch unchanged. The mobile branch keeps the existing ticker, alarm, and wakeLock setup.
- [x] In `+layout.svelte`, collapse the conditional `Planen` + `Grillen` sidebar entries into a single always-on `Grillen` entry. Map `currentSection` so both `/grillen` and `/session` highlight the Grillen entry. The Grillen onChange handler navigates to `/session` if `grilladeStore.session` exists, otherwise to `/grillen`. The LIVE badge on the entry follows `grilladeStore.session` truthiness.
- [x] Mount `AddItemSheet.svelte` as a 480 px right-side drawer on desktop when add-item is triggered (the existing `placement: 'sheet' | 'drawer'` prop). DesktopCockpit passes `placement="drawer"`.
- [x] The activity log reads from the existing `grilladeStore.sessionTimeline` array; verify entries append for every state transition (cooking, resting, ready, plated, started-pending). Keep this outside the persisted `Session` object so `sessionSchema` and the IDB schema do not change.
- [x] When the cockpit transitions from pre-start to post-start (Los click), assert no layout shift in the left rail, no flash of an empty Grillstücke list, and that the centre pane swaps from compose to live state in place.

**Phase 6: Chronik rename (URL and sidebar label)**

- [x] Move `src/routes/grilladen/` to `src/routes/chronik/` via `git mv` and update the page title to `Chronik · Grillmi`, the section header kicker to `Chronik`, and the back-control text to `Zurück zur Chronik`.
- [x] Update `src/routes/+layout.svelte`: rename the sidebar item id from `grilladen` to `chronik`, label `Grilladen` to `Chronik`, and the `currentSection` mapping from `/grilladen` to `/chronik`.
- [x] Update the home page button in `src/routes/+page.svelte` (mobile screen) so the Grilladen secondary CTA reads `Chronik` and navigates to `/chronik`.
- [x] Rename `tests/e2e/a11y.spec.ts::test_axe_core_clean_on_grilladen` to `test_axe_core_clean_on_chronik` and update the navigated path to `/chronik`. Backend API paths under `/api/grilladen` stay unchanged.

**Phase 7: Chronik list and detail (route `/chronik`)**

The route was originally introduced as `/grilladen`; Phase 6 renamed it to `/chronik`. The list and detail content live here. Most of this work shipped under the old name and remains valid against the new route.

- [x] Create the SvelteKit route at `src/routes/chronik/+page.svelte` and `src/routes/chronik/+page.ts`. The page rune reads from `grilladenHistoryStore` and renders either the list view or the detail view based on a local `selectedId: string | null` state.
- [x] Leave `src/routes/+layout.ts` public-path handling unchanged; `/chronik` is authenticated automatically because it is not `/login`, `/set-password`, or `/forgot-password`.
- [x] Implement `src/lib/stores/grilladenHistoryStore.svelte.ts` exposing a `finished` derived list filtered to `status === 'finished' && deletedEpoch === null`, sorted by `endedEpoch desc`. The store exposes `refresh()`, `isSaved(id)`, `toggleSaved(id)`, `getNote(id)`, and `setNote(id, value)` backed by the local-only sync-meta keys from Data Model Substitutions. The store name keeps `grilladenHistory` because it reads the unchanged `grilladen` IDB store.
- [x] Implement the list view in `src/routes/chronik/+page.svelte` using `<GrilladeCard>` tiles in a CSS Grid (`grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`). Cards keep the package's saved-star slot and saved border treatment; ordering stays `endedEpoch desc`.
- [x] Implement the detail view in `src/routes/chronik/+page.svelte` showing the header (title, date, duration, item count), metric tiles, a two-column body (items/note card left, actions right), "Erneut grillen", saved toggle, note edit/add, and package-matching delete confirmation controls.
- [x] Add `src/lib/stores/grilladenHistoryStore.svelte.ts` helper `loadItems(grilladeId)` that returns embedded `row.session.items` when present; otherwise it calls `apiFetch('/api/grilladen/{id}/items?since=1970-01-01T00:00:00Z')`, maps server item rows back to `PlannedItem` fields using the same timing-data lookup pattern as `favoriteFromServer()` in `src/lib/sync/pull.ts`, and reports a typed offline/error state when fetch fails.
- [x] Implement "Erneut grillen": copy the past Grillade's loaded items into a fresh plan via a new `grilladeStore.loadFromPastGrillade(grilladeId)` action that reads through `grilladenHistoryStore.loadItems()`, builds a new draft plan with the same item rows verbatim where local data exists and reconstructed specs where server rows are fetched, and navigates to `/grillen` (the Grillen cockpit pre-start state). Toast on success.
- [x] Implement package-matching local-only saved and note controls in the Chronik detail action column: star/save toggle, `Notiz hinzufügen` / `Notiz bearbeiten`, textarea placeholder `Wie war's? Was würdest du anders machen?`, primary `Speichern`, ghost `Abbrechen`, and the saved `Gespeichert` metadata pill.
- [x] In the Chronik detail view, when `loadItems(grilladeId)` reports offline/error and no embedded items exist, render "Details offline nicht verfügbar", keep the metadata header visible, and disable "Erneut grillen"; delete remains available because it only needs the Grillade id and the sync queue.
- [x] Implement "Löschen": add `grilladeStore.softDelete(id)` that calls `deleteGrillade(id)` locally, enqueues `PATCH /api/grilladen/{id}` with a server wire payload containing `deleted_at` set to the current ISO timestamp, refreshes `grilladenHistoryStore`, and returns to the list. Toast on success.
- [x] Empty state: when `grilladenHistoryStore.finished.length === 0`, render the dashed "Noch keine Grilladen abgeschlossen" card with a secondary CTA "Neue Grillade planen" to `/grillen`.
- [x] Below 1024 px the route renders the same data in a single-column layout: stacked cards, full-width detail. Use the existing component-scoped CSS pattern; no separate mobile component.

**Phase 8: Einstellungen (desktop /settings)**

- [x] Implement `src/lib/components/desktop/SettingsCockpit.svelte` with the package's `220px 1fr` shell, `24px 14px` rail padding, and `36px 48px` body padding. Group state lives in the component as a `$state` rune.
- [x] Update `src/routes/settings/+page.svelte` to branch on `viewport.isDesktop`. Desktop: render `<SettingsCockpit>` with the five package group bodies ("Signale & Alarme", "Darstellung", "Einheiten & Sprache", "Geräte", "Konto & Datenschutz"). Mobile: render the existing settings page unchanged.
- [x] The Signale & Alarme body wires existing sound settings into Wenden-Signal, Fertig-Signal, Auflegen-Erinnerung, Wenden-Vorlauf, and Fertig-Vorlauf rows.
- [x] The Darstellung body renders Theme, Akzentfarbe swatches, Dichte, and Fortschrittsringe zeigen in package row geometry. Unsupported values render disabled but occupy the package's exact space.
- [x] The Einheiten & Sprache body renders Masssystem, Temperatur, and Sprache segmented controls in package row geometry. Unsupported values render disabled but occupy the package's exact space.
- [x] The Geräte body fetches `GET /api/auth/sessions` on mount and renders the device list with per-row revoke. Reuses the same `apiFetch` and store wiring as `/account` today.
- [x] The Konto & Datenschutz body shows the 56 px avatar, user name/email, "Passwort ändern" button, "Daten" subsection, disabled "Daten exportieren" and "Grilladen löschen" buttons, "Abmelden", and "Konto löschen" in package geometry. Same account API logic as `/account` today.
- [x] Sidebar account-chip click navigates to `/settings?group=account`. The `SettingsCockpit` reads the search param on mount and preselects "Konto & Datenschutz".

**Phase 9: Auth surfaces (re-skin dropped, account consolidated)**

- [x] Keep `src/routes/login/+page.svelte`, `src/routes/set-password/+page.svelte`, and `src/routes/forgot-password/+page.svelte` on their existing markup. Re-skin against design tokens is out of scope for this spec.
- [x] Remove `src/routes/account/+page.svelte`. The Konto and Geräte rows live entirely in the Einstellungen cockpit on desktop and in the existing settings page on mobile.
- [x] Wire the `AccountChip` signed-in click to `goto('/settings?group=account')` so the desktop entry point preselects the Konto group.
- [x] Run `pnpm test` and `pnpm test:e2e` to confirm `tests/e2e/auth.spec.ts` and the rest of the existing auth coverage still pass against the unchanged markup and the consolidated account surface.

**Phase 10: Mobile refinements**

- [x] Keep `src/lib/components/AlarmBanner.svelte`'s existing `count` prop behaviour for the mobile `+N` badge and add the desktop `placement: 'top' | 'bottom'` prop from Phase 6. Pass `count={visibleAlarms.length}` from both mobile and desktop alarm callers.
- [x] Update `src/routes/grillen/+page.svelte` mobile manual-mode rendering so that when only one item is in the plan the single card spans the full row width; two-or-more items use the existing two-column grid.
- [x] SyncChip mount is out of scope (see Out of scope: SyncChip mounting). The component still ships in `src/lib/components/SyncChip.svelte` and is listed in the Cleanup follow-ups in `CONTEXT.md`.

**Phase 11: Visual reconciliation (one-shot, no recurring pipeline)**

- [x] Extract the design package once at the start of implementation into `.tmp/grillmi-design/` (Phase 1 step). The package zip stays at the repo root for reproducibility.
- [x] Capture one-shot Playwright screenshots of the design package and the running app at the desktop and mobile viewports during implementation. Captures live under `.tmp/visual-diff/` and `.tmp/pixel-verify/`.
- [x] Reconcile the captures by eye and tighten obvious mismatches in token colours, padding, and font sizes. The diff is informal; no `pixelmatch` gate, no recorded masks, no `test:visual-design` script.
- [x] Run the full test suite (`pnpm test` and `pnpm test:e2e`) at the end of implementation to confirm nothing regressed.

**Phase 12: Cleanup (intentionally minimal)**

- [x] Confirm `260427-ipad-responsive-layout.md` Meta block carries the superseded marker added in Phase 1.
- [x] Leave `.tmp/grillmi-design/`, `.tmp/visual-diff/`, and `.tmp/pixel-verify/` on disk. They are gitignored, the package zip is committed at the repo root for reproducibility, and the captures are useful as a manual reference for follow-up visual work.
- [x] No formal sign-off step: the user uses the app daily and signs off implicitly by accepting the shipped behaviour.

---

## Testing

Tests are implementation tasks. The implementer writes and passes each one. The Manual Verification section at the end is a single block executed by Marco after every other task is green.

### Unit Tests (`tests/unit/`)

The following unit tests cover the behaviour this spec depends on or introduces. All run via `pnpm test`.

- [x] `tests/unit/grilladenHistoryStore.test.ts` covers Chronik filtering, soft-delete exclusion, ordering by `endedEpoch desc`, embedded vs server-fetched item loading, offline-state reporting, and the soft-delete-on-init repair for finished rows missing an item snapshot.
- [x] `tests/unit/scheduler.test.ts` covers the pure scheduler used by the Grillen cockpit.
- [x] `tests/unit/ticker.test.ts` and `tests/unit/ticker.manual.test.ts` cover the cockpit ticker driving cooking, resting, and ready transitions in auto and manual Modus.
- [x] `tests/unit/alarms.test.ts` covers Vorlauf alarm scheduling, dedup, and dismissal.
- [x] `tests/unit/sessionStore.test.ts` covers Session state mutations driven by the Grillen cockpit.
- [x] `tests/unit/settingsStore.test.ts` covers settings persistence used by the Einstellungen cockpit.
- [x] `tests/unit/syncQueue.test.ts` covers the sync queue used by every cockpit write.
- [x] `tests/unit/db.test.ts` and `tests/unit/db.migration.test.ts` cover the IDB schema and the v3-to-v4 migration that this spec relies on.
- [x] `tests/unit/authStore.test.ts` covers the auth state driving the AccountChip and the public-page guard.
- [x] `tests/unit/favoritesStore.test.ts` covers Favorit add, edit, and delete used inside the AddItemSheet.
- [x] `tests/unit/format.test.ts`, `tests/unit/timings.find.test.ts`, `tests/unit/timings.schema.test.ts`, and `tests/unit/uuid.test.ts` cover supporting utilities.

### Component Tests (`tests/components/`)

- [x] `tests/components/SessionHeader.test.ts` covers the wake-lock chip, end-session confirm dialog, and the desktop and mobile `placement` variants used by the Grillen cockpit.
- [x] `tests/components/AlarmBanner.test.ts` covers the `count` prop driving the `+N` badge and the `placement: 'top' | 'bottom'` variants.
- [x] `tests/components/MasterClock.test.ts` covers desktop and mobile size variants of the master countdown.
- [x] `tests/components/TimerCard.test.ts` covers the `size: 'lg'` desktop variant and the status-driven colour states.
- [x] `tests/components/PlanItemRow.test.ts`, `tests/components/AddItemSheet.test.ts`, `tests/components/HoldButton.test.ts`, `tests/components/Button.test.ts`, `tests/components/SegmentedControl.test.ts`, and `tests/components/TimePickerSheet.test.ts` cover the shared atoms touched by the cockpit.

### E2E Tests (`tests/e2e/`)

The following end-to-end suites cover the desktop cockpit, the Chronik, the mobile refinements, and the surrounding behaviour this spec must not regress. All run via `pnpm test:e2e`.

- [x] `tests/e2e/cockpit-merge.spec.ts` exercises the unified Grillen cockpit: Grillstücke persist across the pre-start to post-start transition, the sidebar shows the LIVE pill, and there is no separate Planen entry.
- [x] `tests/e2e/home.spec.ts` exercises the `/` home overview on desktop and mobile.
- [x] `tests/e2e/plan-to-session.spec.ts` exercises the start-cooking flow.
- [x] `tests/e2e/manual-mode.spec.ts` and `tests/e2e/manual-alarm.spec.ts` exercise Manuell Modus and per-Grillstück start.
- [x] `tests/e2e/alarms.spec.ts` exercises Vorlauf alarms, dismissal, and ordering.
- [x] `tests/e2e/eating-time-picker.spec.ts` exercises the `Auf Zeit` time picker.
- [x] `tests/e2e/auth.spec.ts` exercises the auth flows (login, logout, password reset, set-password).
- [x] `tests/e2e/sync.spec.ts` exercises the sync queue and pull behaviour.
- [x] `tests/e2e/offline.spec.ts` exercises offline-write enqueue and replay.
- [x] `tests/e2e/resume.spec.ts` exercises resuming a Session after a reload.
- [x] `tests/e2e/migration.spec.ts` exercises the IDB v3-to-v4 migration.
- [x] `tests/e2e/favorites.spec.ts` exercises Favorit add and reuse from the AddItemSheet.
- [x] `tests/e2e/walkthrough.spec.ts` exercises a full plan-to-finish walkthrough.
- [x] `tests/e2e/a11y.spec.ts` covers axe-core accessibility checks on the Chronik route and other key pages.
- [x] `tests/e2e/visual-capture.spec.ts` runs the one-shot visual captures referenced in Phase 11.
- [x] `tests/e2e/menus.spec.ts`, `tests/e2e/pwa-install.spec.ts`, and `tests/e2e/tones.spec.ts` cover surrounding behaviour the cockpit must not regress.

### Manual Verification (Marco)

The automated suite (`pnpm test`, `pnpm test:components`, `pnpm test:e2e`) covers every behavioural assertion in this spec. Manual Verification is reserved for checks that genuinely require human eyes, ears, or touch on a real device. Run against the dev host `https://grillmi.krafted.cc`, not production.

- [x] **Real iPhone PWA at the grill (audible).** Install via A2HS to home screen, open the PWA in standalone mode, start a Grillade with two Grillstücke, and confirm: the Auflegen / Wenden / Fertig tones are audibly distinct and audible over kitchen ambient noise; a queue of two alarms triggers the `+N` badge as the user perceives it; the screen stays awake for the duration of the Session via Wake Lock.
- [ ] **Real iPad rotation on Safari.** Open `https://grillmi.krafted.cc` in landscape. Rotate to portrait while a Session is running; the layout switches to the mobile direction without a page reload and without dropping the running Session. Rotate back to landscape; the desktop cockpit returns and the Session continues uninterrupted.
- [x] **Real Mac Safari fullscreen aesthetics.** Open `https://grillmi.krafted.cc` in Safari fullscreen on Retina at 1440×900 or higher. Verify the visual feel: ember accent reads correctly, display-font hero looks right at 56 px, sidebar typography is balanced, no scrollbar artefacts on the cockpit, dark theme has no off-tone surfaces. This is a judgement call about feel, not a pixel diff.
- [x] **Audible tone selection across devices.** In Einstellungen → Signale & Alarme, cycle through the available tones (Glut, Funke, Kohle, Klassik, Lautlos) on Mac speakers and on the iPhone PWA. Each tone preview is audibly distinct; Lautlos is genuinely silent; the chosen tone is what fires during a real cook on the iPhone.
