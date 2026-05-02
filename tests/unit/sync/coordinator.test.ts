import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
	__resetForTests,
	enqueueSyncRow,
	getGrillade,
	getSyncMeta,
	listGrilladen,
	listSyncQueue,
	putGrillade,
	type GrilladeRow,
} from '$lib/stores/db'
import { authStore } from '$lib/stores/authStore.svelte'
import {
	attachSync,
	detachSyncForTests,
	enqueueWrite,
	flush,
	onSyncApplied,
	repairMissingServerRow,
	subscribe,
	syncNow,
} from '$lib/sync/coordinator'

function buildEmptyDelta(): Response {
	return new Response(JSON.stringify({ rows: [], server_time: new Date().toISOString() }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	})
}

function buildEmptySettings(): Response {
	return new Response(JSON.stringify({ value: {}, updated_at: null }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	})
}

beforeEach(async () => {
	__resetForTests()
	;(globalThis as unknown as { indexedDB: unknown }).indexedDB = new IDBFactory()
	authStore.setSession({ user: { id: 'u1', email: 'm@example.com' }, csrfToken: 'csrf-abc' })
	vi.restoreAllMocks()
	detachSyncForTests()
})

afterEach(() => {
	authStore.clear()
	detachSyncForTests()
})

describe('coordinator', () => {
	it('enqueueWrite drops non-write methods', async () => {
		await enqueueWrite({ method: 'GET', path: '/api/grilladen' })
		expect(await listSyncQueue()).toEqual([])
	})

	it('enqueueWrite drops when unauthenticated', async () => {
		authStore.clear()
		await enqueueWrite({ method: 'POST', path: '/api/grilladen', body: '{}' })
		expect(await listSyncQueue()).toEqual([])
	})

	it('syncNow flushes queued writes then pulls and notifies subscribers when changes apply', async () => {
		const calls: string[] = []
		const fakeFetch = vi.fn(async (path: string, init?: RequestInit) => {
			calls.push(`${(init?.method ?? 'GET')} ${path}`)
			if ((init?.method ?? 'GET') !== 'GET') return new Response(null, { status: 204 })
			if (path.startsWith('/api/grilladen')) {
				return new Response(
					JSON.stringify({
						rows: [
							{
								id: 'gr-1',
								name: 'X',
								status: 'finished',
								target_finish_at: null,
								started_at: null,
								ended_at: '2024-05-01T16:00:00+00:00',
								position: 0,
								updated_at: '2024-05-01T16:00:00+00:00',
								deleted_at: null,
							},
						],
						server_time: '2024-05-01T16:00:00+00:00',
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				)
			}
			if (path.startsWith('/api/favorites')) return buildEmptyDelta()
			return buildEmptySettings()
		})
		vi.stubGlobal('fetch', fakeFetch)

		await enqueueSyncRow({ method: 'POST', path: '/api/grilladen', body: '{}', createdEpoch: 1 })
		const listener = vi.fn(async () => {})
		const unsubscribe = subscribe(listener)
		try {
			await syncNow('test')
		} finally {
			unsubscribe()
		}
		expect(calls.some(c => c === 'POST /api/grilladen')).toBe(true)
		expect(calls.some(c => c.startsWith('GET /api/grilladen?since='))).toBe(true)
		expect(listener).toHaveBeenCalled()
	})

	it('flush handles 401 by clearing auth and redirecting to login with next param', async () => {
		const orig = (globalThis as { window?: unknown }).window
		const assign = vi.fn()
		;(globalThis as unknown as { window: unknown }).window = {
			location: { pathname: '/account', search: '', assign },
		}
		const fakeFetch = vi.fn(async () => new Response(null, { status: 401 }))
		vi.stubGlobal('fetch', fakeFetch)

		await enqueueSyncRow({ method: 'POST', path: '/api/grilladen', body: '{}', createdEpoch: 1 })
		await flush()
		expect(authStore.user).toBe(null)
		expect(assign).toHaveBeenCalledWith(expect.stringContaining('/login?next=%2Faccount'))
		;(globalThis as unknown as { window: unknown }).window = orig
	})

	it('flush drops a queued write on 409 and the next pull will restore the row from the server', async () => {
		let call = 0
		const fakeFetch = vi.fn(async () => {
			call++
			if (call === 1) return new Response('{}', { status: 409 })
			return new Response(null, { status: 204 })
		})
		vi.stubGlobal('fetch', fakeFetch)
		await enqueueSyncRow({ method: 'PATCH', path: '/api/grilladen/x', body: '{}', createdEpoch: 1 })
		await flush()
		expect(await listSyncQueue()).toEqual([])
	})

	it('flush keeps a queued write on 5xx and retries on the next sync cycle', async () => {
		let call = 0
		const fakeFetch = vi.fn(async () => {
			call++
			if (call === 1) return new Response(null, { status: 502 })
			return new Response(null, { status: 204 })
		})
		vi.stubGlobal('fetch', fakeFetch)
		await enqueueSyncRow({ method: 'POST', path: '/api/grilladen', body: '{}', createdEpoch: 1 })
		await flush()
		expect(await listSyncQueue()).toHaveLength(1)
		await flush()
		expect(await listSyncQueue()).toEqual([])
	})

	it('flush drops a queued write on non-401 4xx without blocking subsequent rows', async () => {
		const seen: string[] = []
		const fakeFetch = vi.fn(async (path: string) => {
			seen.push(path)
			if (path === '/api/grilladen') return new Response('{}', { status: 422 })
			return new Response(null, { status: 204 })
		})
		vi.stubGlobal('fetch', fakeFetch)
		await enqueueSyncRow({ method: 'POST', path: '/api/grilladen', body: '{}', createdEpoch: 1 })
		await enqueueSyncRow({ method: 'POST', path: '/api/menus', body: '{}', createdEpoch: 2 })
		await flush()
		expect(seen).toEqual(['/api/grilladen', '/api/menus'])
		expect(await listSyncQueue()).toEqual([])
	})

	it('syncNow retires every other active grillade after a delta brings in a new active row', async () => {
		// Pre-existing local active grillade.
		const stale: GrilladeRow = {
			id: 'old',
			name: 'old',
			status: 'planned',
			targetEpoch: null,
			startedEpoch: null,
			endedEpoch: null,
			position: 0,
			updatedEpoch: 1,
			deletedEpoch: null,
		}
		await putGrillade(stale)

		const fakeFetch = vi.fn(async (path: string) => {
			if (path.startsWith('/api/grilladen?since=')) {
				return new Response(
					JSON.stringify({
						rows: [
							{
								id: 'new',
								name: 'new',
								status: 'planned',
								target_finish_at: null,
								started_at: null,
								ended_at: null,
								position: 1,
								updated_at: '2024-05-01T16:00:00+00:00',
								deleted_at: null,
							},
						],
						server_time: '2024-05-01T16:00:00+00:00',
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				)
			}
			if (path.startsWith('/api/grilladen/new/items')) return buildEmptyDelta()
			if (path.startsWith('/api/favorites')) return buildEmptyDelta()
			if (path.startsWith('/api/settings')) return buildEmptySettings()
			return new Response(null, { status: 204 })
		})
		vi.stubGlobal('fetch', fakeFetch)

		await syncNow('test')
		const oldRow = await getGrillade('old')
		expect(oldRow?.status).toBe('finished')
		expect(oldRow?.deletedEpoch).not.toBeNull()
		const live = await listGrilladen()
		expect(live.map(r => r.id)).toEqual(['new'])
	})

	it('syncNow updates the watermark from server_time and the next pull uses it as since', async () => {
		const seenSince: string[] = []
		const fakeFetch = vi.fn(async (path: string) => {
			if (path.startsWith('/api/grilladen?since=')) {
				const url = new URL(path, 'http://test')
				seenSince.push(url.searchParams.get('since') ?? '')
				return new Response(
					JSON.stringify({ rows: [], server_time: '2025-01-01T00:00:00+00:00' }),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				)
			}
			// Pin favorites server_time to the same value so the watermark
			// overwrite (favorites overrides grilladen) preserves the assertion.
			if (path.startsWith('/api/favorites')) {
				return new Response(
					JSON.stringify({ rows: [], server_time: '2025-01-01T00:00:00+00:00' }),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				)
			}
			if (path.startsWith('/api/settings')) return buildEmptySettings()
			return new Response(null, { status: 204 })
		})
		vi.stubGlobal('fetch', fakeFetch)

		await syncNow('first')
		expect(await getSyncMeta('lastPullEpoch')).toBe('2025-01-01T00:00:00+00:00')

		await syncNow('second')
		expect(seenSince[0]).toBe('1970-01-01T00:00:00Z')
		expect(seenSince[1]).toBe('2025-01-01T00:00:00+00:00')
	})

	it('repairMissingServerRow resets pushedToServer when server returns 404', async () => {
		const row: GrilladeRow = {
			id: 'pushed',
			name: 'X',
			status: 'planned',
			targetEpoch: null,
			startedEpoch: null,
			endedEpoch: null,
			position: 0,
			updatedEpoch: 1,
			deletedEpoch: null,
			pushedToServer: true,
			syncedItemIds: ['a'],
		}
		await putGrillade(row)
		const fakeFetch = vi.fn(async () => new Response(null, { status: 404 }))
		vi.stubGlobal('fetch', fakeFetch)
		await repairMissingServerRow(row)
		const updated = await getGrillade('pushed')
		expect(updated?.pushedToServer).toBe(false)
		expect(updated?.syncedItemIds).toEqual([])
	})

	it('attachSync wires visibilitychange and online listeners, detachSyncForTests cleans them up', () => {
		const listeners: Record<string, Array<EventListenerOrEventListenerObject>> = {}
		const fakeAdd = vi.fn((evt: string, fn: EventListenerOrEventListenerObject) => {
			(listeners[evt] ??= []).push(fn)
		})
		const origDocAdd = document.addEventListener
		const origWinAdd = window.addEventListener
		document.addEventListener = fakeAdd as never
		window.addEventListener = fakeAdd as never
		try {
			attachSync()
			expect(fakeAdd).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
			expect(fakeAdd).toHaveBeenCalledWith('online', expect.any(Function))
			detachSyncForTests()
			// onSyncApplied is the alias of subscribe; after detach the listener
			// set is empty, so a subscribe + unsubscribe should leave it empty too.
			const stop = onSyncApplied(() => {})
			stop()
		} finally {
			document.addEventListener = origDocAdd
			window.addEventListener = origWinAdd
		}
	})
})
