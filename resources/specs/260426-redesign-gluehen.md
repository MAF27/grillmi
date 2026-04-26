# Glühen Redesign

## Meta

- Status: Reviewed
- Branch: feature/gluehen

---

## Business

### Goal

Replace the current Grillmi UI with a pixel-faithful Svelte implementation of Claude Design's "Glühen" handoff in `Grillmi.zip`. The state machine, data model, scheduler, and feature surface stay where they are. The tokens, typography, layout, motion, and a handful of UX moves change. The result should match the bundled prototype before it is treated as done.

### Proposal

Adopt the high-fidelity dark "Glühen" direction across every user-facing screen as a single feature-branch cutover. The canonical reference is the Claude Design bundle at repo root: `Grillmi.zip`, specifically `design_handoff_grillmi_redesign/README.md`, `design_handoff_grillmi_redesign/design/Grillmi Redesign.html`, and `design_handoff_grillmi_redesign/design/direction-a.jsx`. Tokens get rewired to the ember-on-charcoal palette with editorial Barlow Condensed numerals; Home gains a hero glow and recent-Menü strip; Plan grows a unified three-way mode segmented control with manual mode living entirely on Plan; Session moves to a big-rings grid with a pulsing bottom-pinned alarm banner; Settings consolidates eight chimes down to five named tones with bespoke audio. Saved menus get renamed from "Plan-Vorlage" to "Menü" with the route moving from `/plans` to `/menus`.

### Fidelity contract

1. `Grillmi.zip` is the source of truth for color, typography, spacing, radius, motion, and screen composition. If this spec and the bundle disagree on a visual detail, the bundle wins unless this spec explicitly calls out a deliberate product deviation.
2. The implementation translates the prototype into the existing Svelte/SvelteKit app. Do not port the prototype's React state hooks, mock data, `ios-frame.jsx`, `design-canvas.jsx`, or `tweaks-panel.jsx` into production.
3. Pixel-perfect means the rebuilt app is visually indistinguishable from the Direction A prototype at the primary 390 px mobile viewport for all covered screens. Acceptable drift is at most 4 px for spacing and alignment, no perceptible color mismatch, no typography weight or family mismatch, and no missing motion on alarm state. Dynamic values such as countdown seconds may differ; those values are masked or frozen during visual comparison.
4. Before implementation starts, extract the bundle to a deterministic local folder excluded from production code: `rm -rf .tmp/grillmi-design && mkdir -p .tmp/grillmi-design && unzip -q Grillmi.zip -d .tmp/grillmi-design`. Serve `.tmp/grillmi-design/design_handoff_grillmi_redesign/design/` with a local static server when taking prototype screenshots.
5. Each major screen must be checked against a prototype screenshot before its phase is marked complete: Home, Plan empty, Plan filled, Plan manual, AddItem category, AddItem cut, AddItem specs, Session with alarm, Menüs, and Settings with a tone row expanded.

### Behaviors

#### Home

1. The screen background paints a dark charcoal with an ember radial glow concentrated in the lower 60% and faint diagonal grill-grates layered over it. Content floats over the glow.
2. The wordmark "GRILLMI" reads in the condensed display font, all caps, with a small flame glyph in ember next to it.
3. The hero copy reads "Bereit zum Grillen?" with "Grillen?" tinted in the ember accent.
4. A horizontal-scroll strip below the hero shows the user's most-recent saved Menüs as compact pill cards. Each pill renders the Menü name and a meta line in the form "X Stück · Y min". Tapping a pill loads the Menü into Plan and navigates to `/plan`. The strip's eyebrow reads "Zuletzt gespeicherte Menüs". When the user has zero saved Menüs the eyebrow plus strip do not render at all.
5. A primary "Neue Session" CTA spans full width above two secondary buttons "Menüs" and "Einstellungen" arranged side by side.
6. When the browser reports the app is installable a small dismissible chip reading "App installieren" appears above the hero. Tapping the chip triggers the install prompt; tapping its close glyph hides the chip for the rest of the session and persists the dismissal so it does not re-appear on the next launch.

#### Plan

1. The screen header reads "Session planen" in the condensed display font with a back chevron returning to Home.
2. A unified three-way segmented control replaces today's pair of mode toggles. The segments read "Jetzt", "Auf Zeit", and "Manuell". Active segment carries the ember background with near-black ink; inactive segments are transparent with body text.
3. In "Jetzt" and "Auf Zeit" mode an eating-time card sits below the segmented control. Empty state shows a dim "––:––" with eyebrow "Noch keine Zielzeit" and a secondary line "Füg ein Grillstück hinzu, wir rechnen zurück." Filled state shows the eating time as a massive condensed numeral with eyebrow "Fertig um", a meta line "Start HH:MM" computed from the longest cook, and a hairline radial highlight in the top-right of the card. Tapping the populated card opens the new eating-time picker (see below).
4. In "Manuell" mode the eating-time card does not render. Instead the items list switches to a two-column grid of timer cards reusing the Session card layout. Each card carries a "Los" button while unstarted; once tapped the card transitions through cooking, resting, ready, and finally exposes an "Anrichten" button. The sticky bottom CTA hides entirely in manual mode. Manual mode sessions live and complete entirely on Plan; the legacy `/session` route is unreachable in manual mode and any deep link there bounces to `/plan`.
5. Item rows in "Jetzt" / "Auf Zeit" mode render as a single flex strip per row. The row carries the item name (tap to rename inline), a meta line of specs (tap to re-open the specs step), an iOS-style pill cook-time stepper with minus, the formatted cook time as a tabular condensed numeral, and a plus button. A trailing minus-circle glyph removes the item with a confirmation slide. Swipe-left on the row also reveals delete.
6. When the items list is empty the screen shows a single big dashed card with a circular ember plus glyph, copy "Grillstück hinzufügen", and a one-line hint "Steak, Würstchen, Maiskolben, alles was auf den Rost kommt." When non-empty, an additional add-item button appears at the bottom of the list as a smaller dashed full-width row reading "Weiteres Grillstück".
7. A dashed "Als Menü speichern" button below the list opens a small dialog. The dialog has an empty name field with placeholder "z.B. Sonntagsmenü", a confirm and a cancel button. Confirm saves the current items as a Menü (formerly Plan-Vorlage) and closes. The post-save toast that exists today is removed; the dialog closing is the implicit confirmation.
8. The Plan screen retains the "★ Menü" inline append affordance shipped in the favorit-plan-vorlage split. The button is restyled to match the new visual language and its copy updates from "Plan-Vorlage" to "Menü", but its behavior (tap to open a sheet listing existing Menüs, tap a Menü to append its items to the current plan) does not change.
9. The sticky bottom CTA in "Jetzt" / "Auf Zeit" mode reads "Los, fertig um HH:MM" with the user's eating time interpolated. When the items list is empty the CTA is disabled and reads "Mindestens ein Eintrag nötig". The CTA does not render at all in manual mode.

#### Eating-time picker

1. Tapping the populated eating-time card opens a new bottom sheet with the title "Essen um".
2. The sheet body shows two side-by-side scrollable columns of condensed numerals, hours on the left and minutes on the right. Each column uses native vertical CSS scroll-snap so the user can flick or tap to choose. The selected row is highlighted with an ember underline. Step granularity is 1 hour for the hour column and 5 minutes for the minute column.
3. Confirming the sheet writes the new target time to the existing target-time state and re-runs the back-scheduling. Cancelling closes the sheet without writing.
4. The legacy `TargetTimePicker.svelte` component is replaced by this new sheet and removed from the codebase.

#### Add-item sheet

