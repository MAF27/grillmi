<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import Button from '$lib/components/Button.svelte'
	import Card from '$lib/components/Card.svelte'
	import GrilladeCard from '$lib/components/desktop/GrilladeCard.svelte'
	import SectionHeader from '$lib/components/SectionHeader.svelte'
	import Toast from '$lib/components/Toast.svelte'
	import { grilladeStore } from '$lib/stores/grilladeStore.svelte'
	import { grilladenHistoryStore } from '$lib/stores/grilladenHistoryStore.svelte'
	import type { GrilladeRow } from '$lib/stores/db'
	import { formatDuration } from '$lib/util/format'

	let selectedId = $state<string | null>(null)
	let selected = $derived<GrilladeRow | null>(grilladenHistoryStore.finished.find(row => row.id === selectedId) ?? null)
	let saved = $state<Record<string, boolean>>({})
	let note = $state('')
	let editingNote = $state(false)
	let toast = $state<string | null>(null)
	let deleteConfirm = $state(false)
	let itemsState = $state<{ loading: boolean; labels: string[]; unavailable: boolean }>({ loading: false, labels: [], unavailable: false })

	onMount(async () => {
		await grilladenHistoryStore.init()
		await refreshSaved()
	})

	async function refreshSaved() {
		const next: Record<string, boolean> = {}
		for (const row of grilladenHistoryStore.finished) next[row.id] = await grilladenHistoryStore.isSaved(row.id)
		saved = next
	}

	async function select(row: GrilladeRow) {
		selectedId = row.id
		deleteConfirm = false
		editingNote = false
		note = await grilladenHistoryStore.getNote(row.id)
		itemsState = { loading: true, labels: [], unavailable: false }
		const loaded = await grilladenHistoryStore.loadItems(row.id)
		itemsState =
			loaded.ok
				? { loading: false, labels: loaded.items.map(item => item.label || item.cutSlug), unavailable: false }
				: { loading: false, labels: [], unavailable: true }
	}

	async function toggleSaved() {
		if (!selected) return
		saved = { ...saved, [selected.id]: await grilladenHistoryStore.toggleSaved(selected.id) }
	}

	async function saveNote() {
		if (!selected) return
		await grilladenHistoryStore.setNote(selected.id, note)
		editingNote = false
	}

	async function repeat() {
		if (!selected) return
		const loaded = await grilladenHistoryStore.loadItems(selected.id)
		if (!loaded.ok) return
		grilladeStore.loadFromMenu(loaded.items)
		toast = `„${selected.name || 'Grillade'}" als Plan geladen`
		await goto('/plan')
	}

	async function remove() {
		if (!selected) return
		await grilladenHistoryStore.softDelete(selected.id)
		selectedId = null
		toast = 'Grillade gelöscht'
	}

	function duration(row: GrilladeRow) {
		return row.startedEpoch && row.endedEpoch ? formatDuration(Math.round((row.endedEpoch - row.startedEpoch) / 1000)) : '-'
	}
</script>

<svelte:head>
	<title>Grilladen · Grillmi</title>
</svelte:head>

