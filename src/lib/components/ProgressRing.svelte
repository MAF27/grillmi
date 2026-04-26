<script lang="ts">
	import type { Snippet } from 'svelte'

	interface Props {
		progress: number
		state: 'pending' | 'cooking' | 'resting' | 'ready' | 'plated' | 'flip' | 'unstarted'
		size?: number
		stroke?: number
		flipFraction?: number | null
		flipFired?: boolean
		ariaLabel?: string
		children?: Snippet
	}

	let { progress, state, size = 72, stroke = 6, flipFraction = null, flipFired = false, ariaLabel, children }: Props = $props()

	const r = $derived((size - stroke) / 2)
	const c = $derived(2 * Math.PI * r)
	const clampedProgress = $derived(Math.max(0, Math.min(1, progress)))
	const offset = $derived(c * (1 - clampedProgress))
	const markerAngle = $derived(flipFraction !== null ? flipFraction * 360 - 90 : null)
	const markerPos = $derived.by(() => {
		if (markerAngle === null) return null
		const rad = (markerAngle * Math.PI) / 180
		return { x: size / 2 + r * Math.cos(rad), y: size / 2 + r * Math.sin(rad) }
	})
</script>

<div class="wrap" style="width: {size}px; height: {size}px;">
	<svg class="ring" width={size} height={size} aria-label={ariaLabel} role="img" data-state={state}>
		<circle cx={size / 2} cy={size / 2} {r} class="track" stroke-width={stroke} fill="none" />
		{#if clampedProgress > 0}
			<circle
				cx={size / 2}
				cy={size / 2}
				{r}
				class="bar"
				stroke-width={stroke}
				fill="none"
				stroke-dasharray={c}
				stroke-dashoffset={offset}
				stroke-linecap="round"
				transform={`rotate(-90 ${size / 2} ${size / 2})`} />
		{/if}
		{#if markerPos}
			<circle
				cx={markerPos.x}
				cy={markerPos.y}
				r={Math.max(3, stroke - 1)}
				class="flip"
				class:fired={flipFired}
				fill={flipFired ? 'currentColor' : 'var(--color-bg-base)'}
				stroke-width="2" />
		{/if}
	</svg>
	{#if children}
		<div class="content">{@render children()}</div>
	{/if}
</div>

<style>
	.wrap {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.ring {
		display: block;
	}
	.content {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-direction: column;
	}
	.track {
		stroke: rgba(255, 255, 255, 0.08);
	}
	:global([data-theme='light']) .track {
		stroke: rgba(26, 20, 17, 0.1);
	}
	.bar {
		transition: stroke-dashoffset 0.4s var(--ease-out);
	}
	.ring[data-state='pending'] .bar {
		stroke: var(--color-state-pending);
	}
	.ring[data-state='unstarted'] .bar {
		stroke: var(--color-fg-muted);
	}
	.ring[data-state='cooking'] .bar,
	.ring[data-state='flip'] .bar {
		stroke: var(--color-ember);
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
	.flip {
		stroke: var(--color-ember);
		color: var(--color-ember);
	}
</style>
