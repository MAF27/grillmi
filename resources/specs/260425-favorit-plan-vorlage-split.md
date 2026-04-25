# Favorit and Plan-Vorlage Split

## Meta

- Status: Draft
- Branch: feature/favorit-plan-vorlage-split

---

## Business

### Goal

Untangle the two "favorite-like" concepts that v1 collapsed into one. A Favorit is a single configured grillable that the user can drop into any plan with one tap. A Plan-Vorlage is a saved list of items, a whole grill setup. The current v1 ships only the latter under the name "Favorit", which is wrong for both terminology and ergonomics.

### Proposal

Split the existing `Favorite` feature into two independent features. `Favorit` becomes a single-item preset (cut + thickness or prep + Garstufe + cooking parameters) addable from inside the AddItemSheet. `Plan-Vorlage` keeps the current behaviour of saving and reloading a whole plan, but is renamed and moved off the "Favoriten" navigation. Both are stored locally in IndexedDB and persist offline.

### Behaviors

#### Favoriten (single configured grillable)

1. The user configures a grillable in the AddItemSheet (Kategorie, Stück, Dicke / Variante, Garstufe). Once a valid configuration is reached, an "Als Favorit speichern" inline action appears at the bottom of the specs step alongside the existing Hinzufügen button. The user taps it, types a name in a small inline input, confirms with the keyboard return key. The Favorit is saved and the sheet stays open so the user can still hit Hinzufügen.
2. From the AddItemSheet's first step, a "Favoriten" tab sits next to "Kategorie" as a sibling-pivot. Tapping the Favoriten tab swaps the sheet body to a vertical list of saved Favoriten. Each row shows the Favorit name, a one-line summary ("Entrecôte 3 cm, medium-rare, 2 Seiten"), and a last-used timestamp.
3. Tapping a Favorit row applies the configuration (categorySlug, cutSlug, thicknessCm, prepLabel, doneness, cookSeconds, restSeconds, flipFraction, idealFlipPattern, heatZone) and closes the sheet, adding the item directly to the plan. The Favorit's lastUsedEpoch is updated.
4. Long-press on a Favorit row opens an action sheet with Umbenennen and Löschen.
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

---

## Technical

### Approach

The work is a localized refactor across the schema, the IDB layer, two stores, the AddItemSheet, the Plan screen, and one route rename. Risk is bounded because the existing flow is wholly contained in `src/lib/stores/favoritesStore.svelte.ts`, `src/lib/stores/db.ts`, `src/routes/favorites/+page.svelte`, and `src/lib/components/FavoriteCard.svelte`. No scheduler, ticker, or session code is touched.

The schema change is the linchpin. `src/lib/schemas/index.ts` introduces a new `favoriteSchema` that encodes a single configured grillable (the planned-item fields minus the id) and renames the existing `favoriteSchema` to `savedPlanSchema`. The TS aliases `Favorite` and `SavedPlan` follow. `src/lib/models/index.ts` re-exports both.

The IDB layer (`src/lib/stores/db.ts`) bumps `DB_VERSION` from 1 to 2 and introduces a v1 to v2 upgrade path inside the existing `upgrade(db, oldVersion)` callback: when `oldVersion < 2`, read all records out of `favorites`, create a new `plans` object store, write the records into `plans` keyed by the record's `id`, delete the old `favorites` store, then create a fresh `favorites` store for the new Favorit shape. The accessor functions split: `listSavedPlans / putSavedPlan / deleteSavedPlan` operate on `plans`; `listFavorites / putFavorite / deleteFavorite` operate on the new `favorites` store with the new shape.

The store layer mirrors the schema split. The current `src/lib/stores/favoritesStore.svelte.ts` is renamed to `savedPlansStore.svelte.ts` and its types swap to `SavedPlan`. A new `favoritesStore.svelte.ts` is written from scratch, modeled on the same shape (init, save, rename, remove, touch, all) but with `Favorite` (single-item) values and a `loadIntoSheet(id): Favorite | null` action that the AddItemSheet calls.

