<script lang="ts">
	import MasterClock from './MasterClock.svelte'

	interface Props {
		targetEpoch: number
		wakeLockState: 'idle' | 'held' | 'denied' | 'unsupported'
		onEnd: () => void
	}

	let { targetEpoch, wakeLockState, onEnd }: Props = $props()
	let confirmOpen = $state(false)
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

	function confirmEnd() {
		confirmOpen = false
		onEnd()
	}
</script>

<header class="session-header">
	<div class="bar">
		<span class="wake-lock" class:green={wakeLockGreen} class:red={!wakeLockGreen} aria-live="polite">
			<span class="dot" aria-hidden="true"></span>
			{wakeLockLabel}
		</span>
		<button type="button" class="end-btn" onclick={() => (confirmOpen = true)}>Session beenden</button>
	</div>
	<MasterClock {targetEpoch} />
</header>

{#if confirmOpen}
	<div class="scrim" role="presentation" onclick={() => (confirmOpen = false)}></div>
	<div class="confirm" role="dialog" aria-modal="true" aria-labelledby="end-title">
		<h2 id="end-title">Session wirklich beenden?</h2>
		<p>Alle laufenden Timer werden gestoppt. Geplante Einträge bleiben erhalten und du kannst die Session neu starten.</p>
		<div class="actions">
			<button type="button" class="cancel" onclick={() => (confirmOpen = false)}>Abbrechen</button>
			<button type="button" class="confirm-end" onclick={confirmEnd}>Beenden</button>
		</div>
	</div>
{/if}

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
	.end-btn {
		min-height: 44px;
		padding: 0 var(--space-4);
		border: 1px solid var(--color-border-default);
		border-radius: var(--radius-md);
		background: var(--color-bg-surface);
		color: var(--color-fg-base);
		font: inherit;
		cursor: pointer;
	}
	.scrim {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: var(--z-modal-backdrop, 1000);
	}
	.confirm {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		max-width: 22rem;
		width: calc(100vw - 2rem);
		padding: var(--space-5);
		border: 1px solid var(--color-border-default);
		border-radius: var(--radius-lg);
		background: var(--color-bg-surface);
		color: var(--color-fg-base);
		z-index: var(--z-modal, 1001);
	}
	.confirm h2 {
		margin: 0 0 var(--space-3);
		font-size: var(--font-size-lg);
	}
	.confirm p {
		margin: 0 0 var(--space-4);
		color: var(--color-fg-muted);
		font-size: var(--font-size-sm);
	}
	.actions {
		display: flex;
		gap: var(--space-3);
		justify-content: flex-end;
	}
	.actions button {
		min-height: 44px;
		padding: 0 var(--space-4);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border-default);
		font: inherit;
		cursor: pointer;
	}
	.cancel {
		background: var(--color-bg-surface);
		color: var(--color-fg-base);
	}
	.confirm-end {
		background: var(--color-error-default);
		color: var(--color-fg-on-status);
		border-color: var(--color-error-default);
	}
</style>
