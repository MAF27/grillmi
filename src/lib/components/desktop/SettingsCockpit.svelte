<script lang="ts">
	import { page } from '$app/state'
	import Button from '$lib/components/Button.svelte'
	import SegmentedControl from '$lib/components/SegmentedControl.svelte'
	import { settingsStore } from '$lib/stores/settingsStore.svelte'
	import { authStore } from '$lib/stores/authStore.svelte'
	import { play } from '$lib/sounds/player'
	import type { UserSettings } from '$lib/models'
	import type { ToneId } from '$lib/schemas'

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

	let selected = $state<GroupId>((page.url.searchParams.get('group') as GroupId) || 'signals')

	function toneName(id: ToneId) {
		return tones.find(tone => tone.id === id)?.name ?? id
	}
</script>

<div class="settings-cockpit">
	<aside class="rail">
		<h2>Einstellungen</h2>
		{#each groups as group (group.id)}
			<button type="button" class:active={selected === group.id} onclick={() => (selected = group.id)}>
				<span>{group.label}</span>
				<span>›</span>
			</button>
		{/each}
	</aside>
	<section class="body">
		{#if selected === 'signals'}
			<h1>Signale & Alarme</h1>
			<div class="rows">
				{#each events as ev (ev.key)}
					<div class="row">
						<div>
							<strong>{ev.label}</strong>
							<span>{ev.sub}</span>
						</div>
						<div class="tone-controls">
							<span>{toneName(settingsStore.sounds[ev.key])}</span>
							{#each tones as tone (tone.id)}
								<button type="button" class:active={settingsStore.sounds[ev.key] === tone.id} onclick={() => settingsStore.setSound(ev.key, tone.id)}>
									{tone.name}
								</button>
							{/each}
						</div>
					</div>
				{/each}
				<button class="row button-row" type="button" onclick={() => settingsStore.setVibrate(!settingsStore.vibrate)}>
					<div><strong>Haptik</strong><span>zusätzlich zum Ton</span></div>
					<span>{settingsStore.vibrate ? 'Ein' : 'Aus'}</span>
				</button>
			</div>
		{:else if selected === 'display'}
			<h1>Darstellung</h1>
			<div class="panel">
				<div class="panel-label">Theme</div>
				<SegmentedControl segments={themes} value={settingsStore.theme} ariaLabel="Darstellung" onchange={id => settingsStore.setTheme(id as UserSettings['theme'])} />
			</div>
			<div class="disabled-row">Akzentfarbe · Dichte · Fortschrittsringe zeigen</div>
		{:else if selected === 'units'}
			<h1>Einheiten & Sprache</h1>
			<div class="disabled-row">Metrisch · Celsius · Deutsch</div>
		{:else if selected === 'devices'}
			<h1>Geräte</h1>
			<div class="disabled-row">Aktive Geräte werden über die Konto-Seite verwaltet.</div>
		{:else}
			<h1>Konto & Datenschutz</h1>
			<div class="account">
				<div class="avatar">{authStore.user?.email.slice(0, 2) ?? 'GM'}</div>
				<div>
					<strong>{authStore.user?.email.split('@')[0] ?? 'Grillmi'}</strong>
					<span>{authStore.user?.email}</span>
				</div>
			</div>
			<div class="actions">
				<Button variant="secondary" onclick={() => location.assign('/forgot-password')}>Passwort ändern</Button>
				<Button variant="secondary" onclick={() => location.assign('/account')}>Konto verwalten</Button>
			</div>
		{/if}
	</section>
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
		padding: 36px 48px;
	}
	h1 {
		margin: 0 0 24px;
		font-family: var(--font-display);
		font-size: 36px;
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
		gap: 20px;
		align-items: center;
		padding: 16px 18px;
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.row:last-child {
		border-bottom: 0;
	}
	.row strong,
	.row span,
	.account strong,
	.account span {
		display: block;
	}
	.row span,
	.account span {
		margin-top: 4px;
		color: var(--color-fg-muted);
		font-size: 12px;
	}
	.tone-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.tone-controls > span {
		width: 80px;
		margin: 0;
	}
	.tone-controls button {
		min-height: 30px;
		padding: 0 10px;
		border-radius: 8px;
		border: 1px solid var(--color-border-strong);
		background: transparent;
		color: var(--color-fg-muted);
		cursor: pointer;
	}
	.tone-controls button.active {
		background: var(--color-ember);
		border-color: var(--color-ember);
		color: var(--color-ember-ink);
	}
	.button-row {
		width: 100%;
		border-left: 0;
		border-right: 0;
		border-top: 0;
		background: transparent;
		color: var(--color-fg-base);
		text-align: left;
		font: inherit;
		cursor: pointer;
	}
	.panel,
	.disabled-row {
		max-width: 620px;
		padding: 18px;
		border-radius: 16px;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
	}
	.panel-label {
		display: block;
		margin-bottom: 12px;
		color: var(--color-fg-muted);
		font-size: 12px;
		font-weight: 700;
		text-transform: uppercase;
	}
	.disabled-row {
		margin-top: 12px;
		color: var(--color-fg-muted);
	}
	.account {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-bottom: 22px;
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
	.actions {
		display: flex;
		gap: 10px;
	}
</style>
