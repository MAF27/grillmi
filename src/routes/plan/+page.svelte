<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import Button from '$lib/components/Button.svelte'
	import SegmentedControl from '$lib/components/SegmentedControl.svelte'
	import TimePickerSheet from '$lib/components/TimePickerSheet.svelte'
	import PlanItemRow from '$lib/components/PlanItemRow.svelte'
	import AddItemSheet from '$lib/components/AddItemSheet.svelte'
	import DesktopCockpit from '$lib/components/desktop/DesktopCockpit.svelte'
	import { viewport } from '$lib/runtime/viewport.svelte'
	import { grilladeStore } from '$lib/stores/grilladeStore.svelte'
	import { settingsStore } from '$lib/stores/settingsStore.svelte'
	import { favoritesStore } from '$lib/stores/favoritesStore.svelte'
	import { schedule } from '$lib/scheduler/schedule'
	import { formatHHMM } from '$lib/util/format'
	import type { PlannedItem } from '$lib/models'

	type SegmentId = 'now' | 'target' | 'manual'

	const segments: Array<{ id: SegmentId; label: string }> = [
		{ id: 'now', label: 'Jetzt' },
		{ id: 'target', label: 'Auf Zeit' },
		{ id: 'manual', label: 'Manuell' },
	]

	let sheetOpen = $state(false)
	let editing = $state<PlannedItem | null>(null)
	let timePickerOpen = $state(false)


	const plan = $derived(grilladeStore.plan)
	const planMode = $derived(grilladeStore.planMode)
	const isManual = $derived(planMode === 'manual')
	let now = $state(Date.now())
	const effectiveTarget = $derived(grilladeStore.effectiveTargetEpoch(now, settingsStore.leadPutOnSeconds))

	const segmentValue = $derived<SegmentId>(planMode === 'manual' ? 'manual' : plan.mode === 'now' ? 'now' : 'target')

	const scheduleResult = $derived.by(() => {
		if (plan.items.length === 0 || isManual) return null
		return schedule({ targetEpoch: effectiveTarget, items: plan.items, now })
	})

	const overdueItems = $derived(scheduleResult?.items.filter(s => s.overdue).map(s => s.item) ?? [])
	const overdue = $derived(scheduleResult?.overdue ?? false)
	const startEpoch = $derived(effectiveTarget - grilladeStore.longestCookSeconds * 1000)
	const populated = $derived(plan.items.length > 0)

	const goLabel = $derived.by(() => {
		if (plan.items.length === 0) return 'Mindestens ein Eintrag nötig'
		if (isManual) return 'Manuelle Grillade starten'
		return `Los, fertig um ${formatHHMM(effectiveTarget)}`
	})

	onMount(() => {
		const tickId = setInterval(() => (now = Date.now()), 1000)
		;(async () => {
			await grilladeStore.init()
			await settingsStore.init()
			await favoritesStore.init()
			// On mobile, /plan and /session are separate routes; bounce to the live
			// cockpit if a session is already running. On desktop the cockpit
			// renders both states in place, so the redirect would loop.
			if (!viewport.isDesktop && grilladeStore.session && grilladeStore.sessionHasStarted) goto('/session')
		})()
		return () => clearInterval(tickId)
	})

	function pickSegment(id: string) {
		const seg = id as SegmentId
		if (seg === 'manual') grilladeStore.setPlanMode('manual')
		else grilladeStore.setAutoMode(seg === 'now' ? 'now' : 'time')
	}

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
			grilladeStore.updateItem(editing.id, item)
		} else {
			grilladeStore.addItem(item)
		}
		sheetOpen = false
		editing = null
	}

	function deleteItem(id: string) {
		grilladeStore.removeItem(id)
	}

	function renameItem(id: string, label: string) {
		grilladeStore.updateItem(id, { label })
	}

	function adjustCook(id: string, deltaSeconds: number) {
		const current = plan.items.find(i => i.id === id)
		if (!current) return
		grilladeStore.updateItem(id, { cookSeconds: current.cookSeconds + deltaSeconds })
	}

	async function start() {
		if (isManual) await grilladeStore.startManualSession()
		else await grilladeStore.startSession(settingsStore.leadPutOnSeconds)
		await goto('/session')
	}

	function commitTime(epoch: number) {
		grilladeStore.setTargetTime(epoch)
		timePickerOpen = false
	}
</script>

<svelte:head>
	<title>Plan · Grillmi</title>
</svelte:head>

