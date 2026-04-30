# Grillmi

## Overview

Grillmi is a multi-timer BBQ companion PWA. The core feature is running many simultaneous timers — one per item on the grill — with turn reminders and per-cut/thickness/doneness accuracy.

## Target form factor

**Progressive Web App.** Installable on iOS and Android via "Add to Home Screen", plus usable as a regular site on desktop. No store submission unless we hit PWA limitations for background alerts.

## Data strategy

Grillmi has a FastAPI backend under `backend/` backed by Postgres. User data such as accounts, sessions, grillades, grillade items, menus, favorites, and settings is persisted there and synced with the frontend.

The cooking timing catalogue is still bundled as static JSON shipped with the app. Source of truth for timing rows is `resources/docs/grill-timings-reference.md`, compiled into `src/lib/data/timings.generated.json`.

Frontend runtime state is also cached locally in IndexedDB for offline use and sync. Do not assume repo-local JSON or IndexedDB is the only database when checking persisted app data; inspect the Postgres-backed backend models/routes as well.

## Conventions

- Specs in `resources/specs/` as `yymmdd-description.md`.
- Ideas for new features → `resources/ideas/`.
- No backend unless we need one. If we add one, it goes in `backend/` and the current static-data plan moves to `backend/seed/`.
