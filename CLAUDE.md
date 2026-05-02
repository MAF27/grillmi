# Grillmi

## Overview

Grillmi is a multi-timer BBQ companion PWA. The core feature is running many simultaneous timers, one per item on the grill, with turn reminders and per-cut/thickness/doneness accuracy.

## Target form factor

**Progressive Web App.** Installable on iOS and Android via "Add to Home Screen", plus usable as a regular site on desktop. No store submission unless we hit PWA limitations for background alerts.

## Architecture

Grillmi is a SvelteKit static frontend backed by a FastAPI service.

1. Frontend (`src/`): SvelteKit 2 + Svelte 5 runes, Tailwind v4, IndexedDB cache, service worker. Built as a static bundle and served by Caddy.
2. Backend (`backend/`): FastAPI on Granian, Postgres via SQLAlchemy + Alembic, Doppler for secrets, aiosmtplib for transactional mail. Owns accounts, sessions, Grilladen, items, menus, favorites, settings.
3. Sync: frontend writes to IndexedDB first, then enqueues a push to the backend. Pull adapter pulls deltas on visibility change. Mappers in `src/lib/sync/mappers/` translate between frontend Zod shapes and backend JSON.

The cooking timing catalogue is bundled as static JSON shipped with the app. Source of truth for timing rows is `resources/docs/grill-timings-reference.md`, compiled into `src/lib/data/timings.generated.json` by `scripts/build-timings.ts`.

When checking persisted state, inspect both layers: IndexedDB for the device-local cache and the Postgres-backed backend models/routes for the authoritative copy.

## Routes

App routes under `src/routes/`. The sidebar has exactly three entries: Grillen, Chronik, Einstellungen. There is no Übersicht entry; `/` is a hero/recents landing reachable from the wordmark only.

1. `/` home page (hero, recent Grilladen). Not in the sidebar.
2. `/grillen` unified planning + live cockpit; flips between plan and live based on whether a Grillade is running. Sidebar entry "Grillen" with LIVE pill while a Session runs.
3. `/session` mobile live ring grid; redirects to `/grillen` on desktop.
4. `/chronik` finished Grilladen with metrics, notes, and "Erneut grillen". Sidebar entry "Chronik".
5. `/settings` user preferences. Sidebar entry "Einstellungen".
6. `/login`, `/forgot-password`, `/set-password` auth flows.
7. `/diag` diagnostics page.

## Hosting

1. Production: `grillmi.cloud` via Cloudflare Tunnel from the prod VM.
2. Dev: `grillmi.krafted.cc` via Nginx Proxy Manager from the `grillmi-dev` VM (`/opt/grillmi`).
3. Ops verbs go through `/usr/local/bin/grillmi` (start, stop, build, deploy, migrate, backup, admin-init, admin-reset). Never invoke systemctl/doppler/uv directly.

## Running tests

1. `pnpm test:unit` and `pnpm test:components` work without setup.
2. `pnpm check`, `pnpm lint` work without setup.
3. Backend: `cd backend && uv run pytest`.
4. e2e: the systemd service `grillmi-vite` permanently owns port 5173 and proxies to the dev backend on 8000, but Playwright needs a vite that proxies to the test backend on 8001. Spawn an isolated vite on a free port and run playwright against it:

   ```bash
   BACKEND_PORT=8001 pnpm exec vite dev --host 127.0.0.1 --port 5174 --strictPort > /tmp/vite-e2e.log 2>&1 &
   PLAYWRIGHT_REUSE_SERVER=1 E2E_FRONTEND_URL=http://127.0.0.1:5174 pnpm exec playwright test
   pkill -f "vite.*5174"
   ```

   Both `playwright.config.ts` and `tests/e2e/_lib/auth.ts` honour `E2E_FRONTEND_URL`. Stopping the systemd service requires interactive sudo, so prefer the isolated vite approach.

## Conventions

1. Specs in `resources/specs/` named `yymmdd-description.md`.
2. Ideas for new features in `resources/ideas/`.
3. Use `id="..."` attributes on interactive elements so e2e tests can select by id, not by text.
4. Never propose or open pull requests. Solo workflow: push branch, local merge, deploy via `grillmi deploy`.
