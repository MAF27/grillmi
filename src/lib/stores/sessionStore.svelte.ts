import type { Plan, PlannedItem, Session, SessionItem } from '$lib/models'
import { sessionSchema } from '$lib/schemas'
import { schedule, buildSessionItem } from '$lib/scheduler/schedule'
import { uuid } from '$lib/util/uuid'
import { clearCurrentSession, getCurrentSession, putCurrentSession } from './db'

const AUTO_END_MS = 60_000
const STALE_AFTER_MS = 4 * 60 * 60 * 1000

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

function createSessionStore() {
	let plan = $state<Plan>(defaultPlan())
	let session = $state<Session | null>(null)
	let initialized = false
	let autoEndTimer: ReturnType<typeof setTimeout> | null = null
	let autoEndDeadline = $state<number | null>(null)

	const cookingItems = $derived(session ? session.items.filter(i => i.status === 'cooking') : [])
	const restingItems = $derived(session ? session.items.filter(i => i.status === 'resting') : [])
	const readyItems = $derived(session ? session.items.filter(i => i.status === 'ready') : [])
	const pendingItems = $derived(session ? session.items.filter(i => i.status === 'pending') : [])
	const platedItems = $derived(session ? session.items.filter(i => i.status === 'plated') : [])
	const allPlated = $derived(session ? session.items.length > 0 && session.items.every(i => i.status === 'plated') : false)

	async function persist() {
		if (session) await putCurrentSession(session)
	}

	function clearAutoEnd() {
		if (autoEndTimer !== null) clearTimeout(autoEndTimer)
		autoEndTimer = null
		autoEndDeadline = null
	}

	function maybeArmAutoEnd() {
		if (!session || autoEndTimer !== null) return
		if (!session.items.every(i => i.status === 'plated') || session.items.length === 0) return
		autoEndDeadline = Date.now() + AUTO_END_MS
		autoEndTimer = setTimeout(() => {
			void endSession()
		}, AUTO_END_MS)
	}

	async function endSession() {
		clearAutoEnd()
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
				}))
			: []
		await clearCurrentSession()
		session = null
		plan = replayItems.length > 0 ? { targetEpoch: defaultTarget(), items: replayItems, mode: 'now' } : defaultPlan()
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
		get autoEndDeadline() {
			return autoEndDeadline
		},

		async init() {
			if (initialized) return
			initialized = true
			const stored = await getCurrentSession()
			if (!stored) return
			const stale = stored.targetEpoch < Date.now() - STALE_AFTER_MS
			if (stale) {
				await clearCurrentSession()
				return
			}
			session = stored
		},

		setTargetTime(epoch: number) {
			// Setting an explicit time switches the plan into 'time' mode.
			plan = { ...plan, targetEpoch: epoch, mode: 'time' }
		},

		setPlanMode(mode: 'now' | 'time') {
			plan = { ...plan, mode }
		},

		effectiveTargetEpoch(now: number = Date.now()) {
			return effectiveTargetEpoch(plan, now)
		},

		addItem(item: Omit<PlannedItem, 'id'>): PlannedItem {
			const created: PlannedItem = { ...item, id: uuid() }
			plan = { ...plan, items: [...plan.items, created] }
			return created
		},

		updateItem(id: string, patch: Partial<Omit<PlannedItem, 'id'>>) {
			plan = { ...plan, items: plan.items.map(i => (i.id === id ? { ...i, ...patch } : i)) }
		},

		removeItem(id: string) {
			plan = { ...plan, items: plan.items.filter(i => i.id !== id) }
		},

		reorderItems(ids: string[]) {
			const map = new Map(plan.items.map(i => [i.id, i]))
			const reordered = ids.map(id => map.get(id)).filter((i): i is PlannedItem => Boolean(i))
			if (reordered.length === plan.items.length) plan = { ...plan, items: reordered }
		},

		loadFromFavorite(items: PlannedItem[]) {
			plan = { targetEpoch: defaultTarget(), items: items.map(i => ({ ...i, id: uuid() })), mode: 'now' }
		},

		appendFromFavorite(items: PlannedItem[]) {
			const fresh = items.map(i => ({ ...i, id: uuid() }))
			plan = { ...plan, items: [...plan.items, ...fresh] }
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
			await persist()
			return newSession
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
			maybeArmAutoEnd()
		},

		async unplateItem(id: string) {
			if (!session) return
			session = {
				...session,
				items: session.items.map(i => (i.id === id ? { ...i, status: 'ready', platedEpoch: null } : i)),
			}
			await persist()
			clearAutoEnd()
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

		cancelAutoEnd() {
			clearAutoEnd()
		},

		async endSession() {
			await endSession()
		},

		_reset() {
			clearAutoEnd()
			plan = defaultPlan()
			session = null
			initialized = false
		},
	}
}

export const sessionStore = createSessionStore()
