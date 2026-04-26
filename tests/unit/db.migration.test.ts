import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { listSavedPlans, listFavorites, __resetForTests } from '$lib/stores/db'

const v1Plan = {
	id: '11111111-1111-4111-8111-111111111111',
	name: 'Alter Plan',
	items: [
		{
			id: '22222222-2222-4222-8222-222222222222',
			categorySlug: 'beef',
			cutSlug: 'rinds-entrecote-ribeye-steak-boneless',
			thicknessCm: 3,
			prepLabel: null,
			doneness: 'Medium-rare',
			label: 'Steak',
			cookSeconds: 360,
			restSeconds: 300,
			flipFraction: 0.5,
			idealFlipPattern: 'once',
			heatZone: 'Direct high',
		},
	],
	createdAtEpoch: 1700000000000,
	lastUsedEpoch: 1700000000000,
}

function openV1WithSeed(records: Array<typeof v1Plan>): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const req = indexedDB.open('grillmi', 1)
		req.onupgradeneeded = () => {
			const db = req.result
			if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions')
			if (!db.objectStoreNames.contains('favorites')) db.createObjectStore('favorites')
			if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings')
		}
		req.onsuccess = () => {
			const db = req.result
			if (records.length === 0) {
				db.close()
				resolve()
				return
			}
			const tx = db.transaction('favorites', 'readwrite')
			for (const r of records) tx.objectStore('favorites').put(r, r.id)
			tx.oncomplete = () => {
				db.close()
				resolve()
			}
			tx.onerror = () => {
				db.close()
				reject(tx.error)
			}
		}
		req.onerror = () => reject(req.error)
	})
}

beforeEach(() => {
	__resetForTests()
	;(globalThis as unknown as { indexedDB: unknown }).indexedDB = new IDBFactory()
})

describe('db migration v1→v2', () => {
	it('test_v1_to_v2_moves_records_into_plans', async () => {
		const second = { ...v1Plan, id: '33333333-3333-4333-8333-333333333333', name: 'Anderer Plan' }
		await openV1WithSeed([v1Plan, second])

		// First call to listSavedPlans triggers getDB() which runs the v2 migration.
		const plans = await listSavedPlans()
		expect(plans).toHaveLength(2)
		expect(plans.map(p => p.name).sort()).toEqual(['Alter Plan', 'Anderer Plan'])

		const favorites = await listFavorites()
		expect(favorites).toEqual([])
	})

	it('test_v1_to_v2_drops_old_favorites_store_shape', async () => {
		await openV1WithSeed([v1Plan])
		await listSavedPlans()
		// New favorites store exists and is empty (the v1 records are now in plans, not favorites).
		const favorites = await listFavorites()
		expect(favorites).toEqual([])
		const plans = await listSavedPlans()
		expect(plans[0].items).toHaveLength(1)
	})

	it('test_fresh_install_at_v2_creates_all_stores', async () => {
		// No v1 seeding — getDB() opens directly at v2.
		const plans = await listSavedPlans()
		const favorites = await listFavorites()
		expect(plans).toEqual([])
		expect(favorites).toEqual([])
	})
})
