# Favorit and Plan-Vorlage Split

## Meta

- Status: Implemented
- Branch: feature/favorit-plan-vorlage-split

---

## Business

### Goal

Untangle the two "favorite-like" concepts that v1 collapsed into one. A Favorit is a single configured grillable that the user can drop into any plan with one tap. A Plan-Vorlage is a saved list of items, a whole grill setup. The current v1 ships only the latter under the name "Favorit", which is wrong for both terminology and ergonomics.

### Proposal

Split the existing `Favorite` feature into two independent features. `Favorit` becomes a single-item preset (cut + thickness or prep + Garstufe + cooking parameters) addable from inside the AddItemSheet. `Plan-Vorlage` keeps the current behaviour of saving and reloading a whole plan, but is renamed and moved off the "Favoriten" navigation. Both are stored locally in IndexedDB and persist offline.

### Behaviors

#### Favoriten (single configured grillable)

1. The user configures a grillable in the AddItemSheet (Kategorie, Stück, Dicke / Variante, Garstufe). Once a valid configuration is reached, an "Als Favorit speichern" inline action appears at the bottom of the specs step alongside the existing "Übernehmen" primary button. The user taps it, types a name in a small inline input, confirms with the keyboard return key. The Favorit is saved and the sheet stays open so the user can still tap "Übernehmen" to add the configured item to the plan in the same flow.
2. From the AddItemSheet's first step, a "Favoriten" tab sits next to "Kategorie". Tapping the Favoriten tab swaps the sheet body to a vertical list of saved Favoriten. Each row shows the Favorit name, a one-line summary derived from the saved item label (e.g. "Rinds-Entrecôte 3 cm, Medium-rare"), and a last-used date in Swiss locale.
3. Tapping a Favorit row applies its full configuration (categorySlug, cutSlug, thicknessCm, prepLabel, doneness, label, cookSeconds, restSeconds, flipFraction, idealFlipPattern, heatZone) and closes the sheet, adding the item directly to the plan. The label persisted on the Favorit is reused as the PlannedItem's label so the row reads the same way it did when the Favorit was saved. The Favorit's lastUsedEpoch is updated.
4. Long-press on a Favorit row offers two actions: Umbenennen and Löschen. v1 implements both with `window.prompt` / `window.confirm`, mirroring the existing `/favorites` page pattern.
5. If no Favoriten exist yet, the Favoriten tab shows an empty state: a one-line explainer and a CTA pointing the user back to the Kategorie tab to configure one.
6. Favoriten persist across sessions, app restarts, and offline use. Limit: none in v1 beyond the IndexedDB quota.

#### Plan-Vorlagen (saved list of items)

1. The Plan screen's existing "Als Favorit speichern" button is renamed to "Plan speichern". It works identically: prompts for a name, captures the current item list, persists.
2. The existing `/favorites` route is renamed to `/plans`. The page title becomes "Plan-Vorlagen". The Home screen's "Favoriten" CTA is renamed "Plan-Vorlagen".
3. Tapping a Plan-Vorlage card pre-populates the plan with its items (with fresh ids and a fresh default target time) and navigates to `/plan`. lastUsedEpoch is updated.
4. Long-press a Plan-Vorlage card opens Umbenennen and Löschen.
5. Plan-Vorlagen persist across sessions and restarts, same as Favoriten.

#### Migration

1. On first app open after this change ships, the IDB upgrade callback bumps the version from 1 to 2. Every existing record in the v1 `favorites` object store is moved into the new `plans` object store (the value shape is identical, the type alias just renames). The old `favorites` store is then deleted and a fresh `favorites` store is created for the new single-grillable Favorit shape.
2. The migration is silent and idempotent. The user does not see a prompt; they see their existing items under "Plan-Vorlagen" instead of "Favoriten" with no data lost.

### Out of scope

