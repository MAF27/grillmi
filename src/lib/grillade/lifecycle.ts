import type { Plan, PlannedItem, Session, SessionItem } from '$lib/models'
import { planSchema, sessionSchema } from '$lib/schemas'
import { uuid } from '$lib/util/uuid'
import type { ScheduledItem } from '$lib/scheduler/schedule'
import type { TimelineEvent } from '$lib/stores/db'

export type PlanMode = 'auto' | 'manual'
export type AutoMode = 'now' | 'time'

export const STALE_AFTER_MS = 4 * 60 * 60 * 1000
export const MANUAL_UNSTARTED_HORIZON_MS = 30 * 24 * 60 * 60 * 1000

export interface PersistedPlanState {
	plan: Plan
	planMode: PlanMode
}

export interface SchedulerPort {
	schedule: (input: { targetEpoch: number; items: PlannedItem[]; now: number }) => {
		items: ScheduledItem[]
		overdue: boolean
		earliestPutOn: number
		latestDone: number
	}
	buildSessionItem: (planned: PlannedItem, sched: ScheduledItem, now: number) => SessionItem
}

export interface PersistencePort {
	getCurrentSession(): Promise<Session | undefined>
	putCurrentSession(session: Session): Promise<void>
	clearCurrentSession(): Promise<void>
	getCurrentPlanState(): Promise<PersistedPlanState | undefined>
	putCurrentPlanState(state: PersistedPlanState): Promise<void>
	getCurrentTimeline(): Promise<TimelineEvent[]>
	appendTimelineEvent(event: TimelineEvent): Promise<TimelineEvent[]>
}

export interface PushPort {
	pushPlannedDraft(plan: Plan): Promise<void>
	pushRunningSession(session: Session | null): Promise<void>
	pushFinishedGrillade(): Promise<void>
}

export interface ClockPort {
	now(): number
}

export interface LifecycleConfig {
	persistence: PersistencePort
	push: PushPort
	scheduler: SchedulerPort
	clock?: ClockPort
}

export function defaultPlan(now = Date.now()): Plan {
	return { targetEpoch: now + 60 * 60 * 1000, items: [], mode: 'now' }
}

/**
 * Time everything must finish so each item is ready at the same moment.
 * In 'now' mode: now + max(cookSeconds + restSeconds) so the slowest dish
 * finishes when started immediately and faster dishes are staggered later.
 * In 'time' mode: the user's pinned eating time.
 */
export function effectiveTargetEpoch(p: Plan, now: number, putOnLeadSeconds = 0): number {
	if (p.mode === 'time') return p.targetEpoch
	if (p.items.length === 0) return now
	const longestMs = Math.max(...p.items.map(i => (i.cookSeconds + i.restSeconds) * 1000))
	return now + Math.max(0, putOnLeadSeconds) * 1000 + longestMs
}

export function normalizeSession(stored: Session): Session {
	const parsed = sessionSchema.parse(stored)
	if (parsed.mode === 'manual') return parsed
	const hasManualSentinel = parsed.items.some(
		i => i.putOnEpoch > parsed.createdAtEpoch + MANUAL_UNSTARTED_HORIZON_MS,
	)
	return hasManualSentinel ? { ...parsed, mode: 'manual' } : parsed
}

export function isStaleSession(s: Session, now: number): boolean {
	const lastRelevantEpoch =
		s.mode === 'manual' ? Math.max(s.targetEpoch, ...s.items.map(i => i.restingUntilEpoch)) : s.targetEpoch
	return lastRelevantEpoch < now - STALE_AFTER_MS
}

