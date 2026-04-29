<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import SettingsCockpit from '$lib/components/desktop/SettingsCockpit.svelte'
	import SegmentedControl from '$lib/components/SegmentedControl.svelte'
	import { viewport } from '$lib/runtime/viewport.svelte'
	import { settingsStore } from '$lib/stores/settingsStore.svelte'
	import { play } from '$lib/sounds/player'
	import type { UserSettings } from '$lib/models'
	import type { ToneId } from '$lib/schemas'

	type ThemeId = UserSettings['theme']
	type EventKey = keyof UserSettings['sounds']

	const themes: Array<{ id: ThemeId; label: string }> = [
		{ id: 'system', label: 'System' },
		{ id: 'light', label: 'Hell' },
		{ id: 'dark', label: 'Dunkel' },
	]

	const tones: Array<{ id: ToneId; name: string; desc: string }> = [
		{ id: 'glut', name: 'Glut', desc: 'Tiefer Bell-Ton, sanft' },
		{ id: 'funke', name: 'Funke', desc: 'Kurzer hoher Tropfen' },
		{ id: 'kohle', name: 'Kohle', desc: 'Dumpfes Klopfen' },
		{ id: 'klassik', name: 'Klassik', desc: 'iOS-Standard Glocke' },
		{ id: 'lautlos', name: 'Lautlos', desc: 'Nur Vibration' },
	]

	const events: Array<{ key: EventKey; label: string; sub: string }> = [
		{ key: 'putOn', label: 'Auflegen', sub: "wenn's auf den Rost geht" },
		{ key: 'flip', label: 'Wenden', sub: 'auf halber Strecke' },
		{ key: 'done', label: 'Fertig', sub: 'nach Garzeit und Ruhe' },
	]

	let openEvent = $state<EventKey | null>(null)

	onMount(async () => {
		await settingsStore.init()
	})

	function setTheme(t: string) {
		void settingsStore.setTheme(t as ThemeId)
	}

	function setSound(event: EventKey, soundId: ToneId) {
		void settingsStore.setSound(event, soundId)
	}

	function previewTone(id: ToneId, e: Event) {
		e.stopPropagation()
		void play(id).catch(() => {})
	}

	function toggleVibrate() {
		void settingsStore.setVibrate(!settingsStore.vibrate)
	}

	function toneName(id: ToneId): string {
		return tones.find(t => t.id === id)?.name ?? id
	}
</script>

<svelte:head>
	<title>Einstellungen · Grillmi</title>
</svelte:head>

