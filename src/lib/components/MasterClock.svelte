<script lang="ts">
	import { formatDuration, formatHHMM } from '$lib/util/format'
	import { onMount } from 'svelte'

	interface Props {
		targetEpoch: number
	}

	let { targetEpoch }: Props = $props()
	let now = $state(Date.now())
	const remaining = $derived(Math.max(0, Math.round((targetEpoch - now) / 1000)))
	const warning = $derived(remaining <= 15 * 60 && remaining > 5 * 60)
	const critical = $derived(remaining <= 5 * 60 && remaining > 0)
	const done = $derived(remaining === 0)

	onMount(() => {
		const id = setInterval(() => (now = Date.now()), 1000)
		return () => clearInterval(id)
	})
</script>

<div class="clock" class:warning class:critical class:done aria-live="off">
	<div class="time" data-testid="master-clock-time">{formatDuration(remaining)}</div>
	<div class="meta">Essen um {formatHHMM(targetEpoch)}</div>
</div>

<style>
	.clock {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-3) var(--space-4);
		min-height: 72px;
		background: var(--color-bg-surface);
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.time {
		font-family: var(--font-mono);
		font-size: var(--font-size-3xl);
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.meta {
		font-size: var(--font-size-xs);
		color: var(--color-fg-muted);
		text-transform: uppercase;
		letter-spacing: var(--tracking-widest);
		margin-top: var(--space-1);
	}
	.warning {
		background: var(--color-state-cooking-bg);
	}
	.warning .time {
		color: var(--color-warning-default);
	}
	.critical {
		background: var(--color-error-bg);
	}
	.critical .time {
		color: var(--color-error-default);
	}
	.done .time {
		color: var(--color-success-default);
	}
</style>
