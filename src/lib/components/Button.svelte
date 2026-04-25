<script lang="ts">
	import type { Snippet } from 'svelte'

	type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive'
	type Size = 'sm' | 'md' | 'lg'

	interface Props {
		variant?: Variant
		size?: Size
		disabled?: boolean
		loading?: boolean
		type?: 'button' | 'submit' | 'reset'
		fullWidth?: boolean
		onclick?: (e: MouseEvent) => void
		children?: Snippet
		ariaLabel?: string
	}

	let {
		variant = 'primary',
		size = 'md',
		disabled = false,
		loading = false,
		type = 'button',
		fullWidth = false,
		onclick,
		children,
		ariaLabel,
	}: Props = $props()
</script>

<button
	{type}
	class="btn"
	class:primary={variant === 'primary'}
	class:secondary={variant === 'secondary'}
	class:ghost={variant === 'ghost'}
	class:destructive={variant === 'destructive'}
	class:sm={size === 'sm'}
	class:md={size === 'md'}
	class:lg={size === 'lg'}
	class:full={fullWidth}
	disabled={disabled || loading}
	aria-busy={loading}
	aria-label={ariaLabel}
	{onclick}>
	{#if loading}
		<span class="spinner" aria-hidden="true"></span>
	{:else}
		{@render children?.()}
	{/if}
</button>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		min-height: 44px;
		min-width: 44px;
		padding: 0 var(--space-5);
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		font-family: var(--font-body);
		font-weight: var(--font-weight-semibold);
		cursor: pointer;
		transition: background-color var(--duration-fast) var(--ease-default);
		font-size: var(--font-size-md);
		line-height: 1;
	}
	.btn.full {
		width: 100%;
	}
	.btn.lg {
		min-height: 56px;
		font-size: var(--font-size-lg);
		padding: 0 var(--space-6);
	}
	.btn.sm {
		min-height: 36px;
		padding: 0 var(--space-3);
		font-size: var(--font-size-sm);
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn.primary {
		background: var(--color-accent-default);
		color: var(--color-fg-on-accent);
	}
	.btn.primary:not(:disabled):hover {
		background: var(--color-accent-hover);
	}

	.btn.secondary {
		background: var(--color-bg-surface);
		color: var(--color-fg-base);
		border-color: var(--color-border-default);
	}
	.btn.ghost {
		background: transparent;
		color: var(--color-fg-base);
	}
	.btn.destructive {
		background: var(--color-error-default);
		color: var(--color-fg-on-status);
	}

	.spinner {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 2px solid currentColor;
		border-right-color: transparent;
		animation: spin 600ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
