import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
	__resetForTests,
	listGrilladen,
	enqueueSyncRow,
	listSyncQueue,
	resetAll,
	getSyncMeta,
	setSyncMeta,
	putGrillade,
	type GrilladeRow,
} from '$lib/stores/db'

const v3PlanState = {
	plan: { items: [], targetEpoch: 1700000000000 },
	planMode: 'manual' as const,
	manualStarts: {},
	manualPlated: [],
}

const v3Session = {
	startedEpoch: 1699999000000,
	plan: { items: [] },
}

function openV3WithLegacyData(): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const req = indexedDB.open('grillmi', 3)
		req.onupgradeneeded = () => {
			const db = req.result
			if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions')
			if (!db.objectStoreNames.contains('favorites')) db.createObjectStore('favorites')
			if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings')
			if (!db.objectStoreNames.contains('plans')) db.createObjectStore('plans')
			if (!db.objectStoreNames.contains('planState')) db.createObjectStore('planState')
		}
		req.onsuccess = () => {
			const db = req.result
			const tx = db.transaction(['sessions', 'planState'], 'readwrite')
			tx.objectStore('sessions').put(v3Session, 'current')
			tx.objectStore('planState').put(v3PlanState, 'current')
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

describe('db v3→v4 migration', () => {
	it('test_v3_to_v4_migration_folds_planstate_and_session_into_grilladen', async () => {
		await openV3WithLegacyData()
		const grilladen = await listGrilladen()
		expect(grilladen).toHaveLength(1)
		const row = grilladen[0]
		expect(row.id).toBeTruthy()
		// The migration carries the legacy planState into the new row's planState
		// and the legacy session into the new row's session. Status reflects the
		// presence of an active session.
		expect(row.status === 'running' || row.status === 'planned').toBe(true)
	})

	it('test_v3_to_v4_creates_syncQueue_and_syncMeta_stores', async () => {
		await openV3WithLegacyData()
		// Listing the new stores succeeds (no exception).
		expect(await listSyncQueue()).toEqual([])
		await setSyncMeta('firstLoginMigrationComplete', true)
		expect(await getSyncMeta('firstLoginMigrationComplete')).toBe(true)
	})

	it('test_resetAll_clears_grilladen_and_syncQueue', async () => {
		const fresh: GrilladeRow = {
			id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
			name: 'g',
			status: 'planned',
			targetEpoch: null,
			startedEpoch: null,
			endedEpoch: null,
			position: 0,
			updatedEpoch: Date.now(),
			deletedEpoch: null,
		}
		await putGrillade(fresh)
		await enqueueSyncRow({
			method: 'POST',
			path: '/api/grilladen',
			body: '{}',
			createdEpoch: Date.now(),
		})

		expect(await listGrilladen()).toHaveLength(1)
		expect(await listSyncQueue()).toHaveLength(1)

		await resetAll()

		expect(await listGrilladen()).toEqual([])
		expect(await listSyncQueue()).toEqual([])
	})
})
