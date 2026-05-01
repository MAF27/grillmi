import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { schedule, buildSessionItem } from '$lib/scheduler/schedule'
import {
	createGrilladeLifecycle,
	defaultPlan,
	effectiveTargetEpoch,
	MANUAL_UNSTARTED_HORIZON_MS,
	STALE_AFTER_MS,
	type ClockPort,
	type PersistencePort,
	type PlanMode,
	type PushPort,
} from '$lib/grillade/lifecycle'
import type { Plan, PlannedItem, Session } from '$lib/models'
import { __resetForTests } from '$lib/stores/db'
import * as dbHelpers from '$lib/stores/db'

const SAMPLE_ITEM: Omit<PlannedItem, 'id'> = {
	categorySlug: 'beef',
	cutSlug: 'rinds-entrecote',
	thicknessCm: 3,
	prepLabel: null,
	doneness: 'medium-rare',
	label: 'Entrecôte',
	cookSeconds: 600,
	restSeconds: 300,
	flipFraction: 0.5,
	idealFlipPattern: 'once',
	heatZone: '—',
	grateTempC: 230,
}

function fixedClock(t: number): ClockPort {
	return { now: () => t }
}

function makeMemoryPersistence(): {
	port: PersistencePort
	state: { session: Session | null; plan: { plan: Plan; planMode: PlanMode } | null; timeline: typeof emptyTimeline }
} {
	const emptyTimeline = [] as Awaited<ReturnType<PersistencePort['appendTimelineEvent']>>
	const state = {
		session: null as Session | null,
		plan: null as { plan: Plan; planMode: PlanMode } | null,
		timeline: emptyTimeline,
	}
	const port: PersistencePort = {
		async getCurrentSession() {
			return state.session ?? undefined
		},
		async putCurrentSession(s) {
			state.session = s
		},
		async clearCurrentSession() {
			state.session = null
		},
		async getCurrentPlanState() {
			return state.plan ?? undefined
		},
		async putCurrentPlanState(s) {
			state.plan = s
		},
		async getCurrentTimeline() {
			return state.timeline
		},
		async appendTimelineEvent(event) {
			state.timeline = [event, ...state.timeline]
			return state.timeline
		},
	}
	return { port, state }
}

function nullPushPort(): PushPort {
	return {
		pushPlannedDraft: vi.fn(async () => {}),
		pushRunningSession: vi.fn(async () => {}),
		pushFinishedGrillade: vi.fn(async () => {}),
	}
}

beforeEach(() => {
	__resetForTests()
	;(globalThis as unknown as { indexedDB: unknown }).indexedDB = new IDBFactory()
	vi.restoreAllMocks()
})

afterEach(() => {
	vi.restoreAllMocks()
})

