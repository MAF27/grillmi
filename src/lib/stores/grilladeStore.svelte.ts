import type { Plan, PlannedItem, Session, SessionItem } from '$lib/models'
import { schedule, buildSessionItem } from '$lib/scheduler/schedule'
import { debugSync } from '$lib/sync/debug'
import { repairMissingServerRow } from '$lib/sync/coordinator'
import {
	pushGrilladeCreate,
	pushGrilladeUpdate,
	pushPlannedItems,
	pushSessionItems,
} from '$lib/sync/_adapters/pushGrillade'
import {
	createGrilladeLifecycle,
	type AutoMode,
	type PersistencePort,
	type PlanMode,
	type PushPort,
} from '$lib/grillade/lifecycle'
import {
	appendTimelineEvent,
	clearCurrentSession,
	getActiveGrillade,
	getCurrentPlanState,
	getCurrentSession,
	getCurrentTimeline,
	listGrilladen,
	putCurrentPlanState,
	putCurrentSession,
	putGrillade,
	type GrilladeRow,
	type TimelineEvent,
} from './db'

const persistence: PersistencePort = {
	getCurrentSession,
	putCurrentSession,
	clearCurrentSession,
	getCurrentPlanState,
	putCurrentPlanState,
	getCurrentTimeline,
	appendTimelineEvent,
}

async function pushPlannedDraft(plan: Plan): Promise<void> {
	const active = await getActiveGrillade()
	if (!active || active.status !== 'planned') {
		debugSync('grilladeStore', 'push planned skipped', { activeId: active?.id, status: active?.status })
		return
	}
	debugSync('grilladeStore', 'push planned start', {
		id: active.id,
		pushedToServer: Boolean(active.pushedToServer),
		items: plan.items.length,
	})
	await repairMissingServerRow(active)
	if (!(await queueGrillade(active))) return
	active.syncedItemIds = await pushPlannedItems(active, plan.items)
	await putGrillade(active)
	debugSync('grilladeStore', 'push planned queued', { id: active.id, syncedItemIds: active.syncedItemIds })
}

async function pushRunningSession(session: Session | null): Promise<void> {
	const active = await getActiveGrillade()
	if (!active || active.status !== 'running' || !session) {
		debugSync('grilladeStore', 'push running skipped', {
			activeId: active?.id,
			status: active?.status,
			hasSession: Boolean(session),
		})
		return
	}
	debugSync('grilladeStore', 'push running start', {
		id: active.id,
		pushedToServer: Boolean(active.pushedToServer),
		items: session.items.length,
	})
	await repairMissingServerRow(active)
	if (!(await queueGrillade(active))) return
	active.syncedItemIds = await pushSessionItems(active, session.items)
	await putGrillade(active)
	debugSync('grilladeStore', 'push running queued', { id: active.id, syncedItemIds: active.syncedItemIds })
}

async function pushFinishedGrillade(): Promise<void> {
	const all = await listGrilladen()
	const recent = all
		.filter(g => g.status === 'finished' && g.deletedEpoch === null)
		.sort((a, b) => (b.endedEpoch ?? 0) - (a.endedEpoch ?? 0))[0]
	if (!recent) return
	if (!(await queueGrillade(recent))) return
	if (!recent.pushedToServer) await putGrillade(recent)
}

async function queueGrillade(row: GrilladeRow): Promise<boolean> {
	if (!row.pushedToServer) {
		const queued = await pushGrilladeCreate(row)
		if (queued) row.pushedToServer = true
		return queued
	}
	return pushGrilladeUpdate(row)
}

const push: PushPort = {
	pushPlannedDraft,
	pushRunningSession,
	pushFinishedGrillade,
}

