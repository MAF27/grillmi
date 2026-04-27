import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { menusStore } from '$lib/stores/menusStore.svelte'
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
	grateTempC: null,
}

beforeEach(() => {
	menusStore._reset()
	__resetForTests()
	;(globalThis as unknown as { indexedDB: unknown }).indexedDB = new IDBFactory()
})

describe('menusStore', () => {
	it('test_save_menu', async () => {
		const menu = await menusStore.save('Test', [item])
		expect(menu.id).toBeTruthy()
		expect(menusStore.all).toHaveLength(1)
	})

	it('test_rename_menu', async () => {
		const menu = await menusStore.save('Test', [item])
		await menusStore.rename(menu.id, 'New Name')
		expect(menusStore.all[0].name).toBe('New Name')
	})

	it('test_delete_menu', async () => {
		const menu = await menusStore.save('Test', [item])
		await menusStore.remove(menu.id)
		expect(menusStore.all).toHaveLength(0)
	})

	it('test_save_menu_persists_multiple_items', async () => {
		const menu = await menusStore.save('Test', [item, { ...item, id: '22222222-2222-4222-8222-222222222222' }])
		expect(menu.items).toHaveLength(2)

		// Round-trip through IDB.
		menusStore._reset()
		await menusStore.init()
		expect(menusStore.all).toHaveLength(1)
		expect(menusStore.all[0].items).toHaveLength(2)
	})
})
