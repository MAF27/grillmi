# Grillmi: Architectural Deepening

## Meta

- Status: Draft
- Branch: cleanup/architectural-deepening
- Infra: none
- Runbook: none

---

## Business

### Goal

Concentrate Grillmi's lifecycle, sync, field-mapping, and account-access logic behind four small, testable interfaces so future changes touch one file instead of four. The user-facing app behaves identically before and after the refactor.

### Proposal

Extract four modules (per-noun field mappers, AccountAccess, SyncCoordinator, GrilladeLifecycle) and re-wire existing callers to talk to them. The same code paths run today as after, but through narrower seams with explicit invariants and unit tests that no longer require IndexedDB, HTTP, or Svelte mounts to drive.

### Behaviors

No user-facing behavior change. The acceptance signal is that the full existing automated suite (vitest unit, vitest component, Playwright E2E, backend pytest unit and integration) stays green commit-by-commit on the branch. Anything that breaks is either a test pinning an implementation detail (rewrite the test against the new seam) or a real regression (fix the refactor).

### Out of scope

- DB schema changes, Alembic migrations, IndexedDB version bumps. Wire format and storage shape stay byte-identical.
- New endpoints, new fields, removed fields, renamed fields. The HTTP contract is frozen for this spec.
- UI changes, copy changes, German string changes, theme tokens, animation tuning.
- Auth strategy changes. Session cookies, CSRF, Argon2id, HIBP, sliding-window rate limits, audit log all stay verbatim.
- Push notifications, websockets, multi-tenant sharing, signup flow, SIWA. Same as `260428-accounts-and-sync.md` Out of scope.
- Replacing the runtime ticker, Wake Lock acquisition, or service worker registration.
- Removing existing tests. Every existing test either passes unchanged or is moved verbatim to the new module's test file with the same assertions.

---

## Technical

### Approach

Four independent modules, sequenced so each phase's foundation lands before its consumers. Each phase is a single conceptual change with its own test commit and can be reviewed standalone.

**Phase 1, per-noun field mappers.** A new directory `src/lib/sync/mappers/` holds one file per Grillade noun: `grillade.ts`, `grilladeItem.ts`, `favorite.ts`, `settings.ts`. Each exports a pure pair: `toServer(localShape) -> JsonObject` and `fromServer(JsonObject) -> localShape | null`. The mappers own every camelCase to snake_case conversion, every `Date.parse` round-trip, every `findCutBySlug`-based reconstruction, and the `PlannedItem` vs `SessionItem` discrimination. `pushGrillade.ts` and `pull.ts` shrink to orchestration over those calls. On the backend, `backend/grillmi/routes/_models.py` introduces Pydantic response models (`GrilladeOut`, `GrilladeItemOut`, `FavoriteOut`, `SettingsOut`, `DeltaResponse[T]`) that all six routes return; `backend/grillmi/routes/_serialize.py`'s `serialize()` and `_scalar()` go away (the helpers `parse_since` and `server_time_iso` move to `_models.py`).

**Phase 2, AccountAccess service.** A new module `backend/grillmi/services/account_access.py` exposes a single class `AccountAccess` with methods that own each of `auth.py`'s flows: `authenticate(db, email, password, ip, user_agent)`, `logout(db, token)`, `request_password_reset(db, email, ip)`, `set_password(db, raw_token, new_password, ip, user_agent)`, `list_sessions(db, user_id, current_token)`, `revoke_session(db, user_id, session_id, ip)`, `delete_account(db, user_id, ip)`. Rate limiting, Argon2 verify, HIBP check, audit log writes, email sending, reset-token consumption, session row create and delete all move into this module. The route handlers in `auth.py` collapse to thin shells that translate request and response. The admin CLI's `init` and `reset-password` verbs in `backend/grillmi/cli/` switch to call `AccountAccess` directly so tests, CLI, and HTTP share one entry point.