function createGrilladeStore() {
	const lifecycle = createGrilladeLifecycle({
		persistence,
		push,
		scheduler: { schedule, buildSessionItem },
	})

	let plan = $state<Plan>(lifecycle.getPlan())
	let session = $state<Session | null>(lifecycle.getSession())
	let planMode = $state<PlanMode>(lifecycle.getPlanMode())
	let sessionTimeline = $state<TimelineEvent[]>(lifecycle.getSessionTimeline())

	function syncFromLifecycle(): void {
		plan = lifecycle.getPlan()
		session = lifecycle.getSession()
		planMode = lifecycle.getPlanMode()
		sessionTimeline = lifecycle.getSessionTimeline()
	}

	lifecycle.subscribe(syncFromLifecycle)

	const cookingItems = $derived(session ? session.items.filter(i => i.status === 'cooking') : [])
	const restingItems = $derived(session ? session.items.filter(i => i.status === 'resting') : [])
	const readyItems = $derived(session ? session.items.filter(i => i.status === 'ready') : [])
	const pendingItems = $derived(session ? session.items.filter(i => i.status === 'pending') : [])
	const platedItems = $derived(session ? session.items.filter(i => i.status === 'plated') : [])
	const allPlated = $derived(
		session ? session.items.length > 0 && session.items.every(i => i.status === 'plated') : false,
	)
	const sessionHasStarted = $derived(lifecycle.getSessionHasStarted())
	const longestCookSeconds = $derived(lifecycle.getLongestCookSeconds())

	return {
		get plan() {
			return plan
		},
		get session() {
			return session
		},
		get cookingItems() {
			return cookingItems
		},
		get restingItems() {
			return restingItems
		},
		get readyItems() {
			return readyItems
		},
		get pendingItems() {
			return pendingItems
		},
		get platedItems() {
			return platedItems
		},
		get allPlated() {
			return allPlated
		},
		get sessionHasStarted() {
			return sessionHasStarted
		},
		get longestCookSeconds() {
			return longestCookSeconds
		},
		get planMode() {
			return planMode
		},
		get mode() {
			return plan.mode
		},
		get sessionTimeline() {
			return sessionTimeline
		},

		async init() {
			debugSync('grilladeStore', 'init start')
			await lifecycle.init()
			debugSync('grilladeStore', 'init done', {
				hasSession: Boolean(session),
				sessionId: session?.id,
				sessionItems: session?.items.length ?? 0,
				planItems: plan.items.length,
				mode: plan.mode,
			})
		},

		async reloadFromStorage() {
			await lifecycle.reloadFromStorage()
			debugSync('grilladeStore', 'reload done', {
				hasSession: Boolean(session),
				sessionId: session?.id,
				sessionItems: session?.items.length ?? 0,
				planItems: plan.items.length,
			})
		},

		async syncActive() {
			debugSync('grilladeStore', 'sync active start', {
				hasSession: Boolean(session),
				sessionId: session?.id,
				sessionItems: session?.items.length ?? 0,
				planItems: plan.items.length,
			})
			await lifecycle.syncActive()
		},

		setTargetTime(epoch: number) {
			lifecycle.setTargetTime(epoch)
		},
		setPlanMode(mode: PlanMode) {
			lifecycle.setPlanMode(mode)
		},
		setAutoMode(mode: AutoMode) {
			lifecycle.setAutoMode(mode)
		},
		effectiveTargetEpoch(now: number = Date.now(), putOnLeadSeconds = 0) {
			return lifecycle.effectiveTargetEpoch(now, putOnLeadSeconds)
		},
		addItem(item: Omit<PlannedItem, 'id'>): PlannedItem {
			return lifecycle.addItem(item)
		},
		updateItem(id: string, patch: Partial<Omit<PlannedItem, 'id'>>) {
			lifecycle.updateItem(id, patch)
		},
		removeItem(id: string) {
			lifecycle.removeItem(id)
		},
		reorderItems(ids: string[]) {
			lifecycle.reorderItems(ids)
		},
		loadFromMenu(items: PlannedItem[]) {
			lifecycle.loadFromMenu(items)
		},
		resetDraft() {
			lifecycle.resetDraft()
		},
		startSession(putOnLeadSeconds = 0): Promise<Session> {
			return lifecycle.startSession(putOnLeadSeconds)
		},
		startManualSession(): Promise<Session> {
			return lifecycle.startManualSession()
		},
		startSessionItem(id: string) {
			return lifecycle.startSessionItem(id)
		},
		patchItem(id: string, patch: Partial<SessionItem>) {
			return lifecycle.patchItem(id, patch)
		},
		plateItem(id: string) {
			return lifecycle.plateItem(id)
		},
		unplateItem(id: string) {
			return lifecycle.unplateItem(id)
		},
		forceReady(id: string) {
			return lifecycle.forceReady(id)
		},
		removeSessionItem(id: string) {
			return lifecycle.removeSessionItem(id)
		},
		appendTimelineEvent(event: TimelineEvent) {
			return lifecycle.appendTimelineEvent(event)
		},
		endSession() {
			return lifecycle.endSession()
		},
		applyRemoteRow(
			remoteSession: Session | null,
			remotePlan: { plan: Plan; planMode: PlanMode } | null,
		) {
			return lifecycle.applyRemoteRow(remoteSession, remotePlan)
		},

		_reset() {
			lifecycle.reset()
			syncFromLifecycle()
		},

		_persistFlush(): Promise<void> {
			return lifecycle.persistFlush()
		},
	}
}

export const grilladeStore = createGrilladeStore()
