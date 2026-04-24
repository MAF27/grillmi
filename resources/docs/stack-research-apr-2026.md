# Stack Research — April 2026

## Bottom line

Build Grillmi on **Vite 8 + React 19 (Compiler on) + TypeScript + Tailwind + `@serwist/vite`** as a fully client-rendered, offline-first PWA, with **LinguiJS** for i18n and **IndexedDB** (via `idb`) for timer state. Every other candidate either adds SSR machinery you will never use, ships a runtime you do not need, or lags on iOS-specific PWA tooling maturity. The deciding factors are: smallest realistic bundle for a pure-CSR app, best React-Compiler-era DX, and the most mature 2026 Vite PWA toolchain — Serwist — which has largely replaced Workbox for new Vite/Svelte/Next projects.

## Framework comparison

### At-a-glance matrix

| Stack | Baseline JS (gz) | PWA tooling maturity (2026) | iOS PWA fit | Timer/interval fit | DX for a solo dev |
| --- | --- | --- | --- | --- | --- |
| Vite 8 + React 19 + `@serwist/vite` | 45–55 kB | Excellent (Serwist + VitePWA) | Excellent (pure CSR, no SSR) | Excellent | Excellent |
| SvelteKit 2 + Serwist | 15–25 kB | Excellent (`@serwist/svelte`) | Excellent if built `adapter-static` | Excellent | Great, smaller pool |
| Next.js 15 + `@serwist/next` | 85–110 kB | Excellent | Good, but SSR machinery wasted | Excellent | Overkill |
| Qwik City 2 | 1–5 kB initial | Fair (`@qwikdev/pwa` young) | Risky: 200+ chunks to precache | Awkward (resumability) | Niche |
| Astro 5 + React/Svelte islands | 0–10 kB (static) | Good (`@vite-pwa/astro`) | Fine for static, wrong for app | Poor (island boundaries) | Content-first |
| SolidStart 1.x | 10–18 kB | Fair (`virtual:pwa-register/solid`) | Good in CSR mode | Excellent | Smallest community |
| Vanilla TS + Web Components + Workbox 7 | 0–10 kB | Good (Workbox revived) | Excellent | Excellent | High effort, reinvents wheels |

### 1. Vite 8 + React 19 + TypeScript + Tailwind + `@serwist/vite` (or `vite-plugin-pwa`)

- **Bundle baseline**: With Vite 8's Rolldown-based build and React 19 + React Compiler, a minimal app clocks in around 45–55 kB gzipped for React + ReactDOM + the Compiler runtime. `@vitejs/plugin-react` 6.x dropped Babel as a dependency — Oxc now handles JSX/Fast Refresh, shaving install size and build times. React Compiler is opt-in via `babel-plugin-react-compiler`; turn it on and delete most `useMemo`/`useCallback`.
- **PWA tooling**: Two mature options. `vite-plugin-pwa` remains the drop-in zero-config choice (Workbox under the hood, auto-injects manifest). `@serwist/vite` is the more modern alternative — ESM-only, TypeScript-first, stable per-asset revisions, better tree-shaking. For a new project in April 2026, Serwist is the choice. Both require `injectManifest` mode for custom SW logic like push handlers.
- **Timer/interval fit**: No framework friction. Store timer start epoch + duration in Zustand or a tiny reducer; never "tick" state, compute elapsed from `Date.now()` on each `requestAnimationFrame`. Backgrounding just pauses the rAF loop — on return, reconciliation is one subtraction per timer.
- **iOS quirks**: Pure CSR with no SSR means no hydration mismatches, no routing gymnastics, no wasted server round-trips. This is what you want for a PWA that will be installed to the home screen and run fully offline.
- **DX**: The sweet spot for a solo dev who already knows React. Tailwind 4 uses Oxide/Lightning under the hood — faster builds, no PostCSS config. Hot reload in under 200 ms.
- **2026 gotcha**: React 19's `use()` hook will tempt you to fetch inside components — don't. For a fully-offline app, preload static JSON at boot and keep it in a context or store.

### 2. SvelteKit 2 + Serwist (`@serwist/svelte`)

