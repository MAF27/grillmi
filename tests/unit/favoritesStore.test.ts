import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { favoritesStore } from '$lib/stores/favoritesStore.svelte'
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
	favoritesStore._reset()
	__resetForTests()
	;(globalThis as unknown as { indexedDB: unknown }).indexedDB = new IDBFactory()
})

describe('favoritesStore', () => {
	it('test_save_favorite', async () => {
		const fav = await favoritesStore.save('Test', [item])
		expect(fav.id).toBeTruthy()
		expect(favoritesStore.all).toHaveLength(1)
	})

	it('test_rename_favorite', async () => {
		const fav = await favoritesStore.save('Test', [item])
		await favoritesStore.rename(fav.id, 'New Name')
		expect(favoritesStore.all[0].name).toBe('New Name')
	})

	it('test_delete_favorite', async () => {
		const fav = await favoritesStore.save('Test', [item])
		await favoritesStore.remove(fav.id)
		expect(favoritesStore.all).toHaveLength(0)
	})

	it('test_load_favorite_as_plan', async () => {
		const fav = await favoritesStore.save('Test', [item, { ...item, id: '22222222-2222-4222-8222-222222222222' }])
		expect(fav.items).toHaveLength(2)
	})
})