The AddItemSheet (`src/lib/components/AddItemSheet.svelte`) gains a `tab` state with values `'categories' | 'favorites'` rendered only on the first step. The category-pivot UI remains; a sibling pivot is added. When `tab === 'favorites'`, the sheet body renders a list view bound to `favoritesStore.all`. Tapping a Favorit calls `oncommit` with the Favorit's payload plus a fresh id and closes the sheet via `onclose`. An empty state is rendered when `favoritesStore.all.length === 0`. The "Als Favorit speichern" inline action is added to the specs step's footer; it captures the in-progress configuration via the existing `$state` variables.

The Plan screen's existing favorite-saving button is relabeled and rewired. It currently calls `favoritesStore.save(name, plan.items)`; after the split, it calls `savedPlansStore.save(name, plan.items)`. The label changes from "Als Favorit speichern" to "Plan speichern".

The route rename moves `src/routes/favorites/+page.svelte` to `src/routes/plans/+page.svelte`. `FavoriteCard.svelte` is renamed to `SavedPlanCard.svelte` and its store import is updated. The Home screen's CTA label changes accordingly. SvelteKit's `adapter-static` regenerates the route map on build; nothing else needs to know about the path change because there are no internal hardcoded links to `/favorites` outside the Home page CTA. Home page navigation strings are auto-detected as part of Phase 2.

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
| The new "Favoriten" tab in AddItemSheet collides with the existing back-chevron behaviour. | The tab pivot only renders on step `'category'`. Back from `'cut'` returns to `'category'` and preserves whichever tab was active before forward navigation. The state graph adds one boolean (`tab`) and is reset to `'categories'` on sheet open. |
| Plan-Vorlage and Favorit naming bleed into the codebase inconsistently. | The schema rename is the single source of truth. Every `Favorite` typeref in the codebase is updated to either `Favorite` (new shape, single item) or `SavedPlan` (old shape, list) explicitly. The TypeScript compiler enforces it; a `pnpm exec tsc --noEmit` pass blocks merge if any reference is wrong. |
| Existing tests reference `favoritesStore` as the saved-plan store. | Rename the test file to `savedPlansStore.test.ts` and update assertions. Add a new `favoritesStore.test.ts` covering the single-grillable shape. |
| The "Als Favorit speichern" inline action in AddItemSheet conflicts with the existing Hinzufügen button. | Both actions are idempotent. The inline save persists the Favorit but does not close the sheet; Hinzufügen still adds the configured item to the plan. The user can do either order. The label and disabled-state rules mirror Hinzufügen so the affordance is symmetric. |

### Implementation Plan

#### Phase 1: Schema and IDB

1. [ ] In `src/lib/schemas/index.ts`, rename `favoriteSchema` to `savedPlanSchema` (and `Favorite` type to `SavedPlan`). Define a new `favoriteSchema` shaped as `{ id, name, categorySlug, cutSlug, thicknessCm, prepLabel, doneness, label, cookSeconds, restSeconds, flipFraction, idealFlipPattern, heatZone, createdAtEpoch, lastUsedEpoch }`. Export `Favorite` and `SavedPlan` types.
2. [ ] In `src/lib/models/index.ts`, re-export `Favorite` and `SavedPlan`.
3. [ ] In `src/lib/stores/db.ts`, bump `DB_VERSION` to 2, extend the `GrillmiDB` interface with `plans`, update the `upgrade(db, oldVersion)` callback so v1 to v2 migrates `favorites` records into a new `plans` store and recreates `favorites` for the new shape, split the accessor functions (`listSavedPlans / putSavedPlan / deleteSavedPlan` + new `listFavorites / putFavorite / deleteFavorite`), update `resetAll` to clear all four stores.
4. [ ] Update the test-only fake-IDB setup (`tests/setup.ts` or wherever `__resetForTests` is wired) to handle v2.

#### Phase 2: Stores