- **Bundle baseline**: 15–25 kB gzipped for Svelte runtime + router, roughly 60% smaller than React. Svelte 5's Runes (stable since late 2024) mean reactive state without stores.
- **PWA tooling**: `@serwist/svelte` is a thin wrapper over SvelteKit's native `src/service-worker.ts`. Serwist documents a caveat: it uses a single shared revision for all precached assets, so every rebuild re-precaches everything. Workaround: use `@serwist/vite` directly and generate per-asset revisions.
- **iOS quirks**: Use `adapter-static` to produce a pure static site. SvelteKit's SSR/adapter-node paths are irrelevant for this use case.
- **DX**: Excellent but the pool of idioms/examples is smaller than React's. Acceptable risk for a solo dev comfortable with either.
- **Why not #1**: The bundle savings are real but small in absolute terms for a ~50 kB baseline app; the React-Compiler-era DX is now comparable; and the React ecosystem has more mature form libraries, haptics wrappers, etc. If the developer preferred Svelte, this is a perfectly defensible choice.

### 3. Next.js 15+ + `@serwist/next`

- **Bundle baseline**: 85–110 kB gzipped. Next always ships a router, RSC runtime, prefetching infrastructure.
- **PWA tooling**: `@serwist/next` is the spiritual successor to `@ducanh2912/next-pwa` and is officially recommended by Next docs.
- **Why not**: You do not need SSR, you do not need API routes, you do not need Server Components. Paying for ~60 kB of framework runtime you never use, plus the complexity of configuring Next for a purely static export, is a loss on every axis.

### 4. Qwik City 2

- **Bundle baseline**: 1–5 kB initial JS is the marketing number. Real apps still download everything eventually.
- **PWA tooling**: `@qwikdev/pwa` exists but is young. GitHub issue #5148 documents a real pain: Qwik's resumability model generates ~300 tiny JS chunks, and making all of them offline-available requires manual precache config. For an app where every byte must be in the cache after first load, this works against Qwik's architecture.
- **Why not**: Resumability optimizes for first-paint interactivity of content sites. A timer app is pure client state — the model's benefits don't apply, but its complexity does.

### 5. Astro 5 with React or Svelte islands

- **Bundle baseline**: 0 kB for static pages, plus whatever the islands ship.
- **PWA tooling**: `@vite-pwa/astro` works, requires Vite 5 and Astro 4+.
- **Why not**: Astro is content-first. A multi-timer app with 20 concurrent reactive states is not a content site — it's a single, highly-interactive island. At that point you are paying Astro's conceptual overhead for zero benefit, and island boundaries actively fight against global state.
- **2026 note**: Cloudflare acquired Astro in January 2026; Astro 6 beta runs the dev server on workerd. Not relevant here but worth knowing.

### 6. SolidStart 1.x

- **Bundle baseline**: 10–18 kB gzipped. Fine-grained reactivity, no virtual DOM.
- **PWA tooling**: `virtual:pwa-register/solid` via `vite-plugin-pwa` exposes a `createSignal` for `offlineReady` / `needRefresh`. Functional but less polished than Serwist's Svelte/Vite integrations.
- **Timer fit**: Excellent — Solid's signals are purpose-built for exactly this kind of high-frequency reactive state.
- **Why not**: Smallest ecosystem of the candidates. For a solo dev who wants to move fast, community-size and Stack-Overflow-depth matter more than the ~30 kB savings over React.

### 7. Vanilla TS + Web Components + Workbox 7

- **Bundle baseline**: near-zero framework, you write the runtime.
- **PWA tooling**: Workbox is back in active maintenance as of 2025; Serwist authors confirmed both projects will co-exist.
- **Why not**: You are a solo dev who wants to move fast. Reimplementing list reconciliation, form state, and routing for 20 concurrent timers is where weeks disappear. Skip.

## iOS PWA state — April 2026

### Web Push (`PushManager` + Notification API)

