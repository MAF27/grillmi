<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import Button from '$lib/components/Button.svelte'
	import GlowGrates from '$lib/components/GlowGrates.svelte'
	import { sessionStore } from '$lib/stores/sessionStore.svelte'
	import { settingsStore } from '$lib/stores/settingsStore.svelte'
	import { menusStore } from '$lib/stores/menusStore.svelte'

	const INSTALL_CHIP_KEY = 'gluehen.installChipDismissed'
	const INSTALL_CHIP_TTL_MS = 30 * 24 * 60 * 60 * 1000

	let installAvailable = $state(false)
	let chipDismissed = $state(false)
	let iosShareSheetOpen = $state(false)
	let isStandalone = $state(false)
	let isIos = $state(false)

	const recentMenus = $derived(menusStore.all.slice(0, 6))

	onMount(async () => {
		await sessionStore.init()
		await menusStore.init()
		await settingsStore.init()

		if (typeof window !== 'undefined') {
			isStandalone =
				(window.matchMedia('(display-mode: standalone)').matches as boolean) ||
				// iOS standalone
				(typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone === true)
			isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
			installAvailable = !!window.installPromptEvent
			chipDismissed = isChipDismissed()

			const onPromptReady = () => {
				installAvailable = true
			}
			window.addEventListener('beforeinstallprompt', onPromptReady)
		}

		if (sessionStore.session) goto('/session')
	})

	function isChipDismissed(): boolean {
		if (typeof window === 'undefined') return false
		try {
			const raw = window.localStorage.getItem(INSTALL_CHIP_KEY)
			if (!raw) return false
			const ts = parseInt(raw, 10)
			if (Number.isNaN(ts)) return false
			return Date.now() - ts < INSTALL_CHIP_TTL_MS
		} catch {
			return false
		}
	}

	function persistChipDismissal() {
		try {
			window.localStorage.setItem(INSTALL_CHIP_KEY, String(Date.now()))
		} catch {
			/* ignore */
		}
	}

	function dismissChip() {
		chipDismissed = true
		persistChipDismissal()
	}

	function showInstallChip(): boolean {
		if (chipDismissed) return false
		if (isStandalone) return false
		if (installAvailable) return true
		// iOS Safari does not fire beforeinstallprompt; show the chip when in a
		// regular Safari tab so we can guide the user to "Add to Home Screen".
		return isIos && !isStandalone
	}

	async function installApp() {
		if (isIos && !installAvailable) {
			iosShareSheetOpen = true
			return
		}
		const evt = window.installPromptEvent
		if (!evt) return
		await evt.prompt()
		installAvailable = false
		window.installPromptEvent = undefined
		dismissChip()
	}

	function loadMenu(id: string) {
		const menu = menusStore.all.find(m => m.id === id)
		if (!menu) return
		void menusStore.touch(id)
		sessionStore.loadFromMenu(menu.items)
		goto('/plan')
	}

	function fmtMenuMeta(menu: { items: Array<{ cookSeconds: number; restSeconds: number }> }) {
		const totalSec = menu.items.reduce((s, i) => s + i.cookSeconds + (i.restSeconds || 0), 0)
		return `${menu.items.length} Stück · ${Math.round(totalSec / 60)} min`
	}
</script>

<svelte:head>
	<title>Grillmi</title>
</svelte:head>