**Phase 3, SyncCoordinator.** A new module `src/lib/sync/coordinator.ts` exposes three public methods: `syncNow(reason)`, `enqueueWrite(args)`, `subscribe(listener)`. The coordinator owns the invariants today scattered across `pull.ts`, `queue.ts`, and `grilladeSync.ts`: single-active-grillade enforcement (the `retireOtherActiveGrilladen` logic in `pull.ts:194-210` and the missing-server-row repair in `grilladeSync.ts:65-78`), watermark plumbing (`lastPullEpoch` reads and writes in `pull.ts`), 401 logout-and-redirect, 409 refetch-then-write-to-IDB-without-pushing, 5xx retry-keep, 4xx-other drop, debounced flush, visibility-change and online triggers. `pull.ts`, `queue.ts`, and `pushGrillade.ts` become private adapters under `src/lib/sync/_adapters/` that the coordinator drives. Stores and `+layout.svelte` only ever import from `coordinator.ts`.

**Phase 4, GrilladeLifecycle.** A new module `src/lib/grillade/lifecycle.ts` exports a `createGrilladeLifecycle({ persistence, push, scheduler, clock })` factory that takes ports for the things today's store reaches for directly: `persistence` (the `db.ts` Grillade-row helpers), `push` (the SyncCoordinator from Phase 3), `scheduler` (the existing `schedule.ts` and `buildSessionItem`), and `clock` (a `now()` function for tests). The factory returns the full lifecycle interface: plan mutators (`addItem`, `updateItem`, `removeItem`, `reorderItems`, `loadFromMenu`, `setTargetTime`, `setPlanMode`, `setAutoMode`, `resetDraft`), session entry points (`startSession`, `startManualSession`, `startSessionItem`), session mutators (`patchItem`, `plateItem`, `unplateItem`, `forceReady`, `removeSessionItem`), timeline (`appendTimelineEvent`), end-of-grillade (`endSession`), and read accessors (`plan`, `session`, `cookingItems`, etc.). `grilladeStore.svelte.ts` shrinks to a Svelte rune-aware view that wraps a single lifecycle instance and surfaces its state through `$state` and `$derived`. `grilladeSync.ts` deletes; its push-decision logic lives inside the lifecycle's wiring of the `push` port. `pull.ts`'s `refreshLocalActiveItems` becomes a coordinator pull-hook that hands rows to the lifecycle's "remote-update" entry point rather than writing directly into the store's territory.

The four phases land in this order on one branch (`cleanup/architectural-deepening`), one commit per phase, full suite green after each commit. The branch merges to main as a single squash if the user prefers a clean history, or as four no-ff merges if the user wants the phase boundaries preserved.

### Approach Validation

The deepening targets came from a structured architecture review (Explore agent walk plus the deletion test on each candidate). Three pieces of in-repo evidence drove the choice:

- The lifecycle is split across `grilladeStore.svelte.ts:81-127`, `grilladeSync.ts:1-78`, and `pull.ts:131-160` with no module owning transitions. Each call site does its own "is this row pushed yet, what is the active grillade, do we need to repair the server" dance.
- Sync invariants live as inline control flow: `pull.ts:194-210` retires other active grilladen on every pull, `queue.ts:108-113` drops 409s and trusts a future `pull` to refetch, and `grilladeSync.ts:65-78` does its own `fetch` to detect server-row drift. The single-active rule has no canonical home.
- Field mapping is duplicated. `pushGrillade.ts:5-16,86-112` defines the camelCase to snake_case map for `Grillade` and items. `pull.ts:235-339` defines the inverse plus `findCutBySlug`-driven reconstruction. `_serialize.py:7-12` is a getattr loop that duplicates the field list at every call site. Renaming `cookSeconds` would touch four files.

