<script lang="ts">
	import { formatHHMM } from '$lib/util/format'

	interface Props {
		targetEpoch: number
		wakeLockState: 'idle' | 'held' | 'denied' | 'unsupported'
		planMode?: 'auto' | 'manual'
		onEnd: () => void
	}

	let { targetEpoch, wakeLockState, planMode = 'auto', onEnd }: Props = $props()
	let confirmOpen = $state(false)
	const wakeLockGreen = $derived(wakeLockState === 'held')
	const wakeLockLabel = $derived.by(() => {
		switch (wakeLockState) {
			case 'held':
				return 'Aktiv'
			case 'idle':
				return 'Idle'
			case 'denied':
				return 'Verweigert'
			case 'unsupported':
				return 'N/A'
		}
	})

	function confirmEnd() {
		confirmOpen = false
		onEnd()
	}
</script>

<header class="session-header">
	<div class="bar">
		<div class="left">
			<span class="dot" aria-hidden="true"></span>
			<span class="live">Live</span>
			<span class="wake-chip" class:green={wakeLockGreen} class:red={!wakeLockGreen} title={wakeLockLabel} aria-live="polite">
				<span class="wake-dot" aria-hidden="true"></span>
				<span class="wake-text">{wakeLockLabel}</span>
			</span>
		</div>
		<div class="right">
			{#if planMode === 'manual'}
				<div class="badge">
					<div class="badge-eyebrow">Modus</div>
					<div class="badge-value manual">Manuell</div>
				</div>
			{:else}
				<div class="badge">
					<div class="badge-eyebrow">Essen um</div>
					<div class="badge-value" data-mask-time>{formatHHMM(targetEpoch)}</div>
				</div>
			{/if}
			<button type="button" class="end-btn" onclick={() => (confirmOpen = true)}>Beenden</button>
		</div>
	</div>
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
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: calc(env(safe-area-inset-top) + 12px) 20px 12px;
	}
	.left {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-ember);
		animation: live-pulse 1.5s infinite;
	}
	@keyframes live-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.3;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.dot {
			animation: none;
		}
	}
	.live {
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-fg-muted);
	}
	.wake-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 22px;
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		font-family: var(--font-body);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-fg-muted);
	}
	.wake-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}
	.green .wake-dot {
		background: var(--color-state-ready);
	}
	.green {
		color: var(--color-state-ready);
	}
	.red .wake-dot {
		background: var(--color-fg-muted);
	}
	.right {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.badge {
		text-align: right;
	}
	.badge-eyebrow {
		font-family: var(--font-body);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-fg-muted);
	}
	.badge-value {
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 600;
		line-height: 1;
		letter-spacing: -0.01em;
		font-variant-numeric: tabular-nums;
		color: var(--color-fg-base);
	}
	.badge-value.manual {
		color: var(--color-ember);
		text-transform: uppercase;
	}
	.end-btn {
		min-height: 36px;
		padding: 10px 14px;
		border: 1px solid var(--color-border-strong);
		border-radius: 10px;
		background: transparent;
		color: var(--color-fg-base);
		font-family: var(--font-body);
		font-weight: 500;
		font-size: 13px;
		cursor: pointer;
	}
	.scrim {
		position: fixed;
		inset: 0;
		background: var(--color-bg-overlay);
		z-index: var(--z-modal);
	}
	.confirm {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		max-width: 22rem;
		width: calc(100vw - 2rem);
		padding: 20px;
		border: 1px solid var(--color-border-default);
		border-radius: 16px;
		background: var(--color-bg-surface);
		color: var(--color-fg-base);
		z-index: calc(var(--z-modal) + 1);
	}
	.confirm h2 {
		margin: 0 0 12px;
		font-size: 18px;
	}
	.confirm p {
		margin: 0 0 16px;
		color: var(--color-fg-muted);
		font-size: 14px;
	}
	.actions {
		display: flex;
		gap: 12px;
		justify-content: flex-end;
	}
	.actions button {
		min-height: 44px;
		padding: 0 16px;
		border-radius: 10px;
		font-family: var(--font-body);
		font-weight: 500;
		cursor: pointer;
	}
	.cancel {
		background: transparent;
		color: var(--color-fg-base);
		border: 1px solid var(--color-border-strong);
	}
	.confirm-end {
		background: var(--color-error-default);
		color: #fff;
		border: none;
	}
</style>
