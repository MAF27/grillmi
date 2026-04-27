<script lang="ts">
	import '../app.css'
	import { onMount } from 'svelte'
	import { settingsStore } from '$lib/stores/settingsStore.svelte'

	let { children } = $props()

	onMount(() => {
		void settingsStore.init()
		if ('serviceWorker' in navigator) {
			if (import.meta.env.DEV) {
				// Strip any service worker the user picked up from a prior prod
				// build so HMR can serve current source without cache poisoning.
				void navigator.serviceWorker.getRegistrations().then(regs => {
					for (const r of regs) void r.unregister()
				})
				if ('caches' in window) {
					void caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
				}
			} else {
				const hadController = !!navigator.serviceWorker.controller
				let refreshing = false
				navigator.serviceWorker.addEventListener('controllerchange', () => {
					if (!hadController || refreshing) return
					refreshing = true
					window.location.reload()
				})
				void navigator.serviceWorker
					.register('/service-worker.js', { type: 'module' })
					.then(reg => {
						const check = () => {
							void reg.update()
						}
						document.addEventListener('visibilitychange', () => {
							if (document.visibilityState === 'visible') check()
						})
						setInterval(check, 60 * 60 * 1000)
					})
					.catch(() => {})
			}
		}
		const handler = (e: Event) => {
			e.preventDefault()
			window.installPromptEvent = e as unknown as Window['installPromptEvent']
		}
		window.addEventListener('beforeinstallprompt', handler)
		return () => window.removeEventListener('beforeinstallprompt', handler)
	})
</script>

{@render children()}
