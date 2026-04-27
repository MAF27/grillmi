import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { favoritesStore } from '$lib/stores/favoritesStore.svelte'
import { __resetForTests } from '$lib/stores/db'

const config = {
	name: 'Mein Steak',
	categorySlug: 'beef',
	cutSlug: 'rinds-entrecote-ribeye-steak-boneless',
	thicknessCm: 3,
	prepLabel: null,
	doneness: 'Medium-rare',
	label: 'Rinds-Entrecôte 3 cm, Medium-rare',
	cookSeconds: 360,
	restSeconds: 300,
	flipFraction: 0.5,
	idealFlipPattern: 'once' as const,
	heatZone: 'Direct high',
	grateTempC: null,
}

beforeEach(() => {
	favoritesStore._reset()
	__resetForTests()
	;(globalThis as unknown as { indexedDB: unknown }).indexedDB = new IDBFactory()
})

describe('favoritesStore', () => {
	it('test_save_favorite_persists_single_item', async () => {
		const fav = await favoritesStore.save(config)
		expect(fav.id).toBeTruthy()
		expect(fav.cookSeconds).toBe(360)
		expect(favoritesStore.all).toHaveLength(1)

		// Round-trip through IDB.
		favoritesStore._reset()
		await favoritesStore.init()
		expect(favoritesStore.all).toHaveLength(1)
		expect(favoritesStore.all[0].label).toBe('Rinds-Entrecôte 3 cm, Medium-rare')
	})

	it('test_rename_favorite', async () => {
		const fav = await favoritesStore.save(config)
		await favoritesStore.rename(fav.id, 'New Name')
		expect(favoritesStore.all[0].name).toBe('New Name')

		favoritesStore._reset()
		await favoritesStore.init()
		expect(favoritesStore.all[0].name).toBe('New Name')
	})

	it('test_delete_favorite', async () => {
		const fav = await favoritesStore.save(config)
		await favoritesStore.remove(fav.id)
		expect(favoritesStore.all).toHaveLength(0)

		favoritesStore._reset()
		await favoritesStore.init()
		expect(favoritesStore.all).toHaveLength(0)
	})

	it('test_touch_favorite_updates_last_used', async () => {
		const a = await favoritesStore.save({ ...config, name: 'A' })
		const b = await favoritesStore.save({ ...config, name: 'B' })
		expect(favoritesStore.all[0].id).toBe(b.id)

		await favoritesStore.touch(a.id)
		expect(favoritesStore.all[0].id).toBe(a.id)
		expect(favoritesStore.all[0].lastUsedEpoch).toBeGreaterThanOrEqual(a.lastUsedEpoch)
	})

	it('test_favorites_init_returns_empty_list_on_fresh_db', async () => {
		await favoritesStore.init()
		expect(favoritesStore.all).toEqual([])
	})
})