export interface GrilladeLifecycle {
	getPlan(): Plan
	getSession(): Session | null
	getPlanMode(): PlanMode
	getSessionTimeline(): TimelineEvent[]
	getCookingItems(): SessionItem[]
	getRestingItems(): SessionItem[]
	getReadyItems(): SessionItem[]
	getPendingItems(): SessionItem[]
	getPlatedItems(): SessionItem[]
	getAllPlated(): boolean
	getSessionHasStarted(): boolean
	getLongestCookSeconds(): number
	effectiveTargetEpoch(now?: number, putOnLeadSeconds?: number): number
	subscribe(listener: () => void): () => void
	init(): Promise<void>
	reloadFromStorage(): Promise<void>
	syncActive(): Promise<void>
	setTargetTime(epoch: number): void
	setPlanMode(mode: PlanMode): void
	setAutoMode(mode: AutoMode): void
	addItem(item: Omit<PlannedItem, 'id'>): PlannedItem
	updateItem(id: string, patch: Partial<Omit<PlannedItem, 'id'>>): void
	removeItem(id: string): void
	reorderItems(ids: string[]): void
	loadFromMenu(items: PlannedItem[]): void
	resetDraft(): void
	startSession(putOnLeadSeconds?: number): Promise<Session>
	startManualSession(): Promise<Session>
	startSessionItem(id: string): Promise<void>
	patchItem(id: string, patch: Partial<SessionItem>): Promise<void>
	plateItem(id: string): Promise<void>
	unplateItem(id: string): Promise<void>
	forceReady(id: string): Promise<void>
	removeSessionItem(id: string): Promise<void>
	appendTimelineEvent(event: TimelineEvent): Promise<void>
	endSession(): Promise<void>
	applyRemoteRow(remoteSession: Session | null, remotePlan: PersistedPlanState | null): Promise<void>
	persistFlush(): Promise<void>
	reset(): void
}

