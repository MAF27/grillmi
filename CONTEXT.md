# Domain Context

## Grillmi

Grillmi is a multi-timer BBQ companion PWA. The core domain is one user planning and running a "Grillade" (a cookout) with one or more "Grillstücke" (items on the grill) tracked through their cook lifecycle. The app is German-first; this glossary uses German user-facing language and notes English code names where they diverge.

### Core domain objects

| Term | Definition | Translations | Aliases to avoid | Appears in |
| ---- | ---------- | ------------ | ---------------- | ---------- |
| **Grillade** | A single cookout event, owned by one user, progressing through `planned`, `running`, and `finished` phases. The canonical noun for the whole event. | Grillade ⇔ cookout | Session, Plan, Programm | `backend/grillmi/models/grillade.py`, `src/lib/stores/db.ts:15`, `src/routes/plan/+page.svelte:135` |
| **Grillstück** | A single item being grilled inside a Grillade (e.g. a steak, a Cervelat). One domain concept, three code shapes: `PlannedItem` (pre-start), `SessionItem` (in-flight), `GrilladeItem` (backend row). | Grillstück / Grillstücke (de) ⇔ grill item (en) | "item" alone | `src/lib/schemas/index.ts:5,36`, `backend/grillmi/models/grillade_item.py` |
| **Favorit** | A single-item shortcut for a frequently cooked Grillstück; adds directly into a Grillade without opening the cut picker. | Favorit / Favoriten (de) ⇔ favorite (en) | | `src/lib/schemas/index.ts:64`, `backend/grillmi/models/favorite.py`, `src/lib/components/AddItemSheet.svelte` |
| **TimelineEvent** | A cooking milestone recorded during a running Grillade with `kind`, `itemName`, and epoch. The five kinds are `on` (Auflegen), `flip` (Wenden), `resting` (Ruhen), `ready` (Fertig), `plated` (Anrichten). Distinct from the backend `audit_log`, which tracks auth events. | Kochereignis (de, informal) | ActivityLog (UI component name), AuditLog (different concern) | `src/lib/stores/db.ts:9`, `src/lib/stores/grilladeStore.svelte.ts:421` |

### Lifecycle state

| Term | Definition | Translations | Aliases to avoid | Appears in |
| ---- | ---------- | ------------ | ---------------- | ---------- |
| **GrilladeStatus** | Lifecycle phase of a Grillade: `planned` (draft, no Session yet), `running` (Session is live), `finished` (Session ended; row appears in Chronik). | Grilladen-Status (de) | | `backend/grillmi/models/grillade.py`, `src/lib/stores/db.ts:18` |
| **ItemStatus** | Lifecycle phase of a Grillstück inside a running Session: `pending`, `cooking`, `resting`, `ready`, `plated`. | Grillstück-Status (de) | | `src/lib/schemas/index.ts:3` |
| **Modus** | The user-facing scheduling mode chosen on the segmented control with options `Jetzt`, `Auf Zeit`, and `Manuell`. `Jetzt` and `Auf Zeit` let the scheduler stagger items; `Manuell` requires the user to start each Grillstück by hand. | Modus (de) ⇔ mode (en) | scheduling mode (too generic) | `src/routes/plan/+page.svelte:22-24`, `src/lib/components/desktop/DesktopCockpit.svelte:26-28` |

### Timing and scheduling

| Term | Definition | Translations | Aliases to avoid | Appears in |
| ---- | ---------- | ------------ | ---------------- | ---------- |
| **targetEpoch** | The target eating time (millisecond epoch) the scheduler works backward from to determine each Grillstück's put-on moment. | Essenszeit (de) | | `src/lib/schemas/index.ts:22`, `src/lib/stores/grilladeStore.svelte.ts:38` |
| **putOnEpoch** | The millisecond epoch when a Grillstück is placed on the grill (Auflegen). The anchor for all derived timing on that item. | Auflegezeitpunkt (de, informal) | startedEpoch (that is when the Grillade itself transitions to `running`, a different moment) | `src/lib/schemas/index.ts:37`, `src/lib/scheduler/schedule.ts:11` |
| **flipEpoch / doneEpoch / restingUntilEpoch** | Derived per-item epochs: when to flip (`putOnEpoch + cookSeconds * flipFraction`), when cooking finishes (`putOnEpoch + cookSeconds`), and when resting ends (`doneEpoch + restSeconds`). The last marks the transition from `resting` to `ready`. | Wende-, Fertig-, Ruhe-Zeitpunkt (de) | | `src/lib/schemas/index.ts:38-40`, `src/lib/scheduler/schedule.ts` |
| **overdue** | Flag set when a Grillstück's computed `putOnEpoch` falls in the past; the scheduler shifts the item to now and flags it so the UI can warn the user. | überfällig (de) | | `src/lib/schemas/index.ts:42`, `src/lib/scheduler/schedule.ts:38` |
| **Vorlauf** | User-configurable advance warning in seconds before a cooking event (put-on, flip, or done alarm); defaults to 15 s each. | Vorlauf (de) ⇔ lead time (en) | leadPutOnSeconds, leadFlipSeconds, leadDoneSeconds (code field names) | `src/lib/schemas/index.ts:108`, `src/lib/components/desktop/SettingsCockpit.svelte` |

