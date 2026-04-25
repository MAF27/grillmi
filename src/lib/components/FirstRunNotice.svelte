<script lang="ts">
	import Button from './Button.svelte'

	interface Props {
		onclose: () => void
	}

	let { onclose }: Props = $props()

	const isIOSSafari =
		typeof navigator !== 'undefined' &&
		/iP(ad|hone|od)/.test(navigator.userAgent) &&
		/Safari/.test(navigator.userAgent) &&
		!/CriOS|FxiOS/.test(navigator.userAgent)
	const isStandalone = typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone === true
</script>

<div class="scrim" role="presentation"></div>
<dialog open class="notice" aria-labelledby="frn-title">
	<h2 id="frn-title">Willkommen bei Grillmi</h2>
	<ol>
		<li>
			Während einer Session bleibt der Bildschirm aktiv (Wake Lock). Wenn dein iPhone den Lock verweigert, siehst du oben einen
			roten Balken — dann nicht weglegen.
		</li>
		<li>iPhone-Stummschalter ausschalten und Lautstärke hochdrehen, sonst verschluckt iOS die Chimes.</li>
		<li>Auf iPhone gibt es <strong>keine Vibration</strong> (Webplattform-Limit). Achte auf Banner und Karten-Pulse.</li>
		{#if isIOSSafari && !isStandalone}
			<li>Tippe auf <strong>Teilen → Zum Home-Bildschirm</strong>, damit Grillmi als App startet.</li>
		{/if}
	</ol>
	<Button variant="primary" fullWidth onclick={onclose}>Verstanden</Button>
</dialog>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: var(--color-bg-overlay);
		z-index: var(--z-modal);
	}
	.notice {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		background: var(--color-bg-elevated);
		color: var(--color-fg-base);
		border: 1px solid var(--color-border-default);
		border-radius: var(--radius-lg);
		padding: var(--space-5);
		width: min(92vw, 520px);
		z-index: calc(var(--z-modal) + 1);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.notice h2 {
		font-family: var(--font-display);
		margin: 0;
	}
	ol {
		margin: 0;
		padding-left: var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		font-size: var(--font-size-sm);
		color: var(--color-fg-muted);
	}
	ol strong {
		color: var(--color-fg-base);
	}
</style>
