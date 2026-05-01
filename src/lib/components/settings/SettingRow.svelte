<script lang="ts">
	import type { Snippet } from 'svelte'

	interface Props {
		label: string
		sub?: string
		layout?: 'row' | 'stack' | 'cockpit'
		disabled?: boolean
		onclick?: () => void
		ariaPressed?: boolean
		trailing?: Snippet
	}

	let { label, sub, layout = 'row', disabled = false, onclick, ariaPressed, trailing }: Props = $props()

	const interactive = $derived(typeof onclick === 'function')
</script>

{#if interactive}
	<button class="row" class:stack={layout === 'stack'} class:cockpit={layout === 'cockpit'} class:disabled type="button" aria-pressed={ariaPressed} onclick={onclick}>
		<div class="text">
			<div class="label">{label}</div>
			{#if sub}<div class="sub">{sub}</div>{/if}
		</div>
		{#if trailing}
			<div class="trailing">{@render trailing()}</div>
		{/if}
	</button>
{:else}
	<div class="row" class:stack={layout === 'stack'} class:cockpit={layout === 'cockpit'} class:disabled>
		<div class="text">
			<div class="label">{label}</div>
			{#if sub}<div class="sub">{sub}</div>{/if}
		</div>
		{#if trailing}
			<div class="trailing">{@render trailing()}</div>
		{/if}
	</div>
{/if}

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 16px;
		background: transparent;
		border: 0;
		border-top: 1px solid var(--color-border-subtle);
		color: var(--color-fg-base);
		font: inherit;
		text-align: left;
		width: 100%;
	}
	:global(.rows > .row:first-child),
	:global(.rows > :first-child .row) {
		border-top: 0;
	}
	.row.stack {
		flex-direction: column;
		align-items: stretch;
		gap: 10px;
	}
	.row.cockpit {
		display: grid;
		grid-template-columns: minmax(0, 240px) minmax(0, 1fr);
		gap: 24px;
		padding: var(--density-pad-row-y, 16px) var(--density-pad-row-x, 18px);
	}
	.row.cockpit .trailing {
		justify-self: stretch;
	}
	.row.disabled .text {
		opacity: 0.55;
	}
	button.row {
		cursor: pointer;
	}
	button.row:disabled {
		cursor: not-allowed;
	}
	.text {
		flex: 1;
		min-width: 0;
	}
	.label {
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 15px;
		line-height: 1.2;
	}
	.sub {
		margin-top: 2px;
		font-size: 12px;
		color: var(--color-fg-muted);
	}
	.trailing {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}
	.row.stack .trailing {
		display: block;
	}
</style>