1. Cloud sync, sharing, or export of Favoriten or Plan-Vorlagen. Local-only.
2. Editing a saved Favorit's parameters in place (no "edit" action). The user re-saves with the same name to overwrite, or deletes and re-saves.
3. Re-ordering the Favorit list manually. Sorted by lastUsedEpoch descending.
4. Capacity limits or pruning. v1 trusts IDB quota.
5. A separate "Favoriten" navigation entry on Home. Favoriten live inside the AddItemSheet only; that is the entire surface.
6. Migration UI or rollback path. The IDB v1 to v2 migration is silent.
7. Re-resolving a Favorit's cached cooking parameters against the current `timings.generated.json`. Once a Favorit is saved, its `cookSeconds`, `restSeconds`, `flipFraction`, `idealFlipPattern`, and `heatZone` are frozen. If the data pipeline changes a row that a Favorit captured, the Favorit keeps its old numbers. Re-resolving on apply is deferred to a later spec.
8. Uniqueness on Favorit / Plan-Vorlage names. Two entries can share a name; the long-press affordance uses ids internally so this does not break the UI.
9. Toast / snackbar feedback after "Als Favorit speichern". v1 relies on the inline name field clearing as the implicit confirmation. A success toast can land in a follow-up.

---

## Technical

### Approach

The work is a localized refactor across the schema, the IDB layer, two stores, `sessionStore` (two method renames), the AddItemSheet, the Plan screen, the Home screen CTA, and one route rename. Risk is bounded because the existing favorite-related flow is wholly contained in `src/lib/stores/favoritesStore.svelte.ts`, `src/lib/stores/db.ts`, `src/lib/stores/sessionStore.svelte.ts` (two methods only), `src/routes/favorites/+page.svelte`, `src/routes/plan/+page.svelte`, and `src/lib/components/FavoriteCard.svelte`. The scheduler, the alarm ticker, and the rest of the session lifecycle are not touched.

The schema change is the linchpin. `src/lib/schemas/index.ts` introduces a new `favoriteSchema` that encodes a single configured grillable (the planned-item fields minus the id) and renames the existing `favoriteSchema` to `savedPlanSchema`. The TS aliases `Favorite` and `SavedPlan` follow. `src/lib/models/index.ts` re-exports both.

The IDB layer (`src/lib/stores/db.ts`) bumps `DB_VERSION` from 1 to 2 and introduces a v1 to v2 upgrade path inside the existing `upgrade(db, oldVersion)` callback: when `oldVersion < 2`, read all records out of `favorites`, create a new `plans` object store, write the records into `plans` keyed by the record's `id`, delete the old `favorites` store, then create a fresh `favorites` store for the new Favorit shape. The accessor functions split: `listSavedPlans / putSavedPlan / deleteSavedPlan` operate on `plans`; `listFavorites / putFavorite / deleteFavorite` operate on the new `favorites` store with the new shape.

The store layer mirrors the schema split. The current `src/lib/stores/favoritesStore.svelte.ts` is renamed to `savedPlansStore.svelte.ts` and its types swap to `SavedPlan`. A new `favoritesStore.svelte.ts` is written from scratch, modeled on the same shape (init, save, rename, remove, touch, all, \_reset) but holding `Favorite` (single-item) values. The AddItemSheet reads `favoritesStore.all` directly and dispatches its existing `oncommit` callback when a Favorit row is tapped; no bespoke "loadIntoSheet" action is needed.

The two `sessionStore` methods that consume saved-plan items today (`loadFromFavorite(items)` and `appendFromFavorite(items)`) are renamed to `loadFromSavedPlan(items)` and `appendFromSavedPlan(items)`. The names are misleading after the split because "Favorite" now means a single configured grillable, not a list. Body of each method is unchanged.

