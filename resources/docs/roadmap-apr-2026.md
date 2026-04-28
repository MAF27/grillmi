# Grillmi Roadmap, April 2026

Sequence of work for the next phase. Sits on top of `accounts-decision-apr-2026.md` (the architectural call to add accounts + a backend) and `stack-research-backend-apr-2026.md` (the chosen Python stack).

## Context already decided

1. Accounts with login, server-side sessions, FastAPI + Postgres backend, IndexedDB stays the live store on each device, server is the sync hub. See `accounts-decision-apr-2026.md`.
2. Backend stack pinned: FastAPI, Granian (uvicorn fallback), asyncpg, SQLAlchemy 2.0 async, Alembic, pydantic-settings, structlog, pywebpush, testcontainers, Postgres 17 from PGDG. See `stack-research-backend-apr-2026.md`.
3. Auth follows the house standard at `~/dev/reference/auth.md`: Argon2id, HIBP, timing-safe login, rate limits, CSRF, audit log, invite-only, mandatory admin password-reset CLI, Hostpoint SMTP, sending domain `kraftops.ch`.
4. Infra is provisioned: dev VM `grillmi-dev` (atticus, VMID 480), prod LXC `grillmi` (atlas, CTID 114), Cloudflare Tunnel terminating at `grillmi.cloud`, NPM proxy serving `grillmi.krafted.cc` for dev. The `app_grillmi` Ansible role exists.
5. API exposure: path-based at `grillmi.cloud/api`, Caddy reverse-proxy to FastAPI on `127.0.0.1`. No new DNS, no new tunnel route, no CORS.

## Sequence

### 1. Backend stack research doc

Status: done. File: `resources/docs/stack-research-backend-apr-2026.md`.

### 2. Backend bootstrap + auth + Grillade sync

One bundled spec via `/spec-create`. Tightly coupled work that shares one Postgres deploy, one Ansible-role pass, one branch, one round of testing.

Scope:

- New `backend/` FastAPI service, served by Caddy reverse-proxy at `/api` on the existing prod LXC and dev VM.
- Postgres 17 install via the existing `app_grillmi` role: listen on `127.0.0.1`, scram-sha-256, role + DB created via Ansible, backup hand-off to the existing PBS pattern.
- Schema: `users`, `sessions`, `password_reset_tokens`, `audit_log`, `grilladen`, `grillade_items`. Item-level `updated_at` enables last-write-wins per timer.
- Auth surface per the house standard: Argon2id with the prescribed parameters, HIBP on every password set, timing-safe login with dummy hash, per-IP and per-account rate limits, per-session CSRF, security headers, fire-and-forget audit log, invite-only flow with SHA-256-hashed tokens, auto-login after activation but not after reset, clear-session-on-token-pages.
- Admin password-reset CLI script with the documented `read -s` + temp-script + pipe pattern.
- Hostpoint SMTP via `aiosmtplib`, sending domain `kraftops.ch`, from address `Grillmi <noreply@kraftops.ch>`. New entry in `~/dev/reference/email-services-inventory.md`.
- Frontend routes: `/login`, `/set-password`, `/forgot-password`, `/account`. Signed-in chrome (account menu, sign out).
- Sync API: REST endpoints for Grilladen and items, scoped by `user_id`. IndexedDB write queue with replay on reconnect. LWW conflict resolution per item. One-time migration of the developer's existing localStorage data on first login.
- Infra side file: prod LXC resize from 1 CPU / 2 GB / 16 GB to 2 CPU / 4 GB / 32 GB (Argon2 verify needs 64 MiB per request and Postgres wants `shared_buffers` headroom), Postgres install role-tasks, Caddy `/api` reverse-proxy block, FastAPI systemd unit (Doppler-wrapped Granian), new Doppler secrets (`DATABASE_URL`, VAPID keys placeholder for the eventual push spec, `HOSTPOINT_SMTP_*` cross-project ref to `smtp/prd`).
- Runbook: post-deploy verification (signup of the developer's invite, password set, login, Grillade create + sync from the Mac, open on the iPhone, audit log inspection).

### 3. Desktop redesign + iPad reuse

Triggered by the Claude Design handoff zip(s) arriving. Folds in the work that was scoped in `260427-ipad-responsive-layout.md` per the call to pause-and-fold. Brief should be amended before the design pass to include the auth surfaces shipped in step 2 (login, set-password, forgot-password, account, sync status indicator) so the new visual language covers them in one cohesive pass.

## Out of scope for v1

1. **Scheduled web push for timer alerts.** Originally proposed because iOS will not run timers in the service worker and the only reliable lock-screen alert is a server-sent push. In real use the phone sits on the grill table with the app open, Wake Lock holding the screen awake, audio + vibration + visual alarm banner firing. The Migros Grilltimer reference app ships without push. Revisit only if real-world use shows missed alerts; would land as a follow-up spec with VAPID keys, push subscription endpoints, the `pending_notifications` table, and the in-process asyncio scheduler the stack research already covers.
2. **Sign in with Apple.** Open question in `accounts-decision-apr-2026.md`. Email + password via the invite flow ships first; SIWA is additive.
3. **Multi-device live co-presence (WebSockets / SSE).** REST + polling on Grillade open and resume is enough for solo cross-device use.

## Open follow-ups

1. The CLAUDE.md "Deployments live in `~/dev/ansible`" claim assumes the controller-side Ansible checkout. That directory is on the Mac, not on this dev VM, which is fine. No action.
2. After step 2 ships, revisit whether `noreply@grillmi.cloud` should replace `noreply@kraftops.ch` for sender brand. Cost is a new mailbox and DNS records on `grillmi.cloud`. Not blocking.
