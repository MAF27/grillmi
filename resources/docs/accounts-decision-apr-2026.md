## Decision

Grillmi will have **real user accounts with login**, backed by a small server. **Grilladen** sync across devices so a Grillade planned on the Mac can be opened and run on the iPhone (and vice versa).

This is a deliberate step beyond the Migros Grilltimer / Grillitarier reference, which is a PWA with no accounts and no sync. That model fits a single-device griller. It does not fit the actual workflow: prep on a laptop while looking at recipes, walk to the grill with a phone, pick up exactly where the laptop left off.

## Terminology

The unit of cookout is a **Grillade** (plural: **Grilladen**). One word covers all phases: planned, running, finished. No separate "session" or "plan" noun.

1. "Grillade speichern" before the cook.
2. "Grillade starten" / "Grillade läuft" during the cook.
3. "Grilladen" in the history view.

Avoid: *Session*, *Sitzung*, *Grillsession*, *Grillplan*, *Programm*. These read as office vocabulary in German.

Note: "session" is still used as a technical term for **server-side HTTP sessions** in the auth section below. That is unrelated to the domain Grillade and stays.

## Why login (not lighter alternatives)

The lighter options were considered and rejected:

1. **One-shot handoff (QR / share-URL)**: pushes the planned Grillade from Mac to iPhone, then the phone owns it. Rejected because edits at the grill (added an extra steak, doneness changed) do not flow back, and the user would lose the history view on the Mac.
2. **Device-pairing code with a thin relay, no accounts**: works for pairing two devices once, but breaks the moment a device is lost, reinstalled, or a third device is added. Recovery requires email or a password anyway, at which point it is just login with extra steps.
3. **Full login**: pays the up-front cost once, then every device-add, recovery, history view, and future feature (presets, favourites, shopping list) is free. Chosen.

## Architectural implications

This decision changes the project shape:

1. **Adds a backend.** Per `CLAUDE.md`, that lives in `backend/`, and the bundled static timing JSON moves to `backend/seed/`. Frontend continues to ship the seed at build time so first-load offline still works before login.
2. **Auth follows the house standard.** See `~/dev/reference/auth.md`. Server-side sessions (not JWTs), Argon2id hashing, HIBP breach check on signup, timing-safe login, rate limiting, audit logging. No bespoke auth.
3. **Offline-first does not go away.** At the grill, signal is unreliable. IndexedDB stays the primary live store on each device. The server is the sync hub, not the source of truth during a Grillade. Writes queue locally and replay when the connection returns.
4. **Conflict policy: last-write-wins per timer, scoped to the active Grillade.** Solo user, one Grillade in flight at a time, the chance of genuine conflicts is near zero. CRDTs are overkill.
5. **Public URL stops being incidental.** `grillmi.krafted.cc` is now a real multi-tenant service. Needs the usual hardening: CSP, HSTS already terminating at the tunnel, audit log, rate limits on auth endpoints.

## Open questions (resolve when speccing)

These are not decided here. Each gets its own spec when the build starts:

1. **Login method**: email + password (per the standard), magic link, Sign in with Apple, or a combination. Sign in with Apple is attractive on iOS but cannot be the only option.
2. **Backend stack**: matches the wider house pattern (FastAPI + Postgres is the default).
3. **Sync transport**: REST + polling on Grillade resume is enough for solo use. WebSockets / SSE only if we ever add live multi-device co-presence.
4. **Hosting**: same Cloudflare Tunnel + lab VM pattern as other apps, or a managed platform. Decide alongside backend stack.
5. **Migration**: today's localStorage-only users (just the developer) need a one-time import on first login. Trivial.

## What this is not

1. Not an invitation to add social features. Login exists for cross-device sync of one user's own data, nothing else.
2. Not a reason to drop offline-first. The PWA must still launch and run a saved Grillade with no network.
3. Not a justification for analytics-by-account. Audit logging is for security; product analytics stay aggregate.

## References

1. [Grillitarier case study, Apps with love](https://appswithlove.com/en/references/grillitarier): confirms the Migros app is a PWA wrapped for stores, no auth.
2. [Grilltimer by Migusto on Google Play](https://play.google.com/store/apps/details?id=ch.migros.grillitarier&hl=en_US): same app, Android side.
3. [Grillitarier Timer page (live UI)](https://grillitarier.migros.ch/de/timer/): confirms Migros has no parent grouping above the individual Timer.
4. `~/dev/reference/auth.md`: the auth standard this project will follow.
