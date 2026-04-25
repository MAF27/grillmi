<script lang="ts">
	interface Props {
		progress: number
		state: 'pending' | 'cooking' | 'resting' | 'ready' | 'plated'
		size?: number
		ariaLabel?: string
	}

	let { progress, state, size = 48, ariaLabel }: Props = $props()
	const stroke = 4
	const r = $derived((size - stroke) / 2)
	const c = $derived(2 * Math.PI * r)
	const offset = $derived(c * (1 - Math.max(0, Math.min(1, progress))))
</script>

<svg class="ring" width={size} height={size} aria-label={ariaLabel} role="img" data-state={state}>
	<circle cx={size / 2} cy={size / 2} {r} class="track" stroke-width={stroke} fill="none" />
	<circle
		cx={size / 2}
		cy={size / 2}
		{r}
		class="bar"
		stroke-width={stroke}
		fill="none"
		stroke-dasharray={c}
		stroke-dashoffset={offset}
		transform={`rotate(-90 ${size / 2} ${size / 2})`} />
</svg>

<style>
	.ring .track {
		stroke: var(--color-border-subtle);
	}
	.ring[data-state='pending'] .bar {
		stroke: var(--color-state-pending);
	}
	.ring[data-state='cooking'] .bar {
		stroke: var(--color-state-cooking);
	}
	.ring[data-state='resting'] .bar {
		stroke: var(--color-state-resting);
	}
	.ring[data-state='ready'] .bar {
		stroke: var(--color-state-ready);
	}
	.ring[data-state='plated'] .bar {
		stroke: var(--color-state-plated);
	}
</style>