The architectural pattern is hexagonal: ports and adapters around a domain core, validated against `~/dev/reference/auth.md` (which already specifies the auth flow as a separable service) and against the existing `260428-accounts-and-sync.md` spec (which kept routes thin in spirit but inlined logic in practice). The deletion test confirms each new module concentrates rather than relocates complexity: deleting `GrilladeLifecycle` would scatter the state machine back across four files, deleting `SyncCoordinator` would scatter the invariants back across three files, deleting the mappers would duplicate field maps in two files, deleting `AccountAccess` would refill `auth.py` with 333 lines of mixed concerns. All four candidates earn their keep.

The wire format stays frozen on purpose. A contract test in Phase 1 records the current server response and asserts the new mapper produces byte-identical output, eliminating the "did we accidentally rename a field" failure mode that an architectural refactor of this size usually carries.

### Risks

| Risk | Mitigation |
| ---- | ---------- |
| Refactor accidentally changes wire format and breaks an unrelated client. | Phase 1 ships a contract test that loads a recorded fixture from a real backend response and asserts the new mapper output equals the legacy `serialize()` output byte-for-byte. The fixture is regenerated only when the wire format intentionally changes (out of scope here). |
| Existing tests pin implementation detail of the old store and break under the new lifecycle interface. | Tests that assert internal state are moved to the lifecycle's own test file; tests that assert end-to-end behavior keep their spec name and run unchanged. The branch merges only when both sets are green. |
| Long-lived feature branch drifts from main. | Land each of the four phases as its own commit and rebase on main daily. Each phase leaves the suite green; abandoning the branch mid-phase still yields a working main. |
| Hidden coupling: a route, store, or test reaches into a private of the old shape. | Phase 1's mapper introduction is preceded by a grep for every direct call site of the old `serialize()` and inverse helpers; same for Phase 2's `auth.py` private helpers, Phase 3's `pull.ts` private state, Phase 4's store internals. The phase commit removes the old helper only after every caller migrates. |
| AccountAccess refactor regresses a security control (rate limit bypass, timing leak, missing audit log). | Phase 2 keeps every existing `backend/tests/integration/test_auth_*.py` test passing unchanged and adds unit tests at the AccountAccess seam for each guarantee (`_DUMMY_HASH` timing, sliding-window per IP and per account, HIBP fail-open, audit row written on every success and failure). |
| GrilladeLifecycle's port-based design ends up with mocks that don't match real adapters and tests pass while production breaks. | The lifecycle's unit suite uses an in-memory persistence adapter that is exercised in production too (the `db.ts` adapter is the second implementation of the same `PersistencePort`). One adapter is hypothetical, two adapters is real. The Playwright E2E suite stays the integration safety net. |

### Implementation Plan

**Phase 1: Per-noun field mappers**

- [ ] Create `src/lib/sync/mappers/grillade.ts` with `grilladeToServer(row: GrilladeRow)` and `grilladeFromServer(json: Record<string, unknown>): GrilladeRow` that match the current shapes in `pushGrillade.ts:5-16` and `pull.ts:324-339`
- [ ] Create `src/lib/sync/mappers/grilladeItem.ts` with `plannedItemToServer(item, index)`, `sessionItemToServer(item, index)`, `plannedItemFromServer(json)`, and `sessionFromServer(row, rawItems, plannedItems)` matching `pushGrillade.ts:86-112` and `pull.ts:266-322`
- [ ] Create `src/lib/sync/mappers/favorite.ts` with `favoriteFromServer` matching `pull.ts:235-264`
- [ ] Create `src/lib/sync/mappers/settings.ts` for the settings value envelope, matching the inline read at `pull.ts:115-122`
- [ ] Create `src/lib/sync/mappers/index.ts` re-exporting all mappers
- [ ] Switch `src/lib/sync/pushGrillade.ts` to import from `mappers/`; delete the inline `serialize`, `serializePlannedItem`, `serializeSessionItem`
- [ ] Switch `src/lib/sync/pull.ts` to import from `mappers/`; delete the inline `toGrilladeRow`, `plannedItemFromServer`, `sessionFromServer`, `favoriteFromServer`
- [ ] Add `backend/grillmi/routes/_models.py` with Pydantic response models `GrilladeOut`, `GrilladeItemOut`, `FavoriteOut`, `SettingsOut`, and a generic `DeltaResponse[T]`
- [ ] Move `parse_since` and `server_time_iso` from `_serialize.py` to `_models.py`
- [ ] Switch `backend/grillmi/routes/grilladen.py`, `grillade_items.py` (or wherever items are routed inside `grilladen.py`), `menus.py`, `favorites.py`, `settings.py`, `sync.py` to declare `response_model=` with the new types and return ORM rows directly (Pydantic v2 with `from_attributes=True`)
- [ ] Delete `backend/grillmi/routes/_serialize.py` once no module imports it
- [ ] Run `pnpm typecheck`, `pnpm lint`, `pnpm test` and `cd backend && uv run pytest` and resolve every failure inside the changed files

