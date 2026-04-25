<script lang="ts">
	interface Props {
		state: 'pending' | 'cooking' | 'resting' | 'ready' | 'plated'
		count: number
		expanded: boolean
		ontoggle: () => void
	}

	let { state, count, expanded, ontoggle }: Props = $props()

	const labels: Record<string, string> = {
		pending: 'Wartet',
		cooking: 'Kocht',
		resting: 'Ruht',
		ready: 'Bereit',
		plated: 'Aufgetragen',
	}
</script>

<button class="header" data-state={state} onclick={ontoggle} aria-expanded={expanded}>
	<span class="label">{labels[state]}</span>
	<span class="count">{count}</span>
	<span class="chev" class:expanded>▾</span>
</button>

<style>
	.header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		background: transparent;
		border: none;
		color: var(--color-fg-muted);
		text-transform: uppercase;
		letter-spacing: var(--tracking-widest);
		font-size: var(--font-size-xs);
		cursor: pointer;
		width: 100%;
	}
	.header[data-state='cooking'] {
		color: var(--color-state-cooking);
	}
	.header[data-state='resting'] {
		color: var(--color-state-resting);
	}
	.header[data-state='ready'] {
		color: var(--color-state-ready);
	}
	.label {
		flex: 1;
		text-align: left;
	}
	.count {
		background: var(--color-bg-surface);
		border-radius: var(--radius-full);
		padding: 0 var(--space-2);
		min-width: 20px;
		text-align: center;
	}
	.chev {
		transition: transform var(--duration-normal) var(--ease-default);
	}
	.chev.expanded {
		transform: rotate(180deg);
	}
</style>
