# Grillmi v1 — UI Architecture

## 1. Visual Direction

Grillmi is a personal power tool, not a consumer cooking app. The aesthetic is **industrial-warm dark**: near-black backgrounds (#0D0D0D family expressed as tokens), ember-orange as the primary accent, with a monospaced or semi-condensed heading typeface that reads like a timer display. Think analog instrument panel meets outdoor Garmin device — functional, high-contrast, slightly tactile. The Migros Migusto cartoon approach is explicitly rejected: it reads well in a store context, not in direct sunlight on a grill table. This direction achieves three things: (1) maximum legibility under noon Swiss sun via near-white text on very dark backgrounds, (2) thumb-friendly chunky touch targets that feel confident with greasy fingers, (3) fast visual parsing — state colors are immediately distinct without reading text. Dark mode is primary; light mode is a secondary variant that uses off-white backgrounds and preserves the ember accent.

---

## 2. Design Tokens

All tokens are defined as Tailwind 4 CSS-first `@theme` blocks. Components reference token names only — no raw hex or px values anywhere in component code.

### 2.1 Color Tokens

```css
@theme {
	/* Foreground */
	--color-fg-base: oklch(96% 0 0); /* primary text */
	--color-fg-muted: oklch(65% 0 0); /* secondary/meta text */
	--color-fg-subtle: oklch(40% 0 0); /* placeholder, disabled text */
	--color-fg-on-accent: oklch(10% 0 0); /* text on ember accent */
	--color-fg-on-status: oklch(10% 0 0); /* text on status color chips */
	--color-fg-inverse: oklch(10% 0 0); /* text on light surfaces (light mode) */

	/* Background */
	--color-bg-base: oklch(8% 0 0); /* page/app base */
	--color-bg-surface: oklch(12% 0 0); /* card, sheet */
	--color-bg-elevated: oklch(16% 0 0); /* modal, popover */
	--color-bg-input: oklch(14% 0.005 270); /* form input fill */
	--color-bg-overlay: oklch(0% 0 0 / 60%); /* modal scrim */

	/* Accent — ember orange */
	--color-accent-default: oklch(68% 0.19 45); /* primary action, highlights */
	--color-accent-hover: oklch(72% 0.2 45);
	--color-accent-muted: oklch(68% 0.19 45 / 20%); /* soft accent fill */

	/* Timer-state colors */
	--color-state-pending: oklch(55% 0.08 270); /* muted blue-grey — waiting */
	--color-state-pending-bg: oklch(55% 0.08 270 / 15%);
	--color-state-cooking: oklch(68% 0.19 45); /* ember orange — active */
	--color-state-cooking-bg: oklch(68% 0.19 45 / 15%);
	--color-state-resting: oklch(72% 0.15 80); /* warm amber — resting */
	--color-state-resting-bg: oklch(72% 0.15 80 / 15%);
	--color-state-ready: oklch(65% 0.18 145); /* green — ready to plate */
	--color-state-ready-bg: oklch(65% 0.18 145 / 15%);
	--color-state-plated: oklch(45% 0 0); /* grey — dismissed */
	--color-state-plated-bg: oklch(45% 0 0 / 10%);

	/* Semantic */
	--color-error-default: oklch(60% 0.22 25);
	--color-error-bg: oklch(60% 0.22 25 / 15%);
	--color-success-default: oklch(65% 0.18 145);
	--color-warning-default: oklch(75% 0.18 85);

	/* Border */
	--color-border-subtle: oklch(22% 0 0);
	--color-border-default: oklch(30% 0 0);
	--color-border-strong: oklch(45% 0 0);
	--color-border-accent: var(--color-accent-default);
}
```

#### Light Mode Override

```css
@theme {
	.light {
		--color-fg-base: oklch(12% 0 0);
		--color-fg-muted: oklch(40% 0 0);
		--color-fg-subtle: oklch(60% 0 0);
		--color-bg-base: oklch(97% 0 0);
		--color-bg-surface: oklch(100% 0 0);
		--color-bg-elevated: oklch(95% 0 0);
		--color-bg-input: oklch(93% 0 0);
		--color-border-subtle: oklch(88% 0 0);
		--color-border-default: oklch(78% 0 0);
		--color-border-strong: oklch(60% 0 0);
		/* Accent and state colors remain identical — no change needed */
	}
}
```

### 2.2 Typography Tokens

```css
@theme {
	/* Families */
	--font-display: 'DIN Condensed', 'Barlow Condensed', ui-sans-serif, system-ui, sans-serif;
	--font-body: 'Inter', ui-sans-serif, system-ui, sans-serif;
	--font-mono: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;

	/* Scale (rem, base 16px) */
	--font-size-xs: 0.75rem; /* 12px — meta labels */
	--font-size-sm: 0.875rem; /* 14px — secondary content */
	--font-size-md: 1rem; /* 16px — body default */
	--font-size-lg: 1.125rem; /* 18px — card headings */
	--font-size-xl: 1.375rem; /* 22px — section headings */
	--font-size-2xl: 1.75rem; /* 28px — timer countdown */
	--font-size-3xl: 2.5rem; /* 40px — master clock */
	--font-size-4xl: 3.5rem; /* 56px — hero countdown */

	/* Weight */
	--font-weight-regular: 400;
	--font-weight-medium: 500;
	--font-weight-semibold: 600;
	--font-weight-bold: 700;

	/* Leading */
	--leading-tight: 1.1;
	--leading-snug: 1.25;
	--leading-normal: 1.5;
	--leading-relaxed: 1.625;

	/* Tracking */
	--tracking-tight: -0.02em;
	--tracking-normal: 0em;
	--tracking-wide: 0.05em;
	--tracking-widest: 0.12em; /* state labels, caps */
}
```

### 2.3 Spacing Tokens

```css
@theme {
	--space-0: 0;
	--space-1: 0.25rem; /* 4px */
	--space-2: 0.5rem; /* 8px */
	--space-3: 0.75rem; /* 12px */
	--space-4: 1rem; /* 16px */
	--space-5: 1.25rem; /* 20px */
	--space-6: 1.5rem; /* 24px */
	--space-8: 2rem; /* 32px */
	--space-10: 2.5rem; /* 40px */
	--space-12: 3rem; /* 48px */
	--space-16: 4rem; /* 64px */
	--space-20: 5rem; /* 80px */
	--space-24: 6rem; /* 96px */
}
```

### 2.4 Shape & Elevation Tokens

```css
@theme {
	/* Radii */
	--radius-sm: 6px;
	--radius-md: 10px;
	--radius-lg: 16px;
	--radius-xl: 24px;
	--radius-full: 9999px;

	/* Shadows — subtle on dark; more visible on light */
	--shadow-sm: 0 1px 2px oklch(0% 0 0 / 30%);
	--shadow-md: 0 4px 12px oklch(0% 0 0 / 40%);
	--shadow-lg: 0 8px 32px oklch(0% 0 0 / 50%);
	--shadow-glow-accent: 0 0 16px oklch(68% 0.19 45 / 35%);
	--shadow-glow-ready: 0 0 16px oklch(65% 0.18 145 / 35%);

	/* Z-index */
	--z-base: 0;
	--z-card: 10;
	--z-sticky: 50;
	--z-overlay: 100;
	--z-modal: 200;
	--z-toast: 300;
}
```

### 2.5 Motion Tokens

```css
@theme {
	/* Durations */
	--duration-instant: 80ms;
	--duration-fast: 150ms;
	--duration-normal: 250ms;
	--duration-slow: 400ms;
	--duration-deliberate: 600ms;

	/* Easings */
	--ease-default: cubic-bezier(0.4, 0, 0.2, 1);
	--ease-out: cubic-bezier(0, 0, 0.2, 1);
	--ease-in: cubic-bezier(0.4, 0, 1, 1);
	--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
	--ease-linear: linear;
}
```

---

## 3. Component Inventory

| Component | Purpose | Key Props | States | Behavior Notes |
| --- | --- | --- | --- | --- |
| `TimerCard` | Live session card per grilling item | `status: pending\|cooking\|resting\|ready\|plated`, `label: string`, `timeRemaining: number`, `timeLabel: string`, `category: string` | pending, cooking, resting, ready, plated, alarm-firing | Left border stripe color = state color token. Alarm state pulses border and icon. Swipe-right to mark plated. Tap expands detail. |
| `MasterClock` | Sticky countdown to dinner time | `targetTime: Date`, `itemsRemaining: number` | normal, warning (<15 min), critical (<5 min), done | Monospaced font, `font-size-3xl`. Sticky at top of session screen. Background shifts to `state-cooking-bg` when warning. |
| `AlarmBanner` | Full-width intrusive alarm notification | `message: string`, `actionLabel: string`, `severity: info\|urgent` | entering, visible, dismissed | Slides in from top over MasterClock. Auto-dismiss after 8s or on tap. Urgent = ember orange background + haptic. |
| `PlanItemRow` | Editable row in Plan screen item list | `label: string`, `category: string`, `cut: string`, `thickness: number`, `doneness: string`, `cookDuration: number` | default, editing, removing | Drag handle on left for reorder. Swipe-left reveals delete. Tap anywhere opens inline editor drawer. |
| `CategoryPicker` | First step of item add: pick food group | `selected: string` | default, selected | Grid of large icon+label tiles. Rows of 2. Min tile 80x80px. |
| `CutPicker` | Pick the specific cut within category | `category: string`, `selected: string` | default, selected | Vertical scrollable list; items are tall enough for thumb tap (min 56px row). |
| `ThicknessPicker` | Stepper 0.5–6 cm in 0.5 cm steps | `value: number`, `min: 0.5`, `max: 6`, `step: 0.5` | default, at-min, at-max | Large minus/plus buttons (min 56x56px). Current value displayed in center at `font-size-2xl`. Haptic on each step. |
| `DonenessSelector` | Pick doneness level | `options: string[]`, `selected: string`, `unavailableOptions: string[]` | default, selected, unavailable | Horizontal chip row. Unavailable options shown muted with strikethrough — not hidden. |
| `TargetTimePicker` | Set "we eat at" time | `value: Date` | default, editing | Native `<input type="time">` invoked via a styled trigger button. Wraps native time picker for iOS compatibility. Shows relative label ("in 1 h 30 min"). |
| `ItemLabelInput` | Optional custom name for a timer | `value: string`, `placeholder: string` | empty, filled, focused | Single-line text input. Character limit 40. Shows remaining count at 30+. |
| `SessionHeader` | Top bar for session screen | `sessionLabel: string`, `itemCount: number`, `onEnd: fn` | normal, ending-confirm | Contains MasterClock + "End session" ghost button. End requires hold-to-confirm (500ms press) to prevent accidental tap. |
| `StateGroupHeader` | Section label grouping cards by state | `state: string`, `count: number` | collapsed, expanded | Collapsible. Pending and Plated groups collapse by default when count > 3. |
| `FavoriteCard` | Saved preset on Favorites screen | `name: string`, `itemCount: number`, `lastUsed: Date` | default, hover, loading | Tap triggers session rebuild from preset. Long-press reveals rename/delete actions. |
| `SoundPicker` | Assign a chime to an alarm event | `event: put-on\|flip\|done`, `selected: string`, `sounds: Sound[]` | default, previewing | Tap a sound row to preview it. Checkmark on selected. |
| `EmptyState` | Zero-content placeholder | `title: string`, `description: string`, `cta: string`, `onCta: fn` | default | Centered. Uses muted icon from icon set. CTA maps to primary Button. |
| `Button` | Primary interactive control | `variant: primary\|secondary\|ghost\|destructive`, `size: sm\|md\|lg`, `loading: boolean`, `disabled: boolean` | default, hover, focus, active, disabled, loading | Min 44x44px. Loading shows spinner in place of label, aria-busy=true. |
| `IconButton` | Single icon action | `icon: string`, `label: string` (aria), `size: sm\|md\|lg` | default, hover, focus, active, disabled | Min 44x44px. Always has visible tooltip/aria-label. |
| `ProgressRing` | Circular cook-progress indicator | `progress: 0–1`, `state: string`, `size: sm\|md` | active, complete | SVG ring. Stroke color = state color token. Used inside TimerCard. |
| `ToastNotification` | Low-priority ephemeral feedback | `message: string`, `duration: number` | entering, visible, leaving | Bottom of screen. Max 1 visible. Does not interrupt interaction. |
| `HoldButton` | Destructive action requiring hold | `label: string`, `holdDuration: number`, `onConfirm: fn` | idle, holding, confirmed | Shows fill progress on hold. Prevents accidental taps on End Session and Delete. |

---

## 4. Interaction Patterns

### 4.1 Home / Empty State

The screen shows a centered EmptyState with two actions: "Neue Session" (primary Button) and "Favoriten" (ghost Button). No navigation rail — bottom tab bar appears once a session exists or the user navigates. First-time users see a three-line explainer inline, not a modal onboarding. One tap, into Plan.

### 4.2 Plan Screen — Item Addition Flow

Item addition uses a **bottom sheet with cascading steps**, not a single tall form. Each step fits on one screen without scrolling. The sequence is:

1. CategoryPicker — grid of 6–8 categories (Fleisch, Wurst, Fisch, Gemüse, Brot, Käse, Maiskolben, Früchte). Tap selects and auto-advances.
2. CutPicker — scrollable list for the selected category. Tap selects and auto-advances.
3. ThicknessPicker — stepper only. Large minus/plus. Tap "Weiter" to advance.
4. DonenessSelector — horizontal chip row. Unavailable options are visually muted but present. Tap selects and auto-advances.
5. ItemLabelInput — optional name field. Pre-filled with inferred label ("Entrecôte 3 cm, medium"). Keyboard shown immediately; "Übernehmen" button in keyboard toolbar confirms.

Each step shows a back-chevron in the sheet header — no back button in the main nav. Swiping the sheet down cancels. A step indicator (5 dots) shows position. The sheet does not animate between steps — it cross-fades the content within the same sheet height to avoid jarring layout shifts.

The computed cook time appears as a summary line at the bottom of the sheet across all steps (updates live as inputs change), so the user always sees the consequence.

Back in the Plan list, the item appears as a PlanItemRow. Reorder via drag handle (long-press activates, visual lift feedback). Delete via swipe-left.

"Target time" (TargetTimePicker) lives at the top of the Plan screen above the item list, not inside the sheet — it belongs to the session, not to any single item.

**Go button**: A full-width primary Button fixed at the bottom of the Plan screen. Disabled until at least one item is added and a target time is set. Label shows "Los — Essen um 19:30" once both are set.

### 4.3 Session Screen — Live View

**Layout on iPhone portrait:**

- `SessionHeader` + `MasterClock` — sticky top bar, ~72px tall. Does not scroll away.
- Card list — scrollable. Cards grouped by state with collapsible `StateGroupHeader` sections, ordered: Cooking (top, never collapsed), Resting, Ready, Pending, Plated.
- No bottom tab bar during an active session — it would compete with alarm banners. A single "Menü" icon button in the session header opens a slide-over for settings access.

**Card layout within TimerCard:**

- Left: 4px wide border stripe in state color.
- Top-left: item label (`font-size-lg`, `font-weight-semibold`).
- Top-right: ProgressRing (md size).
- Center: countdown time (`font-size-2xl`, `font-mono`).
- Bottom-left: state label in caps (`font-size-xs`, `tracking-widest`, state color).
- Bottom-right: next event label (e.g., "Wenden in 4:30").

Cards are 100% container width. No horizontal scrolling. Cards do not resize between states — the same fixed height (~112px) persists to prevent CLS on state changes.

**Alarm interaction:** AlarmBanner slides in from the top over the MasterClock area. It names the item and the action ("Entrecôte jetzt auflegen"). Tapping it dismisses it. It also fires a sound (per-event assignment) and a haptic. The banner auto-dismisses after 8 seconds. Multiple simultaneous alarms queue: one banner at a time, next appears when current is dismissed or times out.

**Marking plated:** Swipe-right on a Ready card reveals a green "Aufgetragen" confirm. This is a one-step action (no hold required, reversal is not provided in v1). The card animates out downward and if a Plated group exists it moves there collapsed.

**20-card scenario:** With many items, grouping keeps Cooking cards visible at top. Pending cards collapse when all are waiting. The user scrolls within the list; the MasterClock never scrolls out of view.

### 4.4 Favorites Screen

A scrollable list of FavoriteCards. Each card shows name, item count summary line, and last-used date. One tap starts a new Plan pre-populated from the preset (does not immediately go Live — user reviews the Plan screen first and can adjust). Long-press shows an action sheet: "Umbenennen", "Löschen".

Empty state: "Noch keine Favoriten — nach einer Session als Favorit speichern."

### 4.5 Settings Screen

Three sections: Töne, Darstellung, Über Grillmi. Each section is a grouped list. No nested navigation for v1 — everything fits on one scrollable screen. Sound picker opens a modal bottom sheet. Appearance toggle is an inline segmented control (System / Hell / Dunkel).

---

## 5. Accessibility Checklist

### Sunlight Legibility

- [ ] All text tokens meet WCAG 2.2 AA (4.5:1 for body, 3:1 for large text) — verified against `bg-base` and `bg-surface`.
- [ ] State colors are verified at 4.5:1 against their paired `*-bg` background tokens, not just against `bg-base`.
- [ ] State labels use both color AND a text label AND an icon — color is never the sole differentiator.
- [ ] `font-size-md` (16px) minimum for all interactive labels.
- [ ] No grey text lighter than `fg-muted` token on dark surfaces.

### Touch & Motor

- [ ] All interactive elements meet 44x44px minimum tap target (iOS HIG).
- [ ] ThicknessPicker buttons are 56x56px — thumbs are imprecise on a wet grill table.
- [ ] Swipe targets have sufficient drag threshold (>20px) before triggering to prevent accidental activation.
- [ ] HoldButton requires 500ms continuous press — prevents one-handed accidental taps.
- [ ] No hover-only interactions — all hover effects are cosmetic only.

### Keyboard and Switch Access

- [ ] All interactive elements reachable by keyboard Tab order.
- [ ] Focus indicator: 2px solid `color-accent-default` outline, 2px offset — visible on all backgrounds.
- [ ] Modal/sheet traps focus correctly and restores on close.
- [ ] Cascading picker steps navigable with arrow keys within each step.
- [ ] Drag-to-reorder in PlanItemRow has a keyboard alternative (up/down arrow buttons visible on focus).

### Screen Readers

- [ ] TimerCard announces state changes via `aria-live="polite"` on the state label region.
- [ ] AlarmBanner uses `role="alert"` (assertive) — it must interrupt the reader.
- [ ] MasterClock uses `aria-live="off"` — it updates every second and must NOT spam the reader. Provide a static readable label ("Essen in 1 Stunde 24 Minuten") updated every 30s.
- [ ] ProgressRing includes `aria-label` describing cook progress in text ("Entrecôte: 60% gegart").
- [ ] Icon-only buttons (IconButton) have `aria-label` in German.
- [ ] DonenessSelector unavailable options have `aria-disabled="true"`, not `disabled` — they remain discoverable.

### Reduced Motion

- [ ] All Svelte `transition:` and `animate:` directives are wrapped in a `prefers-reduced-motion` check.
- [ ] Under reduced motion: card state changes are instant opacity swaps; AlarmBanner appears without slide; no pulsing on alarm-firing state.

### Haptics

- [ ] Alarm events fire a haptic (Notification Impact, `success` or `error` type matching alarm severity) in addition to sound — for users with hearing aids or earbuds.
- [ ] ThicknessPicker fires Selection haptic on each step increment.
- [ ] Swipe-to-plate confirmation fires a success haptic on confirm.

---

## 6. Motion Guidelines

The principle is: **motion serves information, not delight**. The user is outside, focused on meat. Every animation must complete before the user needs to interact with the result.

### What to animate

| Transition | Duration | Easing | Notes |
| --- | --- | --- | --- |
| TimerCard state change (border color, bg fill) | `duration-normal` (250ms) | `ease-default` | Color token swap only — no geometry change. Prevents CLS. |
| AlarmBanner enter (slide from top) | `duration-fast` (150ms) | `ease-out` | Fast entry — user needs to see it NOW. |
| AlarmBanner exit (slide to top) | `duration-normal` (250ms) | `ease-in` | Slower exit is acceptable. |
| TimerCard alarm-firing pulse | 1000ms loop | `ease-linear` | 3px border oscillates between `state-cooking` and `color-accent-default`. Stops when acknowledged. Respect `prefers-reduced-motion`. |
| Bottom sheet enter | `duration-slow` (400ms) | `ease-spring` | Slight overshoot reads as physical — grounding for touch. |
| Bottom sheet exit | `duration-normal` (250ms) | `ease-in` | — |
| Card plated exit | `duration-slow` (400ms) | `ease-default` | Height collapses to 0 after opacity fade. Use Svelte `animate:flip` for list reflow. |
| Plan → Session transition | `duration-deliberate` (600ms) | `ease-default` | Full screen crossfade. The list of items "becomes" the session cards — shared layout if possible, else simple fade. |
| Cascading picker step cross-fade | `duration-fast` (150ms) | `ease-default` | Content swaps within fixed-height sheet. No slide — reduces motion debt. |
| StateGroupHeader collapse/expand | `duration-normal` (250ms) | `ease-out` | Height tween + chevron rotation. |

### What NOT to animate

- The MasterClock countdown digit changes — no flip or slide. Monospaced font + fixed width means digits update in place without layout noise.
- ThicknessPicker value number change — instant.
- Any loading skeleton → content swap — use opacity crossfade only, no position change.

---

## 7. Responsive Strategy

### Breakpoints

```css
@theme {
	--breakpoint-mobile: 0px; /* 0–767px — iPhone portrait, primary */
	--breakpoint-tablet: 768px; /* 768–1023px — iPad portrait / small landscape */
	--breakpoint-desktop: 1024px; /* 1024px+ — laptop/desktop planning */
}
```

### Mobile (0–767px) — Primary

- Single column. Full-width cards. Bottom sheet pattern for all overlays.
- MasterClock sticky at top, ~72px tall.
- No persistent navigation during active session.
- Bottom tab bar (Home / Plan / Favoriten / Einstellungen) for non-session screens. Tab bar height 83px (iOS safe area compliant).
- Font sizes use the upper half of the scale — never below `font-size-md`.

### Tablet (768–1023px)

- Session screen: two-column card grid (Cooking left, Resting+Ready right).
- Plan screen: item list left, live summary panel right (shows computed schedule as timeline).
- Bottom sheet promoted to centered modal dialog with backdrop, max-width 560px.
- Tab bar becomes a left sidebar rail (icon + label, 72px wide).
- MasterClock stays sticky top but expands to `font-size-4xl`.

### Desktop (1024px+)

- Three-column layout for session: Pending (left, collapsible), Cooking (center, prominent), Done/Resting/Ready (right).
- Plan screen: full side-by-side with item list and visual timeline.
- Bottom sheets become right-side drawer panels (480px wide, slide from right).
- Hover states activate. Keyboard navigation fully exercised.
- No mobile-specific touch affordances hidden — they remain accessible.

### Touch Targets

- Mobile: 44x44px minimum (Apple HIG). Control buttons that require precision (ThicknessPicker) are 56x56px.
- Tablet/Desktop: 36x36px minimum acceptable when pointer is available. Touch targets remain 44x44px when `hover: none` media query is true.

### Safe Areas

- `env(safe-area-inset-bottom)` applied to bottom tab bar and fixed bottom buttons.
- `env(safe-area-inset-top)` applied to SessionHeader on iPhone notch/Dynamic Island devices.

### Dark Mode

Dark is the default (class-based toggle on `<html>`). System preference read on first load. User override stored in `localStorage`. Token swap is pure CSS — no JS required for theme application.

---

## 8. Iconography

**Recommendation: Phosphor Icons (phosphor-icons/phosphor-svelte) as the base set, with custom food SVGs for category tiles.**

Rationale:

- Phosphor has consistent stroke weight across 1000+ icons, available in 6 weights. Use `bold` weight (2.5px stroke) for all UI chrome — it reads at 20–24px under sunlight better than `regular`.
- Phosphor includes timer, alarm, flame, thermometer, utensils, and most needed BBQ-adjacent concepts.
- The `phosphor-svelte` package exports individual components — tree-shakeable, no icon font bloat.
- Lucide is also a valid alternative (similar API) but has thinner strokes that are harder to read at small sizes in direct light.

**Food category icons (Fleisch, Wurst, Fisch, Gemüse, Maiskolben, etc.):**

Phosphor does not have sausage, corn, or steak cuts. Strategy:

- Commission or source 8–12 custom SVG food icons. Style guide: 24x24px viewBox, single fill color (no strokes), designed for `bg-surface` token background.
- Source option: Streamline HQ food pack or Noun Project — both offer commercial licenses and consistent line art. Do not use emoji-style icons — they look inconsistent across iOS versions.
- Alternatively, use high-quality food emoji rendered as image in category tiles as a v1 shortcut, swapping to custom SVGs in v1.1. Document this as a known debt item.

**Icon sizing scale:**

```css
@theme {
	--icon-sm: 16px;
	--icon-md: 20px;
	--icon-lg: 24px;
	--icon-xl: 32px;
}
```

Use `icon-lg` (24px) for all primary UI actions. Use `icon-md` (20px) inside buttons. Use `icon-xl` (32px) for category tiles and empty states.

---

## 9. Open Questions

These are product decisions that block Spec 2. All are resolved with Marco in the spec-create session that follows this document.

- **Flip schedule data model** — whether flip events are a single percentage (e.g. always at 50%), a fixed array per cut (for reverse-sear every 60s), or a hybrid.
- **Multiple flips per cut** — some reverse-sear cuts flip every 60s. Data model must support N flip events per cut.
- **Favorites creation flow** — explicit "Save as favorite" button vs auto-save-to-history with later promotion.
- **iOS PWA alarm reliability under screen lock** — Wake Lock API (iOS 18.4+) keeps timers running while the screen is on; behavior when the user locks the phone needs a product decision (warn before lock, require Wake Lock acknowledgment, or accept the limitation with clear onboarding).
