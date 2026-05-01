<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import Button from '$lib/components/Button.svelte'
	import GlowGrates from '$lib/components/GlowGrates.svelte'
	import { grilladeStore } from '$lib/stores/grilladeStore.svelte'
	import { grilladenHistoryStore } from '$lib/stores/grilladenHistoryStore.svelte'
	import { settingsStore } from '$lib/stores/settingsStore.svelte'
	import { viewport } from '$lib/runtime/viewport.svelte'

	const recentGrilladen = $derived(grilladenHistoryStore.finished.slice(0, 6))
	const primaryLive = $derived(Boolean(grilladeStore.session))

	onMount(async () => {
		await grilladeStore.init()
		await grilladenHistoryStore.init()
		await settingsStore.init()
		if (grilladeStore.session && grilladeStore.sessionHasStarted) goto('/session')
	})

	async function loadGrillade(id: string) {
		const loaded = await grilladenHistoryStore.loadItems(id)
		if (!loaded.ok) return
		grilladeStore.loadFromMenu(loaded.items)
		goto('/plan')
	}

	function fmtRowMeta(row: { startedEpoch: number | null; endedEpoch: number | null; session?: { items: Array<unknown> } | undefined; planState?: { plan: { items: Array<unknown> } } | undefined }) {
		const itemCount = row.session?.items.length ?? row.planState?.plan.items.length ?? 0
		const dur = row.startedEpoch && row.endedEpoch ? Math.round((row.endedEpoch - row.startedEpoch) / 1000) : 0
		return `${itemCount} ${itemCount === 1 ? 'Grillstück' : 'Grillstücke'} · ${Math.round(dur / 60)} min`
	}

	function rowName(row: { name: string | null; endedEpoch: number | null; updatedEpoch: number }) {
		return row.name ?? `Grillade vom ${new Date(row.endedEpoch ?? row.updatedEpoch).toLocaleDateString('de-CH')}`
	}

	function primaryMobileAction() {
		if (grilladeStore.session) {
			goto('/session')
			return
		}
		goto('/plan')
	}
</script>

<svelte:head>
	<title>Grillmi</title>
</svelte:head>

{#if !viewport.isDesktop}
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
			<p>Plane deine Grillade. Grillmi sagt dir, wann was auf den Rost muss.</p>
		</div>

		{#if recentGrilladen.length > 0}
			<div class="recent">
				<div class="recent-eyebrow">Zuletzt gegrillt</div>
				<div class="recent-row">
					{#each recentGrilladen as row (row.id)}
						<button class="recent-pill" onclick={() => loadGrillade(row.id)}>
							<span class="recent-name">{rowName(row)}</span>
							<span class="recent-meta">{fmtRowMeta(row)}</span>
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<Button variant="primary" size="lg" fullWidth onclick={primaryMobileAction}>
			<span>Grillen</span>
			{#if primaryLive}
				<span class="primary-badge">LIVE</span>
			{/if}
		</Button>
		<div class="row-buttons">
			<Button variant="secondary" fullWidth onclick={() => goto('/chronik')}>Chronik</Button>
			<Button variant="secondary" fullWidth onclick={() => goto('/settings')}>Einstellungen</Button>
		</div>
	</div>
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
	.primary-badge {
		border-radius: 999px;
		background: color-mix(in srgb, currentColor 16%, transparent);
		padding: 3px 7px;
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.08em;
		line-height: 1;
	}
</style>
