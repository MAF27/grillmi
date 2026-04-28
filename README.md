# Grillmi

Multi-timer BBQ companion PWA. Run a timer per item on the grill, get the right turn-and-rest cues, eat everything at the same moment.

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm build        # static bundle in build/
pnpm preview      # serve the build at :4173
```

## What it does

You tell Grillmi what's on the grill (cut, thickness, doneness) and when you want to eat. It back-schedules each item so they all hit the plate at the same moment, fires turn-and-done alarms with audible tones, and survives a phone screen lock without losing the session.

Three planning modes on the Plan screen, one segmented control:

- **Jetzt** — start now, eating time is whatever the longest item takes.
- **Auf Zeit** — pin an eating time; Grillmi back-schedules each start.
- **Manuell** — start each item by hand; runs entirely on Plan, no shared deadline.

## App surface

| Screen | Purpose |
| --- | --- |
| Home (`/`) | Hero, recent saved Menüs, install chip, Neue Session / Menüs / Einstellungen entry points. |
| Plan (`/plan`) | Add Grillstücke, set eating time, save the line-up as a Menü. Manual-mode timer grid lives here too. |
| Session (`/session`) | Live two-column ring grid, master countdown, sticky alarm banner. Auto-bounces to `/plan` if the user is in Manuell. |
| Menüs (`/menus`) | Saved presets. Swipe-left to delete, tap-and-hold to inline-rename. |
| Einstellungen (`/settings`) | Theme (System/Hell/Dunkel), per-event tones (Glut, Funke, Kohle, Klassik, Lautlos), vibration toggle. |

## Stack

- **SvelteKit 2 + Svelte 5 runes** — every store uses `$state` / `$derived`.
- **TypeScript + Zod** — schemas in `src/lib/schemas/`, runtime types fall out of them.
- **Tailwind v4 + CSS variables** — design tokens in `src/app.css`; the dark "Glühen" palette flips to light via `:where([data-theme='light'])`.
- **IndexedDB via `idb`** — sessions, saved Menüs, favourites, settings.
- **Web Audio API** — preloaded alarm tones in `src/lib/sounds/player.ts`.
- **Workbox SW** — precaches the build, the bundled timing JSON, fonts, sounds; stale-while-revalidate for the manifest.
- **Self-hosted fonts** — Barlow Condensed (display + numerals) and Inter (body), shipped under `/static/fonts/` so the PWA stays offline-clean after first load.

## Repo layout

```text
src/
  app.css                    Glühen tokens, theme flip, font-face declarations
  lib/
    components/              Svelte UI (atoms + composites)
    data/                    Compiled timing JSON (built by scripts/build-timings.ts)
    models/, schemas/        Zod schemas + inferred TS types
    runtime/                 Ticker, alarm pipeline, wake-lock helper
    scheduler/               Pure back-scheduling math
    sounds/                  Audio playback (Web Audio API)
    stores/                  $state-based stores: session, menus, favorites, settings, db
    util/                    Format helpers
  routes/                    SvelteKit pages (+layout, +page per screen)
  service-worker.ts          Workbox config

static/
  fonts/                     Self-hosted WOFF2s + OFL
  sounds/                    Glut, Funke, Kohle, Klassik MP3s + Mixkit credits
  icons/, manifest.webmanifest

resources/
  docs/                      Product docs, timing references
  ideas/                     Backlog
  specs/                     yymmdd-*.md feature specs (the current dev unit)

tests/
  unit/                      Stores + scheduler + ticker (vitest)
  components/                Svelte components in jsdom (testing-library)
  e2e/                       Playwright specs
```

## Data

- Timing source of truth: `resources/docs/grill-timings-reference.md`. Compiled to `src/lib/data/timings.generated.json` by `scripts/build-timings.ts` (runs in `pnpm prebuild`).
- Persistent state lives in IndexedDB (`grillmi` database). The store names are stable across the v1 → Glühen rename: saved Menüs still live in the legacy `plans` object store.
- Sounds: five named tones (Glut, Funke, Kohle, Klassik, Lautlos). Audio sourced from Mixkit under their Free License — see `static/sounds/README.md`.

## Test + lint

```bash
pnpm test:unit          # vitest, no DOM
pnpm test:components    # vitest + jsdom + @testing-library/svelte
pnpm test:e2e           # Playwright (boots vite dev + hermetic FastAPI on :8001 via tests/e2e/_setup/server.py)
pnpm lint               # prettier --check then eslint
pnpm check              # svelte-check (type errors)
```

Visual fidelity to the Glühen direction is validated manually side-by-side against the extracted prototype at `.tmp/grillmi-design/design_handoff_grillmi_redesign/design/Grillmi Redesign.html`. Playwright snapshot-diffing prototype PNGs is not used — different rendering engines produce too many false positives to make it a useful gate.

## Deploy

Production is on `atlas` via Ansible at `~/dev/ansible/playbooks/applications/grillmi-deploy.yml`. Public URL through Cloudflare Tunnel. The deploy playbook hard-resets `/opt/grillmi` to `origin/main` — push feature work before invoking it.

## Conventions

- Specs in `resources/specs/` named `yymmdd-description.md`. Use `/spec-create` and `/spec-implement`.
- Ideas for things outside the current spec scope go in `resources/ideas/`.
- No backend in v1. If we add one it lives under `backend/` and the static-data plan moves to `backend/seed/`.
