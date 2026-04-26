<script lang="ts">
	import { formatDuration } from '$lib/util/format'
	import { onMount } from 'svelte'

	interface Props {
		targetEpoch: number
	}

	let { targetEpoch }: Props = $props()
	let now = $state(Date.now())
	const remaining = $derived(Math.max(0, Math.round((targetEpoch - now) / 1000)))

	onMount(() => {
		const id = setInterval(() => (now = Date.now()), 1000)
		return () => clearInterval(id)
	})
</script>

<div class="clock" aria-live="off">
	<div class="eyebrow">Bis zum Essen</div>
	<div class="time" data-testid="master-clock-time" data-live-countdown>{formatDuration(remaining)}</div>
</div>

<style>
	.clock {
		padding: 12px 20px 24px;
		text-align: center;
	}
	.eyebrow {
		font-family: var(--font-body);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-fg-muted);
		margin-bottom: 4px;
	}
	.time {
		font-family: var(--font-display);
		font-size: 56px;
		font-weight: 700;
		line-height: 1;
		color: var(--color-fg-base);
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
	}
</style>
