<script lang="ts">
	import { formatHHMM, formatRelative } from '$lib/util/format'

	interface Props {
		value: number
		onchange: (epoch: number) => void
	}

	let { value, onchange }: Props = $props()

	let hhmm = $derived(formatHHMM(value))
	let isTomorrow = $derived(value > Date.now() + 12 * 3600 * 1000 && new Date(value).getDate() !== new Date().getDate())

	function onInput(e: Event) {
		const t = (e.target as HTMLInputElement).value
		if (!/^\d{2}:\d{2}$/.test(t)) return
		const [h, m] = t.split(':').map(Number)
		const now = new Date()
		const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0)
		if (candidate.getTime() < now.getTime()) candidate.setDate(candidate.getDate() + 1)
		onchange(candidate.getTime())
	}
</script>

<label class="picker">
	<span class="label">Essen um</span>
	<input type="time" value={hhmm} oninput={onInput} aria-label="Zielzeit" />
	<span class="rel"
		>{formatRelative(value)}{#if isTomorrow}
			<em>(morgen {hhmm})</em>{/if}</span>
</label>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		background: var(--color-bg-surface);
		padding: var(--space-4);
		border-radius: var(--radius-lg);
		border: 1px solid var(--color-border-subtle);
	}
	.label {
		font-size: var(--font-size-xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-widest);
		color: var(--color-fg-muted);
	}
	input[type='time'] {
		background: transparent;
		border: none;
		color: var(--color-fg-base);
		font-family: var(--font-mono);
		font-size: var(--font-size-2xl);
		padding: var(--space-1) 0;
		width: 100%;
	}
	input[type='time']::-webkit-calendar-picker-indicator {
		filter: invert(1);
	}
	.rel {
		color: var(--color-fg-muted);
		font-size: var(--font-size-sm);
	}
	em {
		color: var(--color-warning-default);
		font-style: normal;
	}
</style>
