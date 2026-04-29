import type { Plan, PlannedItem, Session, SessionItem } from '$lib/models'
import { planSchema, sessionSchema } from '$lib/schemas'
import { schedule, buildSessionItem } from '$lib/scheduler/schedule'
import { uuid } from '$lib/util/uuid'
import {
	appendTimelineEvent,
	clearCurrentSession,
	getCurrentPlanState,
	getCurrentSession,
	getCurrentTimeline,
	putCurrentPlanState,
	putCurrentSession,
	type TimelineEvent,
} from './db'

const STALE_AFTER_MS = 4 * 60 * 60 * 1000

export type PlanMode = 'auto' | 'manual'
export type AutoMode = 'now' | 'time'

function defaultTarget(now = Date.now()): number {
	return now + 60 * 60 * 1000
}

function defaultPlan(): Plan {
	return { targetEpoch: defaultTarget(), items: [], mode: 'now' }
}

/**
 * Time everything must finish so each item is ready at the same moment.
 * In 'now' mode: now + max(cookSeconds + restSeconds) so the slowest dish
 * finishes when started immediately and faster dishes are staggered later.
 * In 'time' mode: the user's pinned eating time.
 */
function effectiveTargetEpoch(p: Plan, now: number): number {
	if (p.mode === 'time') return p.targetEpoch
	if (p.items.length === 0) return now
	const longestMs = Math.max(...p.items.map(i => (i.cookSeconds + i.restSeconds) * 1000))
	return now + longestMs
}

