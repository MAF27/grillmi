<script lang="ts">
	import type { PlannedItem, SessionItem } from '$lib/models'
	import { formatDuration } from '$lib/util/format'

	interface Props {
		items: Array<PlannedItem | SessionItem>
		statusByItem?: Record<string, string>
	}

	let { items, statusByItem }: Props = $props()
</script>

<aside class="summary" data-testid="plan-summary-list">
	<div class="eyebrow">Plan</div>
	{#if items.length === 0}
		<p class="empty">Noch keine Einträge.</p>
	{:else}
		<ul>
			{#each items as item (item.id)}
				<li>
					{#if statusByItem}
						<span class="dot" data-state={statusByItem[item.id] ?? 'pending'} aria-hidden="true"></span>
					{/if}
					<span class="name">{item.label || item.cutSlug}</span>
					<span class="time">{formatDuration(item.cookSeconds)}{#if item.restSeconds > 0} <span class="rest">+{Math.round(item.restSeconds / 60)} min Ruhe</span>{/if}</span>
				</li>
			{/each}
		</ul>
	{/if}
</aside>

<style>
	.summary {
		min-width: 0;
		padding: 24px;
		border-right: 1px solid var(--color-border-subtle);
		background: var(--color-bg-panel);
	}
	.eyebrow {
		margin-bottom: 14px;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-fg-muted);
	}
	.empty {
		margin: 0;
		color: var(--color-fg-muted);
		font-size: 13px;
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
		padding: 10px 0;
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-state-pending);
	}
	.dot[data-state='cooking'] {
		background: var(--color-ember);
	}
	.dot[data-state='resting'] {
		background: var(--color-state-resting);
	}
	.dot[data-state='ready'] {
		background: var(--color-state-ready);
	}
	.dot[data-state='plated'] {
		background: var(--color-state-plated);
	}
	.name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 13px;
		font-weight: 600;
	}
	.time {
		font-family: var(--font-display);
		font-size: 13px;
		color: var(--color-fg-muted);
		font-variant-numeric: tabular-nums;
		display: inline-flex;
		align-items: baseline;
		gap: 6px;
	}
	.rest {
		font-family: var(--font-body);
		font-size: 10px;
		font-weight: 500;
		text-transform: lowercase;
		color: var(--color-fg-subtle);
	}
</style>
