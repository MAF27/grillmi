<script lang="ts">
	import type { SessionItem } from '$lib/models'
	import { formatDuration } from '$lib/util/format'
	import { onMount } from 'svelte'
	import ProgressRing from './ProgressRing.svelte'
	import { settingsStore } from '$lib/stores/settingsStore.svelte'

	export type TimerCardStatus = 'unstarted' | 'pending' | 'cooking' | 'flip' | 'resting' | 'ready' | 'plated'
	export type TimerCardSize = 'sm' | 'lg'

	interface Props {
		item: SessionItem
		size?: TimerCardSize
		alarmFiring?: boolean
		onplate?: (id: string) => void
		onstart?: (id: string) => void
		onlongpress?: (id: string) => void
		onremove?: (id: string) => void
		status?: TimerCardStatus
	}

	let { item, size = 'sm', alarmFiring = false, onplate, onstart, onlongpress, onremove, status }: Props = $props()
	let now = $state(Date.now())
	let touchStartX = 0
	let dragX = $state(0)
	let pressTimer: ReturnType<typeof setTimeout> | null = null

	const ringSize = $derived(size === 'lg' ? 132 : 92)
	const ringStroke = $derived(size === 'lg' ? 7 : 6)

	const cookTotalMs = $derived(item.doneEpoch - item.putOnEpoch)

	const effectiveStatus = $derived<TimerCardStatus>(status ?? deriveStatus())

	function deriveStatus(): TimerCardStatus {
		if (item.status === 'cooking' && item.flipEpoch !== null && Math.abs(now - item.flipEpoch) < 5000 && !item.flipFired) {
			return 'flip'
		}
		return item.status
	}

	const leadPutOnMs = $derived(settingsStore.leadPutOnSeconds * 1000)
	const inPutOnVorlauf = $derived(
		effectiveStatus === 'pending' && leadPutOnMs > 0 && now >= item.putOnEpoch - leadPutOnMs && now < item.putOnEpoch,
	)
	const ringState = $derived<'pending' | 'put-on-soon' | 'cooking' | 'resting' | 'ready' | 'plated' | 'flip' | 'unstarted'>(
		inPutOnVorlauf ? 'put-on-soon' : effectiveStatus,
	)

	const cookProgress = $derived.by(() => {
		if (inPutOnVorlauf) {
			return Math.min(1, Math.max(0, (now - (item.putOnEpoch - leadPutOnMs)) / leadPutOnMs))
		}
		if (effectiveStatus === 'pending' || effectiveStatus === 'unstarted') return 0
		if (effectiveStatus === 'ready' || effectiveStatus === 'plated') return 1
		if (effectiveStatus === 'cooking' || effectiveStatus === 'flip') {
			if (cookTotalMs <= 0) return 1
			return Math.min(1, (now - item.putOnEpoch) / cookTotalMs)
		}
		if (effectiveStatus === 'resting') {
			const restTotal = item.restingUntilEpoch - item.doneEpoch
			if (restTotal <= 0) return 1
			return Math.min(1, (now - item.doneEpoch) / restTotal)
		}
		return 0
	})

	const labelMap: Record<TimerCardStatus, string> = {
		unstarted: 'BEREIT',
		pending: 'WARTET',
		cooking: 'GRILLT',
		flip: 'WENDEN!',
		resting: 'RUHT',
		ready: 'FERTIG',
		plated: 'ANGERICHTET',
	}

	const ringValue = $derived.by(() => {
		if (effectiveStatus === 'unstarted') return formatDuration(item.cookSeconds)
		if (effectiveStatus === 'ready') return '✓'
		if (effectiveStatus === 'pending') return formatDuration(Math.max(0, Math.round((item.putOnEpoch - now) / 1000)))
		if (effectiveStatus === 'cooking' || effectiveStatus === 'flip') {
			return formatDuration(Math.max(0, Math.round((item.doneEpoch - now) / 1000)))
		}
		if (effectiveStatus === 'resting') {
			return formatDuration(Math.max(0, Math.round((item.restingUntilEpoch - now) / 1000)))
		}
		return formatDuration(0)
	})

	const ringEyebrow = $derived.by(() => {
		if (effectiveStatus === 'ready') return null
		if (effectiveStatus === 'unstarted') return 'DAUER'
		if (inPutOnVorlauf) return 'GLEICH AUFLEGEN'
		if (effectiveStatus === 'pending') return 'BIS START'
		if (effectiveStatus === 'flip') return 'WENDEN'
		if (effectiveStatus === 'resting') return 'RUHE'
		if (effectiveStatus === 'cooking') {
			if (item.flipEpoch !== null && cookProgress < 0.5) return 'BIS WENDEN'
			return 'BIS ENDE'
		}
		if (effectiveStatus === 'plated') return 'ANGERICHTET'
		return null
	})

	const specLine = $derived.by(() => {
		if (item.thicknessCm !== null && item.doneness) return `${item.thicknessCm} cm · ${item.doneness}`
		if (item.thicknessCm !== null) return `${item.thicknessCm} cm`
		if (item.doneness) return item.doneness
		if (item.prepLabel && item.prepLabel !== '—' && item.prepLabel !== '-') return item.prepLabel
		return ''
	})

	const heatLine = $derived.by(() => {
		const parts: string[] = []
		if (item.grateTempC) parts.push(`${item.grateTempC} °C`)
		if (item.heatZone && item.heatZone !== '—' && item.heatZone !== '-') parts.push(item.heatZone)
		return parts.join(' · ')
	})

	onMount(() => {
		const id = setInterval(() => (now = Date.now()), 500)
		return () => clearInterval(id)
	})

	function ontouchstart(e: TouchEvent) {
		if (size !== 'sm') return
		touchStartX = e.touches[0].clientX
		pressTimer = setTimeout(() => {
			if (onlongpress) onlongpress(item.id)
			pressTimer = null
		}, 500)
	}
	function ontouchmove(e: TouchEvent) {
		if (size !== 'sm') return
		if (pressTimer) {
			clearTimeout(pressTimer)
			pressTimer = null
		}
		const dx = e.touches[0].clientX - touchStartX
		if (effectiveStatus === 'ready') dragX = Math.max(0, dx)
	}
	function ontouchend() {
		if (size !== 'sm') return
		if (pressTimer) {
			clearTimeout(pressTimer)
			pressTimer = null
		}
		if (effectiveStatus === 'ready' && dragX > 80 && onplate) onplate(item.id)
		dragX = 0
	}
