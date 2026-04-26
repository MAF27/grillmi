# Sounds

Five named tones drive the alarm signals (`Auflegen`, `Wenden`, `Fertig`). Four ship as `.mp3`; `Lautlos` plays no audio (vibration only).

| Tone ID   | German name | Sub-line               | File          | Source                                    |
| --------- | ----------- | ---------------------- | ------------- | ----------------------------------------- |
| `glut`    | Glut        | Tiefer Bell-Ton, sanft | `glut.mp3`    | Mixkit #930 — "Cinematic church bell hit" |
| `funke`   | Funke       | Kurzer hoher Tropfen   | `funke.mp3`   | Mixkit #3109 — "Crystal chime"            |
| `kohle`   | Kohle       | Dumpfes Klopfen        | `kohle.mp3`   | Mixkit #578 — "Short bass hit"            |
| `klassik` | Klassik     | iOS-Standard Glocke    | `klassik.mp3` | Mixkit #938 — "Service bell"              |
| `lautlos` | Lautlos     | Nur Vibration          | (none)        | —                                         |

## Audio production

Each source was trimmed and normalised before commit:

- `glut.mp3`: 2.5 s with a 0.5 s fade-out (long natural decay reads as intentional, not cut off).
- `funke.mp3`, `kohle.mp3`, `klassik.mp3`: 1.5 s with a 0.2 s fade-out (percussive tones).
- All files normalised to `-14 LUFS`, encoded as MP3 96 kbps mono.

## License

Mixkit Free License — <https://mixkit.co/license/>. Commercial use is permitted with no attribution required. Bundling inside an app is allowed; pure redistribution-as-is is forbidden. Source pages: <https://mixkit.co/free-sound-effects/>.

## Runtime fallback

`src/lib/sounds/player.ts` catches load/play failures, so a missing or corrupt file degrades to silence — the AlarmBanner pulse and the TimerCard ring border remain the visual signal.

## Replacing a tone

1. Pick a new SFX from <https://mixkit.co/free-sound-effects/> with a license that permits commercial bundling.
2. Trim, fade, normalize, and encode to the values above.
3. Drop the file at `static/sounds/{tone}.mp3`, overwriting the previous one.
4. Update the row above with the new Mixkit ID and source-page URL.