**Phase 2: AccountAccess service**

- [ ] Create `backend/grillmi/services/__init__.py` and `backend/grillmi/services/account_access.py` with the `AccountAccess` class and result dataclasses (`AuthSuccess`, `AuthFailure`, `PasswordSetResult`)
- [ ] Move the body of `auth.py:login` (lines 84-132) into `AccountAccess.authenticate`, including rate limit checks, `_DUMMY_HASH` timing-safe verify, disabled-hash check, rehash branch, session create, `last_login_at` update, audit log on success and failure
- [ ] Move the body of `auth.py:logout` (lines 135-148) into `AccountAccess.logout`
- [ ] Move the body of `auth.py:forgot_password` (lines 159-203) into `AccountAccess.request_password_reset`, including HIBP-free generation, email render and send, reset-token row insert, audit log on every branch
- [ ] Move the body of `auth.py:set_password` (lines 206-278) into `AccountAccess.set_password`, including atomic token consume, HIBP check, password rehash, session wipe, optional auto-session for invitation kind, audit log
- [ ] Move the body of `auth.py:get_sessions`, `revoke_session`, `delete_account` (lines 281-333) into `AccountAccess.list_sessions`, `AccountAccess.revoke_session`, `AccountAccess.delete_account`
- [ ] Shrink `auth.py` route handlers to thin shells: parse request, call the service, set or clear cookie based on the service result, return the response model
- [ ] Switch `backend/grillmi/cli/init.py` and any CLI entry that currently rebuilds the invitation flow inline (grep for `PasswordResetToken(` and `create_session(`) to call `AccountAccess.request_password_reset` and `AccountAccess.authenticate`
- [ ] Add `backend/grillmi/services/account_access.py` to the imports surfaced in `grillmi help` if the management script references service entry points
- [ ] Run `cd backend && uv run pytest` and resolve every failure inside the changed files

**Phase 3: SyncCoordinator**

