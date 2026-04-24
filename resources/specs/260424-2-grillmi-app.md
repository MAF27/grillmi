# Grillmi v1 — Application

## Meta

- Status: Draft
- Branch: feature/grillmi-app

---

## Business

### Goal

Build the Grillmi v1 PWA: a multi-timer BBQ companion that lets Marco plan a session with a target dinner time, runs a scheduler that computes put-on times for every item so everything finishes at once, and fires put-on / flip / done alarms during the cook. The app runs offline after first install, on an iPhone via home-screen install, and serves from the static infrastructure defined in Spec 1.

### Proposal

Ship a SvelteKit 2 + `adapter-static` PWA using Svelte 5 Runes for state, Tailwind 4 CSS-first tokens for styling, IndexedDB for persistence, and a built-in SvelteKit service worker with Workbox cache strategies for offline. The app covers three primary screens — Home/Favorites, Plan, live Session — plus Settings. It compiles the authored grill-timings reference markdown into a typed JSON data file at build time, drives a pure-JS scheduler from that data, and fires audio + haptic + banner alarms when events land. No backend, no server-scheduled push, no account system.

### Behaviors

**Planning a session**

- User opens the app, taps "Neue Session". Plan screen appears.
- User sets a target finish time via the native `<input type="time">`-backed picker. Default is "in 60 minutes" on first open of a session, preserved from the last-used time thereafter.
- User taps "Gericht hinzufügen". A bottom sheet appears with five cascading steps: Category → Cut → Thickness (0.5–6 cm in 0.5 cm steps) → Doneness → optional Label. Tap auto-advances except on Thickness and Label which have explicit "Weiter".
- Computed cook time appears at the bottom of the sheet and updates live as inputs change.
- Added items show in the Plan list as rows. Drag-to-reorder, swipe-left to delete.
- The "Go" button at the bottom is disabled until at least one item is added and a target time is set; label then reads "Los — Essen um HH:MM".
- "Als Favorit speichern" button appears once at least one item is added; prompts for a preset name.

**Running a session**

- Pressing Go transitions to the Session screen. The plan list animates into a session with per-item cards in their starting states.
- Master clock at the top shows time-until-dinner; it sticks and never scrolls off.
- Items start in `pending`. Each has a scheduled put-on time computed by the scheduler. When a put-on time arrives, an AlarmBanner fires, a chime plays, haptics fire, and the card transitions to `cooking`.
- During `cooking`, a progress ring fills and the next event is labelled ("Wenden in 4:30" when a flip is pending, "Fertig in 8:12" when no flip remains).
- Flip alarms fire at the configured flip percentage of total cook time (default 50%, per-cut override from the reference data). Main cook timer does NOT pause — flip is a banner + chime, nothing more.
- When cook completes, card transitions to `resting` (if rest time > 0) or directly to `ready`. Rest time is pulled from the reference data per cut.
- When rest completes, card transitions to `ready` with a subtle glow and a green done chime.
- User swipes right on a Ready card to mark it `plated`. Card animates down into the Plated group (collapsed by default).
- "Session beenden" requires a 500 ms hold to prevent accidental taps.

**Alarms and sounds**

- Three alarm events: put-on, flip, done. Each has an independently-selectable chime from a curated library of 8–10 sounds shipped with the app.
- All alarms trigger: a 3-second chime, a banner, and a haptic impact. User can tap the banner to dismiss; it auto-dismisses after 8 s.
- Multiple simultaneous events queue; one banner at a time.

**Favorites**

- Favorites screen shows saved presets from IndexedDB. Each card: name, item summary ("3 Cervelat, 2 Peperoni, 1 Maiskolben"), last-used date.
- Tap a favorite → Plan screen pre-populated with the saved items (user still adjusts target time, then presses Go).
- Long-press on a favorite → Umbenennen / Löschen action sheet.

**Settings**

- Theme: System / Hell / Dunkel (segmented control).
- Sound picker per event (put-on / flip / done).
- "Über Grillmi": version, GitHub/contact link, data-reference credits.

**Persistence**

