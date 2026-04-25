# Grillmi — Claude Design Brief

**Live URL:** <https://grillmi.cloud>

Hand this file to Claude Design (claude.com → Design tab) along with a link to this repository (`/opt/grillmi`) and the live app at the URL above. Claude Design will use the codebase to extract existing tokens and component patterns; this brief tells it the goal, the audience, and where the current design falls short.

Screenshots of the current state live in `resources/docs/screenshots/` and are referenced inline below.

---

## 1. What Grillmi is

A multi-timer BBQ companion PWA. The user is grilling several different items at once (steaks, sausages, vegetables, etc.) and needs to know **what to put on when** and **when to flip / pull / rest** so everything finishes at the same moment. Migros' "Grilltimer by Migusto" inspired the data model; Grillmi is the better-feeling replacement.

**Form factor**: installable PWA, mobile-first (used outdoors at the grill, one-handed, possibly with greasy fingers), works offline, dark UI by default.

**Audience**: home cooks who take grilling seriously enough to want timing accuracy but aren't pro chefs. They are German/Swiss-German speakers — all UI copy is in German.

---

## 2. Top-line goals for this design pass

1. **Look-and-feel modernization** — current visuals are functional but feel like a developer-made internal tool. Make it feel like a premium consumer app worth paying attention to. Less "utilitarian database UI", more "confident outdoor companion".
2. **Plan-page layout & flow** — the page where the user assembles a session is the most-used surface. It's currently dense and a little awkward (mode toggle, time card, item list, two action buttons, sticky CTA). Make it more delightful and faster to compose.
3. **Session/timer screen polish** — the active-cooking screen needs to be glanceable from across the garden. Status grouping, alarm prominence, and timer legibility should all improve.
4. **First-run / empty states** — currently barren. Should feel inviting — onboard the user with a hint of what's possible without a tutorial wall.

---

## 3. The three screens

### 3a. Home (`/`)

→ `screenshots/01-home.png`

Currently shows: app title, single tagline, three stacked buttons (Neue Session / Favoriten / Einstellungen), conditional "App installieren" button.

What should change:

- The home screen does almost nothing today — it's a launchpad. It could _show_ the user something instead: most-recent favorites, a quick "start grilling now" path, a hero illustration that signals "this is a tool for outdoors / fire / meat" without being kitschy.
- The install-app affordance should not look like a fourth equal-weight option — it's a one-time CTA.

### 3b. Plan (`/plan`)

→ `screenshots/02-plan-empty.png` (empty state) → `screenshots/06-plan-with-items.png` (three items: a thickness+doneness cut, a no-choice cut, a prep-variant cut)

This is where the real work happens. The user:

1. Picks a planning **mode** — "Jetzt starten" (start now, finish time computed) or "Auf Uhrzeit" (pick eating time, work backward).
2. Sees the eating time prominently.
3. Adds items via "+ Gericht" (opens a category → cut → specs sheet).
4. Optionally adds items from a **favorite** (★ button — appends to the current plan).
5. For each item in the list: can rename inline, can adjust cook time ±30 s, can swipe-to-delete, can tap meta line to open the spec sheet, can re-edit.
6. Can save the current plan as a favorite.
7. Hits the big sticky CTA at the bottom to start.

Pain points:

- The mode toggle ("Jetzt starten / Auf Uhrzeit") looks like a generic tab strip. It deserves a treatment that signals "this changes the whole timeline behaviour".
- Item rows are dense. They carry: title (renamable), description (thickness/doneness/prep), cook-time stepper (±30 s buttons), drag-to-delete affordance. Layout should keep all of this without feeling cluttered.
- The eating-time card ("Fertig um 19:30") should feel like the centerpiece when there are items. When empty, it should encourage adding.
- The "Als Favorit speichern" button currently lives below the list — it's easy to miss. The favorites flow (save + append) deserves a more deliberate visual home.

### 3c. Session (`/session`)

→ `screenshots/09-session.png` (just-started state)

