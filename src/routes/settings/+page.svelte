<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import SettingsCockpit from '$lib/components/desktop/SettingsCockpit.svelte'
	import SegmentedControl from '$lib/components/SegmentedControl.svelte'
	import Button from '$lib/components/Button.svelte'
	import { viewport } from '$lib/runtime/viewport.svelte'
	import { settingsStore } from '$lib/stores/settingsStore.svelte'
	import { authStore } from '$lib/stores/authStore.svelte'
	import { apiFetch } from '$lib/api/client'
	import { resetAll } from '$lib/stores/db'
	import { de } from '$lib/i18n/de'
	import { play } from '$lib/sounds/player'
	import type { UserSettings } from '$lib/models'
	import type { AccentId, DensityId, ToneId } from '$lib/schemas'

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

	const accents: Array<{ id: AccentId; swatch: string; label: string }> = [
		{ id: 'ember', swatch: '#ff7a1a', label: 'Glut' },
		{ id: 'coal', swatch: '#9a4af0', label: 'Kohle' },
		{ id: 'lime', swatch: '#9bd13a', label: 'Limette' },
		{ id: 'sky', swatch: '#3aa3d1', label: 'Himmel' },
	]

	const densities: Array<{ id: DensityId; label: string }> = [
		{ id: 'comfortable', label: 'Komfortabel' },
		{ id: 'compact', label: 'Kompakt' },
	]

	const measurements = [
		{ id: 'metric', label: 'Metrisch' },
		{ id: 'imperial', label: 'Imperial' },
	]
	const temperatures = [
		{ id: 'celsius', label: '°C' },
		{ id: 'fahrenheit', label: '°F' },
	]
	const languages = [
		{ id: 'de', label: 'Deutsch' },
		{ id: 'en', label: 'English' },
	]

	let openEvent = $state<EventKey | null>(null)
	let toast = $state<string | null>(null)
	let holding = $state(false)
	let holdTimer: ReturnType<typeof setTimeout> | null = null
	function adjustLead(which: 'putOn' | 'flip' | 'done', delta: number) {
		const current =
			which === 'putOn'
				? settingsStore.leadPutOnSeconds
				: which === 'flip'
					? settingsStore.leadFlipSeconds
					: settingsStore.leadDoneSeconds
		void settingsStore.setLead(which, current + delta)
	}

	function fmtLead(seconds: number): string {
		if (seconds === 0) return 'Aus'
		if (seconds < 60) return `${seconds} s`
		const m = Math.floor(seconds / 60)
		const s = seconds % 60
		return s ? `${m} min ${s} s` : `${m} min`
	}

	onMount(async () => {
		await settingsStore.init()
	})

	function setTheme(t: string) {
		void settingsStore.setTheme(t as ThemeId)
	}

	function setSound(event: EventKey, soundId: ToneId) {
		void settingsStore.setSound(event, soundId)
		void play(soundId).catch(() => {})
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

	async function changePassword() {
		if (!authStore.user) return
		try {
			await apiFetch('/api/auth/forgot-password', {
				method: 'POST',
				body: JSON.stringify({ email: authStore.user.email }),
			})
			toast = de.auth.resetEmailSent
		} catch {
			toast = de.auth.genericError
		}
	}

	async function signOut() {
		try {
			await apiFetch('/api/auth/logout', { method: 'POST' })
		} catch {
			/* best effort */
		}
		authStore.clear()
		await resetAll()
		await goto('/login')
	}

	function startHold() {
		if (holding) return
		holding = true
		holdTimer = setTimeout(async () => {
			holding = false
			try {
				await apiFetch('/api/auth/account', { method: 'DELETE' })
				await resetAll()
				authStore.clear()
				toast = de.auth.accountDeleted
				await goto('/login')
			} catch {
				toast = de.auth.genericError
			}
		}, 1500)
	}

	function endHold() {
		if (holdTimer) {
			clearTimeout(holdTimer)
			holdTimer = null
		}
		holding = false
	}

	const userInitials = $derived(
		authStore.user?.email
			? authStore.user.email
					.split('@')[0]
					.split(/[._-]/)
					.filter(Boolean)
					.map(part => part[0])
					.slice(0, 2)
					.join('')
					.toUpperCase()
			: 'GM',
	)
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
		<SegmentedControl segments={themes} value={settingsStore.theme} ariaLabel="Theme" onchange={setTheme} />
		<div class="rows">
			<div class="setting-row">
				<div class="setting-text">
					<div class="setting-label">Akzentfarbe</div>
					<div class="setting-sub">Buttons, Glühen, Highlights</div>
				</div>
				<div class="swatches">
					{#each accents as a (a.id)}
						<button
							type="button"
							class="swatch"
							class:active={settingsStore.accent === a.id}
							style="--swatch: {a.swatch}"
							aria-label={a.label}
							aria-pressed={settingsStore.accent === a.id}
							onclick={() => settingsStore.setAccent(a.id)}></button>
					{/each}
				</div>
			</div>
			<div class="setting-row stack">
				<div class="setting-text">
					<div class="setting-label">Dichte</div>
					<div class="setting-sub">Wie eng der Inhalt sitzt</div>
				</div>
				<SegmentedControl
					segments={densities}
					value={settingsStore.density}
					ariaLabel="Dichte"
					onchange={id => settingsStore.setDensity(id as DensityId)} />
			</div>
			<button
				type="button"
				class="setting-row toggle-row"
				onclick={() => settingsStore.setShowProgressRings(!settingsStore.showProgressRings)}
				aria-pressed={settingsStore.showProgressRings}>
				<div class="setting-text">
					<div class="setting-label">Fortschrittsringe zeigen</div>
					<div class="setting-sub">auch bei nicht-aktiven Grillstücken</div>
				</div>
				<div class="toggle" class:on={settingsStore.showProgressRings} aria-hidden="true">
					<div class="toggle-knob"></div>
				</div>
			</button>
		</div>
	</section>

	<section>
		<div class="eyebrow">Einheiten & Sprache</div>
		<div class="rows">
			<div class="setting-row stack disabled">
				<div class="setting-text">
					<div class="setting-label">Masssystem</div>
					<div class="setting-sub">Imperial folgt später</div>
				</div>
				<SegmentedControl segments={measurements} value="metric" ariaLabel="Masssystem" disabled onchange={() => {}} />
			</div>
			<div class="setting-row stack disabled">
				<div class="setting-text">
					<div class="setting-label">Temperatur</div>
					<div class="setting-sub">Fahrenheit folgt später</div>
				</div>
				<SegmentedControl segments={temperatures} value="celsius" ariaLabel="Temperatur" disabled onchange={() => {}} />
			</div>
			<div class="setting-row stack disabled">
				<div class="setting-text">
					<div class="setting-label">Sprache</div>
					<div class="setting-sub">Englisch in Vorbereitung</div>
				</div>
				<SegmentedControl segments={languages} value="de" ariaLabel="Sprache" disabled onchange={() => {}} />
			</div>
		</div>
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

	<section>
		<div class="eyebrow">Vorlauf</div>
		<div class="rows">
			<div class="setting-row stepper">
				<div class="setting-text">
					<div class="setting-label">Auflegen-Vorlauf</div>
					<div class="setting-sub">Vorwarnung vor dem Auflegen</div>
				</div>
				<div class="stepper-pill">
					<button type="button" onclick={() => adjustLead('putOn', -15)} aria-label="weniger">−</button>
					<span>{fmtLead(settingsStore.leadPutOnSeconds)}</span>
					<button type="button" onclick={() => adjustLead('putOn', 15)} aria-label="mehr">+</button>
				</div>
			</div>
			<div class="setting-row stepper">
				<div class="setting-text">
					<div class="setting-label">Wenden-Vorlauf</div>
					<div class="setting-sub">Vorwarnung vor dem Wenden</div>
				</div>
				<div class="stepper-pill">
					<button type="button" onclick={() => adjustLead('flip', -15)} aria-label="weniger">−</button>
					<span>{fmtLead(settingsStore.leadFlipSeconds)}</span>
					<button type="button" onclick={() => adjustLead('flip', 15)} aria-label="mehr">+</button>
				</div>
			</div>
			<div class="setting-row stepper">
				<div class="setting-text">
					<div class="setting-label">Fertig-Vorlauf</div>
					<div class="setting-sub">Vorwarnung vor Garzeit-Ende</div>
				</div>
				<div class="stepper-pill">
					<button type="button" onclick={() => adjustLead('done', -15)} aria-label="weniger">−</button>
					<span>{fmtLead(settingsStore.leadDoneSeconds)}</span>
					<button type="button" onclick={() => adjustLead('done', 15)} aria-label="mehr">+</button>
				</div>
			</div>
		</div>
	</section>

	{#if authStore.isAuthenticated}
		<section>
			<div class="eyebrow">Konto & Datenschutz</div>
			<div class="account-card">
				<div class="avatar">{userInitials}</div>
				<div class="account-id">
					<div class="account-name">{authStore.user?.email.split('@')[0] ?? 'Grillmi'}</div>
					<div class="account-email">{authStore.user?.email ?? ''}</div>
				</div>
			</div>
			<div class="account-actions">
				<Button variant="secondary" fullWidth onclick={changePassword}>Passwort ändern</Button>
				<Button variant="secondary" fullWidth onclick={signOut}>Abmelden</Button>
				<button
					type="button"
					id="delete-account-hold"
					class="danger-hold"
					class:holding
					onpointerdown={startHold}
					onpointerup={endHold}
					onpointerleave={endHold}
					onpointercancel={endHold}>
					Konto löschen
				</button>
				{#if holding}
					<p class="hint">Halten zum Bestätigen. Loslassen zum Abbrechen.</p>
				{/if}
			</div>
		</section>
	{/if}

	<section class="about">
		<div class="eyebrow">Über Grillmi</div>
		<p>Version 1.0.0, gebaut für den Garten.</p>
		<p class="muted">Garzeiten basieren auf Migros Grilltimer, Weber, Serious Eats und Meathead.</p>
	</section>

	{#if toast}
		<div class="toast" role="status">{toast}</div>
	{/if}
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
		background: var(--color-fg-base);
		transition: left 0.15s ease;
	}
	.toggle.on .toggle-knob {
		left: 21px;
		background: var(--color-ember-ink);
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
	.rows {
		display: flex;
		flex-direction: column;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: 16px;
		overflow: hidden;
	}
	.setting-row {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 16px;
		background: transparent;
		border: 0;
		border-top: 1px solid var(--color-border-subtle);
		color: var(--color-fg-base);
		font: inherit;
		text-align: left;
		cursor: default;
	}
	.setting-row:first-child {
		border-top: 0;
	}
	.setting-row.toggle-row {
		cursor: pointer;
	}
	.setting-row.stack {
		flex-direction: column;
		align-items: stretch;
		gap: 10px;
	}
	.setting-row.disabled .setting-text {
		opacity: 0.55;
	}
	.setting-text {
		flex: 1;
		min-width: 0;
	}
	.setting-label {
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 15px;
		line-height: 1.2;
	}
	.setting-sub {
		margin-top: 2px;
		font-size: 12px;
		color: var(--color-fg-muted);
	}
	.stepper-pill {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 4px 6px;
		border: 1px solid var(--color-border-strong);
		border-radius: 999px;
		flex-shrink: 0;
	}
	.stepper-pill button {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: 0;
		background: transparent;
		color: var(--color-fg-base);
		font-size: 18px;
		line-height: 1;
		cursor: pointer;
	}
	.stepper-pill span {
		min-width: 64px;
		text-align: center;
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
		font-size: 14px;
	}
	.swatches {
		display: flex;
		gap: 8px;
		flex-shrink: 0;
	}
	.swatch {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 2px solid transparent;
		background: var(--swatch);
		cursor: pointer;
		padding: 0;
		box-shadow: inset 0 0 0 2px var(--color-bg-surface);
	}
	.swatch.active {
		border-color: var(--color-fg-base);
	}
	.account-card {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 16px;
		border-radius: 16px;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
	}
	.avatar {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--color-ember), var(--color-ember-dim));
		color: var(--color-ember-ink);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 800;
		font-size: 16px;
		text-transform: uppercase;
		flex-shrink: 0;
	}
	.account-id {
		min-width: 0;
		flex: 1;
	}
	.account-name {
		font-family: var(--font-body);
		font-size: 15px;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.account-email {
		margin-top: 2px;
		font-size: 12px;
		color: var(--color-fg-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.account-actions {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 10px;
	}
	.danger-hold {
		min-height: 48px;
		padding: 0 18px;
		border-radius: 12px;
		border: 1px solid color-mix(in srgb, var(--color-error-default) 60%, transparent);
		background: transparent;
		color: var(--color-error-default);
		font: inherit;
		font-weight: 600;
		font-size: 15px;
		cursor: pointer;
		transition: background 0.15s ease;
	}
	.danger-hold.holding {
		background: var(--color-error-default);
		color: #fff;
	}
	.hint {
		margin: 6px 0 0;
		color: var(--color-fg-muted);
		font-size: 12px;
		text-align: center;
	}
	.toast {
		position: fixed;
		bottom: 24px;
		left: 50%;
		transform: translateX(-50%);
		padding: 10px 16px;
		border-radius: 10px;
		background: var(--color-fg-base);
		color: var(--color-bg-base);
		font-size: 13px;
		z-index: var(--z-toast);
	}
</style>
