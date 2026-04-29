<script lang="ts">
	import type { Snippet } from 'svelte'

	interface Props {
		padding?: string
		style?: string
		children?: Snippet
	}

	let { padding = '20px 22px', style = '', children }: Props = $props()
</script>

<div class="card" style={`padding: ${padding}; ${style}`}>
	{@render children?.()}
</div>

<style>
	.card {
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: 16px;
		color: var(--color-fg-base);
	}
</style>
