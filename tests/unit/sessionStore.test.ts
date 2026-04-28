import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { grilladeStore } from '$lib/stores/grilladeStore.svelte'
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
	grilladeStore._reset()
	__resetForTests()
	;(globalThis as unknown as { indexedDB: unknown }).indexedDB = new IDBFactory()
})

afterEach(() => {
	grilladeStore._reset()
})

describe('grilladeStore', () => {
	it('test_add_item_persists_to_idb', async () => {
		const created = grilladeStore.addItem(item)
		expect(created.id).toBeTruthy()
		expect(grilladeStore.plan.items).toHaveLength(1)
	})

	it('test_remove_item_persists_to_idb', () => {
		const created = grilladeStore.addItem(item)
		grilladeStore.removeItem(created.id)
		expect(grilladeStore.plan.items).toHaveLength(0)
	})

	it('test_reorder_item_persists_to_idb', () => {
		const a = grilladeStore.addItem({ ...item, label: 'A' })
		const b = grilladeStore.addItem({ ...item, label: 'B' })
		grilladeStore.reorderItems([b.id, a.id])
		expect(grilladeStore.plan.items.map(i => i.label)).toEqual(['B', 'A'])
	})

	it('test_start_session_computes_schedule', async () => {
		const target = Date.now() + 60 * 60 * 1000
		grilladeStore.setTargetTime(target)
		grilladeStore.addItem(item)
		const session = await grilladeStore.startSession()
		expect(session.items).toHaveLength(1)
		expect(session.items[0].restingUntilEpoch).toBe(target)
	})

	it('test_plate_item_moves_to_plated_group', async () => {
		const target = Date.now() + 60 * 60 * 1000
		grilladeStore.setTargetTime(target)
		grilladeStore.addItem(item)
		const session = await grilladeStore.startSession()
		await grilladeStore.plateItem(session.items[0].id)
		expect(grilladeStore.session?.items[0].status).toBe('plated')
	})

	it('test_end_session_clears_current', async () => {
		grilladeStore.setTargetTime(Date.now() + 3600_000)
		grilladeStore.addItem(item)
		await grilladeStore.startSession()
		await grilladeStore.endSession()
		expect(grilladeStore.session).toBeNull()
	})

	it('test_mid_session_remove_item_does_not_reschedule_others', async () => {
		const target = Date.now() + 60 * 60 * 1000
		grilladeStore.setTargetTime(target)
		const a = grilladeStore.addItem({ ...item, label: 'A' })
		grilladeStore.addItem({ ...item, label: 'B', cookSeconds: 600 })
		const session = await grilladeStore.startSession()
		const aPutOn = session.items.find(i => i.id === a.id)!.putOnEpoch
		await grilladeStore.removeSessionItem(session.items.find(i => i.label === 'B')!.id)
		const aPutOnAfter = grilladeStore.session?.items.find(i => i.id === a.id)?.putOnEpoch
		expect(aPutOnAfter).toBe(aPutOn)
	})

	it('test_manual_alarm_added_and_dismissed_persist_across_init', async () => {
		const created = grilladeStore.addItem(item)
		grilladeStore.setPlanMode('manual')
		grilladeStore.addManualAlarm({
			id: `${created.id}-flip`,
			itemId: created.id,
			kind: 'flip',
			itemName: 'Steak',
			message: 'Steak: jetzt wenden',
			firedAt: Date.now(),
		})
		expect(grilladeStore.manualAlarms).toHaveLength(1)
		grilladeStore.dismissManualAlarm(`${created.id}-flip`)
		expect(grilladeStore.manualAlarmDismissed.has(`${created.id}-flip`)).toBe(true)

		await grilladeStore._persistFlush()
		grilladeStore._reset()
		await grilladeStore.init()
		expect(grilladeStore.manualAlarms).toHaveLength(1)
		expect(grilladeStore.manualAlarmDismissed.has(`${created.id}-flip`)).toBe(true)
	})

	it('test_remove_item_drops_its_alarms', () => {
		const created = grilladeStore.addItem(item)
		grilladeStore.setPlanMode('manual')
		grilladeStore.addManualAlarm({
			id: `${created.id}-flip`,
			itemId: created.id,
			kind: 'flip',
			itemName: 'Steak',
			message: 'Steak: jetzt wenden',
			firedAt: Date.now(),
		})
		expect(grilladeStore.manualAlarms).toHaveLength(1)
		grilladeStore.removeItem(created.id)
		expect(grilladeStore.manualAlarms).toHaveLength(0)
	})

	it('test_dismissed_alarm_cannot_be_re_added', () => {
		const created = grilladeStore.addItem(item)
		grilladeStore.setPlanMode('manual')
		const alarm = {
			id: `${created.id}-flip`,
			itemId: created.id,
			kind: 'flip' as const,
			itemName: 'Steak',
			message: 'Steak: jetzt wenden',
			firedAt: Date.now(),
		}
		grilladeStore.addManualAlarm(alarm)
		grilladeStore.dismissManualAlarm(alarm.id)
		grilladeStore.addManualAlarm(alarm)
		expect(grilladeStore.manualAlarms).toHaveLength(1)
	})

	it('test_clearManualAlarms_removes_all_state', () => {
		grilladeStore.setPlanMode('manual')
		grilladeStore.addManualAlarm({
			id: 'a',
			itemId: 'i',
			kind: 'flip',
			itemName: 'x',
			message: 'm',
			firedAt: 1,
		})
		grilladeStore.dismissManualAlarm('a')
		grilladeStore.clearManualAlarms()
		expect(grilladeStore.manualAlarms).toEqual([])
		expect(grilladeStore.manualAlarmDismissed.size).toBe(0)
	})

	it('test_session_lifecycle_plate_unplate_force_ready_remove', async () => {
		grilladeStore.setTargetTime(Date.now() + 60 * 60_000)
		const a = grilladeStore.addItem({ ...item, label: 'A' })
		grilladeStore.addItem({ ...item, label: 'B' })
		const session = await grilladeStore.startSession()
		const aItem = session.items.find(i => i.id === a.id)!
		await grilladeStore.forceReady(aItem.id)
		expect(grilladeStore.session?.items.find(i => i.id === aItem.id)?.status).toBe('ready')
		await grilladeStore.plateItem(aItem.id)
		expect(grilladeStore.session?.items.find(i => i.id === aItem.id)?.status).toBe('plated')
		await grilladeStore.unplateItem(aItem.id)
		expect(grilladeStore.session?.items.find(i => i.id === aItem.id)?.status).toBe('ready')
		await grilladeStore.removeSessionItem(aItem.id)
		expect(grilladeStore.session?.items.find(i => i.id === aItem.id)).toBeUndefined()
	})

	it('test_init_drops_stale_manual_plan_older_than_window', async () => {
		const created = grilladeStore.addItem(item)
		grilladeStore.setPlanMode('manual')
		grilladeStore.startManualItem(created.id)
		// Wait for the chained fire-and-forget persists to drain before we
		// overwrite IDB with stale data — otherwise a late persist races past
		// our overwrite and the staleness check sees fresh timestamps.
		await grilladeStore._persistFlush()
		const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000
		const { putCurrentPlanState } = await import('$lib/stores/db')
		await putCurrentPlanState({
			plan: grilladeStore.plan,
			planMode: 'manual',
			manualStarts: { [created.id]: fiveHoursAgo },
			manualPlated: [],
			alarms: [],
			dismissedAlarmKeys: [],
		})

		grilladeStore._reset()
		await grilladeStore.init()
		expect(grilladeStore.plan.items).toHaveLength(0)
	})

	it('test_init_keeps_recent_manual_plan', async () => {
		const created = grilladeStore.addItem(item)
		grilladeStore.setPlanMode('manual')
		grilladeStore.startManualItem(created.id)
		await grilladeStore._persistFlush()
		grilladeStore._reset()
		await grilladeStore.init()
		expect(grilladeStore.plan.items).toHaveLength(1)
		expect(grilladeStore.planMode).toBe('manual')
	})
})
