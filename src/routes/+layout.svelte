<script lang="ts">
	import '../app.css'
	import { onMount } from 'svelte'
	import { settingsStore } from '$lib/stores/settingsStore.svelte'
	import { authStore } from '$lib/stores/authStore.svelte'
	import { attachSync, pull } from '$lib/sync'

	let { data, children } = $props<{ data: { auth: { user: { id: string; email: string }; csrfToken: string } | null }; children: any }>()

	$effect(() => {
		authStore.init(data.auth)
	})

	onMount(() => {
		void settingsStore.init()
		if (authStore.isAuthenticated) {
			attachSync()
			void pull()
		}
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
	})
</script>

<svelte:head>
	{#if authStore.csrfToken}
		<meta name="csrf-token" content={authStore.csrfToken} />
	{/if}
</svelte:head>

{@render children()}
