<script lang="ts">
	interface Props {
		progress: number
		state: 'pending' | 'cooking' | 'resting' | 'ready' | 'plated'
		size?: number
		flipFraction?: number | null
		flipFired?: boolean
		ariaLabel?: string
	}

	let { progress, state, size = 56, flipFraction = null, flipFired = false, ariaLabel }: Props = $props()
	const stroke = 5
	const r = $derived((size - stroke) / 2)
	const c = $derived(2 * Math.PI * r)
	const clampedProgress = $derived(Math.max(0, Math.min(1, progress)))
	const offset = $derived(c * (1 - clampedProgress))
	// Wendepunkt marker position. Ring starts at 12 o'clock (we rotate the
	// circle -90°) and runs clockwise. The marker is a small dot on the track.
	const markerAngle = $derived(flipFraction !== null ? flipFraction * 360 - 90 : null)
	const markerPos = $derived.by(() => {
		if (markerAngle === null) return null
		const rad = (markerAngle * Math.PI) / 180
		return {
			x: size / 2 + r * Math.cos(rad),
			y: size / 2 + r * Math.sin(rad),
		}
	})
</script>

<svg class="ring" width={size} height={size} aria-label={ariaLabel} role="img" data-state={state}>
	<!-- Always-visible empty track so the ring is recognisable when nothing has started yet -->
	<circle cx={size / 2} cy={size / 2} {r} class="track" stroke-width={stroke} fill="none" />
	<!-- Filled progress arc on top -->
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
	<!-- Wendepunkt: dot at the flip moment, hollow before, filled when fired -->
	{#if markerPos}
		<circle
			cx={markerPos.x}
			cy={markerPos.y}
			r={stroke}
			class="flip"
			class:fired={flipFired}
			fill={flipFired ? 'currentColor' : 'var(--color-bg-base)'}
			stroke-width="2" />
	{/if}
</svg>

<style>
	.ring {
		display: block;
	}
	.track {
		stroke: var(--color-border-default);
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
	.flip {
		stroke: var(--color-state-cooking);
		color: var(--color-state-cooking);
	}
	.flip.fired {
		stroke: var(--color-state-cooking);
	}
</style>
