<script lang="ts">
	import type { SessionItem } from '$lib/models'
	import { formatDuration } from '$lib/util/format'
	import { onMount } from 'svelte'
	import ProgressRing from './ProgressRing.svelte'

	interface Props {
		item: SessionItem
		alarmFiring: boolean
		onplate: (id: string) => void
		onlongpress: (id: string) => void
	}

	let { item, alarmFiring, onplate, onlongpress }: Props = $props()
	let now = $state(Date.now())
	let touchStartX = 0
	let dragX = $state(0)
	let pressTimer: ReturnType<typeof setTimeout> | null = null

	const cookTotalMs = $derived(item.doneEpoch - item.putOnEpoch)
	const cookProgress = $derived.by(() => {
		if (item.status === 'pending') return 0
		if (item.status === 'cooking') return Math.min(1, (now - item.putOnEpoch) / cookTotalMs)
		return 1
	})
	const nextEventLabel = $derived.by(() => {
		const t = now
		if (item.status === 'pending') {
			const sec = Math.max(0, Math.round((item.putOnEpoch - t) / 1000))
			return `Auflegen in ${formatDuration(sec)}`
		}
		if (item.status === 'cooking') {
			if (item.flipEpoch !== null && !item.flipFired && t < item.flipEpoch) {
				const sec = Math.max(0, Math.round((item.flipEpoch - t) / 1000))
				return `Wenden in ${formatDuration(sec)}`
			}
			const sec = Math.max(0, Math.round((item.doneEpoch - t) / 1000))
			return `Fertig in ${formatDuration(sec)}${item.overdue ? ' — spät gestartet' : ''}`
		}
		if (item.status === 'resting') {
			const sec = Math.max(0, Math.round((item.restingUntilEpoch - t) / 1000))
			return `Ruht noch ${formatDuration(sec)}`
		}
		if (item.status === 'ready') return 'Bereit zum Auftragen'
		return 'Aufgetragen'
	})

	const stateLabel = $derived.by(() => {
		switch (item.status) {
			case 'pending':
				return 'Wartet'
			case 'cooking':
				return 'Kocht'
			case 'resting':
				return 'Ruht'
			case 'ready':
				return 'Bereit'
			case 'plated':
				return 'Aufgetragen'
		}
	})

	onMount(() => {
		const id = setInterval(() => (now = Date.now()), 500)
		return () => clearInterval(id)
	})

	function ontouchstart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX
		pressTimer = setTimeout(() => {
			onlongpress(item.id)
			pressTimer = null
		}, 500)
	}
	function ontouchmove(e: TouchEvent) {
		if (pressTimer) {
			clearTimeout(pressTimer)
			pressTimer = null
		}
		const dx = e.touches[0].clientX - touchStartX
		if (item.status === 'ready') dragX = Math.max(0, dx)
	}
	function ontouchend() {
		if (pressTimer) {
			clearTimeout(pressTimer)
			pressTimer = null
		}
		if (item.status === 'ready' && dragX > 80) {
			onplate(item.id)
		}
		dragX = 0
	}
</script>

<article
	class="card"
	data-state={item.status}
	class:alarm={alarmFiring}
	style="transform: translateX({dragX}px)"
	{ontouchstart}
	{ontouchmove}
	{ontouchend}
	data-testid="timer-card"
	data-put-on-epoch={item.putOnEpoch}
	data-done-epoch={item.doneEpoch}>
	<span class="stripe" aria-hidden="true"></span>
	<div class="head">
		<div class="title">
			<span class="label">{item.label || item.cutSlug}</span>
			<span class="meta">
				{item.thicknessCm ? `${item.thicknessCm} cm` : (item.prepLabel ?? '')}
				{#if item.doneness}
					· {item.doneness}{/if}
			</span>
		</div>
		<ProgressRing
			progress={cookProgress}
			state={item.status}
			ariaLabel={`${item.label}: ${Math.round(cookProgress * 100)}% gegart`} />
	</div>
	<div class="body">
		<div class="state-label" aria-live="polite">{stateLabel}</div>
		<div class="next">{nextEventLabel}</div>
	</div>
</article>

<style>
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4) var(--space-3) var(--space-5);
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-lg);
		min-height: 112px;
		overflow: hidden;
		transition:
			transform var(--duration-fast) var(--ease-default),
			background-color var(--duration-normal) var(--ease-default);
	}
	.stripe {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 4px;
		transition: background-color var(--duration-normal) var(--ease-default);
	}
	.card[data-state='pending'] .stripe {
		background: var(--color-state-pending);
	}
	.card[data-state='cooking'] .stripe {
		background: var(--color-state-cooking);
	}
	.card[data-state='resting'] .stripe {
		background: var(--color-state-resting);
	}
	.card[data-state='ready'] .stripe {
		background: var(--color-state-ready);
		box-shadow: var(--shadow-glow-ready);
	}
	.card[data-state='plated'] .stripe {
		background: var(--color-state-plated);
	}
	.card[data-state='cooking'] {
		background: var(--color-state-cooking-bg);
	}
	.card[data-state='resting'] {
		background: var(--color-state-resting-bg);
	}
	.card[data-state='ready'] {
		background: var(--color-state-ready-bg);
	}
	.card.alarm {
		animation: pulse 1000ms var(--ease-linear) infinite;
	}
	@keyframes pulse {
		0%,
		100% {
			border-color: var(--color-state-cooking);
		}
		50% {
			border-color: var(--color-accent-default);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.card.alarm {
			animation: none;
		}
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.title {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.label {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
	}
	.meta {
		font-size: var(--font-size-sm);
		color: var(--color-fg-muted);
	}
	.body {
		display: flex;
		justify-content: space-between;
		align-items: end;
		gap: var(--space-3);
	}
	.state-label {
		font-size: var(--font-size-xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-widest);
		color: var(--color-fg-muted);
	}
	.card[data-state='cooking'] .state-label {
		color: var(--color-state-cooking);
	}
	.card[data-state='resting'] .state-label {
		color: var(--color-state-resting);
	}
	.card[data-state='ready'] .state-label {
		color: var(--color-state-ready);
	}
	.next {
		font-family: var(--font-mono);
		font-size: var(--font-size-md);
	}
</style>