The active-grilling screen. The user has hit "Los" and items are now staggered through their cooking timeline.

What's there:

- Master clock at the top (minutes/seconds to eating time).
- Session-level header (active state pill, end-session button, wake-lock indicator).
- Items grouped by status: Pending → Cooking → Resting → Ready → Plated. Plated is collapsed by default. Each group has a header with count.
- Each item is a TimerCard showing a progress ring, label, time remaining/elapsed, and action affordance (e.g. "On grill", "Flip now", "Plate it").
- Alarm banner overlays the screen when a put-on / flip / done event fires, with a chime.
- Auto-ends 60 s after every item is plated.

Pain points:

- The TimerCard is the workhorse but the progress ring is small and hard to read at arm's length. Sizing, contrast, and motion are conservative.
- Status groups are functional but visually undifferentiated — the user can't tell at a glance whether they're behind, on track, or ahead.
- The alarm banner is a flat coloured bar. It should feel more urgent without being annoying.
- The eating-time countdown should feel like the _anchor_ of the whole screen, not a small clock at the top.

### 3d. Favorites (`/favorites`) — secondary

→ `screenshots/07-favorites.png`

Lists saved plan presets. Tap loads into plan (replaces). Long-press triggers a `window.prompt`-based action menu (rename / delete) — that's clearly a placeholder and should become a proper sheet.

### 3e. Settings (`/settings`) — secondary

→ `screenshots/08-settings.png`

Theme (System / Hell / Dunkel), per-event chime selection (Auflegen / Wenden / Fertig × 8 chimes), about/version. Mostly fine; design pass should align it with the rest of the new visual language.

---

## 4. Add-Item Sheet (`AddItemSheet.svelte`) — the most-touched flow

→ `screenshots/03-additem-category.png` (Kategorie tile grid) → `screenshots/04-additem-cut.png` (Stück list, Rind selected) → `screenshots/05-additem-specs.png` (Specs step with Dicke + Garstufe + live cook estimate)

The bottom sheet that opens when the user taps "+ Gericht". It walks: **Kategorie → Stück → (optional) Specs**.

- **Kategorie** is an 11-tile grid: Rind, Kalb, Schwein, Lamm, Geflügel, Wurst, Spiessli, Fisch, Gemüse, Früchte, Spezial. Tiles are equal — bland. They could carry visual identity (icon, photo, colour) without becoming kitsch.
- **Stück** is a vertical list of cut names (~10 items per category typically). It's a wall of text. Could surface thickness range or a tiny indicator of difficulty/cook-time.
- **Specs** appears only when there is a real choice to make. Three things may show:
  - Dicke (thickness) — `±` stepper in 0.5 cm increments
  - Variante (preparation variant, e.g. "Whole / Sliced") — list of options, only shown when >1 option
  - Garstufe (doneness — Bleu / Rare / Medium-rare / Medium / Medium-well / Well-done) — chips, only shown when >1 option
- The footer of the sheet shows "Geschätzte Garzeit" + "Ruhezeit" live as the user adjusts. This is great signal — should stay prominent.
- "Übernehmen" commits and closes. There is no longer a separate naming step (renaming happens inline on the plan list).

The sheet is the user's main interaction surface. It deserves the most care: tile design, list density, doneness chip styling, the specs reveal animation.

---

## 5. Current design tokens

All defined in `src/app.css` under `@theme` (Tailwind 4 / OKLCH). Key values:

**Palette** (dark theme is the default):

- Background: very dark neutrals (8% / 12% / 16% lightness)
- Foreground: near-white (96%) and muted greys
- Accent: warm orange (~oklch(68% 0.19 45)) — think "ember"
- States: cooking = accent orange, resting = warm yellow, ready = green, pending = cool blue-grey, plated = muted grey
- Error: red, success: green, warning: yellow

**Typography**:

- Display: DIN Condensed / Barlow Condensed — used for headings, app name
- Body: Inter
- Mono: JetBrains Mono / Fira Code — used for times and timers
- Sizes: xs (0.75) → 4xl (3.5)

