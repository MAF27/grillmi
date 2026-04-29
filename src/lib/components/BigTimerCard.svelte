<script lang="ts">
	import type { SessionItem } from '$lib/models'
	import { formatDuration } from '$lib/util/format'
	import { onMount } from 'svelte'
	import ProgressRing from './ProgressRing.svelte'
	import { settingsStore } from '$lib/stores/settingsStore.svelte'
	import type { TimerCardStatus } from './TimerCard.svelte'

	interface Props {
		item: SessionItem
		alarmFiring?: boolean
		onplate?: (id: string) => void
		onstart?: (id: string) => void
		onremove?: (id: string) => void
		status?: TimerCardStatus
	}

	let { item, alarmFiring = false, onplate, onstart, onremove, status }: Props = $props()
	let now = $state(Date.now())

	const baseStatus = $derived<TimerCardStatus>(status ?? item.status)
	const leadPutOnMs = $derived(settingsStore.leadPutOnSeconds * 1000)
	const inPutOnVorlauf = $derived(
		baseStatus === 'pending' && leadPutOnMs > 0 && now >= item.putOnEpoch - leadPutOnMs && now < item.putOnEpoch,
	)
	const effectiveStatus = $derived<TimerCardStatus>(baseStatus)
	const ringState = $derived<'pending' | 'put-on-soon' | 'cooking' | 'resting' | 'ready' | 'plated' | 'flip' | 'unstarted'>(
		inPutOnVorlauf ? 'put-on-soon' : effectiveStatus,
	)
	const total = $derived(item.doneEpoch - item.putOnEpoch)
	const progress = $derived.by(() => {
		if (inPutOnVorlauf) {
			return Math.min(1, Math.max(0, (now - (item.putOnEpoch - leadPutOnMs)) / leadPutOnMs))
		}
		if (effectiveStatus === 'pending' || effectiveStatus === 'unstarted') return 0
		if (effectiveStatus === 'ready' || effectiveStatus === 'plated') return 1
		if (effectiveStatus === 'resting') {
			const rest = item.restingUntilEpoch - item.doneEpoch
			return rest <= 0 ? 1 : Math.min(1, (now - item.doneEpoch) / rest)
		}
		return total <= 0 ? 1 : Math.min(1, (now - item.putOnEpoch) / total)
	})
	const value = $derived.by(() => {
		if (effectiveStatus === 'ready') return '✓'
		if (effectiveStatus === 'unstarted') return formatDuration(item.cookSeconds)
		if (effectiveStatus === 'pending') return formatDuration(Math.max(0, Math.round((item.putOnEpoch - now) / 1000)))
		if (effectiveStatus === 'resting') return formatDuration(Math.max(0, Math.round((item.restingUntilEpoch - now) / 1000)))
		return formatDuration(Math.max(0, Math.round((item.doneEpoch - now) / 1000)))
	})

	const ringEyebrow = $derived.by(() => {
		if (effectiveStatus === 'ready') return null
		if (effectiveStatus === 'unstarted') return 'DAUER'
		if (inPutOnVorlauf) return 'GLEICH AUFLEGEN'
		if (effectiveStatus === 'pending') return 'BIS START'
		if (effectiveStatus === 'flip') return 'WENDEN'
		if (effectiveStatus === 'resting') return 'RUHE'
		if (effectiveStatus === 'cooking') return progress < 0.5 && item.flipEpoch !== null ? 'BIS WENDEN' : 'BIS ENDE'
		if (effectiveStatus === 'plated') return 'ANGERICHTET'
		return null
	})

	const statusLabel: Record<TimerCardStatus, string> = {
		unstarted: 'BEREIT',
		pending: 'WARTET',
		cooking: 'GRILLT',
		flip: 'WENDEN!',
		resting: 'RUHT',
		ready: 'FERTIG',
		plated: 'ANGERICHTET',
	}

	const specLine = $derived.by(() => {
		if (item.thicknessCm !== null && item.doneness) return `${item.thicknessCm} cm · ${item.doneness}`
		if (item.thicknessCm !== null) return `${item.thicknessCm} cm`
		if (item.doneness) return item.doneness
		if (item.prepLabel && item.prepLabel !== '—' && item.prepLabel !== '-') return item.prepLabel
		return ''
	})

	onMount(() => {
		const id = setInterval(() => (now = Date.now()), 500)
		return () => clearInterval(id)
	})
</script>