function createGrilladeStore() {
	let plan = $state<Plan>(defaultPlan())
	let session = $state<Session | null>(null)
	let initialized = false
	let planMode = $state<PlanMode>('auto')
	let sessionTimeline = $state<TimelineEvent[]>([])

	const cookingItems = $derived(session ? session.items.filter(i => i.status === 'cooking') : [])
	const restingItems = $derived(session ? session.items.filter(i => i.status === 'resting') : [])
	const readyItems = $derived(session ? session.items.filter(i => i.status === 'ready') : [])
	const pendingItems = $derived(session ? session.items.filter(i => i.status === 'pending') : [])
	const platedItems = $derived(session ? session.items.filter(i => i.status === 'plated') : [])
	const allPlated = $derived(session ? session.items.length > 0 && session.items.every(i => i.status === 'plated') : false)
	const longestCookSeconds = $derived(
		plan.items.length === 0 ? 0 : Math.max(...plan.items.map(i => i.cookSeconds + i.restSeconds)),
	)

	async function persist() {
		if (session) await putCurrentSession(session)
	}

	function persistPlan() {
		// Chain each write so _persistFlush() awaits *all* in-flight persists
		// in order. Without chaining, fire-and-forget calls in tests race past
		// the awaiter and leave half-committed IDB state.
		_pendingPersist = _pendingPersist.then(() => putCurrentPlanState({ plan, planMode }))
		return _pendingPersist
	}

	let _pendingPersist: Promise<void> = Promise.resolve()

	async function endSession() {
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
		await clearCurrentSession()
		session = null
		sessionTimeline = []
		plan = replayItems.length > 0 ? { targetEpoch: defaultTarget(), items: replayItems, mode: 'now' } : defaultPlan()
		planMode = 'auto'
		persistPlan()
	}

	return {
		// Plan accessors
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
			if (initialized) return
			initialized = true
			const stored = await getCurrentSession()
			if (stored) {
				const stale = stored.targetEpoch < Date.now() - STALE_AFTER_MS
				if (stale) {
					await clearCurrentSession()
				} else {
					session = stored
					sessionTimeline = await getCurrentTimeline()
				}
			}
			const storedPlan = await getCurrentPlanState()
			if (storedPlan) {
				const parsed = planSchema.safeParse(storedPlan.plan)
				if (parsed.success) {
					plan = parsed.data
					planMode = storedPlan.planMode === 'manual' ? 'manual' : 'auto'
				}
			}
		},

		setTargetTime(epoch: number) {
			plan = { ...plan, targetEpoch: epoch, mode: 'time' }
			planMode = 'auto'
			persistPlan()
		},

		setPlanMode(mode: PlanMode) {
			planMode = mode
			persistPlan()
		},

		setAutoMode(mode: AutoMode) {
			plan = { ...plan, mode }
			planMode = 'auto'
			persistPlan()
		},

		effectiveTargetEpoch(now: number = Date.now()) {
			return effectiveTargetEpoch(plan, now)
		},

		addItem(item: Omit<PlannedItem, 'id'>): PlannedItem {
			const created: PlannedItem = { ...item, id: uuid() }
			plan = { ...plan, items: [...plan.items, created] }
			persistPlan()
			return created
		},

		updateItem(id: string, patch: Partial<Omit<PlannedItem, 'id'>>) {
			plan = { ...plan, items: plan.items.map(i => (i.id === id ? { ...i, ...patch } : i)) }
			persistPlan()
		},

		removeItem(id: string) {
			plan = { ...plan, items: plan.items.filter(i => i.id !== id) }
			persistPlan()
		},

		reorderItems(ids: string[]) {
			const map = new Map(plan.items.map(i => [i.id, i]))
			const reordered = ids.map(id => map.get(id)).filter((i): i is PlannedItem => Boolean(i))
			if (reordered.length === plan.items.length) plan = { ...plan, items: reordered }
			persistPlan()
		},

		loadFromMenu(items: PlannedItem[]) {
			plan = { targetEpoch: defaultTarget(), items: items.map(i => ({ ...i, id: uuid() })), mode: 'now' }
			persistPlan()
		},

		appendFromMenu(items: PlannedItem[]) {
			const fresh = items.map(i => ({ ...i, id: uuid() }))
			plan = { ...plan, items: [...plan.items, ...fresh] }
			persistPlan()
		},

		resetDraft() {
			plan = defaultPlan()
			planMode = 'auto'
			persistPlan()
		},

		async startSession(): Promise<Session> {
			if (plan.items.length === 0) throw new Error('cannot start: no items in plan')
			const now = Date.now()
			const targetEpoch = effectiveTargetEpoch(plan, now)
			const result = schedule({ targetEpoch, items: plan.items, now })
			const sessionItems: SessionItem[] = plan.items.map((p, i) => buildSessionItem(p, result.items[i], now))
			const newSession = sessionSchema.parse({
				id: uuid(),
				createdAtEpoch: now,
				targetEpoch,
				endedAtEpoch: null,
				items: sessionItems,
			})
			session = newSession
			plan = defaultPlan()
			persistPlan()
			await persist()
			return newSession
		},

		// Manual mode = a Session whose items are pinned at a far-future
		// putOnEpoch sentinel until the user clicks Los on each card. The ticker
		// then drives them through cooking/resting/ready as wall-clock advances.
		async startManualSession(): Promise<Session> {
			if (plan.items.length === 0) throw new Error('cannot start: no items in plan')
			const now = Date.now()
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
			}))
			const newSession = sessionSchema.parse({
				id: uuid(),
				createdAtEpoch: now,
				targetEpoch: now + 60 * 60 * 1000,
				endedAtEpoch: null,
				items: sessionItems,
			})
			session = newSession
			plan = defaultPlan()
			planMode = 'auto'
			persistPlan()
			await persist()
			return newSession
		},

		async startSessionItem(id: string) {
			if (!session) return
			const target = session.items.find(i => i.id === id)
			if (!target) return
			const now = Date.now()
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
			const items = session.items.map(i => (i.id === id ? updated : i))
			session = {
				...session,
				items,
				targetEpoch: Math.max(session.targetEpoch, restingUntilEpoch),
			}
			await persist()
		},

		async patchItem(id: string, patch: Partial<SessionItem>) {
			if (!session) return
			session = { ...session, items: session.items.map(i => (i.id === id ? { ...i, ...patch } : i)) }
			await persist()
		},

		async plateItem(id: string) {
			if (!session) return
			session = {
				...session,
				items: session.items.map(i => (i.id === id ? { ...i, status: 'plated', platedEpoch: Date.now() } : i)),
			}
			await persist()
		},

		async unplateItem(id: string) {
			if (!session) return
			session = {
				...session,
				items: session.items.map(i => (i.id === id ? { ...i, status: 'ready', platedEpoch: null } : i)),
			}
			await persist()
		},

		async forceReady(id: string) {
			if (!session) return
			session = { ...session, items: session.items.map(i => (i.id === id ? { ...i, status: 'ready' } : i)) }
			await persist()
		},

		async removeSessionItem(id: string) {
			if (!session) return
			session = { ...session, items: session.items.filter(i => i.id !== id) }
			await persist()
		},

		async appendTimelineEvent(event: TimelineEvent) {
			if (sessionTimeline.some(e => e.kind === event.kind && e.itemName === event.itemName && e.at === event.at)) {
				return
			}
			sessionTimeline = await appendTimelineEvent(event)
		},

		async endSession() {
			await endSession()
		},

		_reset() {
			plan = defaultPlan()
			session = null
			sessionTimeline = []
			planMode = 'auto'
			initialized = false
		},

		_persistFlush(): Promise<void> {
			return _pendingPersist
		},
	}
}

export const grilladeStore = createGrilladeStore()
