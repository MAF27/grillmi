<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import AlarmBanner, { type AlarmKind } from '$lib/components/AlarmBanner.svelte'
	import Button from '$lib/components/Button.svelte'
	import SegmentedControl from '$lib/components/SegmentedControl.svelte'
	import TimePickerSheet from '$lib/components/TimePickerSheet.svelte'
	import TimePickerPopover from '$lib/components/TimePickerPopover.svelte'
	import PlanItemRow from '$lib/components/PlanItemRow.svelte'
	import TimerCard from '$lib/components/TimerCard.svelte'
	import BigTimerCard from '$lib/components/BigTimerCard.svelte'
	import PlanSummaryList from '$lib/components/desktop/PlanSummaryList.svelte'
	import AddItemSheet from '$lib/components/AddItemSheet.svelte'
	import { viewport } from '$lib/runtime/viewport.svelte'
	import { fireAlarm, messageFor, type AlarmEvent } from '$lib/runtime/alarms'
	import { grilladeStore } from '$lib/stores/grilladeStore.svelte'
	import { favoritesStore } from '$lib/stores/favoritesStore.svelte'
	import { menusStore } from '$lib/stores/menusStore.svelte'
	import { schedule, buildSessionItem } from '$lib/scheduler/schedule'
	import { formatHHMM } from '$lib/util/format'
	import type { PlannedItem, SessionItem } from '$lib/models'

	type SegmentId = 'now' | 'target' | 'manual'

	const segments: Array<{ id: SegmentId; label: string }> = [
		{ id: 'now', label: 'Jetzt' },
		{ id: 'target', label: 'Auf Zeit' },
		{ id: 'manual', label: 'Manuell' },
	]

	let sheetOpen = $state(false)
	let editing = $state<PlannedItem | null>(null)
	let saveMenuOpen = $state(false)
	let menuName = $state('')
	let menusSheetOpen = $state(false)
	let timePickerOpen = $state(false)

	const lastSeenStatus = new Map<string, ManualStatus>()

	const plan = $derived(grilladeStore.plan)
	const planMode = $derived(grilladeStore.planMode)
	const isManual = $derived(planMode === 'manual')
	let now = $state(Date.now())
	const effectiveTarget = $derived(grilladeStore.effectiveTargetEpoch(now))

	const segmentValue = $derived<SegmentId>(planMode === 'manual' ? 'manual' : plan.mode === 'now' ? 'now' : 'target')

	const scheduleResult = $derived.by(() => {
		if (plan.items.length === 0 || isManual) return null
		return schedule({ targetEpoch: effectiveTarget, items: plan.items, now })
	})

	const overdueItems = $derived(scheduleResult?.items.filter(s => s.overdue).map(s => s.item) ?? [])
	const overdue = $derived(scheduleResult?.overdue ?? false)
	const startEpoch = $derived(effectiveTarget - grilladeStore.longestCookSeconds * 1000)
	const populated = $derived(plan.items.length > 0)

	type ManualStatus = 'unstarted' | 'cooking' | 'flip' | 'resting' | 'ready' | 'plated'

	function deriveManualStatus(item: PlannedItem, n: number): { status: ManualStatus; etaSec: number } {
		const start = grilladeStore.manualStarts[item.id]
		if (start === undefined || start === null) return { status: 'unstarted', etaSec: item.cookSeconds }
		if (grilladeStore.manualPlated.has(item.id)) return { status: 'plated', etaSec: 0 }
		const cookEnd = start + item.cookSeconds * 1000
		const restEnd = cookEnd + (item.restSeconds || 0) * 1000
		if (n >= restEnd) return { status: 'ready', etaSec: 0 }
		if (n >= cookEnd) return { status: 'resting', etaSec: Math.round((restEnd - n) / 1000) }
		const half = start + (item.cookSeconds * 1000) / 2
		const status: ManualStatus = Math.abs(n - half) < 5000 ? 'flip' : 'cooking'
		return { status, etaSec: Math.round((cookEnd - n) / 1000) }
	}

	const manualSession: SessionItem[] = $derived.by(() =>
		plan.items.map(item => {
			const start = grilladeStore.manualStarts[item.id] ?? Date.now()
			return buildSessionItem(
				item,
				{
					item,
					putOnEpoch: start,
					flipEpoch: item.flipFraction > 0 ? start + (item.cookSeconds * 1000) / 2 : null,
					doneEpoch: start + item.cookSeconds * 1000,
					restingUntilEpoch: start + (item.cookSeconds + item.restSeconds) * 1000,
					overdue: false,
				},
				start,
			)
		}),
	)

	const goLabel = $derived.by(() => {
		if (plan.items.length === 0) return 'Mindestens ein Eintrag nötig'
		return `Los, fertig um ${formatHHMM(effectiveTarget)}`
	})

	const visibleAlarms = $derived(
		grilladeStore.manualAlarms
			.filter(a => !grilladeStore.manualAlarmDismissed.has(a.id))
			.slice()
			.reverse(),
	)
	const alarming = $derived(visibleAlarms[0] ?? null)

	$effect(() => {
		if (!isManual) return
		for (const item of plan.items) {
			const next = deriveManualStatus(item, now).status
			const prev = lastSeenStatus.get(item.id)
			lastSeenStatus.set(item.id, next)
			if (prev === next) continue
			let event: AlarmEvent | null = null
			let kind: AlarmKind | null = null
			if (next === 'flip') {
				event = 'flip'
				kind = 'flip'
			} else if (next === 'resting' || next === 'ready') {
				event = 'done'
				kind = 'ready'
			}
			if (!event || !kind) continue
			const itemName = item.label || item.cutSlug
			const key = `${item.id}-${kind}`
			const exists = grilladeStore.manualAlarms.some(a => a.id === key) || grilladeStore.manualAlarmDismissed.has(key)
			if (exists) continue
			grilladeStore.addManualAlarm({
				id: key,
				itemId: item.id,
				kind,
				itemName,
				message: messageFor(event, itemName),
				firedAt: Date.now(),
			})
			void fireAlarm(event)
		}
		const liveIds = new Set(plan.items.map(i => i.id))
		for (const id of Array.from(lastSeenStatus.keys())) {
			if (!liveIds.has(id)) lastSeenStatus.delete(id)
		}
	})

	function dismissAlarm() {
		if (!alarming) return
		grilladeStore.dismissManualAlarm(alarming.id)
	}

	onMount(() => {
		const tickId = setInterval(() => (now = Date.now()), 1000)
		;(async () => {
			await grilladeStore.init()
			await favoritesStore.init()
			await menusStore.init()
			if (grilladeStore.session) goto('/session')
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
		await grilladeStore.startSession()
		await goto('/session')
	}

	function openSaveMenu() {
		menuName = ''
		saveMenuOpen = true
	}

	async function saveMenu() {
		const name = menuName.trim()
		if (!name) return
		await menusStore.save(name, plan.items)
		saveMenuOpen = false
	}

	function openMenusSheet() {
		menusSheetOpen = true
	}

	function appendMenu(id: string) {
		const m = menusStore.all.find(p => p.id === id)
		if (!m) return
		void menusStore.touch(id)
		grilladeStore.appendFromMenu(m.items)
		menusSheetOpen = false
	}

	function startMatch(id: string) {
		grilladeStore.startManualItem(id)
	}
	function plateMatch(id: string) {
		grilladeStore.plateManualItem(id)
	}

	function commitTime(epoch: number) {
		grilladeStore.setTargetTime(epoch)
		timePickerOpen = false
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

	<div class="plan-shell" class:desktop={viewport.isDesktop}>
	{#if viewport.isDesktop}
		<PlanSummaryList items={plan.items} />
	{/if}
	<div class="scroll">
		<SegmentedControl {segments} value={segmentValue} ariaLabel="Planungsmodus" onchange={pickSegment} />

		{#if !isManual}
			<button
				type="button"
				class="eatcard"
				class:populated
				onclick={() => populated && (timePickerOpen = true)}
				disabled={!populated}>
				<div class="eat-glow" aria-hidden="true"></div>
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
				<div class="section-actions">
					{#if menusStore.all.length > 0}
						<Button variant="accentGhost" size="sm" onclick={openMenusSheet}>★ Menü</Button>
					{/if}
				</div>
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
			{:else if isManual}
				<div class="manual-grid" class:single={plan.items.length === 1} role="list">
					{#each plan.items as item, i (item.id)}
						{@const status = deriveManualStatus(item, now).status}
						{#if status !== 'plated'}
							<div role="listitem">
								{#if viewport.isDesktop}
									<BigTimerCard item={manualSession[i]} status={status as never} onstart={startMatch} onplate={plateMatch} />
								{:else}
									<TimerCard
										item={manualSession[i]}
										status={status as never}
										onstart={startMatch}
										onplate={plateMatch}
										onremove={deleteItem} />
								{/if}
							</div>
						{/if}
					{/each}
					<button class="more-add" type="button" onclick={openAddSheet}>
						<span class="plus-glyph">+</span>
						<span>Weiteres Grillstück</span>
					</button>
				</div>
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

			{#if plan.items.length > 0}
				<button class="save-menu-cta" type="button" onclick={openSaveMenu}>
					<span class="star" aria-hidden="true">★</span>
					Als Menü speichern
				</button>
			{/if}
		</section>
		{#if viewport.isDesktop && !isManual}
			<div class="desktop-start">
				<Button variant="primary" size="lg" fullWidth disabled={plan.items.length === 0} onclick={start}>{goLabel}</Button>
			</div>
		{/if}
	</div>
	</div>

	{#if !isManual && !viewport.isDesktop}
		<div class="bottom">
			<Button variant="primary" size="lg" fullWidth disabled={plan.items.length === 0} onclick={start}>{goLabel}</Button>
		</div>
	{/if}

	{#if isManual && alarming}
		{#key alarming.id}
			<AlarmBanner
				kind={alarming.kind}
				itemName={alarming.itemName}
				count={visibleAlarms.length}
				message={alarming.message}
				onDismiss={dismissAlarm} />
		{/key}
	{/if}
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

{#if menusSheetOpen}
	<div class="scrim" role="presentation" onclick={() => (menusSheetOpen = false)}></div>
	<div class="menu-sheet" role="dialog" aria-modal="true" aria-label="Menü hinzufügen">
		<header class="menu-sheet-header">
			<h2>Menü hinzufügen</h2>
			<button class="dismiss" onclick={() => (menusSheetOpen = false)} aria-label="Schliessen">×</button>
		</header>
		<p class="menu-sheet-hint">Tippe auf ein Menü. Die Einträge werden an deinen Plan angehängt.</p>
		<ul class="menu-list">
			{#each menusStore.all as m (m.id)}
				<li>
					<button class="menu-row" onclick={() => appendMenu(m.id)}>
						<span class="menu-name">{m.name}</span>
						<span class="menu-count">{m.items.length} Einträge</span>
					</button>
				</li>
			{/each}
		</ul>
	</div>
{/if}

{#if saveMenuOpen}
	<div class="scrim" role="presentation" onclick={() => (saveMenuOpen = false)}></div>
	<div class="save-modal" role="dialog" aria-modal="true" aria-label="Als Menü speichern">
		<h3>Als Menü speichern</h3>
		<input type="text" bind:value={menuName} maxlength="40" placeholder="z.B. Sonntagsmenü" />
		<div class="row-buttons">
			<Button variant="ghost" onclick={() => (saveMenuOpen = false)}>Abbrechen</Button>
			<Button variant="primary" onclick={saveMenu}>Speichern</Button>
		</div>
	</div>
{/if}

{#if timePickerOpen}
	{#if viewport.isDesktop}
		<div class="popover-anchor">
			<TimePickerPopover value={effectiveTarget} onConfirm={commitTime} onCancel={() => (timePickerOpen = false)} />
		</div>
	{:else}
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
	.plan-shell.desktop {
		display: grid;
		grid-template-columns: 320px minmax(0, 1fr) minmax(120px, 0.35fr);
		min-height: calc(100dvh - 74px);
	}
	.plan-shell.desktop .scroll {
		min-width: 0;
		padding: 24px 28px 36px;
		max-width: 680px;
	}
	.desktop-start {
		margin-top: 10px;
	}
	.popover-anchor {
		position: fixed;
		left: 50%;
		top: 190px;
		z-index: var(--z-modal);
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
	.eat-glow {
		position: absolute;
		top: -40px;
		right: -40px;
		width: 200px;
		height: 200px;
		background: radial-gradient(circle, rgba(255, 122, 26, 0.13) 0%, transparent 70%);
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.2s ease;
	}
	.eatcard.populated .eat-glow {
		opacity: 1;
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
	.manual-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 12px;
	}
	.manual-grid > [role='listitem'] {
		min-width: 0;
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
	.save-menu-cta {
		margin-top: 12px;
		width: 100%;
		background: transparent;
		border: 1px dashed var(--color-border-strong);
		color: var(--color-fg-muted);
		padding: 12px;
		border-radius: 12px;
		font-family: var(--font-body);
		font-weight: 500;
		font-size: 13px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}
	.save-menu-cta .star {
		font-size: 14px;
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
	.scrim {
		position: fixed;
		inset: 0;
		background: var(--color-bg-overlay);
		z-index: var(--z-modal);
	}
	.save-modal {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		background: var(--color-bg-surface);
		color: var(--color-fg-base);
		border: 1px solid var(--color-border-strong);
		border-radius: 18px;
		padding: 22px;
		width: min(92vw, 420px);
		z-index: calc(var(--z-modal) + 1);
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.save-modal h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: -0.01em;
	}
	.save-modal input {
		min-height: 48px;
		padding: 12px 14px;
		background: var(--color-bg-surface-2);
		border: 1px solid var(--color-border-strong);
		border-radius: 12px;
		color: var(--color-fg-base);
		font-family: var(--font-body);
		font-size: 16px;
	}
	.row-buttons {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}
	.menu-sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		max-height: 75dvh;
		background: var(--color-bg-surface);
		color: var(--color-fg-base);
		border-top-left-radius: 24px;
		border-top-right-radius: 24px;
		padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
		z-index: calc(var(--z-modal) + 1);
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-width: 600px;
		margin: 0 auto;
		overflow: auto;
	}
	.menu-sheet-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.menu-sheet-header h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 600;
		text-transform: uppercase;
	}
	.dismiss {
		background: transparent;
		border: none;
		color: var(--color-fg-base);
		min-width: 44px;
		min-height: 44px;
		font-size: 22px;
		cursor: pointer;
	}
	.menu-sheet-hint {
		font-size: 14px;
		color: var(--color-fg-muted);
		margin: 0;
	}
	.menu-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.menu-row {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 14px 18px;
		min-height: 56px;
		background: var(--color-bg-surface-2);
		border: 1px solid var(--color-border-subtle);
		border-radius: 14px;
		color: var(--color-fg-base);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.menu-name {
		font-weight: 600;
	}
	.menu-count {
		font-size: 14px;
		color: var(--color-fg-muted);
	}
	@media (min-width: 1024px) {
		main {
			max-width: none;
			padding-bottom: 0;
		}
		header {
			padding: 24px 28px 16px;
			border-bottom: 1px solid var(--color-border-subtle);
		}
		.bottom {
			display: none;
		}
		.manual-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.manual-grid.single {
		grid-template-columns: 1fr;
	}
</style>
