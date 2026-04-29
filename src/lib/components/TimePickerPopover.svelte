<script lang="ts">
	import { onMount } from 'svelte'
	import { formatHHMM } from '$lib/util/format'

	interface Props {
		value: number
		onConfirm: (epoch: number) => void
		onCancel: () => void
	}

	let { value, onConfirm, onCancel }: Props = $props()
	let hour = $state(0)
	let minute = $state(0)

	const hours = Array.from({ length: 24 }, (_, i) => i)
	const minutes = Array.from({ length: 12 }, (_, i) => i * 5)

	function confirm() {
		const next = new Date(value)
		next.setHours(hour, minute, 0, 0)
		if (next.getTime() < Date.now()) next.setDate(next.getDate() + 1)
		onConfirm(next.getTime())
	}

	onMount(() => {
		const initial = new Date(value)
		hour = initial.getHours()
		minute = initial.getMinutes()
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onCancel()
		}
		const onPointer = (event: PointerEvent) => {
			const target = event.target as HTMLElement
			if (!target.closest('[data-time-popover]')) onCancel()
		}
		window.addEventListener('keydown', onKey)
		window.addEventListener('pointerdown', onPointer)
		return () => {
			window.removeEventListener('keydown', onKey)
			window.removeEventListener('pointerdown', onPointer)
		}
	})
</script>

<div class="popover" data-time-popover role="dialog" aria-label="Essenszeit wählen">
	<div class="current">{formatHHMM(new Date(value).setHours(hour, minute, 0, 0))}</div>
	<div class="columns">
		<div class="col" aria-label="Stunden">
			{#each hours as h}
				<button type="button" class:active={h === hour} onclick={() => (hour = h)}>{String(h).padStart(2, '0')}</button>
			{/each}
		</div>
		<div class="col" aria-label="Minuten">
			{#each minutes as m}
				<button type="button" class:active={m === minute} onclick={() => (minute = m)}>{String(m).padStart(2, '0')}</button>
			{/each}
		</div>
	</div>
	<div class="actions">
		<button type="button" class="ghost" onclick={onCancel}>Abbrechen</button>
		<button type="button" class="primary" onclick={confirm}>Übernehmen</button>
	</div>
</div>

<style>
	.popover {
		position: absolute;
		z-index: var(--z-modal);
		width: 240px;
		max-height: 320px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
		border-radius: 8px;
		border: 1px solid var(--color-border-strong);
		background: var(--color-bg-panel);
		box-shadow: var(--shadow-lg);
		color: var(--color-fg-base);
	}
	.current {
		font-family: var(--font-display);
		font-size: 34px;
		font-weight: 700;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
	.columns {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		min-height: 0;
	}
	.col {
		max-height: 190px;
		overflow-y: auto;
		scroll-snap-type: y mandatory;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.col button {
		min-height: 34px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--color-fg-muted);
		font-family: var(--font-display);
		font-size: 22px;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
		scroll-snap-align: center;
	}
	.col button.active {
		background: var(--color-ember);
		color: var(--color-ember-ink);
	}
	.actions {
		display: flex;
		gap: 8px;
	}
	.actions button {
		flex: 1;
		min-height: 36px;
		border-radius: 8px;
		font: inherit;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
	}
	.ghost {
		border: 1px solid var(--color-border-strong);
		background: transparent;
		color: var(--color-fg-base);
	}
	.primary {
		border: 1px solid var(--color-ember);
		background: var(--color-ember);
		color: var(--color-ember-ink);
	}
</style>
