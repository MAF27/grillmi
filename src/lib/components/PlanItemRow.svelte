<script lang="ts">
	import type { PlannedItem } from '$lib/models'
	import { formatDuration } from '$lib/util/format'

	interface Props {
		item: PlannedItem
		onedit: (id: string) => void
		ondelete: (id: string) => void
	}

	let { item, onedit, ondelete }: Props = $props()

	let touchStartX = 0
	let dragX = $state(0)
	let confirming = $state(false)

	function ontouchstart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX
	}
	function ontouchmove(e: TouchEvent) {
		const dx = e.touches[0].clientX - touchStartX
		dragX = Math.min(0, dx)
	}
	function ontouchend() {
		if (dragX < -80) {
			confirming = true
		} else {
			dragX = 0
		}
	}

	function confirmDelete() {
		ondelete(item.id)
	}
	function cancelDelete() {
		confirming = false
		dragX = 0
	}

	function describe(): string {
		const parts: string[] = []
		if (item.thicknessCm !== null) parts.push(`${item.thicknessCm} cm`)
		else if (item.prepLabel) parts.push(item.prepLabel)
		if (item.doneness) parts.push(item.doneness)
		return parts.join(' · ')
	}
</script>

<div class="row" role="listitem">
	<button
		class="content"
		style="transform: translateX({dragX}px)"
		{ontouchstart}
		{ontouchmove}
		{ontouchend}
		onclick={() => onedit(item.id)}
		aria-label={`Eintrag bearbeiten: ${item.label || item.cutSlug}`}>
		<div class="main">
			<div class="title">{item.label || item.cutSlug}</div>
			<div class="meta">{describe()}</div>
		</div>
		<div class="cook">{formatDuration(item.cookSeconds)}</div>
	</button>
	{#if confirming}
		<div class="confirm">
			<button class="del" onclick={confirmDelete} aria-label="Löschen bestätigen">Löschen</button>
			<button class="cancel" onclick={cancelDelete} aria-label="Abbrechen">×</button>
		</div>
	{/if}
</div>

<style>
	.row {
		position: relative;
		margin-bottom: var(--space-2);
		border-radius: var(--radius-lg);
		overflow: hidden;
		background: var(--color-error-default);
	}
	.content {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-4);
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-lg);
		width: 100%;
		text-align: left;
		font: inherit;
		color: inherit;
		cursor: pointer;
		transition: transform var(--duration-fast) var(--ease-default);
	}
	.main {
		flex: 1;
		min-width: 0;
	}
	.title {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
	}
	.meta {
		font-size: var(--font-size-sm);
		color: var(--color-fg-muted);
		margin-top: var(--space-1);
	}
	.cook {
		font-family: var(--font-mono);
		font-size: var(--font-size-lg);
		color: var(--color-fg-base);
	}
	.confirm {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-2);
		padding: var(--space-3);
	}
	.del {
		background: var(--color-error-default);
		color: var(--color-fg-on-status);
		border: none;
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-4);
		min-height: 44px;
	}
	.cancel {
		background: var(--color-bg-elevated);
		color: var(--color-fg-base);
		border: 1px solid var(--color-border-default);
		border-radius: var(--radius-md);
		min-width: 44px;
		min-height: 44px;
	}
</style>
