<script lang="ts">
	import { onMount, onDestroy } from 'svelte'
	import { goto } from '$app/navigation'
	import AddItemSheet from '$lib/components/AddItemSheet.svelte'
	import AlarmBanner, { type AlarmKind } from '$lib/components/AlarmBanner.svelte'
	import Button from '$lib/components/Button.svelte'
	import MasterClock from '$lib/components/MasterClock.svelte'
	import PlanItemRow from '$lib/components/PlanItemRow.svelte'
	import SegmentedControl from '$lib/components/SegmentedControl.svelte'
	import TimePickerPopover from '$lib/components/TimePickerPopover.svelte'
	import TimerCard, { type TimerCardStatus } from '$lib/components/TimerCard.svelte'
	import { fireAlarm, messageFor, type AlarmEvent } from '$lib/runtime/alarms'
	import { createTicker, type TickerEvent } from '$lib/runtime/ticker'
	import { favoritesStore } from '$lib/stores/favoritesStore.svelte'
	import { grilladeStore } from '$lib/stores/grilladeStore.svelte'
	import { settingsStore } from '$lib/stores/settingsStore.svelte'
	import { schedule } from '$lib/scheduler/schedule'
	import { preload, unlockAudio } from '$lib/sounds/player'
	import { formatHHMM } from '$lib/util/format'
	import type { PlannedItem, SessionItem } from '$lib/models'

	type SegmentId = 'now' | 'target' | 'manual'
	type StickyAlarm = { id: string; itemId: string; kind: AlarmKind; itemName: string; message: string; firedAt: number }

	const segments: Array<{ id: SegmentId; label: string }> = [
		{ id: 'now', label: 'Jetzt' },
		{ id: 'target', label: 'Auf Zeit' },
		{ id: 'manual', label: 'Manuell' },
	]

	let now = $state(0)
	let mounted = $state(false)
	let sheetOpen = $state(false)
	let editing = $state<PlannedItem | null>(null)
	let timePickerOpen = $state(false)

	let stickyAlarms = $state<StickyAlarm[]>([])
	let pendingDismiss = $state<Set<string>>(new Set())
	let endingForAllPlated = false
	let confirmEndOpen = $state(false)

	const session = $derived(grilladeStore.session)
	const plan = $derived(grilladeStore.plan)
	const planMode = $derived(session?.mode ?? grilladeStore.planMode)
	const isManual = $derived(planMode === 'manual')
	const effectiveTarget = $derived(grilladeStore.effectiveTargetEpoch(now, settingsStore.leadPutOnSeconds))
	const segmentValue = $derived<SegmentId>(planMode === 'manual' ? 'manual' : plan.mode === 'now' ? 'now' : 'target')

	const scheduleResult = $derived.by(() => {
		if (session || plan.items.length === 0 || isManual) return null
		return schedule({ targetEpoch: effectiveTarget, items: plan.items, now })
	})
	const overdueItems = $derived(scheduleResult?.items.filter(s => s.overdue).map(s => s.item) ?? [])
	const overdue = $derived(scheduleResult?.overdue ?? false)
	const startEpoch = $derived(effectiveTarget - grilladeStore.longestCookSeconds * 1000)
	const populated = $derived(plan.items.length > 0)
	const manualEtaEpoch = $derived.by(() => {
		if (!session || session.mode !== 'manual') return null
		const active = session.items.filter(i => i.status !== 'pending' && i.status !== 'plated')
		if (active.length === 0) return null
		return Math.max(...active.map(i => i.restingUntilEpoch))
	})
	const hasRunningTimers = $derived(session ? session.items.some(hasActiveTimer) : false)
	const goLabel = $derived.by(() => {
		if (plan.items.length === 0) return 'Mindestens ein Eintrag nötig'
		if (isManual) return 'Manuelle Grillade starten'
		return `Los, fertig um ${formatHHMM(effectiveTarget)}`
	})

	const dismissedKeys = $derived.by(() => {
		const set = new Set<string>(pendingDismiss)
		if (!session) return set
		for (const item of session.items) {
			if (item.alarmDismissed.putOn != null) set.add(`${item.id}-on`)
			if (item.alarmDismissed.flip != null) set.add(`${item.id}-flip`)
			if (item.alarmDismissed.ready != null) set.add(`${item.id}-ready`)
		}
		return set
	})
	const visibleAlarms = $derived(
		stickyAlarms
			.filter(a => !dismissedKeys.has(a.id))
			.slice()
			.reverse(),
	)
	const alarming = $derived(visibleAlarms[0] ?? null)
	const firingItemId = $derived(alarming?.itemId ?? null)

	let ticker: ReturnType<typeof createTicker> | null = null
	let runtimeOwnedFor: string | null = null
	let tickId: ReturnType<typeof setInterval> | null = null

	onMount(async () => {
		await grilladeStore.init()
		await settingsStore.init()
		await favoritesStore.init()
		now = Date.now()
		mounted = true
		tickId = setInterval(() => (now = Date.now()), 1000)
	})

	onDestroy(() => {
		if (tickId) clearInterval(tickId)
		teardownRuntime()
	})

	$effect(() => {
		if (session && runtimeOwnedFor !== session.id) {
			teardownRuntime()
			setupRuntime(session.id)
		} else if (!session && runtimeOwnedFor) {
			teardownRuntime()
		}
	})

	$effect(() => {
		if (endingForAllPlated) return
		const live = grilladeStore.session
		if (!live) return
		const finished = live.items.length === 0 || live.items.every(i => i.status === 'plated')
		if (!finished) return
		endingForAllPlated = true
		void endSession()
	})

	function setupRuntime(sessionId: string) {
		runtimeOwnedFor = sessionId
		preload([settingsStore.sounds.putOn, settingsStore.sounds.flip, settingsStore.sounds.done]).catch(() => {})
		ticker = createTicker({
			getItems: () => grilladeStore.session?.items ?? [],
			updateItem: (id, patch) => {
				void grilladeStore.patchItem(id, patch)
			},
			getLeads: () => ({
				putOn: settingsStore.leadPutOnSeconds,
				flip: settingsStore.leadFlipSeconds,
				done: settingsStore.leadDoneSeconds,
			}),
			emit: handleTickerEvent,
		})
		ticker.start()
	}

	function teardownRuntime() {
		runtimeOwnedFor = null
		if (ticker) {
			ticker.stop()
			ticker = null
		}
		stickyAlarms = []
		pendingDismiss = new Set()
		endingForAllPlated = false
	}

	function handleTickerEvent(e: TickerEvent) {
		if (e.type === 'resting-complete') return
		const item = grilladeStore.session?.items.find(i => i.id === e.itemId)
		if (!item) return
		const event = e.type as AlarmEvent
		const kind: AlarmKind = event === 'flip' ? 'flip' : event === 'done' ? 'ready' : 'on'
		// Manual mode: the user tapped Los themselves, so the put-on event is
		// the cook telling the app, not the app alerting the cook. The ring
		// starting to run is the only confirmation they want.
		if (event === 'put-on' && grilladeStore.session?.mode === 'manual') return
		const msg = messageFor(event, item.label || item.cutSlug, e.leadSeconds)
		const key = `${item.id}-${kind}`
		if (stickyAlarms.some(a => a.id === key) || dismissedKeys.has(key)) return
		void grilladeStore.appendTimelineEvent({ kind, itemName: item.label || item.cutSlug, at: Date.now() })
		stickyAlarms = [
			...stickyAlarms,
			{
				id: key,
				itemId: item.id,
				kind,
				itemName: item.label || item.cutSlug,
				message: msg,
				firedAt: Date.now(),
			},
		]
		void fireAlarm(event)
	}

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
		if (editing) grilladeStore.updateItem(editing.id, item)
		else grilladeStore.addItem(item)
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
		await unlockAudio()
		if (isManual) await grilladeStore.startManualSession()
		else await grilladeStore.startSession(settingsStore.leadPutOnSeconds)
		await goto('/session')
	}

	function commitTime(epoch: number) {
		grilladeStore.setTargetTime(epoch)
		timePickerOpen = false
	}

	function dismissAlarm() {
		if (!alarming) return
		const item = session?.items.find(i => i.id === alarming.itemId)
		if (!item) return
		const dismissedKey = alarming.kind === 'on' ? 'putOn' : alarming.kind
		pendingDismiss = new Set(pendingDismiss).add(alarming.id)
		void grilladeStore.patchItem(alarming.itemId, {
			alarmDismissed: { ...item.alarmDismissed, [dismissedKey]: Date.now() },
		})
	}

	async function endSession() {
		confirmEndOpen = false
		await grilladeStore.endSession()
	}

	function requestEndSession() {
		if (hasRunningTimers) confirmEndOpen = true
		else void endSession()
	}

	function plateItem(id: string) {
		void grilladeStore.plateItem(id)
	}

	function removeSessionItem(id: string) {
		void grilladeStore.removeSessionItem(id)
	}

	function startSessionItem(id: string) {
		void grilladeStore.startSessionItem(id)
	}

	const UNSTARTED_HORIZON_MS = 30 * 24 * 60 * 60 * 1000
	function hasActiveTimer(item: SessionItem): boolean {
		if (item.status === 'plated') return false
		if (item.status !== 'pending') return true
		return item.putOnEpoch <= Date.now() + UNSTARTED_HORIZON_MS
	}

	function statusFor(item: { status: string; putOnEpoch: number }): TimerCardStatus | undefined {
		if (item.status === 'pending' && item.putOnEpoch > Date.now() + UNSTARTED_HORIZON_MS) return 'unstarted'
		return undefined
	}