- [ ] Create `src/lib/sync/coordinator.ts` exporting `syncNow(reason: string): Promise<void>`, `enqueueWrite(args: EnqueueArgs): Promise<boolean>`, `subscribe(listener: () => void | Promise<void>): () => void`, `attachSync(): void`, `detachSyncForTests(): void`
- [ ] Move the single-active enforcement (`retireOtherActiveGrilladen` in `pull.ts:194-210`) into the coordinator as a private step run after delta pull
- [ ] Move the missing-server-row repair (`grilladeSync.ts:65-78`) into the coordinator as a private step run before any `enqueueWrite` for an existing Grillade row
- [ ] Move watermark plumbing (`getSyncMeta`, `setSyncMeta` calls in `pull.ts`) into the coordinator's private state
- [ ] Move 401 handling, 409 refetch-then-IDB-write, 5xx retry-keep, 4xx-other drop, and debounced flush from `queue.ts:75-114` into the coordinator
- [ ] Relocate `pull.ts`, `queue.ts`, `pushGrillade.ts` to `src/lib/sync/_adapters/`; export them only via `coordinator.ts`
- [ ] Keep `src/lib/sync/index.ts` re-exporting only the coordinator's public methods plus `attachSync` and `onSyncApplied`
- [ ] Replace every direct import of `pull`, `queue`, `pushGrillade`, or `grilladeSync` outside `_adapters/` with imports from `coordinator.ts`. Grep targets: `from '$lib/sync/pull'`, `from '$lib/sync/queue'`, `from '$lib/sync/pushGrillade'`, `from '$lib/stores/grilladeSync'`
- [ ] Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm test:e2e` and resolve every failure

**Phase 4: GrilladeLifecycle**

- [ ] Create `src/lib/grillade/lifecycle.ts` with `createGrilladeLifecycle({ persistence, push, scheduler, clock })` factory
- [ ] Define the `PersistencePort` (currentSession, currentPlanState, timeline, active grillade row helpers) and the `PushPort` (subset of SyncCoordinator's `enqueueWrite` plus the active-grillade query)
- [ ] Move the body of `grilladeStore.svelte.ts:58-446` into the factory: plan mutators, session start variants, session item mutators, timeline append, endSession, init, reloadFromStorage, syncActive
- [ ] Wire `defaultPlan`, `effectiveTargetEpoch`, `normalizeSession`, `isStaleSession`, `STALE_AFTER_MS`, `MANUAL_UNSTARTED_HORIZON_MS` into the lifecycle module so they live next to the state machine
- [ ] Rewrite `src/lib/stores/grilladeStore.svelte.ts` as a thin Svelte 5 runes view: instantiate `createGrilladeLifecycle({...})` with adapters wired to `db.ts` and the SyncCoordinator, expose lifecycle state through `$state`-backed wrappers and `$derived` computeds, forward all method calls
- [ ] Delete `src/lib/stores/grilladeSync.ts` once the lifecycle's `PushPort` adapter replaces it
- [ ] Replace `pull.ts`'s `refreshLocalActiveItems` direct row writes with a coordinator pull-hook that calls a new `lifecycle.applyRemoteRow(row, items)` method on the store; the lifecycle is the only writer for Grillade row state
- [ ] Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm test:e2e` and resolve every failure

---

## Testing

Tests are implementation tasks. The implementer writes and passes each one before the phase commit lands.

### Unit Tests, Phase 1 (`tests/unit/sync/`)

- [ ] `tests/unit/sync/grilladeMapper.test.ts` `grilladeToServer roundtrips a planned row` writes the same shape today's `pushGrillade.ts:5-16` does for a representative `GrilladeRow` fixture
- [ ] `tests/unit/sync/grilladeMapper.test.ts` `grilladeFromServer roundtrips a server row` reconstructs the same `GrilladeRow` today's `pull.ts:324-339` does
- [ ] `tests/unit/sync/grilladeMapper.test.ts` `grilladeFromServer handles null timestamps and deleted_at` covers `target_finish_at`, `started_at`, `ended_at`, `deleted_at` all null and all set
- [ ] `tests/unit/sync/grilladeItemMapper.test.ts` `plannedItemToServer matches legacy serialization` against a captured fixture
- [ ] `tests/unit/sync/grilladeItemMapper.test.ts` `sessionItemToServer preserves status and started_at semantics` for `pending`, `cooking`, `resting`, `ready`, `plated`
- [ ] `tests/unit/sync/grilladeItemMapper.test.ts` `plannedItemFromServer recovers cookSeconds when server omits it` falls back to `findRow().cookSecondsMax`
- [ ] `tests/unit/sync/grilladeItemMapper.test.ts` `sessionFromServer reconstructs SessionItem timing for an in-flight running grillade` with mixed item statuses
- [ ] `tests/unit/sync/favoriteMapper.test.ts` `favoriteFromServer reconstructs cookSeconds from cut and thickness and doneness`
- [ ] `tests/unit/sync/favoriteMapper.test.ts` `favoriteFromServer returns null when cut_id does not resolve in the bundled timings`
- [ ] `tests/unit/sync/contractFixture.test.ts` `each mapper produces byte-identical output to the legacy helpers for the recorded fixtures` loads `tests/unit/sync/__fixtures__/server-response.json` and `tests/unit/sync/__fixtures__/local-rows.json`, runs both legacy serialize calls and new mapper calls, asserts deep equality

