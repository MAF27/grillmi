<script lang="ts">
	import type { SessionItem } from '$lib/models'
	import { formatDuration } from '$lib/util/format'
	import { onMount } from 'svelte'
	import ProgressRing from './ProgressRing.svelte'
	import type { TimerCardStatus } from './TimerCard.svelte'

	interface Props {
		item: SessionItem
		alarmFiring?: boolean
		onplate?: (id: string) => void
		onstart?: (id: string) => void
		status?: TimerCardStatus
	}

	let { item, alarmFiring = false, onplate, onstart, status }: Props = $props()
	let now = $state(Date.now())

	const effectiveStatus = $derived<TimerCardStatus>(status ?? item.status)
	const total = $derived(item.doneEpoch - item.putOnEpoch)
	const progress = $derived.by(() => {
		if (effectiveStatus === 'pending' || effectiveStatus === 'unstarted') return 0
		if (effectiveStatus === 'ready' || effectiveStatus === 'plated') return 1
		if (effectiveStatus === 'resting') {
			const rest = item.restingUntilEpoch - item.doneEpoch
			return rest <= 0 ? 1 : Math.min(1, (now - item.doneEpoch) / rest)
		}
		return total <= 0 ? 1 : Math.min(1, (now - item.putOnEpoch) / total)
	})
	const value = $derived.by(() => {
		if (effectiveStatus === 'ready') return 'OK'
		if (effectiveStatus === 'unstarted') return formatDuration(item.cookSeconds)
		if (effectiveStatus === 'pending') return formatDuration(Math.max(0, Math.round((item.putOnEpoch - now) / 1000)))
		if (effectiveStatus === 'resting') return formatDuration(Math.max(0, Math.round((item.restingUntilEpoch - now) / 1000)))
		return formatDuration(Math.max(0, Math.round((item.doneEpoch - now) / 1000)))
	})

	onMount(() => {
		const id = setInterval(() => (now = Date.now()), 500)
		return () => clearInterval(id)
	})
</script>

<article class="big-card" data-state={effectiveStatus} class:alarm={alarmFiring} data-testid="big-timer-card">
	<ProgressRing progress={progress} state={effectiveStatus} size={132} stroke={7} ariaLabel={item.label || item.cutSlug}>
		<div class="ring-value" data-live-countdown>{value}</div>
		<div class="ring-label">{effectiveStatus === 'unstarted' ? 'DAUER' : effectiveStatus === 'resting' ? 'RUHE' : 'REST'}</div>
	</ProgressRing>
	<div class="body">
		<h3>{item.label || item.cutSlug}</h3>
		<p>{item.heatZone || 'Grillzone'}{#if item.grateTempC} · {item.grateTempC}&deg;C{/if}</p>
	</div>
	{#if effectiveStatus === 'unstarted' && onstart}
		<button type="button" onclick={() => onstart!(item.id)}>Los</button>
	{:else if effectiveStatus === 'ready' && onplate}
		<button type="button" onclick={() => onplate!(item.id)}>Anrichten</button>
	{/if}
</article>

<style>
	.big-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		min-width: 0;
		padding: 22px 20px;
		border-radius: 16px;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		color: var(--color-fg-base);
	}
	.big-card.alarm {
		border-color: var(--color-ember);
		box-shadow: 0 0 0 4px rgba(255, 122, 26, 0.14);
	}
	.ring-value {
		font-family: var(--font-display);
		font-size: 26px;
		font-weight: 700;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.ring-label {
		margin-top: 3px;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: var(--color-fg-muted);
	}
	.body {
		min-width: 0;
		text-align: center;
	}
	h3 {
		margin: 0;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--font-body);
		font-size: 16px;
		font-weight: 700;
	}
	p {
		margin: 6px 0 0;
		color: var(--color-fg-muted);
		font-size: 12px;
	}
	button {
		min-height: 36px;
		padding: 0 14px;
		border: 1px solid var(--color-border-strong);
		border-radius: 10px;
		background: transparent;
		color: var(--color-fg-base);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}
</style>