{#if viewport.isDesktop}
	<SettingsCockpit />
{:else}
<main>
	<header>
		<button class="back" onclick={() => goto('/')} aria-label="Zurück">‹</button>
		<h1>Einstellungen</h1>
	</header>

	<section>
		<div class="eyebrow">Darstellung</div>
		<SegmentedControl segments={themes} value={settingsStore.theme} ariaLabel="Darstellung" onchange={setTheme} />
	</section>

	<section>
		<div class="eyebrow">Signale</div>
		<div class="signals">
			{#each events as ev, i (ev.key)}
				{@const open = openEvent === ev.key}
				<div class="signal-row" class:first={i === 0}>
					<button class="signal-head" onclick={() => (openEvent = open ? null : ev.key)} aria-expanded={open}>
						<span class="glyph-well" aria-hidden="true">
							{#if ev.key === 'putOn'}
								<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
									<path
										d="M12 2c1 3-1 4-1 7 0 1.5 1 3 2.5 3S16 10.5 16 9c0-2-1-3-1-4 2 1 5 4 5 8 0 4-3.5 7-8 7s-8-3-8-7c0-3 2-5 4-6.5C7.2 5.7 9 4 12 2z" />
								</svg>
							{:else if ev.key === 'flip'}
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round">
									<path d="M3 12 a9 9 0 0 1 15-6.7 L21 8" />
									<path d="M21 3 v5 h-5" />
								</svg>
							{:else}
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.4"
									stroke-linecap="round"
									stroke-linejoin="round">
									<polyline points="4 12 10 18 20 6" />
								</svg>
							{/if}
						</span>
						<div class="signal-text">
							<div class="signal-label">{ev.label}</div>
							<div class="signal-sub">{ev.sub}</div>
						</div>
						<div class="signal-trail">
							<span class="current-tone">{toneName(settingsStore.sounds[ev.key])}</span>
							<span class="chevron" class:open>›</span>
						</div>
					</button>
					{#if open}
						<div class="tone-list">
							{#each tones as t (t.id)}
								{@const active = settingsStore.sounds[ev.key] === t.id}
								<div class="tone-row">
									<button class="tone-pick" onclick={() => setSound(ev.key, t.id)} aria-pressed={active}>
										<span class="radio" class:active aria-hidden="true">
											{#if active}<span class="radio-dot"></span>{/if}
										</span>
										<div class="tone-text">
											<div class="tone-name">{t.name}</div>
											<div class="tone-desc">{t.desc}</div>
										</div>
									</button>
									<button class="play-btn" onclick={e => previewTone(t.id, e)} aria-label={`${t.name} probehören`} type="button">
										<svg width="11" height="12" viewBox="0 0 11 12" fill="currentColor" aria-hidden="true">
											<path d="M1 1.2v9.6c0 .5.5.8.9.5l8-4.8c.4-.2.4-.8 0-1L1.9.7C1.5.4 1 .7 1 1.2z" />
										</svg>
									</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</section>

	<button class="vibrate-row" onclick={toggleVibrate} aria-pressed={settingsStore.vibrate}>
		<div class="vibrate-text">
			<div class="vibrate-label">Vibration</div>
			<div class="vibrate-sub">zusätzlich zum Ton</div>
		</div>
		<div class="toggle" class:on={settingsStore.vibrate} aria-hidden="true">
			<div class="toggle-knob"></div>
		</div>
	</button>

	<section class="about">
		<div class="eyebrow">Über Grillmi</div>
		<p>Version 1.0.0, gebaut für den Garten.</p>
		<p class="muted">Garzeiten basieren auf Migros Grilltimer, Weber, Serious Eats und Meathead.</p>
	</section>
</main>
{/if}

<style>
	main {
		max-width: 600px;
		margin: 0 auto;
		padding: 0 24px calc(40px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 28px;
		min-height: 100dvh;
	}
	header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: calc(env(safe-area-inset-top) + 12px) 0 16px;
		margin-bottom: -12px;
	}
	header h1 {
		font-family: var(--font-display);
		font-size: 30px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: -0.01em;
		margin: 0;
	}
	.back {
		background: transparent;
		border: none;
		color: var(--color-fg-base);
		font-size: 22px;
		min-width: 44px;
		min-height: 44px;
		cursor: pointer;
		padding: 4px;
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.eyebrow {
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-fg-muted);
	}
	.signals {
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: 16px;
		overflow: hidden;
	}
	.signal-row:not(.first) {
		border-top: 1px solid var(--color-border-subtle);
	}
	.signal-head {
		width: 100%;
		background: transparent;
		border: none;
		padding: 14px 16px;
		display: flex;
		align-items: center;
		gap: 14px;
		cursor: pointer;
		text-align: left;
		color: var(--color-fg-base);
	}
	.glyph-well {
		width: 36px;
		height: 36px;
		border-radius: 10px;
		flex-shrink: 0;
		background: rgba(255, 122, 26, 0.12);
		color: var(--color-ember);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.signal-text {
		flex: 1;
		min-width: 0;
	}
	.signal-label {
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 15px;
		line-height: 1.2;
	}
	.signal-sub {
		font-size: 12px;
		color: var(--color-fg-muted);
		margin-top: 2px;
	}
	.signal-trail {
		display: flex;
		align-items: center;
		gap: 6px;
		font-family: var(--font-body);
		font-size: 13px;
		color: var(--color-fg-muted);
	}
	.current-tone {
		color: var(--color-fg-base);
		font-weight: 600;
	}
	.chevron {
		font-size: 16px;
		display: inline-block;
		transition: transform 0.15s ease;
	}
	.chevron.open {
		transform: rotate(90deg);
	}
	.tone-list {
		padding: 0 12px 14px;
		background: var(--color-bg-base);
		border-top: 1px solid var(--color-border-subtle);
	}
	.tone-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0;
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.tone-row:last-child {
		border-bottom: none;
	}
	.tone-pick {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 8px;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
	}
	.radio {
		width: 18px;
		height: 18px;
		border-radius: 9px;
		border: 2px solid var(--color-border-strong);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.radio.active {
		border-color: var(--color-ember);
	}
	.radio-dot {
		width: 8px;
		height: 8px;
		border-radius: 4px;
		background: var(--color-ember);
	}
	.tone-text {
		flex: 1;
		min-width: 0;
	}
	.tone-name {
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 14px;
		color: var(--color-fg-base);
	}
	.tone-desc {
		font-size: 11px;
		color: var(--color-fg-muted);
		margin-top: 1px;
	}
	.play-btn {
		width: 32px;
		height: 32px;
		border-radius: 16px;
		border: 1px solid var(--color-border-strong);
		background: transparent;
		color: var(--color-fg-base);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}
	.vibrate-row {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 16px;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: 14px;
		color: var(--color-fg-base);
		cursor: pointer;
	}
	.vibrate-text {
		flex: 1;
		text-align: left;
	}
	.vibrate-label {
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 15px;
	}
	.vibrate-sub {
		font-size: 12px;
		color: var(--color-fg-muted);
		margin-top: 2px;
	}
	.toggle {
		width: 44px;
		height: 26px;
		border-radius: 13px;
		background: var(--color-border-strong);
		position: relative;
		transition: background 0.15s ease;
		flex-shrink: 0;
	}
	.toggle.on {
		background: var(--color-ember);
	}
	.toggle-knob {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 20px;
		height: 20px;
		border-radius: 10px;
		background: #fff;
		transition: left 0.15s ease;
	}
	.toggle.on .toggle-knob {
		left: 21px;
	}
	.about {
		gap: 6px;
	}
	.about p {
		margin: 0;
		font-size: 14px;
	}
	.muted {
		color: var(--color-fg-muted);
		font-size: 13px;
	}
</style>
