import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
	vi.restoreAllMocks()
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

	it('test_start_manual_session_pins_items_at_far_future_epochs', async () => {
		grilladeStore.addItem(item)
		const session = await grilladeStore.startManualSession()
		expect(session.items).toHaveLength(1)
		expect(session.mode).toBe('manual')
		const horizon = Date.now() + 30 * 24 * 60 * 60 * 1000
		expect(session.items[0].putOnEpoch).toBeGreaterThan(horizon)
		expect(session.items[0].status).toBe('pending')
	})

	it('test_start_session_item_sets_real_epochs_and_marks_cooking', async () => {
		grilladeStore.addItem(item)
		const session = await grilladeStore.startManualSession()
		const id = session.items[0].id
		const before = Date.now()
		await grilladeStore.startSessionItem(id)
		const after = Date.now()
		const updated = grilladeStore.session?.items[0]
		expect(updated?.status).toBe('cooking')
		expect(updated?.putOnEpoch).toBeGreaterThanOrEqual(before)
		expect(updated?.putOnEpoch).toBeLessThanOrEqual(after)
		expect(updated?.doneEpoch).toBe((updated?.putOnEpoch ?? 0) + item.cookSeconds * 1000)
		expect(updated?.flipEpoch).toBe((updated?.putOnEpoch ?? 0) + (item.cookSeconds * 1000) / 2)
	})

	it('test_init_keeps_recent_manual_plan', async () => {
		grilladeStore.addItem(item)
		grilladeStore.setPlanMode('manual')
		await grilladeStore._persistFlush()
		grilladeStore._reset()
		await grilladeStore.init()
		expect(grilladeStore.plan.items).toHaveLength(1)
		expect(grilladeStore.planMode).toBe('manual')
	})

	it('test_init_restores_started_manual_session_timer', async () => {
		grilladeStore.addItem(item)
		const session = await grilladeStore.startManualSession()
		await grilladeStore.startSessionItem(session.items[0].id)
		const beforeReload = grilladeStore.session?.items[0]
		expect(beforeReload?.status).toBe('cooking')

		grilladeStore._reset()
		await grilladeStore.init()

		const restored = grilladeStore.session?.items[0]
		expect(grilladeStore.session?.mode).toBe('manual')
		expect(restored?.id).toBe(beforeReload?.id)
		expect(restored?.status).toBe('cooking')
		expect(restored?.putOnEpoch).toBe(beforeReload?.putOnEpoch)
		expect(restored?.doneEpoch).toBe(beforeReload?.doneEpoch)
	})

	it('test_init_keeps_long_running_manual_timer_after_refresh', async () => {
		const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-04-30T10:00:00Z').getTime())
		grilladeStore.addItem({ ...item, cookSeconds: 8 * 60 * 60, restSeconds: 0 })
		const session = await grilladeStore.startManualSession()
		await grilladeStore.startSessionItem(session.items[0].id)
		const beforeReload = grilladeStore.session?.items[0]

		nowSpy.mockReturnValue(new Date('2026-04-30T15:00:00Z').getTime())
		grilladeStore._reset()
		await grilladeStore.init()

		expect(grilladeStore.session?.mode).toBe('manual')
		expect(grilladeStore.session?.items[0].id).toBe(beforeReload?.id)
		expect(grilladeStore.session?.items[0].doneEpoch).toBe(beforeReload?.doneEpoch)
	})
})
