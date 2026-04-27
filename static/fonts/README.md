# Self-hosted fonts

Bundled with the PWA so the app can render its editorial typography fully offline after first load.

## Files

| File                         | Family           | Weights | License | Source                                     |
| ---------------------------- | ---------------- | ------- | ------- | ------------------------------------------ |
| `barlow-condensed-400.woff2` | Barlow Condensed | 400     | OFL 1.1 | Google Fonts (latin subset)                |
| `barlow-condensed-500.woff2` | Barlow Condensed | 500     | OFL 1.1 | Google Fonts (latin subset)                |
| `barlow-condensed-600.woff2` | Barlow Condensed | 600     | OFL 1.1 | Google Fonts (latin subset)                |
| `barlow-condensed-700.woff2` | Barlow Condensed | 700     | OFL 1.1 | Google Fonts (latin subset)                |
| `inter.woff2`                | Inter (variable) | 100–900 | OFL 1.1 | Google Fonts (latin subset, variable axis) |

The `latin` subset covers the German Umlauts (ä, ö, ü, ß) used throughout the app. If we add Vietnamese or Cyrillic content we'll need to widen the subset.

## License

Both families are SIL Open Font License v1.1 — see the upstream LICENSE.txt at <https://fonts.google.com/specimen/Barlow+Condensed/license> and <https://fonts.google.com/specimen/Inter/license>. Bundling is permitted; no attribution required at runtime.

## Replacing or upgrading

Re-fetch from Google Fonts using a modern Chrome user-agent so the CSS endpoint serves WOFF2 (not TTF). Pull the `latin` unicode-range URLs only.

```bash
curl -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0" \
  "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&display=swap"
```