<main class="history">
	{#if selected}
		<button class="back" type="button" onclick={() => (selectedId = null)}>Zurück zu Grilladen</button>
		<SectionHeader kicker="Grillade" title={selected.name || `Grillade vom ${new Date(selected.endedEpoch ?? selected.updatedEpoch).toLocaleDateString('de-CH')}`} />
		<div class="detail-meta">
			<span>{new Date(selected.endedEpoch ?? selected.updatedEpoch).toLocaleDateString('de-CH')}</span>
			{#if saved[selected.id]}<span class="pill">Gespeichert</span>{/if}
		</div>
		<div class="metrics">
			<Card><strong>-</strong><span>Personen</span></Card>
			<Card><strong>{itemsState.labels.length || selected.session?.items.length || selected.planState?.plan.items.length || '-'}</strong><span>Grillstücke</span></Card>
			<Card><strong>{duration(selected)}</strong><span>Dauer</span></Card>
			<Card><strong>{selected.targetEpoch ? new Date(selected.targetEpoch).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) : '-'}</strong><span>Fenster</span></Card>
		</div>
		<div class="detail-grid">
			<Card>
				<h2>Was auf dem Rost war</h2>
				{#if itemsState.loading}
					<p>Lade Details...</p>
				{:else if itemsState.unavailable}
					<p>Details offline nicht verfügbar</p>
				{:else}
					<ol>
						{#each itemsState.labels as label, index}
							<li><span>{String(index + 1).padStart(2, '0')}</span>{label}</li>
						{/each}
					</ol>
				{/if}
				{#if note && !editingNote}
					<div class="note">{note}</div>
				{/if}
			</Card>
			<aside class="actions">
				<Button variant="primary" fullWidth disabled={itemsState.unavailable} onclick={repeat}>Erneut grillen</Button>
				<Button variant="secondary" fullWidth onclick={toggleSaved}>{saved[selected.id] ? 'Gespeichert' : 'Speichern'}</Button>
				{#if editingNote}
					<textarea bind:value={note} placeholder="Wie war's? Was würdest du anders machen?"></textarea>
					<Button variant="primary" fullWidth onclick={saveNote}>Speichern</Button>
					<Button variant="ghost" fullWidth onclick={() => (editingNote = false)}>Abbrechen</Button>
				{:else}
					<Button variant="secondary" fullWidth onclick={() => (editingNote = true)}>{note ? 'Notiz bearbeiten' : 'Notiz hinzufügen'}</Button>
				{/if}
				{#if deleteConfirm}
					<div class="confirm">
						<strong>Wirklich löschen?</strong>
						<Button variant="destructive" fullWidth onclick={remove}>Ja, löschen</Button>
						<Button variant="ghost" fullWidth onclick={() => (deleteConfirm = false)}>Abbrechen</Button>
					</div>
				{:else}
					<Button variant="ghost" fullWidth onclick={() => (deleteConfirm = true)}>Löschen</Button>
				{/if}
			</aside>
		</div>
	{:else}
		<SectionHeader kicker="Grilladen" title="Was du schon gegrillt hast" />
		{#if grilladenHistoryStore.finished.length === 0}
			<button class="empty" type="button" onclick={() => goto('/plan')}>Noch keine Grilladen abgeschlossen<br /><span>Neue Grillade planen</span></button>
		{:else}
			<div class="grid">
				{#each grilladenHistoryStore.finished as row (row.id)}
					<GrilladeCard grillade={row} saved={saved[row.id]} onClick={() => select(row)} />
				{/each}
			</div>
		{/if}
	{/if}
</main>

{#if toast}
	<Toast msg={toast} duration={2500} onClose={() => (toast = null)} />
{/if}

<style>
	.history {
		min-height: 100dvh;
		padding: 32px 36px;
		background: var(--color-bg-base);
		color: var(--color-fg-base);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 14px;
	}
	.empty {
		width: 100%;
		min-height: 150px;
		border: 1px dashed var(--color-border-strong);
		border-radius: 16px;
		background: transparent;
		color: var(--color-fg-muted);
		font: inherit;
		cursor: pointer;
	}
	.empty span {
		color: var(--color-ember);
		font-weight: 700;
	}
	.back {
		margin-bottom: 24px;
		border: 0;
		background: transparent;
		color: var(--color-fg-muted);
		font: inherit;
		cursor: pointer;
	}
	.detail-meta {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 24px;
		color: var(--color-fg-muted);
		font-size: 12px;
		text-transform: uppercase;
	}
	.pill {
		padding: 4px 8px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		color: var(--color-ember);
	}
	.metrics {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 12px;
		margin-bottom: 18px;
	}
	.metrics :global(.card) {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.metrics strong {
		font-family: var(--font-display);
		font-size: 28px;
	}
	.metrics span {
		color: var(--color-fg-muted);
		font-size: 12px;
		text-transform: uppercase;
	}
	.detail-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 280px;
		gap: 18px;
	}
	h2 {
		margin: 0 0 12px;
		font-family: var(--font-display);
		font-size: 20px;
		text-transform: uppercase;
	}
	ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: flex;
		gap: 12px;
		padding: 12px 0;
		border-bottom: 1px solid var(--color-border-subtle);
	}
	li span {
		color: var(--color-fg-muted);
		font-family: var(--font-display);
	}
	.note {
		margin-top: 18px;
		padding-top: 18px;
		border-top: 1px solid var(--color-border-subtle);
		color: var(--color-fg-muted);
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	textarea {
		min-height: 120px;
		padding: 12px;
		border-radius: 10px;
		border: 1px solid var(--color-border-strong);
		background: var(--color-bg-surface);
		color: var(--color-fg-base);
		font: inherit;
		resize: vertical;
	}
	.confirm {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		border-radius: 12px;
		background: var(--color-bg-surface);
	}
	@media (max-width: 1023px) {
		.history {
			padding: 24px;
		}
		.metrics,
		.detail-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
