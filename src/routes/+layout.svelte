<script lang="ts">
	import '../app.css'
	import { onMount, type Snippet } from 'svelte'
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import AccountChip from '$lib/components/AccountChip.svelte'
	import Sidebar, { type SidebarItem } from '$lib/components/Sidebar.svelte'
	import { viewport } from '$lib/runtime/viewport.svelte'
	import { settingsStore } from '$lib/stores/settingsStore.svelte'
	import { authStore } from '$lib/stores/authStore.svelte'
	import { grilladenHistoryStore } from '$lib/stores/grilladenHistoryStore.svelte'
	import { grilladeStore } from '$lib/stores/grilladeStore.svelte'
	import { attachSync, onSyncApplied, syncNow } from '$lib/sync'
	import { debugSync } from '$lib/sync/debug'
	import { unlockAudio } from '$lib/sounds/player'

	let { data, children } = $props<{
		data: { auth: { user: { id: string; email: string }; csrfToken: string } | null }
		children: Snippet
	}>()

	const pathname = $derived(page.url.pathname)
	const publicPage = $derived(['/login', '/set-password', '/forgot-password'].some(path => pathname.startsWith(path)))
	const showDesktopShell = $derived(viewport.isDesktop && authStore.isAuthenticated && !publicPage)
	const accountUser = $derived(
		authStore.user
			? {
					name: authStore.user.email.split('@')[0],
					email: authStore.user.email,
					initials: authStore.user.email.slice(0, 2),
				}
			: null,
	)
	const currentSection = $derived.by(() => {
		if (pathname.startsWith('/grillen') || pathname.startsWith('/session')) return 'cook'
		if (pathname.startsWith('/chronik')) return 'chronik'
		if (pathname.startsWith('/settings')) return 'settings'
		return 'cook'
	})
	const sidebarItems = $derived<SidebarItem[]>([
		{ id: 'cook', label: 'Grillen', icon: '◉', badge: grilladeStore.session ? 'LIVE' : undefined },
		{ id: 'chronik', label: 'Chronik', icon: '★' },
		{ id: 'settings', label: 'Einstellungen', icon: '⚙' },
	])

	$effect(() => {
		authStore.init(data.auth)
	})

	onMount(() => {
		authStore.init(data.auth)
		const stopViewport = viewport.start()
		const desktopAtStartup = window.matchMedia('(min-width: 1024px)').matches
		debugSync('layout', 'mount', {
			hasAuth: Boolean(data.auth),
			authStoreAuthenticated: authStore.isAuthenticated,
			desktopAtStartup,
			pathname,
		})
		const unlock = () => {
			void unlockAudio()
		}
		window.addEventListener('pointerdown', unlock, { capture: true, once: true })
		window.addEventListener('keydown', unlock, { capture: true, once: true })
		void settingsStore.init()
		const grilladeInit = grilladeStore.init()
		let stopSyncApplied: (() => void) | null = null
		if (data.auth) {
			stopSyncApplied = onSyncApplied(async () => {
				await Promise.all([grilladeStore.reloadFromStorage(), grilladenHistoryStore.refresh()])
			})
			attachSync()
			const pushLocal = desktopAtStartup ? grilladeInit.then(() => grilladeStore.syncActive()) : grilladeInit
			void pushLocal
				.then(() => debugSync('layout', 'startup push/init done', { desktopAtStartup }))
				.then(() => syncNow('layout'))
				.then(() => debugSync('layout', 'startup sync done'))
				.then(() => grilladeStore.reloadFromStorage())
				.then(() => debugSync('layout', 'startup reload done'))
				.catch(error => debugSync('layout', 'startup sync error', { error: String(error) }))
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
		return () => {
			window.removeEventListener('pointerdown', unlock, { capture: true })
			window.removeEventListener('keydown', unlock, { capture: true })
			stopViewport?.()
			stopSyncApplied?.()
		}
	})

	$effect(() => {
		if (showDesktopShell && pathname === '/') void goto('/grillen')
	})

	function nav(id: string) {
		const map: Record<string, string> = {
			cook: grilladeStore.session ? '/session' : '/grillen',
			chronik: '/chronik',
			settings: '/settings',
		}
		void goto(map[id] ?? '/')
	}
</script>

<svelte:head>
	{#if authStore.csrfToken}
		<meta name="csrf-token" content={authStore.csrfToken} />
	{/if}
</svelte:head>

{#if showDesktopShell}
	<div class="desktop-shell">
		<aside class="desktop-sidebar">
			<div class="brand">
				<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<path
						d="M12 2c1 3-1 4-1 7 0 1.5 1 3 2.5 3S16 10.5 16 9c0-2-1-3-1-4 2 1 5 4 5 8 0 4-3.5 7-8 7s-8-3-8-7c0-3 2-5 4-6.5C7.2 5.7 9 4 12 2z" />
				</svg>
				<span>Grillmi</span>
			</div>
			<Sidebar items={sidebarItems} current={currentSection} onChange={nav} />
			<div class="sidebar-spacer"></div>
			<AccountChip
				user={accountUser}
				onSignedInClick={() => goto('/settings?group=account')}
				onSignedOutClick={() => goto('/login')} />
		</aside>
		<div class="desktop-content">
			{@render children()}
		</div>
	</div>
{:else}
	{@render children()}
{/if}

<style>
	.desktop-shell {
		display: grid;
		grid-template-columns: 240px minmax(0, 1fr);
		min-height: 100dvh;
		background: var(--color-bg-base);
		color: var(--color-fg-base);
	}
	.desktop-sidebar {
		position: sticky;
		top: 0;
		height: 100dvh;
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 24px 16px;
		background: var(--color-bg-panel);
		border-right: 1px solid var(--color-border-subtle);
		box-sizing: border-box;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 14px;
		color: var(--color-ember);
	}
	.brand span {
		font-family: var(--font-display);
		font-size: 26px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		color: var(--color-fg-base);
	}
	.sidebar-spacer {
		flex: 1;
	}
	.desktop-content {
		min-width: 0;
		min-height: 100dvh;
	}
</style>