</script>

<div class="cockpit">
	<aside class="control-pane">
		{#if !session && mounted}
			<SegmentedControl {segments} value={segmentValue} ariaLabel="Planungsmodus" onchange={pickSegment} />

			{#if !isManual}
				<div class="time-control">
					<button
						type="button"
						class="eatcard"
						class:populated
						aria-expanded={timePickerOpen}
						onclick={() => segmentValue === 'target' && (timePickerOpen = true)}>
						<div class="eat-eyebrow">{segmentValue === 'target' ? 'Fertig um' : 'Bereit um'}</div>
						<div class="eat-row">
							<span class="eat-time" data-mask-time>{formatHHMM(effectiveTarget)}</span>
							{#if populated}
								<span class="eat-meta" data-mask-time>Start {formatHHMM(startEpoch)}</span>
							{/if}
						</div>
						<div class="eat-hint">
							{segmentValue === 'target'
								? 'Wähle die Essenszeit; Grillmi rechnet den Start zurück.'
								: populated
								? 'Die längste Grillzeit zählt; kürzere starten gestaffelt.'
								: 'Sobald du Grillstücke hinzufügst, berechnet Grillmi die frühestmögliche Essenszeit.'}
						</div>
					</button>
					{#if timePickerOpen && segmentValue === 'target'}
						<div class="popover-anchor">
							<TimePickerPopover value={effectiveTarget} onConfirm={commitTime} onCancel={() => (timePickerOpen = false)} />
						</div>
					{/if}
				</div>
			{/if}

			{#if overdue && !isManual}
				<div class="warning" role="alert">
					Zeit ist knapp. Folgende Einträge müssen sofort starten: {overdueItems.map(i => i.label).join(', ')}.
				</div>
			{/if}
		{:else if session}
			<div class="live-controls">
				<div>
					<div class="eat-eyebrow">Modus</div>
					<div class="mode-value">{session.mode === 'manual' ? 'Manuell' : 'Automatisch'}</div>
				</div>
				<Button variant="secondary" fullWidth onclick={requestEndSession}>Grillade beenden</Button>
			</div>
			{#if session.mode === 'manual'}
				<div class="eta-card">
					<div class="eat-eyebrow">Voraussichtlich fertig</div>
					{#if manualEtaEpoch}
						<div class="eta-time" data-mask-time>{formatHHMM(manualEtaEpoch)}</div>
						<div class="eat-hint">Berechnet aus den laufenden Grillstücken.</div>
					{:else}
						<div class="eta-time empty">--:--</div>
						<div class="eat-hint">Tippe auf Los, um die erste Grillzeit zu starten.</div>
					{/if}
				</div>
			{:else if grilladeStore.sessionHasStarted}
				<MasterClock targetEpoch={session.targetEpoch} size="desktop" />
			{:else}
				<div class="awaiting" data-testid="awaiting-start">Tippe auf Los, um die erste Grillzeit zu starten.</div>
			{/if}
			<div class="toast-slot">
				{#if alarming}
					{#key alarming.id}
						<AlarmBanner
							kind={alarming.kind}
							itemName={alarming.itemName}
							count={visibleAlarms.length}
							message={alarming.message}
							placement="top"
							onDismiss={dismissAlarm} />
					{/key}
				{/if}
			</div>
		{/if}
	</aside>

	<section class="centre">
		{#if session}
			<div class="big-grid">
				{#each session.items as item (item.id)}
					<TimerCard
						{item}
						size="lg"
						status={statusFor(item)}
						alarmFiring={firingItemId === item.id}
						onplate={plateItem}
						onstart={startSessionItem}
						onremove={removeSessionItem} />
				{/each}
			</div>
		{:else if mounted}
			<div class="plan-pane">
				<div class="section-header">
					<h2>
						Grillstücke{#if plan.items.length > 0}<span class="count">{plan.items.length} STÜCK</span>{/if}
					</h2>
				</div>

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
						<div class="start-row">
							<Button variant="primary" size="lg" fullWidth disabled={plan.items.length === 0} onclick={start}>{goLabel}</Button>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</section>
</div>

{#if sheetOpen}
	<AddItemSheet
		open={sheetOpen}
		initial={editing}
		placement="drawer"
		onclose={() => {
			sheetOpen = false
			editing = null
		}}
		oncommit={commit} />
{/if}

{#if confirmEndOpen}
	<div class="confirm-scrim" role="presentation" onclick={() => (confirmEndOpen = false)}></div>
	<div class="confirm-end" role="dialog" aria-modal="true" aria-labelledby="desktop-end-title">
		<h2 id="desktop-end-title">Grillade beenden?</h2>
		<p>Alle laufenden Timer werden gestoppt. Die Grillstücke bleiben für eine neue Grillade erhalten.</p>
		<div class="confirm-actions">
			<Button variant="secondary" onclick={() => (confirmEndOpen = false)}>Abbrechen</Button>
			<Button variant="destructive" onclick={endSession}>Beenden</Button>
		</div>
	</div>
{/if}

<style>
	.cockpit {
		--timer-card-width: calc((100dvw - 900px - 56px - 16px) / 2);
		--timer-column-width: calc(var(--timer-card-width) * 3 + 32px + 56px);
		display: grid;
		grid-template-columns: 340px minmax(0, var(--timer-column-width));
		justify-content: start;
		min-height: calc(100dvh - 0px);
		background: var(--color-bg-base);
		color: var(--color-fg-base);
	}
	.control-pane {
		min-width: 0;
		padding: 24px;
		border-right: 1px solid var(--color-border-subtle);
		background: var(--color-bg-panel);
		display: flex;
		flex-direction: column;
		gap: 18px;
		min-height: 100dvh;
	}
	.toast-slot {
		min-height: 0;
	}
	.toast-slot :global(.banner.top) {
		margin-bottom: 0;
	}
	.centre {
		min-width: 0;
		padding: 24px 28px 36px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.control-pane :global(.clock.desktop) {
		padding: 0;
	}
	.control-pane :global(.clock.desktop .time) {
		font-size: 64px;
	}
	.control-pane :global(.clock.desktop .eyebrow) {
		font-size: 11px;
	}
	.big-grid {
		display: grid;
		grid-template-columns: repeat(3, var(--timer-card-width));
		gap: 16px;
		align-items: start;
		justify-content: start;
	}
	.plan-pane {
		display: flex;
		flex-direction: column;
		gap: 16px;
		max-width: 720px;
	}
	.awaiting {
		color: var(--color-fg-muted);
		font-size: 14px;
		text-align: center;
		padding: 20px 16px;
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
	.eta-card {
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: 18px;
		padding: 20px;
	}
	.eta-time {
		margin-top: 8px;
		font-family: var(--font-display);
		font-size: 56px;
		font-weight: 600;
		line-height: 0.9;
		color: var(--color-fg-base);
		font-variant-numeric: tabular-nums;
	}
	.eta-time.empty {
		color: var(--color-fg-subtle);
	}
	.live-controls {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 18px;
		border: 1px solid var(--color-border-subtle);
		border-radius: 18px;
		background: var(--color-bg-surface);
	}
	.mode-value {
		margin-top: 4px;
		font-family: var(--font-display);
		font-size: 32px;
		font-weight: 600;
		line-height: 1;
		text-transform: uppercase;
		color: var(--color-fg-base);
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
		display: grid;
		grid-template-columns: 1fr;
		gap: 16px;
		margin-top: 8px;
	}
	.eat-time {
		font-family: var(--font-display);
		font-size: 64px;
		line-height: 0.85;
		font-weight: 600;
		letter-spacing: -0.03em;
		color: var(--color-fg-base);
		font-variant-numeric: tabular-nums;
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
	.start-row {
		margin-top: 12px;
	}
	.time-control {
		position: relative;
	}
	.popover-anchor {
		position: absolute;
		left: 0;
		top: calc(100% + 8px);
		z-index: var(--z-modal);
	}
	.confirm-scrim {
		position: fixed;
		inset: 0;
		background: var(--color-bg-overlay);
		z-index: var(--z-modal);
	}
	.confirm-end {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(360px, calc(100vw - 32px));
		padding: 22px;
		border: 1px solid var(--color-border-default);
		border-radius: 16px;
		background: var(--color-bg-surface);
		color: var(--color-fg-base);
		z-index: calc(var(--z-modal) + 1);
	}
	.confirm-end h2 {
		margin: 0 0 10px;
		font-family: var(--font-display);
		font-size: 26px;
		font-weight: 600;
		text-transform: uppercase;
	}
	.confirm-end p {
		margin: 0 0 18px;
		color: var(--color-fg-muted);
		font-size: 14px;
		line-height: 1.45;
	}
	.confirm-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	@media (max-width: 1279px) {
		.cockpit {
			--timer-card-width: calc((100dvw - 820px - 56px - 16px) / 2);
			--timer-column-width: calc(var(--timer-card-width) * 3 + 32px + 56px);
			grid-template-columns: 300px minmax(0, var(--timer-column-width));
		}
		.control-pane {
			padding: 20px;
		}
	}
</style>
