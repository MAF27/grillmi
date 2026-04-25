<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import Button from '$lib/components/Button.svelte'
	import { settingsStore } from '$lib/stores/settingsStore.svelte'
	import { play } from '$lib/sounds/player'
	import type { UserSettings } from '$lib/models'

	const events: { key: keyof UserSettings['sounds']; label: string }[] = [
		{ key: 'putOn', label: 'Auflegen' },
		{ key: 'flip', label: 'Wenden' },
		{ key: 'done', label: 'Fertig' },
	]
	const sounds = ['chime-1', 'chime-2', 'chime-3', 'chime-4', 'chime-5', 'chime-6', 'chime-7', 'chime-8']
	const themes: { value: UserSettings['theme']; label: string }[] = [
		{ value: 'system', label: 'System' },
		{ value: 'light', label: 'Hell' },
		{ value: 'dark', label: 'Dunkel' },
	]

	onMount(async () => {
		await settingsStore.init()
	})

	function setTheme(t: UserSettings['theme']) {
		void settingsStore.setTheme(t)
	}

	function setSound(event: keyof UserSettings['sounds'], soundId: string) {
		void settingsStore.setSound(event, soundId)
		void play(soundId).catch(() => {})
	}
</script>

<svelte:head>
	<title>Einstellungen · Grillmi</title>
</svelte:head>

<main>
	<header>
		<button class="back" onclick={() => goto('/')} aria-label="Zurück">‹</button>
		<h1>Einstellungen</h1>
	</header>

	<section>
		<h2>Darstellung</h2>
		<div class="seg" role="radiogroup" aria-label="Darstellung">
			{#each themes as t (t.value)}
				<button
					role="radio"
					aria-checked={settingsStore.theme === t.value}
					class:active={settingsStore.theme === t.value}
					onclick={() => setTheme(t.value)}>{t.label}</button>
			{/each}
		</div>
	</section>

	<section>
		<h2>Töne</h2>
		{#each events as ev (ev.key)}
			<div class="sound-row">
				<span class="ev-label">{ev.label}</span>
				<div class="chips">
					{#each sounds as s (s)}
						<button
							class:active={settingsStore.sounds[ev.key] === s}
							onclick={() => setSound(ev.key, s)}
							aria-label={`${ev.label}: ${s}`}>{s.replace('chime-', '#')}</button>
					{/each}
				</div>
			</div>
		{/each}
	</section>

	<section>
		<h2>Über Grillmi</h2>
		<p>Version 1.0.0, gebaut für den Garten.</p>
		<p><a href="https://github.com/MAF27" rel="noopener noreferrer" target="_blank">Quelltext</a></p>
		<p class="muted">Garzeiten basieren auf Migros Grilltimer, Weber, Serious Eats und Meathead.</p>
		<Button variant="ghost" onclick={() => settingsStore.markFirstRunSeen()}>Willkommens-Hinweis ausblenden</Button>
	</section>
</main>

<style>
	main {
		max-width: 600px;
		margin: 0 auto;
		padding: env(safe-area-inset-top) var(--space-4) var(--space-12);
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		min-height: 100dvh;
	}
	header {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding-top: var(--space-4);
	}
	header h1 {
		font-family: var(--font-display);
		font-size: var(--font-size-2xl);
		margin: 0;
	}
	.back {
		background: transparent;
		border: none;
		color: var(--color-fg-base);
		font-size: var(--font-size-2xl);
		min-width: 44px;
		min-height: 44px;
	}
	section {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	section h2 {
		font-family: var(--font-display);
		font-size: var(--font-size-lg);
		margin: 0;
	}
	.seg {
		display: flex;
		gap: var(--space-1);
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
		padding: var(--space-1);
	}
	.seg button {
		flex: 1;
		min-height: 44px;
		background: transparent;
		border: none;
		color: var(--color-fg-base);
		border-radius: var(--radius-md);
	}
	.seg button.active {
		background: var(--color-accent-default);
		color: var(--color-fg-on-accent);
	}
	.sound-row {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.ev-label {
		font-size: var(--font-size-sm);
		text-transform: uppercase;
		letter-spacing: var(--tracking-widest);
		color: var(--color-fg-muted);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.chips button {
		min-width: 56px;
		min-height: 44px;
		border-radius: var(--radius-md);
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		color: var(--color-fg-base);
		font-family: var(--font-mono);
	}
	.chips button.active {
		background: var(--color-accent-default);
		color: var(--color-fg-on-accent);
		border-color: var(--color-accent-default);
	}
	.muted {
		color: var(--color-fg-muted);
		font-size: var(--font-size-sm);
	}
	a {
		color: var(--color-accent-default);
	}
</style>
