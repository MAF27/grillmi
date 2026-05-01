# i18n translation layer

## Meta

- Status: Draft
- Branch: feature/i18n
- Infra: none
- Runbook: none

---

## Business

### Goal

Enable Marco and future users to switch the entire Grillmi experience between Deutsch and English from the Sprache control in Einstellungen. Today the control is purely cosmetic and English does nothing because the app has no real translation layer.

### Proposal

Introduce a small translation layer that covers every visible German string across the SvelteKit app and the backend email templates, persists the chosen language for each user, and re-activates the existing Sprache segmented control so picking English actually swaps the UI and the next outgoing email.

### Behaviors

- Sprache row in mobile Einstellungen and desktop SettingsCockpit shows a Deutsch / English segmented control. Selecting one writes through `settingsStore.setLocale()`, applies the new locale immediately to the visible page without a reload, and persists to backend.
- Picking a locale repaints all static UI copy: nav labels, headings, eyebrows, button text, toasts, alarm messages, validation errors, empty states, settings rows, and the auth surfaces (login, set-password, forgot-password, account).
- Numerals like cook times, target hours and minutes, and Grillade dates respect the locale: German uses `HH:MM`, ISO weekday names, and `1.234,56` style numerals; English uses the same `HH:MM` grid (24h is consistent across grilling) but `1,234.56` style numerals and English weekday names.
- Backend emails (activation, password reset) read the recipient's stored locale and render the matching template. A user with `locale = 'en'` receives the English activation mail; a user with `locale = 'de'` receives the German one as today.
- A missing key falls back silently to the German source string so a half-translated build never shows raw `auth.signIn` keys to a user.
- Locale persists across reloads via `settingsStore` and across devices via the existing settings sync queue plus a new `users.locale` column.

### Out of scope

- Automatic locale detection via `Accept-Language` headers or `navigator.language`. The user picker is the only signal.
- Translating dynamic content sourced from the timing data (`grill-timings-reference.md` cuts and category names). That data ships in German until a separate spec rebuilds the catalogue.
- Right-to-left languages.
- Per-string overrides outside the standard `t(key)` pipeline.
- Adding more than two locales in this spec.
- A translator/CMS workflow. Marco is the source of truth for English copy; the spec ships with file-based JSON that he edits directly.

---

## Technical

### Approach

The work splits cleanly into a frontend layer and a backend layer. Frontend introduces a single i18n module at `src/lib/i18n/index.ts` that exposes a reactive `locale` rune, a `t(key)` function with dotted-path lookups, and `formatDate(d)` / `formatNumber(n)` helpers using the `Intl` browser primitives. The existing `de` map at `src/lib/i18n/de.ts` is expanded from the four auth groups it already carries to a complete flat-by-section dictionary covering every visible string. A parallel `en.ts` is added with English copy. Components and routes import `t` and replace hardcoded German with `t('section.key')` calls. The `Sprache` segmented control in mobile `/settings` and desktop `SettingsCockpit` calls `settingsStore.setLocale(id)`, which writes to IDB, applies the new locale to the i18n store, and queues a settings sync push.

Backend adds a `locale` column to the `users` table (text, default `'de'`, NOT NULL), exposes it via `GET /api/auth/me` and accepts updates through the existing settings sync `PUT /api/settings` payload (the field rides along with the rest of the user settings JSON). The email template resolver in `backend/grillmi/email/templates.py` switches from hardcoded `<name>.de.html` to a `<name>.<locale>.html` lookup with a fallback to `de` when the requested locale's file is missing. New English templates `activation.en.html`, `activation.en.txt`, `password-reset.en.html`, `password-reset.en.txt` are added alongside the German originals, mirroring the structure of `_base.html`.

The migration plan is incremental. Phase 1 builds the frontend store and seeds full `de.ts`. Phase 2 sweeps each route directory once, replacing inline strings with `t()` calls, file by file, in commits small enough to land independently. Phase 3 adds the backend column, exposes it on `/api/auth/me`, and updates the template resolver. Phase 4 wires the Sprache control to actually switch locales.

### Approach Validation

