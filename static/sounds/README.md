# Sounds

Per Spec 2 §Phase 7, this directory ships `chime-1.mp3` through `chime-8.mp3` — eight CC0 chimes by Joseph SARDIN sourced from BigSoundBank. Source URLs and license details are recorded in `resources/docs/sound-credits.md`.

If a chime ever 404s the runtime gracefully no-ops: `play()` in `src/lib/sounds/player.ts` catches the failure and the AlarmBanner + TimerCard pulse remain the visual signal.

To swap a chime, follow the workflow in `resources/docs/sound-credits.md`.
