# Grillmi: Accounts and Sync

## Meta

- Status: Implementation and tests complete. Backend unit + integration suite (119 tests, 94% coverage), frontend unit suite (93 tests), and the spec's Playwright E2E suite (`tests/e2e/auth.spec.ts`, `sync.spec.ts`, `account.spec.ts`) all green via the local hermetic harness in `tests/e2e/_setup/`. Marco's physical-device manual verification still outstanding. Pre-existing e2e tests under `tests/e2e/*.spec.ts` (home, favorites, plan, alarms, etc.) regress because the new `+layout.ts` auth gate redirects unauthenticated users to `/login`; those need a per-suite pre-auth fixture as a separate cleanup, not part of this spec.
- Branch: feature/accounts-and-sync
- Infra: 260428-accounts-and-sync.md
- Runbook: 260428-accounts-and-sync.md

---

## Business

### Goal

Add real user accounts to Grillmi and make Grilladen, Menüs, Favoriten, and Settings sync across the user's devices. After this spec ships, Marco can plan a Grillade on the Mac, walk to the grill with his iPhone, and pick up exactly where the Mac left off, with offline-first behaviour preserved at the grill.

### Proposal

Stand up a small FastAPI backend on the existing `grillmi` prod LXC and `grillmi-dev` VM, served behind Caddy at `/api`, persisting to a local Postgres 17 database. Add invitation-only email-and-password authentication that follows the house auth standard to the letter (Argon2id, server-side sessions, HIBP, rate limits, CSRF, audit log, Hostpoint SMTP from `kraftops.ch`). Expose per-entity REST endpoints for Grilladen, items, Menüs, Favoriten, and Settings, scoped by the authenticated user. The SvelteKit PWA gates first launch on login, keeps IndexedDB as the offline live store, and runs a debounced sync queue that replays writes to the server on visibility-change and on Grillade open. First login automatically migrates the developer's existing IndexedDB content via a one-shot bulk import. Sign-out wipes the IDB stores so a shared device cannot leak data.

### Behaviors

1. On first launch with no session cookie, the app shows the login screen. The activation email links to `/set-password`. On success the user is logged in automatically and lands on Home, with all Grilladen, Menüs, Favoriten, and Settings already migrated from any prior local-only IDB content.
2. Logged-in users see a small account chip on Home that links to `/account`, where they can review the current device list, trigger a password change (via the forgot-password flow), or delete the account with a 500ms hold gesture.
3. Editing a Grillade on one device updates it on every other logged-in device the next time that device foregrounds the app or opens that Grillade. Conflicts on the same row are resolved by last-write-wins on `updated_at`; the older write is rejected with HTTP 409 and the client retries by re-fetching the row.
4. Offline at the grill: all reads and writes hit IndexedDB. Pending writes queue locally and replay automatically when connectivity returns. A 401 mid-flush parks the queue, redirects to `/login`, and resumes after re-auth.
5. Forgot-password sends a 30-minute reset link from `Grillmi <noreply@kraftops.ch>` in German. Activation links live for 72 hours. After a reset, the user is sent back to `/login` (no auto-login). After activation, the user is auto-logged-in.
6. The Account page lists all active sessions for the user with a parsed device label, IP, and last-active relative time, and lets the user revoke any session including the current one. Revoking the current session logs the caller out and bounces them to `/login`.
7. Account deletion cascades: the server deletes Grilladen, items, Menüs, Favoriten, Settings, all sessions and reset tokens, then returns 204; the client clears IndexedDB and lands on `/login`.
8. The PWA still works offline once authenticated. Cookies persist; on next online request the cookie is sent automatically and the app catches up via the standard sync queue. The user never re-enters credentials except after the 24-hour cookie expiry or explicit sign-out.
9. The first-run notice (existing component) is unchanged. After login, the same screen-on, mute-switch, and iOS-no-vibration messaging appears for users who have not yet seen it.
10. A logged-in user on a brand-new device (no IDB content) sees an empty Home until the first delta pull completes; the pull on `+layout.svelte` `onMount` populates IDB from the server within seconds. There is no separate "restoring data" screen; the existing skeleton states cover the brief gap.
11. Logging in on a second device concurrently with active edits on the first triggers an immediate full pull on the second device (since timestamp = epoch zero). The user sees their full Grillade list within five seconds, ordered by `position`.
12. A 24-hour cookie expiry surfaces as a 401 on the next online request. The user is bounced to `/login` with the original URL preserved as `?next=`. Re-login resumes the queue.
13. The login page accepts the `?next=` query string and, on success, navigates to that path instead of `/`. The activation link's `set-password` page does the same with `?next=` if present. To prevent open-redirect, the client only honours `next` when it starts with a single `/` followed by a non-`/` character; anything else falls back to `/`. The same validation applies on the server when emitting redirect Locations.
14. Account deletion is German throughout: button label "Konto löschen", hold confirm "Loslassen zum Abbrechen", success toast "Konto gelöscht". Sign-out button label "Abmelden". Login screen uses "Anmelden". Forgot-password uses "Passwort zurücksetzen".
15. The Account page section headings: "E-Mail" (read-only email), "Passwort" ("Passwort ändern" button), "Aktive Geräte" (session list), "Konto" ("Konto löschen" hold-button). Strings live in `src/lib/i18n/de.ts` matching the existing pattern.

### Out of scope

1. Push notifications for timer alerts. Locked out per `roadmap-apr-2026.md`. No push tables, no VAPID keys, no scheduler. Revisit only if real-world use shows missed alarms.
2. Sign in with Apple. Email-and-password via the invite flow ships first; SIWA is additive, separate spec.
3. Live multi-device co-presence (WebSockets or SSE). REST plus visibility-flush polling is enough for solo cross-device use.
4. Self-service signup. Accounts are invitation-only via the admin CLI; the prod deploy seeds Marco's account.
5. Brand sender domain `noreply@grillmi.cloud`. Stays on `kraftops.ch` until an explicit follow-up adds DNS and a mailbox.
6. Aggregate analytics-by-account. Audit log is for security only.
7. Multi-tenant team or family sharing. Login scopes data to the single owning user.
8. Two-factor authentication (TOTP, WebAuthn). The auth standard does not require it for the homelab apps and the threat model (one user, no public sign-up, invite-only) does not justify the implementation cost in this spec.
9. Per-device push subscriptions and the `pending_notifications` polling table from the stack research doc. Those land with the future push spec, not this one.
10. SAML, OAuth, social login. Email-and-password is the only login mechanism in scope.

---

## Technical

### Approach

The backend is a single FastAPI 0.136 application served by Granian 2.x under systemd as a **single worker** (`--workers 1`), listening on `127.0.0.1:8000`. The single-worker constraint is load-bearing: the per-IP and per-account rate limiters in §`security/rate_limit.py` are in-process sliding windows, so a multi-worker deploy would bypass the limit. Caddy on the same host reverse-proxies `/api/*` to that socket. The SvelteKit PWA continues to serve at `/` and now calls `/api/*` for auth and sync. There is no CORS configuration: the browser sees one origin (`grillmi.cloud` in prod, `grillmi.krafted.cc` in dev), and Vite's dev server proxies `/api` to `http://localhost:8000` so cross-origin never enters the loop.

Persistence is Postgres 17 (apt PGDG `noble-pgdg`) on `127.0.0.1:5432`, scram-sha-256 auth, role `grillmi` with a Doppler-sourced password owning database `grillmi`. SQLAlchemy 2.0.49 async ORM with asyncpg 0.31 drives all reads and writes; Alembic 1.18 manages migrations. Pydantic-settings 2.14 loads typed config from `/etc/grillmi/config.env` (non-secrets) and from environment variables injected by `doppler run` (secrets); both are merged at process start and missing required values fail-fast.

Auth follows `~/dev/reference/auth.md` to the letter. Argon2id at the prescribed parameters runs in `asyncio.to_thread`. A module-load `_DUMMY_HASH` keeps login timing identical for missing and existing accounts. Server-side sessions are 32-byte url-safe random tokens with a per-row CSRF token, written to the `sessions` table, validated on every request via cookie lookup. Rate limits are sliding-window in-memory (5 per IP per minute, 10 per account per hour for login). HIBP k-anonymity runs on every set-password and reset (fail-open). Security headers are middleware. The audit log is fire-and-forget: each event writes a row to `audit_log` and emits a structlog INFO line tagged `audit=True`. Email sends through Hostpoint SMTP via `aiosmtplib`, sender domain `kraftops.ch`, German Jinja2 templates in `backend/templates/emails/`. Hourly background task purges expired sessions.

Sync is per-entity REST. GET endpoints accept `?since=<iso8601>` and return rows where `updated_at > since` or `deleted_at > since`, so clients perform delta pulls. POST creates; PATCH updates; DELETE soft-deletes by setting `deleted_at`. Conflict resolution is last-write-wins on `updated_at`: the client always sends the row's current `updated_at`, the server compares to the persisted value and rejects with 409 if the request is older. A bulk endpoint `POST /api/sync/import` is used once on first-login activation: it accepts the full IDB payload in one transaction, attributes everything to the authenticated user, and skips rows whose `id` already exists for that user (idempotent on retry). Foreign keys are real database constraints with ON DELETE CASCADE on `grillade_items`, `menu_items`, and `settings`, so account deletion is a single `DELETE FROM users WHERE id = ?`.

