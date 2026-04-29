<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import Button from '$lib/components/Button.svelte'
	import SegmentedControl from '$lib/components/SegmentedControl.svelte'
	import { settingsStore } from '$lib/stores/settingsStore.svelte'
	import { authStore } from '$lib/stores/authStore.svelte'
	import { apiFetch } from '$lib/api/client'
	import { resetAll } from '$lib/stores/db'
	import { play } from '$lib/sounds/player'
	import { de } from '$lib/i18n/de'
	import type { UserSettings } from '$lib/models'
	import type { AccentId, DensityId, ToneId } from '$lib/schemas'

	type GroupId = 'signals' | 'display' | 'units' | 'devices' | 'account'
	type EventKey = keyof UserSettings['sounds']

	const groups: Array<{ id: GroupId; label: string }> = [
		{ id: 'signals', label: 'Signale & Alarme' },
		{ id: 'display', label: 'Darstellung' },
		{ id: 'units', label: 'Einheiten & Sprache' },
		{ id: 'devices', label: 'Geräte' },
		{ id: 'account', label: 'Konto & Datenschutz' },
	]
	const tones: Array<{ id: ToneId; name: string; desc: string }> = [
		{ id: 'glut', name: 'Glut', desc: 'Tiefer Bell-Ton, sanft' },
		{ id: 'funke', name: 'Funke', desc: 'Kurzer hoher Tropfen' },
		{ id: 'kohle', name: 'Kohle', desc: 'Dumpfes Klopfen' },
		{ id: 'klassik', name: 'Klassik', desc: 'iOS-Standard Glocke' },
		{ id: 'lautlos', name: 'Lautlos', desc: 'Nur Vibration' },
	]
	const events: Array<{ key: EventKey; label: string; sub: string }> = [
		{ key: 'putOn', label: 'Auflegen-Erinnerung', sub: "wenn's auf den Rost geht" },
		{ key: 'flip', label: 'Wenden-Signal', sub: 'auf halber Strecke' },
		{ key: 'done', label: 'Fertig-Signal', sub: 'nach Garzeit und Ruhe' },
	]
	const themes: Array<{ id: UserSettings['theme']; label: string }> = [
		{ id: 'system', label: 'System' },
		{ id: 'light', label: 'Hell' },
		{ id: 'dark', label: 'Dunkel' },
	]
	const densities = [
		{ id: 'comfortable', label: 'Komfortabel' },
		{ id: 'compact', label: 'Kompakt' },
	]
	const accents: Array<{ id: AccentId; swatch: string; label: string }> = [
		{ id: 'ember', swatch: '#ff7a1a', label: 'Glut' },
		{ id: 'coal', swatch: '#9a4af0', label: 'Kohle' },
		{ id: 'lime', swatch: '#9bd13a', label: 'Limette' },
		{ id: 'sky', swatch: '#3aa3d1', label: 'Himmel' },
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

	interface SessionRow {
		id: string
		device_label: string
		ip_address: string | null
		last_active_at: string
		is_current: boolean
	}

	let selected = $state<GroupId>((page.url.searchParams.get('group') as GroupId) || 'signals')
	let leadFlip = $state(60)
	let leadDone = $state(120)
	let measurement = $state<string>('metric')
	let temperature = $state<string>('celsius')
	let language = $state<string>('de')
	let sessions = $state<SessionRow[]>([])
	let sessionsLoading = $state(false)
	let sessionsError = $state(false)
	let toast = $state<string | null>(null)
	let holding = $state(false)
	let holdTimer: ReturnType<typeof setTimeout> | null = null

	onMount(async () => {
		await loadSessions()
	})

	async function loadSessions() {
		sessionsLoading = true
		sessionsError = false
		try {
			sessions = await apiFetch<SessionRow[]>('/api/auth/sessions')
		} catch {
			sessions = []
			sessionsError = true
		} finally {
			sessionsLoading = false
		}
	}

	function toneName(id: ToneId) {
		return tones.find(tone => tone.id === id)?.name ?? id
	}

	function pickTone(event: EventKey, id: ToneId) {
		void settingsStore.setSound(event, id)
		void play(id).catch(() => {})
	}

	function previewTone(e: Event, id: ToneId) {
		e.stopPropagation()
		void play(id).catch(() => {})
	}

	function adjustLead(which: 'flip' | 'done', delta: number) {
		if (which === 'flip') leadFlip = Math.max(0, Math.min(300, leadFlip + delta))
		else leadDone = Math.max(0, Math.min(600, leadDone + delta))
	}

	async function revoke(id: string) {
		try {
			await apiFetch(`/api/auth/sessions/${id}/revoke`, { method: 'POST' })
		} catch {
			toast = de.auth.genericError
			return
		}
		const wasCurrent = sessions.find(s => s.id === id)?.is_current
		if (wasCurrent) {
			authStore.clear()
			await resetAll()
			await goto('/login')
			return
		}
		await loadSessions()
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

	function fmtLead(seconds: number): string {
		if (seconds === 0) return 'Aus'
		if (seconds < 60) return `${seconds} s`
		const m = Math.floor(seconds / 60)
		const s = seconds % 60
		return s ? `${m} min ${s} s` : `${m} min`
	}

	function deviceGlyph(label: string): string {
		const lower = label.toLowerCase()
		if (lower.includes('iphone') || lower.includes('android') || lower.includes('phone')) return '▭'
		if (lower.includes('ipad') || lower.includes('tablet')) return '▢'
		return '◐'
	}

	function fmtRelative(iso: string): string {
		const then = new Date(iso).getTime()
		if (Number.isNaN(then)) return iso
		const diff = Date.now() - then
		const minutes = Math.round(diff / 60000)
		if (minutes < 1) return 'gerade eben'
		if (minutes < 60) return `vor ${minutes} min`
		const hours = Math.round(minutes / 60)
		if (hours < 24) return `vor ${hours} h`
		const days = Math.round(hours / 24)
		return `vor ${days} d`
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
			: 'GM'
	)
</script>

<div class="settings-cockpit">
	<aside class="rail">
		<h2>Einstellungen</h2>
		{#each groups as group (group.id)}
			<button type="button" class:active={selected === group.id} onclick={() => (selected = group.id)}>
				<span>{group.label}</span>
				<span aria-hidden="true">›</span>
			</button>
		{/each}
	</aside>
	<section class="body">
		{#if selected === 'signals'}
			<h1>Signale & Alarme</h1>
			<div class="rows">
				{#each events as ev (ev.key)}
					<div class="row signal-row">
						<div class="row-text">
							<strong>{ev.label}</strong>
							<span>{ev.sub}</span>
						</div>
						<div class="tone-pills">
							{#each tones as tone (tone.id)}
								{@const active = settingsStore.sounds[ev.key] === tone.id}
								<div class="tone-pill" class:active>
									<button
										type="button"
										class="tone-pill-pick"
										onclick={() => pickTone(ev.key, tone.id)}
										aria-pressed={active}>
										{tone.name}
									</button>
									<button
										type="button"
										class="tone-preview"
										aria-label={`${tone.name} probehören`}
										onclick={e => previewTone(e, tone.id)}>
										<svg width="9" height="10" viewBox="0 0 11 12" fill="currentColor" aria-hidden="true">
											<path d="M1 1.2v9.6c0 .5.5.8.9.5l8-4.8c.4-.2.4-.8 0-1L1.9.7C1.5.4 1 .7 1 1.2z" />
										</svg>
									</button>
								</div>
							{/each}
						</div>
					</div>
				{/each}
				<button class="row toggle-row" type="button" onclick={() => settingsStore.setVibrate(!settingsStore.vibrate)}>
					<div class="row-text">
						<strong>Haptik</strong>
						<span>zusätzlich zum Ton</span>
					</div>
					<div class="toggle" class:on={settingsStore.vibrate} aria-hidden="true">
						<div class="toggle-knob"></div>
					</div>
				</button>
			</div>

			<div class="subhead">Vorlauf</div>
			<div class="rows">
				<div class="row stepper-row">
					<div class="row-text">
						<strong>Wenden-Vorlauf</strong>
						<span>Vorwarnung vor dem Wenden</span>
					</div>
					<div class="stepper">
						<button type="button" onclick={() => adjustLead('flip', -15)} aria-label="weniger">−</button>
						<span>{fmtLead(leadFlip)}</span>
						<button type="button" onclick={() => adjustLead('flip', 15)} aria-label="mehr">+</button>
					</div>
				</div>
				<div class="row stepper-row">
					<div class="row-text">
						<strong>Fertig-Vorlauf</strong>
						<span>Vorwarnung vor Garzeit-Ende</span>
					</div>
					<div class="stepper">
						<button type="button" onclick={() => adjustLead('done', -30)} aria-label="weniger">−</button>
						<span>{fmtLead(leadDone)}</span>
						<button type="button" onclick={() => adjustLead('done', 30)} aria-label="mehr">+</button>
					</div>
				</div>
			</div>
			<p class="hint">Aktive Einstellung wird beim Start der nächsten Grillade angewandt.</p>
		{:else if selected === 'display'}
			<h1>Darstellung</h1>
			<div class="rows">
				<div class="row">
					<div class="row-text">
						<strong>Theme</strong>
						<span>Hell, dunkel oder System</span>
					</div>
					<SegmentedControl
						segments={themes}
						value={settingsStore.theme}
						ariaLabel="Theme"
						onchange={id => settingsStore.setTheme(id as UserSettings['theme'])} />
				</div>
				<div class="row">
					<div class="row-text">
						<strong>Akzentfarbe</strong>
						<span>für Buttons, Glühen, Highlights</span>
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
				<div class="row">
					<div class="row-text">
						<strong>Dichte</strong>
						<span>Wie eng der Cockpit sitzt</span>
					</div>
					<SegmentedControl
						segments={densities}
						value={settingsStore.density}
						ariaLabel="Dichte"
						onchange={id => settingsStore.setDensity(id as DensityId)} />
				</div>
				<button
					class="row toggle-row"
					type="button"
					onclick={() => settingsStore.setShowProgressRings(!settingsStore.showProgressRings)}>
					<div class="row-text">
						<strong>Fortschrittsringe zeigen</strong>
						<span>auch bei nicht-aktiven Grillstücken</span>
					</div>
					<div class="toggle" class:on={settingsStore.showProgressRings} aria-hidden="true">
						<div class="toggle-knob"></div>
					</div>
				</button>
			</div>
		{:else if selected === 'units'}
			<h1>Einheiten & Sprache</h1>
			<div class="rows">
				<div class="row disabled">
					<div class="row-text">
						<strong>Masssystem</strong>
						<span>Gramm und Zentimeter, oder Pfund und Zoll</span>
					</div>
					<SegmentedControl segments={measurements} value={measurement} ariaLabel="Masssystem" disabled onchange={id => (measurement = id)} />
				</div>
				<div class="row disabled">
					<div class="row-text">
						<strong>Temperatur</strong>
						<span>Celsius oder Fahrenheit</span>
					</div>
					<SegmentedControl segments={temperatures} value={temperature} ariaLabel="Temperatur" disabled onchange={id => (temperature = id)} />
				</div>
				<div class="row disabled">
					<div class="row-text">
						<strong>Sprache</strong>
						<span>Englisch in Vorbereitung</span>
					</div>
					<SegmentedControl segments={languages} value={language} ariaLabel="Sprache" disabled onchange={id => (language = id)} />
				</div>
			</div>
			<p class="hint">Imperial, Fahrenheit und English sind in Vorbereitung. Aktuell läuft die App auf Metrisch · Celsius · Deutsch.</p>
		{:else if selected === 'devices'}
			<h1>Geräte</h1>
			{#if sessionsLoading}
				<div class="empty">Lade Geräte…</div>
			{:else if sessionsError}
				<div class="empty">Geräte konnten nicht geladen werden.</div>
			{:else if sessions.length === 0}
				<div class="empty">Keine aktiven Geräte.</div>
			{:else}
				<div class="rows">
					{#each sessions as s (s.id)}
						<div class="row device-row">
							<div class="device-icon" aria-hidden="true">{deviceGlyph(s.device_label)}</div>
							<div class="row-text">
								<strong>{s.device_label}{#if s.is_current}<span class="badge">dieses Gerät</span>{/if}</strong>
								<span>{s.ip_address ?? 'unbekannte IP'} · {fmtRelative(s.last_active_at)}</span>
							</div>
							<button type="button" class="device-revoke" data-session-id={s.id} onclick={() => revoke(s.id)}>Abmelden</button>
						</div>
					{/each}
				</div>
			{/if}
		{:else}
			<h1>Konto & Datenschutz</h1>
			<div class="account-card">
				<div class="avatar">{userInitials}</div>
				<div class="account-id">
					<strong>{authStore.user?.email.split('@')[0] ?? 'Grillmi'}</strong>
					<span>{authStore.user?.email ?? ''}</span>
				</div>
				<Button variant="secondary" onclick={changePassword}>Passwort ändern</Button>
			</div>

			<div class="subhead">Daten</div>
			<div class="rows">
				<div class="row data-row">
					<div class="row-text">
						<strong>Daten exportieren</strong>
						<span>Alle Grilladen und Menüs als JSON</span>
					</div>
					<Button variant="secondary" disabled>Export</Button>
				</div>
				<div class="row data-row">
					<div class="row-text">
						<strong>Grilladen löschen</strong>
						<span>Lokalen Verlauf entfernen, Konto bleibt</span>
					</div>
					<Button variant="secondary" disabled>Löschen</Button>
				</div>
			</div>

			<div class="subhead">Konto</div>
			<div class="account-actions">
				<Button variant="secondary" onclick={signOut}>Abmelden</Button>
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
			</div>
			{#if holding}
				<p class="hint">Halten zum Bestätigen. Loslassen zum Abbrechen.</p>
			{/if}
		{/if}
	</section>
	{#if toast}
		<div class="toast" role="status">{toast}</div>
	{/if}
</div>

<style>
	.settings-cockpit {
		display: grid;
		grid-template-columns: 220px minmax(0, 1fr);
		min-height: 100dvh;
		background: var(--color-bg-base);
		color: var(--color-fg-base);
	}
	.rail {
		padding: 24px 14px;
		background: var(--color-bg-panel);
		border-right: 1px solid var(--color-border-subtle);
	}
	.rail h2 {
		margin: 0;
		padding: 0 10px 12px;
		color: var(--color-fg-muted);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}
	.rail button {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		min-height: 40px;
		padding: 10px;
		border: 0;
		border-left: 2px solid transparent;
		border-radius: 8px;
		background: transparent;
		color: var(--color-fg-muted);
		font: inherit;
		font-size: 13px;
		cursor: pointer;
	}
	.rail button.active {
		background: color-mix(in srgb, var(--color-ember) 8%, transparent);
		border-left-color: var(--color-ember);
		color: var(--color-fg-base);
		font-weight: 600;
	}
	.body {
		padding: var(--density-pad-cockpit-y) var(--density-pad-cockpit-x);
		max-width: 980px;
	}
	h1 {
		margin: 0 0 24px;
		font-family: var(--font-display);
		font-size: 36px;
		text-transform: uppercase;
	}
	.subhead {
		margin: 28px 0 10px;
		color: var(--color-fg-muted);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.rows {
		max-width: 820px;
		border: 1px solid var(--color-border-subtle);
		border-radius: 16px;
		overflow: hidden;
		background: var(--color-bg-surface);
	}
	.row {
		display: grid;
		grid-template-columns: minmax(0, 240px) minmax(0, 1fr);
		gap: 24px;
		align-items: center;
		padding: var(--density-pad-row-y) var(--density-pad-row-x);
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.row:last-child {
		border-bottom: 0;
	}
	.row.disabled .row-text {
		opacity: 0.6;
	}
	.row-text strong {
		display: block;
		font-family: var(--font-body);
		font-size: 14px;
		font-weight: 600;
	}
	.row-text span {
		display: block;
		margin-top: 4px;
		color: var(--color-fg-muted);
		font-size: 12px;
	}
	.tone-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.tone-pill {
		display: inline-flex;
		align-items: stretch;
		border-radius: 8px;
		border: 1px solid var(--color-border-strong);
		background: transparent;
		color: var(--color-fg-muted);
		overflow: hidden;
	}
	.tone-pill.active {
		background: var(--color-ember);
		border-color: var(--color-ember);
		color: var(--color-ember-ink);
	}
	.tone-pill-pick {
		padding: 6px 10px;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.tone-preview {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		padding: 0;
		border: 0;
		border-left: 1px solid var(--color-border-subtle);
		background: transparent;
		color: inherit;
		cursor: pointer;
	}
	.tone-pill.active .tone-preview {
		border-left-color: color-mix(in srgb, var(--color-ember-ink) 30%, transparent);
	}
	.toggle-row {
		width: 100%;
		text-align: left;
		font: inherit;
		background: transparent;
		color: var(--color-fg-base);
		border-left: 0;
		border-right: 0;
		border-top: 0;
		cursor: pointer;
	}
	.toggle {
		justify-self: end;
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
		background: var(--color-ember-ink);
	}
	.toggle.on .toggle-knob {
		left: 21px;
	}
	.stepper {
		display: inline-flex;
		align-items: center;
		gap: 12px;
		padding: 4px 6px;
		border: 1px solid var(--color-border-strong);
		border-radius: 999px;
	}
	.stepper button {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 0;
		background: transparent;
		color: var(--color-fg-base);
		font-size: 18px;
		line-height: 1;
		cursor: pointer;
	}
	.stepper button:hover {
		background: var(--color-bg-base);
	}
	.stepper span {
		min-width: 70px;
		text-align: center;
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
		font-size: 14px;
	}
	.swatches {
		display: flex;
		gap: 10px;
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
	.empty {
		max-width: 820px;
		padding: 22px;
		border-radius: 16px;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		color: var(--color-fg-muted);
	}
	.device-row {
		grid-template-columns: 44px minmax(0, 1fr) auto;
		gap: 14px;
	}
	.device-icon {
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 10px;
		background: color-mix(in srgb, var(--color-ember) 10%, transparent);
		color: var(--color-ember);
		font-size: 22px;
	}
	.device-row .row-text strong {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.badge {
		padding: 2px 8px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--color-ember) 14%, transparent);
		color: var(--color-ember);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.device-revoke {
		min-height: 32px;
		padding: 0 14px;
		border-radius: 8px;
		border: 1px solid var(--color-border-strong);
		background: transparent;
		color: var(--color-fg-base);
		font: inherit;
		font-size: 13px;
		cursor: pointer;
	}
	.account-card {
		display: grid;
		grid-template-columns: 56px minmax(0, 1fr) auto;
		align-items: center;
		gap: 16px;
		max-width: 820px;
		padding: 18px;
		border-radius: 16px;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
	}
	.avatar {
		width: 56px;
		height: 56px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--color-ember), var(--color-ember-dim));
		color: var(--color-ember-ink);
		font-weight: 800;
		text-transform: uppercase;
	}
	.account-id strong {
		display: block;
		font-size: 16px;
		font-weight: 600;
	}
	.account-id span {
		display: block;
		margin-top: 4px;
		color: var(--color-fg-muted);
		font-size: 13px;
	}
	.data-row {
		grid-template-columns: minmax(0, 1fr) auto;
	}
	.account-actions {
		display: flex;
		gap: 12px;
		margin-top: 10px;
	}
	.danger-hold {
		min-height: 40px;
		padding: 0 18px;
		border-radius: 10px;
		border: 1px solid color-mix(in srgb, var(--color-danger, #b00020) 60%, transparent);
		background: transparent;
		color: var(--color-danger, #b00020);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		position: relative;
		overflow: hidden;
	}
	.danger-hold.holding {
		background: var(--color-danger, #b00020);
		color: #fff;
	}
	.hint {
		margin: 12px 0 0;
		color: var(--color-fg-muted);
		font-size: 12px;
	}
	.toast {
		position: fixed;
		bottom: 24px;
		left: 50%;
		transform: translateX(-50%);
		padding: 10px 16px;
		border-radius: 10px;
		background: rgba(0, 0, 0, 0.85);
		color: #fff;
		font-size: 13px;
	}
</style>