### Unit Tests, Phase 1 backend (`backend/tests/unit/`)

- [ ] `backend/tests/unit/test_response_models.py` `GrilladeOut serializes datetimes as ISO 8601 with timezone`
- [ ] `backend/tests/unit/test_response_models.py` `GrilladeOut serializes UUID id and Decimal position`
- [ ] `backend/tests/unit/test_response_models.py` `DeltaResponse wraps rows and server_time correctly`
- [ ] `backend/tests/unit/test_response_models.py` `parse_since and server_time_iso behave as before` covers null, empty string, ISO 8601 with Z and with +00:00

### Unit Tests, Phase 2 (`backend/tests/unit/`)

- [ ] `backend/tests/unit/test_account_access.py` `authenticate returns AuthFailure on unknown email and still spends Argon2 time`
- [ ] `backend/tests/unit/test_account_access.py` `authenticate returns AuthFailure on disabled hash prefix`
- [ ] `backend/tests/unit/test_account_access.py` `authenticate returns AuthSuccess and creates a session row on valid credentials`
- [ ] `backend/tests/unit/test_account_access.py` `authenticate rehashes when Argon2 parameters bumped`
- [ ] `backend/tests/unit/test_account_access.py` `authenticate writes audit_log on success and on failure`
- [ ] `backend/tests/unit/test_account_access.py` `authenticate raises rate-limit when per-IP window exceeded`
- [ ] `backend/tests/unit/test_account_access.py` `authenticate raises rate-limit when per-account window exceeded`
- [ ] `backend/tests/unit/test_account_access.py` `request_password_reset writes a reset-token row and sends an email when user exists`
- [ ] `backend/tests/unit/test_account_access.py` `request_password_reset writes audit_log only on the unknown-email branch when user does not exist`
- [ ] `backend/tests/unit/test_account_access.py` `set_password rejects an HIBP-positive password with 422`
- [ ] `backend/tests/unit/test_account_access.py` `set_password consumes the reset token atomically and rejects a second use`
- [ ] `backend/tests/unit/test_account_access.py` `set_password wipes all sessions for the user`
- [ ] `backend/tests/unit/test_account_access.py` `set_password auto-creates a session for invitation tokens but not for reset tokens`
- [ ] `backend/tests/unit/test_account_access.py` `delete_account cascades to grilladen, items, menus, favorites, settings, sessions, reset_tokens` (verifies via repo queries returning empty)

### Unit Tests, Phase 3 (`tests/unit/sync/`)

- [ ] `tests/unit/sync/coordinator.test.ts` `syncNow flushes queued writes then pulls and notifies subscribers when changes apply`
- [ ] `tests/unit/sync/coordinator.test.ts` `enqueueWrite drops non-write methods`
- [ ] `tests/unit/sync/coordinator.test.ts` `enqueueWrite drops when unauthenticated`
- [ ] `tests/unit/sync/coordinator.test.ts` `flush handles 401 by clearing auth and redirecting to login with next param`
- [ ] `tests/unit/sync/coordinator.test.ts` `flush drops a queued write on 409 and the next pull restores the row from the server`
- [ ] `tests/unit/sync/coordinator.test.ts` `flush keeps a queued write on 5xx and retries on the next sync cycle`
- [ ] `tests/unit/sync/coordinator.test.ts` `flush drops a queued write on non-401 4xx without blocking subsequent rows`
- [ ] `tests/unit/sync/coordinator.test.ts` `pull retires every other active grillade after a delta brings in a new active row`
- [ ] `tests/unit/sync/coordinator.test.ts` `pull repairs the local pushedToServer flag when the server returns 404 for a row marked pushed`
- [ ] `tests/unit/sync/coordinator.test.ts` `pull updates the watermark from server_time and the next pull uses it as since`
- [ ] `tests/unit/sync/coordinator.test.ts` `attachSync wires visibilitychange, online, and the live interval, detachSyncForTests cleans them up`

