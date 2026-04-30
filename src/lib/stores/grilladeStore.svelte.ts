import type { Plan, PlannedItem, Session, SessionItem } from '$lib/models'
import { planSchema, sessionSchema } from '$lib/schemas'
import { schedule, buildSessionItem } from '$lib/scheduler/schedule'
import { uuid } from '$lib/util/uuid'
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
	type TimelineEvent,
} from './db'
import { pushGrilladeCreate, pushGrilladeUpdate } from '$lib/sync/pushGrillade'

const STALE_AFTER_MS = 4 * 60 * 60 * 1000
const MANUAL_UNSTARTED_HORIZON_MS = 30 * 24 * 60 * 60 * 1000

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
function effectiveTargetEpoch(p: Plan, now: number, putOnLeadSeconds = 0): number {
	if (p.mode === 'time') return p.targetEpoch
	if (p.items.length === 0) return now
	const longestMs = Math.max(...p.items.map(i => (i.cookSeconds + i.restSeconds) * 1000))
	return now + Math.max(0, putOnLeadSeconds) * 1000 + longestMs
}

function normalizeSession(stored: Session): Session {
	const parsed = sessionSchema.parse(stored)
	if (parsed.mode === 'manual') return parsed
	const hasManualSentinel = parsed.items.some(i => i.putOnEpoch > parsed.createdAtEpoch + MANUAL_UNSTARTED_HORIZON_MS)
	return hasManualSentinel ? { ...parsed, mode: 'manual' } : parsed
}

function isStaleSession(s: Session, now = Date.now()): boolean {
	const lastRelevantEpoch =
		s.mode === 'manual' ? Math.max(s.targetEpoch, ...s.items.map(i => i.restingUntilEpoch)) : s.targetEpoch
	return lastRelevantEpoch < now - STALE_AFTER_MS
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
	// Manual sessions sit at this far-future putOnEpoch sentinel until the user
	// clicks Los on at least one card. Until then the cockpit countdown stays
	// hidden and other routes do NOT bounce the user back to /session.
	const sessionHasStarted = $derived(
		session ? session.items.some(i => i.putOnEpoch < Date.now() + MANUAL_UNSTARTED_HORIZON_MS) : false,
	)
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
		// After clearing, the just-finished GrilladeRow is the most recent one
		// with status='finished'. Push the metadata update so other devices see
		// it in their history list.
		await pushFinishedGrilladeIfPossible()
		session = null
		sessionTimeline = []
		plan = replayItems.length > 0 ? { targetEpoch: defaultTarget(), items: replayItems, mode: 'now' } : defaultPlan()
		planMode = 'auto'
		persistPlan()
	}

	async function stampPushedAndCreate() {
		const active = await getActiveGrillade()
		if (!active || active.pushedToServer) return
		await pushGrilladeCreate(active)
		active.pushedToServer = true
		await putGrillade(active)
	}

	async function pushFinishedGrilladeIfPossible() {
		const all = await listGrilladen()
		const recent = all
			.filter(g => g.status === 'finished' && g.deletedEpoch === null)
			.sort((a, b) => (b.endedEpoch ?? 0) - (a.endedEpoch ?? 0))[0]
		if (!recent) return
		if (!recent.pushedToServer) {
			// Edge case: the row never got a POST (e.g. legacy local state from
			// before sync push existed). Push a create now so the server gets
			// the finished snapshot in one step.
			await pushGrilladeCreate(recent)
			recent.pushedToServer = true
			await putGrillade(recent)
			return
		}
		await pushGrilladeUpdate(recent)
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
			if (initialized) return
			initialized = true
			const stored = await getCurrentSession()
			if (stored) {
				const normalized = normalizeSession(stored)
				const stale = isStaleSession(normalized)
				if (stale) {
					await clearCurrentSession()
				} else {
					session = normalized
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

		effectiveTargetEpoch(now: number = Date.now(), putOnLeadSeconds = 0) {
			return effectiveTargetEpoch(plan, now, putOnLeadSeconds)
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

		resetDraft() {
			plan = defaultPlan()
			planMode = 'auto'
			persistPlan()
		},

		async startSession(putOnLeadSeconds = 0): Promise<Session> {
			if (plan.items.length === 0) throw new Error('cannot start: no items in plan')
			const now = Date.now()
			const targetEpoch = effectiveTargetEpoch(plan, now, putOnLeadSeconds)
			const result = schedule({ targetEpoch, items: plan.items, now })
			const sessionItems: SessionItem[] = plan.items.map((p, i) => buildSessionItem(p, result.items[i], now))
			const newSession = sessionSchema.parse({
				id: uuid(),
				createdAtEpoch: now,
				targetEpoch,
				endedAtEpoch: null,
				mode: 'auto',
				items: sessionItems,
			})
			session = newSession
			plan = defaultPlan()
			persistPlan()
			await persist()
			await stampPushedAndCreate()
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
				// No real target until the user clicks Los on at least one item.
				// /session hides MasterClock while everything is unstarted.
				targetEpoch: now,
				endedAtEpoch: null,
				mode: 'manual',
				items: sessionItems,
			})
			session = newSession
			plan = defaultPlan()
			planMode = 'auto'
			persistPlan()
			await persist()
			await stampPushedAndCreate()
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
				mode: 'manual',
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
