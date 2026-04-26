import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { savedPlansStore } from '$lib/stores/savedPlansStore.svelte'
import { __resetForTests } from '$lib/stores/db'

const item = {
	id: '11111111-1111-4111-8111-111111111111',
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
}

beforeEach(() => {
	savedPlansStore._reset()
	__resetForTests()
	;(globalThis as unknown as { indexedDB: unknown }).indexedDB = new IDBFactory()
})

describe('savedPlansStore', () => {
	it('test_save_saved_plan', async () => {
		const plan = await savedPlansStore.save('Test', [item])
		expect(plan.id).toBeTruthy()
		expect(savedPlansStore.all).toHaveLength(1)
	})

	it('test_rename_saved_plan', async () => {
		const plan = await savedPlansStore.save('Test', [item])
		await savedPlansStore.rename(plan.id, 'New Name')
		expect(savedPlansStore.all[0].name).toBe('New Name')
	})

	it('test_delete_saved_plan', async () => {
		const plan = await savedPlansStore.save('Test', [item])
		await savedPlansStore.remove(plan.id)
		expect(savedPlansStore.all).toHaveLength(0)
	})

	it('test_save_saved_plan_persists_multiple_items', async () => {
		const plan = await savedPlansStore.save('Test', [item, { ...item, id: '22222222-2222-4222-8222-222222222222' }])
		expect(plan.items).toHaveLength(2)

		// Round-trip through IDB.
		savedPlansStore._reset()
		await savedPlansStore.init()
		expect(savedPlansStore.all).toHaveLength(1)
		expect(savedPlansStore.all[0].items).toHaveLength(2)
	})
})
