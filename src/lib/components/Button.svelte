<script lang="ts">
	import type { Snippet } from 'svelte'

	type Variant = 'primary' | 'secondary' | 'ghost' | 'accentGhost' | 'destructive'
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
	class:accent-ghost={variant === 'accentGhost'}
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
		padding: 14px 18px;
		border: 1px solid transparent;
		border-radius: 14px;
		font-family: var(--font-body);
		font-weight: 600;
		letter-spacing: -0.01em;
		cursor: pointer;
		transition: all var(--duration-fast) var(--ease-default);
		font-size: 15px;
		line-height: 1;
	}
	.btn.full {
		width: 100%;
	}
	.btn.lg {
		min-height: 56px;
		padding: 18px 22px;
		font-size: 17px;
	}
	.btn.sm {
		min-height: 36px;
		padding: 10px 14px;
		font-size: 14px;
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn.primary {
		background: var(--color-ember);
		color: var(--color-ember-ink);
	}
	.btn.primary:not(:disabled):hover {
		background: var(--color-accent-hover);
	}

	.btn.secondary {
		background: transparent;
		color: var(--color-fg-base);
		border-color: var(--color-border-strong);
	}
	.btn.ghost {
		background: transparent;
		color: var(--color-fg-base);
	}
	.btn.accent-ghost {
		background: transparent;
		color: var(--color-ember);
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