<article class="big-card" data-state={effectiveStatus} class:alarm={alarmFiring} data-testid="big-timer-card">
	{#if onremove}
		<button
			class="remove"
			type="button"
			aria-label="Entfernen"
			onclick={e => {
				e.stopPropagation()
				onremove!(item.id)
			}}>×</button>
	{/if}
	<div class="ring-wrap">
		<ProgressRing {progress} state={ringState} size={132} stroke={7} ariaLabel={item.label || item.cutSlug}>
			<div class="ring-value" data-live-countdown>{value}</div>
			{#if ringEyebrow}
				<div class="ring-eyebrow">{ringEyebrow}</div>
			{/if}
		</ProgressRing>
	</div>
	<div class="name">{item.label || item.cutSlug}</div>
	{#if specLine}
		<div class="spec">{specLine}</div>
	{/if}
	<div class="status-badge">{statusLabel[effectiveStatus]}</div>
	{#if effectiveStatus === 'unstarted' && onstart}
		<button class="action start" type="button" onclick={() => onstart!(item.id)}>Los</button>
	{:else if effectiveStatus === 'ready' && onplate}
		<button class="action plate" type="button" onclick={() => onplate!(item.id)}>Anrichten</button>
	{/if}
</article>

<style>
	.big-card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 0;
		padding: 20px 18px 18px;
		border-radius: 16px;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		color: var(--color-fg-base);
		transition: border-color var(--duration-normal) var(--ease-default), box-shadow var(--duration-normal) var(--ease-default);
	}
	.remove {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 28px;
		height: 28px;
		padding: 0;
		border-radius: 14px;
		border: 1px solid var(--color-border-strong);
		background: var(--color-bg-surface-2);
		color: var(--color-fg-muted);
		font: inherit;
		font-size: 18px;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1;
	}
	.remove:hover {
		color: var(--color-fg-base);
		border-color: var(--color-error-default);
	}
	.big-card[data-state='flip'],
	.big-card[data-state='ready'] {
		border-color: currentColor;
	}
	.big-card[data-state='flip'] {
		color: var(--color-ember);
		box-shadow: 0 0 0 3px var(--color-accent-muted);
	}
	.big-card[data-state='ready'] {
		color: var(--color-state-ready);
		box-shadow: 0 0 0 3px var(--color-state-ready-bg);
	}
	.big-card.alarm {
		animation: big-alarm 1000ms var(--ease-linear) infinite;
	}
	@keyframes big-alarm {
		0%,
		100% {
			border-color: currentColor;
		}
		50% {
			border-color: var(--color-ember-dim);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.big-card.alarm {
			animation: none;
		}
	}
	.ring-wrap {
		display: flex;
		justify-content: center;
		margin-bottom: 14px;
	}
	.ring-value {
		font-family: var(--font-display);
		font-size: 30px;
		line-height: 0.9;
		font-weight: 600;
		letter-spacing: -0.02em;
		color: var(--color-fg-base);
		font-variant-numeric: tabular-nums;
	}
	.big-card[data-state='unstarted'] .ring-value,
	.big-card[data-state='plated'] .ring-value {
		color: var(--color-fg-muted);
	}
	.ring-eyebrow {
		margin-top: 4px;
		font-family: var(--font-body);
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.14em;
		color: var(--color-fg-muted);
		text-transform: uppercase;
	}
	.name {
		font-family: var(--font-body);
		font-size: 15px;
		font-weight: 600;
		line-height: 1.2;
		text-align: center;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-bottom: 4px;
	}
	.spec {
		font-family: var(--font-display);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		color: var(--color-fg-muted);
		text-align: center;
		margin-bottom: 8px;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.status-badge {
		font-family: var(--font-body);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		text-align: center;
		color: var(--color-fg-muted);
	}
	.big-card[data-state='cooking'] .status-badge,
	.big-card[data-state='flip'] .status-badge {
		color: var(--color-ember);
	}
	.big-card[data-state='resting'] .status-badge {
		color: var(--color-state-resting);
	}
	.big-card[data-state='ready'] .status-badge {
		color: var(--color-state-ready);
	}
	.action {
		margin-top: 12px;
		min-height: 36px;
		padding: 0 16px;
		border: none;
		border-radius: 10px;
		font: inherit;
		font-weight: 700;
		font-size: 13px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		cursor: pointer;
		transition: filter 0.15s ease;
	}
	.action:hover {
		filter: brightness(1.1);
	}
	.action.start {
		background: var(--color-ember);
		color: var(--color-ember-ink);
	}
	.action.plate {
		background: var(--color-state-ready);
		color: var(--color-bg-base);
		text-transform: none;
		letter-spacing: normal;
		font-weight: 600;
	}
</style>