1. [ ] Rename `src/lib/stores/favoritesStore.svelte.ts` to `src/lib/stores/savedPlansStore.svelte.ts`. Rename the exported `favoritesStore` to `savedPlansStore`. Type swap to `SavedPlan`. Update its db.ts imports (`listSavedPlans`, `putSavedPlan`, `deleteSavedPlan`).
2. [ ] Write a new `src/lib/stores/favoritesStore.svelte.ts` modeled on `savedPlansStore` but holding `Favorite` (single-item) values. Methods: `init`, `save(name, config)`, `rename(id, name)`, `remove(id)`, `touch(id)`, `all`, `_reset`.
3. [ ] Find every existing import of `favoritesStore` across the codebase. For uses that consume the saved-plan list (Plan screen, `/favorites` route, `FavoriteCard.svelte`), swap to `savedPlansStore`. Run `pnpm exec tsc --noEmit` to confirm the rename is consistent.

#### Phase 3: UI - Plan-Vorlagen route

1. [ ] Move `src/routes/favorites/+page.svelte` to `src/routes/plans/+page.svelte`. Rename `src/lib/components/FavoriteCard.svelte` to `src/lib/components/SavedPlanCard.svelte`. Update imports inside the moved page and the card.
2. [ ] Update copy on the Plan-Vorlagen page: header "Plan-Vorlagen", empty-state copy reads "Noch keine Plan-Vorlage gespeichert. Stelle einen Plan zusammen und tippe auf Plan speichern.", action sheet labels remain Umbenennen / Löschen.
3. [ ] Update Home (`src/routes/+page.svelte`) so the existing "Favoriten" CTA becomes "Plan-Vorlagen" and links to `/plans`. Confirm no other `/favorites` link exists.
4. [ ] Rename the `tests/e2e/favorites.spec.ts` test file to `tests/e2e/saved-plans.spec.ts` and update the route assertion to `/plans`.

#### Phase 4: UI - AddItemSheet Favoriten tab and inline save

1. [ ] In `src/lib/components/AddItemSheet.svelte`, add `let tab = $state<'categories' | 'favorites'>('categories')`. Reset to `'categories'` in the existing `reset()` function. Render the tab pivot above the body only when `step === 'category'`.
2. [ ] When `tab === 'favorites'`, render a vertical list bound to `favoritesStore.all`. Each row shows name, summary, last-used. Tap calls `oncommit` with the Favorit's PlannedItem-shaped payload (omit Favorit-only fields like createdAtEpoch / lastUsedEpoch / Favorit name; pass cookSeconds, restSeconds, flipFraction, idealFlipPattern, heatZone, plus a fresh id supplied by sessionStore.addItem). Then close via `onclose()`. Call `favoritesStore.touch(id)` after commit.
3. [ ] Render an empty-state view when `favoritesStore.all.length === 0`: one-line copy "Du hast noch keine Favoriten. Stelle einen Stück zusammen und speichere ihn unten." plus a button "Zur Kategorie" that flips `tab` back to `'categories'`.
4. [ ] In the sheet's specs step footer, add an "Als Favorit speichern" inline action. Tap shows an inline name input field. Confirm via the input's enter key calls `favoritesStore.save(name, currentConfig)`. The sheet stays open and the user can still tap Hinzufügen.
5. [ ] Update `src/lib/components/AddItemSheet.svelte`'s back-button rules: from `step === 'category'` with `tab === 'favorites'`, the back gesture returns the user to `tab === 'categories'`, not closing the sheet, so a casual mis-tap on the tab does not exit the flow.

#### Phase 5: UI - Plan screen

1. [ ] In `src/routes/plan/+page.svelte`, rename the "Als Favorit speichern" button to "Plan speichern". Rewire the click handler to `savedPlansStore.save(name, plan.items)`.
2. [ ] Confirm the existing "Favorit laden" UI on the plan screen (if any) is removed or relabeled to "Plan-Vorlage laden" and points at `savedPlansStore`.

#### Phase 6: Polish

