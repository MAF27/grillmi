<script lang="ts">
	import HoldButton from './HoldButton.svelte'
	import MasterClock from './MasterClock.svelte'

	interface Props {
		targetEpoch: number
		wakeLockState: 'idle' | 'held' | 'denied' | 'unsupported'
		onEnd: () => void
	}

	let { targetEpoch, wakeLockState, onEnd }: Props = $props()
	const wakeLockGreen = $derived(wakeLockState === 'held')
	const wakeLockLabel = $derived.by(() => {
		switch (wakeLockState) {
			case 'held':
				return 'Bildschirm aktiv'
			case 'idle':
				return 'Bildschirm kann sperren'
			case 'denied':
				return 'Bildschirm-Lock verweigert'
			case 'unsupported':
				return 'Wake Lock nicht verfügbar'
		}
	})
</script>

<header class="session-header">
	<div class="bar">
		<span class="wake-lock" class:green={wakeLockGreen} class:red={!wakeLockGreen} aria-live="polite">
			<span class="dot" aria-hidden="true"></span>
			{wakeLockLabel}
		</span>
		<HoldButton onConfirm={onEnd}>Session beenden</HoldButton>
	</div>
	<MasterClock {targetEpoch} />
</header>

<style>
	.session-header {
		position: sticky;
		top: 0;
		z-index: var(--z-sticky);
		background: var(--color-bg-base);
		padding-top: env(safe-area-inset-top);
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-4);
	}
	.wake-lock {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--font-size-xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-widest);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.green .dot {
		background: var(--color-success-default);
	}
	.green {
		color: var(--color-success-default);
	}
	.red .dot {
		background: var(--color-error-default);
	}
	.red {
		color: var(--color-error-default);
	}
</style>
