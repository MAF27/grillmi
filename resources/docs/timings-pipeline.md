# Timings Pipeline

The grill-timings reference at `resources/docs/grill-timings-reference.md` is the single source of truth for timing data. At build time, `scripts/build-timings.ts` parses it into `src/lib/data/timings.generated.json`, validated against `src/lib/data/timings.schema.ts`. The build fails if parsing or validation fails — there are no silent fallbacks.

## Adding a new cut

1. Add a `### {Cut name}` section under the appropriate `## {Category}` heading. Category headings must match the `CATEGORY_MAP` patterns in `scripts/build-timings.ts`.
2. The section must contain a markdown table. Recognised columns:
   - **Thickness** — `2 cm`, `2.5 cm`, `1.5–2 cm`. Used for the cascading picker. Optional.
   - **Doneness** — `Medium-rare`, `Rare`, etc. Optional. If missing on every row in a section, the picker skips the Doneness step for that cut.
   - **Heat zone** — free-text, displayed verbatim on the timer card.
   - **Total** — required; cook time as a range (`6–8 min`), single (`5 min`), or hours (`3 h`, `2.5–3.5 h`). Used as `cookSecondsMin` / `cookSecondsMax`.
   - **Turns** — free-text. Parser infers `flipFraction` and `idealFlipPattern` (`once`, `every-60s`, `rotate`).
   - **Rest** — duration. `—` or empty becomes `0` rest seconds.
3. Optional `Notes:` block (one bullet per note) is preserved per cut and shown as tip text on the card.
4. Run `pnpm prebuild` (or `pnpm build`) and verify the console summary reports the new row count.

## Schema

See `src/lib/data/timings.schema.ts`. Each row carries: `thicknessCm` (nullable), `prepLabel` (nullable; used for cuts not keyed by thickness, e.g. roasts, ribs), `doneness` (nullable), `cookSecondsMin`, `cookSecondsMax`, `flipFraction`, `idealFlipPattern`, `restSeconds`, `heatZone`, `notes`.

## Why a build-time pipeline

- The reference markdown is human-friendly with citations and notes; the runtime needs typed JSON.
- Validating with Zod catches regressions in either the markdown or the schema.
- Bundling the JSON into the static SPA keeps the app fully offline after first load.