1. [ ] Update `resources/specs/260424-2-grillmi-app.md` "Post-launch corrections" section: move "Favorit and Plan-Vorlage split" from Deferred to Done, summarize what shipped.
2. [ ] Run `pnpm test:unit && pnpm test:components && pnpm test:e2e && pnpm lint && pnpm build`. All green.
3. [ ] Manual smoke on `pnpm dev`: configure an item, save as Favorit, reopen sheet, tap Favoriten tab, tap the saved item, confirm it lands in the plan. Save the plan as Plan-Vorlage, navigate to /plans, tap it, confirm items reload.

---

## Testing

Tests are implementation tasks. Every checkbox below is part of Phase 2-5 work above; no separate testing phase.

### Unit Tests (`tests/unit/*.test.ts`)

1. [ ] `savedPlansStore.test.ts` (renamed from `favoritesStore.test.ts`):
   - `test_save_saved_plan` saves an item list as a SavedPlan and persists.
   - `test_rename_saved_plan` renames in IDB and in-memory.
   - `test_delete_saved_plan` removes from both.
   - `test_load_saved_plan_into_store` (existing `test_load_favorite_as_plan` renamed) confirms loading replaces plan items with fresh ids.
2. [ ] `favoritesStore.test.ts` (new):
   - `test_save_favorite_persists_single_item` saves a configured grillable, reads it back.
   - `test_rename_favorite` updates the name in IDB.
   - `test_delete_favorite` removes from IDB.
   - `test_touch_favorite_updates_last_used` advances lastUsedEpoch on touch and reorders the list.
   - `test_favorites_init_returns_empty_list_on_fresh_db` confirms first-run path.
3. [ ] `db.migration.test.ts` (new):
   - `test_v1_to_v2_moves_records_into_plans` seeds a fake-IDB v1 with two records in `favorites`, opens at v2, asserts both records are now in `plans` and the new `favorites` store is empty.
   - `test_v1_to_v2_drops_old_favorites_store` confirms the old shape is gone.
   - `test_fresh_install_at_v2_creates_both_stores` confirms a no-data first-open path.

### Component Tests (`tests/components/*.test.ts`)

1. [ ] `AddItemSheet.test.ts` (additions):
   - `test_first_step_renders_categories_and_favorites_tabs` confirms both tab buttons are present at step 'category'.
   - `test_favorites_tab_lists_saved_favorites` seeds the store and asserts rendered rows.
   - `test_favorites_tab_empty_state` asserts empty-state copy and the "Zur Kategorie" CTA.
   - `test_tap_favorite_commits_and_closes_sheet` mocks `oncommit` and `onclose`, taps a Favorit row, asserts both fired with the right payload.
   - `test_specs_step_inline_save_favorite` stubs `favoritesStore.save`, fills in name input, presses enter, asserts the call.
2. [ ] `SavedPlanCard.test.ts` (renamed from `FavoriteCard.test.ts` if such test exists; otherwise add):
   - `test_renders_name_and_item_count` confirms the card.
   - `test_long_press_opens_action_sheet` confirms the umbenennen / löschen affordance.

### E2E Tests (`tests/e2e/*.spec.ts`)

1. [ ] `saved-plans.spec.ts` (renamed from `favorites.spec.ts`):
   - `test_save_and_reload_saved_plan` saves a session as a Plan-Vorlage, navigates to `/plans`, taps it, sees the Plan pre-populated. Existing assertion, just routed through the renamed action.
2. [ ] `favorites.spec.ts` (new):
   - `test_save_favorite_from_sheet` opens the AddItemSheet, configures a cut, taps "Als Favorit speichern", names it, asserts the Favoriten tab now lists it.
   - `test_load_favorite_into_plan` opens the AddItemSheet, taps the Favoriten tab, taps a seeded Favorit, asserts the sheet closes and the plan now includes the configured item.
3. [ ] `migration.spec.ts` (new, runs against a real-browser IDB):
   - `test_v1_database_migrates_to_v2_on_app_open` seeds an IDB at v1 with one record in `favorites`, opens the app, navigates to `/plans`, asserts the seeded record appears as a Plan-Vorlage.
