<script lang="ts">
	import type { PlannedItem, SessionItem } from '$lib/models'
	import { formatDuration } from '$lib/util/format'
	import { tipsForItem } from '$lib/util/tips'

	interface Props {
		items: Array<PlannedItem | SessionItem>
		statusByItem?: Record<string, string>
	}

	let { items, statusByItem }: Props = $props()

	const tipsByItem = $derived(Object.fromEntries(items.map(i => [i.id, tipsForItem(i)])))
	let openTips = $state<Record<string, boolean>>({})

	function toggle(id: string) {
		openTips = { ...openTips, [id]: !openTips[id] }
	}
</script>

<aside class="summary" data-testid="plan-summary-list">
	<div class="eyebrow">Plan</div>
	{#if items.length === 0}
		<p class="empty">Noch keine Einträge.</p>
	{:else}
		<ul>
			{#each items as item (item.id)}
				{@const tips = tipsByItem[item.id] ?? []}
				{@const open = !!openTips[item.id]}
				<li class:has-tips={tips.length > 0}>
					<div class="row">
						{#if statusByItem}
							<span class="dot" data-state={statusByItem[item.id] ?? 'pending'} aria-hidden="true"></span>
						{/if}
						<span class="name">{item.label || item.cutSlug}</span>
						{#if tips.length > 0}
							<button
								type="button"
								class="tips-btn"
								class:active={open}
								onclick={() => toggle(item.id)}
								aria-expanded={open}
								aria-controls={`summary-tips-${item.id}`}
								aria-label={open ? 'Tipps ausblenden' : 'Tipps anzeigen'}>
								<svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
									<circle cx="7" cy="7" r="6.25" fill="none" stroke="currentColor" stroke-width="1.4" />
									<rect x="6.3" y="5.7" width="1.4" height="4.2" rx="0.7" fill="currentColor" />
									<circle cx="7" cy="3.9" r="0.85" fill="currentColor" />
								</svg>
							</button>
						{/if}
						<span class="time">{formatDuration(item.cookSeconds)}{#if item.restSeconds > 0} <span class="rest">+{Math.round(item.restSeconds / 60)} min Ruhe</span>{/if}</span>
					</div>
					{#if open && tips.length > 0}
						<ul class="tips-tray" id={`summary-tips-${item.id}`}>
							{#each tips as tip (tip)}
								<li>{tip}</li>
							{/each}
						</ul>
					{/if}
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
		padding: 10px 0;
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.name {
		flex: 1 1 auto;
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
	.tips-btn {
		flex: 0 0 auto;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: transparent;
		border: 1px solid var(--color-border-subtle);
		color: var(--color-fg-muted);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all var(--duration-fast) var(--ease-default);
	}
	.tips-btn:hover {
		color: var(--color-ember);
		border-color: var(--color-ember);
	}
	.tips-btn.active {
		background: rgba(255, 122, 26, 0.13);
		border-color: var(--color-ember);
		color: var(--color-ember);
	}
	.tips-tray {
		list-style: none;
		margin: 8px 0 0;
		padding: 10px 12px 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		background: var(--color-bg-surface-2);
		border: 1px solid var(--color-border-subtle);
		border-radius: 10px;
	}
	.tips-tray li {
		position: relative;
		padding: 0 0 0 12px;
		border: none;
		font-family: var(--font-body);
		font-size: 12px;
		line-height: 1.45;
		color: var(--color-fg-base);
	}
	.tips-tray li::before {
		content: '';
		position: absolute;
		left: 0;
		top: 6px;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--color-ember);
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
