<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import Button from '$lib/components/Button.svelte'
	import GlowGrates from '$lib/components/GlowGrates.svelte'
	import Card from '$lib/components/Card.svelte'
	import { grilladeStore } from '$lib/stores/grilladeStore.svelte'
	import { settingsStore } from '$lib/stores/settingsStore.svelte'
	import { menusStore } from '$lib/stores/menusStore.svelte'
	import { listGrilladen } from '$lib/stores/db'
	import { viewport } from '$lib/runtime/viewport.svelte'
	import { formatDuration } from '$lib/util/format'

	const recentMenus = $derived(menusStore.all.slice(0, 6))
	let finishedThisMonth = $state<number | null>(null)
	let savedHistory = $state<number | null>(null)
	let longestDuration = $state<number | null>(null)

	onMount(async () => {
		await grilladeStore.init()
		await menusStore.init()
		await settingsStore.init()
		await loadStats()
		if (grilladeStore.session) goto('/session')
	})

	async function loadStats() {
		const rows = await listGrilladen()
		const finished = rows.filter(row => row.status === 'finished' && row.deletedEpoch === null)
		const now = new Date()
		finishedThisMonth = finished.filter(row => {
			if (!row.endedEpoch) return false
			const ended = new Date(row.endedEpoch)
			return ended.getFullYear() === now.getFullYear() && ended.getMonth() === now.getMonth()
		}).length
		savedHistory = 0
		longestDuration =
			finished
				.map(row => (row.startedEpoch && row.endedEpoch ? Math.round((row.endedEpoch - row.startedEpoch) / 1000) : 0))
				.sort((a, b) => b - a)[0] ?? 0
	}

	function loadMenu(id: string) {
		const menu = menusStore.all.find(m => m.id === id)
		if (!menu) return
		void menusStore.touch(id)
		grilladeStore.loadFromMenu(menu.items)
		goto('/plan')
	}

	function fmtMenuMeta(menu: { items: Array<{ cookSeconds: number; restSeconds: number }> }) {
		const totalSec = menu.items.reduce((s, i) => s + i.cookSeconds + (i.restSeconds || 0), 0)
		return `${menu.items.length} Stück · ${Math.round(totalSec / 60)} min`
	}

	function newDesktopSession() {
		grilladeStore.resetDraft()
		goto('/plan')
	}
</script>

<svelte:head>
	<title>Grillmi</title>
</svelte:head>

{#if viewport.isDesktop}
	<main class="desktop-overview">
		<div class="date-kicker">Heute · {new Date().toLocaleDateString('de-CH', { weekday: 'long', day: '2-digit', month: '2-digit' })}</div>
		<h1>Bereit zum <span>Grillen?</span></h1>
		<p class="desktop-copy">Plane deine Grillade am Laptop, starte sie wann du fertig bist. Auf jedem Gerät.</p>
		<Button variant="primary" size="lg" onclick={newDesktopSession}>Loszündeln</Button>
		<div class="stats">
			<Card>
				<div class="stat-value">{finishedThisMonth ? finishedThisMonth : '-'}</div>
				<div class="stat-label">Grilladen diesen Monat</div>
			</Card>
			<Card>
				<div class="stat-value">{savedHistory ? savedHistory : '-'}</div>
				<div class="stat-label">Gespeicherte Grilladen</div>
			</Card>
			<Card>
				<div class="stat-value">{longestDuration ? formatDuration(longestDuration) : '-'}</div>
				<div class="stat-label">Längste Grillade</div>
			</Card>
		</div>
	</main>
{:else}
<div class="screen">
	<GlowGrates />
	<div class="content">
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
			<p>Plane deine Session. Grillmi sagt dir, wann was auf den Rost muss.</p>
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
{/if}

<style>
	.desktop-overview {
		min-height: 100dvh;
		padding: 32px 36px;
		background: var(--color-bg-base);
		color: var(--color-fg-base);
	}
	.date-kicker {
		margin-bottom: 10px;
		color: var(--color-ember);
		font-family: var(--font-body);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.desktop-overview h1 {
		max-width: 760px;
		margin: 0;
		font-family: var(--font-display);
		font-size: 56px;
		font-weight: 600;
		line-height: 1;
		letter-spacing: -0.02em;
		text-transform: uppercase;
	}
	.desktop-overview h1 span {
		color: var(--color-ember);
	}
	.desktop-copy {
		max-width: 470px;
		margin: 16px 0 28px;
		color: var(--color-fg-muted);
		font-size: 16px;
		line-height: 1.5;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
		max-width: 900px;
		margin-top: 40px;
	}
	.stat-value {
		font-family: var(--font-display);
		font-size: 38px;
		font-weight: 700;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.stat-label {
		margin-top: 8px;
		color: var(--color-fg-muted);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
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
</style>
