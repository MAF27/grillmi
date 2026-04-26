<script lang="ts">
	import type { SessionItem } from '$lib/models'
	import { formatDuration } from '$lib/util/format'
	import { onMount } from 'svelte'
	import ProgressRing from './ProgressRing.svelte'

	export type TimerCardStatus = 'unstarted' | 'pending' | 'cooking' | 'flip' | 'resting' | 'ready' | 'plated'

	interface Props {
		item: SessionItem
		alarmFiring?: boolean
		onplate?: (id: string) => void
		onstart?: (id: string) => void
		onlongpress?: (id: string) => void
		status?: TimerCardStatus
	}

	let { item, alarmFiring = false, onplate, onstart, onlongpress, status }: Props = $props()
	let now = $state(Date.now())
	let touchStartX = 0
	let dragX = $state(0)
	let pressTimer: ReturnType<typeof setTimeout> | null = null

	const cookTotalMs = $derived(item.doneEpoch - item.putOnEpoch)

	const effectiveStatus = $derived<TimerCardStatus>(status ?? deriveStatus())

	function deriveStatus(): TimerCardStatus {
		if (item.status === 'cooking' && item.flipEpoch !== null && Math.abs(now - item.flipEpoch) < 5000 && !item.flipFired) {
			return 'flip'
		}
		return item.status
	}

	const cookProgress = $derived.by(() => {
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
		plated: 'AUFGETRAGEN',
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
		if (effectiveStatus === 'unstarted') return 'DAUER'
		if (effectiveStatus === 'pending') return 'IN'
		if (effectiveStatus === 'cooking' || effectiveStatus === 'flip') return 'REST'
		if (effectiveStatus === 'resting') return 'RUHE'
		return null
	})

	onMount(() => {
		const id = setInterval(() => (now = Date.now()), 500)
		return () => clearInterval(id)
	})

	function ontouchstart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX
		pressTimer = setTimeout(() => {
			if (onlongpress) onlongpress(item.id)
			pressTimer = null
		}, 500)
	}
	function ontouchmove(e: TouchEvent) {
		if (pressTimer) {
			clearTimeout(pressTimer)
			pressTimer = null
		}
		const dx = e.touches[0].clientX - touchStartX
		if (effectiveStatus === 'ready') dragX = Math.max(0, dx)
	}
	function ontouchend() {
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
	data-state={effectiveStatus}
	class:alarm={alarmFiring}
	class:unstarted={effectiveStatus === 'unstarted'}
	style="transform: translateX({dragX}px)"
	{ontouchstart}
	{ontouchmove}
	{ontouchend}
	data-testid="timer-card"
	data-put-on-epoch={item.putOnEpoch}
	data-done-epoch={item.doneEpoch}>
	<div class="ring-wrap">
		<ProgressRing
			progress={cookProgress}
			state={effectiveStatus}
			size={92}
			stroke={6}
			flipFraction={item.flipEpoch !== null && cookTotalMs > 0 ? (item.flipEpoch - item.putOnEpoch) / cookTotalMs : null}
			flipFired={item.flipFired}
			ariaLabel={`${item.label}: ${Math.round(cookProgress * 100)}% gegart`}>
			<div class="ring-value" data-live-countdown>{ringValue}</div>
			{#if ringEyebrow}
				<div class="ring-eyebrow">{ringEyebrow}</div>
			{/if}
		</ProgressRing>
	</div>

	<div class="name">{item.label || item.cutSlug}</div>
	<div class="status-eyebrow" aria-live="polite">{labelMap[effectiveStatus]}</div>

	{#if effectiveStatus === 'unstarted' && onstart}
		<button class="action start" onclick={() => onstart!(item.id)}>Los</button>
	{:else if effectiveStatus === 'ready' && onplate}
		<button class="action plate" onclick={() => onplate!(item.id)}>Anrichten</button>
	{/if}
</article>

<style>
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 16px 14px;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: 18px;
		transition:
			transform var(--duration-fast) var(--ease-default),
			border-color var(--duration-normal) var(--ease-default),
			box-shadow var(--duration-normal) var(--ease-default);
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
		box-shadow: 0 0 0 4px rgba(255, 122, 26, 0.13);
	}
	.card[data-state='ready'] {
		color: var(--color-state-ready);
		box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.13);
	}
	.card.alarm {
		animation: card-alarm 1000ms var(--ease-linear) infinite;
	}
	@keyframes card-alarm {
		0%,
		100% {
			border-color: var(--color-ember);
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
	.ring-value {
		font-family: var(--font-display);
		font-size: 16px;
		font-weight: 700;
		color: var(--color-fg-base);
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.02em;
	}
	.card.unstarted .ring-value {
		color: var(--color-fg-muted);
	}
	.ring-eyebrow {
		margin-top: 2px;
		font-family: var(--font-body);
		font-size: 8px;
		font-weight: 600;
		letter-spacing: 0.12em;
		color: var(--color-fg-muted);
	}
	.name {
		font-family: var(--font-body);
		font-size: 14px;
		font-weight: 600;
		text-align: center;
		line-height: 1.2;
		color: var(--color-fg-base);
		margin-bottom: 4px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.status-eyebrow {
		font-family: var(--font-body);
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		text-align: center;
		color: var(--color-fg-muted);
	}
	.card[data-state='cooking'] .status-eyebrow,
	.card[data-state='flip'] .status-eyebrow {
		color: var(--color-ember);
	}
	.card[data-state='resting'] .status-eyebrow {
		color: var(--color-state-resting);
	}
	.card[data-state='ready'] .status-eyebrow {
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
