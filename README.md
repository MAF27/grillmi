# Grillmi

A multi-timer BBQ companion PWA — inspired by Migros' "Grillitarier" / "Grilltimer by Migusto", built to do it better.

## What it is

A Progressive Web App that helps you grill multiple items at once without overcooking any of them. Pick what you're grilling (cut, thickness, doneness), start the timer, and the app tells you exactly when to turn and when it's done.

## Status

Early scaffolding. No frontend or backend code yet. Timing reference data is being researched in `resources/docs/grill-timings-reference.md`.

## Stack

Not yet decided. Leaning toward Vite + React + TypeScript + Tailwind, with timing data bundled as static JSON so the PWA works fully offline.

## Structure

- `resources/specs/` — feature specs, `yymmdd-description.md` format
- `resources/docs/` — product docs, timing references, research
- `resources/scripts/` — project-specific scripts
- `resources/ideas/` — backlog of improvement ideas
- `tests/` — unit, integration, e2e