- Active session state (items, scheduled times, current states) persisted to IndexedDB every state change, so refreshing the page or recovering from a crash restores the live session.
- Favorites persisted to IndexedDB.
- User preferences (sounds, theme) persisted to IndexedDB.

**Offline and installability**

- After first load the app is fully offline: UI, data, sounds all cached.
- Manifest + icons + `theme_color` enable home-screen install on iOS and Android.
- First-run notice explains: the screen must stay on during a session. The app holds a Wake Lock while Session is active (iOS 18.4+, Android Chrome); a persistent banner in the Session header confirms the Wake Lock status — green "Bildschirm aktiv" when held, red "Bildschirm kann sperren" if the Wake Lock request was denied.

### Out of scope

- Pause & resume (pull an item, return it later). Deferred to v1.1.
- Multi-flip per cut (reverse-sear cuts that need every-60s flipping). All cuts use a single flip at the configured percentage in v1; reverse-sear cuts fall back to a single flip at 50% and a Notes field on the card warns "ideal: flip every 60 s". Full multi-flip scheduling lands in v1.1.
- Live timer drift auto-recalculation — if an item runs long, dinner is late; user handles it.
- Meat-thermometer integration (MEATER etc).
- Voice commands, Apple Watch companion.
- Push notifications or any server component.
- Grate-capacity modelling (assume infinite grill).
- Session history / analytics beyond what favorites implicitly capture.
- Languages other than German.
- Grill types other than gas.
- Altitude / wind adjustments (flagged in the timings reference as out-of-scope for v1).
- User accounts, cross-device sync, sharing.

---

## Technical

### Approach

SvelteKit 2 application configured with `@sveltejs/adapter-static` to emit a pure static SPA. Svelte 5 Runes (`$state`, `$derived`, `$effect`) handle reactivity; shared stores live under `src/lib/stores/`. TypeScript strict mode, Tailwind 4 via the Vite plugin with tokens in a single `src/app.css` `@theme` block, Prettier matching azooco conventions. Vitest + `@testing-library/svelte` for unit and component tests; Playwright for end-to-end. A thin SvelteKit `src/service-worker.ts` uses Workbox 7 primitives to precache the app shell and the compiled data JSON, and to cache sound files on first play.

The **grill-timings pipeline** lives at `scripts/build-timings.ts`. It parses `resources/docs/grill-timings-reference.md` at build time into a typed JSON file at `src/lib/data/timings.generated.json`, validated by a Zod schema at `src/lib/data/timings.schema.ts`. The schema captures category → cut → (thickness × doneness) → cook duration (seconds), flip fraction (default 0.5), rest duration (seconds), heat zone and notes. Vite's build fails if parsing fails or the schema does not validate — no silent fallbacks.

The **scheduler** (`src/lib/scheduler/schedule.ts`) takes a session (items + target time + rest policy) and returns, per item, an absolute put-on time and the event timeline (put-on, flip-at-t, done-at-t). The rest duration is subtracted from the target: a 10 min-rest steak aiming for 19:30 has its done-at = 19:20, put-on = 19:20 minus cook-time. Pure function, fully unit-testable, no side effects.

The **timer runtime** (`src/lib/runtime/ticker.ts`) is a single `requestAnimationFrame` loop that, on every frame, compares `Date.now()` against each timer's event list and emits state transitions. We never accumulate deltas — on every frame we recompute "what state should each item be in?" from the absolute wall-clock. Tab suspend or backgrounding simply causes the next frame to catch up. A Wake Lock is acquired on session start and released on session end.

**State model**: a single Svelte store `sessionStore` with the current session (or null), plus derived stores for groupings (`cookingItems`, `restingItems`, etc.). Favorites are a separate IndexedDB-backed store. UI components read from stores and dispatch actions — no component mutates store state directly except via the store's own methods.

**Sound library**: 8 MP3s (~50 KB each, 44.1 kHz mono) under `static/sounds/`. Loaded lazily via the Web Audio API on first need, cached by the service worker. Preferences store the current selection per event.

### Approach Validation