1. The bottom sheet keeps its three steps (Kategorie, Sorte, Spezifikationen) and its existing data model. Layout, type, spacing, and copy match the prototype: `bgSurface` panel, top corners radius 24, drag-handle, back-chevron plus screen title plus close glyph header row, scrolling body.
2. Step 1 still shows a two-column grid of category cards. Each card's icon renders in ember monoline at 28×28 with the German category name below. The "Favoriten" tab pivot shipped in the favorit-plan-vorlage split is preserved and re-skinned; tapping the Favoriten tab swaps the body to the saved-Favoriten list with row layout matching the new menu list pattern.
3. Step 2 renders cuts as a vertical list. Each row shows the cut name on the left and a tabular condensed estimated cook time on the right (e.g. "~12 min"). Selecting a cut whose `kind` is `simple` adds the item directly and closes the sheet. Selecting any other cut advances to step 3.
4. Step 3's sub-sections (Dicke, Variante, Garstufe) are unchanged in mechanics. Layout becomes editorial: Dicke uses a horizontal card with circular minus and plus controls flanking a massive condensed numeral plus "cm" unit eyebrow. Garstufe pills wrap with an ember active state. Variante options show as full-width buttons. The live "Garzeit" plus "Ruhe" footer carries the same content as today, restyled in the condensed mono-as-display font.
5. The "Als Favorit speichern" inline action shipped in the favorit-plan-vorlage split stays in the specs-step footer next to "Übernehmen". Its copy and mechanics are unchanged.

#### Session

1. The header strip carries a small ember pulsing dot plus "Live" eyebrow on the left. The wake-lock indicator persists from the current build and renders as a small chip in the same row, immediately right of the "Live" eyebrow. On the right is the eating-time as a small badge ("Essen um" eyebrow plus condensed HH:MM). A "Beenden" button anchors the far right.
2. Below the header sits the master countdown: an eyebrow "Bis zum Essen" plus a massive condensed numeral showing the remaining time to eating time, tabular figures.
3. The body is a two-column grid of timer cards. Each card centers a 92px progress ring with 6px stroke. Inside the ring renders the per-status value: cooking shows remaining cook time, resting shows remaining rest, ready shows a checkmark, pending shows the count-in time before this item's cook starts. Below the ring is the item name and a status eyebrow ("WARTET", "GRILLT", "WENDEN!", "RUHT", "FERTIG"). Cards in "ready" or "flip" status carry a colored border and a soft glow. Ready cards expose an "Anrichten" button at the bottom which moves the item to plated state.
4. The alarm banner overlays the screen pinned 24px from the bottom and 16px from each side. Background is a horizontal gradient from ember to ember-dim, text in near-black ink. The banner pulses with a 1.012 scale at 1.2s intervals and carries a layered glow shadow. Inside the banner: a flame glyph, the trigger eyebrow (Auflegen, Wenden, Fertig), the item name plus action verb in body weight, and a circular confirm button. When multiple alarms are stacked, the banner shows a "+N" pill in the eyebrow row indicating the queue depth. Confirming dismisses the front-most alarm and rolls the next to the front.
5. The session no longer auto-ends 60 seconds after every item is plated. The session stays put with all items in plated state and the user dismisses explicitly via the "Beenden" button. The auto-end deadline UI in the current code is removed.

#### Menüs (formerly Plan-Vorlagen)

1. The route renames from `/plans` to `/menus`. The legacy `/plans` route is deleted; no redirect is configured.
2. The screen header reads "Menüs". Each Menü row carries the name in body weight, a one-line preview built from the item names joined by " · ", and a meta line in the form "X STÜCK · Y MIN" in the condensed mono-as-display font.
3. Swipe-left on a row reveals a Delete affordance. Tap-and-hold the row title flips it into an inline rename input that commits on Enter or blur and cancels on Escape. The current `window.prompt`-based rename and confirm flow is removed.
4. A primary "Neue Session" CTA at the bottom of the list returns the user to Plan.
5. The Home screen, the AddItemSheet's Plan-Vorlage append sheet, the Plan screen's "★ Plan-Vorlage" inline button, the e2e specs, and the on-screen copy all switch from "Plan-Vorlage" to "Menü" and from "Plan-Vorlagen" to "Menüs" wherever the term appears.

#### Settings

1. The screen header reads "Einstellungen".
2. The first section, "Darstellung", contains a three-way segmented control with options "System", "Hell", and "Dunkel" inside a single `bgSurface` container with the same active-segment treatment used on Plan.
3. The second section, "Signale", lists the three alarm events (Auflegen, Wenden, Fertig) as collapsible rows. Each row carries an event icon in an ember-tinted glyph well, the event name, a sub-line describing when it fires, the currently-selected tone name on the right, and a chevron indicating expansion. Expanding the row reveals the tone picker.
4. The tone list per event shows the five named tones with a radio dot, the tone name in body weight, a one-line description, and a small play-preview button which plays the tone audio.
5. The five tones are: Glut (tiefer Bell-Ton, sanft), Funke (kurzer hoher Tropfen), Kohle (dumpfes Klopfen), Klassik (iOS-Standard Glocke), Lautlos (nur Vibration). Lautlos plays no audio; the rest each map to one curated audio file shipped in `/static/sounds/`. The eight `chime-1.mp3` through `chime-8.mp3` files are removed from the bundle.
6. The third section is a full-width row toggling vibration on or off, with sub-line copy "zusätzlich zum Ton".

#### Light theme

1. Light theme is implemented as a tonal inversion of the new dark token set. The ember accent stays at the same value in both themes; ember-ink (text on ember) stays at the same near-black value in both themes. Background tokens flip toward warm off-whites; text tokens flip toward warm dark grays; border tokens flip toward warm light grays.
2. Every screen renders the same layout, type, and motion in light mode. Only color values differ.

### Out of scope

1. Data model, schema, or scheduler changes. The state machine, IndexedDB store layout, and timing engine are not touched.
2. Any redesign of `/diag`. The route stays untouched as a developer-only utility.
3. New features beyond what the prototype shows. No reordering, sharing, cloud sync, or onboarding tutorial.
4. A backend. Grillmi stays a static-asset PWA.
5. Changes to the `Favorit` (single-cut preset) or `Menü` (formerly Plan-Vorlage) data shape. Only the Menü's user-facing label and route path move; the schema field name `SavedPlan` stays as it is.
6. Server-side install prompt analytics or A/B testing.
7. Replacement of the existing chime audio with newly-recorded recordings. New audio is sourced from mixkit.co during this work and lands in the same branch.
8. A dedicated post-session "Mahlzeit" celebration screen.

---

## Technical

### Approach

The work is one feature branch (`feature/gluehen`) that lands every screen, the token system, the new components, and the audio swap as a single merge to `main`. Work in the repository root where this spec lives (`/opt/grillmi` in the current environment), and keep the Claude Design bundle available at `Grillmi.zip` until the visual QA pass is complete.

The implementation starts by extracting the design bundle to `.tmp/grillmi-design/` and opening `.tmp/grillmi-design/design_handoff_grillmi_redesign/design/Grillmi Redesign.html` in Chromium. Use the prototype as a visual reference, not as source code. The production Svelte code keeps Grillmi's real stores, generated timing data, route files, IndexedDB schema, service worker, and test harness. The prototype's `direction-a.jsx` gives exact styles and component composition; `shared.jsx` only clarifies prototype state shape and must not replace `src/lib/data/timings.generated.json` or the existing store model.

