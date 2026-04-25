<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import Button from '$lib/components/Button.svelte'
	import TargetTimePicker from '$lib/components/TargetTimePicker.svelte'
	import PlanItemRow from '$lib/components/PlanItemRow.svelte'
	import AddItemSheet from '$lib/components/AddItemSheet.svelte'
	import { sessionStore } from '$lib/stores/sessionStore.svelte'
	import { favoritesStore } from '$lib/stores/favoritesStore.svelte'
	import { schedule } from '$lib/scheduler/schedule'
	import { formatHHMM } from '$lib/util/format'
	import type { PlannedItem } from '$lib/models'

	let sheetOpen = $state(false)
	let editing = $state<PlannedItem | null>(null)
	let saveAsFavoriteOpen = $state(false)
	let favoriteName = $state('')

	const plan = $derived(sessionStore.plan)

	const scheduleResult = $derived.by(() => {
		if (plan.items.length === 0) return null
		return schedule({ targetEpoch: plan.targetEpoch, items: plan.items, now: Date.now() })
	})

	const overdueItems = $derived(scheduleResult?.items.filter(s => s.overdue).map(s => s.item) ?? [])
	const overdue = $derived(scheduleResult?.overdue ?? false)

	const goLabel = $derived(
		plan.items.length === 0
			? 'Mindestens ein Eintrag nötig'
			: overdue
				? 'Los — jetzt starten'
				: `Los — Essen um ${formatHHMM(plan.targetEpoch)}`,
	)

	onMount(async () => {
		await sessionStore.init()
		await favoritesStore.init()
		if (sessionStore.session) goto('/session')
	})

	function openAddSheet() {
		editing = null
		sheetOpen = true
	}

	function editItem(id: string) {
		const item = plan.items.find(i => i.id === id)
		if (!item) return
		editing = item
		sheetOpen = true
	}

	function commit(item: Omit<PlannedItem, 'id'>) {
		if (editing) {
			sessionStore.updateItem(editing.id, item)
		} else {
			sessionStore.addItem(item)
		}
		sheetOpen = false
		editing = null
	}

	function deleteItem(id: string) {
		sessionStore.removeItem(id)
	}

	async function start() {
		await sessionStore.startSession()
		await goto('/session')
	}

	function openSaveFavorite() {
		favoriteName = ''
		saveAsFavoriteOpen = true
	}

	async function saveFavorite() {
		const name = favoriteName.trim()
		if (!name) return
		await favoritesStore.save(name, plan.items)
		saveAsFavoriteOpen = false
	}
</script>

<svelte:head>
	<title>Plan · Grillmi</title>
</svelte:head>

<main>
	<header>
		<button class="back" onclick={() => goto('/')} aria-label="Zurück">‹</button>
		<h1>Session planen</h1>
	</header>

	<TargetTimePicker value={plan.targetEpoch} onchange={epoch => sessionStore.setTargetTime(epoch)} />

	<section>
		<div class="section-header">
			<h2>Auf den Grill</h2>
			<Button variant="ghost" size="sm" onclick={openAddSheet}>+ Gericht</Button>
		</div>

		{#if overdue}
			<div class="warning" role="alert">
				Zeit ist knapp — folgende Einträge müssen sofort starten: {overdueItems.map(i => i.label).join(', ')}.
			</div>
		{/if}

		{#if plan.items.length === 0}
			<p class="empty">Noch keine Einträge. Tippe auf <strong>+ Gericht</strong> um anzufangen.</p>
		{:else}
			<div class="list" role="list">
				{#each plan.items as item (item.id)}
					<PlanItemRow {item} onedit={editItem} ondelete={deleteItem} />
				{/each}
			</div>
		{/if}
	</section>

	{#if plan.items.length > 0}
		<div class="favorite-row">
			<Button variant="ghost" size="sm" onclick={openSaveFavorite}>Als Favorit speichern</Button>
		</div>
	{/if}

	<div class="bottom">
		<Button variant="primary" size="lg" fullWidth disabled={plan.items.length === 0} onclick={start}>{goLabel}</Button>
	</div>
</main>

<AddItemSheet
	open={sheetOpen}
	initial={editing}
	onclose={() => {
		sheetOpen = false
		editing = null
	}}
	oncommit={commit} />

{#if saveAsFavoriteOpen}
	<div class="scrim" role="presentation" onclick={() => (saveAsFavoriteOpen = false)}></div>
	<dialog open class="favorite-modal" aria-label="Favorit speichern">
		<h3>Favorit speichern</h3>
		<input type="text" bind:value={favoriteName} maxlength="40" placeholder="Name (z.B. Mörgeli-Plausch)" />
		<div class="row-buttons">
			<Button variant="ghost" onclick={() => (saveAsFavoriteOpen = false)}>Abbrechen</Button>
			<Button variant="primary" onclick={saveFavorite}>Speichern</Button>
		</div>
	</dialog>
{/if}

<style>
	main {
		max-width: 600px;
		margin: 0 auto;
		padding: env(safe-area-inset-top) var(--space-4) calc(96px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
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
	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.section-header h2 {
		font-family: var(--font-display);
		font-size: var(--font-size-lg);
		margin: 0;
	}
	.empty {
		color: var(--color-fg-muted);
		text-align: center;
		padding: var(--space-6);
		background: var(--color-bg-surface);
		border-radius: var(--radius-lg);
		border: 1px dashed var(--color-border-default);
	}
	.warning {
		background: var(--color-error-bg);
		color: var(--color-error-default);
		border: 1px solid var(--color-error-default);
		padding: var(--space-3);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
	}
	.list {
		display: flex;
		flex-direction: column;
	}
	.favorite-row {
		display: flex;
		justify-content: center;
	}
	.bottom {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		padding: var(--space-3) var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom));
		background: linear-gradient(to top, var(--color-bg-base) 70%, transparent);
		z-index: var(--z-sticky);
	}
	.scrim {
		position: fixed;
		inset: 0;
		background: var(--color-bg-overlay);
		z-index: var(--z-modal);
	}
	.favorite-modal {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		background: var(--color-bg-elevated);
		color: var(--color-fg-base);
		border: 1px solid var(--color-border-default);
		border-radius: var(--radius-lg);
		padding: var(--space-5);
		width: min(92vw, 420px);
		z-index: calc(var(--z-modal) + 1);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.favorite-modal h3 {
		margin: 0;
		font-family: var(--font-display);
	}
	.favorite-modal input {
		min-height: 44px;
		padding: var(--space-3);
		background: var(--color-bg-input);
		border: 1px solid var(--color-border-default);
		border-radius: var(--radius-md);
		color: var(--color-fg-base);
		font-size: var(--font-size-md);
	}
	.row-buttons {
		display: flex;
		gap: var(--space-2);
		justify-content: flex-end;
	}
</style>
