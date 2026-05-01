<script lang="ts">
	import SettingRow from './SettingRow.svelte'

	interface Props {
		label: string
		sub?: string
		value: number
		formatted: string
		step: number
		layout?: 'row' | 'stack' | 'cockpit'
		minus?: string
		plus?: string
		onchange: (next: number) => void
	}

	let { label, sub, value, formatted, step, layout = 'row', minus = 'weniger', plus = 'mehr', onchange }: Props = $props()
</script>

<SettingRow {label} {sub} {layout}>
	{#snippet trailing()}
		<div class="stepper">
			<button type="button" aria-label={minus} onclick={() => onchange(value - step)}>−</button>
			<span>{formatted}</span>
			<button type="button" aria-label={plus} onclick={() => onchange(value + step)}>+</button>
		</div>
	{/snippet}
</SettingRow>

<style>
	.stepper {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 4px 6px;
		border: 1px solid var(--color-border-strong);
		border-radius: 999px;
	}
	.stepper button {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		border: 0;
		background: transparent;
		color: var(--color-fg-base);
		font-size: 18px;
		line-height: 1;
		cursor: pointer;
	}
	.stepper button:hover {
		background: var(--color-bg-base);
	}
	.stepper span {
		min-width: 64px;
		text-align: center;
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
		font-size: 14px;
	}
</style>
