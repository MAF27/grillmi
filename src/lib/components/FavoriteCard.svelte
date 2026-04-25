<script lang="ts">
	import type { Favorite } from '$lib/models'

	interface Props {
		favorite: Favorite
		onload: (id: string) => void
		onlongpress: (id: string) => void
	}

	let { favorite, onload, onlongpress }: Props = $props()

	let pressTimer: ReturnType<typeof setTimeout> | null = null

	function pointerdown() {
		pressTimer = setTimeout(() => {
			onlongpress(favorite.id)
			pressTimer = null
		}, 500)
	}
	function pointerup() {
		if (pressTimer) {
			clearTimeout(pressTimer)
			pressTimer = null
			onload(favorite.id)
		}
	}
	function pointercancel() {
		if (pressTimer) {
			clearTimeout(pressTimer)
			pressTimer = null
		}
	}

	const summary = $derived(favorite.items.map(i => i.label || i.cutSlug).join(', '))
	const lastUsed = $derived(new Date(favorite.lastUsedEpoch).toLocaleDateString('de-CH'))
</script>

<button
	class="card"
	onpointerdown={pointerdown}
	onpointerup={pointerup}
	onpointerleave={pointercancel}
	onpointercancel={pointercancel}>
	<div class="head">
		<span class="name">{favorite.name}</span>
		<span class="count">{favorite.items.length}</span>
	</div>
	<p class="summary">{summary}</p>
	<span class="last">Zuletzt: {lastUsed}</span>
</button>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-lg);
		text-align: left;
		color: var(--color-fg-base);
		font: inherit;
		cursor: pointer;
		width: 100%;
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	.name {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		font-family: var(--font-display);
	}
	.count {
		font-family: var(--font-mono);
		color: var(--color-fg-muted);
		font-size: var(--font-size-sm);
	}
	.summary {
		color: var(--color-fg-muted);
		font-size: var(--font-size-sm);
		margin: 0;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.last {
		font-size: var(--font-size-xs);
		color: var(--color-fg-subtle);
	}
</style>