describe('lifecycle', () => {
	it('init reads stored session and clears it when stale beyond STALE_AFTER_MS', async () => {
		const now = 1_700_000_000_000
		const stale: Session = {
			id: '11111111-1111-1111-1111-111111111111',
			createdAtEpoch: now - STALE_AFTER_MS - 1_000_000,
			targetEpoch: now - STALE_AFTER_MS - 1_000,
			endedAtEpoch: null,
			mode: 'auto',
			items: [],
		}
		const { port, state } = makeMemoryPersistence()
		state.session = stale
		const lifecycle = createGrilladeLifecycle({
			persistence: port,
			push: nullPushPort(),
			scheduler: { schedule, buildSessionItem },
			clock: fixedClock(now),
		})
		await lifecycle.init()
		expect(lifecycle.getSession()).toBe(null)
		expect(state.session).toBe(null)
	})

	it('init reads planState and falls back to defaultPlan when parse fails', async () => {
		const now = 1_700_000_000_000
		const { port, state } = makeMemoryPersistence()
		state.plan = { plan: { invalid: true } as never, planMode: 'auto' }
		const lifecycle = createGrilladeLifecycle({
			persistence: port,
			push: nullPushPort(),
			scheduler: { schedule, buildSessionItem },
			clock: fixedClock(now),
		})
		await lifecycle.init()
		const fallback = defaultPlan(now)
		expect(lifecycle.getPlan().items).toEqual(fallback.items)
		expect(lifecycle.getPlan().mode).toBe('now')
	})

	it('addItem assigns a uuid, updateItem patches in place, removeItem removes, reorderItems preserves only known ids', async () => {
		const lifecycle = createGrilladeLifecycle({
			persistence: makeMemoryPersistence().port,
			push: nullPushPort(),
			scheduler: { schedule, buildSessionItem },
		})
		await lifecycle.init()
		const a = lifecycle.addItem(SAMPLE_ITEM)
		const b = lifecycle.addItem({ ...SAMPLE_ITEM, label: 'B' })
		expect(a.id).toBeTruthy()
		expect(a.id).not.toBe(b.id)
		lifecycle.updateItem(a.id, { label: 'A-updated' })
		expect(lifecycle.getPlan().items.find(i => i.id === a.id)?.label).toBe('A-updated')
		lifecycle.removeItem(b.id)
		expect(lifecycle.getPlan().items.map(i => i.id)).toEqual([a.id])
		lifecycle.addItem({ ...SAMPLE_ITEM, label: 'C' })
		const ids = lifecycle.getPlan().items.map(i => i.id).reverse()
		lifecycle.reorderItems([...ids, 'unknown-id'])
		expect(lifecycle.getPlan().items.map(i => i.id)).toEqual(ids)
	})

	it('setTargetTime switches mode to time and clears auto sub-mode', async () => {
		const lifecycle = createGrilladeLifecycle({
			persistence: makeMemoryPersistence().port,
			push: nullPushPort(),
			scheduler: { schedule, buildSessionItem },
		})
		await lifecycle.init()
		lifecycle.setTargetTime(2_000_000_000_000)
		expect(lifecycle.getPlan().mode).toBe('time')
		expect(lifecycle.getPlan().targetEpoch).toBe(2_000_000_000_000)
		expect(lifecycle.getPlanMode()).toBe('auto')
	})

	it('effectiveTargetEpoch in now mode returns now plus longest cook plus rest plus lead seconds', async () => {
		const now = 1_700_000_000_000
		const plan: Plan = {
			targetEpoch: now,
			mode: 'now',
			items: [
				{ ...SAMPLE_ITEM, id: '1', cookSeconds: 600, restSeconds: 300 } as PlannedItem,
				{ ...SAMPLE_ITEM, id: '2', cookSeconds: 1200, restSeconds: 60 } as PlannedItem,
			],
		}
		expect(effectiveTargetEpoch(plan, now, 0)).toBe(now + 1260 * 1000)
		expect(effectiveTargetEpoch(plan, now, 30)).toBe(now + 1260 * 1000 + 30 * 1000)
	})

	it('effectiveTargetEpoch in time mode returns the pinned epoch unchanged', () => {
		const plan: Plan = { targetEpoch: 2_000_000_000_000, mode: 'time', items: [] }
		expect(effectiveTargetEpoch(plan, 1_700_000_000_000, 0)).toBe(2_000_000_000_000)
	})

	it('startSession schedules every item to finish by targetEpoch and sets earliest put-on first', async () => {
		const now = 1_700_000_000_000
		const lifecycle = createGrilladeLifecycle({
			persistence: makeMemoryPersistence().port,
			push: nullPushPort(),
			scheduler: { schedule, buildSessionItem },
			clock: fixedClock(now),
		})
		await lifecycle.init()
		lifecycle.addItem({ ...SAMPLE_ITEM, label: 'fast', cookSeconds: 60, restSeconds: 30 })
		lifecycle.addItem({ ...SAMPLE_ITEM, label: 'slow', cookSeconds: 300, restSeconds: 30 })
		lifecycle.setTargetTime(now + 600 * 1000)
		const newSession = await lifecycle.startSession()
		expect(newSession.items[0].putOnEpoch).toBeLessThanOrEqual(newSession.items[1].putOnEpoch)
		for (const item of newSession.items) {
			expect(item.restingUntilEpoch).toBeLessThanOrEqual(now + 600 * 1000)
		}
	})

	it('startSession with overdue items flips status to cooking and shifts later items forward', async () => {
		const now = 1_700_000_000_000
		const lifecycle = createGrilladeLifecycle({
			persistence: makeMemoryPersistence().port,
			push: nullPushPort(),
			scheduler: { schedule, buildSessionItem },
			clock: fixedClock(now),
		})
		await lifecycle.init()
		lifecycle.addItem({ ...SAMPLE_ITEM, cookSeconds: 600, restSeconds: 300 })
		// targetEpoch in the past: items become overdue
		lifecycle.setTargetTime(now - 1000)
		const session = await lifecycle.startSession()
		expect(session.items[0].status).toBe('cooking')
		expect(session.items[0].overdue).toBe(true)
	})

	it('startManualSession parks every item at the far-future sentinel and sessionHasStarted stays false', async () => {
		const now = 1_700_000_000_000
		const lifecycle = createGrilladeLifecycle({
			persistence: makeMemoryPersistence().port,
			push: nullPushPort(),
			scheduler: { schedule, buildSessionItem },
			clock: fixedClock(now),
		})
		await lifecycle.init()
		lifecycle.addItem(SAMPLE_ITEM)
		const session = await lifecycle.startManualSession()
		const horizon = now + MANUAL_UNSTARTED_HORIZON_MS
		for (const item of session.items) {
			expect(item.putOnEpoch).toBeGreaterThan(horizon)
		}
		expect(lifecycle.getSessionHasStarted()).toBe(false)
	})

	it('startSessionItem on a manual session item recomputes flip, done, and resting epochs from now', async () => {
		const lifecycle = createGrilladeLifecycle({
			persistence: makeMemoryPersistence().port,
			push: nullPushPort(),
			scheduler: { schedule, buildSessionItem },
		})
		await lifecycle.init()
		const added = lifecycle.addItem(SAMPLE_ITEM)
		const session = await lifecycle.startManualSession()
		const itemId = session.items.find(i => i.cutSlug === added.cutSlug)?.id
		expect(itemId).toBeTruthy()
		await lifecycle.startSessionItem(itemId!)
		const after = lifecycle.getSession()!
		const updated = after.items.find(i => i.id === itemId)!
		expect(updated.status).toBe('cooking')
		// Far-future sentinel removed; new epochs should be near now.
		expect(updated.putOnEpoch).toBeLessThan(Date.now() + 60 * 1000)
		expect(updated.doneEpoch).toBeGreaterThan(updated.putOnEpoch)
		expect(updated.restingUntilEpoch).toBeGreaterThan(updated.doneEpoch)
	})

	it('plateItem and unplateItem move the item between ready and plated and call push', async () => {
		const push = nullPushPort()
		const lifecycle = createGrilladeLifecycle({
			persistence: makeMemoryPersistence().port,
			push,
			scheduler: { schedule, buildSessionItem },
		})
		await lifecycle.init()
		lifecycle.addItem(SAMPLE_ITEM)
		const session = await lifecycle.startManualSession()
		const id = session.items[0].id
		await lifecycle.forceReady(id)
		await lifecycle.plateItem(id)
		expect(lifecycle.getSession()!.items[0].status).toBe('plated')
		await lifecycle.unplateItem(id)
		expect(lifecycle.getSession()!.items[0].status).toBe('ready')
		expect(push.pushRunningSession).toHaveBeenCalled()
	})

	it('endSession clears the session, copies items back into a fresh plan, and pushes finished metadata', async () => {
		const push = nullPushPort()
		const { port, state } = makeMemoryPersistence()
		const lifecycle = createGrilladeLifecycle({
			persistence: port,
			push,
			scheduler: { schedule, buildSessionItem },
		})
		await lifecycle.init()
		lifecycle.addItem(SAMPLE_ITEM)
		await lifecycle.startManualSession()
		await lifecycle.endSession()
		expect(lifecycle.getSession()).toBe(null)
		expect(state.session).toBe(null)
		expect(push.pushFinishedGrillade).toHaveBeenCalled()
		expect(lifecycle.getPlan().items).toHaveLength(1)
	})

	it('appendTimelineEvent dedupes by kind, itemName, and at', async () => {
		const lifecycle = createGrilladeLifecycle({
			persistence: makeMemoryPersistence().port,
			push: nullPushPort(),
			scheduler: { schedule, buildSessionItem },
		})
		await lifecycle.init()
		const event = { kind: 'on' as const, itemName: 'Steak', at: 1000 }
		await lifecycle.appendTimelineEvent(event)
		await lifecycle.appendTimelineEvent(event)
		expect(lifecycle.getSessionTimeline().filter(e => e.kind === 'on' && e.at === 1000)).toHaveLength(1)
	})

	it('syncActive pushes running session when one exists, otherwise pushes the planned draft', async () => {
		const push = nullPushPort()
		const lifecycle = createGrilladeLifecycle({
			persistence: makeMemoryPersistence().port,
			push,
			scheduler: { schedule, buildSessionItem },
		})
		await lifecycle.init()
		lifecycle.addItem(SAMPLE_ITEM)
		await lifecycle.syncActive()
		expect(push.pushPlannedDraft).toHaveBeenCalled()
		await lifecycle.startManualSession()
		await lifecycle.syncActive()
		expect(push.pushRunningSession).toHaveBeenCalled()
	})

	it('the in-memory PersistencePort and the real db.ts adapter produce equivalent plan state after the same sequence', async () => {
		const memory = makeMemoryPersistence()
		const lifecycleMemory = createGrilladeLifecycle({
			persistence: memory.port,
			push: nullPushPort(),
			scheduler: { schedule, buildSessionItem },
		})
		const lifecycleIDB = createGrilladeLifecycle({
			persistence: {
				getCurrentSession: dbHelpers.getCurrentSession,
				putCurrentSession: dbHelpers.putCurrentSession,
				clearCurrentSession: dbHelpers.clearCurrentSession,
				getCurrentPlanState: dbHelpers.getCurrentPlanState,
				putCurrentPlanState: dbHelpers.putCurrentPlanState,
				getCurrentTimeline: dbHelpers.getCurrentTimeline,
				appendTimelineEvent: dbHelpers.appendTimelineEvent,
			},
			push: nullPushPort(),
			scheduler: { schedule, buildSessionItem },
		})

		for (const lc of [lifecycleMemory, lifecycleIDB]) {
			await lc.init()
			lc.addItem({ ...SAMPLE_ITEM, label: 'A' })
			lc.addItem({ ...SAMPLE_ITEM, label: 'B' })
			lc.setTargetTime(2_000_000_000_000)
			await lc.persistFlush()
		}

		const memPlan = lifecycleMemory.getPlan()
		const idbPlan = lifecycleIDB.getPlan()
		expect(memPlan.items.map(i => i.label)).toEqual(idbPlan.items.map(i => i.label))
		expect(memPlan.targetEpoch).toBe(idbPlan.targetEpoch)
		expect(memPlan.mode).toBe(idbPlan.mode)
	})
})
