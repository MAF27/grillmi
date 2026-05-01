<script lang="ts">
	import SettingRow from './SettingRow.svelte'

	interface Option<T extends string> {
		id: T
		swatch: string
		label: string
	}

	interface Props<T extends string = string> {
		label: string
		sub?: string
		value: T
		options: Array<Option<T>>
		layout?: 'row' | 'stack' | 'cockpit'
		onchange: (id: T) => void
	}

	let { label, sub, value, options, layout = 'row', onchange }: Props = $props()
</script>

<SettingRow {label} {sub} {layout}>
	{#snippet trailing()}
		<div class="swatches">
			{#each options as opt (opt.id)}
				<button
					type="button"
					class="swatch"
					class:active={value === opt.id}
					style="--swatch: {opt.swatch}"
					aria-label={opt.label}
					aria-pressed={value === opt.id}
					onclick={() => onchange(opt.id)}></button>
			{/each}
		</div>
	{/snippet}
</SettingRow>

<style>
	.swatches {
		display: flex;
		gap: 10px;
	}
	.swatch {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 2px solid transparent;
		background: var(--swatch);
		cursor: pointer;
		padding: 0;
		box-shadow: inset 0 0 0 2px var(--color-bg-surface);
	}
	.swatch.active {
		border-color: var(--color-fg-base);
	}
</style>