<div class="screen">
	<GlowGrates />
	<div class="content">
		{#if showInstallChip()}
			<div class="chip-row">
				<button class="install-chip" onclick={installApp}>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.4"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true">
						<path d="M12 5v14M5 12l7 7 7-7" />
					</svg>
					<span>App installieren</span>
				</button>
				<button class="chip-close" onclick={dismissChip} aria-label="App-Banner ausblenden">×</button>
			</div>
		{/if}

		<div class="brand">
			<svg class="flame" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<path
					d="M12 2c1 3-1 4-1 7 0 1.5 1 3 2.5 3S16 10.5 16 9c0-2-1-3-1-4 2 1 5 4 5 8 0 4-3.5 7-8 7s-8-3-8-7c0-3 2-5 4-6.5C7.2 5.7 9 4 12 2z" />
			</svg>
			<span class="wordmark">Grillmi</span>
		</div>
		<div class="tagline">Mehrere Timer, ein Grill.</div>

		<div class="spacer"></div>

		<div class="hero">
			<h1>
				Bereit zum<br />
				<span class="hero-accent">Grillen</span>?
			</h1>
			<p>Plane deine Session — Grillmi sagt dir, wann was auf den Rost muss.</p>
		</div>

		{#if recentMenus.length > 0}
			<div class="recent">
				<div class="recent-eyebrow">Zuletzt gespeicherte Menüs</div>
				<div class="recent-row">
					{#each recentMenus as menu (menu.id)}
						<button class="recent-pill" onclick={() => loadMenu(menu.id)}>
							<span class="recent-name">{menu.name}</span>
							<span class="recent-meta">{fmtMenuMeta(menu)}</span>
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<Button variant="primary" size="lg" fullWidth onclick={() => goto('/plan')}>Neue Session</Button>
		<div class="row-buttons">
			<Button variant="secondary" fullWidth onclick={() => goto('/menus')}>Menüs</Button>
			<Button variant="secondary" fullWidth onclick={() => goto('/settings')}>Einstellungen</Button>
		</div>
	</div>
</div>

{#if iosShareSheetOpen}
	<div class="scrim" role="presentation" onclick={() => (iosShareSheetOpen = false)}></div>
	<div class="ios-sheet" role="dialog" aria-modal="true" aria-label="App installieren">
		<header>
			<h2>Auf den Home-Bildschirm</h2>
			<button class="dismiss" onclick={() => (iosShareSheetOpen = false)} aria-label="Schliessen">×</button>
		</header>
		<ol>
			<li>Tippe in Safari unten auf das <strong>Teilen</strong>-Symbol.</li>
			<li>Wähle <strong>„Zum Home-Bildschirm"</strong>.</li>
			<li>Bestätige mit <strong>„Hinzufügen"</strong>.</li>
		</ol>
		<Button
			variant="primary"
			fullWidth
			onclick={() => {
				dismissChip()
				iosShareSheetOpen = false
			}}>Verstanden</Button>
	</div>
{/if}

<style>
	.screen {
		position: relative;
		min-height: 100dvh;
		background: var(--color-bg-base);
		color: var(--color-fg-base);
		overflow: hidden;
	}
	.content {
		position: relative;
		z-index: 1;
		max-width: 600px;
		margin: 0 auto;
		padding: 80px 24px calc(40px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-height: 100dvh;
		box-sizing: border-box;
	}
	.chip-row {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 6px;
		margin-bottom: 4px;
	}
	.install-chip {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 36px;
		padding: 8px 14px;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-strong);
		border-radius: 999px;
		color: var(--color-fg-base);
		font-family: var(--font-body);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.chip-close {
		min-width: 28px;
		min-height: 28px;
		background: transparent;
		border: none;
		color: var(--color-fg-muted);
		font-size: 18px;
		cursor: pointer;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 4px;
	}
	.flame {
		color: var(--color-ember);
	}
	.wordmark {
		font-family: var(--font-display);
		font-size: 26px;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
	}
	.tagline {
		font-family: var(--font-body);
		font-size: 13px;
		color: var(--color-fg-muted);
	}
	.spacer {
		flex: 1;
	}
	.hero {
		margin-bottom: 8px;
	}
	.hero h1 {
		font-family: var(--font-display);
		font-size: 76px;
		line-height: 0.92;
		font-weight: 600;
		letter-spacing: -0.02em;
		text-transform: uppercase;
		margin: 0;
	}
	.hero-accent {
		color: var(--color-ember);
	}
	.hero p {
		margin: 16px 0 0;
		font-family: var(--font-body);
		font-size: 15px;
		line-height: 1.45;
		max-width: 300px;
		color: var(--color-fg-muted);
	}
	.recent {
		margin-top: 8px;
	}
	.recent-eyebrow {
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-fg-subtle);
		margin-bottom: 8px;
	}
	.recent-row {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.recent-row::-webkit-scrollbar {
		display: none;
	}
	.recent-pill {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		padding: 10px 14px;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: 10px;
		cursor: pointer;
	}
	.recent-name {
		font-family: var(--font-body);
		font-size: 14px;
		font-weight: 600;
		color: var(--color-fg-base);
	}
	.recent-meta {
		font-family: var(--font-display);
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		color: var(--color-fg-muted);
	}
	.row-buttons {
		display: flex;
		gap: 8px;
	}
	.scrim {
		position: fixed;
		inset: 0;
		background: var(--color-bg-overlay);
		z-index: var(--z-modal);
	}
	.ios-sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		max-width: 600px;
		margin: 0 auto;
		background: var(--color-bg-surface);
		border-top-left-radius: 24px;
		border-top-right-radius: 24px;
		padding: 16px 20px calc(20px + env(safe-area-inset-bottom));
		z-index: calc(var(--z-modal) + 1);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.ios-sheet header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.ios-sheet h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 20px;
		font-weight: 600;
		text-transform: uppercase;
	}
	.dismiss {
		background: transparent;
		border: none;
		color: var(--color-fg-base);
		font-size: 22px;
		cursor: pointer;
	}
	ol {
		margin: 0;
		padding-left: 20px;
		color: var(--color-fg-base);
		line-height: 1.5;
	}
	ol li {
		margin-bottom: 8px;
	}
</style>
