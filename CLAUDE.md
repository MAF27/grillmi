# Grillmi

## Overview

Grillmi is a multi-timer BBQ companion PWA. It replaces and improves on Migros' "Grillitarier" / "Grilltimer by Migusto" app. The core feature is running many simultaneous timers — one per item on the grill — with turn reminders and per-cut/thickness/doneness accuracy.

## Target form factor

**Progressive Web App.** Installable on iOS and Android via "Add to Home Screen", plus usable as a regular site on desktop. No store submission unless we hit PWA limitations for background alerts.

## Data strategy

Timing data is bundled as static JSON shipped with the app — so the whole app works offline after the first load, including timer state persisted in localStorage/IndexedDB. Source of truth for the data is `resources/docs/grill-timings-reference.md`, which gets compiled down into the shipped JSON.

## Reference

The Migros original is a React SPA backed by Firebase. We reverse-engineered its taxonomy (tier → sub-tier → base → thickness → doneness → turn steps → tips) as a starting point — see `resources/docs/grill-timings-reference.md` and the catalog notes.

## Conventions

- Specs in `resources/specs/` as `yymmdd-description.md`.
- Ideas for features beyond what Migros has → `resources/ideas/`.
- No backend unless we need one. If we add one, it goes in `backend/` and the current static-data plan moves to `backend/seed/`.
