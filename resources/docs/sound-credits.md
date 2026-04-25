# Sound Credits

Per Spec 2 §Phase 7. Every chime ships under CC0 or an equivalent royalty-free license. Each row records the file slug, source URL, license, and author. **Empty rows are TODOs blocking Phase 12 deploy.**

| File    | Source URL | License | Author | Notes                |
| ------- | ---------- | ------- | ------ | -------------------- |
| chime-1 | TODO       | CC0     | TODO   | Default put-on chime |
| chime-2 | TODO       | CC0     | TODO   | Default flip chime   |
| chime-3 | TODO       | CC0     | TODO   | Default done chime   |
| chime-4 | TODO       | CC0     | TODO   | —                    |
| chime-5 | TODO       | CC0     | TODO   | —                    |
| chime-6 | TODO       | CC0     | TODO   | —                    |
| chime-7 | TODO       | CC0     | TODO   | —                    |
| chime-8 | TODO       | CC0     | TODO   | —                    |

## Workflow

1. Browse Freesound.org (filter Creative Commons 0) or Mixkit's free-license set.
2. Download each candidate.
3. Normalise to `-3 dBFS` peak, downmix to mono, target 44.1 kHz, MP3 192 kbps. Trim to 2.5–3.0 s.
4. Save as `static/sounds/chime-N.mp3`.
5. Update the row above with the source URL, license, and author. Bumping a chime later? Update the row.