- **Works on iOS 16.4+** as long as the site is installed to the Home Screen. A web app in a Safari tab cannot subscribe to push.
- **Safari 18.4 added Declarative Web Push** — a JSON-payload push that the OS can display without a running service worker. Format uses a `"web_push": "8030"` magic key plus a `notification` object with `title`, `navigate_url`, `body`, `tag`, `sound`. Hugely improves reliability since the old model silently unsubscribed users if the SW failed to call `showNotification()` within a time budget.
- **Known issues still present in 2026**: service worker `push` handlers sometimes fail after device restart until the user opens the PWA; if the user denies permission, the only recovery is to remove and re-add the home-screen icon; no silent/background push is allowed.
- **Permission prompt**: must be triggered from a user gesture (tap), not on load.
- **EU caveat**: the 2024 iOS 17.4 saga where Apple removed standalone PWA support in the EU was reversed within weeks; EU PWAs work again, but keep the saga in mind as a platform-risk signal.

### Service Worker background alerts

- **Cannot run a timer inside the service worker.** `setTimeout`/`setInterval` inside an SW are explicitly unreliable and the W3C has resisted standardizing them — SWs are short-lived by design. Reports of "works for 20 seconds then stops" are exactly the expected behavior.
- **The only reliable way to fire a notification while the tab is closed / phone is locked is a server-sent push.** Even on Android, Background Sync / Periodic Background Sync are limited; on iOS they don't exist at all.
- **Implication for Grillmi**: a timer that must alert while the phone is asleep on the grill table requires a push from a server. The server needs to know the timer's end time when the user started it. The client sends `{endEpoch, label}` to the server at timer start; the server schedules a push for that epoch. This means the offline-first app needs network at timer-start time to get a reliable lock-screen alert. A pure offline fallback (vibrate + alarm when user next opens the app) must be the UX floor.

### Wake Lock API

- **Broadly supported in browsers since May 2024.** Chrome, Edge, Firefox, Android Chrome, iOS Safari — all green in `caniuse`.
- **iOS installed PWA gotcha**: WebKit bug #254545 — Wake Lock did **not** work in Home Screen Web Apps until Apple fixed it in iOS 18.4 (March 2025). As of April 2026, it works on iOS 18.4+ installed PWAs. Feature-detect and fall back to `NoSleep.js` for older iOS PWAs.
- **Power impact**: requesting a wake lock with 20 timers running on a locked phone will drain battery visibly. Acquire only while the user is actively viewing the timers screen; release on `visibilitychange` to hidden.

### Audio playback with screen locked

- **This is the biggest iOS pain point for Grillmi.**
- Multiple 2025–2026 reports: a PWA playing audio from the lock screen stops responding after roughly 30 seconds of pause, and only returning the PWA to the foreground recovers playback.
- iOS 26 introduced a regression where PWA audio playback is broken or inconsistent when installed to the home screen (confirmed still present in iOS 26.1).
- Silent mode (mute switch) kills PWA audio — native apps set `AVAudioSessionCategoryPlayback` to play over the mute switch; PWAs cannot.
- **Implication**: do not rely on audio-only alerts. Combine audio + vibration + a declarative push notification. Expect some users to still miss alerts when mute is on — make this visible in onboarding.

### Background Sync / Periodic Background Sync

- **Not supported on iOS. No timeline for implementation.** Available only on Chromium.
- For Grillmi: do not design around these. Use push for scheduled alerts, and sync-on-open for any analytics/history.

### Install prompts

- **Chrome / Edge / Samsung Internet**: `beforeinstallprompt` still works in 2026. Still Chromium-only, still not standardized. Call `preventDefault()`, stash the event, fire `prompt()` from a user gesture. Standardization is in an incubator stage only.
- **iOS Safari 18.x**: no programmatic install prompt. iOS 26 made every site added to home screen default to opening as a web app, a small UX win. You still need to render a "Tap Share → Add to Home Screen" coach-mark on first visit from iOS Safari.
- **Firefox desktop**: no install prompt. PWA support outside of Firefox for Android remains spotty.

### IndexedDB vs localStorage for timer state