The AddItemSheet (`src/lib/components/AddItemSheet.svelte`) gains a `tab` state with values `'categories' | 'favorites'` rendered only on the first step (`step === 'category'`) and only when the sheet is opened in add mode (`initial === null`); edit mode bypasses the tab and skips straight to the specs step as today. The category-pivot UI remains; a sibling pivot is added. When `tab === 'favorites'`, the sheet body renders a list view bound to `favoritesStore.all`. Tapping a Favorit calls `oncommit` with the Favorit's PlannedItem-shaped payload (omit Favorit-only fields createdAtEpoch / lastUsedEpoch / Favorit name; include label, cookSeconds, restSeconds, flipFraction, idealFlipPattern, heatZone, and the cut identifiers) and closes the sheet via `onclose`. The Plan screen's `commit` handler then assigns a fresh id via `sessionStore.addItem`. An empty state is rendered when `favoritesStore.all.length === 0`. The "Als Favorit speichern" inline action is added to the specs step's footer; it captures the in-progress configuration via the existing `$state` variables. Long-press on a Favorit row uses the same 500 ms timer pattern that `FavoriteCard.svelte` already implements.

The Plan screen's existing favorite-saving button is relabeled and rewired. It currently calls `favoritesStore.save(name, plan.items)`; after the split, it calls `savedPlansStore.save(name, plan.items)`. The label changes from "Als Favorit speichern" to "Plan speichern".

The Plan screen also has a second affordance today: an inline `★ Favorit` button (visible when `favoritesStore.all.length > 0`) that opens a bottom sheet listing existing entries and appends one to the current plan via `sessionStore.appendFromFavorite`. Under the new model that affordance is a Plan-Vorlage loader. It is relabeled to `★ Plan-Vorlage`, the modal heading switches to "Plan-Vorlage hinzufügen", the hint copy reads "Tippe auf eine Plan-Vorlage. Die Einträge werden an deinen Plan angehängt.", and it is wired to `savedPlansStore.all` plus `sessionStore.appendFromSavedPlan`. Single-item Favoriten are not surfaced here; their entry point is the AddItemSheet.

The route rename moves `src/routes/favorites/+page.svelte` to `src/routes/plans/+page.svelte`. `FavoriteCard.svelte` is renamed to `SavedPlanCard.svelte` and its store import is updated. The Home screen's CTA label changes accordingly. SvelteKit's `adapter-static` regenerates the route map on build. The only internal references to `/favorites` outside the Home page CTA are `tests/e2e/a11y.spec.ts` (axe scan) and the e2e specs that prime IndexedDB at version 1 (`alarms.spec.ts`, `resume.spec.ts`); all are updated as implementation tasks below.

### Approach Validation

