<script lang="ts">
	import type { SessionItem } from '$lib/models'
	import { formatDuration } from '$lib/util/format'
	import { onMount } from 'svelte'
	import ProgressRing from './ProgressRing.svelte'
	import { settingsStore } from '$lib/stores/settingsStore.svelte'

	export type TimerCardStatus =
		| 'unstarted'
		| 'pending'
		| 'put-on-soon'
		| 'cooking'
		| 'flip'
		| 'resting'
		| 'ready'
		| 'plated'
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

	const baseStatus = $derived<TimerCardStatus>(status ?? deriveStatus())

	function deriveStatus(): TimerCardStatus {
		if (item.status === 'cooking' && item.flipEpoch !== null && Math.abs(now - item.flipEpoch) < 5000 && !item.flipFired) {
			return 'flip'
		}
		return item.status
	}

	const leadPutOnMs = $derived(settingsStore.leadPutOnSeconds * 1000)
	const putOnLeadStart = $derived(item.putOnEpoch - leadPutOnMs)
	const inPutOnVorlauf = $derived(
		baseStatus === 'pending' && leadPutOnMs > 0 && now >= putOnLeadStart && now < item.putOnEpoch,
	)
	const effectiveStatus = $derived<TimerCardStatus>(inPutOnVorlauf ? 'put-on-soon' : baseStatus)
	const ringState = $derived<'pending' | 'put-on-soon' | 'cooking' | 'resting' | 'ready' | 'plated' | 'flip' | 'unstarted'>(
		effectiveStatus,
	)

	const cookProgress = $derived.by(() => {
		if (effectiveStatus === 'put-on-soon') {
			return Math.min(1, Math.max(0, (now - putOnLeadStart) / leadPutOnMs))
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
		'put-on-soon': 'AUFLEGEN',
		cooking: 'GRILLT',
		flip: 'WENDEN!',
		resting: 'RUHT',
		ready: 'FERTIG',
		plated: 'ANGERICHTET',
	}

	const ringValue = $derived.by(() => {
		if (effectiveStatus === 'unstarted') return formatDuration(item.cookSeconds)
		if (effectiveStatus === 'ready') return '✓'
		if (effectiveStatus === 'put-on-soon') return formatDuration(Math.max(0, Math.round((item.putOnEpoch - now) / 1000)))
		if (effectiveStatus === 'pending') {
			const targetEpoch = leadPutOnMs > 0 ? putOnLeadStart : item.putOnEpoch
			return formatDuration(Math.max(0, Math.round((targetEpoch - now) / 1000)))
		}
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
		if (effectiveStatus === 'put-on-soon') return 'AUFLEGEN IN'
		if (effectiveStatus === 'pending') return leadPutOnMs > 0 ? 'BIS VORLAUF' : 'BIS START'
		if (effectiveStatus === 'flip') return 'WENDEN'
		if (effectiveStatus === 'resting') return 'RUHE'
		if (effectiveStatus === 'cooking') {
			if (item.flipEpoch !== null && cookProgress < 0.5) return 'BIS WENDEN'
			return 'BIS ENDE'
		}
		if (effectiveStatus === 'plated') return 'ANGERICHTET'
		return null
	})

	const metaLine = $derived.by(() => {
		const parts: string[] = []
		if (item.thicknessCm !== null) parts.push(`${item.thicknessCm} cm`)
		else if (item.prepLabel && item.prepLabel !== '—' && item.prepLabel !== '-') parts.push(item.prepLabel)
		if (item.doneness) parts.push(item.doneness)
		if (item.grateTempC) parts.push(`${item.grateTempC} °C`)
		return parts.join(' · ')
	})
	const title = $derived(displayTitle())

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

	function displayTitle(): string {
		const fallback = item.label || item.cutSlug
		if (!item.label) return fallback
		let next = item.label.trim()
		if (item.doneness) next = next.replace(new RegExp(`,?\\s*${escapeRegExp(item.doneness)}$`, 'i'), '').trim()
		if (item.thicknessCm !== null) {
			const thickness = `${item.thicknessCm}`.replace('.', '[.,]')
			next = next.replace(new RegExp(`\\s+${thickness}\\s*cm$`, 'i'), '').trim()
		}
		if (item.prepLabel && item.prepLabel !== '—' && item.prepLabel !== '-') {
			next = next.replace(new RegExp(`,?\\s*${escapeRegExp(item.prepLabel)}$`, 'i'), '').trim()
		}
		return next || fallback
	}

	function escapeRegExp(value: string): string {
		return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

	<div class="name">{title}</div>
	<div class="meta" class:empty={!metaLine} aria-hidden={!metaLine}>{metaLine || '\u00a0'}</div>
	<div class="status-slot">
		<div class="status-badge" aria-live="polite">{labelMap[effectiveStatus]}</div>

		{#if effectiveStatus === 'unstarted' && onstart}
			<button class="action start" type="button" onclick={() => onstart!(item.id)}>Los</button>
		{:else if effectiveStatus === 'ready' && onplate}
			<button class="action plate" type="button" onclick={() => onplate!(item.id)}>Anrichten</button>
		{/if}
	</div>
</article>

<style>
	.card {
		position: relative;
		display: grid;
		grid-template-rows: 94px 27px 16px 26px;
		align-items: center;
		gap: 3px;
		padding: 12px 14px;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: 18px;
		color: var(--color-fg-base);
		height: 194px;
		min-width: 0;
		overflow: hidden;
		transition:
			transform var(--duration-fast) var(--ease-default),
			border-color var(--duration-normal) var(--ease-default);
	}
	.card[data-size='lg'] {
		grid-template-rows: 134px 31px 18px 30px;
		height: 241px;
		padding: 14px 18px 14px;
		border-radius: 16px;
	}
	.card:has(.action) {
		grid-template-rows: 94px 27px 16px 62px;
		height: 230px;
	}
	.card[data-size='lg']:has(.action) {
		grid-template-rows: 134px 31px 18px 72px;
		height: 283px;
	}
	.card.unstarted {
		opacity: 0.85;
	}
	.card[data-state='cooking'],
	.card[data-state='flip'],
	.card[data-state='put-on-soon'],
	.card[data-state='resting'],
	.card[data-state='ready'] {
		border-color: currentColor;
	}
	.card[data-state='put-on-soon'] {
		color: var(--color-state-resting);
	}
	.card[data-state='cooking'],
	.card[data-state='flip'] {
		color: var(--color-ember);
	}
	.card[data-state='resting'] {
		color: var(--color-state-resting);
	}
	.card[data-state='ready'] {
		color: var(--color-state-ready);
	}
	.ring-wrap {
		display: flex;
		justify-content: center;
		align-self: start;
		min-width: 0;
	}
	.card[data-size='lg'] .ring-wrap {
		align-self: start;
	}
	.ring-value {
		font-family: var(--font-display);
		font-size: 16px;
		font-weight: 700;
		color: var(--color-fg-base);
		font-variant-numeric: tabular-nums;
		letter-spacing: 0;
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
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		font-family: var(--font-body);
		font-size: 14px;
		font-weight: 600;
		text-align: center;
		line-height: 1.2;
		color: var(--color-fg-base);
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: normal;
	}
	.card[data-size='lg'] .name {
		font-size: 15px;
	}
	.meta {
		font-family: var(--font-body);
		font-size: 12px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--color-fg-subtle);
		text-align: center;
		max-width: 100%;
		min-height: 16px;
		line-height: 1.25;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta.empty {
		visibility: hidden;
	}
	.status-slot {
		align-self: stretch;
		display: grid;
		grid-template-rows: 16px;
		align-items: end;
		padding-top: 10px;
		width: 100%;
		min-width: 0;
	}
	.card:has(.action) .status-slot {
		grid-template-rows: 16px 1fr;
		gap: 6px;
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
	.card[data-state='put-on-soon'] .status-badge {
		color: var(--color-state-resting);
	}
	.card[data-state='resting'] .status-badge {
		color: var(--color-state-resting);
	}
	.card[data-state='ready'] .status-badge {
		color: var(--color-state-ready);
	}
	.action {
		height: 38px;
		padding: 0 16px;
		border: none;
		border-radius: 10px;
		font-family: var(--font-body);
		font-weight: 700;
		font-size: 14px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		cursor: pointer;
		transition: filter 0.15s ease;
		align-self: start;
		width: 100%;
	}
	.card[data-size='lg'] .action {
		justify-self: center;
		width: auto;
		min-width: min(180px, 100%);
		height: 36px;
		padding: 0 24px;
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
	@media (max-width: 767px) {
		.card:has(.action) {
			grid-template-rows: 94px 27px 16px 62px;
		}
		.card[data-size='lg']:has(.action) {
			grid-template-rows: 134px 31px 18px 72px;
		}
		.card:has(.action) .status-slot {
			grid-template-rows: 16px 32px;
			align-content: start;
		}
		.card[data-size='lg']:has(.action) .status-slot {
			grid-template-rows: 16px 34px;
		}
		.card:has(.action) .action {
			height: 32px;
		}
		.card[data-size='lg']:has(.action) .action {
			height: 34px;
		}
	}
</style>
