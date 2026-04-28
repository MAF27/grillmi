import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
	__resetForTests,
	enqueueSyncRow,
	listSyncQueue,
	setSyncMeta,
} from '$lib/stores/db'
import { authStore } from '$lib/stores/authStore.svelte'
import { enqueueSync, flush } from '$lib/sync/queue'

beforeEach(async () => {
	__resetForTests()
	;(globalThis as unknown as { indexedDB: unknown }).indexedDB = new IDBFactory()
	authStore.setSession({ user: { id: 'u1', email: 'm@example.com' }, csrfToken: 'csrf-abc' })
	await setSyncMeta('firstLoginMigrationComplete', true)
	vi.restoreAllMocks()
})

afterEach(() => {
	authStore.clear()
})

describe('syncQueue', () => {
	it('test_enqueue_persists_to_idb', async () => {
		await enqueueSync({ method: 'POST', path: '/api/grilladen', body: '{"name":"x"}' })
		const rows = await listSyncQueue()
		expect(rows).toHaveLength(1)
		expect(rows[0].method).toBe('POST')
		expect(rows[0].path).toBe('/api/grilladen')
	})

	it('test_enqueue_skips_when_first_login_not_complete', async () => {
		await setSyncMeta('firstLoginMigrationComplete', false)
		await enqueueSync({ method: 'POST', path: '/api/grilladen', body: '{}' })
		expect(await listSyncQueue()).toEqual([])
	})

	it('test_enqueue_skips_when_unauthenticated', async () => {
		authStore.clear()
		await enqueueSync({ method: 'POST', path: '/api/grilladen', body: '{}' })
		expect(await listSyncQueue()).toEqual([])
	})

	it('test_enqueue_ignores_get', async () => {
		await enqueueSync({ method: 'GET', path: '/api/grilladen' })
		expect(await listSyncQueue()).toEqual([])
	})

	it('test_flush_drains_queue_in_order', async () => {
		const seen: string[] = []
		const fakeFetch = vi.fn(async (path: string) => {
			seen.push(path)
			return new Response(null, { status: 204 })
		})
		vi.stubGlobal('fetch', fakeFetch)

		await enqueueSyncRow({ method: 'POST', path: '/api/grilladen', body: '{}', createdEpoch: 1 })
		await enqueueSyncRow({ method: 'POST', path: '/api/menus', body: '{}', createdEpoch: 2 })
		await enqueueSyncRow({ method: 'POST', path: '/api/favorites', body: '{}', createdEpoch: 3 })

		await flush()

		expect(seen).toEqual(['/api/grilladen', '/api/menus', '/api/favorites'])
		expect(await listSyncQueue()).toEqual([])
	})

	it('test_401_during_flush_persists_queue_and_clears_auth', async () => {
		// Stub window.location to a benign one so the redirect call doesn't blow up.
		const orig = (globalThis as { window?: unknown }).window
		;(globalThis as unknown as { window: unknown }).window = {
			location: {
				pathname: '/account',
				search: '',
				assign: vi.fn(),
			},
		}
		const fakeFetch = vi.fn(async () => new Response(null, { status: 401 }))
		vi.stubGlobal('fetch', fakeFetch)

		await enqueueSyncRow({ method: 'POST', path: '/api/grilladen', body: '{}', createdEpoch: 1 })

		await flush()

		const rows = await listSyncQueue()
		expect(rows).toHaveLength(1) // queue is preserved
		expect(authStore.user).toBe(null)

		;(globalThis as unknown as { window: unknown }).window = orig
	})

	it('test_409_continues_queue', async () => {
		const seen: number[] = []
		let call = 0
		const fakeFetch = vi.fn(async () => {
			call++
			seen.push(call)
			if (call === 1) return new Response('{}', { status: 409 })
			return new Response(null, { status: 204 })
		})
		vi.stubGlobal('fetch', fakeFetch)

		await enqueueSyncRow({ method: 'POST', path: '/api/grilladen', body: '{}', createdEpoch: 1 })
		await enqueueSyncRow({ method: 'POST', path: '/api/menus', body: '{}', createdEpoch: 2 })

		await flush()

		// Both writes attempted, both rows removed (409 drops the row, 204 drops it).
		expect(seen).toEqual([1, 2])
		expect(await listSyncQueue()).toEqual([])
	})

	it('test_5xx_keeps_row_in_queue', async () => {
		const fakeFetch = vi.fn(async () => new Response(null, { status: 502 }))
		vi.stubGlobal('fetch', fakeFetch)

		await enqueueSyncRow({ method: 'POST', path: '/api/grilladen', body: '{}', createdEpoch: 1 })

		await flush()

		const rows = await listSyncQueue()
		expect(rows).toHaveLength(1)
	})
})