The token migration in `src/app.css` is the foundation. The current OKLCH neutrals are replaced with the Glühen palette converted to OKLCH where the value preserves theming (background ramp, text ramp, status colors) and kept as raw hex where the prototype specifies a brand-tied value (ember, ember-dim, ember-ink). Every existing token name keeps its name, including `--color-bg-base`, `--color-fg-base`, `--color-accent-default`, `--color-state-pending`, `--color-state-cooking`, `--color-state-resting`, `--color-state-ready`, `--color-state-plated`, `--color-error-default`, and the border tokens; only the values change. The new `--color-border-strong-translucent` and `--color-border-subtle-translucent` are added for the prototype's `rgba(255,255,255,0.06|0.12)` hairlines; existing solid border tokens stay for places that depend on them. The `--font-mono` token is deleted; every consumer is updated to `--font-display` plus `font-variant-numeric: tabular-nums`. The display font stack swaps Barlow Condensed to the front of `--font-display` and the same family doubles as the condensed-numeral font for cook times and durations. Barlow Condensed and Inter are self-hosted as WOFF2 under `/static/fonts/` with `@font-face` declarations at weights 400, 500, 600, and 700 and `font-display: swap`. The service worker pre-caches them so the PWA stays fully offline after first load.

The light-theme block under `:where([data-theme='light'])` updates to mirror the new dark token semantics with inverted background and text values; the ember accent stays identical across themes.

The atom layer rebuilds first. A new `SegmentedControl.svelte` is added for the Plan three-way mode and the Settings theme switcher. `Button.svelte` keeps its API but its variants (primary, secondary, ghost, accentGhost) re-skin to match `AButton` in the prototype: 14px radius, condensed-letter-spacing, ember-on-ember-ink primary, transparent-with-strong-border secondary. `ProgressRing.svelte` keeps its API and gains support for the 92px session sizing plus per-status color binding. `GlowGrates.svelte` is a new inline SVG component for Home's background, parameterized by accent. `TimePickerSheet.svelte` is the new bottom-sheet eating-time picker with two CSS-scroll-snap columns; it replaces `TargetTimePicker.svelte` which is deleted. `AlarmBanner.svelte` is rewritten to match the gradient-and-pulse design pinned to the bottom of the Session screen with the queue-depth pill and 44×44 confirm button. `TimerCard.svelte` is rewritten to match `ATimerCard` (centered ring on top, name and status eyebrow below, conditional Los or Anrichten button). `PlanItemRow.svelte` is rewritten as a single flex strip with the iOS pill stepper. `MasterClock.svelte` and `SessionHeader.svelte` are rewritten to match the prototype top-strip and master-countdown layout, with the wake-lock indicator preserved as a small chip beside the "Live" eyebrow. `FavoriteCard.svelte` (already renamed to `SavedPlanCard.svelte` per the prior split) is rewritten to match the `AFavorites` row but kept under the same filename since it now serves the Menü list; the component is renamed in this redesign to `MenuCard.svelte` along with the route move. The two empty-state primitives `EmptyState.svelte` and `FirstRunNotice.svelte` are deleted; their copy and visuals fold into the inline empty state on Home and Plan as the prototype shows.

The screen layer rebuilds in this order: Plan first (highest user value and biggest layout shift), Add-Item Sheet second (most-touched flow), Session third (alarm motion and ring sizing), Home fourth, Menüs fifth, Settings last. Each screen is rebuilt in place against the existing route file; no parallel screen files are introduced.

The route move from `/plans` to `/menus` deletes `src/routes/plans/+page.svelte`, adds `src/routes/menus/+page.svelte`, renames `src/lib/components/SavedPlanCard.svelte` to `MenuCard.svelte`, and updates every import. No SvelteKit redirect is configured; deep links to `/plans` 404. The schema-level type `SavedPlan` and the IDB store name `plans` are preserved to avoid an IDB migration this round; only the user-facing surface and component names change. The store filename `savedPlansStore.svelte.ts` is renamed to `menusStore.svelte.ts` and its export `savedPlansStore` becomes `menusStore`. The `sessionStore` methods `loadFromSavedPlan` and `appendFromSavedPlan` rename to `loadFromMenu` and `appendFromMenu`.

The session auto-end logic in `src/lib/stores/sessionStore.svelte.ts` is removed: the `autoEndTimer`, `autoEndDeadline`, the `AUTO_END_MS` constant, and the `armAutoEnd` and `disarmAutoEnd` paths. Every call site that arms or watches the auto-end is removed. The Session screen's `autoend` UI block in `src/routes/session/+page.svelte` is removed. The `allPlated` derived stays; it now drives nothing automatic, only optional UI affordances (the per-card Anrichten button).

The manual-mode redirect adds a guard in `src/routes/session/+page.svelte`'s `onMount` (or in a `+page.ts` `load`): when `sessionStore.planMode === 'manual'`, redirect to `/plan` via `goto('/plan', { replaceState: true })`. Manual-mode rendering itself moves into `src/routes/plan/+page.svelte` as a separate render branch, fed by the existing `manualStarts` and `manualPlated` state on `sessionStore`.

The Settings tone migration replaces `chime-1.mp3` through `chime-8.mp3` in `/static/sounds/` with the four new files `glut.mp3`, `funke.mp3`, `kohle.mp3`, `klassik.mp3` (Lautlos has no file). Audio is sourced from mixkit.co under the Mixkit Free License (commercial-use allowed, no attribution required, redistribution-as-is forbidden but bundling inside an app is permitted). The selected source files are: Glut → Mixkit #930 "Cinematic church bell hit", Funke → Mixkit #3109 "Crystal chime", Kohle → Mixkit #578 "Short bass hit", Klassik → Mixkit #938 "Service bell". Each file is normalized to `-14 LUFS` and encoded as MP3 96 kbps mono before commit. Trim length is per-tone: percussive tones (Funke, Kohle, Klassik) trim to ~1.5 seconds with a 0.2s fade-out; bell-style tones with long natural decay (Glut) trim to ~2.5 seconds with a 0.5s fade-out so the resonance reads as intentional rather than cut off. The license metadata (Mixkit ID, source page URL, Mixkit Free License URL) is recorded per tone in `static/sounds/README.md`. The `soundAssignmentSchema` default migrates from `{ putOn: 'chime-1', flip: 'chime-2', done: 'chime-3' }` to `{ putOn: 'glut', flip: 'funke', done: 'klassik' }`. Existing user settings that reference `chime-N` are migrated on read in the settings store: any value not in the new five-tone set falls back to the new default for that event.

The install-app chip on Home reuses the existing `beforeinstallprompt` capture pattern. The chip dismissal persists in `localStorage` under a key `gluehen.installChipDismissed` and is cleared on a 30-day timer so a returning user eventually sees the chip again if they have not installed. iOS Safari does not fire `beforeinstallprompt`; on iOS the chip renders only when running in a regular Safari tab (not standalone) and tapping it opens an inline instructional sheet showing the Add to Home Screen flow.

### Approach Validation

