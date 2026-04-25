# Sounds

Per Spec 2 §Phase 7, this directory must contain `chime-1.mp3` through `chime-8.mp3` before the production build can validate. Sources must be CC0 (Freesound.org or Mixkit's free-license kitchen-alarm set), each file 44.1 kHz mono, 40–60 KB, 2.5–3.0 s, normalised to -3 dBFS peak. License + author + URL must be recorded in `resources/docs/sound-credits.md`.

Until the chimes are placed, the runtime gracefully no-ops: `play()` in `src/lib/sounds/player.ts` catches the 404 and the AlarmBanner + TimerCard pulse remain the visual signal.

This is the only deploy-blocking dependency for Phase 12.
