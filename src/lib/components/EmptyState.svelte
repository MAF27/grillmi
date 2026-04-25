<script lang="ts">
	import type { Snippet } from 'svelte'

	interface Props {
		title: string
		description?: string
		actions?: Snippet
	}

	let { title, description, actions }: Props = $props()
</script>

<section class="empty">
	<h2>{title}</h2>
	{#if description}<p>{description}</p>{/if}
	{#if actions}<div class="actions">{@render actions()}</div>{/if}
</section>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		min-height: 60vh;
		padding: var(--space-6);
		text-align: center;
	}
	h2 {
		font-family: var(--font-display);
		font-size: var(--font-size-2xl);
		margin: 0;
	}
	p {
		color: var(--color-fg-muted);
		max-width: 30ch;
		margin: 0;
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		width: 100%;
		max-width: 320px;
	}
</style>
