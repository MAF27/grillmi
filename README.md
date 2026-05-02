# Grillmi

A multi-timer BBQ companion that runs in your browser and installs to your phone.

## What it is

Grillmi keeps track of every item on your grill at once. Tell it what you want to grill, when you want to eat, and it works out when each item needs to go on, get flipped, and come off so everything hits the plate at the same moment. It runs in any modern browser and installs to iPhone or Android home screens like a native app.

## Who it is for

Anyone who has stood at a grill juggling steak, sausages, vegetables, and corn, second-guessing which one needs attention next. Grillmi is built for the home griller who wants restaurant-style timing without the spreadsheet.

## How it works

1. **Plan** the Grillade. Add each item from the catalogue (cut, thickness, doneness). Pick "now" to start immediately, or pin a target eating time and let Grillmi back-schedule the start.
2. **Grill**. The cockpit shows one timer card per item with a live ring. Audible chimes fire for "put it on", "flip it", and "ready", with a configurable lead time so you have a head start.
3. **Repeat**. Every finished Grillade lands in Chronik. Tap one and "Erneut grillen" loads the same line-up straight back into the planner so the next mixed grill is one tap away. Save your favourites, jot a note ("less salt next time"), and Grillmi gets faster every weekend.

A Grillade is the planned-and-run grilling event. The catalogue is grounded in BBQ-native sources (Migros Grilltimer, Weber Grill Academy, Meathead) and tuned for charcoal kettles like the Weber.

Sign in once and your live Grillade follows you between phone and laptop. Start on the desktop, glance at it on the iPhone, dismiss an alarm anywhere, and the other devices catch up within a couple of seconds.

## Screens

The sidebar has exactly three entries; the home page (`/`) is a hero-and-recents landing reached by the wordmark, not the sidebar.

| Sidebar entry | What you see |
| ------------- | ------------ |
| Grillen (`/grillen`) | The unified cockpit. Plan items and times before you start; same screen flips into the live multi-timer once you press "Los". A LIVE pill appears in the sidebar while a Grillade is running. |
| Chronik (`/chronik`) | Finished Grilladen, each with metrics, notes, and a one-tap "Erneut grillen" that loads the same line-up back into the planner. |
| Einstellungen (`/settings`) | Theme, alarm tones, lead times (Vorlauf), password reset, sign out. |

## Modes

1. **Jetzt** ("Now") - start grilling immediately; eating time is whatever the longest item needs.
2. **Auf Zeit** ("On Time") - pin the eating time; Grillmi back-schedules each item's start.
3. **Manuell** - start each item by hand; runs without a shared deadline.

## Sounds and alarms

Five named tones (Glut, Funke, Kohle, Klassik, Lautlos) assignable per event (put-on, flip, done) in Einstellungen. Alarms now persist to the backend the moment they fire, so a card you dismissed on one device disappears on the other, and a card that fired while you were on the phone still shows up on the desktop without retriggering the chime.

## Hosting

1. Production: <https://grillmi.cloud> via Cloudflare Tunnel.
2. Dev preview: <https://grillmi.krafted.cc> via Nginx Proxy Manager from the dev VM.

## Tech overview

1. **Frontend**: SvelteKit 2 + Svelte 5 runes, Tailwind v4, TypeScript with Zod-derived types, IndexedDB cache via `idb`, Workbox service worker for offline.
2. **Backend**: FastAPI on Granian, Postgres via SQLAlchemy + Alembic, Doppler for secrets, aiosmtplib for transactional mail.
3. **Audio**: Web Audio API, preloaded MP3 tones from Mixkit (credits in `static/sounds/README.md`).
4. **Fonts**: self-hosted Barlow Condensed + Inter under `static/fonts/` to keep the PWA offline-clean.

## Repo layout

```text
src/
  app.css                    Design tokens, theme flip, font-face declarations
  lib/
    components/              Svelte UI (atoms + composites)
    data/                    Compiled timing JSON (built by scripts/build-timings.ts)
    grillade/                Grillade lifecycle (port-injected)
    models/, schemas/        Zod schemas + inferred TS types
    runtime/                 Ticker, alarm pipeline, wake-lock helper
    scheduler/               Pure back-scheduling math
    sounds/                  Audio playback (Web Audio API)
    stores/                  $state-based stores (grilladeStore, settingsStore, db, ...)
    sync/                    Pull/push adapters and mappers between frontend and backend
    util/                    Format helpers
  routes/                    SvelteKit pages (one folder per route)
  service-worker.ts          Workbox config

backend/
  grillmi/                   FastAPI app: routes, repos, models, services
  migrations/                Alembic migrations
  tests/                     pytest suite (unit + integration)

static/
  fonts/, sounds/, icons/, manifest.webmanifest

resources/
  docs/                      Product docs, timing references
  ideas/                     Backlog
  specs/                     yymmdd-*.md feature specs (the working dev unit)

tests/
  unit/                      Stores, scheduler, ticker, mappers (vitest)
  components/                Svelte components in jsdom (testing-library)
  e2e/                       Playwright specs
```

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:5173 (frontend, talks to backend on :8000)
pnpm build        # static bundle in build/
pnpm preview      # serve the build at :4173
```

The backend lives in `backend/`:

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run granian --interface asgi grillmi.app:app --host 127.0.0.1 --port 8000
```

On the dev VM the convenience wrapper `grillmi help` lists every ops verb (start, stop, build, deploy, migrate, backup, admin-init).

## Test and lint

```bash
pnpm test:unit          # vitest, no DOM
pnpm test:components    # vitest + jsdom + @testing-library/svelte
pnpm test:e2e           # Playwright (see note below)
pnpm lint               # prettier --check then eslint
pnpm check              # svelte-check (type errors)

cd backend && uv run pytest
```

### Running e2e on the dev VM

The dev VM runs `grillmi-vite.service` which permanently owns port 5173 and proxies to the dev backend on 8000. Playwright needs a vite that proxies to the hermetic test backend on 8001. Spawn an isolated vite on another port and run playwright against it:

```bash
BACKEND_PORT=8001 pnpm exec vite dev --host 127.0.0.1 --port 5174 --strictPort > /tmp/vite-e2e.log 2>&1 &
PLAYWRIGHT_REUSE_SERVER=1 E2E_FRONTEND_URL=http://127.0.0.1:5174 pnpm exec playwright test
pkill -f "vite.*5174"
```

`playwright.config.ts` and `tests/e2e/_lib/auth.ts` both read `E2E_FRONTEND_URL`, so the suite reaches the isolated server while the systemd service stays up.

## Conventions

1. Specs in `resources/specs/` named `yymmdd-description.md`. Use the `/spec-create` and `/spec-implement` skills.
2. Ideas for things outside the current spec scope go in `resources/ideas/`.
3. Use `id="..."` on interactive elements so e2e tests select by id, not by visible text.
4. Solo-developer workflow: push the branch, local-merge to main, deploy via `grillmi deploy`. No pull requests.
