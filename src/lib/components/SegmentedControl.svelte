<script lang="ts">
	interface Segment {
		id: string
		label: string
	}

	interface Props {
		segments: Segment[]
		value: string
		onchange: (id: string) => void
		ariaLabel?: string
		disabled?: boolean
	}

	let { segments, value, onchange, ariaLabel, disabled = false }: Props = $props()
</script>

<div class="segmented" class:disabled role="tablist" aria-label={ariaLabel} aria-disabled={disabled}>
	{#each segments as seg (seg.id)}
		<button
			type="button"
			role="tab"
			aria-selected={value === seg.id}
			class:active={value === seg.id}
			{disabled}
			onclick={() => !disabled && onchange(seg.id)}>
			{seg.label}
		</button>
	{/each}
</div>

<style>
	.segmented {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		gap: 4px;
		padding: 4px;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: 16px;
	}
	.segmented.disabled {
		opacity: 0.5;
	}
	button {
		min-height: 44px;
		padding: 14px 6px;
		background: transparent;
		border: none;
		border-radius: 12px;
		color: var(--color-fg-base);
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 16px;
		letter-spacing: -0.005em;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	button[disabled] {
		cursor: not-allowed;
	}
	button.active {
		background: var(--color-ember);
		color: var(--color-ember-ink);
	}
</style>
