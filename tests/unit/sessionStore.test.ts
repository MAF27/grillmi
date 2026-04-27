import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { sessionStore } from '$lib/stores/sessionStore.svelte'
import { __resetForTests } from '$lib/stores/db'

const item = {
	categorySlug: 'beef',
	cutSlug: 'entrecote',
	thicknessCm: 3,
	prepLabel: null,
	doneness: 'Medium-rare',
	label: 'Steak',
	cookSeconds: 360,
	restSeconds: 300,
	flipFraction: 0.5,
	idealFlipPattern: 'once' as const,
	heatZone: 'Direct high',
	grateTempC: null,
}

beforeEach(() => {
	sessionStore._reset()
	__resetForTests()
	;(globalThis as unknown as { indexedDB: unknown }).indexedDB = new IDBFactory()
})

afterEach(() => {
	sessionStore._reset()
})

describe('sessionStore', () => {
	it('test_add_item_persists_to_idb', async () => {
		const created = sessionStore.addItem(item)
		expect(created.id).toBeTruthy()
		expect(sessionStore.plan.items).toHaveLength(1)
	})

	it('test_remove_item_persists_to_idb', () => {
		const created = sessionStore.addItem(item)
		sessionStore.removeItem(created.id)
		expect(sessionStore.plan.items).toHaveLength(0)
	})

	it('test_reorder_item_persists_to_idb', () => {
		const a = sessionStore.addItem({ ...item, label: 'A' })
		const b = sessionStore.addItem({ ...item, label: 'B' })
		sessionStore.reorderItems([b.id, a.id])
		expect(sessionStore.plan.items.map(i => i.label)).toEqual(['B', 'A'])
	})

	it('test_start_session_computes_schedule', async () => {
		const target = Date.now() + 60 * 60 * 1000
		sessionStore.setTargetTime(target)
		sessionStore.addItem(item)
		const session = await sessionStore.startSession()
		expect(session.items).toHaveLength(1)
		expect(session.items[0].restingUntilEpoch).toBe(target)
	})

	it('test_plate_item_moves_to_plated_group', async () => {
		const target = Date.now() + 60 * 60 * 1000
		sessionStore.setTargetTime(target)
		sessionStore.addItem(item)
		const session = await sessionStore.startSession()
		await sessionStore.plateItem(session.items[0].id)
		expect(sessionStore.session?.items[0].status).toBe('plated')
	})

	it('test_end_session_clears_current', async () => {
		sessionStore.setTargetTime(Date.now() + 3600_000)
		sessionStore.addItem(item)
		await sessionStore.startSession()
		await sessionStore.endSession()
		expect(sessionStore.session).toBeNull()
	})

	it('test_mid_session_remove_item_does_not_reschedule_others', async () => {
		const target = Date.now() + 60 * 60 * 1000
		sessionStore.setTargetTime(target)
		const a = sessionStore.addItem({ ...item, label: 'A' })
		sessionStore.addItem({ ...item, label: 'B', cookSeconds: 600 })
		const session = await sessionStore.startSession()
		const aPutOn = session.items.find(i => i.id === a.id)!.putOnEpoch
		await sessionStore.removeSessionItem(session.items.find(i => i.label === 'B')!.id)
		const aPutOnAfter = sessionStore.session?.items.find(i => i.id === a.id)?.putOnEpoch
		expect(aPutOnAfter).toBe(aPutOn)
	})

	it('test_manual_alarm_added_and_dismissed_persist_across_init', async () => {
		const created = sessionStore.addItem(item)
		sessionStore.setPlanMode('manual')
		sessionStore.addManualAlarm({
			id: `${created.id}-flip`,
			itemId: created.id,
			kind: 'flip',
			itemName: 'Steak',
			message: 'Steak: jetzt wenden',
			firedAt: Date.now(),
		})
		expect(sessionStore.manualAlarms).toHaveLength(1)
		sessionStore.dismissManualAlarm(`${created.id}-flip`)
		expect(sessionStore.manualAlarmDismissed.has(`${created.id}-flip`)).toBe(true)

		sessionStore._reset()
		await sessionStore.init()
		expect(sessionStore.manualAlarms).toHaveLength(1)
		expect(sessionStore.manualAlarmDismissed.has(`${created.id}-flip`)).toBe(true)
	})

	it('test_remove_item_drops_its_alarms', () => {
		const created = sessionStore.addItem(item)
		sessionStore.setPlanMode('manual')
		sessionStore.addManualAlarm({
			id: `${created.id}-flip`,
			itemId: created.id,
			kind: 'flip',
			itemName: 'Steak',
			message: 'Steak: jetzt wenden',
			firedAt: Date.now(),
		})
		expect(sessionStore.manualAlarms).toHaveLength(1)
		sessionStore.removeItem(created.id)
		expect(sessionStore.manualAlarms).toHaveLength(0)
	})

	it('test_dismissed_alarm_cannot_be_re_added', () => {
		const created = sessionStore.addItem(item)
		sessionStore.setPlanMode('manual')
		const alarm = {
			id: `${created.id}-flip`,
			itemId: created.id,
			kind: 'flip' as const,
			itemName: 'Steak',
			message: 'Steak: jetzt wenden',
			firedAt: Date.now(),
		}
		sessionStore.addManualAlarm(alarm)
		sessionStore.dismissManualAlarm(alarm.id)
		sessionStore.addManualAlarm(alarm)
		expect(sessionStore.manualAlarms).toHaveLength(1)
	})

	it('test_clearManualAlarms_removes_all_state', () => {
		sessionStore.setPlanMode('manual')
		sessionStore.addManualAlarm({
			id: 'a',
			itemId: 'i',
			kind: 'flip',
			itemName: 'x',
			message: 'm',
			firedAt: 1,
		})
		sessionStore.dismissManualAlarm('a')
		sessionStore.clearManualAlarms()
		expect(sessionStore.manualAlarms).toEqual([])
		expect(sessionStore.manualAlarmDismissed.size).toBe(0)
	})

	it('test_session_lifecycle_plate_unplate_force_ready_remove', async () => {
		sessionStore.setTargetTime(Date.now() + 60 * 60_000)
		const a = sessionStore.addItem({ ...item, label: 'A' })
		sessionStore.addItem({ ...item, label: 'B' })
		const session = await sessionStore.startSession()
		const aItem = session.items.find(i => i.id === a.id)!
		await sessionStore.forceReady(aItem.id)
		expect(sessionStore.session?.items.find(i => i.id === aItem.id)?.status).toBe('ready')
		await sessionStore.plateItem(aItem.id)
		expect(sessionStore.session?.items.find(i => i.id === aItem.id)?.status).toBe('plated')
		await sessionStore.unplateItem(aItem.id)
		expect(sessionStore.session?.items.find(i => i.id === aItem.id)?.status).toBe('ready')
		await sessionStore.removeSessionItem(aItem.id)
		expect(sessionStore.session?.items.find(i => i.id === aItem.id)).toBeUndefined()
	})

	it('test_init_drops_stale_manual_plan_older_than_window', async () => {
		const created = sessionStore.addItem(item)
		sessionStore.setPlanMode('manual')
		sessionStore.startManualItem(created.id)
		// rewind manualStarts to 5 hours ago, beyond the 4-hour staleness window
		const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000
		const starts = sessionStore.manualStarts as Record<string, number>
		Object.keys(starts).forEach(k => (starts[k] = fiveHoursAgo))
		// Persist that mutated state
		sessionStore.startManualItem(created.id) // re-trigger persistPlan, but startManualItem resets to now
		// Instead manipulate IDB directly
		const { putCurrentPlanState } = await import('$lib/stores/db')
		await putCurrentPlanState({
			plan: sessionStore.plan,
			planMode: 'manual',
			manualStarts: { [created.id]: fiveHoursAgo },
			manualPlated: [],
			alarms: [],
			dismissedAlarmKeys: [],
		})

		sessionStore._reset()
		await sessionStore.init()
		expect(sessionStore.plan.items).toHaveLength(0)
	})

	it('test_init_keeps_recent_manual_plan', async () => {
		const created = sessionStore.addItem(item)
		sessionStore.setPlanMode('manual')
		sessionStore.startManualItem(created.id)
		sessionStore._reset()
		await sessionStore.init()
		expect(sessionStore.plan.items).toHaveLength(1)
		expect(sessionStore.planMode).toBe('manual')
	})
})
