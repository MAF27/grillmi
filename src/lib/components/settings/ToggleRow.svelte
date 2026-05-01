<script lang="ts">
	import SettingRow from './SettingRow.svelte'

	interface Props {
		label: string
		sub?: string
		value: boolean
		layout?: 'row' | 'stack' | 'cockpit'
		onchange: (next: boolean) => void
	}

	let { label, sub, value, layout = 'row', onchange }: Props = $props()
</script>

<SettingRow {label} {sub} {layout} ariaPressed={value} onclick={() => onchange(!value)}>
	{#snippet trailing()}
		<div class="toggle" class:on={value} aria-hidden="true">
			<div class="toggle-knob"></div>
		</div>
	{/snippet}
</SettingRow>

<style>
	.toggle {
		width: 44px;
		height: 26px;
		border-radius: 13px;
		background: var(--color-border-strong);
		position: relative;
		transition: background 0.15s ease;
		flex-shrink: 0;
	}
	.toggle.on {
		background: var(--color-ember);
	}
	.toggle-knob {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 20px;
		height: 20px;
		border-radius: 10px;
		background: var(--color-fg-base);
		transition: left 0.15s ease;
	}
	.toggle.on .toggle-knob {
		left: 21px;
		background: var(--color-ember-ink);
	}
</style>