- Round 0 research checked Svelte 5 i18n options. The community trend for small SvelteKit apps with two languages is to skip a library and use a tiny store-plus-Intl approach; large libraries like `svelte-i18n` and `typesafe-i18n` add bundle size and async loading complexity that this app does not need. Reference: `https://kit.svelte.dev/docs/i18n`, `https://svelte.dev/docs/svelte/state-management`. Rejected: `svelte-i18n` (extra runtime, locale loading async pattern doesn't suit instant switching), `typesafe-i18n` (codegen step adds friction for the first translation, payoff comes only beyond ~3 locales).
- Verified token coverage: a flat dictionary keyed by dotted paths (`auth.signIn`, `plan.eatcardEyebrowTarget`) is the established pattern in the existing `de.ts` and matches Marco's mental model. No flattening required for storage; the `t()` function handles the dotted-path traversal.
- Verified backend integration: `backend/grillmi/email/templates.py` already loads templates by name, so wrapping the name resolution in a locale-aware helper is a one-function change. The user record already passes through email-sending paths for the recipient address; reading `recipient.locale` from the same row is free.
- Verified migration safety: adding a `locale` column with a server-side default and NOT NULL is a single-statement migration that runs in milliseconds against the current row count (a few users). No backfill needed; `DEFAULT 'de'` covers the existing rows.
- Considered storing locale in a separate `user_preferences` table to keep the `users` table lean. Rejected because the existing settings JSON sync already round-trips through `users` and `settings` tables; adding one column is cheaper than a join.
- Considered wiring `Accept-Language` for first-render detection. Rejected per Out of scope; the user picker is the only signal, locale defaults to `de` for new users.

### Risks

| Risk | Mitigation |
| ---- | ---------- |
| ~86+ inline strings means the sweep can miss some | Add a CI lint that greps for capital-letter umlaut content (`[A-ZÄÖÜ][a-zäöüß]+ [a-zäöüß]+`) inside `>...<` text nodes in `.svelte` files. The lint runs in `pnpm lint` and fails on any leftover hardcoded string outside the `i18n/` directory and the `Grillstück` known-noun allowlist. |
| Locale change must repaint without reload, including stores that compute derived German labels | Keep `t()` reactive on the `locale` rune; any `$derived` block that reads `t()` re-runs on locale change. Audit `formatDuration` and `formatHHMM` in `src/lib/util/format.ts` to take an optional locale arg, falling back to the store. |
| Backend templates and frontend keys drift over time | One source-of-truth review checkbox at the bottom of each translation phase: when a `de` key changes, the matching `en` key gets a `[NEEDS REVIEW]` marker that surfaces in CI grep until updated. |
| Existing E2E tests assert on German strings | Add a tiny test helper `tests/e2e/_t.ts` that loads `en.ts` or `de.ts` based on the seeded user's locale; existing assertions wrap `expect(text).toBe(t('auth.signIn'))` instead of `expect(text).toBe('Anmelden')`. New tests cover both locales. |
| Email rendering for new locale not exercised in unit tests | Add backend unit tests `tests/test_email_templates.py::test_activation_renders_en` and `test_activation_falls_back_to_de_when_missing`. |

### Implementation Plan

**Phase 1: Frontend translation layer**

- [ ] Add `src/lib/i18n/index.ts` exposing a `locale` rune (`'de' | 'en'`), `setLocale(id)`, a `t(key, params?)` function that walks dotted paths against the active dictionary with a fallback to `de`, and `formatDate(d)` / `formatNumber(n)` wrappers around `Intl.DateTimeFormat` and `Intl.NumberFormat`.
- [ ] Expand `src/lib/i18n/de.ts` from the four-key auth-only object to a complete dictionary structured by section (`auth`, `nav`, `home`, `plan`, `session`, `grilladen`, `settings`, `errors`, `time`). Every German string the codebase ships today gets a key. Keep the file under 600 lines by splitting into `src/lib/i18n/de/auth.ts`, `src/lib/i18n/de/plan.ts`, etc., and re-exporting from `de.ts`.
- [ ] Add `src/lib/i18n/en.ts` and `src/lib/i18n/en/<section>.ts` files with English copy for every key in `de.ts`. Marco supplies the copy for sections he wants polished; the rest fall back to a clearly-marked initial translation for the first ship.
- [ ] Add `locale` to `userSettingsSchema` in `src/lib/schemas/index.ts`: `locale: z.enum(['de', 'en']).default('de')`.
- [ ] Wire `setLocale` into `settingsStore.svelte.ts`: store the new value, call `i18n.setLocale(id)`, persist via the existing `persist()` path so the sync queue picks it up.

**Phase 2: Sweep routes**

- [ ] Replace hardcoded German in `src/routes/+page.svelte` with `t()` calls.
- [ ] Replace hardcoded German in `src/routes/login/+page.svelte`, `src/routes/set-password/+page.svelte`, `src/routes/forgot-password/+page.svelte`, `src/routes/account/+page.svelte`.
- [ ] Replace hardcoded German in `src/routes/plan/+page.svelte`.
- [ ] Replace hardcoded German in `src/routes/session/+page.svelte`.
- [ ] Replace hardcoded German in `src/routes/grilladen/+page.svelte`.
- [ ] Replace hardcoded German in `src/routes/settings/+page.svelte`.

**Phase 3: Sweep components**

- [ ] Replace hardcoded German in mobile `src/lib/components/*.svelte` (one file per task; covers `AlarmBanner`, `Button`, `MasterClock`, `MenuCard`, `PlanItemRow`, `SegmentedControl`, `SessionHeader`, `TimerCard`, `TimePickerSheet`, `TimePickerPopover`, `AddItemSheet`, `Toast`, `SyncChip`, `AccountChip`, `Sidebar`, `SectionHeader`).
- [ ] Replace hardcoded German in desktop `src/lib/components/desktop/*.svelte` (`SettingsCockpit`, `ActivityLog`, `GrilladeCard`, `PlanSummaryList`).
- [ ] Replace hardcoded German in `src/lib/runtime/alarms.ts` (`messageFor` returns localized strings via `t()`).
- [ ] Replace hardcoded German in `src/lib/util/format.ts` (`formatHHMM`, `formatDuration`) by routing through the new `formatDate` / `formatNumber` helpers.

**Phase 4: Backend locale storage**

- [ ] Add Alembic migration `backend/migrations/versions/<rev>_add_users_locale.py` that adds `locale text NOT NULL DEFAULT 'de'` to `users`.
- [ ] Update `backend/grillmi/db/models/user.py` to expose the `locale` field.
- [ ] Update `backend/grillmi/api/auth.py` so `GET /api/auth/me` returns `locale`.
- [ ] Update `backend/grillmi/api/settings.py` so `PUT /api/settings` accepts a `locale` field within the settings JSON and writes it to the `users.locale` column atomically with the settings update.
- [ ] Update `src/lib/api/types.ts` (or the equivalent type module the frontend uses for the `me` response) so `User.locale` is `'de' | 'en'`. Initialize `authStore` with the user's locale on `init()` so the language is right on first paint.

**Phase 5: Backend email templates**

- [ ] Add English templates: `backend/templates/emails/activation.en.html`, `activation.en.txt`, `password-reset.en.html`, `password-reset.en.txt`. Match the structure of the German originals; first cut copy lives inline in the spec PR description for review.
- [ ] Update `backend/grillmi/email/templates.py` so `render_activation()` and `render_password_reset()` accept a `locale` argument, look up `<name>.<locale>.html` first, and fall back to `<name>.de.html` if the locale-specific file is absent.
- [ ] Update every call site that renders these emails (`backend/grillmi/api/auth.py` activation send, password-reset send, admin-init send) to pass `recipient.locale` to the renderer.

**Phase 6: UI wiring and lint guard**

- [ ] Re-enable the desktop SettingsCockpit Sprache row: remove the `disabled` flag from the `SegmentedControl` and wire `onchange` to `settingsStore.setLocale(id as 'de' | 'en')`. Drop the `disabled` row class.
- [ ] Add the Sprache row to the mobile `/settings` Einheiten section once the mobile additions from `260428-desktop-cockpit-and-mobile-refinements.md` follow-up land. The row uses the same wiring as desktop.
- [ ] Update the hint copy under the Einheiten section: when both locales are wired, the hint reads `t('settings.unitsHint')` and shows "Imperial und Fahrenheit folgen später." when applicable.
- [ ] Add a CI lint script `scripts/lint-no-inline-de.sh` that greps `src/` for German content inside JSX-style `>` `<` text nodes outside `src/lib/i18n/`. Fails the build on hits. Wire it into `pnpm lint`.

---

## Testing

Tests are implementation tasks. The implementer writes and passes each one.

### Unit Tests (`tests/unit/`)

- [ ] `tests/unit/i18n.test.ts::test_t_returns_german_string_when_locale_de` - With locale `'de'`, `t('auth.signIn')` returns `'Anmelden'`.
- [ ] `tests/unit/i18n.test.ts::test_t_returns_english_string_when_locale_en` - With locale `'en'`, `t('auth.signIn')` returns `'Sign in'`.
- [ ] `tests/unit/i18n.test.ts::test_t_falls_back_to_de_when_key_missing_in_en` - Stub a key present in `de` but not in `en`; with locale `'en'`, `t(key)` returns the German value.
- [ ] `tests/unit/i18n.test.ts::test_t_returns_key_when_missing_in_both` - Unknown key returns the key itself plus a `console.warn` so dev logs surface gaps.
- [ ] `tests/unit/i18n.test.ts::test_setLocale_updates_rune` - Calling `setLocale('en')` flips the rune; subsequent `t()` calls use English.
- [ ] `tests/unit/i18n.test.ts::test_format_date_uses_active_locale` - `formatDate(new Date('2026-04-29'))` returns the German weekday under `'de'` and the English weekday under `'en'`.
- [ ] `tests/unit/i18n.test.ts::test_format_number_uses_active_locale` - `formatNumber(1234.56)` returns `'1.234,56'` under `'de'` and `'1,234.56'` under `'en'`.
- [ ] `tests/unit/settingsStore.locale.test.ts::test_setLocale_persists_and_calls_i18n` - `settingsStore.setLocale('en')` persists to IDB and calls `i18n.setLocale('en')`.
- [ ] `tests/unit/settingsStore.locale.test.ts::test_init_applies_stored_locale` - Stored settings with `locale: 'en'` load the English dictionary on `init()`.

### Integration Tests (`backend/tests/`)

- [ ] `backend/tests/test_email_templates.py::test_activation_renders_en` - Calling `render_activation(locale='en', ...)` returns an HTML body whose subject and headings come from the English template.
- [ ] `backend/tests/test_email_templates.py::test_activation_falls_back_to_de_when_missing` - With a temp directory missing `activation.en.html`, `render_activation(locale='en')` renders the German template and the helper logs a warning.
- [ ] `backend/tests/test_settings_api.py::test_put_settings_persists_locale_to_users_row` - PATCH the settings payload with `locale: 'en'`; the `users.locale` column for that user becomes `'en'`.
- [ ] `backend/tests/test_auth_api.py::test_get_me_returns_locale` - `GET /api/auth/me` for a user with `locale = 'en'` returns `{"locale": "en"}` in the response body.

### E2E Tests (`tests/e2e/`)

- [ ] `tests/e2e/i18n.spec.ts::test_sprache_switches_settings_label_immediately` - Sign in, open Einstellungen, click "English"; the same page's labels swap to English without a reload.
- [ ] `tests/e2e/i18n.spec.ts::test_sprache_persists_across_reload` - Pick English, reload the page; the UI is still English.
- [ ] `tests/e2e/i18n.spec.ts::test_sprache_persists_across_devices` - Pick English on device A, sign in on device B with the same account; device B paints English on first load.
- [ ] `tests/e2e/i18n.spec.ts::test_activation_email_uses_user_locale` - Create a user with `locale = 'en'` via admin init, trigger activation email, the captured outbound email is the English template.
- [ ] `tests/e2e/i18n.spec.ts::test_password_reset_email_uses_user_locale` - User with `locale = 'en'` requests a reset, the email is the English template.
- [ ] `tests/e2e/i18n.spec.ts::test_existing_german_e2e_specs_still_pass` - The full existing `tests/e2e/auth.spec.ts` and `tests/e2e/account.spec.ts` suites pass when the seeded user's locale is `'de'`.