**Shape**:

- Radii: sm 6, md 10, lg 16, xl 24, full
- Spacing: 4 px grid (`--space-1` = 4 px, `--space-4` = 16 px)

**Elevation**:

- Three soft shadows + a glow-accent (orange) and glow-ready (green) used sparingly

The token system is solid — keep it. The brief is to use it more confidently and selectively, not to replace it.

---

## 6. Components inventory (reference for Claude Design)

Located under `src/lib/components/`:

- `Button.svelte` — variants: primary / secondary / ghost; sizes: sm / md / lg; fullWidth flag.
- `TimerCard.svelte` — the workhorse. Progress ring, status pill, label, time, action affordance. **Most visible component during a session.**
- `PlanItemRow.svelte` — plan-list row. Inline rename, ±30 s cook adjuster, swipe-to-delete, tap-meta-to-edit-spec. **Most visible component during planning.**
- `AddItemSheet.svelte` — the multi-step bottom sheet. **Highest-value redesign target.**
- `AlarmBanner.svelte` — overlay banner during an alarm.
- `MasterClock.svelte` — countdown to eating time at the top of the session screen.
- `SessionHeader.svelte` — session-level controls (end / state).
- `StateGroupHeader.svelte` — collapsible group header (e.g. "Cooking · 3").
- `ProgressRing.svelte` — SVG ring used inside TimerCard.
- `TargetTimePicker.svelte` — time-of-day picker in plan mode.
- `EmptyState.svelte`, `FirstRunNotice.svelte` — empty states & welcome.
- `FavoriteCard.svelte` — favorite list row.
- `HoldButton.svelte` — long-press confirmation primitive.

---

## 7. Constraints

- **Mobile-first**: 375–428 px portrait is the design target. Tablet/desktop should adapt but are secondary.
- **Outdoors readability**: high contrast, large hit targets (≥44 px), text legible in sunlight.
- **One-handed use**: primary CTAs near the bottom, swipes lateral.
- **Offline**: no network calls; static assets only. (Hero illustrations, icons — all bundled.)
- **No backend**: nothing to design that talks to a server.
- **Localisation**: German UI. Display fonts must support German diacritics. No flag toggles, no English fallback.
- **Accessibility**: all interactive elements have aria-labels, dark/light/system theme switch must work, motion-reduce should be respected.
- **PWA chrome**: launches standalone, no browser address bar visible. Bottom safe area must be respected (`env(safe-area-inset-bottom)` is already used).

---

## 8. Outputs we want from Claude Design

In rough order of priority:

1. A high-fidelity mockup of the **plan page** in two states: empty, and with 4 items (one of each shape — thickness-based, prep-based, doneness-based, no-choice).
2. A high-fidelity mockup of the **session page** mid-cook: 1 cooking item (mid-progress), 1 resting, 1 ready (alarm just fired), 1 still pending. Show the alarm banner.
3. The **AddItemSheet** at each of its three steps (Kategorie tiles, Stück list, Specs page with all three sections visible).
4. A refreshed **home/welcome screen** that feels like an invitation.
5. Updated **design tokens** (colour, type ramp, spacing if anything changes) in a copy-pasteable format compatible with the Tailwind 4 `@theme` block in `src/app.css`.
6. Optional: a small set of **category icons or illustrations** (SVG) for the 11 Kategorie tiles.

---

## 9. Non-goals

- New features. The feature surface is set; this round is about visual identity and layout polish.
- Replacing the data model or component architecture. Tokens and styles, yes; props and behaviours, no.
- A light theme that's a separate visual identity. Light theme should be a tonal inversion, not a different design.
- Branding (logo system, marketing site). Just the app surfaces.

---

## 10. How to deliver back to Claude Code

When the design is ready, export the Claude Design handoff bundle. Pasting the bundle path into Claude Code in this repo will let it implement the new tokens and component layouts directly into the existing files (`src/app.css`, `src/lib/components/*.svelte`, `src/routes/*/+page.svelte`).
