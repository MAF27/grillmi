/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, prerendered, version } from '$service-worker'
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope

const PRECACHE = [...build, ...files, ...prerendered].map(url => ({ url, revision: version }))

precacheAndRoute(PRECACHE)
cleanupOutdatedCaches()

// SPA navigation fallback: any client-side route the precache doesn't have lands on the precached `/`.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/')))

registerRoute(({ url }) => url.pathname.startsWith('/sounds/'), new CacheFirst({ cacheName: `grillmi-sounds-${version}` }))
registerRoute(({ url }) => url.pathname.startsWith('/icons/'), new CacheFirst({ cacheName: `grillmi-icons-${version}` }))
registerRoute(
	({ url }) => url.pathname === '/manifest.webmanifest',
	new StaleWhileRevalidate({ cacheName: `grillmi-manifest-${version}` }),
)

self.addEventListener('install', () => {
	void self.skipWaiting()
})

// Aggressive cache eviction: on every activation, delete any cache whose name
// is not one this build produced. This handles the case where a previous
// deploy poisoned the precache (e.g. with HTML returned for a missing chunk
// URL) — we cannot trust the prior precache contents at all, so we wipe.
const VALID_CACHE_NAMES = new Set([`grillmi-sounds-${version}`, `grillmi-icons-${version}`, `grillmi-manifest-${version}`])

self.addEventListener('activate', event => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys()
			await Promise.all(
				keys.map(key => {
					if (key.startsWith('workbox-precache') || VALID_CACHE_NAMES.has(key)) return undefined
					return caches.delete(key)
				}),
			)
			await self.clients.claim()
		})(),
	)
})