1. **Single-record IDB migrations are well-trodden.** The pattern of "read out of old store, write into new store, drop old store" inside an `upgrade` callback is the standard `idb` recipe. The migration is small enough (the shape doesn't change for moved records, only the store name does) that no edge cases beyond "store does not exist on a fresh install" need handling, which `DB_VERSION` ordering covers.
2. **AddItemSheet's existing tab-free first step is a clean place to add a tab.** The component already centralizes step state inside one Svelte 5 Runes `$state` graph. Adding a tab pivot to the first step does not bleed into the other steps. The component test surface is small (`AddItemSheet.test.ts`) and grows by one or two cases.
3. **Two stores, two object stores.** Keeping `favorites` for single-item Favoriten and `plans` for full Plan-Vorlagen mirrors the user's mental model and stays readable in DevTools without an embedded discriminator. The cost is the rename migration, which is one-time.
4. **No external research needed.** This is a pure internal refactor following established Grillmi patterns. The naming choice ("Favorit" for single-item, "Plan-Vorlage" for list) is set by Marco and is final.

### Risks

| Risk | Mitigation |
| --- | --- |
| User reloads the app mid-migration and the v2 upgrade is half-applied. | The IDB `upgrade` callback runs inside a single transaction. Either every record moves and the old store is dropped, or the whole transaction aborts and the user reopens with v1 intact. The rename is atomic from the user's perspective. |
| User has many existing Plan-Vorlagen (current Favoriten) and the migration loop blocks app start. | Grillmi's payload is small (a handful of saved plans, each <2 KB). Even 100 records move in well under 100 ms. No progress UI is required. |
| The new "Favoriten" tab in AddItemSheet collides with the existing back-chevron behaviour. | The tab pivot only renders on `step === 'category'` and only when `initial === null`. Tapping a Favorit row commits + closes the sheet, so the favorites tab has no forward-navigation path; the only way out is "Zur Kategorie" (empty state) or back. The back chevron from `step === 'category'` with `tab === 'favorites'` flips back to `tab === 'categories'` instead of closing the sheet. The state graph adds one string (`tab: 'categories' \| 'favorites'`) which is reset to `'categories'` whenever the sheet opens. |
| Plan-Vorlage and Favorit naming bleed into the codebase inconsistently. | The schema rename is the single source of truth. The TS type `Favorite` keeps its name but gets a new shape (single configured grillable); the old shape moves under a new name `SavedPlan`. Every existing reference to `Favorite` in code that reads from the saved-plans store is updated to `SavedPlan`. The TypeScript compiler enforces this: a `pnpm exec tsc --noEmit` pass blocks merge if any consumer of the new `Favorite` type still treats it as a list. |
| Existing tests reference `favoritesStore` as the saved-plan store. | Rename the test file to `savedPlansStore.test.ts` and update assertions. Add a new `favoritesStore.test.ts` covering the single-grillable shape. |
| The "Als Favorit speichern" inline action in AddItemSheet conflicts with the existing "Übernehmen" primary button. | Both actions are idempotent. The inline save persists the Favorit but does not close the sheet; "Übernehmen" still adds the configured item to the plan. The user can do either order. The save action shares the same disabled-when-config-incomplete rule as "Übernehmen" (`specsComplete`) so the affordance is symmetric. |

### Implementation Plan

#### Phase 1: Schema and IDB

1. [x] In `src/lib/schemas/index.ts`, rename `favoriteSchema` to `savedPlanSchema` (and `Favorite` type to `SavedPlan`). Define a new `favoriteSchema` shaped as `{ id, name, categorySlug, cutSlug, thicknessCm, prepLabel, doneness, label, cookSeconds, restSeconds, flipFraction, idealFlipPattern, heatZone, createdAtEpoch, lastUsedEpoch }`. Export `Favorite` and `SavedPlan` types.
2. [x] In `src/lib/models/index.ts`, re-export `Favorite` and `SavedPlan`.
3. [x] In `src/lib/stores/db.ts`, bump `DB_VERSION` to 2, extend the `GrillmiDB` interface with a `plans: { key: string; value: SavedPlan }` member and retype `favorites` to `value: Favorite` (new shape). Update the `upgrade(db, oldVersion)` callback so it handles three entry points inside the same versionchange transaction: (a) `oldVersion < 1` creates `sessions`, `favorites`, `settings`, and `plans` from scratch, (b) `oldVersion < 2` reads all records out of the existing `favorites` store, creates `plans`, writes those records into `plans` keyed by `record.id`, deletes the old `favorites` store, and re-creates an empty `favorites` store for the new shape. Split the accessor functions: `listSavedPlans / putSavedPlan / deleteSavedPlan` operate on `plans`; the existing `listFavorites / putFavorite / deleteFavorite` keep their names but now read/write the new single-item shape. Extend `resetAll` to clear `sessions`, `favorites`, `plans`, and `settings`.
4. [x] `tests/setup.ts` only imports `fake-indexeddb/auto` and does not pin a DB version, so no change is required there. Confirm `__resetForTests` in `db.ts` still works (it just nulls the cached promise); add a unit assertion only if a v2 path needs explicit teardown.

#### Phase 2: Stores

1. [x] Rename `src/lib/stores/favoritesStore.svelte.ts` to `src/lib/stores/savedPlansStore.svelte.ts`. Rename the exported `favoritesStore` to `savedPlansStore`. Type swap to `SavedPlan`. Update its `db.ts` imports (`listSavedPlans`, `putSavedPlan`, `deleteSavedPlan`).
2. [x] Write a new `src/lib/stores/favoritesStore.svelte.ts` modeled on `savedPlansStore` but holding `Favorite` (single-item) values. Methods: `init`, `save(name, config: Omit<Favorite, 'id' | 'name' | 'createdAtEpoch' | 'lastUsedEpoch'>)`, `rename(id, name)`, `remove(id)`, `touch(id)` (updates lastUsedEpoch and re-sorts the in-memory list to the front), `all` (sorted by lastUsedEpoch desc), `_reset`.
3. [x] In `src/lib/stores/sessionStore.svelte.ts`, rename `loadFromFavorite(items)` to `loadFromSavedPlan(items)` and `appendFromFavorite(items)` to `appendFromSavedPlan(items)`. Bodies unchanged. Update the two call sites (`/plans/+page.svelte` after the route move, and `/plan/+page.svelte`'s `appendFavorite` handler).
4. [x] Find every existing import of `favoritesStore` across the codebase. For uses that consume the saved-plan list (Plan screen's "Plan-Vorlage" loader, `/plans` route, `SavedPlanCard.svelte`), swap to `savedPlansStore`. Run `pnpm exec tsc --noEmit` to confirm the rename is consistent.

#### Phase 3: UI - Plan-Vorlagen route

1. [x] Move `src/routes/favorites/+page.svelte` to `src/routes/plans/+page.svelte`. Rename `src/lib/components/FavoriteCard.svelte` to `src/lib/components/SavedPlanCard.svelte` (rename the `favorite` prop to `savedPlan` and update its `<svelte:head>` title to "Plan-Vorlagen · Grillmi"). Update imports inside the moved page and the card.
2. [x] Update copy on the Plan-Vorlagen page: header "Plan-Vorlagen", empty-state copy reads "Noch keine Plan-Vorlage gespeichert. Stelle einen Plan zusammen und tippe auf Plan speichern.", the long-press `window.prompt` menu text replaces the existing "1 — Umbenennen" / "2 — Löschen" with "1. Umbenennen" / "2. Löschen" (no em-dash), confirm-delete text becomes `Plan-Vorlage "${plan.name}" wirklich löschen?`. Action labels remain Umbenennen / Löschen.
3. [x] Update Home (`src/routes/+page.svelte`) so the existing "Favoriten" CTA becomes "Plan-Vorlagen" and links to `/plans`. Rename `openFavorites` to `openSavedPlans`. Confirm no other `/favorites` link exists.
4. [x] Update `tests/e2e/a11y.spec.ts`: rename `test_axe_core_clean_on_favorites` to `test_axe_core_clean_on_plans` and change `await page.goto('/favorites')` to `await page.goto('/plans')`.
5. [x] Update the IDB priming in `tests/e2e/alarms.spec.ts` and `tests/e2e/resume.spec.ts`: bump `indexedDB.open('grillmi', 1)` to `indexedDB.open('grillmi', 2)` and add a `plans` object store creation in the `onupgradeneeded` block alongside the existing `sessions / favorites / settings` lines so the seeded DB matches the v2 schema the app expects.
6. [x] Rename `tests/e2e/favorites.spec.ts` to `tests/e2e/saved-plans.spec.ts`, change the describe block name to `saved-plans`, retitle the test to `test_save_and_reload_saved_plan`, and update the post-save assertion to read records out of the `plans` object store (not `favorites`). The flow stays: plan an item, tap "Plan speichern", name the entry, assert one record in `plans`. Update copy assertions: input placeholder is still "Mörgeli-Plausch", but the modal heading is now "Plan speichern" and the confirm button text remains "Speichern".

#### Phase 4: UI - AddItemSheet Favoriten tab and inline save

1. [x] In `src/lib/components/AddItemSheet.svelte`, add `let tab = $state<'categories' | 'favorites'>('categories')`. Reset to `'categories'` inside the existing `reset()` function and inside the open-side branch of the `$effect` that handles `initial !== null` (edit mode forces categories tab off because edit mode bypasses the first step). Render the tab pivot above the body only when `step === 'category'` and `initial === null`.
2. [x] When `tab === 'favorites'`, render a vertical list bound to `favoritesStore.all`. Each row shows the Favorit name, a one-line summary in the form "Rinds-Entrecôte 3 cm, Medium-rare" derived from the saved label, and a last-used date formatted via `toLocaleDateString('de-CH')`. Tap calls `oncommit` with the Favorit's PlannedItem-shaped payload (categorySlug, cutSlug, thicknessCm, prepLabel, doneness, label, cookSeconds, restSeconds, flipFraction, idealFlipPattern, heatZone; every field on `Favorite` except `id`, `name`, `createdAtEpoch`, `lastUsedEpoch`). Use `void favoritesStore.touch(id)` (fire-and-forget) to update lastUsedEpoch in the background, then close via `onclose()`. The Plan screen's existing `commit` handler attaches a fresh id via `sessionStore.addItem`.
3. [x] Render an empty-state view when `favoritesStore.all.length === 0`: one-line copy "Du hast noch keine Favoriten. Stelle ein Stück zusammen und speichere es unten." plus a button "Zur Kategorie" that flips `tab` back to `'categories'`.
4. [x] In the sheet's specs step footer, add an "Als Favorit speichern" inline action rendered next to the existing "Übernehmen" primary button. Tap reveals an inline name input (max 60 chars to match `favoriteSchema.name`). Confirm via the input's Enter key calls `favoritesStore.save({ name, categorySlug, cutSlug, thicknessCm, prepLabel, doneness, label: autoLabel(), cookSeconds: computedSeconds, restSeconds, flipFraction, idealFlipPattern, heatZone })` using the existing `$state` and `$derived` values. The save action shares `specsComplete` for its disabled state. The sheet stays open after save so the user can still tap "Übernehmen".
5. [x] Add long-press support on Favorit rows: 500 ms timer pattern matching `FavoriteCard.svelte`. Long-press triggers the same two-step `window.prompt` flow the existing `/favorites` page uses: a first prompt offers `1. Umbenennen` / `2. Löschen`, then either a second `window.prompt` for the new name (calls `favoritesStore.rename(id, newName)`) or a `window.confirm` on the delete (calls `favoritesStore.remove(id)`). Tap (release before 500 ms) still applies the Favorit per task 2.
6. [x] Update `src/lib/components/AddItemSheet.svelte`'s back-button rules: from `step === 'category'` with `tab === 'favorites'`, the back gesture returns the user to `tab === 'categories'`, not closing the sheet, so a casual mis-tap on the tab does not exit the flow.

#### Phase 5: UI - Plan screen

1. [x] In `src/routes/plan/+page.svelte`, rename the "Als Favorit speichern" button to "Plan speichern". Rename the `openSaveFavorite` / `saveFavorite` handlers and the `saveAsFavoriteOpen` / `favoriteName` state variables to `openSavePlan` / `savePlan` / `savePlanOpen` / `planName`. Rewire the click handler to `savedPlansStore.save(planName, plan.items)`. The modal heading changes from "Favorit speichern" to "Plan speichern"; the `aria-label` becomes "Plan speichern"; placeholder copy stays "Name (z.B. Mörgeli-Plausch)".
2. [x] Relabel the inline `★ Favorit` button on the plan screen to `★ Plan-Vorlage`. Rename the `favoritesSheetOpen` state to `savedPlansSheetOpen`, the `appendFavorite` handler to `appendSavedPlan`, and the `openFavoritesSheet` handler to `openSavedPlansSheet`. Rewire the sheet to `savedPlansStore.all`, call `savedPlansStore.touch(id)` plus `sessionStore.appendFromSavedPlan(plan.items)` on tap, and rewrite the visible copy: dialog `aria-label` becomes "Plan-Vorlage hinzufügen", header reads "Plan-Vorlage hinzufügen", and the hint reads "Tippe auf eine Plan-Vorlage. Die Einträge werden an deinen Plan angehängt." (no em-dash).

#### Phase 6: Polish

1. [x] Update `resources/specs/260424-2-grillmi-app.md` "Post-launch corrections" section: move "Favorit and Plan-Vorlage split" from Deferred to Done, summarize what shipped.
2. [x] Run `pnpm test:unit && pnpm test:components && pnpm test:e2e && pnpm lint && pnpm build`. All green.
3. [x] Walk through the Manual Verification checklist below on `pnpm dev`. Sign-off blocks merge.

---

## Testing

Tests are implementation tasks. Every checkbox below is part of Phase 2-5 work above; no separate testing phase.

### Unit Tests (`tests/unit/*.test.ts`)

1. [x] `savedPlansStore.test.ts` (renamed from `favoritesStore.test.ts`):
   - `test_save_saved_plan` saves an item list as a SavedPlan and persists.
   - `test_rename_saved_plan` renames in IDB and in-memory.
   - `test_delete_saved_plan` removes from both.
   - `test_save_saved_plan_persists_multiple_items` (renamed from `test_load_favorite_as_plan`) saves a SavedPlan with two PlannedItem entries and asserts both round-trip through IDB.
2. [x] `favoritesStore.test.ts` (new):
   - `test_save_favorite_persists_single_item` saves a configured grillable, reads it back.
   - `test_rename_favorite` updates the name in IDB.
   - `test_delete_favorite` removes from IDB.
   - `test_touch_favorite_updates_last_used` advances lastUsedEpoch on touch and reorders the list.
   - `test_favorites_init_returns_empty_list_on_fresh_db` confirms first-run path.
3. [x] `db.migration.test.ts` (new). Each test starts by replacing `globalThis.indexedDB` with a fresh `new IDBFactory()` and calling `__resetForTests()`, mirroring the existing `tests/unit/favoritesStore.test.ts` setup. Cases:
   - `test_v1_to_v2_moves_records_into_plans` opens `grillmi` at version 1 manually with the v1 upgrade path (creating only `sessions / favorites / settings`), writes two SavedPlan-shaped records into `favorites` keyed by id, closes the connection. Then calls `getDB()` (which opens at v2). Asserts: `plans` contains both records keyed by id; the new `favorites` store exists and is empty.
   - `test_v1_to_v2_drops_old_favorites_store_shape` writes a v1-shaped record (with `items: PlannedItem[]`), runs the migration, then asserts that no record matching the old shape remains in any store (the moved records live in `plans`; the new `favorites` store rejects v1-shaped writes via the new `favoriteSchema`).
   - `test_fresh_install_at_v2_creates_all_stores` opens `getDB()` directly with no prior data and asserts all four object stores exist and are empty.

### Component Tests (`tests/components/*.test.ts`)

1. [x] `AddItemSheet.test.ts` (additions). Each new test uses the existing `open(...)` helper with `initial: null` so the tab pivot renders. Where store seeding is needed, call `await favoritesStore.save(...)` before render (and `favoritesStore._reset()` plus `__resetForTests()` plus a fresh `IDBFactory` in `beforeEach`, mirroring the unit-test pattern). Cases:
   - `test_first_step_renders_categories_and_favorites_tabs` opens with no Favoriten and asserts both tab buttons (`Kategorie`, `Favoriten`) exist when `step === 'category'`.
   - `test_favorites_tab_hidden_in_edit_mode` opens with `initial` set and asserts neither tab button is present.
   - `test_favorites_tab_lists_saved_favorites` seeds two Favoriten via `favoritesStore.save`, taps the Favoriten tab, asserts each row's name and summary text are rendered.
   - `test_favorites_tab_empty_state` opens with no Favoriten, taps the Favoriten tab, asserts the empty-state copy and the "Zur Kategorie" CTA. Tapping "Zur Kategorie" returns the body to the category grid.
   - `test_tap_favorite_commits_and_closes_sheet` seeds one Favorit, mocks `oncommit` and `onclose`, taps the row, asserts `oncommit` fires once with the PlannedItem-shaped payload (no `id`, no `name`, no `*Epoch` fields) and `onclose` fires once.
   - `test_specs_step_inline_save_favorite` walks Kategorie → Stück → Specs, stubs `favoritesStore.save`, types a name, dispatches Enter on the input, asserts `save` was called once with the full Favorit shape and that the sheet remained open (`onclose` did not fire).
2. [x] `SavedPlanCard.test.ts` (renamed from `FavoriteCard.test.ts` if such test exists; otherwise add):
   - `test_renders_name_and_item_count` confirms the card.
   - `test_long_press_opens_action_sheet` confirms the umbenennen / löschen affordance.

### E2E Tests (`tests/e2e/*.spec.ts`)

1. [x] `saved-plans.spec.ts` (renamed from `favorites.spec.ts`):
   - `test_save_and_reload_saved_plan` saves a session as a Plan-Vorlage, navigates to `/plans`, taps it, sees the Plan pre-populated. Existing assertion, just routed through the renamed action.
2. [x] `favorites.spec.ts` (new):
   - `test_save_favorite_from_sheet` opens the AddItemSheet, configures a cut, taps "Als Favorit speichern", names it, asserts the Favoriten tab now lists it.
   - `test_load_favorite_into_plan` opens the AddItemSheet, taps the Favoriten tab, taps a seeded Favorit, asserts the sheet closes and the plan now includes the configured item.
3. [x] `migration.spec.ts` (new, runs against a real-browser IDB):
   - `test_v1_database_migrates_to_v2_on_app_open` clears IDB, opens `grillmi` at version 1 with the v1 upgrade callback (creates `sessions / favorites / settings`), seeds one v1 Favorit-shaped record (a SavedPlan with name + items array) into the `favorites` store, closes the connection. Then `await page.goto('/')`, dismisses the first-run notice via the existing `dismissFirstRun` helper, navigates to `/plans`, asserts the seeded record renders as a Plan-Vorlage card with its original name and item count.

### Manual Verification

Marco walks through the following on `pnpm dev` (or the deployed PWA) before sign-off. Steps are written for a non-developer.

1. Open the deployed PWA on the device that already has v1 data installed (Marco's phone is the canonical case). The Home screen should show "Plan-Vorlagen" where it used to say "Favoriten". Tap it. Every preset that was saved before the update appears as a Plan-Vorlage with its original name and items intact. (For a fresh device with no v1 data, skip to step 4.)
2. Tap any Plan-Vorlage. The Plan screen opens with its items pre-populated and a fresh target time.
3. From the Plan screen, tap "Plan speichern", type a name, confirm. Open Home, tap "Plan-Vorlagen", verify the new entry is there. Long-press the entry. Choose Umbenennen, type a new name, confirm. Long-press again. Choose Löschen, confirm. The entry disappears.
4. From the Plan screen, tap "+ Gericht". The bottom sheet shows two tabs at the top: "Kategorie" and "Favoriten". On a fresh device the Favoriten tab shows the empty state with the "Zur Kategorie" button. Tap it. The sheet returns to the category grid.
5. Configure a grillable end-to-end (Kategorie → Stück → Dicke / Variante / Garstufe). On the specs step, tap "Als Favorit speichern", type a name, confirm with the Enter key. The sheet stays open. Tap "Übernehmen". The configured item appears in the plan.
6. Tap "+ Gericht" again. Tap the "Favoriten" tab. The just-saved Favorit is listed with its name, summary and last-used date. Tap it. The sheet closes and a second copy of that item is added to the plan.
7. Long-press a Favorit row in the sheet. Confirm Umbenennen and Löschen both work as on the Plan-Vorlagen page.
8. From the Plan screen, with at least one Plan-Vorlage saved, tap "★ Plan-Vorlage". The append sheet appears titled "Plan-Vorlage hinzufügen". Tap an entry. Its items are appended to the current plan.
9. Force-quit the app and reopen it. All Favoriten and Plan-Vorlagen are still there. Toggle airplane mode and repeat: everything still works offline.