1. **Direction-A.jsx is a high-fidelity visual spec, not a state machine.** I read the full file, the README, and the original-brief from `Grillmi.zip` alongside the current Svelte components. The redesign assumes the data model and feature surface that already exist in Grillmi today; every component in the prototype maps to an existing Svelte component or to a small new atom. No state-machine changes are required, which keeps the scope to tokens, atoms, layouts, and copy.
2. **The redesign predates the favorit-plan-vorlage split.** The prototype does not show the Favoriten tab inside AddItemSheet or the "★ Plan-Vorlage" append button on Plan, both of which shipped 2026-04-25. Dropping them would be a feature regression. Preserving both is the right call: the Favoriten tab keeps its tab-pivot pattern in the rebuilt sheet, and the append button stays on Plan with copy renamed from "Plan-Vorlage" to "Menü". This is a deliberate deviation from the literal prototype.
3. **Pixel-perfect work needs an automated visual gate.** Design handoff guidance consistently warns that missing spacing, typography, interaction-state, and breakpoint specs cause developers to guess; this bundle avoids that by shipping runnable HTML and JSX. Playwright's screenshot assertions compare pixel output against committed baselines and support masking dynamic content, disabling animations, and setting explicit tolerances. This spec therefore requires prototype baselines plus app screenshots at 390 px before sign-off, not only manual eyeballing. References: https://miro.com/prototyping/design-hand-off/ and https://playwright.dev/docs/test-snapshots.
4. **CSS scroll-snap is the right tool for the eating-time picker.** Native vertical `scroll-snap-type: y mandatory` plus `scroll-snap-align: center` on each row gives a wheel-feel without a third-party picker library, retains keyboard arrow navigation, and avoids a `<input type="time">` which would not match the editorial typography. The pattern is well-documented and widely shipped on iOS Safari and Chrome for Android. Reference: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scroll_snap.
5. **Self-hosting Barlow Condensed plus Inter is required for offline.** The PWA's offline-after-first-load requirement breaks if fonts load from `fonts.googleapis.com`. Self-hosted WOFF2 with `font-display: swap` and a service-worker pre-cache is the established approach; this matches how Grillmi already handles its sound files and icons. Bundle size impact is roughly 280 kB across the four weights of two families.
6. **Mixkit Free License is workable for this scope.** Mixkit's Free License permits commercial use of their SFX files without attribution, and explicitly allows bundling inside an app (only pure redistribution as-is is forbidden). The candidates were curated and previewed via a temporary `/test-chimes` route under `pnpm dev`; Marco picked one per tone in a single round (Glut → #930, Funke → #3109, Kohle → #578, Klassik → #938). Freesound.org was tried first but anonymous direct-download is unreliable without API auth, so Mixkit's CDN was used instead. Four short tones at 96 kbps mono come to under 100 kB total, an acceptable PWA payload. References: https://mixkit.co/license/ and https://mixkit.co/free-sound-effects/.
7. **Auto-end removal is safe.** The 60-second auto-end was a convenience, not a hard contract. Removing it leaves the user in a stable session state (all items plated) and gives them an explicit "Beenden" path. No tests beyond the auto-end test itself depend on the timer firing.
8. **Route deletion without a redirect is a deliberate hard break.** The user explicitly chose this in the grilling round. The blast radius is small: `/plans` is two days old in production, the only persistent reference is in the PWA shell which the service worker will refresh on next load, and bookmarks are unlikely.

### Risks

| Risk | Mitigation |
| --- | --- |
| Implementer treats this as an approximate redesign instead of a rendition of Claude Design's bundle | The Fidelity contract makes `Grillmi.zip` the visual source of truth, and Phase 0 plus Phase 9 require prototype screenshots, app screenshots, and explicit visual-drift reconciliation before merge. |
| Prototype bundle is not extracted or the wrong file is used | Phase 0 extracts `Grillmi.zip` to `.tmp/grillmi-design/` and serves the exact `design_handoff_grillmi_redesign/design/Grillmi Redesign.html` file. The zip stays at repo root until QA completes. |
| Token rename or value change breaks an existing component's color | Every screen is re-rendered and visually compared against the prototype at 390 wide before merge; existing component tests catch contrast regressions via visible-text assertions. |
| Self-hosted fonts fail to load offline | The service worker `precacheManifest` includes the four Barlow Condensed and four Inter WOFF2 files; an offline e2e test asserts the Plan screen renders the condensed display font after going offline. |
| Mixkit Free License forbids redistribution-as-is | Bundling inside the PWA app is permitted by the license; the files ride alongside the app code and are not exposed as a standalone redistributable. License page URL, Mixkit file ID, and source page URL are recorded per tone in `static/sounds/README.md`. No attribution is required by the license, but the README discloses the source for transparency. |
| Existing user has a `chime-N` value persisted in their settings | The settings store's read path falls back to the new default for that event when the persisted value is not in the five-tone set; the next write commits the new default. |
| Manual-mode redirect creates a flicker on `/session` deep-link | The redirect happens in `+page.ts` `load` so the redirect resolves before the page renders; no client-side flicker. |
| Light-theme inversion produces poor contrast on ember-on-light | The ember accent at `#ff7a1a` over the light `bgSurface` is only used for active backgrounds (where ember-ink at `#1a0a02` rides on top, contrast 7.4:1) and active text (where ember on light bg, contrast 3.8:1, passes WCAG AA for non-text icons but not for body text). The light theme reserves ember for active backgrounds and small accent text only; large body text always uses the inverted text tokens. |
| Glow-grates SVG renders heavy on low-end Android | The SVG uses a single radial gradient plus 14 hairline lines; total path count is well under any rendering threshold. The component renders at `opacity: 0.5` and is sized to viewport; no measurable paint cost in profiling. |
| Removing the `★ Plan-Vorlage` append button on Plan would lose a feature | The button is preserved and its copy renamed to "★ Menü". Append-from-Menü stays a Plan-screen action. |
| `/plans` route deletion 404s on bookmarks | The user explicitly chose the hard break. The Home screen and AddItemSheet are the only entry points to saved Menüs in the new design; both are updated. |

### Implementation Plan

#### Phase 0: Design bundle setup and visual baselines

1. [ ] Confirm `Grillmi.zip` exists at repo root and contains `design_handoff_grillmi_redesign/README.md`, `design/Grillmi Redesign.html`, `design/direction-a.jsx`, and `design/shared.jsx`.
2. [ ] Extract the bundle with `rm -rf .tmp/grillmi-design && mkdir -p .tmp/grillmi-design && unzip -q Grillmi.zip -d .tmp/grillmi-design`. Do not commit `.tmp/grillmi-design/`.
3. [ ] Serve `.tmp/grillmi-design/design_handoff_grillmi_redesign/design/` with `python3 -m http.server 8000` and open `http://localhost:8000/Grillmi%20Redesign.html` in Chromium.
4. [ ] Capture prototype baseline screenshots at a 390 px wide viewport for Home, Plan empty, Plan filled, Plan manual, AddItem category, AddItem cut, AddItem specs, Session with alarm, Menüs, and Settings with one signal row expanded. Store the baselines under `tests/e2e/visual-baselines/gluehen/` with filenames matching the screen states.
5. [ ] Add `tests/e2e/gluehen-visual.spec.ts` that drives the rebuilt Svelte app into the same states, freezes or masks dynamic countdown text, disables non-alarm animations during capture, and compares against the baselines with Playwright screenshot assertions. Alarm banner capture keeps the pulse disabled for the still image and verifies the `aAlarm` animation separately via computed style.
6. [ ] Add a `test:e2e:visual` package script that runs only `gluehen-visual.spec.ts` in Chromium at the 390 px viewport. After the baselines are committed, update the existing full `test:e2e` command so visual regression runs with the rest of the E2E suite.

#### Phase 1: Tokens, fonts, and theming foundation