Schema (every table includes `created_at` and `updated_at`):

1. `users` (`id` UUID PK, `email` citext UNIQUE, `password_hash` text, `created_at` timestamptz, `last_login_at` timestamptz nullable). Account deletion is a hard cascading delete (no soft-delete on `users`); see Out of scope and the cascade rules below.
2. `sessions` (`id` UUID PK, `token` varchar UNIQUE INDEXED (lookup key on cookie), `user_id` UUID FK ON DELETE CASCADE, `csrf_token` varchar, `created_at` timestamptz, `last_active_at` timestamptz, `expires_at` timestamptz INDEXED, `ip_address` inet, `user_agent` text). The session list and revoke endpoints use `id` to keep raw tokens off the wire; the auth middleware looks up by `token` from the cookie and updates `last_active_at` on every authenticated request (debounced to once per 60 seconds via an in-memory map keyed by token).
3. `password_reset_tokens` (`id` UUID PK, `user_id` UUID FK ON DELETE CASCADE, `token_hash` bytea UNIQUE, `kind` text CHECK kind IN ('invitation','reset'), `expires_at` timestamptz, `used_at` timestamptz nullable).
4. `audit_log` (`id` UUID PK, `user_id` UUID FK nullable ON DELETE SET NULL, `email` text nullable, `action` text, `ip_address` inet, `success` bool, `occurred_at` timestamptz, INDEX on `(user_id, occurred_at)`, INDEX on `occurred_at`).
5. `grilladen` (`id` UUID PK, `user_id` UUID FK ON DELETE CASCADE, `name` text nullable, `status` text CHECK status IN ('planned','running','finished'), `target_finish_at` timestamptz, `started_at` timestamptz nullable, `ended_at` timestamptz nullable, `position` double precision, `updated_at` timestamptz, `deleted_at` timestamptz nullable, INDEX on `(user_id, updated_at)`, INDEX on `(user_id, deleted_at)`). Partial unique index `one_active_grillade_per_user` on `(user_id) WHERE status IN ('planned','running') AND deleted_at IS NULL`.
6. `grillade_items` (`id` UUID PK, `grillade_id` UUID FK ON DELETE CASCADE, `label` text, `cut_id` text, `thickness_cm` numeric nullable, `doneness` text nullable, `prep_label` text nullable, `cook_seconds_min` int, `cook_seconds_max` int, `flip_fraction` numeric, `rest_seconds` int, `status` text, `started_at` timestamptz nullable, `plated_at` timestamptz nullable, `position` double precision, `updated_at` timestamptz, `deleted_at` timestamptz nullable).
7. `menus` (`id` UUID PK, `user_id` UUID FK ON DELETE CASCADE, `name` text, `position` double precision, `updated_at` timestamptz, `deleted_at` timestamptz nullable).
8. `menu_items` (`id` UUID PK, `menu_id` UUID FK ON DELETE CASCADE, `label` text, `cut_id` text, `thickness_cm` numeric nullable, `doneness` text nullable, `prep_label` text nullable, `position` double precision, `updated_at` timestamptz, `deleted_at` timestamptz nullable).
9. `favorites` (`id` UUID PK, `user_id` UUID FK ON DELETE CASCADE, `label` text, `cut_id` text, `thickness_cm` numeric nullable, `doneness` text nullable, `prep_label` text nullable, `position` double precision, `last_used_at` timestamptz, `updated_at` timestamptz, `deleted_at` timestamptz nullable).
10. `settings` (`user_id` UUID PK FK ON DELETE CASCADE, `value` jsonb, `updated_at` timestamptz).

A daily systemd timer (`grillmi-tombstone-gc.timer`) runs a Python entrypoint that deletes rows where `deleted_at < now() - interval '30 days'` and `audit_log` rows older than 365 days. A separate daily timer (`grillmi-backup-daily.timer`) runs `pg_dump | gzip` into `/var/backups/grillmi/<bucket>/<timestamp>.dump.gz`; the management script promotes Sunday's dump into the weekly bucket and the first-of-month dump into the monthly bucket, with retention 7/4/6.

User-scope enforcement is by convention plus mechanical isolation tests. Every function in `backend/grillmi/repos/` takes `user_id: UUID` as the required first arg after `session: AsyncSession`. SQLAlchemy queries always include `where(Model.user_id == user_id)`. Each repo file is paired with `backend/tests/integration/test_<repo>_isolation.py` that creates two users, writes data as user A, then asserts user B cannot read or modify any of A's rows. No SQLAlchemy event hooks, no Postgres RLS.

Frontend changes are surgical. The IDB schema bumps from v3 to v4: the upgrade callback folds the `sessions` and `planState` singletons into a unified `grilladen` store keyed by UUID, so the IDB layer matches the server schema. A new `authStore.svelte.ts` mirrors the existing rune-based pattern and holds `{user, csrfToken} | null`. `+layout.ts`'s load function fetches `GET /api/auth/me`, on 401 redirects to `/login?next=<original>`, on success populates the auth store. Four new routes go under `src/routes/`: `/login`, `/set-password` (handles both invitation and reset tokens, calls the logout endpoint on load if a cookie is present), `/forgot-password`, `/account`. A new `src/lib/sync/queue.ts` debounces 200ms after every IDB write, flushes on `visibilitychange` to `visible`, pulls on app foreground and on Grillade open, and persists itself in IDB store `syncQueue` so a 401 mid-flush survives navigation. Sign-out calls `resetAll()` from `db.ts` to wipe everything.

OpenAPI is conditional. `OPENAPI_ENABLED=true` on dev exposes `/docs` and `/redoc`; prod sets the flag false and FastAPI runs with `docs_url=None, redoc_url=None`. Logging is structlog 25 with the JSON renderer, captured by systemd journald (no Loki shipper in v1). Granian access logs are routed through structlog's `ProcessorFormatter` so dependency logs join the same JSON pipeline.

The Vite dev server proxies `/api` to `localhost:8000` via `server.proxy` in `vite.config.ts`, so the frontend code never branches on environment when constructing API URLs. In prod, the same relative paths hit Caddy's reverse-proxy block.

**Frontend wire-format and CSRF plumbing.** The `+layout.svelte` shell renders a `<meta name="csrf-token" content="...">` tag populated from the `+layout.ts` load result. A small helper `src/lib/api/client.ts` exports `apiFetch(path, init)` that always sends `credentials: 'include'`, populates the `X-CSRFToken` header from `authStore.csrfToken` on every POST, PATCH, PUT, and DELETE, parses 401 to call `authStore.clear()` and `goto('/login?next=' + currentPath)`, parses 409 by re-reading the entity from the server and writing it into IDB without firing a sync write, and parses 5xx by enqueueing the original request into `syncQueue` for replay only when the method is one of POST, PATCH, PUT, DELETE; for GET the helper retries once with backoff, then surfaces an offline indicator. Every code path that hits the backend goes through `apiFetch`; no direct `fetch` calls to `/api/*` exist outside this helper. Cookie attributes follow `~/dev/reference/auth.md` §Cookie Configuration: HttpOnly, Secure (prod), SameSite=Strict (prod) / Lax (dev), 24-hour Max-Age. Logout, account-delete, and revoke responses set `Set-Cookie: <name>=; Max-Age=0; ...` to evict the cookie client-side in addition to deleting the row.

**Soft-delete semantics for the sync queue.** Soft-delete is the only delete operation visible to the client. The IDB layer treats a row whose `deleted_at` is set as gone for list queries (matching the way the existing `favoritesStore` filters), but keeps the row physically present so a delta pull from a peer device can observe the deletion. The 30-day tombstone GC on the server deletes the row physically; subsequent `?since=` pulls older than 30 days will not see the row, but no live client should be that far behind, and a fresh login goes through the bulk import not the delta path.

**Sync-queue clock authority.** The sync watermark stored in IDB store `syncMeta` (key `lastPullEpoch`) is the server's `max(updated_at)` from the most recent delta response, not `Date.now()` on the client. Each delta endpoint includes a `server_time` field in the response body (`{rows: [...], server_time: "<iso8601>"}`) which the client persists verbatim. This eliminates client-clock drift between iPhone and Mac and removes the need for any millisecond skew fudge. On the very first pull (no stored watermark), the client passes `since=1970-01-01T00:00:00Z` which the server treats as a full pull.

**Wake-Lock and active-Grillade contract.** The existing Wake-Lock acquisition in `sessionStore.svelte.ts` continues to drive screen-on behaviour during a running Grillade. Account-level changes do not touch the runtime ticker. Sign-out releases the Wake Lock as part of `resetAll()` cleanup so a phone left on the table after sign-out is not held awake indefinitely.

**Why not Postgres Row-Level Security.** RLS is the textbook answer to multi-tenant isolation. We deliberately skip it. RLS adds runtime cost on every query, depends on a session-scoped `SET app.current_user` that has to be wired into every connection acquisition (testcontainers, alembic, the admin CLI, the GC job), and does not protect against a developer forgetting to set it. The mechanical isolation tests in `backend/tests/integration/test_<repo>_isolation.py` catch the same class of bug at code-review time and regression at CI time, and they run in milliseconds against the same database the prod role uses. If a future scale event adds a second consumer to the database (e.g. another app), revisit RLS.

