/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker'
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope

const PRECACHE = [...build, ...files].map(url => ({ url, revision: version }))

precacheAndRoute(PRECACHE)
cleanupOutdatedCaches()

registerRoute(({ url }) => url.pathname.startsWith('/sounds/'), new CacheFirst({ cacheName: `grillmi-sounds-${version}` }))
registerRoute(({ url }) => url.pathname.startsWith('/icons/'), new CacheFirst({ cacheName: `grillmi-icons-${version}` }))
registerRoute(
	({ url }) => url.pathname === '/manifest.webmanifest',
	new StaleWhileRevalidate({ cacheName: `grillmi-manifest-${version}` }),
)

self.addEventListener('install', () => {
	void self.skipWaiting()
})

self.addEventListener('activate', event => {
	event.waitUntil(self.clients.claim())
})
