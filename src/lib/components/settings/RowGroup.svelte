<script lang="ts">
	import type { Snippet } from 'svelte'

	interface Props {
		eyebrow?: string
		hint?: string
		children?: Snippet
	}

	let { eyebrow, hint, children }: Props = $props()
</script>

<section class="group">
	{#if eyebrow}
		<div class="eyebrow">{eyebrow}</div>
	{/if}
	<div class="rows">
		{@render children?.()}
	</div>
	{#if hint}
		<p class="hint">{hint}</p>
	{/if}
</section>

<style>
	.group {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.eyebrow {
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-fg-muted);
	}
	.rows {
		display: flex;
		flex-direction: column;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: 16px;
		overflow: hidden;
	}
	.hint {
		margin: 0;
		color: var(--color-fg-muted);
		font-size: 12px;
	}
</style>