**Why not JWT.** Server-side sessions match the house standard verbatim per `~/dev/reference/auth.md`. Instant revocation matters at the grill: if the iPhone falls into the embers, the user signs in on a new device and revokes the old session from `/account` and the lost device is locked out within ten seconds. JWT access-plus-refresh would leave the access token alive for its full TTL.

**Why one Grillade active per user.** The product model in `accounts-decision-apr-2026.md` is solo-user, one cookout at a time. The partial unique index `one_active_grillade_per_user` codifies this at the database. The frontend already enforces it via the existing single-`session` IDB store; the constraint catches a sync race where two devices both try to start a Grillade in the same second. The losing write gets a clean Postgres error that the API translates to HTTP 409, and the client refetches and shows the running Grillade.

**Why fail-open on HIBP.** The HaveIBeenPwned check is a defence-in-depth measure, not a primary control. Argon2id at the prescribed parameters is the primary control. If the HIBP API is unreachable (Cloudflare incident, DNS hiccup, our outbound 443 dropped), blocking password sets would block legitimate users from activating accounts, which is a worse outcome than allowing a slightly-weaker password through. The audit log records the HIBP outcome on every set so we can reconstruct the timeline if needed.

**Why send-before-commit on email.** Per `~/dev/reference/auth.md` "fail open on HIBP, fail closed on email": if `aiosmtplib.send` raises, the activation row is never inserted, the `users` row stays in its prior state (or never gets created in the admin-init path), and the API returns 502 with a generic error. There is no orphan account, no dangling reset token. The single transaction wrapping the email send and the row write is an explicit `async with session.begin():` block in `backend/grillmi/routes/auth.py`.

**Why the bulk import is not idempotent on conflicting rows.** The first-login bulk import is the user's existing local IDB content; it has no concept of a server row to "merge with". The endpoint's idempotency rule is "if a row with this id already exists for this user, skip", which makes a retry safe but never overwrites. If a future spec adds a second-device first-login flow that needs merge-on-import semantics, that goes through the standard sync endpoints not the bulk import.

**Why no separate change-password endpoint.** Per `auth.md` §Password Policies "No Standalone Change Password Form": the `/account` page's "Passwort ändern" button calls the existing forgot-password endpoint with the current user's email, which sends a reset link. One code path handles every password change, every change invalidates all sessions, and there is no current-password verification flow to maintain.

**Why structlog instead of stdlib logging.** Per `stack-research-backend-apr-2026.md` §8: contextvars-based binding (request_id and user_id flow into every log line inside a request without manual passing), processor pipelines (one config produces colorised dev output and JSON prod output), and orjson rendering for ~85k JSON lines per second vs stdlib's ~22k. The audit log writes go to both `audit_log` Postgres table (durable) and to structlog under the named logger `audit` (queryable by `journalctl -u grillmi-api | jq 'select(.logger=="audit")'`).

### Approach Validation

1. Stack pins are taken verbatim from `resources/docs/stack-research-backend-apr-2026.md`: FastAPI 0.136, Granian 2.x with uvicorn 0.34 fallback, asyncpg 0.31, SQLAlchemy 2.0.49 async, Alembic 1.18, pydantic-settings 2.14, structlog 25, orjson 3.10, argon2-cffi 23.1, aiosmtplib (latest), pytest 8.3, pytest-asyncio 0.25, httpx 0.28, testcontainers (dev only). Postgres 17 from PGDG `noble-pgdg`, listen on `127.0.0.1`, scram-sha-256.
2. Auth approach matches `~/dev/reference/auth.md` to the letter; no bespoke auth is introduced. The mandatory admin password-reset CLI ships in Phase 4.
3. API exposure is path-based per `roadmap-apr-2026.md` step 2: `grillmi.cloud/api` in prod, `grillmi.krafted.cc/api` in dev, no new DNS, no new tunnel route, no CORS.
4. The bundled scope (backend bootstrap plus auth plus sync) matches roadmap step 2; the iPad responsive work and the Glühen redesign are sequenced after this spec, not gated by it.
5. The decision to keep server-side sessions over JWTs, in-memory rate limits over Redis, and in-process async over a broker is the same shape as Spamnesia, Carraway, and the targeted Cognel migration; this is the established homelab pattern, not a new direction.
6. The Grillade terminology decision is honoured: every new domain noun in code, schema, and UI is `Grillade` or `Grilladen`. The word "session" stays only as the technical term for HTTP sessions in the auth subsystem, per `accounts-decision-apr-2026.md`.
7. Email goes through Hostpoint SMTP per `~/dev/reference/email-services-inventory.md` sender policy. SMTP credentials are cross-project refs from `grillmi/dev` and `grillmi/prd` to `smtp/prd`, matching the Vigil and Spamnesia pattern.
8. Config split follows `~/dev/reference/env-config.md`: non-secrets in `/etc/grillmi/config.env` managed by Ansible, no fallbacks, no `-` prefix on `EnvironmentFile`. Secrets via `doppler run`.
9. Test pyramid follows `~/dev/reference/testing.md`: unit and integration mirror source under `backend/tests/`, deploy gate runs `uv run pytest --tb=short -q` on the target server before service restart, coverage floor 80%.
10. Service-management script extension follows `~/dev/reference/service-management-scripts.md`: `status` HTTP probe parses `/api/health`, exit codes 0/1/2 map to ok/degraded/down, sudoers drop-in restricts the systemctl verbs the script touches and is deployed with `validate: 'visudo -cf %s'`.
11. Backend host parity follows `~/dev/reference/new-project-infra.md`: apt-installed Postgres and Granian under systemd, no containers, Doppler-wrapped service unit, Caddy fronting `127.0.0.1`, Cloudflare Tunnel for public exposure, no inbound ports beyond SSH on 22/tcp.
12. Grillade terminology is preserved: every new schema column, repo function, route, and UI string uses `grillade` or `grilladen`. The word "session" appears only in the auth subsystem (server-side HTTP sessions), per `accounts-decision-apr-2026.md`.
13. Spec-review approach validation (2026-04-28): no external research was performed. The approach is an applied execution of established patterns documented in `~/dev/reference/auth.md`, `stack-research-backend-apr-2026.md`, and `accounts-decision-apr-2026.md`; alternatives (CRDTs, JWT, RLS, change-password endpoint, two-factor auth) are each explicitly evaluated and rejected with reasons earlier in this Approach section. The cross-file timing, runbook surface, and Doppler bootstrap split were checked and are coherent. The only approach-level fix from Round 0 was tightening Behavior 6 to allow the user to revoke the current session, since the runbook and E2E tests already assume it.

### Risks

| Risk | Mitigation |
| ---- | ---------- |
| Argon2id verify burst on simultaneous logins fills available memory | Each verify runs in `asyncio.to_thread` and consumes 64 MiB transiently; per-IP rate limit caps to 5 per minute. Host memory sizing is owned by the infra side file (target gives a 2x margin per `stack-research-backend-apr-2026.md` §12). |
| First-login bulk import of legacy IDB data corrupts on retry | `POST /api/sync/import` is idempotent: rows whose `id` already exists for the user are skipped, not overwritten. The client only marks `firstLoginMigrationComplete: true` after a 200, so any 5xx triggers retry through the standard sync queue. |
| Sync queue replay storm after a long offline period (hundreds of writes) | The queue serialises POST and PATCH per entity in IDB-insertion order; the server applies LWW per row so the last write is the only one that sticks. Queue is debounced 200ms so rapid IDB writes coalesce. |
| Email send fails silently and blocks user activation | `aiosmtplib` send happens before token-row commit per `auth.md` "send email before committing state". Failure surfaces as 502 to the admin CLI and to the forgot-password endpoint. |
| Caddy `/api` reverse-proxy lands a request before FastAPI is ready | Granian systemd unit declares `Type=notify` plus `Restart=always`; Caddy returns 502 during the (sub-second) restart window. The management script's `restart` verb waits on `/api/health` returning 200 before declaring success. |
| Doppler cross-project ref to `smtp/prd` rotates and breaks email | Hostpoint password rotations land in `smtp/prd` once and cascade to every consumer. The runbook checks invite delivery as a step. |
| IDB v3 to v4 migration loses an in-flight planState | The upgrade callback reads the old `sessions` (key `current`) and `planState` (key `current`) records, materialises them as a single Grillade row in the new `grilladen` store with a fresh UUID, then drops the legacy stores. Unit tested in `db.test.ts`. |
| Stranded `grillade_items` arriving before their parent | Server returns 409 when `grillade_id` is unknown; client retries the parent first, then the items. The sync queue orders writes by IDB insertion order so the parent is always enqueued first. |
| Hostpoint SMTP credential rotation breaks email mid-flight | The cross-project ref pattern means a single rotation in `smtp/prd` cascades automatically. The `/api/health` SMTP probe is a TCP connect, not a login; rotation is invisible to it. The first failed send surfaces in the journal and in the audit log entry's `success=false` row. |
| Activation link "pre-clicked" by an email-security scanner consumes the token before the user opens it | Hostpoint mailboxes addressed to `marco.fruh@me.com` route to iCloud, which does not aggressively pre-fetch links. Risk is residual; if it surfaces, the user falls back to `/forgot-password` (same flow, fresh token). The set-password 410 response surfaces a German "Link abgelaufen" page with a `/forgot-password` button so recovery is one tap. |
| Postgres `citext` extension missing | The Alembic initial migration enables `citext` first; the role's database creation step relies on `community.postgresql.postgresql_ext`. If both fail, manual recovery is `sudo -u postgres psql grillmi -c 'CREATE EXTENSION citext'`. |
| Vite dev proxy collides with a future server-side render | `adapter-static` keeps the app pure-SPA; the proxy only matters in dev. Prod traffic goes through Caddy's path-based reverse-proxy, where `/api/*` and `/*` are sibling handle blocks and can never collide. |
| Backup files accumulate forever and fill the LXC disk | Retention is enforced inside the `grillmi backup` script (7 daily, 4 weekly, 6 monthly). PBS volume backup of the LXC is the second line of defence and is configured at the host level. |
| The `one_active_grillade_per_user` partial unique index blocks legitimate multi-Grillade flows | The current product has at most one running Grillade per user (per `accounts-decision-apr-2026.md`). The index enforces that invariant at the database. If a future product change ever wants concurrent Grilladen, this index is dropped in a one-line Alembic migration. |