1. [ ] In `src/app.css`, replace the dark `@theme` block's color values with the Glühen palette. Update `--color-bg-base`, `--color-bg-surface`, `--color-bg-elevated`, `--color-bg-input`, `--color-fg-base`, `--color-fg-muted`, `--color-fg-subtle`, `--color-fg-on-accent`, `--color-fg-on-status`, `--color-accent-default`, `--color-accent-hover`, `--color-accent-muted`, `--color-state-pending`, `--color-state-cooking`, `--color-state-resting`, `--color-state-ready`, `--color-state-plated`, `--color-error-default`, `--color-border-subtle`, `--color-border-default`, `--color-border-strong`. Add new `--color-bg-surface-2` and `--color-bg-elev` for the prototype's nested-surface and elev tokens. Add `--color-ember-dim` and `--color-ember-ink` for the gradient-end-stop and accent-text tokens. Convert each value to OKLCH where the value preserves theming (every neutral and status), keep raw hex where the value is a brand anchor (ember at `#ff7a1a`, ember-dim at `#8a3f0a`, ember-ink at `#1a0a02`).
2. [ ] In the same file, update `--font-display` to put Barlow Condensed at the front of the stack: `'Barlow Condensed', 'DIN Condensed', 'Oswald', ui-sans-serif, system-ui, sans-serif`. Delete the `--font-mono` declaration.
3. [ ] Add an `@font-face` block for Barlow Condensed (weights 400, 500, 600, 700) and Inter (weights 400, 500, 600, 700) referencing self-hosted WOFF2 files at `/static/fonts/`. Set `font-display: swap` on every face.
4. [ ] Add the eight WOFF2 files under `/static/fonts/`. Source from Google Fonts' static download (Barlow Condensed) and rsms.me/inter (Inter). License files (`OFL.txt`) for each family land alongside.
5. [ ] In `src/service-worker.ts`, add the eight font WOFF2 files plus their license files to the precache manifest so first install caches them.
6. [ ] Update the light-theme block under `:where([data-theme='light'])` to mirror the new dark token semantics with inverted bg and fg values. Ember accent stays at `#ff7a1a`; ember-ink stays at `#1a0a02`.
7. [ ] `grep -rn "var(--font-mono)" src/` and replace every match with `var(--font-display)` plus a sibling `font-variant-numeric: tabular-nums` declaration. Same for any reference to `font-family: var(--font-mono)` inside `<style>` blocks.

#### Phase 2: Atom rebuild

1. [ ] Add `src/lib/components/SegmentedControl.svelte` accepting `segments` (array of `{ id, label }`), `value`, and `onchange`. Renders inside a `bgSurface` container with 4px inner padding and equal-column grid. Active segment carries ember background plus ember-ink text; inactive segments are transparent.
2. [ ] Rewrite `src/lib/components/Button.svelte` to match the prototype's `AButton`. Variants: primary (ember on ember-ink), secondary (transparent with `borderStrong`), ghost (transparent text-color), accentGhost (transparent ember-color). Sizes sm (36), md (48), lg (56). Radius 14 across.
3. [ ] Update `src/lib/components/ProgressRing.svelte` to support an explicit `size` prop (default 72, used at 92 on Session) and a `color` prop bound to status-aware tokens. Track stays at `rgba(255,255,255,0.08)` in dark mode, inverted in light. Stroke parameter (default 6) stays as-is.
4. [ ] Add `src/lib/components/GlowGrates.svelte` rendering the prototype's inline SVG (radial ember gradient plus 14 hairline diagonal grates plus dark fade overlay). Accept `accent` prop with default `var(--color-accent-default)`. Render absolutely positioned filling the parent at `opacity: 0.5`.
5. [ ] Add `src/lib/components/TimePickerSheet.svelte`. Bottom-sheet container with drag handle, header reading "Essen um", body with two side-by-side scrollable columns (HH and MM) using `scroll-snap-type: y mandatory` plus `scroll-snap-align: center` on each row. Hours range 0 to 23 in steps of 1; minutes range 0 to 55 in steps of 5. Selected row carries an ember underline. Footer has a "Übernehmen" primary button and a "Abbrechen" ghost button. The sheet emits `oncommit(date)` with a constructed Date for today at the picked time.
6. [ ] Rewrite `src/lib/components/AlarmBanner.svelte` to match the prototype banner: pinned absolute at the bottom (16px sides, 24px below), gradient ember-to-emberDim, ember-ink text, layered glow shadow, 1.012 scale pulse at 1.2s intervals (CSS `aAlarm` keyframes). Slot accepts the trigger (Auflegen/Wenden/Fertig), item name, action verb, queue-depth pill (when count > 1), and a 44×44 confirm button. The pulse animation respects `prefers-reduced-motion: reduce` (animation disabled by the global rule already in `app.css`).
7. [ ] Rewrite `src/lib/components/TimerCard.svelte` to match `ATimerCard`. Layout: ring centered top (size 92, stroke 6), item name centered below in body weight, status eyebrow below the name in tabular condensed display font and the status color. Conditional Los button (when status is unstarted) and Anrichten button (when status is ready). Card border and glow tint to the status color when status is flip or ready.
8. [ ] Rewrite `src/lib/components/PlanItemRow.svelte` as a single flex strip. Left section: item name (tap to inline-rename) plus meta line (tap to re-open specs). Middle section: an iOS-pill cook stepper with minus, the cook-time as a tabular condensed numeral, and plus. Right section: a 24×24 minus-circle SVG glyph that triggers delete with the existing swipe-to-confirm pattern.
9. [ ] Rewrite `src/lib/components/MasterClock.svelte` as the prototype's master-countdown block: eyebrow "Bis zum Essen" plus a massive condensed numeral with tabular figures. Drop the "minutes" and "seconds" labels.
10. [ ] Rewrite `src/lib/components/SessionHeader.svelte` to match the prototype top strip. Left: ember pulsing dot plus "Live" eyebrow plus the wake-lock chip (preserved from the current build, restyled to `bgSurface` chip with a small icon and short label). Right: an "Essen um HH:MM" or "Modus: Manuell" badge depending on `planMode`, then a "Beenden" secondary button.
11. [ ] Rename `src/lib/components/SavedPlanCard.svelte` to `src/lib/components/MenuCard.svelte`. Rewrite to match the `AFavorites` row layout: card surface with name in body weight, a one-line preview line of joined item names, a meta line "X STÜCK · Y MIN" in the condensed display font, and a trailing chevron in ember.
12. [ ] Delete `src/lib/components/EmptyState.svelte` and `src/lib/components/FirstRunNotice.svelte`. Confirm no lingering imports via `grep -rn "EmptyState\|FirstRunNotice" src/` returning empty.
13. [ ] Delete `src/lib/components/TargetTimePicker.svelte`. Update `src/routes/plan/+page.svelte` to use `TimePickerSheet` in its place.

#### Phase 3: Storage and route renames

