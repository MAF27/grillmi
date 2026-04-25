# Icons

Per Spec 2 §Phase 10. The PWA manifest references `/icons/icon-192.png`, `/icons/icon-512.png`, and `/icons/icon-512-maskable.png`. The maskable variant must include the W3C maskable-icon safe-zone margin (~10% on every side).

Source: a single SVG (flame + chronometer motif), authored via the `frontend-design` skill, then exported to PNG at the three required sizes. Until that exists, the manifest will fail validation in production — install prompts will not appear and the Lighthouse `installable-manifest` audit will fail.

This is a deploy-blocking dependency for Phase 12, paired with `static/sounds/`.
