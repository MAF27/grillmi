<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import SegmentedControl from '$lib/components/SegmentedControl.svelte'
	import RowGroup from '$lib/components/settings/RowGroup.svelte'
	import SettingRow from '$lib/components/settings/SettingRow.svelte'
	import SwatchesRow from '$lib/components/settings/SwatchesRow.svelte'
	import ToggleRow from '$lib/components/settings/ToggleRow.svelte'
	import StepperRow from '$lib/components/settings/StepperRow.svelte'
	import AccountBlock from '$lib/components/settings/AccountBlock.svelte'
	import Toast from '$lib/components/Toast.svelte'
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
	const tones: Array<{ id: ToneId; name: string }> = [
		{ id: 'glut', name: 'Glut' },
		{ id: 'funke', name: 'Funke' },
		{ id: 'kohle', name: 'Kohle' },
		{ id: 'klassik', name: 'Klassik' },
		{ id: 'lautlos', name: 'Lautlos' },
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
	const densities: Array<{ id: DensityId; label: string }> = [
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
	let sessions = $state<SessionRow[]>([])
	let sessionsLoading = $state(false)
	let sessionsError = $state(false)
	let toast = $state<string | null>(null)
	let holding = $state(false)
	let holdTimer: ReturnType<typeof setTimeout> | null = null

	function fmtLead(seconds: number): string {
		if (seconds === 0) return 'Aus'
		if (seconds < 60) return `${seconds} s`
		const m = Math.floor(seconds / 60)
		const s = seconds % 60
		return s ? `${m} min ${s} s` : `${m} min`
	}

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

	function pickTone(event: EventKey, id: ToneId) {
		void settingsStore.setSound(event, id)
		void play(id).catch(() => {})
	}

	function previewTone(e: Event, id: ToneId) {
		e.stopPropagation()
		void play(id).catch(() => {})
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
			<RowGroup>
				{#each events as ev (ev.key)}
					<SettingRow label={ev.label} sub={ev.sub} layout="cockpit">
						{#snippet trailing()}
							<div class="tone-pills">
								{#each tones as tone (tone.id)}
									{@const active = settingsStore.sounds[ev.key] === tone.id}
									<div class="tone-pill" class:active>
										<button type="button" class="tone-pill-pick" onclick={() => pickTone(ev.key, tone.id)} aria-pressed={active}>
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
						{/snippet}
					</SettingRow>
				{/each}
			</RowGroup>

			<div class="subhead">Vorlauf</div>
			<RowGroup>
				<StepperRow
					label="Auflegen-Vorlauf"
					sub="Vorwarnung vor dem Auflegen"
					layout="cockpit"
					value={settingsStore.leadPutOnSeconds}
					formatted={fmtLead(settingsStore.leadPutOnSeconds)}
					step={15}
					onchange={s => settingsStore.setLead('putOn', s)} />
				<StepperRow
					label="Wenden-Vorlauf"
					sub="Vorwarnung vor dem Wenden"
					layout="cockpit"
					value={settingsStore.leadFlipSeconds}
					formatted={fmtLead(settingsStore.leadFlipSeconds)}
					step={15}
					onchange={s => settingsStore.setLead('flip', s)} />
				<StepperRow
					label="Fertig-Vorlauf"
					sub="Vorwarnung vor Garzeit-Ende"
					layout="cockpit"
					value={settingsStore.leadDoneSeconds}
					formatted={fmtLead(settingsStore.leadDoneSeconds)}
					step={15}
					onchange={s => settingsStore.setLead('done', s)} />
			</RowGroup>
			<p class="hint">Aktive Einstellung wird beim Start der nächsten Grillade angewandt.</p>
		{:else if selected === 'display'}
			<h1>Darstellung</h1>
			<RowGroup>
				<SettingRow label="Theme" sub="Hell, dunkel oder System" layout="cockpit">
					{#snippet trailing()}
						<SegmentedControl
							segments={themes}
							value={settingsStore.theme}
							ariaLabel="Theme"
							onchange={id => settingsStore.setTheme(id as UserSettings['theme'])} />
					{/snippet}
				</SettingRow>
				<SwatchesRow
					label="Akzentfarbe"
					sub="für Buttons, Glühen, Highlights"
					layout="cockpit"
					value={settingsStore.accent}
					options={accents}
					onchange={id => settingsStore.setAccent(id as AccentId)} />
				<SettingRow label="Dichte" sub="Wie eng der Cockpit sitzt" layout="cockpit">
					{#snippet trailing()}
						<SegmentedControl
							segments={densities}
							value={settingsStore.density}
							ariaLabel="Dichte"
							onchange={id => settingsStore.setDensity(id as DensityId)} />
					{/snippet}
				</SettingRow>
				<ToggleRow
					label="Fortschrittsringe zeigen"
					sub="auch bei nicht-aktiven Grillstücken"
					layout="cockpit"
					value={settingsStore.showProgressRings}
					onchange={v => settingsStore.setShowProgressRings(v)} />
			</RowGroup>
		{:else if selected === 'units'}
			<h1>Einheiten & Sprache</h1>
			<RowGroup>
				<SettingRow label="Masssystem" sub="Imperial folgt später" layout="cockpit" disabled>
					{#snippet trailing()}
						<SegmentedControl segments={measurements} value="metric" ariaLabel="Masssystem" disabled onchange={() => {}} />
					{/snippet}
				</SettingRow>
				<SettingRow label="Temperatur" sub="Fahrenheit folgt später" layout="cockpit" disabled>
					{#snippet trailing()}
						<SegmentedControl segments={temperatures} value="celsius" ariaLabel="Temperatur" disabled onchange={() => {}} />
					{/snippet}
				</SettingRow>
				<SettingRow label="Sprache" sub="Englisch in Vorbereitung" layout="cockpit" disabled>
					{#snippet trailing()}
						<SegmentedControl segments={languages} value="de" ariaLabel="Sprache" disabled onchange={() => {}} />
					{/snippet}
				</SettingRow>
			</RowGroup>
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
				<div class="rows device-rows">
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
			<AccountBlock {holding} onPasswordChange={changePassword} onSignOut={signOut} onHoldStart={startHold} onHoldEnd={endHold} />
		{/if}
	</section>
	{#if toast}
		<Toast msg={toast} duration={2500} onClose={() => (toast = null)} />
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
	.empty {
		max-width: 820px;
		padding: 22px;
		border-radius: 16px;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		color: var(--color-fg-muted);
	}
	.device-rows {
		max-width: 820px;
	}
	.device-row {
		display: grid;
		grid-template-columns: 44px minmax(0, 1fr) auto;
		gap: 14px;
		align-items: center;
		padding: 16px 18px;
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.device-row:last-child {
		border-bottom: 0;
	}
	.row-text strong {
		display: flex;
		align-items: center;
		gap: 8px;
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
	.rows {
		max-width: 820px;
		border: 1px solid var(--color-border-subtle);
		border-radius: 16px;
		overflow: hidden;
		background: var(--color-bg-surface);
	}
	.hint {
		margin: 12px 0 0;
		color: var(--color-fg-muted);
		font-size: 12px;
	}
</style>