export function createGrilladeLifecycle(config: LifecycleConfig): GrilladeLifecycle {
	const { persistence, push, scheduler } = config
	const clock: ClockPort = config.clock ?? { now: () => Date.now() }

	let plan: Plan = defaultPlan(clock.now())
	let session: Session | null = null
	let planMode: PlanMode = 'auto'
	let sessionTimeline: TimelineEvent[] = []
	let initialized = false
	let initInFlight: Promise<void> | null = null
	let pendingPersist: Promise<void> = Promise.resolve()

	const listeners = new Set<() => void>()
	function notify(): void {
		for (const fn of listeners) fn()
	}

	function planItemsCookingMs(p: Plan): number {
		return p.items.length === 0 ? 0 : Math.max(...p.items.map(i => i.cookSeconds + i.restSeconds))
	}

	async function persistSession(): Promise<void> {
		if (session) await persistence.putCurrentSession(session)
	}

	function persistPlan(): Promise<void> {
		pendingPersist = pendingPersist.then(async () => {
			await persistence.putCurrentPlanState({ plan, planMode })
			await push.pushPlannedDraft(plan)
		})
		return pendingPersist
	}

	function filterStatus(status: SessionItem['status']): SessionItem[] {
		return session ? session.items.filter(i => i.status === status) : []
	}

	const lifecycle: GrilladeLifecycle = {
		getPlan: () => plan,
		getSession: () => session,
		getPlanMode: () => planMode,
		getSessionTimeline: () => sessionTimeline,
		getCookingItems: () => filterStatus('cooking'),
		getRestingItems: () => filterStatus('resting'),
		getReadyItems: () => filterStatus('ready'),
		getPendingItems: () => filterStatus('pending'),
		getPlatedItems: () => filterStatus('plated'),
		getAllPlated: () =>
			session ? session.items.length > 0 && session.items.every(i => i.status === 'plated') : false,
		getSessionHasStarted: () =>
			session
				? session.items.some(i => i.putOnEpoch < clock.now() + MANUAL_UNSTARTED_HORIZON_MS)
				: false,
		getLongestCookSeconds: () => planItemsCookingMs(plan),
		effectiveTargetEpoch: (now = clock.now(), putOnLeadSeconds = 0) =>
			effectiveTargetEpoch(plan, now, putOnLeadSeconds),
		subscribe(listener) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		async init() {
			if (initialized) return
			if (initInFlight) return initInFlight
			initInFlight = (async () => {
				try {
					session = null
					sessionTimeline = []
					plan = defaultPlan(clock.now())
					planMode = 'auto'
					const stored = await persistence.getCurrentSession()
					if (stored) {
						const normalized = normalizeSession(stored)
						if (isStaleSession(normalized, clock.now())) {
							await persistence.clearCurrentSession()
						} else {
							session = normalized
							sessionTimeline = await persistence.getCurrentTimeline()
						}
					}
					const storedPlan = await persistence.getCurrentPlanState()
					if (storedPlan) {
						const parsed = planSchema.safeParse(storedPlan.plan)
						if (parsed.success) {
							plan = parsed.data
							planMode = storedPlan.planMode === 'manual' ? 'manual' : 'auto'
						}
					}
					initialized = true
					notify()
				} finally {
					initInFlight = null
				}
			})()
			return initInFlight
		},
		async reloadFromStorage() {
			initialized = false
			initInFlight = null
			await this.init()
		},
		async syncActive() {
			if (session) {
				await push.pushRunningSession(session)
				return
			}
			if (plan.items.length > 0) await push.pushPlannedDraft(plan)
		},
		setTargetTime(epoch) {
			plan = { ...plan, targetEpoch: epoch, mode: 'time' }
			planMode = 'auto'
			void persistPlan()
			notify()
		},
		setPlanMode(mode) {
			planMode = mode
			void persistPlan()
			notify()
		},
		setAutoMode(mode) {
			plan = { ...plan, mode }
			planMode = 'auto'
			void persistPlan()
			notify()
		},
		addItem(item) {
			const created: PlannedItem = { ...item, id: uuid() }
			plan = { ...plan, items: [...plan.items, created] }
			void persistPlan()
			notify()
			return created
		},
		updateItem(id, patch) {
			plan = { ...plan, items: plan.items.map(i => (i.id === id ? { ...i, ...patch } : i)) }
			void persistPlan()
			notify()
		},
		removeItem(id) {
			plan = { ...plan, items: plan.items.filter(i => i.id !== id) }
			void persistPlan()
			notify()
		},
		reorderItems(ids) {
			const map = new Map(plan.items.map(i => [i.id, i]))
			const reordered = ids.map(id => map.get(id)).filter((i): i is PlannedItem => Boolean(i))
			if (reordered.length === plan.items.length) plan = { ...plan, items: reordered }
			void persistPlan()
			notify()
		},
		loadFromMenu(items) {
			plan = {
				targetEpoch: clock.now() + 60 * 60 * 1000,
				items: items.map(i => ({ ...i, id: uuid() })),
				mode: 'now',
			}
			void persistPlan()
			notify()
		},
		resetDraft() {
			plan = defaultPlan(clock.now())
			planMode = 'auto'
			void persistPlan()
			notify()
		},
		async startSession(putOnLeadSeconds = 0) {
			await pendingPersist
			if (plan.items.length === 0) throw new Error('cannot start: no items in plan')
			const now = clock.now()
			const targetEpoch = effectiveTargetEpoch(plan, now, putOnLeadSeconds)
			const result = scheduler.schedule({ targetEpoch, items: plan.items, now })
			const sessionItems: SessionItem[] = plan.items
				.map((p, i) => ({ item: scheduler.buildSessionItem(p, result.items[i], now), index: i }))
				.sort((a, b) => a.item.putOnEpoch - b.item.putOnEpoch || a.index - b.index)
				.map(({ item }) => item)
			const newSession = sessionSchema.parse({
				id: uuid(),
				createdAtEpoch: now,
				targetEpoch,
				endedAtEpoch: null,
				mode: 'auto',
				items: sessionItems,
			})
			session = newSession
			await persistSession()
			plan = defaultPlan(now)
			await persistPlan()
			await push.pushRunningSession(session)
			notify()
			return newSession
		},
		async startManualSession() {
			await pendingPersist
			if (plan.items.length === 0) throw new Error('cannot start: no items in plan')
			const now = clock.now()
			const farFuture = now + 365 * 24 * 60 * 60 * 1000
			const sessionItems: SessionItem[] = plan.items.map(p => ({
				...p,
				putOnEpoch: farFuture,
				flipEpoch: null,
				doneEpoch: farFuture,
				restingUntilEpoch: farFuture,
				status: 'pending',
				overdue: false,
				flipFired: false,
				platedEpoch: null,
				alarmDismissed: { putOn: null, flip: null, ready: null },
				alarmFired: { putOn: null, flip: null, ready: null },
			}))
			const newSession = sessionSchema.parse({
				id: uuid(),
				createdAtEpoch: now,
				targetEpoch: now,
				endedAtEpoch: null,
				mode: 'manual',
				items: sessionItems,
			})
			session = newSession
			await persistSession()
			plan = defaultPlan(now)
			planMode = 'auto'
			await persistPlan()
			await push.pushRunningSession(session)
			notify()
			return newSession
		},
		async startSessionItem(id) {
			if (!session) return
			const target = session.items.find(i => i.id === id)
			if (!target) return
			const now = clock.now()
			const flipEpoch = target.flipFraction > 0 ? now + (target.cookSeconds * 1000) / 2 : null
			const doneEpoch = now + target.cookSeconds * 1000
			const restingUntilEpoch = doneEpoch + target.restSeconds * 1000
			const updated: SessionItem = {
				...target,
				putOnEpoch: now,
				flipEpoch,
				doneEpoch,
				restingUntilEpoch,
				status: 'cooking',
				flipFired: false,
			}
			session = {
				...session,
				mode: 'manual',
				items: session.items.map(i => (i.id === id ? updated : i)),
				targetEpoch: Math.max(session.targetEpoch, restingUntilEpoch),
			}
			await persistSession()
			await push.pushRunningSession(session)
			notify()
		},
		async patchItem(id, patch) {
			if (!session) return
			session = { ...session, items: session.items.map(i => (i.id === id ? { ...i, ...patch } : i)) }
			await persistSession()
			await push.pushRunningSession(session)
			notify()
		},
		async plateItem(id) {
			if (!session) return
			session = {
				...session,
				items: session.items.map(i =>
					i.id === id ? { ...i, status: 'plated', platedEpoch: clock.now() } : i,
				),
			}
			await persistSession()
			await push.pushRunningSession(session)
			notify()
		},
		async unplateItem(id) {
			if (!session) return
			session = {
				...session,
				items: session.items.map(i => (i.id === id ? { ...i, status: 'ready', platedEpoch: null } : i)),
			}
			await persistSession()
			await push.pushRunningSession(session)
			notify()
		},
		async forceReady(id) {
			if (!session) return
			session = { ...session, items: session.items.map(i => (i.id === id ? { ...i, status: 'ready' } : i)) }
			await persistSession()
			await push.pushRunningSession(session)
			notify()
		},
		async removeSessionItem(id) {
			if (!session) return
			session = { ...session, items: session.items.filter(i => i.id !== id) }
			await persistSession()
			await push.pushRunningSession(session)
			notify()
		},
		async appendTimelineEvent(event) {
			if (sessionTimeline.some(e => e.kind === event.kind && e.itemName === event.itemName && e.at === event.at)) {
				return
			}
			sessionTimeline = await persistence.appendTimelineEvent(event)
			notify()
		},
		async endSession() {
			await pendingPersist
			const replayItems: PlannedItem[] = session
				? session.items.map(s => ({
						id: uuid(),
						categorySlug: s.categorySlug,
						cutSlug: s.cutSlug,
						thicknessCm: s.thicknessCm,
						prepLabel: s.prepLabel,
						doneness: s.doneness,
						label: s.label,
						cookSeconds: s.cookSeconds,
						restSeconds: s.restSeconds,
						flipFraction: s.flipFraction,
						idealFlipPattern: s.idealFlipPattern,
						heatZone: s.heatZone,
						grateTempC: s.grateTempC,
					}))
				: []
			await persistence.clearCurrentSession()
			await push.pushFinishedGrillade()
			session = null
			sessionTimeline = []
			plan =
				replayItems.length > 0
					? { targetEpoch: clock.now() + 60 * 60 * 1000, items: replayItems, mode: 'now' }
					: defaultPlan(clock.now())
			planMode = 'auto'
			await persistPlan()
			notify()
		},
		async applyRemoteRow(remoteSession, remotePlan) {
			// The pull adapter calls this when the server delta surfaces a new
			// state for the active grillade row. The lifecycle is the only writer
			// for grillade row state, so all remote-driven updates flow here.
			if (remoteSession) {
				session = remoteSession
				await persistSession()
			}
			if (remotePlan) {
				plan = remotePlan.plan
				planMode = remotePlan.planMode
				await persistence.putCurrentPlanState(remotePlan)
			}
			notify()
		},
		persistFlush: () => pendingPersist,
		reset() {
			plan = defaultPlan(clock.now())
			session = null
			sessionTimeline = []
			planMode = 'auto'
			initialized = false
			pendingPersist = Promise.resolve()
		},
	}

	return lifecycle
}