### Cooking actions

These five German verbs name the `TimelineEvent.kind` values and double as alarm labels.

- **Auflegen** ⇔ put on (the grill); `kind = 'on'`.
- **Wenden** ⇔ flip; `kind = 'flip'`.
- **Ruhen** ⇔ rest; `kind = 'resting'`.
- **Fertig** ⇔ done / ready; `kind = 'ready'`.
- **Anrichten** ⇔ plate / serve; `kind = 'plated'`.

### Item specification

| Term | Definition | Translations | Aliases to avoid | Appears in |
| ---- | ---------- | ------------ | ---------------- | ---------- |
| **cutSlug** | Short machine-readable identifier for the meat cut (e.g. `ribeye`, `cervelat`) used to look up timing rows from the bundled catalogue. Backend column is `cut_id`. | Schnittbezeichnung (de, informal) | cut_id (backend wire name; canonical term in spec discussion is cutSlug) | `src/lib/schemas/index.ts:8`, `backend/grillmi/models/grillade_item.py:20` |
| **cookSeconds** | Target cooking duration for one Grillstück; stored as a single integer on the frontend. Backend stores a range (`cook_seconds_min`, `cook_seconds_max`); the sync mapper collapses to the max value on pull. | Garzeitsekunden (de, informal) | cook_seconds_min, cook_seconds_max (backend wire names) | `src/lib/schemas/index.ts:13`, `backend/grillmi/models/grillade_item.py:24` |
| **flipFraction** | Fraction of `cookSeconds` elapsed before the flip alarm fires (0.5 = midpoint). 0 means no flip. | Wendefraktion (de, informal) | | `src/lib/schemas/index.ts:15`, `backend/grillmi/models/grillade_item.py:26` |

### Navigation

| Term | Definition | Translations | Aliases to avoid | Appears in |
| ---- | ---------- | ------------ | ---------------- | ---------- |
| **Grillen** | The sidebar entry and unified cockpit covering both pre-start planning of the active Grillade and post-start live cooking. Shows the LIVE pill while a Session is running. | Grillen (de) ⇔ grilling (en) | Planen, Cook | `src/routes/+layout.svelte:41`, `src/lib/components/desktop/DesktopCockpit.svelte` |
| **Chronik** | The sidebar entry and route at `/chronik` showing finished Grilladen. The IDB store key, API path (`/api/grilladen`), and entity name remain `grilladen`; only the UI label and route are Chronik. | Chronik (de) ⇔ history (en) | Grilladen (as a UI section label), Übersicht | `src/routes/chronik/`, `src/routes/+layout.svelte:42` |
| **Einstellungen** | The sidebar entry and route at `/settings` for user preferences (signals, appearance, units, devices, account). | Einstellungen (de) ⇔ settings (en) | | `src/routes/settings/`, `src/lib/components/desktop/SettingsCockpit.svelte` |

### Implementation-only terms

These TypeScript or Python type names show up in code but are not user-facing concepts. Use them when discussing code; do not use them in specs, design notes, or UI copy.

| Term | Definition | Aliases to avoid | Appears in |
| ---- | ---------- | ---------------- | ---------- |
| **Plan** *(implementation)* | The frontend type representing a Grillade in its `planned` state: target eating epoch, item list, and a `mode` discriminator (`now` or `time`). Persisted as `PersistedPlanState` in IDB. | Do not use "Plan" as a user-facing noun for the cookout (the noun is Grillade). | `src/lib/schemas/index.ts:21`, `src/lib/stores/db.ts:4` |
| **PlannedItem** *(implementation)* | Frontend representation of a Grillstück inside a Plan: cut spec plus cook, rest, and flip parameters. No timing epochs. | | `src/lib/schemas/index.ts:5` |
| **SessionItem** *(implementation)* | A PlannedItem enriched with live timing epochs (`putOnEpoch`, `flipEpoch`, `doneEpoch`, `restingUntilEpoch`, `platedEpoch`), `ItemStatus`, and the `overdue` flag. | | `src/lib/schemas/index.ts:36` |
| **Session** *(implementation)* | The in-memory runtime state of a running Grillade: a list of `SessionItem`, the `targetEpoch`, the cook `mode` (`auto` or `manual`), and a `createdAtEpoch`. Stored as a field on `GrilladeRow`, not a top-level entity. The Python `sessions` table tracks auth sessions and is unrelated. | "Session" for the whole cookout (the noun is Grillade). | `src/lib/schemas/index.ts:47`, `src/lib/stores/grilladeStore.svelte.ts:60` |
| **PlanMode** *(implementation)* | Frontend rune controlling whether the Session is driven by the scheduler (`auto`) or by manual per-item starts (`manual`). The user-facing surface is the Modus segmented control. | | `src/lib/stores/grilladeStore.svelte.ts:21` |
| **AutoMode** *(implementation)* | Within `auto` PlanMode, controls the staggering strategy: `now` (start immediately, stagger by cook time) or `time` (work backward from `targetEpoch`). Stored as `Plan.mode`. | | `src/lib/schemas/index.ts:27` |
| **GrilladeRow** *(implementation)* | The IDB representation of a Grillade, embedding optional `planState`, `session`, `timeline`, and `syncedItemIds` alongside server-mirrored metadata. | grilladeData | `src/lib/stores/db.ts:15` |
| **SyncQueueRow** *(implementation)* | A queued API write (POST, PATCH, or DELETE) persisted in IDB, awaiting flush once the device is online and authenticated. | pendingWrite | `src/lib/stores/db.ts:35`, `src/lib/sync/queue.ts` |
| **position** *(implementation)* | Floating-point sort key on Grillade, Grillstück, and Favorit used for user-defined ordering in a last-write-wins merge-safe way. | sortOrder, order | `backend/grillmi/models/grillade.py:31`, `backend/grillmi/models/favorite.py:24` |

