<script lang="ts">
	import { onMount } from 'svelte'

	interface Props {
		msg: string
		action?: string
		onAction?: () => void
		onClose?: () => void
		kind?: 'info' | 'success' | 'warn'
		duration?: number
	}

	let { msg, action, onAction, onClose, kind = 'info', duration = 4000 }: Props = $props()

	onMount(() => {
		const id = setTimeout(() => onClose?.(), duration)
		return () => clearTimeout(id)
	})
</script>

<div class="toast" data-kind={kind} role="status">
	<span>{msg}</span>
	{#if action}
		<button type="button" onclick={onAction}>{action}</button>
	{/if}
</div>

<style>
	.toast {
		position: fixed;
		left: 50%;
		bottom: 24px;
		transform: translateX(-50%);
		z-index: var(--z-toast);
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 12px 16px;
		border-radius: 10px;
		background: var(--color-bg-panel);
		border: 1px solid var(--color-border-strong);
		color: var(--color-fg-base);
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
		animation: enter 180ms var(--ease-out);
		font-family: var(--font-body);
		font-size: 14px;
	}
	button {
		border: 0;
		background: transparent;
		color: var(--color-ember);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}
	@keyframes enter {
		from {
			transform: translate(-50%, 8px);
			opacity: 0;
		}
		to {
			transform: translate(-50%, 0);
			opacity: 1;
		}
	}
</style>