1. [ ] Rename `src/lib/stores/savedPlansStore.svelte.ts` to `src/lib/stores/menusStore.svelte.ts`. Rename the export `savedPlansStore` to `menusStore`. The `SavedPlan` type, the `plans` IDB store name, and the `db.ts` accessors stay as they are; only the user-facing label moves. Re-export type alias `Menu = SavedPlan` from `src/lib/models/index.ts` for code clarity.
2. [ ] Rename the two `sessionStore` methods `loadFromSavedPlan` and `appendFromSavedPlan` to `loadFromMenu` and `appendFromMenu`. Bodies unchanged. Update both call sites.
3. [ ] Move `src/routes/plans/+page.svelte` to `src/routes/menus/+page.svelte`. Delete the empty `src/routes/plans/` directory. Update the `<svelte:head>` title to "Menüs · Grillmi". Update every visible string from "Plan-Vorlage" or "Plan-Vorlagen" to "Menü" or "Menüs". Replace the `window.prompt`-based rename and `window.confirm`-based delete flow with the swipe-left-to-delete and tap-title-to-inline-rename pattern described in Behaviors.
4. [ ] Update `src/routes/+page.svelte` Home: replace the "Plan-Vorlagen" CTA wording with "Menüs" wherever the term appears, and update the link from `/plans` to `/menus`. Add the recent-Menüs strip per the Home behavior; tap loads the Menü via `sessionStore.loadFromMenu` and navigates to `/plan`. Hide the strip eyebrow plus row when `menusStore.all.length === 0`.
5. [ ] Update `src/routes/plan/+page.svelte`: rename the "Plan speichern" inline action's display copy to "Als Menü speichern", rename internal state names from `*Plan` to `*Menu` for consistency, switch the save dialog to the new editorial styling described in Behaviors. Rename the `★ Plan-Vorlage` inline button to `★ Menü`. The append sheet's heading becomes "Menü hinzufügen" and the hint reads "Tippe auf ein Menü. Die Einträge werden an deinen Plan angehängt."
6. [ ] Update every test file that references `/plans`, `Plan-Vorlage`, or `savedPlansStore` to the new naming: `tests/e2e/saved-plans.spec.ts` becomes `tests/e2e/menus.spec.ts`, `tests/e2e/a11y.spec.ts` updates the route, `tests/components/SavedPlanCard.test.ts` becomes `MenuCard.test.ts`, `tests/unit/savedPlansStore.test.ts` becomes `menusStore.test.ts`.

#### Phase 4: Plan screen

