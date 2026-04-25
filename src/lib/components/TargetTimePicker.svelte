<script lang="ts">
	import { formatHHMM, formatRelative } from '$lib/util/format'

	interface Props {
		value: number
		onchange: (epoch: number) => void
	}

	let { value, onchange }: Props = $props()

	let hhmm = $derived(formatHHMM(value))
	let isTomorrow = $derived(value > Date.now() + 12 * 3600 * 1000 && new Date(value).getDate() !== new Date().getDate())
	let inputEl: HTMLInputElement | undefined = $state()

	function onInput(e: Event) {
		const t = (e.target as HTMLInputElement).value
		if (!/^\d{2}:\d{2}$/.test(t)) return
		const [h, m] = t.split(':').map(Number)
		const now = new Date()
		const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0)
		if (candidate.getTime() < now.getTime()) candidate.setDate(candidate.getDate() + 1)
		onchange(candidate.getTime())
	}

	function openPicker() {
		if (!inputEl) return
		// Prefer the modern showPicker() API where available so the OS-native
		// time picker pops up exactly where the user tapped. Fall back to
		// focus/click on older browsers.
		try {
			if (typeof inputEl.showPicker === 'function') {
				inputEl.showPicker()
				return
			}
		} catch {
			// showPicker not available (e.g., older browsers)
		}
		inputEl.focus()
		inputEl.click()
	}
</script>

<button type="button" class="picker" onclick={openPicker} aria-label="Zielzeit ändern">
	<span class="label">Essen um</span>
	<span class="time">{hhmm}</span>
	<span class="rel">
		{formatRelative(value)}{#if isTomorrow}<em>&nbsp;· morgen</em>{/if}
	</span>
	<input bind:this={inputEl} type="time" value={hhmm} oninput={onInput} aria-hidden="true" tabindex="-1" lang="de-CH" />
</button>

<style>
	.picker {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
		width: 100%;
		background: var(--color-bg-surface);
		padding: var(--space-4);
		border-radius: var(--radius-lg);
		border: 1px solid var(--color-border-subtle);
		color: var(--color-fg-base);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.picker:active {
		background: var(--color-bg-elevated);
	}
	.label {
		font-size: var(--font-size-xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-widest);
		color: var(--color-fg-muted);
	}
	.time {
		font-family: var(--font-mono);
		font-size: var(--font-size-3xl);
		font-variant-numeric: tabular-nums;
		line-height: 1.1;
	}
	.rel {
		color: var(--color-fg-muted);
		font-size: var(--font-size-sm);
	}
	em {
		color: var(--color-warning-default);
		font-style: normal;
	}
	/* Native input is layered behind the styled display so taps still surface
	   the OS-native picker (iOS wheel, Android time wheel, desktop clock). */
	input[type='time'] {
		position: absolute;
		inset: 0;
		opacity: 0;
		pointer-events: none;
	}
</style>