{#if viewport.isDesktop}
	<DesktopCockpit />
{:else}
<main>
	<header>
		<button class="back" onclick={() => goto('/')} aria-label="Zurück">‹</button>
		<h1>Grillade planen</h1>
	</header>

	<div class="plan-shell">
	<div class="scroll">
		<SegmentedControl {segments} value={segmentValue} ariaLabel="Planungsmodus" onchange={pickSegment} />

		{#if !isManual}
			<button
				type="button"
				class="eatcard"
				class:populated
				onclick={() => populated && (timePickerOpen = true)}
				disabled={!populated}>
				<div class="eat-eyebrow">{populated ? 'Fertig um' : 'Noch keine Zielzeit'}</div>
				<div class="eat-row">
					{#if populated}
						<span class="eat-time" data-mask-time>{formatHHMM(effectiveTarget)}</span>
						<span class="eat-meta" data-mask-time>Start {formatHHMM(startEpoch)}</span>
					{:else}
						<span class="eat-time empty">––:––</span>
					{/if}
				</div>
				<div class="eat-hint">
					{populated
						? 'Die längste Grillzeit zählt; kürzere starten gestaffelt.'
						: 'Füg ein Grillstück hinzu, wir rechnen zurück.'}
				</div>
			</button>
		{/if}

		<section>
			<div class="section-header">
				<h2>
					Grillstücke{#if plan.items.length > 0}<span class="count">{plan.items.length} STÜCK</span>{/if}
				</h2>
			</div>

			{#if overdue && !isManual}
				<div class="warning" role="alert">
					Zeit ist knapp. Folgende Einträge müssen sofort starten: {overdueItems.map(i => i.label).join(', ')}.
				</div>
			{/if}

			{#if plan.items.length === 0}
				<button class="empty-add" type="button" onclick={openAddSheet}>
					<div class="plus-icon">+</div>
					<div class="empty-title">Grillstück hinzufügen</div>
					<div class="empty-hint">Steak, Würstchen, Maiskolben, alles was auf den Rost kommt.</div>
				</button>
			{:else}
				<div class="list" role="list">
					{#each plan.items as item (item.id)}
						<PlanItemRow {item} onedit={editItem} ondelete={deleteItem} onrename={renameItem} onadjustcook={adjustCook} />
					{/each}
					<button class="more-add" type="button" onclick={openAddSheet}>
						<span class="plus-glyph">+</span>
						<span>Weiteres Grillstück</span>
					</button>
				</div>
			{/if}
		</section>
	</div>
	</div>

	<div class="bottom">
		<Button variant="primary" size="lg" fullWidth disabled={plan.items.length === 0} onclick={start}>{goLabel}</Button>
	</div>
</main>

{#if sheetOpen}
	<AddItemSheet
		open={sheetOpen}
		initial={editing}
		placement="sheet"
		onclose={() => {
			sheetOpen = false
			editing = null
		}}
		oncommit={commit} />
{/if}


{#if timePickerOpen}
	<TimePickerSheet value={effectiveTarget} oncommit={commitTime} oncancel={() => (timePickerOpen = false)} />
{/if}
{/if}

<style>
	main {
		max-width: 600px;
		margin: 0 auto;
		padding: 0 0 calc(96px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 0;
		min-height: 100dvh;
		position: relative;
	}
	header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: calc(env(safe-area-inset-top) + 12px) 24px 16px;
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
	.scroll {
		padding: 0 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.eatcard {
		position: relative;
		text-align: left;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: 20px;
		padding: 24px 22px;
		cursor: pointer;
		overflow: hidden;
		color: var(--color-fg-base);
		font: inherit;
	}
	.eatcard.populated {
		background: linear-gradient(180deg, var(--color-bg-surface-2) 0%, var(--color-bg-surface) 100%);
		border-color: var(--color-border-strong);
	}
	.eatcard:disabled {
		cursor: default;
	}
	.eat-eyebrow {
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.12em;
		color: var(--color-fg-muted);
		text-transform: uppercase;
	}
	.eat-row {
		display: flex;
		align-items: baseline;
		gap: 16px;
		margin-top: 8px;
	}
	.eat-time {
		font-family: var(--font-display);
		font-size: 76px;
		line-height: 0.85;
		font-weight: 600;
		letter-spacing: -0.03em;
		color: var(--color-fg-base);
		font-variant-numeric: tabular-nums;
	}
	.eat-time.empty {
		font-size: 56px;
		color: var(--color-fg-subtle);
	}
	.eat-meta {
		font-family: var(--font-display);
		font-size: 11px;
		color: var(--color-fg-muted);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.eat-hint {
		font-family: var(--font-body);
		font-size: 13px;
		color: var(--color-fg-muted);
		margin-top: 8px;
		line-height: 1.45;
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.section-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	.section-header h2 {
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		margin: 0;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		flex: 1;
	}
	.section-header .count {
		font-size: 12px;
		color: var(--color-fg-subtle);
		letter-spacing: 0.06em;
		font-variant-numeric: tabular-nums;
	}
	.warning {
		background: var(--color-error-bg);
		color: var(--color-error-default);
		border: 1px solid var(--color-error-default);
		padding: 12px;
		border-radius: 10px;
		font-size: 14px;
	}
	.empty-add {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		border: 1.5px dashed var(--color-ember);
		background: rgba(255, 122, 26, 0.06);
		border-radius: 18px;
		padding: 34px 20px;
		cursor: pointer;
		text-align: center;
		color: var(--color-fg-base);
		font: inherit;
	}
	.plus-icon {
		width: 52px;
		height: 52px;
		border-radius: 26px;
		background: var(--color-ember);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 28px;
		font-weight: 300;
		line-height: 1;
	}
	.empty-title {
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 16px;
	}
	.empty-hint {
		font-family: var(--font-body);
		font-size: 13px;
		color: var(--color-fg-muted);
		line-height: 1.4;
		max-width: 240px;
	}
	.list {
		display: flex;
		flex-direction: column;
	}
	.more-add {
		grid-column: 1 / -1;
		margin-top: 4px;
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		border: 1.5px dashed var(--color-ember);
		background: transparent;
		border-radius: 14px;
		padding: 14px;
		color: var(--color-ember);
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
	}
	.plus-glyph {
		font-size: 18px;
		font-weight: 300;
		line-height: 1;
	}
	.bottom {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		padding: 16px 24px calc(16px + env(safe-area-inset-bottom));
		background: linear-gradient(to top, var(--color-bg-base) 70%, transparent);
		z-index: var(--z-sticky);
	}
</style>