- **Use IndexedDB.** `localStorage` caps around 5–10 MB and is synchronous (blocks the main thread).
- **iOS quota**: Safari 17+ grants up to 60% of device disk to browser-origin storage, but mobile real-world quotas have been reported as low as 50 MB. Catch `QuotaExceededError`.
- **Persistence**: call `navigator.storage.persist()` — WebKit grants this heuristically for Home Screen Web Apps, meaning installed PWA data is not evicted by ITP's 7-day rule.
- **Library**: `idb` (Jake Archibald's wrapper) is 1.6 kB gzipped and the current standard.

### Notification API from SW on iOS PWA

- **Reliable enough in 2026 with Declarative Web Push.** The classic Web Push model (SW calls `showNotification()` inside a `push` event) has documented reliability issues on iOS where SWs can be killed before handling the event. Declarative Web Push (Safari 18.4+) sidesteps this by letting the OS display the notification directly from the push payload, with optional SW-side mutation.
- **Recommended**: send pushes as declarative JSON. Keep an SW `push` handler for Chrome/Android and as a fallback for older iOS. Always call `showNotification()` from the SW — iOS revokes push subscriptions that push silently.

### Other 2025–2026 APIs worth knowing

- **View Transitions API**: same-document is stable cross-browser; cross-document shipped in Safari 18.2 and is an Interop 2026 focus area. Use for timer screen transitions if desired, with feature detection.
- **Popover API + `<dialog>`**: both widely supported. Interop 2026 is polishing `dialog closedby`, `:open` pseudo-class, and `popover="hint"`. Use `<dialog>` for modals instead of hand-rolled overlays.
- **`navigator.setAppBadge`**: works on iOS 16.4+ installed PWAs with notification permission. Use it to show "N timers running" on the home screen icon. Call from SW in the `push` handler.
- **Declarative Shadow DOM**: useful if you pick the Vanilla-TS-and-Web-Components route, otherwise ignore.
- **Sanitizer API**: nothing you need for this app — Grillmi renders static data, not user HTML.

## What changed since 2024 — top 5

1. **Declarative Web Push (Safari 18.4, March 2025)** — Notifications can now be rendered without a running service worker on iOS. Biggest reliability improvement for iOS PWA alerts since push landed in iOS 16.4.
2. **Wake Lock in installed iOS PWAs (iOS 18.4, March 2025)** — WebKit bug #254545 fixed. PWAs can finally hold the screen awake, which matters for a grill dashboard.
3. **Serwist replaced Workbox as the default for new Vite/SvelteKit/Next PWAs** — ESM, TypeScript-first, officially recommended in the Next.js docs. Workbox is maintained again but Serwist is where the momentum is.
4. **React Compiler + Vite 8 + Oxc-based `@vitejs/plugin-react` 6.x** — No more Babel in the dev dependency tree. React Compiler removes most manual memoization. Build times dropped materially.
5. **iOS 26 "home screen apps open as web apps by default"** — small UX smoothing of install flow, removes a source of user confusion. Paired with iOS 26.1 audio regressions in PWAs, which still need workarounds.

## Final recommendation

**Build with Vite 8 + React 19 (Compiler on) + TypeScript + Tailwind 4 + `@serwist/vite`.** Use `idb` for timer state, LinguiJS for i18n (10 kB total, compile-time extraction keeps German-only v1 trivial, FR/IT adds are one `.po` file each), Zustand for UI state, and the native `<dialog>` element for modals. Render a custom install coach-mark for iOS Safari and use `beforeinstallprompt` for Chrome. Fire alerts via Declarative Web Push plus an in-app audio/vibration combo when the tab is active. Acquire a Wake Lock only on the active timers screen. Persist with `navigator.storage.persist()` and design for `QuotaExceededError`.

### Runner-ups

- **SvelteKit 2 + `@serwist/svelte` with `adapter-static`** — pick this if the developer prefers Svelte or if baseline bundle size becomes a visible Lighthouse-score blocker. Svelte 5 Runes make the timer state ergonomic, and the bundle savings are real on slow grills-in-the-park 3G.
- **SolidStart 1.x in CSR mode** — pick this if timer precision at 20+ concurrent countdowns turns out to stress React's reconciler. Solid's fine-grained signals update exactly the affected DOM nodes without diffing. Unlikely to be needed, but it is the technically-best-fit reactive model for this problem.
- **Vanilla TS + Web Components + Workbox 7** — pick this only if Grillmi explicitly becomes an embeddable widget that needs to drop into arbitrary host pages without framework conflicts. Otherwise the DX cost is too high for a solo dev.

## Sources

- [PWA iOS Limitations and Safari Support — MagicBell 2026](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [Do Progressive Web Apps Work on iOS? — Mobiloud 2026](https://www.mobiloud.com/blog/progressive-web-apps-ios)
- [Meet Declarative Web Push — WebKit](https://webkit.org/blog/16535/meet-declarative-web-push/)
- [WebKit Features in Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)
- [Screen Wake Lock now supported in all browsers — web.dev](https://web.dev/blog/screen-wake-lock-supported-in-all-browsers)
- [WebKit bug 254545 — Wake Lock in Home Screen Web Apps](https://bugs.webkit.org/show_bug.cgi?id=254545)
- [Apple Developer Forums — iOS Audio Lockscreen Problem in PWA](https://developer.apple.com/forums/thread/762582)
- [WebKit bug 198277 — audio stops when standalone web app backgrounds](https://bugs.webkit.org/show_bug.cgi?id=198277)
- [iOS 26 PWA audio issues — MacRumors](https://forums.macrumors.com/threads/ios-26-audio-issues-in-pwa-web-apps.2466839/)
- [Updates to Storage Policy — WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [Storage quotas and eviction criteria — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [Serwist GitHub](https://github.com/serwist/serwist)
- [Serwist vs Workbox discussion](https://github.com/serwist/serwist/discussions/120)
- [vite-plugin-pwa GitHub](https://github.com/vite-pwa/vite-plugin-pwa)
- [@vitejs/plugin-react 6.0.1 release notes](https://github.com/vitejs/vite-plugin-react/releases)
- [React Compiler installation](https://react.dev/learn/react-compiler/installation)
- [Interop 2026 — web.dev](https://web.dev/blog/interop-2026)
- [Announcing Interop 2026 — WebKit](https://webkit.org/blog/17818/announcing-interop-2026/)
- [View Transition API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)
- [Navigator.setAppBadge — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/setAppBadge)
- [Badging for Home Screen Web Apps — WebKit](https://webkit.org/blog/14112/badging-for-home-screen-web-apps/)
- [ServiceWorker setTimeout/setInterval unreliable — W3C issue 838](https://github.com/w3c/ServiceWorker/issues/838)
- [worker-timers npm](https://www.npmjs.com/package/worker-timers)
- [Periodic Background Sync — web.dev](https://web.dev/periodic-background-sync/)
- [beforeinstallprompt — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event)
- [Best i18n Libraries for React 2026 — PkgPulse](https://www.pkgpulse.com/blog/best-i18n-libraries-react-2026)
- [Definitive Guide to i18n Libraries for Next.js & React 2026](https://gundogmuseray.medium.com/the-definitive-guide-to-i18n-libraries-for-next-js-react-in-2026-8102c7f68a77)
- [QwikCommunity/pwa](https://github.com/QwikCommunity/pwa)
- [Qwik offline PWA bundling issue](https://github.com/QwikDev/qwik/issues/5148)
- [@vite-pwa/sveltekit](https://github.com/vite-pwa/sveltekit)
- [SvelteKit service workers docs](https://svelte.dev/docs/kit/service-workers)
- [Serwist SvelteKit recipe](https://serwist.pages.dev/docs/vite/recipes/svelte)
- [Astro 5.0 announcement](https://astro.build/blog/astro-5/)
- [@vite-pwa/astro](https://github.com/vite-pwa/astro)
- [Vite PWA SolidJS frameworks guide](https://vite-pwa-org.netlify.app/frameworks/solidjs)
- [SolidStart docs](https://docs.solidjs.com/solid-start)
- [Workbox — Chrome for Developers](https://developer.chrome.com/docs/workbox)