</script>

<article
	class="card"
	data-size={size}
	data-state={effectiveStatus}
	class:alarm={alarmFiring}
	class:unstarted={effectiveStatus === 'unstarted'}
	style="transform: translateX({dragX}px)"
	{ontouchstart}
	{ontouchmove}
	{ontouchend}
	data-testid={size === 'lg' ? 'big-timer-card' : 'timer-card'}
	data-put-on-epoch={item.putOnEpoch}
	data-done-epoch={item.doneEpoch}>
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
		<ProgressRing
			progress={cookProgress}
			state={ringState}
			size={ringSize}
			stroke={ringStroke}
			ariaLabel={`${item.label || item.cutSlug}: ${Math.round(cookProgress * 100)}% gegart`}>
			<div class="ring-value" data-live-countdown>{ringValue}</div>
			{#if ringEyebrow}
				<div class="ring-eyebrow">{ringEyebrow}</div>
			{/if}
		</ProgressRing>
	</div>

	<div class="name">{item.label || item.cutSlug}</div>
	{#if specLine}
		<div class="spec">{specLine}</div>
	{/if}
	{#if heatLine}
		<div class="heat-meta">{heatLine}</div>
	{/if}
	<div class="status-badge" aria-live="polite">{labelMap[effectiveStatus]}</div>

	{#if effectiveStatus === 'unstarted' && onstart}
		<button class="action start" type="button" onclick={() => onstart!(item.id)}>Los</button>
	{:else if effectiveStatus === 'ready' && onplate}
		<button class="action plate" type="button" onclick={() => onplate!(item.id)}>Anrichten</button>
	{/if}
</article>

<style>
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 16px 14px;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: 18px;
		color: var(--color-fg-base);
		min-width: 0;
		transition:
			transform var(--duration-fast) var(--ease-default),
			border-color var(--duration-normal) var(--ease-default),
			box-shadow var(--duration-normal) var(--ease-default);
	}
	.card[data-size='lg'] {
		padding: 20px 18px 18px;
		border-radius: 16px;
	}
	.card.unstarted {
		opacity: 0.85;
	}
	.card[data-state='flip'],
	.card[data-state='ready'] {
		border-color: currentColor;
	}
	.card[data-state='flip'] {
		color: var(--color-ember);
		box-shadow: 0 0 0 4px var(--color-accent-muted);
	}
	.card[data-state='ready'] {
		color: var(--color-state-ready);
		box-shadow: 0 0 0 4px var(--color-state-ready-bg);
	}
	.card.alarm {
		animation: card-alarm 1000ms var(--ease-linear) infinite;
	}
	@keyframes card-alarm {
		0%,
		100% {
			border-color: currentColor;
		}
		50% {
			border-color: var(--color-ember-dim);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.card.alarm {
			animation: none;
		}
	}
	.ring-wrap {
		display: flex;
		justify-content: center;
		margin-bottom: 12px;
	}
	.card[data-size='lg'] .ring-wrap {
		margin-bottom: 14px;
	}
	.ring-value {
		font-family: var(--font-display);
		font-size: 16px;
		font-weight: 700;
		color: var(--color-fg-base);
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.02em;
		line-height: 1;
	}
	.card[data-size='lg'] .ring-value {
		font-size: 30px;
		font-weight: 600;
		line-height: 0.9;
	}
	.card.unstarted .ring-value {
		color: var(--color-fg-muted);
	}
	.ring-eyebrow {
		margin-top: 2px;
		font-family: var(--font-body);
		font-size: 8px;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: var(--color-fg-muted);
		text-transform: uppercase;
	}
	.card[data-size='lg'] .ring-eyebrow {
		margin-top: 4px;
		font-size: 9px;
		letter-spacing: 0.14em;
	}
	.name {
		font-family: var(--font-body);
		font-size: 14px;
		font-weight: 600;
		text-align: center;
		line-height: 1.2;
		color: var(--color-fg-base);
		margin-bottom: 4px;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.card[data-size='lg'] .name {
		font-size: 15px;
	}
	.spec {
		font-family: var(--font-display);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		color: var(--color-fg-muted);
		text-align: center;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-bottom: 4px;
	}
	.heat-meta {
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: 500;
		text-align: center;
		color: var(--color-fg-subtle);
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-bottom: 4px;
	}
	.status-badge {
		font-family: var(--font-body);
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		text-align: center;
		color: var(--color-fg-muted);
	}
	.card[data-size='lg'] .status-badge {
		font-size: 10px;
		letter-spacing: 0.16em;
	}
	.card[data-state='cooking'] .status-badge,
	.card[data-state='flip'] .status-badge {
		color: var(--color-ember);
	}
	.card[data-state='resting'] .status-badge {
		color: var(--color-state-resting);
	}
	.card[data-state='ready'] .status-badge {
		color: var(--color-state-ready);
	}
	.action {
		margin-top: 10px;
		min-height: 44px;
		padding: 12px;
		border: none;
		border-radius: 10px;
		font-family: var(--font-body);
		font-weight: 700;
		font-size: 14px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		cursor: pointer;
		transition: filter 0.15s ease;
	}
	.card[data-size='lg'] .action {
		margin-top: 12px;
		min-height: 36px;
		padding: 0 16px;
		font-size: 13px;
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
	.remove {
		position: absolute;
		top: 6px;
		right: 6px;
		width: 28px;
		height: 28px;
		padding: 0;
		border-radius: 14px;
		border: 1px solid var(--color-border-strong);
		background: var(--color-bg-surface-2);
		color: var(--color-fg-muted);
		font-family: var(--font-body);
		font-size: 18px;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1;
	}
	.card[data-size='lg'] .remove {
		top: 8px;
		right: 8px;
	}
	.remove:hover {
		color: var(--color-fg-base);
		border-color: var(--color-error-default);
	}
</style>