- **`resources/docs/stack-research-apr-2026.md`** informs every technology choice — Svelte 5 Runes, `adapter-static`, IndexedDB via `idb`, built-in service worker with Workbox 7, Wake Lock for keeping the screen on during a session, and the explicit acceptance that timed alarms will not fire under screen lock on iOS without a server-side push (which we've scoped out of v1).
- **`resources/docs/ui-architecture.md`** locks the visual direction, design tokens, component inventory, interaction patterns, accessibility checklist, motion guidelines, responsive strategy, and iconography. Implementation follows this document literally where it is specific and uses its principles elsewhere.
- **`resources/docs/grill-timings-reference.md`** is the single source of truth for timings; the build-time pipeline encodes a Svelte-app-friendly derivative. The reference already flags the simplifications we're accepting in v1 (single flip, pork/burger pull-temp defaults).
- **Azooco at `/opt/azooco` on the `azooco-dev` host** is the reference project for Svelte 5 + SvelteKit 2 conventions: Prettier config, folder layout (`src/lib/{components,stores,util,models,schemas,config,constants}`, `src/routes/{…}`, `static/`, `tests/`), test script names, and eslint setup.
- **iOS PWA reality check**: the stack research flagged that iOS PWA audio stops ~30 s into pause under lock and the mute switch silently kills PWA audio. We're accepting this as the v1 floor — Wake Lock keeps the screen on, the user is encouraged to keep the phone unmuted, and we surface the state of the Wake Lock to the user. Future push-notification delivery requires the backend scoped out of v1.
- **Trade-off decided**: single-flip at percentage over a multi-flip event array, per Marco's explicit decision. Reverse-sear thick cuts (≥4 cm Entrecôte, T-Bone, etc.) that ideally flip every 60 s will display a cautionary note but get only one flip alarm in v1. Multi-flip scheduling is a deliberate v1.1 feature.

### Risks

| Risk | Mitigation |
| --- | --- |
| `requestAnimationFrame` stops firing when the tab is hidden or the device is low-power | We recompute from wall-clock on every frame rather than accumulating elapsed time. When the frame loop resumes, the next frame catches up to the correct state. For fully backgrounded tabs where no frames fire, Wake Lock keeps the session in the foreground; if Wake Lock fails, banner warns the user. |
| Wake Lock API denied on some devices / iOS versions | Feature-detect at session start; if denied, the Session header shows the red banner and the first-run notice explicitly warns the user that alarms may be missed. Document the known iOS 18.4+ requirement in Settings → About. |
| iPhone mute switch kills PWA audio — user misses an alarm | Haptics fire regardless of mute. Visual banner is always visible. The "sounds" section of the first-run notice explicitly says "Lautsprecher einschalten, Stummschalter aus". |
| Build-time timings pipeline silently drops a cut | Zod schema enforcement + Vite-failing assertion. A unit test (`test_timings_schema_coverage`) asserts the generated JSON has the expected number of cuts per category — known counts from the reference doc. |
| IndexedDB quota exceeded (e.g. user has many favorites + long session history) | Grillmi's payload is tiny (session objects ~2 KB, favorites <1 KB each); 50 MB ceiling is unreachable with normal use. Still, catch `QuotaExceededError` and surface a Settings-screen "Daten zurücksetzen" option. |
| Rest time pulled from reference doc is wrong for a specific cut | Reference doc was sourced from multiple authorities; treat as authoritative for v1. Settings exposes no per-cut override in v1; deferred to v1.1 if a recipe shows in practice. |
| PWA install prompt misses on iOS Safari (no programmatic trigger) | First-run notice includes an illustrated "Tap Share → Zum Home-Bildschirm" coach-mark that detects iOS Safari and only shows there. |
| Svelte 5 Runes idioms differ from azooco's earlier Svelte 5 patterns | Azooco is our reference; we follow its component patterns where they exist. Where Grillmi needs patterns azooco doesn't have (multi-step bottom sheet, for example), we document the new pattern in `resources/docs/`. |

### Implementation Plan

**Phase 1: Scaffold and tooling**

- [ ] Create SvelteKit 2 app at the project root with TypeScript, Tailwind 4, Vitest, Playwright, ESLint, and Prettier using `pnpm create svelte@latest`. Target Svelte 5 (the default in April 2026).
- [ ] Configure `@sveltejs/adapter-static` in `svelte.config.js` with `fallback: 'index.html'` for SPA routing.
- [ ] Port Prettier config from `/opt/azooco/package.json` verbatim (tabs, tabWidth 2, singleQuote, `semi: false`, `arrowParens: 'avoid'`, `printWidth: 130`, `proseWrap: 'never'`, `bracketSameLine: true`) into the project's `package.json`.
- [ ] Configure ESLint v9 + `eslint-plugin-svelte` matching azooco's `eslint.config.js`.
- [ ] Set up folder layout: `src/lib/{components,stores,util,models,schemas,data,runtime,scheduler,sounds,i18n}`, `src/routes/{+layout.svelte, +page.svelte, plan, session, favorites, settings}`, `static/{sounds,icons,screenshots}`, `scripts/`, `tests/{unit,components,e2e}`.
- [ ] Install `idb`, `phosphor-svelte`, `zod`, `workbox-precaching`, `workbox-routing`, `workbox-strategies`.
- [ ] Seed `src/app.css` with the `@theme` token blocks from `resources/docs/ui-architecture.md` verbatim (colors, typography, spacing, shape, motion, breakpoints, icons).
- [ ] Add `pnpm` scripts: `dev`, `build`, `preview`, `lint`, `format`, `test`, `test:unit`, `test:components`, `test:e2e`, `test:coverage` — mirroring azooco's script names.

**Phase 2: Grill-timings pipeline**

- [ ] Write Zod schema `src/lib/data/timings.schema.ts` covering Category, Cut, Thickness row, Doneness row, cook seconds, flip fraction, rest seconds, heat zone, notes.
- [ ] Write `scripts/build-timings.ts` (TypeScript, executed via `tsx`) that parses `resources/docs/grill-timings-reference.md` section-by-section, maps to schema, emits `src/lib/data/timings.generated.json` + `src/lib/data/timings.generated.d.ts`.
- [ ] Add a `prebuild` npm script that runs the pipeline; fail build if parsing or validation fails.
- [ ] Commit the generated files so the repo is self-consistent; regenerate on every `pnpm build`.
- [ ] Document in `resources/docs/timings-pipeline.md` how to extend the reference markdown with new cuts.

**Phase 3: Data model and IndexedDB**

- [ ] Define TypeScript types in `src/lib/models/`: `Category`, `Cut`, `Thickness`, `Doneness`, `PlannedItem`, `SessionItem`, `Session`, `Favorite`, `SoundAssignment`, `UserSettings`.
- [ ] Zod schemas for each type in `src/lib/schemas/`, exported alongside the inferred TS types.
- [ ] `src/lib/stores/db.ts` — `idb`-wrapped IndexedDB with object stores for `sessions` (key: 'current'), `favorites`, `settings`. Schema versioning + migration stub.
- [ ] `src/lib/stores/sessionStore.ts` — Svelte 5 Runes-based store exposing the current Session, derived groups (pending/cooking/resting/ready/plated), and actions (addItem, removeItem, reorderItem, setTargetTime, startSession, plateItem, endSession). Every action persists to IndexedDB.
- [ ] `src/lib/stores/favoritesStore.ts` — list of Favorite objects, actions save / rename / delete / load-as-plan.
- [ ] `src/lib/stores/settingsStore.ts` — theme, sound assignments, first-run-seen flag.
- [ ] Unit tests for every store's actions.

**Phase 4: Scheduler and timer runtime**

- [ ] Pure `schedule(session: Session): ScheduleResult` in `src/lib/scheduler/schedule.ts`. Inputs: session items, target finish epoch. Output: per-item put-on epoch, flip-at epoch (or null), done-at epoch, resting-until epoch. Accounts for rest time baked-into-target.
- [ ] Unit tests covering: single-item, multi-item (all finishing at once), item with rest time, item with flip, item that would start in the past (overdue — return an `overdue: true` flag so UI can warn).
- [ ] `src/lib/runtime/ticker.ts` — `requestAnimationFrame` loop that compares `Date.now()` against the schedule and dispatches state transitions. Emits synthetic events: `put-on`, `flip`, `done`, `resting-complete`.
- [ ] Wake Lock acquisition on ticker start, release on stop. Feature-detect; fall back to a visible banner that reads "Bildschirm kann sperren" if the API is missing or denied.
- [ ] Unit tests for the ticker's transition logic using a mocked `Date.now()`.

**Phase 5: Home and Plan screens**

- [ ] `src/routes/+page.svelte` — Home/Empty. Entry point with "Neue Session" and "Favoriten" CTAs; three-line inline explainer on first run.
- [ ] `src/routes/plan/+page.svelte` — Plan screen.
- [ ] `src/lib/components/TargetTimePicker.svelte` — wraps `<input type="time">` with a styled trigger button and a relative-time label.
- [ ] `src/lib/components/PlanItemRow.svelte` — card with drag handle, swipe-to-delete, tap-to-edit.
- [ ] `src/lib/components/AddItemSheet.svelte` — bottom-sheet coordinator for the five cascading steps. Cross-fades content inside a fixed-height sheet.
- [ ] Step components: `CategoryPicker`, `CutPicker`, `ThicknessPicker`, `DonenessSelector`, `ItemLabelInput`.
- [ ] "Als Favorit speichern" button on Plan, opens a modal to name the preset; dispatches to favoritesStore.
- [ ] "Go" button, full-width, fixed bottom, disabled state + label as specified.

**Phase 6: Session screen**

- [ ] `src/routes/session/+page.svelte` — live session view.
- [ ] `src/lib/components/SessionHeader.svelte` — MasterClock + Wake-Lock status banner + End-Session HoldButton.
- [ ] `src/lib/components/MasterClock.svelte` — sticky countdown at top.
- [ ] `src/lib/components/TimerCard.svelte` — per-item card with all five states, ProgressRing, next-event label.
- [ ] `src/lib/components/StateGroupHeader.svelte` — collapsible section header per state group.
- [ ] `src/lib/components/AlarmBanner.svelte` — full-width event banner with 8 s auto-dismiss, queueing multiple alarms one at a time.
- [ ] `src/lib/components/ProgressRing.svelte` — SVG ring, progress 0–1, stroke = state token.
- [ ] Swipe-right-to-plate gesture on Ready cards.
- [ ] Route guard: navigating to `/session` when no active session exists redirects to `/plan`.

**Phase 7: Alarms, sounds, haptics**

- [ ] Source or generate 8 chime sounds (licensed or CC0). Place MP3s under `static/sounds/`. Document sources in `resources/docs/sound-credits.md`.
- [ ] `src/lib/sounds/player.ts` — Web Audio API-based playback with lazy loading + preload of currently-assigned sounds at session start.
- [ ] Hook into ticker events: each `put-on`, `flip`, `done` emits → play assigned sound, trigger AlarmBanner, fire haptic via `navigator.vibrate()` on Android + `Taptic Engine` shim on iOS PWA.
- [ ] Per-event sound assignment UI in Settings.

**Phase 8: Favorites screen**

- [ ] `src/routes/favorites/+page.svelte` — list of FavoriteCards, long-press for actions.
- [ ] `src/lib/components/FavoriteCard.svelte`.
- [ ] Load-preset action sets `plan` state to the preset's items and navigates to `/plan`.
- [ ] Rename + delete flows via action sheet.

**Phase 9: Settings screen and first-run**

- [ ] `src/routes/settings/+page.svelte` — Töne, Darstellung, Über Grillmi sections.
- [ ] Theme segmented control bound to `settingsStore.theme`.
- [ ] SoundPicker bottom sheet.
- [ ] `src/lib/components/FirstRunNotice.svelte` — modal shown when `settingsStore.firstRunSeen === false`. Explains: screen stays on via Wake Lock, iPhone mute off for sounds, Share → Add to Home Screen on iOS Safari. Single "Verstanden" button sets the flag.

**Phase 10: PWA manifest and service worker**

- [ ] `static/manifest.webmanifest` with name, short_name, theme_color (ember accent), background_color (bg-base), icons at 192 and 512, `display: standalone`, `start_url: "/"`.
- [ ] App icons: generate 192 and 512 PNGs + maskable variant from a single SVG source (flame + chronometer motif — briefed and delivered via `frontend-design` skill, or commissioned separately; v1 ships placeholder icons if not ready).
- [ ] `src/service-worker.ts` — Workbox 7 precaching for the SvelteKit build manifest, runtime caching for `/sounds/*` (cache-first, 30-day expiration), `/icons/*` (cache-first, immutable).
- [ ] iOS install coach-mark inside the FirstRunNotice when `navigator.standalone !== true && isIOSSafari()`.
- [ ] Verify installability with Lighthouse PWA audit — green score.

**Phase 11: Accessibility, motion, responsiveness polish**

- [ ] Go through every checklist item in `resources/docs/ui-architecture.md` §5 and check off in that document (or copy to `resources/specs/260424-2-grillmi-app.md` as an appendix).
- [ ] Apply motion guidelines from ui-architecture §6 to each transition.
- [ ] Test on iPhone Safari (primary), Android Chrome, iPad Safari, desktop Chrome/Safari/Firefox at the three breakpoints.
- [ ] Run axe-core in CI via a Playwright test.

**Phase 12: Deploy**

- [ ] Commit and push the current state from `grillmi-dev` to `origin main` on alcazar.
- [ ] `ansible-playbook playbooks/applications/grillmi-deploy.yml --limit grillmi_dev` — pulls on `grillmi-dev`, installs deps, builds, reloads Caddy. Serves on `grillmi.krafted.cc`.
- [ ] Manual verification against the dev URL end-to-end (full flow: plan 3 items, run session, hit alarms, plate).
- [ ] `ansible-playbook playbooks/applications/grillmi-deploy.yml --limit grillmi_prod` — same pipeline on `grillmi`, serves `grillmi.cloud`.
- [ ] Install on Marco's iPhone, run a real BBQ, tag `v1.0.0`, push tag to alcazar.

---

## Testing

### Unit Tests (`tests/unit/*.test.ts`)

- [ ] `timings.schema.test.ts`:
  - `test_timings_schema_validates_generated_json` — the generated JSON validates against the Zod schema.
  - `test_timings_schema_rejects_missing_required_field` — schema errors on missing `cookSeconds`.
  - `test_timings_schema_category_count` — expected 7 categories present.
- [ ] `scheduler.test.ts`:
  - `test_schedule_single_item_aligns_put_on_to_target_minus_cook_minus_rest` — simple target-align math.
  - `test_schedule_multi_item_all_finish_at_target` — three items with different cook times all land at the same target epoch.
  - `test_schedule_with_rest_time_baked_in` — a 10 min-rest steak has done-at = target - 10 min.
  - `test_schedule_flip_at_50_percent_default` — flip epoch is at put-on + (cook / 2).
  - `test_schedule_flip_at_cut_override` — per-cut flip fraction respected.
  - `test_schedule_overdue_item` — target too close for longest item; returns `overdue: true`.
- [ ] `ticker.test.ts`:
  - `test_ticker_transitions_pending_to_cooking_at_put_on` — mocked `Date.now()` crosses put-on.
  - `test_ticker_emits_flip_event_once` — flip fires exactly once.
  - `test_ticker_transitions_cooking_to_resting_at_done` — when rest > 0.
  - `test_ticker_transitions_cooking_to_ready_when_no_rest` — when rest = 0.
  - `test_ticker_transitions_resting_to_ready` — at resting-until epoch.
- [ ] `sessionStore.test.ts`:
  - `test_add_item_persists_to_idb`, `test_remove_item_persists_to_idb`, `test_reorder_item_persists_to_idb`, `test_start_session_computes_schedule`, `test_plate_item_moves_to_plated_group`, `test_end_session_clears_current`.
- [ ] `favoritesStore.test.ts`:
  - `test_save_favorite`, `test_rename_favorite`, `test_delete_favorite`, `test_load_favorite_as_plan`.
- [ ] `settingsStore.test.ts`:
  - `test_theme_persists`, `test_sound_assignment_persists`, `test_first_run_flag_persists`.

### Component Tests (`tests/components/*.test.ts`)

- [ ] `TimerCard.test.ts`:
  - `test_renders_pending_state_with_state_color`, `test_renders_cooking_state_with_progress_ring`, `test_renders_alarm_firing_state_with_pulse`, `test_swipe_right_fires_on_plated_callback_in_ready_state`, `test_swipe_right_noop_in_other_states`.
- [ ] `AddItemSheet.test.ts`:
  - `test_cascading_steps_advance_on_tap`, `test_back_chevron_returns_to_previous_step`, `test_thickness_stepper_clamps_to_min_max`, `test_final_step_dispatches_new_item_with_computed_cook_time`.
- [ ] `MasterClock.test.ts`:
  - `test_renders_time_remaining_monospace`, `test_warning_state_below_15_min`, `test_critical_state_below_5_min`.
- [ ] `AlarmBanner.test.ts`:
  - `test_renders_message`, `test_auto_dismiss_after_8s`, `test_tap_dismisses`, `test_queue_processes_sequentially`.
- [ ] `PlanItemRow.test.ts`:
  - `test_swipe_left_reveals_delete`, `test_tap_opens_editor`, `test_drag_handle_emits_reorder_event`.

### E2E Tests (`tests/e2e/*.spec.ts`)

- [ ] `plan-to-session.spec.ts`:
  - `test_full_plan_flow_single_item` — open app → new session → add Entrecôte 3 cm medium → set target → Go → see Session screen with one pending card.
  - `test_full_plan_flow_multi_item` — three items with varied cook times → Go → all put-on epochs are correct relative to target.
- [ ] `alarms.spec.ts`:
  - `test_put_on_alarm_fires_at_scheduled_time` — with a sped-up mocked clock, verify the banner + sound + haptic.
  - `test_flip_alarm_does_not_pause_main_timer` — main countdown keeps decrementing across the flip event.
- [ ] `favorites.spec.ts`:
  - `test_save_and_reload_favorite` — save a session as favorite, navigate to Favorites, tap it, see the Plan pre-populated.
- [ ] `offline.spec.ts`:
  - `test_app_loads_offline_after_first_visit` — install / cache, disable network, reload, app works.
- [ ] `pwa-install.spec.ts`:
  - `test_manifest_present`, `test_service_worker_registers`, `test_lighthouse_pwa_passes`.
- [ ] `a11y.spec.ts`:
  - `test_axe_core_clean_on_home`, `test_axe_core_clean_on_plan`, `test_axe_core_clean_on_session`, `test_axe_core_clean_on_favorites`, `test_axe_core_clean_on_settings`.

### Manual Verification (Marco)

- [ ] Open `https://grillmi.krafted.cc` on your iPhone in Safari. Tap Share → "Zum Home-Bildschirm". Open the installed icon. The first-run notice explains the screen-on behavior and mute-switch caveat clearly.
- [ ] Create a plan with four items of different cook times, set target for 30 min in the future, press Go. The Session screen shows four pending cards and a sticky master clock counting down.
- [ ] As put-on alarms fire, each card transitions to cooking with an audible chime and a visible banner.
- [ ] When a flip alarm fires, the main timer on that card keeps counting down without pausing — visually confirm the number keeps decrementing through the flip banner.
- [ ] Swipe a Ready card right → green confirm appears → card animates down into the Plated group.
- [ ] Save the plan as a favorite during planning. Navigate to Favorites, tap it, see the Plan pre-populated with the same items.
- [ ] Run the app in direct midday sun on the balcony. State colors (pending / cooking / resting / ready) are distinguishable without squinting.
- [ ] Operate the app one-handed on an iPhone while holding a beer. Thickness stepper buttons are reachable with the thumb; cards respond to swipes without needing a second hand.
- [ ] Put the iPhone down on the grill table screen-up with the app open in Session. The screen stays on for the full session duration — Wake Lock banner stays green.
- [ ] Toggle the iPhone mute switch on during a session. Chimes stop but haptics + visual banner still fire (confirm this).
