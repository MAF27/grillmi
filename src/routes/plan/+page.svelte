<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import Button from '$lib/components/Button.svelte'
	import TargetTimePicker from '$lib/components/TargetTimePicker.svelte'
	import PlanItemRow from '$lib/components/PlanItemRow.svelte'
	import AddItemSheet from '$lib/components/AddItemSheet.svelte'
	import { sessionStore } from '$lib/stores/sessionStore.svelte'
	import { favoritesStore } from '$lib/stores/favoritesStore.svelte'
	import { savedPlansStore } from '$lib/stores/savedPlansStore.svelte'
	import { schedule } from '$lib/scheduler/schedule'
	import { formatHHMM } from '$lib/util/format'
	import type { PlannedItem } from '$lib/models'

	let sheetOpen = $state(false)
	let editing = $state<PlannedItem | null>(null)
	let savePlanOpen = $state(false)
	let planName = $state('')
	let savedPlansSheetOpen = $state(false)

	const plan = $derived(sessionStore.plan)
	let now = $state(Date.now())
	const effectiveTarget = $derived(sessionStore.effectiveTargetEpoch(now))

	const scheduleResult = $derived.by(() => {
		if (plan.items.length === 0) return null
		return schedule({ targetEpoch: effectiveTarget, items: plan.items, now })
	})

	const overdueItems = $derived(scheduleResult?.items.filter(s => s.overdue).map(s => s.item) ?? [])
	const overdue = $derived(scheduleResult?.overdue ?? false)

	const goLabel = $derived.by(() => {
		if (plan.items.length === 0) return 'Mindestens ein Eintrag nötig'
		if (plan.mode === 'now') return `Los — fertig um ${formatHHMM(effectiveTarget)}`
		if (overdue) return 'Los — jetzt starten'
		return `Los — Essen um ${formatHHMM(plan.targetEpoch)}`
	})

	onMount(() => {
		const tickId = setInterval(() => (now = Date.now()), 30_000)
		;(async () => {
			await sessionStore.init()
			await favoritesStore.init()
			await savedPlansStore.init()
			if (sessionStore.session) goto('/session')
		})()
		return () => clearInterval(tickId)
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

	function renameItem(id: string, label: string) {
		sessionStore.updateItem(id, { label })
	}

	function adjustCook(id: string, deltaSeconds: number) {
		const current = plan.items.find(i => i.id === id)
		if (!current) return
		sessionStore.updateItem(id, { cookSeconds: current.cookSeconds + deltaSeconds })
	}

	async function start() {
		await sessionStore.startSession()
		await goto('/session')
	}

	function openSavePlan() {
		planName = ''
		savePlanOpen = true
	}

	async function savePlan() {
		const name = planName.trim()
		if (!name) return
		await savedPlansStore.save(name, plan.items)
		savePlanOpen = false
	}

	function openSavedPlansSheet() {
		savedPlansSheetOpen = true
	}

	function appendSavedPlan(id: string) {
		const sp = savedPlansStore.all.find(p => p.id === id)
		if (!sp) return
		void savedPlansStore.touch(id)
		sessionStore.appendFromSavedPlan(sp.items)
		savedPlansSheetOpen = false
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

	<section class="schedule">
		<div class="mode-toggle" role="tablist" aria-label="Planungsmodus">
			<button
				type="button"
				role="tab"
				aria-selected={plan.mode === 'now'}
				class:active={plan.mode === 'now'}
				onclick={() => sessionStore.setPlanMode('now')}>Jetzt starten</button>
			<button
				type="button"
				role="tab"
				aria-selected={plan.mode === 'time'}
				class:active={plan.mode === 'time'}
				onclick={() => sessionStore.setPlanMode('time')}>Auf Uhrzeit</button>
		</div>

		{#if plan.mode === 'now'}
			<div class="now-card">
				<span class="label">Fertig um</span>
				<span class="time">{plan.items.length > 0 ? formatHHMM(effectiveTarget) : '—'}</span>
				<span class="hint">
					{#if plan.items.length === 0}
						Plane Gerichte, dann starten wir sofort.
					{:else}
						Längstes Gericht zählt — kürzere starten gestaffelt.
					{/if}
				</span>
			</div>
		{:else}
			<TargetTimePicker value={plan.targetEpoch} onchange={epoch => sessionStore.setTargetTime(epoch)} />
		{/if}
	</section>

	<section>
		<div class="section-header">
			<h2>Auf den Grill</h2>
			<div class="section-actions">
				{#if savedPlansStore.all.length > 0}
					<Button variant="ghost" size="sm" onclick={openSavedPlansSheet}>★ Plan-Vorlage</Button>
				{/if}
				<Button variant="ghost" size="sm" onclick={openAddSheet}>+ Gericht</Button>
			</div>
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
					<PlanItemRow {item} onedit={editItem} ondelete={deleteItem} onrename={renameItem} onadjustcook={adjustCook} />
				{/each}
			</div>
		{/if}
	</section>

	{#if plan.items.length > 0}
		<div class="favorite-row">
			<Button variant="ghost" size="sm" onclick={openSavePlan}>Plan speichern</Button>
		</div>
	{/if}

	<div class="bottom">
		<Button variant="primary" size="lg" fullWidth disabled={plan.items.length === 0} onclick={start}>{goLabel}</Button>
	</div>
</main>

{#if sheetOpen}
	<AddItemSheet
		open={sheetOpen}
		initial={editing}
		onclose={() => {
			sheetOpen = false
			editing = null
		}}
		oncommit={commit} />
{/if}

{#if savedPlansSheetOpen}
	<div class="scrim" role="presentation" onclick={() => (savedPlansSheetOpen = false)}></div>
	<div class="fav-sheet" role="dialog" aria-modal="true" aria-label="Plan-Vorlage hinzufügen">
		<header class="fav-sheet-header">
			<h2>Plan-Vorlage hinzufügen</h2>
			<button class="dismiss" onclick={() => (savedPlansSheetOpen = false)} aria-label="Schliessen">×</button>
		</header>
		<p class="fav-sheet-hint">Tippe auf eine Plan-Vorlage. Die Einträge werden an deinen Plan angehängt.</p>
		<ul class="fav-list">
			{#each savedPlansStore.all as sp (sp.id)}
				<li>
					<button class="fav-row" onclick={() => appendSavedPlan(sp.id)}>
						<span class="fav-name">{sp.name}</span>
						<span class="fav-count">{sp.items.length} Einträge</span>
					</button>
				</li>
			{/each}
		</ul>
	</div>
{/if}

{#if savePlanOpen}
	<div class="scrim" role="presentation" onclick={() => (savePlanOpen = false)}></div>
	<div class="favorite-modal" role="dialog" aria-modal="true" aria-label="Plan speichern">
		<h3>Plan speichern</h3>
		<input type="text" bind:value={planName} maxlength="40" placeholder="Name (z.B. Mörgeli-Plausch)" />
		<div class="row-buttons">
			<Button variant="ghost" onclick={() => (savePlanOpen = false)}>Abbrechen</Button>
			<Button variant="primary" onclick={savePlan}>Speichern</Button>
		</div>
	</div>
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
	.section-actions {
		display: flex;
		gap: var(--space-2);
	}
	.empty {
		color: var(--color-fg-muted);
		text-align: center;
		padding: var(--space-6);
		background: var(--color-bg-surface);
		border-radius: var(--radius-lg);
		border: 1px dashed var(--color-border-default);
	}
	.schedule {
		gap: var(--space-3);
	}
	.mode-toggle {
		display: flex;
		gap: 2px;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
		padding: 2px;
	}
	.mode-toggle button {
		flex: 1;
		min-height: 40px;
		background: transparent;
		border: none;
		color: var(--color-fg-base);
		font: inherit;
		border-radius: calc(var(--radius-md) - 2px);
		cursor: pointer;
	}
	.mode-toggle button.active {
		background: var(--color-accent-default);
		color: var(--color-fg-on-accent);
	}
	.now-card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
		background: var(--color-bg-surface);
		padding: var(--space-4);
		border-radius: var(--radius-lg);
		border: 1px solid var(--color-border-subtle);
	}
	.now-card .label {
		font-size: var(--font-size-xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-widest);
		color: var(--color-fg-muted);
	}
	.now-card .time {
		font-family: var(--font-mono);
		font-size: var(--font-size-3xl);
		font-variant-numeric: tabular-nums;
		line-height: 1.1;
	}
	.now-card .hint {
		color: var(--color-fg-muted);
		font-size: var(--font-size-sm);
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
	.fav-sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		max-height: 75dvh;
		background: var(--color-bg-elevated);
		color: var(--color-fg-base);
		border-top-left-radius: var(--radius-xl);
		border-top-right-radius: var(--radius-xl);
		padding: var(--space-4);
		padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
		z-index: calc(var(--z-modal) + 1);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		width: 100%;
		max-width: 600px;
		margin: 0 auto;
		overflow: auto;
	}
	.fav-sheet-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.fav-sheet-header h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--font-size-lg);
	}
	.dismiss {
		background: transparent;
		border: none;
		color: var(--color-fg-base);
		min-width: 44px;
		min-height: 44px;
		font-size: var(--font-size-2xl);
		cursor: pointer;
	}
	.fav-sheet-hint {
		font-size: var(--font-size-sm);
		color: var(--color-fg-muted);
		margin: 0;
	}
	.fav-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.fav-row {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-3) var(--space-4);
		min-height: 56px;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
		color: var(--color-fg-base);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.fav-name {
		font-weight: var(--font-weight-semibold);
	}
	.fav-count {
		font-size: var(--font-size-sm);
		color: var(--color-fg-muted);
	}
</style>
