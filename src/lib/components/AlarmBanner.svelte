<script lang="ts">
	import { onMount } from 'svelte'

	interface Props {
		message: string
		onDismiss: () => void
	}

	let { message, onDismiss }: Props = $props()
	let timer: ReturnType<typeof setTimeout> | null = null

	onMount(() => {
		timer = setTimeout(onDismiss, 8000)
		return () => {
			if (timer) clearTimeout(timer)
		}
	})

	function tap() {
		if (timer) clearTimeout(timer)
		onDismiss()
	}
</script>

<div class="banner" role="alert" data-testid="alarm-banner">
	<strong>{message}</strong>
	<button class="dismiss" onclick={tap} aria-label="Banner schliessen">×</button>
</div>

<style>
	.banner {
		position: sticky;
		top: 0;
		z-index: var(--z-toast);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		width: 100%;
		padding: var(--space-4);
		background: var(--color-accent-default);
		color: var(--color-fg-on-accent);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
		text-align: left;
		animation: slideIn var(--duration-fast) var(--ease-out);
	}
	@keyframes slideIn {
		from {
			transform: translateY(-100%);
		}
	}
	.dismiss {
		font-size: var(--font-size-xl);
		background: transparent;
		border: none;
		color: inherit;
		min-width: 44px;
		min-height: 44px;
		cursor: pointer;
	}
</style>
