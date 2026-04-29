<script lang="ts">
	import type { GrilladeRow } from '$lib/stores/db'
	import { formatDuration } from '$lib/util/format'

	interface Props {
		grillade: GrilladeRow
		saved?: boolean
		onClick: () => void
	}

	let { grillade, saved = false, onClick }: Props = $props()

	const title = $derived(grillade.name || `Grillade vom ${new Date(grillade.endedEpoch ?? grillade.updatedEpoch).toLocaleDateString('de-CH')}`)
	const itemCount = $derived(grillade.session?.items.length ?? grillade.planState?.plan.items.length ?? 0)
	const duration = $derived(
		grillade.startedEpoch && grillade.endedEpoch ? formatDuration(Math.round((grillade.endedEpoch - grillade.startedEpoch) / 1000)) : '-',
	)
</script>

<button class="card" class:saved type="button" onclick={onClick} data-testid="grillade-card">
	<span class="top">
		<span>{new Date(grillade.endedEpoch ?? grillade.updatedEpoch).toLocaleDateString('de-CH')}</span>
		<span class="star">{saved ? '★' : '☆'}</span>
	</span>
	<strong>{title}</strong>
	<span class="meta">{itemCount} Stück · {duration}</span>
</button>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
		padding: 18px 20px;
		border-radius: 12px;
		border: 1px solid var(--color-border-subtle);
		background: var(--color-bg-panel);
		color: var(--color-fg-base);
		text-align: left;
		cursor: pointer;
	}
	.card.saved {
		border-color: var(--color-ember);
	}
	.top {
		display: flex;
		justify-content: space-between;
		color: var(--color-fg-muted);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.star {
		color: var(--color-ember);
		font-size: 18px;
		line-height: 1;
	}
	strong {
		font-size: 16px;
		line-height: 1.2;
	}
	.meta {
		font-family: var(--font-display);
		font-size: 12px;
		color: var(--color-fg-muted);
		text-transform: uppercase;
	}
</style>