### Relationships

- A **Grillade** progresses through **GrilladeStatus** (`planned` → `running` → `finished`).
- A **Grillade** in `planned` state is described by a **Plan** *(implementation)*; in `running` state it carries a **Session** *(implementation)*; in `finished` state it appears in the **Chronik**.
- A **Grillade** contains zero or more **Grillstücke**.
- A **Favorit** is a single-Grillstück preset that the user adds into a Grillade.
- Every per-item state transition during a cook appends a **TimelineEvent** to the running Grillade.

### Mismatches to resolve

- **Cross-language drift:** Frontend `cutSlug` vs backend `cut_id`. Canonical term in discussion is `cutSlug`; `cut_id` is the wire name only.
- **Structural mismatch:** Frontend `cookSeconds` (single int) vs backend `cook_seconds_min` / `cook_seconds_max` (range). The sync mapper resolves this; specs should use `cookSeconds`.
- **One concept, three code names:** `PlannedItem`, `SessionItem`, `GrilladeItem` are all the same domain concept (Grillstück) seen from three code layers. Specs and design notes should say "Grillstück"; the layer determines which shape applies.
- **Chronik vs grilladen:** UI history section is "Chronik" and the route is `/chronik`. The IDB store key, API path (`/api/grilladen`), and entity name remain `grilladen`. Do not use "Grilladen" as a sidebar or section label.
- **Session overloading:** The Python `sessions` table tracks authentication sessions (logged-in devices). The TypeScript `Session` type tracks a running Grillade. Different concepts sharing a name; say "auth session" or "cooking session" when ambiguity matters.

### Cleanup follow-ups

The following code paths reference a deprecated "Menü" / "Plan-Vorlage" feature that no UI exposes. They have no canonical glossary entry on purpose. A follow-up cleanup spec should rip them out. The sidebar has exactly three entries: **Grillen**, **Chronik**, **Einstellungen**. There is no Übersicht.

- `src/lib/models/index.ts` exports a `Menu = SavedPlan` alias.
- `src/lib/stores/db.ts` keeps a `SavedPlan` type and a `listSavedPlans()` helper.
- `src/lib/sync/firstLogin.ts` migrates `menus` on first login.
- `src/lib/stores/grilladeStore.svelte.ts` exposes `loadFromMenu(items)` (called from `+page.svelte` and `chronik/+page.svelte` to load past-Grillade items into a fresh Grillade; rename to something like `loadFromTemplate` or `loadFromGrillade`).
- `backend/grillmi/routes/menus.py`, `backend/grillmi/models/menu.py`, the `menus` and `menu_items` tables.

### Example dialogue

> **Developer:** I need to add a delay before the Auflegen alarm. Where does that live?
>
> **Marco:** That is the **Vorlauf** for put-on. It is a field on `UserSettings` called `leadPutOnSeconds`. The alarm fires `leadPutOnSeconds` seconds before the Grillstück's `putOnEpoch`.
>
> **Developer:** And in **Manuell** mode there is no `putOnEpoch` yet, right?
>
> **Marco:** Correct. In **Manuell** **Modus** the Grillstück sits at a far-future sentinel until the user taps "Los" on the card. At that point the **ItemStatus** transitions from `pending` to `cooking` and `putOnEpoch` is fixed to now.
>
> **Developer:** And once every Grillstück is `plated`, does the Grillade auto-finish?
>
> **Marco:** Yes. `DesktopCockpit` calls `grilladeStore.endSession()`, which sets **GrilladeStatus** to `finished` and the row appears in the **Chronik** on the next pull.
