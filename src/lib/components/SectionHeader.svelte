<script lang="ts">
	import type { Snippet } from 'svelte'

	interface Props {
		kicker?: string
		title: string
		action?: Snippet
	}

	let { kicker, title, action }: Props = $props()
</script>

<div class="section-header">
	<div>
		{#if kicker}
			<div class="kicker">{kicker}</div>
		{/if}
		<h2>{title}</h2>
	</div>
	{#if action}
		<div class="action">{@render action()}</div>
	{/if}
</div>

<style>
	.section-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 14px;
	}
	.kicker {
		margin-bottom: 4px;
		font-family: var(--font-body);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-ember);
	}
	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 600;
		line-height: 1;
		letter-spacing: 0.01em;
		text-transform: uppercase;
		color: var(--color-fg-base);
	}
	.action {
		flex: 0 0 auto;
	}
</style>