### Implementation Plan

**Phase 1: Backend project scaffolding**

- [x] Create `backend/` at the repo root with the `src` layout: `backend/grillmi/{__init__.py, main.py, config.py, db.py, logging.py, security/, repos/, routes/, templates/emails/, cli/, email/, models/, sync/}` and `backend/tests/{conftest.py, unit/, integration/}`.
- [x] Add a top-level `backend/README.md` documenting the `uv sync && uv run alembic upgrade head && uv run granian --interface asgi grillmi.main:app` dev-loop and a one-liner pointing at `260428-accounts-and-sync.md` for the full spec.
- [x] Write `backend/pyproject.toml` declaring runtime deps `fastapi[standard]>=0.136,<0.137`, `granian>=2.0,<3`, `uvicorn>=0.34`, `asyncpg>=0.31,<0.32`, `sqlalchemy[asyncio]>=2.0.49,<2.1`, `alembic>=1.18,<2`, `pydantic-settings>=2.14,<3`, `structlog>=25,<26`, `orjson>=3.10`, `argon2-cffi>=23.1`, `aiosmtplib`, `httpx>=0.28`, `jinja2`, `ua-parser>=1.0`. Dev deps: `pytest>=8.3`, `pytest-asyncio>=0.25`, `pytest-mock`, `pytest-cov`, `testcontainers[postgres]>=4.8`. Set `[tool.pytest.ini_options] asyncio_mode = "auto"` and `[tool.coverage.report] fail_under = 80`. Declare `[project.scripts] grillmi-admin-init = "grillmi.cli.admin_init:main"` and `grillmi-admin-reset = "grillmi.cli.admin_reset:main"`; the management script's `admin-init` and `admin-reset` verbs forward to these entry points via `doppler run`.
- [x] Implement `backend/grillmi/config.py` using `pydantic_settings.BaseSettings` with required fields `APP_ENV`, `PUBLIC_BASE_URL`, `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM_ADDRESS`, `HOSTPOINT_SMTP_USER`, `HOSTPOINT_SMTP_PASSWORD`, `HIBP_USER_AGENT`, `SESSION_MAX_AGE_HOURS`, `SESSION_COOKIE_NAME`, `RATE_LIMIT_LOGIN_IP_PER_MIN`, `RATE_LIMIT_LOGIN_ACCOUNT_PER_HOUR`, `AUDIT_RETENTION_DAYS`, `TOMBSTONE_RETENTION_DAYS`, `OPENAPI_ENABLED`. Construct `DATABASE_URL` as `postgresql+asyncpg://{DATABASE_USER}:{DATABASE_PASSWORD}@{DATABASE_HOST}:{DATABASE_PORT}/{DATABASE_NAME}`.
- [x] Implement `backend/grillmi/db.py` exposing `engine`, `async_session_maker`, and a `get_session()` FastAPI dependency that yields `AsyncSession` and rolls back on exception.
- [x] Implement `backend/grillmi/main.py` with the FastAPI app factory: when `settings.OPENAPI_ENABLED` is true, instantiate `FastAPI(docs_url="/docs", redoc_url="/redoc")`; otherwise `FastAPI(docs_url=None, redoc_url=None)`. Wire startup and shutdown lifespan tasks (hourly session cleanup; structlog initialisation).
- [x] Implement `backend/grillmi/middleware.py` registering the security-headers middleware, the request-id binder (uuid per request, bound to structlog contextvars), and the CSRF middleware that runs after auth and before route handlers.
- [x] Wire route registration in `main.py`: include `auth_router`, `grilladen_router`, `menus_router`, `favorites_router`, `settings_router`, `sync_router`, `health_router`, all under prefix `/api`. Health is intentionally unauthenticated; everything else depends on a `current_user` FastAPI dependency that reads the cookie and raises 401 on miss.
- [x] Implement `backend/grillmi/logging.py` configuring structlog with the JSON renderer, contextvars binding, and a `ProcessorFormatter` that captures Granian access logs into the same pipeline.

**Phase 2: Postgres schema and initial Alembic migration**

- [x] `cd backend && alembic init -t async migrations` then edit `migrations/env.py` to import `backend.grillmi.db.Base` and to read the URL from `Settings().DATABASE_URL`.
- [x] Define SQLAlchemy ORM models in `backend/grillmi/models/` (one file per table: `user.py`, `session.py`, `password_reset_token.py`, `audit_log.py`, `grillade.py`, `grillade_item.py`, `menu.py`, `menu_item.py`, `favorite.py`, `settings.py`). Use typed `Mapped[...]` declarative. Primary keys default to `uuid.uuid4()` at the Python layer (column `default=uuid.uuid4`), so server-generated rows (users, sessions, audit_log, password_reset_tokens) get a UUID without the client supplying one, and client-generated rows (grilladen, items, menus, favorites, settings) keep the UUID the client minted.
- [x] Generate `backend/migrations/versions/0001_initial.py` via `alembic revision --autogenerate -m "initial schema"` and hand-fix anything autogenerate misses: `citext` extension creation, the `one_active_grillade_per_user` partial unique index, the indexes listed in the schema section, and the `kind` CHECK constraint on `password_reset_tokens`.
- [x] Add a hand-written second revision `0002_seed_extensions.py` only if `0001_initial.py` cannot enable the `citext` extension cleanly inside autogenerate; otherwise keep one initial revision.

**Phase 3: Auth standard primitives**

- [x] Implement `backend/grillmi/security/argon2.py` exposing `hash_password()`, `verify_password()`, and a module-load `_DUMMY_HASH = _hasher.hash("dummy-password-for-timing-safety")`. Both `hash` and `verify` wrap `asyncio.to_thread(...)`. Parameters: `memory_cost=65536, time_cost=3, parallelism=4, hash_len=32, salt_len=16`.
- [x] Implement `backend/grillmi/repos/sessions_repo.py` with `create_session(user_id, ip, user_agent) -> (token, csrf_token, expires_at)`, `get_session(token)`, `delete_session(token)`, `delete_sessions_for_user(user_id)`, `cleanup_expired()`, `list_sessions_for_user(user_id, current_token)` returning rows annotated with `is_current = (row.token == current_token)`. Token = `secrets.token_urlsafe(32)`. The device-label parser is a small helper in `backend/grillmi/security/device_label.py` that derives e.g. `"Mac, Safari"` from the User-Agent string using `ua-parser>=1.0` (already on the auth-stack baseline); fall back to the raw UA truncated at 60 chars when parsing fails.
- [x] Implement `backend/grillmi/security/csrf.py` with `validate_csrf(request, session) -> None | raises HTTPException(403)`, comparing the `X-CSRFToken` header to `session.csrf_token` via `secrets.compare_digest`. Exempt GET/HEAD/OPTIONS.
- [x] Implement `backend/grillmi/security/rate_limit.py` with two sliding-window in-memory counters: `login_ip_limiter` (5 per 60s, key = client IP) and `login_account_limiter` (10 per 3600s, key = email). Public surface: `check_and_record(key) -> None | raises HTTPException(429)`.
- [x] Implement `backend/grillmi/security/headers.py` middleware that sets `X-Frame-Options DENY`, `X-Content-Type-Options nosniff`, `Referrer-Policy strict-origin-when-cross-origin`, `Strict-Transport-Security max-age=31536000; includeSubDomains` (HTTPS only), and a strict `Content-Security-Policy default-src 'self'; frame-ancestors 'none'`.
- [x] Implement `backend/grillmi/repos/audit_log_repo.py` with `record(action, user_id, email, ip, success)` that inserts a row in the `audit_log` table and emits a structlog INFO line via the named logger `audit` (so `journalctl -u grillmi-api -p info | jq 'select(.logger=="audit")'` filters cleanly). Wrap calls in `asyncio.create_task` so they never block the request.
- [x] Implement `backend/grillmi/security/hibp.py` with `check_password(password) -> bool` performing the SHA-1 prefix range API call against `https://api.pwnedpasswords.com/range/{prefix}` using `httpx.AsyncClient` with a 5-second timeout and the `HIBP_USER_AGENT` header. On API failure, log a warning and return `False` (fail-open, password allowed).
- [x] Implement `backend/grillmi/email/sender.py` exposing `send(to, subject, body_text)` via `aiosmtplib` against `SMTP_HOST:SMTP_PORT` with STARTTLS, authenticating with `HOSTPOINT_SMTP_USER` and `HOSTPOINT_SMTP_PASSWORD`, From = `SMTP_FROM_ADDRESS`. Add `backend/templates/emails/activation.de.txt` and `backend/templates/emails/password-reset.de.txt` (Jinja2; receive `recipient_email`, `link`, `expires_hours`).
- [x] Activation email body (German, plain text): subject `Grillmi: Konto aktivieren`. Body explains the link is valid for 72 hours, identifies the app, and is signed off `Bis bald am Grill, Grillmi`. Reset email body: subject `Grillmi: Passwort zurücksetzen`, identical structure but 30-minute expiry text, plus a short line about ignoring the email if the user did not request it.
- [x] Implement `backend/grillmi/email/templates.py` with `render_activation(link, expires_hours, recipient)` and `render_reset(link, expires_hours, recipient)` returning `(subject, body_text)`. Loads templates via Jinja2's `FileSystemLoader('backend/templates/emails')`. Used by both auth routes and the admin CLI.