### Unit Tests, Phase 4 (`tests/unit/grillade/`)

- [ ] `tests/unit/grillade/lifecycle.test.ts` `init reads stored session and clears it when stale beyond STALE_AFTER_MS`
- [ ] `tests/unit/grillade/lifecycle.test.ts` `init reads planState and falls back to defaultPlan when parse fails`
- [ ] `tests/unit/grillade/lifecycle.test.ts` `addItem assigns a uuid and persists, updateItem patches in place, removeItem removes, reorderItems preserves only known ids`
- [ ] `tests/unit/grillade/lifecycle.test.ts` `setTargetTime switches mode to time and clears auto sub-mode`
- [ ] `tests/unit/grillade/lifecycle.test.ts` `effectiveTargetEpoch in now mode returns now plus longest cook plus rest plus lead seconds`
- [ ] `tests/unit/grillade/lifecycle.test.ts` `effectiveTargetEpoch in time mode returns the pinned epoch unchanged`
- [ ] `tests/unit/grillade/lifecycle.test.ts` `startSession schedules every item to finish by targetEpoch and sets earliest put-on first`
- [ ] `tests/unit/grillade/lifecycle.test.ts` `startSession with overdue items flips status to cooking and shifts later items forward`
- [ ] `tests/unit/grillade/lifecycle.test.ts` `startManualSession parks every item at the far-future sentinel and sessionHasStarted stays false`
- [ ] `tests/unit/grillade/lifecycle.test.ts` `startSessionItem on a manual session item recomputes flip, done, and resting epochs from now`
- [ ] `tests/unit/grillade/lifecycle.test.ts` `plateItem and unplateItem move the item between ready and plated and call push`
- [ ] `tests/unit/grillade/lifecycle.test.ts` `endSession clears the session, copies items back into a fresh plan, and pushes finished metadata`
- [ ] `tests/unit/grillade/lifecycle.test.ts` `appendTimelineEvent dedupes by kind, itemName, and at`
- [ ] `tests/unit/grillade/lifecycle.test.ts` `syncActive pushes running session when one exists, otherwise pushes the planned draft`
- [ ] `tests/unit/grillade/lifecycle.test.ts` `the in-memory PersistencePort and the real db.ts adapter produce equivalent state after the same sequence of operations` (two-adapter parity test)

### Integration Tests (`backend/tests/integration/`)

- [ ] `backend/tests/integration/test_auth_routes.py` keeps every existing test passing without modification (the routes' HTTP contract is unchanged)
- [ ] `backend/tests/integration/test_grilladen_isolation.py`, `test_menus_isolation.py`, `test_favorites_isolation.py`, `test_settings_isolation.py` keep every existing test passing without modification (the response shape is unchanged)
- [ ] `backend/tests/integration/test_account_access_routes.py` `revoke_session via HTTP clears the cookie when the revoked session is the caller's own`
- [ ] `backend/tests/integration/test_account_access_routes.py` `delete_account via HTTP cascades to all owned rows`

### E2E Tests (`tests/e2e/`)

- [ ] `tests/e2e/auth.spec.ts` keeps every existing test passing without modification
- [ ] `tests/e2e/sync.spec.ts` keeps every existing test passing without modification
- [ ] `tests/e2e/account.spec.ts` keeps every existing test passing without modification
- [ ] Every pre-existing E2E spec activated through `tests/e2e/_setup/` keeps passing without modification
