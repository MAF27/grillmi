# Grillmi

A multi-timer BBQ companion PWA — inspired by Migros' "Grillitarier" / "Grilltimer by Migusto", built to do it better.

## What it is

A Progressive Web App that helps you grill multiple items at once without overcooking any of them. Pick what you're grilling (cut, thickness, doneness), start the timer, and the app tells you exactly when to turn and when it's done. Install on iOS/Android via "Add to Home Screen" or use on desktop — fully offline-capable after first load.

## Status

v1 complete. Includes scheduler, real-time ticker, IndexedDB persistence, turn chimes with audible alerts, and all UI components. PWA-ready with install icons and service worker.

## Stack

SvelteKit (Vite, TypeScript, Tailwind CSS). Timing data bundled as static JSON so the app works fully offline. Session state persisted to IndexedDB for resumability. Background sounds for timer alerts.

## Structure

- `resources/specs/` — feature specs, `yymmdd-description.md` format
- `resources/docs/` — product docs, timing references, research
- `resources/scripts/` — project-specific scripts
- `resources/ideas/` — backlog of improvement ideas
- `src/` — SvelteKit app (components, stores, schedulers, sounds, runtime)
- `tests/` — unit, integration, e2e
