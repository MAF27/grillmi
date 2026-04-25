<script lang="ts">
	import type { Snippet } from 'svelte'

	interface Props {
		holdMs?: number
		onConfirm: () => void
		children?: Snippet
	}

	let { holdMs = 500, onConfirm, children }: Props = $props()
	let progress = $state(0)
	let timer: ReturnType<typeof setInterval> | null = null
	let start = 0

	function begin() {
		start = Date.now()
		progress = 0
		timer = setInterval(() => {
			progress = Math.min(1, (Date.now() - start) / holdMs)
			if (progress >= 1) {
				cancel()
				onConfirm()
			}
		}, 16)
	}
	function cancel() {
		if (timer) clearInterval(timer)
		timer = null
		progress = 0
	}
</script>

<button
	class="hold"
	style="--p: {progress}"
	onpointerdown={begin}
	onpointerup={cancel}
	onpointerleave={cancel}
	onpointercancel={cancel}>
	<span class="fill" aria-hidden="true"></span>
	<span class="label">{@render children?.()}</span>
</button>

<style>
	.hold {
		position: relative;
		min-height: 44px;
		padding: 0 var(--space-4);
		border: 1px solid var(--color-border-default);
		border-radius: var(--radius-md);
		background: var(--color-bg-surface);
		color: var(--color-fg-base);
		font: inherit;
		cursor: pointer;
		overflow: hidden;
	}
	.fill {
		position: absolute;
		inset: 0;
		background: var(--color-error-default);
		transform-origin: left center;
		transform: scaleX(var(--p));
		transition: transform 50ms var(--ease-linear);
	}
	.label {
		position: relative;
		z-index: 1;
	}
</style>
