<script lang="ts">
	import { onMount, tick } from 'svelte'

	interface Props {
		value: number
		oncommit: (epoch: number) => void
		oncancel: () => void
	}

	let { value, oncommit, oncancel }: Props = $props()

	const HOURS = Array.from({ length: 24 }, (_, i) => i)
	const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)

	const initialHours = (() => {
		const d = new Date(value)
		return d.getHours()
	})()
	const initialMinutes = (() => {
		const d = new Date(value)
		return (Math.round(d.getMinutes() / 5) * 5) % 60
	})()
	let selectedH = $state(initialHours)
	let selectedM = $state(initialMinutes)

	let hourEl: HTMLDivElement | null = $state(null)
	let minuteEl: HTMLDivElement | null = $state(null)
	const ROW_H = 56

	function pad2(n: number) {
		return n.toString().padStart(2, '0')
	}

	async function scrollToInitial() {
		await tick()
		if (hourEl) hourEl.scrollTop = HOURS.indexOf(selectedH) * ROW_H
		if (minuteEl) minuteEl.scrollTop = MINUTES.indexOf(selectedM) * ROW_H
	}

	onMount(() => {
		void scrollToInitial()
	})

	let scrollRafH: number | null = null
	let scrollRafM: number | null = null

	function onScrollHour() {
		if (!hourEl) return
		if (scrollRafH !== null) cancelAnimationFrame(scrollRafH)
		scrollRafH = requestAnimationFrame(() => {
			if (!hourEl) return
			const idx = Math.round(hourEl.scrollTop / ROW_H)
			selectedH = HOURS[Math.max(0, Math.min(HOURS.length - 1, idx))]
		})
	}

	function onScrollMinute() {
		if (!minuteEl) return
		if (scrollRafM !== null) cancelAnimationFrame(scrollRafM)
		scrollRafM = requestAnimationFrame(() => {
			if (!minuteEl) return
			const idx = Math.round(minuteEl.scrollTop / ROW_H)
			selectedM = MINUTES[Math.max(0, Math.min(MINUTES.length - 1, idx))]
		})
	}

	function commit() {
		const now = new Date()
		const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), selectedH, selectedM, 0, 0)
		if (target.getTime() < now.getTime()) target.setDate(target.getDate() + 1)
		oncommit(target.getTime())
	}
</script>

<div class="scrim" role="presentation" onclick={oncancel}></div>
<div class="sheet" role="dialog" aria-modal="true" aria-label="Essen um">
	<div class="handle" aria-hidden="true"></div>
	<header>
		<div class="title">Essen um</div>
	</header>

	<div class="columns" aria-label="Zielzeit auswählen">
		<div class="column" bind:this={hourEl} onscroll={onScrollHour} role="listbox" aria-label="Stunde">
			<div class="spacer"></div>
			{#each HOURS as h (h)}
				<div class="row" class:selected={h === selectedH} role="option" aria-selected={h === selectedH}>
					{pad2(h)}
				</div>
			{/each}
			<div class="spacer"></div>
		</div>
		<div class="separator">:</div>
		<div class="column" bind:this={minuteEl} onscroll={onScrollMinute} role="listbox" aria-label="Minute">
			<div class="spacer"></div>
			{#each MINUTES as m (m)}
				<div class="row" class:selected={m === selectedM} role="option" aria-selected={m === selectedM}>
					{pad2(m)}
				</div>
			{/each}
			<div class="spacer"></div>
		</div>
		<div class="rail" aria-hidden="true"></div>
	</div>

	<footer>
		<button type="button" class="ghost" onclick={oncancel}>Abbrechen</button>
		<button type="button" class="primary" onclick={commit}>Übernehmen</button>
	</footer>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: var(--color-bg-overlay);
		backdrop-filter: blur(4px);
		z-index: var(--z-modal);
	}
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		background: var(--color-bg-surface);
		border-top-left-radius: 24px;
		border-top-right-radius: 24px;
		padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
		z-index: calc(var(--z-modal) + 1);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		max-width: 600px;
		margin: 0 auto;
		box-shadow: var(--shadow-lg);
		animation: sheet-in 0.3s cubic-bezier(0.2, 0.7, 0.3, 1);
	}
	@keyframes sheet-in {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}
	.handle {
		height: 4px;
		width: 36px;
		background: var(--color-border-strong);
		border-radius: 2px;
		margin: 10px auto 6px;
	}
	header {
		padding: 8px 16px 14px;
		border-bottom: 1px solid var(--color-border-subtle);
		text-align: center;
	}
	.title {
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.01em;
	}
	.columns {
		position: relative;
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 8px;
		padding: 12px 24px;
	}
	.column {
		height: 224px;
		overflow-y: auto;
		scroll-snap-type: y mandatory;
		scrollbar-width: none;
	}
	.column::-webkit-scrollbar {
		display: none;
	}
	.spacer {
		height: 84px;
	}
	.row {
		height: 56px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-display);
		font-size: 44px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.02em;
		color: var(--color-fg-muted);
		scroll-snap-align: center;
		transition: color 0.15s ease;
	}
	.row.selected {
		color: var(--color-fg-base);
	}
	.separator {
		font-family: var(--font-display);
		font-size: 36px;
		font-weight: 600;
		color: var(--color-ember);
		padding-bottom: 4px;
	}
	.rail {
		position: absolute;
		left: 24px;
		right: 24px;
		top: 50%;
		height: 2px;
		transform: translateY(-1px);
		background: linear-gradient(90deg, transparent, var(--color-ember) 20%, var(--color-ember) 80%, transparent);
		opacity: 0.5;
		pointer-events: none;
	}
	footer {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		padding: 0 16px 8px;
	}
	footer button {
		min-height: 48px;
		border-radius: 14px;
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 15px;
		cursor: pointer;
		border: 1px solid transparent;
		transition: all 0.15s ease;
	}
	footer .ghost {
		background: transparent;
		color: var(--color-fg-base);
		border-color: var(--color-border-strong);
	}
	footer .primary {
		background: var(--color-ember);
		color: var(--color-ember-ink);
	}
</style>