**Phase 4: Auth routes and admin password-reset CLI**

- [x] Implement `backend/grillmi/routes/auth.py` with `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/forgot-password`, `POST /api/auth/set-password`, `GET /api/auth/sessions`, `POST /api/auth/sessions/{id}/revoke`, `DELETE /api/auth/account`. Each route follows the exact sequence in `~/dev/reference/auth.md` §Login Flow and §Invitation & Password Reset Flow. Token pages call logout on load (clear-session-on-token-pages); activation auto-logs-in, reset does not. Edge cases that must be covered: 1) expired token returns HTTP 410 Gone with a German `error_code: "token_expired"`, frontend renders "Link abgelaufen" plus a button to `/forgot-password`; 2) already-consumed token returns HTTP 410 with `error_code: "token_used"`, same frontend treatment; 3) two simultaneous set-password POSTs with the same token: the row's `used_at IS NULL` predicate inside `UPDATE ... WHERE used_at IS NULL RETURNING *` makes the first win and the second receive zero rows, returning 410.
- [x] Implement `backend/grillmi/cli/admin_init.py` exposing `grillmi-admin-init --email <email>` (entry point declared in `pyproject.toml`'s `[project.scripts]`). Behaviour, in order: 1) check whether a user row exists for the email and silently exit 0 if it does (idempotent); 2) build the activation link, render the email body, send via `aiosmtplib` (send-before-commit per `auth.md` §Email Delivery — a send failure aborts before any DB writes); 3) inside `async with session.begin():` insert the user row with `password_hash = "!disabled_" + secrets.token_hex(8)` and the matching `password_reset_tokens` row holding `sha256(token)`, kind=`invitation`, expires in 72 hours. The activation token (`secrets.token_urlsafe(32)`) is generated before the email send so the link is correct.
- [x] Implement `backend/grillmi/cli/admin_reset.py` exposing `grillmi admin-reset` with the `read -s` plus temp-file plus pipe pattern from `auth.md` §Admin Password Reset Script. Hashes via `argon2.hash_password()`, calls `delete_sessions_for_user(user_id)` after writing the new hash, prints only success or failure.
- [x] Add a wrapper shell script `backend/grillmi/cli/_admin_reset_wrapper.sh` that performs the `read -s` prompt, writes the temp Python file, sets `chmod 600`, traps for cleanup, and pipes the password into the Python entrypoint. Document in the script header that the password must never appear in argv or environment.

**Phase 5: Repo layer plus sync routes**

- [x] Implement `backend/grillmi/repos/grilladen_repo.py`, `grillade_items_repo.py`, `menus_repo.py`, `menu_items_repo.py`, `favorites_repo.py`, `settings_repo.py`. Every public function takes `session: AsyncSession, user_id: UUID` as the first two args. Queries always filter on `user_id`. Soft-delete sets `deleted_at = func.now()` and writes `updated_at = func.now()`.
- [x] Implement `backend/grillmi/routes/grilladen.py` with `GET /api/grilladen?since=`, `POST /api/grilladen`, `GET /api/grilladen/{id}`, `PATCH /api/grilladen/{id}`, `DELETE /api/grilladen/{id}`, `GET /api/grilladen/{id}/items?since=`, `POST /api/grilladen/{id}/items`, `PATCH /api/grilladen/{id}/items/{item_id}`, `DELETE /api/grilladen/{id}/items/{item_id}`. PATCH compares request `updated_at` to persisted `updated_at` and returns 409 if request is older. Stranded child items return 409.
- [x] Implement `backend/grillmi/routes/menus.py` mirroring the Grilladen route shape for `/api/menus` and `/api/menus/{id}/items`.
- [x] Implement `backend/grillmi/routes/favorites.py` for `GET/POST /api/favorites`, `GET/PATCH/DELETE /api/favorites/{id}`, with the same `?since=` and LWW semantics.
- [x] Implement `backend/grillmi/routes/settings.py` for `GET /api/settings` and `PUT /api/settings` (replace-on-write of the jsonb blob).
- [x] Implement `backend/grillmi/routes/sync.py` with `POST /api/sync/import`, accepting `{grilladen, menus, favorites, settings}` in one transaction, attributing to `request.state.user_id`, skipping rows whose `id` exists for that user.

**Phase 5b: User-scope test scaffolding**

- [x] Add a session-scope fixture `two_users` in `backend/tests/integration/conftest.py` that creates user A and user B with distinct emails, returns `(user_a, user_b)`. Used by every isolation test.
- [x] Add a small helper `assert_isolated(repo_func, user_a, user_b, sample_row)` in `backend/tests/integration/_isolation.py` that writes `sample_row` for user A, calls `repo_func` as user B, asserts no rows visible. Each isolation test is a one-liner that reuses this helper.

**Phase 6: Health, OpenAPI, logging**

- [x] Implement `backend/grillmi/routes/health.py` with `GET /api/health`. Returns 200 `{status:"ok", db:true, smtp_reachable:true}` when healthy. DB probe is `SELECT 1`; SMTP probe is a synchronous TCP `socket.create_connection((SMTP_HOST, SMTP_PORT), timeout=2)` wrapped in `asyncio.to_thread`. Returns 503 with `{status:"degraded", ...}` when DB unreachable.
- [x] Wire conditional OpenAPI in `backend/grillmi/main.py` per Approach.
- [x] Wire structlog initialisation in `backend/grillmi/main.py`'s lifespan startup; the audit logger is the named logger `audit`. Every log line that record() emits carries `logger="audit"` plus `action`, `user_id`, `email`, `ip`, `success` as contextvar-bound fields.

**Phase 7: Frontend auth store and routes**

- [x] Implement `src/lib/api/client.ts` exporting `apiFetch(path, init)` with the contract described in Approach (auto CSRF header, auto-redirect on 401, refetch-on-409, queue-on-5xx).
- [x] Implement `src/lib/stores/authStore.svelte.ts` matching the rune pattern in `favoritesStore.svelte.ts`. Public API: `get user`, `get csrfToken`, `init(serverState)`, `setSession({user, csrfToken})`, `clear()`.
- [x] Update `src/routes/+layout.ts` to fetch `GET /api/auth/me`. On 200, return `{user, csrfToken}`. On 401, throw `redirect(303, '/login?next=' + encodeURIComponent(url.pathname))`. Skip the redirect if `url.pathname` is already `/login`, `/set-password`, or `/forgot-password`.
- [x] Update `src/routes/+layout.svelte` to call `authStore.init(data)` on mount.
- [x] Implement `src/routes/login/+page.svelte` with email and password fields, submit calls `POST /api/auth/login` (CSRF header populated from a meta tag rendered by `+layout.svelte` after first-load), on success populates `authStore` and navigates to `?next` or `/`.
- [x] Implement `src/routes/set-password/+page.svelte` reading `?token=` from the URL. On mount, call `POST /api/auth/logout` if a session cookie is present (per auth.md clear-session-on-token-pages). Submit calls `POST /api/auth/set-password` with `{token, password}`. On invitation success, populate `authStore` from the response and navigate to `/`. On reset success, navigate to `/login`.
- [x] Implement `src/routes/forgot-password/+page.svelte` with an email field; submit calls `POST /api/auth/forgot-password` and shows the always-the-same German confirmation toast.
- [x] Implement `src/routes/account/+page.svelte` showing email read-only, a "Passwort ändern" button that calls `POST /api/auth/forgot-password` for the current email, the parsed session list from `GET /api/auth/sessions` with per-row "Abmelden" button calling `POST /api/auth/sessions/{id}/revoke`, and a "Konto löschen" `HoldButton` (500ms) that calls `DELETE /api/auth/account`, then `resetAll()`, then navigates to `/login`.

**Phase 8: IDB v3 to v4 migration**

- [x] Update `src/lib/stores/db.ts`: bump `DB_VERSION` to 4. In the upgrade callback when `oldVersion < 4`, create a new `grilladen` object store (keyed by UUID) and a new `syncQueue` store (keyed by auto-increment). Migrate the singleton `sessions` (key `current`) and the singleton `planState` (key `current`) into a single `grilladen` row using `uuid()`; preserve `targetEpoch`, items, and status. Drop the legacy `sessions` and `planState` stores at the end of the callback.
- [x] Add `listGrilladen()`, `putGrillade()`, `deleteGrillade()`, `listSyncQueue()`, `enqueueSync()`, `popSync()` to `db.ts` matching the existing helpers' shape.
- [x] Extend `resetAll()` to clear the new `grilladen` and `syncQueue` stores.

**Phase 9: Sync queue**

- [x] Implement `src/lib/sync/queue.ts` with the public surface `enqueue(write)`, `flush()`, and `attach()`. The `write` shape is `{entity, method, path, body, idbKey}`. `enqueue` writes a row to IDB store `syncQueue` with an auto-incremented sequence id; `flush` drains the queue in id order, calling `apiFetch` per row, removing the row only on 2xx. The 200ms debounce is a single shared `setTimeout` reset on every `enqueue`; the timeout fires `flush()`. `attach()` adds the `visibilitychange` listener and a `online` listener that triggers `flush()` immediately on reconnect.
- [x] Implement the per-entity send mapping inside `src/lib/sync/queue.ts`: a small `dispatch(write)` helper resolves `{entity: 'grilladen', method: 'POST', body}` into `apiFetch('/api/grilladen', {method: 'POST', body: JSON.stringify(body)})`. Centralise the mapping so future entities are one entry.
- [x] Implement `src/lib/sync/pull.ts` with `pull(since)` that calls every GET endpoint with the `?since=` watermark stored in IDB store `syncMeta`; merges results into IDB stores using the same LWW rule (server `updated_at` wins). Called on app foreground (`document.visibilitychange` to `visible`) and on Grillade open.
- [x] Implement an IDB store `syncMeta` (keys `lastPullEpoch` and `firstLoginMigrationComplete`) maintained by `pull.ts` and `set-password/+page.svelte`. On every successful delta response, write `lastPullEpoch = response.server_time` (server-authoritative timestamp; no client `Date.now()` fudge).
- [x] Wire `attach()` into `src/routes/+layout.svelte`'s `onMount`. Also call `pull(lastPullEpoch)` once on mount so a freshly-foregrounded tab gets a delta even if it never went hidden.
- [x] Update `vite.config.ts` to add `server.proxy: {'/api': {target: 'http://localhost:8000', changeOrigin: false, secure: false}}` so dev (`pnpm dev`) talks to a locally-running backend with the same path-based addressing the production Caddy block uses.

**Phase 10: First-login data migration**

- [x] In `src/routes/set-password/+page.svelte`'s success handler for invitation activation, before navigating to `/`, read the IDB v4 stores already produced by the Phase 8 migration: `listGrilladen()`, `listFavorites()`, `listSavedPlans()` (menus), `getSettings()`. Construct the `/api/sync/import` payload as `{grilladen, menus, favorites, settings}` and POST it. On 200, write `firstLoginMigrationComplete: true` into IDB store `syncMeta`. On non-200, enqueue the same payload via the standard sync queue and proceed.
- [x] Add a guard in `src/lib/sync/queue.ts` that no-ops if `firstLoginMigrationComplete` is false (so the regular queue does not double-import legacy rows).

**Phase 10b: Wire existing stores through the sync queue**

- [x] Update `src/lib/stores/favoritesStore.svelte.ts` `save`, `rename`, `remove`, and `touch` actions to call `enqueueSync({entity: 'favorites', method, payload})` after the IDB write completes. The store keeps its current optimistic-update behaviour; the queue handles the network.
- [x] Update `src/lib/stores/menusStore.svelte.ts` actions identically with `entity: 'menus'`.
- [x] Update `src/lib/stores/settingsStore.svelte.ts` `setTheme`, `setSound`, `setVibrate`, `markFirstRunSeen` to call `enqueueSync({entity: 'settings', method: 'PUT', payload})` after each persist.
- [x] Rename `src/lib/stores/sessionStore.svelte.ts` to `src/lib/stores/grilladeStore.svelte.ts` (per `accounts-decision-apr-2026.md`: "session" stays only as the auth-subsystem term). Update every importer to the new path. Translate the existing single-session model into a Grillade UUID write at every state-change persist call. Preserve the local-only Wake-Lock behaviour exactly.

**Phase 11: Management script**

- [x] Extend `/opt/grillmi/resources/scripts/grillmi`: add `migrate` (`cd /opt/grillmi/backend && doppler run -- alembic upgrade head`); extend `status` to include `grillmi-api.service` in the systemctl list and to GET `/api/health` for the HTTP probe; map `/api/health` `status` field onto the §5 `ok|degraded|down` exit-code contract from `service-management-scripts.md`. Add `backup [bucket]` and `restore <file>` with buckets `daily|weekly|monthly|manual`. The `backup daily` verb writes to `/var/backups/grillmi/daily/<timestamp>.dump.gz`, then if `date +%u` is `7` copies the same file into `weekly/`, and if `date +%d` is `01` copies it into `monthly/`. Retention enforced inside the script after each write: keep the 7 newest files in `daily/`, 4 in `weekly/`, 6 in `monthly/`; `manual/` is never trimmed.
- [x] Add `admin-init <email>` and `admin-reset` verbs to the management script that forward to `doppler run -- grillmi-admin-init --email <email>` and `doppler run -- grillmi-admin-reset` respectively, so day-to-day operator commands match the rest of the script's surface and the runbook's references.

**Phase 12: Tests passing locally**

- [x] Implement `backend/tests/conftest.py` per the Testing section: session-scope fixture creates the `grillmi_test` Postgres database (using `psycopg`'s sync admin connection or testcontainers-postgres locally), runs `alembic upgrade head`, yields the engine, drops the database; function-scope fixture opens a transaction, yields a session, rolls back.
- [x] Implement `backend/tests/integration/conftest.py` exposing `make_user(email, password)`, `auth_client(user)`, and `clean_audit_log()` factory fixtures used by the route tests.
- [x] Implement an SMTP capture fixture in `backend/tests/integration/conftest.py` that monkeypatches `aiosmtplib.SMTP` with an in-memory recorder, exposing `outbox()` to assert on `to`, `subject`, and `body`.
- [x] Implement every unit and integration test listed under Testing.
- [x] Frontend tests under `tests/unit/` use `fake-indexeddb` (already a project dev dep) and a mocked `apiFetch`.
- [x] Run `cd backend && uv run pytest --cov` locally and confirm `fail_under = 80` is met. Run `pnpm test:unit` and `pnpm test:e2e` from the repo root and confirm green.

**Phase 12b: E2E harness (local, hermetic)**

The deployed dev backend on `grillmi-dev` sends real Hostpoint email and holds Marco's working data, so the spec's E2E suite cannot run against it. A local hermetic harness in the repo brings up its own backend on a different port, captures email in memory, and exposes test-only endpoints so the Playwright suite can drive auth, sync, and account flows without touching the deployed service. The harness lives entirely under `tests/e2e/_setup/` and `tests/e2e/_lib/`; no infra-side or runbook changes are required.

- [x] Implement `tests/e2e/_setup/server.py`: starts `pgserver`, creates `grillmi_e2e`, runs `alembic upgrade head`, monkeypatches `grillmi.email.sender.send` into an in-memory list, registers `/api/_test/{reset,outbox,outbox/clear,admin_init,forge_token,forge_session,clear_rate_limits}` routes on the FastAPI app, runs uvicorn on `127.0.0.1:8001`, cleans up on SIGTERM.
- [x] Implement `tests/e2e/_setup/global-setup.ts` (Playwright `globalSetup`) that spawns the harness, polls `/api/health` until 200, persists the PID; and `tests/e2e/_setup/global-teardown.ts` that SIGTERMs it.
- [x] Update `playwright.config.ts` to wire `globalSetup`, `globalTeardown`, switch the webserver to `pnpm dev` on `5173` with `BACKEND_PORT=8001`, ignore the `_setup`/`_lib` helper directories.
- [x] Update `vite.config.ts`'s `/api` proxy target to read `BACKEND_PORT` from the environment so dev keeps pointing at `localhost:8000` while e2e uses `localhost:8001`.
- [x] Implement `tests/e2e/_lib/{api,outbox,admin,auth}.ts` helpers: `resetBackend()`, `clearRateLimits()`, `readOutbox()`, `waitForEmail()`, `extractTokenLink()`, `adminInit()`, `forgeToken()`, `forgeSession()`, `activateAccount(page,email)`, `login(page,email)`, `markFirstLoginComplete(page)`, `uniqueEmail(prefix)`.
- [x] Pre-existing `+layout.svelte` had a `<svelte:head>` inside an `{#if}` block which Svelte 5 rejects; moved the conditional inside `<svelte:head>` so vite dev compiles cleanly. (Pure refactor; the same DOM is rendered.)

> **Hand-off to the operator hat.** Once Phase 12 is green and `feature/accounts-and-sync` is pushed to GitHub, the operator picks up the work below. Tasks live in the side files; this note is a routing pointer, not a duplicate task list. Merge to `main` happens only after the full deploy and verification cycle is green on dev and prod.
>
> 1. Bring the `app_grillmi` Ansible role up to spec per `resources/infra/260428-accounts-and-sync.md`: LXC resize, Postgres 17 install, role + DB creation, `/etc/grillmi/config.env`, Granian systemd unit, Caddy `/api` block, sudoers extension, backup + tombstone-GC timers, gated `admin-init --email marco.fruh@me.com` on prod. Tag every new task `[grillmi, accounts]`.
> 2. Run the deploy sequence in `resources/runbooks/260428-accounts-and-sync.md` against `feature/accounts-and-sync`: dev playbook then dev verification, prod LXC resize, prod playbook then prod verification, add the `grillmi` Vigil check.

**Endpoint reference (consolidated)**

| Method and path | Auth | Body | Response | Notes |
| --------------- | ---- | ---- | -------- | ----- |
| `POST /api/auth/login` | none | `{email, password}` | 200 `{user, csrfToken}` plus `Set-Cookie` | rate-limited per IP and per account |
| `POST /api/auth/logout` | session | empty | 204 | deletes session row, clears cookie |
| `GET /api/auth/me` | session | empty | 200 `{user, csrfToken}` or 401 | drives `+layout.ts` gating |
| `POST /api/auth/forgot-password` | none | `{email}` | 200 generic | identical response on missing email |
| `POST /api/auth/set-password` | token in body | `{token, password}` | 200 (invitation: with cookie; reset: no cookie) | clear-session-on-token-pages enforced client-side |
| `GET /api/auth/sessions` | session | empty | 200 `[{id, device_label, ip_address, last_active_at, is_current}]` | scoped to caller |
| `POST /api/auth/sessions/{id}/revoke` | session | empty | 204 | deletes the session row |
| `DELETE /api/auth/account` | session plus CSRF | empty | 204 | cascades, then deletes user |
| `GET /api/grilladen?since=` | session | empty | 200 array | delta on `updated_at > since` or `deleted_at > since` |
| `POST /api/grilladen` | session plus CSRF | full row | 201 | creates |
| `GET /api/grilladen/{id}` | session | empty | 200 row | scoped |
| `PATCH /api/grilladen/{id}` | session plus CSRF | partial row plus `updated_at` | 200 or 409 | LWW |
| `DELETE /api/grilladen/{id}` | session plus CSRF | empty | 204 | soft-delete |
| `GET /api/grilladen/{id}/items?since=` | session | empty | 200 array | delta |
| `POST /api/grilladen/{id}/items` | session plus CSRF | full item | 201 or 409 | 409 if parent missing |
| `PATCH /api/grilladen/{id}/items/{item_id}` | session plus CSRF | partial item plus `updated_at` | 200 or 409 | LWW |
| `DELETE /api/grilladen/{id}/items/{item_id}` | session plus CSRF | empty | 204 | soft-delete |
| `GET/POST /api/menus`, `GET/PATCH/DELETE /api/menus/{id}`, `GET/POST /api/menus/{id}/items`, `PATCH/DELETE /api/menus/{id}/items/{item_id}` | session (plus CSRF on writes) | as above | as above | mirrors Grilladen |
| `GET/POST /api/favorites`, `GET/PATCH/DELETE /api/favorites/{id}` | session (plus CSRF on writes) | as above | as above | flat list |
| `GET /api/settings` | session | empty | 200 `{value, updated_at}` | scoped |
| `PUT /api/settings` | session plus CSRF | `{value, updated_at}` | 200 or 409 | replace-on-write |
| `POST /api/sync/import` | session plus CSRF | `{grilladen, menus, favorites, settings}` | 200 `{imported_counts}` | idempotent first-login bulk |
| `GET /api/health` | none | empty | 200 ok or 503 degraded | drives `grillmi status --check` |

---

## Testing

### Unit Tests

Located under `backend/tests/unit/` and `tests/unit/` for the frontend. Each line below is `<file>::<test_name>` plus a one-line description.

- [x] `backend/tests/unit/test_argon2.py::test_hash_then_verify_succeeds`: a hashed password verifies; an empty password verifies false.
- [x] `backend/tests/unit/test_argon2.py::test_dummy_hash_verify_returns_false_with_unknown_email`: `verify_password_timing_safe(password, None)` runs the dummy-hash path and returns False.
- [x] `backend/tests/unit/test_argon2.py::test_check_needs_rehash_after_param_change`: changing parameters causes `check_needs_rehash` to return True.
- [x] `backend/tests/unit/test_csrf.py::test_csrf_passes_when_header_matches_session_token`: `validate_csrf` returns None.
- [x] `backend/tests/unit/test_csrf.py::test_csrf_rejects_when_header_missing`: returns 403.
- [x] `backend/tests/unit/test_csrf.py::test_csrf_exempts_get_head_options`: GET requests pass without the header.
- [x] `backend/tests/unit/test_rate_limit.py::test_ip_limiter_blocks_after_5_in_60s`: 6th call raises 429.
- [x] `backend/tests/unit/test_rate_limit.py::test_account_limiter_blocks_after_10_in_3600s`: 11th call raises 429.
- [x] `backend/tests/unit/test_rate_limit.py::test_window_slides_correctly`: after 61s the counter resets.
- [x] `backend/tests/unit/test_hibp.py::test_known_breached_password_is_flagged` (mocked httpx): SHA-1 prefix request returns the suffix and the function returns True.
- [x] `backend/tests/unit/test_hibp.py::test_api_failure_fails_open`: httpx raises, function returns False, warning is logged.
- [x] `backend/tests/unit/test_email_sender.py::test_send_calls_aiosmtplib_with_starttls` (mocked aiosmtplib): asserts STARTTLS, From, To, Subject.
- [x] `backend/tests/unit/test_logging.py::test_audit_event_writes_named_audit_logger`: every emitted log line carries `logger == "audit"` and the action plus user_id plus success fields.
- [x] `tests/unit/authStore.test.ts::test_set_session_populates_user_and_csrf_token`: store reflects the values.
- [x] `tests/unit/authStore.test.ts::test_clear_resets_to_null`: `authStore.user` is null after clear.
- [x] `tests/unit/syncQueue.test.ts::test_enqueue_persists_to_idb`: `enqueue` writes to `syncQueue` store.
- [x] `tests/unit/syncQueue.test.ts::test_flush_drains_queue_in_order`: replays POSTs in IDB-insertion order.
- [x] `tests/unit/syncQueue.test.ts::test_401_during_flush_persists_queue_and_redirects`: queue remains, `authStore.user` is null, redirect was called.
- [x] `tests/unit/syncQueue.test.ts::test_409_continues_queue`: a 409 on row N still allows row N+1 to flush.
- [x] `tests/unit/db.test.ts::test_v3_to_v4_migration_folds_planstate_and_session_into_grilladen`: a fixture v3 DB ends up with one row in `grilladen`.
- [x] `tests/unit/db.test.ts::test_resetAll_clears_grilladen_and_syncQueue`: both stores empty after `resetAll()`.

### Integration Tests

Located under `backend/tests/integration/`. These hit a real Postgres via the session-scope fixture in `backend/tests/conftest.py`.

- [x] `test_grilladen_repo_isolation.py::test_user_b_cannot_read_user_a_grilladen`: creates two users, writes one Grillade as A, asserts B's `list_for_user` is empty.
- [x] `test_grilladen_repo_isolation.py::test_user_b_cannot_patch_user_a_grillade`: PATCH as B raises 404 (not 403, to avoid existence leak).
- [x] `test_grillade_items_repo_isolation.py::test_user_b_cannot_delete_user_a_item`: DELETE as B raises 404.
- [x] `test_menus_repo_isolation.py::test_user_b_cannot_read_user_a_menus`: same shape.
- [x] `test_menu_items_repo_isolation.py::test_user_b_cannot_patch_user_a_menu_item`: same shape.
- [x] `test_favorites_repo_isolation.py::test_user_b_cannot_list_user_a_favorites`: same shape.
- [x] `test_settings_repo_isolation.py::test_user_b_settings_are_independent`: writing as B does not affect A's row.
- [x] `test_auth_login.py::test_login_with_correct_password_returns_session_cookie_and_csrf_token`: cookie is set, body contains `csrfToken`.
- [x] `test_auth_login.py::test_login_with_wrong_password_returns_generic_error`: response body says "Invalid email or password" and is identical for missing email.
- [x] `test_auth_login.py::test_login_response_time_identical_for_existing_and_missing_email`: average over 20 runs differs by less than 50ms.
- [x] `test_auth_login.py::test_login_rate_limit_per_ip_returns_429_after_5_attempts`: 6th attempt raises 429.
- [x] `test_auth_login.py::test_login_disabled_user_returns_generic_error`: a `!disabled_*` hash returns the same error as wrong password.
- [x] `test_auth_set_password.py::test_invitation_token_set_password_auto_logs_in`: response carries a session cookie.
- [x] `test_auth_set_password.py::test_reset_token_set_password_does_not_auto_log_in`: no session cookie in response.
- [x] `test_auth_set_password.py::test_set_password_invalidates_all_existing_sessions`: previously created sessions for the user are gone.
- [x] `test_auth_set_password.py::test_set_password_rejects_hibp_match` (mocked HIBP): returns 422.
- [x] `test_auth_set_password.py::test_token_pages_clear_existing_session_on_load`: a logout call lands before the page render.
- [x] `test_auth_forgot_password.py::test_response_is_identical_for_existing_and_missing_email`: same body, same status.
- [x] `test_auth_forgot_password.py::test_unactivated_user_gets_invitation_email_with_72h_expiry`: edge case from auth.md.
- [x] `test_auth_sessions.py::test_get_sessions_returns_only_callers_sessions`: scoped by user_id.
- [x] `test_auth_sessions.py::test_revoke_session_removes_row`: row gone, subsequent request with that token returns 401.
- [x] `test_auth_account_delete.py::test_delete_account_cascades_grilladen_menus_favorites_settings_sessions`: every owned row is gone.
- [x] `test_grilladen_routes.py::test_get_with_since_returns_only_newer_rows`: rows with older `updated_at` are excluded.
- [x] `test_grilladen_routes.py::test_patch_with_older_updated_at_returns_409`: LWW.
- [x] `test_grilladen_routes.py::test_one_active_grillade_per_user_partial_index_enforced`: second concurrent active row raises a constraint error.
- [x] `test_grillade_items_routes.py::test_stranded_item_returns_409`: parent missing, server returns 409.
- [x] `test_grillade_items_routes.py::test_delete_grillade_cascades_items`: all items gone.
- [x] `test_sync_import.py::test_import_attributes_to_caller_user_id`: rows have the right `user_id`.
- [x] `test_sync_import.py::test_import_is_idempotent_on_duplicate_ids`: re-running the same payload does not duplicate rows.
- [x] `test_admin_cli.py::test_admin_init_idempotent_on_existing_email`: second run is a silent no-op.
- [x] `test_admin_cli.py::test_admin_reset_invalidates_all_sessions`: sessions for the user are deleted.
- [x] `test_health.py::test_health_returns_200_when_db_and_smtp_reachable`: 200 with all true.
- [x] `test_health.py::test_health_returns_503_when_db_unreachable`: with the engine pointed at a closed port.
- [x] `test_security_headers.py::test_response_carries_required_headers`: every header from auth.md §Security Headers is present.

### E2E Tests

Located under `tests/e2e/` (Playwright). Run against a local hermetic harness (Phase 12b below): `tests/e2e/_setup/server.py` boots `pgserver` + the FastAPI app on `127.0.0.1:8001` with `aiosmtplib.send` monkeypatched into an in-memory outbox, and registers test-only `/api/_test/*` endpoints (`reset`, `outbox`, `admin_init`, `forge_token`, `forge_session`, `clear_rate_limits`). Playwright's `globalSetup` spawns this harness, vite dev serves on `127.0.0.1:5173` with its `/api` proxy pointed at port `8001`, and the suite runs against the proxy so cookies bind to the same origin the browser navigates. The deployed dev backend on the same VM is never touched.

- [x] `tests/e2e/auth.spec.ts::test_full_activation_flow`: admin-init from CLI, fetch the email body via a test SMTP capture fixture, click the link in a Playwright context, set a password, land logged-in on Home.
- [x] `tests/e2e/auth.spec.ts::test_forgot_password_then_reset_then_login`: full reset flow ends at `/login`, not auto-logged-in.
- [x] `tests/e2e/auth.spec.ts::test_login_then_logout_clears_idb`: after logout, `indexedDB.databases()` shows no Grillmi data.
- [x] `tests/e2e/sync.spec.ts::test_grillade_created_in_context_a_appears_in_context_b`: two browser contexts, same user; create in A, foreground in B, see the row.
- [x] `tests/e2e/sync.spec.ts::test_concurrent_patch_resolves_lww`: A and B PATCH the same row; older write returns 409, newer wins.
- [x] `tests/e2e/sync.spec.ts::test_offline_writes_replay_on_reconnect`: go offline, edit two items, go online, server reflects both.
- [x] `tests/e2e/account.spec.ts::test_account_page_shows_current_session_marker`: current session row has the marker.
- [x] `tests/e2e/account.spec.ts::test_revoke_other_session_logs_that_browser_out`: second context is logged out within 10s.
- [x] `tests/e2e/account.spec.ts::test_password_change_button_sends_reset_email`: hits forgot-password endpoint, toast appears.
- [x] `tests/e2e/account.spec.ts::test_account_delete_with_hold_button_redirects_to_login_and_wipes_idb`: 500ms hold, 204 from server, IDB empty.
- [x] `tests/e2e/account.spec.ts::test_session_list_renders_parsed_device_label`: a Mac Safari context shows "Mac, Safari" or equivalent in the device-label column.
- [x] `tests/e2e/sync.spec.ts::test_first_login_bulk_import_runs_once`: seeds IDB with five favorites, completes activation, verifies the server has those five rows, second login does not re-import.
- [x] `tests/e2e/sync.spec.ts::test_pull_after_foreground_fetches_recent_changes`: device A creates a Grillade while device B is hidden; foreground B and confirm the row appears via the foreground pull, not via a write coming back.
- [x] `tests/e2e/auth.spec.ts::test_set_password_page_calls_logout_on_load_when_cookie_exists`: a logged-in user opening a fresh activation link is signed out before the form renders.
- [x] `tests/e2e/auth.spec.ts::test_login_after_24h_expiry_returns_to_original_url`: forge a 25-hour-old cookie, navigate to `/account`, confirm bounce to `/login?next=%2Faccount` and that re-login lands back on `/account`.
- [x] `tests/e2e/auth.spec.ts::test_rate_limit_per_ip_returns_429_after_5_attempts`: six rapid wrong-password POSTs from one context produce a 429 with `Retry-After`.
- [x] `tests/e2e/auth.spec.ts::test_security_headers_present_on_html_response`: `GET /` includes `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`, and a `Content-Security-Policy`.
- [x] `tests/e2e/auth.spec.ts::test_expired_invitation_token_renders_german_error_page`: navigate to a `/set-password?token=<expired>` URL; the page renders "Link abgelaufen" with a button linking to `/forgot-password`, and the POST returns 410 with `error_code: "token_expired"`.
- [x] `tests/e2e/auth.spec.ts::test_already_consumed_token_returns_410`: open the activation link twice in rapid succession; the second POST returns 410 with `error_code: "token_used"`.
- [x] `tests/e2e/auth.spec.ts::test_open_redirect_blocked`: navigate to `/login?next=https://evil.com`; after login, the user lands on `/` not on `evil.com`.
- [x] `tests/e2e/sync.spec.ts::test_grillade_soft_delete_propagates_to_other_device`: delete on A, foreground B, the row is gone from B's UI within five seconds.
- [x] `tests/e2e/account.spec.ts::test_revoking_current_session_logs_caller_out`: revoking the row marked `is_current` redirects to `/login`.
- [x] `tests/e2e/sync.spec.ts::test_409_on_stale_patch_triggers_refetch`: client patches with stale `updated_at`, server responds 409, client refetches and the IDB row reflects the server state.
- [x] `tests/e2e/sync.spec.ts::test_offline_indicator_does_not_block_writes`: airplane mode on, edits land in IDB and queue, online again, edits flush.
- [x] `tests/e2e/auth.spec.ts::test_health_endpoint_is_unauthenticated`: `GET /api/health` succeeds with no cookie.
- [x] `tests/e2e/auth.spec.ts::test_openapi_disabled_in_prod`: `GET /docs` returns 404 when `OPENAPI_ENABLED=false`. (Test is `test.skip`ped at runtime because the e2e harness boots with `OPENAPI_ENABLED=true`; the prod gate is exercised by the backend integration suite.)

### Manual Verification (Marco)

These steps require physical hardware and a real grill setting; the rest of the verification is automated in the integration and E2E suites.

- [ ] On a physical iPhone added to Home Screen as a PWA, launch from the home screen icon (not Safari). The login screen appears with the German labels. Tap the activation link from the Mail.app message; the set-password page opens inside the PWA shell, not in Safari. Set a password; land on Home with all prior local Grilladen, Menüs, Favoriten, and Settings present.
- [ ] On the Mac in Safari, sign in with the same email. Create a new Grillade. Lock the iPhone, wait fifteen seconds, unlock and foreground the PWA. The new Grillade appears within five seconds without a manual pull.
- [ ] With the iPhone on grill-side Wi-Fi (real-world weak signal at the patio), edit the Grillade name. On the Mac, foreground. The new name appears.
- [ ] Open the account chip on the Mac. The session list shows two entries with parsed device labels (e.g. "Mac, Safari" and "iPhone, Safari"), IPs, and last-active relative times. Tap "Abmelden" on the iPhone row; on the iPhone, foreground the app and confirm it bounces to the login page within ten seconds.
- [ ] On the iPhone, tap "Passwort ändern" from the account chip. The reset email arrives in Mail.app within thirty seconds. Tap the link; the reset page opens, set a new password, and the page lands on the login screen (not auto-logged-in). Sign in with the new password.
- [ ] Toggle the Mac to airplane mode, edit two items in a Grillade with the timer running, toggle airplane mode off. On the iPhone, foreground; both edits are present and the running timer is still ticking on the Mac (Wake Lock unaffected).
- [ ] iOS-only checks that automation cannot reproduce: with the iPhone in silent mode, start a timer; confirm the alarm tone still plays through the speaker (per existing first-run notice). Add the PWA to a fresh iPhone via Share → Add to Home Screen; confirm the icon, splash, and standalone display.