1. [ ] In `src/routes/plan/+page.svelte`, replace the existing two-mode toggle with the new three-way `SegmentedControl` carrying `Jetzt`, `Auf Zeit`, `Manuell`. Bind the segment value to `sessionStore.planMode` plus `sessionStore.mode`. Active-segment selection routes per the prototype's `onClick` mapping.
2. [ ] Add the eating-time card per the prototype's layout. Empty state shows the dim em-dash and eyebrow "Noch keine Zielzeit"; populated state shows the massive condensed eating time, eyebrow "Fertig um", and a meta "Start HH:MM" line computed from `sessionStore.longestCookSeconds`. Card surface uses `linear-gradient(180deg, bg-surface-2, bg-surface)` when populated and a flat `bg-surface` when empty. The populated card opens `TimePickerSheet` on tap.
3. [ ] Replace the existing `PlanItemRow` markup with the rebuilt component per Phase 2. Keep the existing add-item, edit, rename, delete handlers intact.
4. [ ] Add the manual-mode rendering branch on Plan: when `sessionStore.planMode === 'manual'`, render a 2-col grid of `TimerCard` instances bound to `manualItemsWithStatus` (a derived list mirroring the prototype's `manualItems` mapping over `manualStarts` and `manualPlated`). Each card carries the Los button while unstarted and the Anrichten button while ready. Hide the sticky bottom CTA in this mode.
5. [ ] Update the empty-state add-item card and the non-empty bottom add-item button to match the prototype layouts and copy.
6. [ ] Update the "Als Menü speichern" save-dialog markup to the new editorial styling per the Menüs behavior. Default name field is empty with placeholder "z.B. Sonntagsmenü"; confirm calls `menusStore.save(name, plan.items)`; cancel closes the dialog.
7. [ ] Update the sticky bottom CTA copy to "Los, fertig um HH:MM" with `fmtClock(eatAt)` interpolated; disabled state reads "Mindestens ein Eintrag nötig". Hide the CTA entirely when `planMode === 'manual'`.

#### Phase 5: AddItemSheet

1. [ ] Update `src/lib/components/AddItemSheet.svelte` to match the prototype's sheet shell: drag handle, back-chevron plus title plus close-glyph header row, condensed display title, optional ember subtitle eyebrow. Body keeps its three-step routing.
2. [ ] Restyle step 1's category grid per `ACategoryStep`: 2-col `bg-surface-2` cards with monoline ember icons at 28×28 plus the German category name. Preserve the Favoriten tab pivot from the favorit-plan-vorlage split; restyle the tab buttons to match the new editorial language but keep the existing tab state logic.
3. [ ] Restyle step 2's cut list per `ACutStep`: full-width buttons with a hairline border-bottom, name on the left, condensed-mono base cook time on the right (`~N min`).
4. [ ] Restyle step 3's specs section per `ASpecsStep`. Dicke uses a horizontal card with circular minus and plus controls flanking a massive condensed numeral plus "cm" eyebrow. Garstufe pills wrap with the ember active state. Variante options stay as full-width buttons. The "Garzeit" plus "Ruhe" footer matches the prototype's mono-as-display tabular formatting.
5. [ ] Preserve the "Als Favorit speichern" inline action shipped in the favorit-plan-vorlage split. Restyle its UI to match the new editorial language; mechanics unchanged.

#### Phase 6: Session screen and auto-end removal

1. [ ] In `src/lib/stores/sessionStore.svelte.ts`, remove the `autoEndTimer`, `autoEndDeadline`, `AUTO_END_MS`, `armAutoEnd`, and `disarmAutoEnd` symbols plus every reference to them. Keep `allPlated` as a derived used by Session card render only.
2. [ ] In `src/routes/session/+page.svelte`, remove the `autoend` UI block (the lines 144 through 167 region) and the `autoEndDeadline` derived. Add a manual-mode redirect: if `sessionStore.planMode === 'manual'`, call `goto('/plan', { replaceState: true })` from the page's `+page.ts` `load` function.
3. [ ] Replace the page layout with the prototype's: top strip (`SessionHeader`), master countdown (`MasterClock`), 2-col grid of `TimerCard` instances. Preserve the existing wake-lock indicator inside `SessionHeader`.
4. [ ] Add the bottom-pinned `AlarmBanner` per Phase 2; wire it to the existing alarm-detection state on `sessionStore`. The banner stays sticky until the user dismisses; queue-depth pill renders when `visibleAlarms.length > 1`.

#### Phase 7: Home

1. [ ] In `src/routes/+page.svelte`, replace the body with the prototype's Home layout. Add the `GlowGrates` background, the wordmark with flame glyph, the hero "Bereit zum Grillen?" copy with "Grillen?" tinted ember.
2. [ ] Add the recent-Menüs strip below the hero. Bind to `menusStore.all.slice(0, 6)`. Each pill shows the Menü name and "X Stück · Y min" meta. Tap calls `sessionStore.loadFromMenu(menu.items)` and `goto('/plan')`. Hide the eyebrow plus row when the list is empty.
3. [ ] Replace the existing "App installieren" button with the dismissible chip pattern. The chip uses the existing `beforeinstallprompt` capture; on iOS Safari without `beforeinstallprompt`, render the chip only when not in standalone mode and tap opens an inline instructional sheet showing the Add to Home Screen icon and steps. Persist dismissal under `localStorage` key `gluehen.installChipDismissed` with a 30-day expiry.
4. [ ] Replace the existing three-button stack with the prototype's primary "Neue Session" plus secondary "Menüs" plus "Einstellungen" two-up.

#### Phase 8: Settings and tone migration

1. [x] Source four tones from mixkit.co per the audio-production behavior. Candidates curated and previewed via a temporary `/test-chimes` route; Marco picked Glut → Mixkit #930 "Cinematic church bell hit", Funke → Mixkit #3109 "Crystal chime", Kohle → Mixkit #578 "Short bass hit", Klassik → Mixkit #938 "Service bell". Lautlos has no audio file.
2. [x] Trim each chosen file (Glut to 2.5s with 0.5s fade-out; Funke, Kohle, Klassik to 1.5s with 0.2s fade-out), normalize to -14 LUFS, encode as MP3 96 kbps mono, commit as `static/sounds/{tone}.mp3` (`glut.mp3`, `funke.mp3`, `kohle.mp3`, `klassik.mp3`).
3. [ ] Add `static/sounds/README.md` recording per chosen tone: tone name, Mixkit file ID, Mixkit source page URL, Mixkit Free License URL (`https://mixkit.co/license/`).
4. [ ] Delete the temporary `/test-chimes` route and the `static/sounds/candidates/` directory before merging the redesign.
5. [ ] Delete `static/sounds/chime-1.mp3` through `static/sounds/chime-8.mp3`.
6. [ ] In `src/lib/schemas/index.ts`, update `soundAssignmentSchema`'s default to `{ putOn: 'glut', flip: 'funke', done: 'klassik' }`. Update the union of allowed values from `chime-1...chime-8` to `glut`, `funke`, `kohle`, `klassik`, `lautlos`.
7. [ ] In `src/lib/stores/settingsStore.svelte.ts`, add a read-time fallback: when a persisted value is not in the new five-tone set, replace it with the new default for that event in the in-memory state and rewrite to IDB on the next setSound. This handles existing users gracefully.
8. [ ] Rewrite `src/routes/settings/+page.svelte` to match the prototype's three-section layout. Section 1 "Darstellung" uses `SegmentedControl` for System/Hell/Dunkel. Section 2 "Signale" lists three event rows (Auflegen, Wenden, Fertig) as collapsible accordions; each expands to the five-tone radio list with descriptions and a play-preview button. Section 3 is a full-width vibration toggle row with sub-line copy "zusätzlich zum Ton".
9. [ ] Wire the play-preview button to a small audio playback helper that loads `/sounds/{tone}.mp3` and plays it once, ignoring Lautlos. Re-use the existing alarm audio playback path if present; otherwise add a minimal `previewTone(toneId)` helper in the settings page.

#### Phase 9: QA, tests, and merge

1. [ ] Re-open the extracted prototype at `.tmp/grillmi-design/design_handoff_grillmi_redesign/design/Grillmi Redesign.html` at 390 px wide in Chromium. For each required state (Home, Plan empty, Plan filled, Plan manual, AddItem category, AddItem cut, AddItem specs, Session mid-cook with alarm, Menüs, Settings expanded), compare the rebuilt Svelte page side by side and reconcile every spacing or alignment drift greater than 4 px, every color mismatch, every type-family or weight mismatch, and every missing icon, glow, radius, or motion detail.
2. [ ] Run `pnpm test:e2e:visual`. Update visual baselines only when the prototype source changed; do not update baselines to bless an implementation mismatch.
3. [ ] Run `pnpm test:unit && pnpm test:components && pnpm test:e2e && pnpm lint && pnpm build`. All green before merge.
4. [ ] Walk Marco through the Manual Verification checklist below.
5. [ ] Push `feature/gluehen` to the remote, open a PR, request Marco's review, merge to `main`. Deploy via `~/dev/ansible/playbooks/applications/grillmi-deploy.yml` after merge.

---

## Testing

Tests are implementation tasks. Every checkbox below is part of Phase 1 through 9 work; no separate testing phase.

### Unit Tests (`tests/unit/*.test.ts`)

1. [ ] `menusStore.test.ts` (renamed from `savedPlansStore.test.ts`):
   - `test_save_menu` saves an item list as a Menu (SavedPlan internally) and persists.
   - `test_rename_menu` renames in IDB and in-memory.
   - `test_delete_menu` removes from both.
   - `test_save_menu_persists_multiple_items` saves a Menu with two PlannedItem entries and asserts both round-trip through IDB.
2. [ ] `settingsStore.test.ts` (additions):
   - `test_legacy_chime_value_falls_back_to_new_default` seeds a settings record with `{ putOn: 'chime-1' }`, calls `settingsStore.init()`, asserts the in-memory value reads `glut`.
   - `test_save_new_tone_value_persists` calls `setSound('flip', 'kohle')`, asserts the IDB record reflects the change.
3. [ ] `sessionStore.test.ts` (auto-end removal):
   - Delete `test_auto_end_arms_when_all_plated` and any other test that relies on the auto-end timer firing.
   - Add `test_all_plated_does_not_auto_end` that drives every item to `plated`, advances time by 90 seconds, and asserts `sessionStore.session !== null`.

### Component Tests (`tests/components/*.test.ts`)

1. [ ] `SegmentedControl.test.ts` (new):
   - `test_renders_each_segment` renders three segments and asserts each label is in the DOM.
   - `test_active_segment_carries_ember_styling` selects a value and asserts the active button has the active-class or computed background.
   - `test_onchange_fires_on_segment_click` mocks `onchange`, clicks a segment, asserts the callback fires with the segment id.
2. [ ] `TimePickerSheet.test.ts` (new):
   - `test_initial_value_scrolls_to_selected_row` mounts with `value` of 19:30 and asserts the HH column scrolled the "19" row to center and the MM column scrolled the "30" row to center.
   - `test_commit_returns_picked_date` scrolls each column to a different value, taps Übernehmen, asserts `oncommit` fires once with a Date carrying the picked HH and MM.
   - `test_cancel_does_not_emit_commit` taps Abbrechen and asserts `oncommit` did not fire.
3. [ ] `TimerCard.test.ts` (new or rewrite):
   - `test_renders_progress_ring_at_92px` asserts the ring's `width` and `height` attributes are 92.
   - `test_unstarted_renders_los_button` mounts with status `unstarted` and asserts a "Los" button is present.
   - `test_ready_renders_anrichten_button` mounts with status `ready` and asserts an "Anrichten" button is present.
   - `test_status_color_drives_ring_stroke` mounts with status `flip` and asserts the foreground circle's `stroke` attribute equals the ember color.
4. [ ] `AlarmBanner.test.ts` (rewrite):
   - `test_renders_trigger_and_item_name` mounts with kind `flip` and item name "Entrecôte" and asserts the eyebrow reads "Wenden" and the body reads "Entrecôte jetzt wenden".
   - `test_queue_depth_pill_renders_when_multiple` mounts with `count: 3` and asserts a "+2" pill appears.
   - `test_dismiss_button_fires_callback` mocks `ondismiss`, taps the confirm button, asserts the callback fires.
5. [ ] `MenuCard.test.ts` (renamed from `SavedPlanCard.test.ts`):
   - `test_renders_name_and_meta` confirms the card's name, item-count, and total-minutes meta line.
   - `test_swipe_reveals_delete` simulates a left-swipe touch and asserts the delete affordance appears.
   - `test_inline_rename_commits_on_enter` tap-and-holds the title, types a new name, presses Enter, asserts `onrename` fires with the new name.
6. [ ] `AddItemSheet.test.ts` (additions to existing):
   - `test_step_1_renders_category_and_favorites_tabs` (preserved from the favorit-plan-vorlage split): asserts the two tabs render in the new editorial style.
   - `test_specs_step_renders_new_dicke_card` mounts at the specs step with a doneness-kind cut, asserts the Dicke card renders the massive condensed numeral and circular minus plus plus controls.

### E2E Tests (`tests/e2e/*.spec.ts`)

1. [ ] `menus.spec.ts` (renamed from `saved-plans.spec.ts`):
   - `test_save_and_reload_menu` saves a session as a Menu, navigates to `/menus`, taps the row, sees the Plan pre-populated with the same items.
   - `test_swipe_to_delete` saves a Menu, navigates to `/menus`, swipes the row left, taps the revealed Delete affordance, asserts the row is removed from the list and from IDB.
   - `test_tap_title_to_rename_inline` saves a Menu, navigates to `/menus`, taps the title, types a new name, presses Enter, asserts the row reflects the new name and IDB persists it.
2. [ ] `home.spec.ts` (new):
   - `test_recent_menus_strip_renders_when_menus_exist` seeds two Menüs, opens `/`, asserts the eyebrow "Zuletzt gespeicherte Menüs" appears and two pills render.
   - `test_recent_menus_strip_hidden_on_empty` opens `/` with no Menüs, asserts the eyebrow does not appear.
   - `test_install_chip_persistence` opens `/` with a mocked `beforeinstallprompt`, asserts the chip renders. Tap the chip's close glyph, reload, assert the chip does not re-render. Clear `localStorage`, reload, assert the chip re-renders.
3. [ ] `manual-mode.spec.ts` (new):
   - `test_manual_mode_renders_inline_on_plan` switches the segmented control to "Manuell" and asserts the items render as 2-col timer cards on `/plan`.
   - `test_manual_mode_redirects_session_to_plan` sets `planMode === 'manual'`, navigates to `/session`, asserts the URL becomes `/plan` after the redirect.
4. [ ] `eating-time-picker.spec.ts` (new):
   - `test_picker_opens_on_card_tap` populates the eating-time card, taps it, asserts the picker sheet appears.
   - `test_picker_commits_new_target` opens the picker, scrolls to a different time, taps Übernehmen, asserts the eating-time card displays the new time and the back-scheduled start updates accordingly.
5. [ ] `auto-end-removed.spec.ts` (new, replaces any existing auto-end e2e test):
   - `test_session_does_not_auto_end_after_all_plated` drives every item to `plated`, advances mocked time by 120 seconds, asserts `/session` is still the active route and the items are still in plated state.
6. [ ] `tones.spec.ts` (new):
   - `test_settings_renders_five_tones` opens `/settings`, expands the Auflegen accordion, asserts five tone rows render with names Glut, Funke, Kohle, Klassik, Lautlos.
   - `test_play_preview_loads_audio_for_named_tone` taps the play button on the Glut row, asserts an `audio` element with src ending `/sounds/glut.mp3` was instantiated.
   - `test_lautlos_play_preview_is_noop` taps the play button on the Lautlos row, asserts no audio element was created and no error was thrown.
7. [ ] `gluehen-visual.spec.ts` (new):
   - `test_home_matches_claude_design` compares the Home screen to `tests/e2e/visual-baselines/gluehen/home.png`.
   - `test_plan_empty_matches_claude_design` compares the empty Plan screen to `tests/e2e/visual-baselines/gluehen/plan-empty.png`.
   - `test_plan_filled_matches_claude_design` compares Plan with four seeded items to `tests/e2e/visual-baselines/gluehen/plan-filled.png`.
   - `test_plan_manual_matches_claude_design` compares manual-mode Plan to `tests/e2e/visual-baselines/gluehen/plan-manual.png`.
   - `test_add_item_steps_match_claude_design` compares the Kategorie, Sorte, and Spezifikationen sheet states to their three baselines.
   - `test_session_alarm_matches_claude_design` freezes the session timeline at a mid-cook alarm, masks live countdown digits, and compares to `tests/e2e/visual-baselines/gluehen/session-alarm.png`.
   - `test_menus_matches_claude_design` compares the Menüs list to `tests/e2e/visual-baselines/gluehen/menus.png`.
   - `test_settings_expanded_matches_claude_design` compares Settings with the Auflegen tone row expanded to `tests/e2e/visual-baselines/gluehen/settings-expanded.png`.
   - Each screenshot assertion uses the 390 px viewport, committed baselines, dynamic-content masks for live timer digits, and a max 4 px layout-drift review gate. Any color, font-family, font-weight, icon, radius, glow, or motion mismatch fails manual review even when the pixel threshold passes.

### Manual Verification (Marco)

Walks the redesigned PWA on `pnpm dev` before PR approval and repeats the same checklist on the deployed PWA after merge.

1. Open the deployed PWA on a clean device. The Home screen renders with the dark charcoal background and an ember radial glow concentrated in the lower portion. The "GRILLMI" wordmark, the "Bereit zum Grillen?" hero, the "Neue Session" primary button, and the two secondary buttons all read in the new editorial typography.
2. Tap "Neue Session". The Plan screen opens with the three-way segmented control reading "Jetzt", "Auf Zeit", "Manuell" and the eating-time card showing the empty "––:––" state. The active segment carries an ember background.
3. Tap "Auf Zeit". Tap "+ Grillstück hinzufügen". Pick a category (e.g. Rind), pick a cut (e.g. Entrecôte), pick a thickness and a doneness, tap Übernehmen. The plan now shows one item with its name, specs meta, and an iOS pill cook stepper. Tap the minus and plus on the stepper; the cook time decreases and increases by 30 seconds. The pill numerals are tabular and condensed.
4. Tap the populated eating-time card. The bottom-sheet picker opens with two scrollable columns. Flick the hour column to 19, the minute column to 30. Tap Übernehmen. The eating-time card now reads "19:30" in massive condensed numerals.
5. Tap the dashed "Als Menü speichern" button. A small dialog opens with an empty name field and the placeholder "z.B. Sonntagsmenü". Type "Test-Menü", confirm. The dialog closes.
6. Return to Home. The "Zuletzt gespeicherte Menüs" eyebrow plus a single "Test-Menü" pill render below the hero.
7. From Home, tap "Menüs". The list shows "Test-Menü". Swipe the row left; a Delete affordance reveals. Cancel the swipe. Tap the row's title; the title becomes editable. Type "Test 2", press Enter. The row reflects the new name. Reload the page; the rename persisted.
8. From Plan with one item, switch the segmented control to "Manuell". The items list switches to a 2-col grid of timer cards each carrying a "Los" button. The sticky bottom CTA disappears. Tap "Los" on one card. The card transitions to cooking and counts down. Wait for the card to reach ready. The "Anrichten" button appears.
9. Try opening `/session` directly while in manual mode. The URL bounces back to `/plan`.
10. Switch back to "Jetzt", tap "Los, fertig um HH:MM". The Session screen opens with the master countdown in massive condensed numerals, a 2-col grid of timer cards each with a 92px progress ring, and a top-bar carrying the "Live" pulsing dot, the wake-lock chip, the eating-time badge, and a "Beenden" button.
11. Wait for an alarm to fire (e.g. flip alarm at half cook). The alarm banner pinned to the bottom slides in, gradient ember-to-emberDim, with a flame glyph, the trigger eyebrow, the item name plus action verb, and a circular confirm button. The banner pulses subtly. Tap the confirm button. The banner dismisses.
12. Drive every item to plated state. The session does not auto-end after 60 seconds; the screen stays put. Tap "Beenden". The session ends and routes back to Home.
13. Open Settings. The "Darstellung" section shows the System/Hell/Dunkel three-way segmented control. Tap "Hell". The whole app inverts to a warm off-white background; the ember accent stays the same hue. Tap "Dunkel". The app returns to dark.
14. Expand the "Auflegen" event row in Signale. Five tones render with names Glut, Funke, Kohle, Klassik, Lautlos and short descriptions. Tap the play button on Glut, Funke, Kohle, Klassik in turn; each plays a short, distinct sound. Tap the play button on Lautlos; nothing plays. Pick a tone other than the default. Reload the app; the choice persisted.
15. Toggle airplane mode on the device. Reload the app. Every screen renders in the correct typography (Barlow Condensed for the condensed numerals, Inter for body text). No fallback fonts visible.
