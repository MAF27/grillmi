<script lang="ts">
	export type AlarmKind = 'on' | 'flip' | 'ready'

	interface Props {
		kind: AlarmKind
		itemName: string
		count?: number
		onDismiss: () => void
		message?: string
		placement?: 'top' | 'bottom'
	}

	let { kind, itemName, count = 1, onDismiss, message, placement = 'bottom' }: Props = $props()

	const eyebrow = $derived(kind === 'flip' ? 'Wenden' : kind === 'ready' ? 'Fertig' : 'Auflegen')
	const verb = $derived(kind === 'flip' ? 'wenden' : kind === 'ready' ? 'anrichten' : 'auflegen')
</script>

<div class="banner" class:top={placement === 'top'} role="alert" data-testid="alarm-banner" data-kind={kind}>
	<svg class="flame" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
		<path
			d="M12 2c1 3-1 4-1 7 0 1.5 1 3 2.5 3S16 10.5 16 9c0-2-1-3-1-4 2 1 5 4 5 8 0 4-3.5 7-8 7s-8-3-8-7c0-3 2-5 4-6.5C7.2 5.7 9 4 12 2z" />
	</svg>
	<div class="body">
		<div class="eyebrow">
			<span class="kind-label">{eyebrow}</span>
			{#if count > 1}
				<span class="count" aria-label={`${count - 1} weitere Alarme`}>+{count - 1}</span>
			{/if}
		</div>
		<div class="line">
			{#if message}
				{message}
			{:else}
				<strong>{itemName}</strong> <span class="verb">jetzt {verb}</span>
			{/if}
		</div>
	</div>
	<button class="dismiss" onclick={onDismiss} aria-label="Bestätigen">
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="3"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true">
			<polyline points="20 6 9 17 4 12" />
		</svg>
	</button>
</div>

<style>
	.banner {
		position: absolute;
		left: 16px;
		right: 16px;
		bottom: 24px;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 18px;
		border-radius: 16px;
		background: linear-gradient(90deg, var(--color-ember) 0%, var(--color-ember-dim) 100%);
		color: var(--color-ember-ink);
		box-shadow: var(--shadow-alarm);
		animation: alarm-pulse 1.2s ease-in-out infinite;
		z-index: 5;
	}
	.banner.top {
		position: sticky;
		top: 0;
		left: auto;
		right: auto;
		bottom: auto;
		margin-bottom: 18px;
	}
	@keyframes alarm-pulse {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.012);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.banner {
			animation: none;
		}
	}
	.flame {
		flex-shrink: 0;
		color: var(--color-ember-ink);
	}
	.body {
		flex: 1;
		min-width: 0;
	}
	.eyebrow {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		opacity: 0.7;
	}
	.count {
		background: rgba(0, 0, 0, 0.18);
		padding: 1px 7px;
		border-radius: 8px;
		font-size: 10px;
		letter-spacing: 0.04em;
	}
	.line {
		font-family: var(--font-body);
		font-size: 16px;
		font-weight: 700;
		line-height: 1.2;
		margin-top: 2px;
	}
	.line .verb {
		opacity: 0.7;
		font-weight: 500;
	}
	.dismiss {
		flex-shrink: 0;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		border: none;
		background: rgba(0, 0, 0, 0.15);
		color: var(--color-ember-ink);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background 0.15s ease;
	}
	.dismiss:hover {
		background: rgba(0, 0, 0, 0.25);
	}
</style>
