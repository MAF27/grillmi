<script lang="ts">
	import type { GrilladeRow } from '$lib/stores/db'
	import { formatDuration } from '$lib/util/format'

	interface Props {
		grillade: GrilladeRow
		saved?: boolean
		onClick: () => void
		onDelete?: () => void
	}

	let { grillade, saved = false, onClick, onDelete }: Props = $props()

	const title = $derived(grillade.name || `Grillade vom ${new Date(grillade.endedEpoch ?? grillade.updatedEpoch).toLocaleDateString('de-CH')}`)
	const itemCount = $derived(grillade.session?.items.length ?? grillade.planState?.plan.items.length ?? 0)
	const duration = $derived(
		grillade.startedEpoch && grillade.endedEpoch ? formatDuration(Math.round((grillade.endedEpoch - grillade.startedEpoch) / 1000)) : '-',
	)
</script>

<div class="card-wrap">
	<button class="card" class:saved type="button" onclick={onClick} data-testid="grillade-card">
		<span class="top">
			<span>{new Date(grillade.endedEpoch ?? grillade.updatedEpoch).toLocaleDateString('de-CH')}</span>
			{#if saved}<span class="saved-pill">Gespeichert</span>{/if}
		</span>
		<strong>{title}</strong>
		<span class="meta">{itemCount} Stück · {duration}</span>
	</button>
	{#if onDelete}
		<button
			type="button"
			class="delete"
			aria-label="Grillade löschen"
			onclick={e => {
				e.stopPropagation()
				onDelete!()
			}}>×</button>
	{/if}
</div>

<!--
	Layout note: the delete button is absolutely positioned at the top-right
	corner of the card, so the .top row reserves a right padding wide enough to
	keep the date and (optional) Gespeichert pill clear of it.
-->


<style>
	.card-wrap {
		position: relative;
	}
	.card-wrap:hover .delete,
	.card-wrap:focus-within .delete {
		opacity: 1;
	}
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
	.delete {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 28px;
		height: 28px;
		border-radius: 14px;
		border: 1px solid var(--color-border-strong);
		background: var(--color-bg-surface);
		color: var(--color-fg-muted);
		font: inherit;
		font-size: 18px;
		line-height: 1;
		cursor: pointer;
		opacity: 0.4;
		transition: opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease;
	}
	.delete:hover,
	.delete:focus-visible {
		opacity: 1;
		color: var(--color-error-default);
		border-color: var(--color-error-default);
	}
	.card.saved {
		border-color: var(--color-ember);
	}
	.top {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-right: 28px;
		color: var(--color-fg-muted);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.saved-pill {
		padding: 2px 8px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--color-ember) 14%, transparent);
		color: var(--color-ember);
		font-size: 10px;
		letter-spacing: 0.08em;
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
