import { authStore } from '$lib/stores/authStore.svelte'
import {
	enqueueSyncRow,
	getSyncMeta,
	listSyncQueue,
	putGrillade,
	setSyncMeta,
	type GrilladeRow,
} from '$lib/stores/db'
import { debugSync } from './debug'
import { pullDeltas, retireOtherActiveGrilladen } from './_adapters/pull'
import { sendQueueRow } from './_adapters/queue'

const FLUSH_DEBOUNCE_MS = 200
const LIVE_SYNC_INTERVAL_MS = 1500
const LAST_PULL_KEY = 'lastPullEpoch'
const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushPromise: Promise<void> | null = null
let attached = false
let liveSyncTimer: ReturnType<typeof setInterval> | null = null
let liveSyncPromise: Promise<void> | null = null
const syncAppliedListeners = new Set<() => void | Promise<void>>()

export interface EnqueueArgs {
	method: string
	path: string
	body?: string
}

/** Enqueue a write to the sync queue. Returns false if the method is not a
 * write or the user is unauthenticated. */
export async function enqueueWrite(args: EnqueueArgs): Promise<boolean> {
	if (!WRITE_METHODS.has(args.method)) {
		debugSync('queue', 'enqueue skipped: unsupported method', { method: args.method, path: args.path })
		return false
	}
	if (!authStore.isAuthenticated) {
		debugSync('queue', 'enqueue skipped: unauthenticated', { method: args.method, path: args.path })
		return false
	}

	const id = await enqueueSyncRow({
		method: args.method,
		path: args.path,
		body: args.body,
		createdEpoch: Date.now(),
	})
	debugSync('queue', 'enqueued', { id, method: args.method, path: args.path, hasBody: Boolean(args.body) })
	scheduleFlush()
	return true
}

function scheduleFlush(): void {
	if (flushTimer) clearTimeout(flushTimer)
	flushTimer = setTimeout(() => {
		flushTimer = null
		void flush()
	}, FLUSH_DEBOUNCE_MS)
}

/** Drain the queue once. Exported for tests; production code uses syncNow. */
export async function flush(): Promise<void> {
	if (flushPromise) return flushPromise
	flushPromise = (async () => {
		try {
			const rows = (await listSyncQueue()).sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
			debugSync('queue', 'flush start', { count: rows.length })
			for (const row of rows) {
				const outcome = await sendQueueRow(row)
				if (outcome === 'auth_lost' || outcome === 'keep') break
			}
			debugSync('queue', 'flush done', { remaining: (await listSyncQueue()).length })
		} finally {
			flushPromise = null
		}
	})()
	return flushPromise
}

/** Check whether a previously-pushed grillade row still exists on the server.
 * If the server returned 404, reset the local push flags so the next push
 * re-creates the row. The lifecycle calls this before enqueueing updates to
 * an existing row. */
export async function repairMissingServerRow(row: GrilladeRow): Promise<void> {
	if (!row.pushedToServer || typeof fetch === 'undefined') return
	try {
		const response = await fetch(`/api/grilladen/${row.id}`, {
			credentials: 'include',
			headers: { Accept: 'application/json' },
		})
		debugSync('grilladeStore', 'server row check', { id: row.id, status: response.status })
		if (response.status !== 404) return
		row.pushedToServer = false
		row.syncedItemIds = []
		await putGrillade(row)
		debugSync('grilladeStore', 'server row missing: reset push flags', { id: row.id })
	} catch (error) {
		debugSync('grilladeStore', 'server row check error', { id: row.id, error: String(error) })
	}
}

/** Run a full sync cycle: drain the write queue, pull deltas, retire any
 * previously-active grilladen, persist the watermark, and notify subscribers
 * if anything changed. */
export async function syncNow(reason = 'manual'): Promise<void> {
	if (liveSyncPromise) return liveSyncPromise
	liveSyncPromise = (async () => {
		try {
			if (!authStore.isAuthenticated) return
			debugSync('sync', 'cycle start', { reason })
			await flush()

			const since = ((await getSyncMeta(LAST_PULL_KEY)) as string | undefined) ?? '1970-01-01T00:00:00Z'
			const result = await pullDeltas(since)
			for (const activeId of result.activeIds) {
				await retireOtherActiveGrilladen(activeId)
			}
			if (result.serverTime) {
				await setSyncMeta(LAST_PULL_KEY, result.serverTime)
				debugSync('pull', 'watermark updated', { serverTime: result.serverTime })
			}
			if (result.changed) await notifySyncApplied(reason)
			debugSync('sync', 'cycle done', { reason })
		} finally {
			liveSyncPromise = null
		}
	})()
	return liveSyncPromise
}

export function subscribe(listener: () => void | Promise<void>): () => void {
	syncAppliedListeners.add(listener)
	return () => {
		syncAppliedListeners.delete(listener)
	}
}

/** Retained alias of `subscribe` to keep current call sites stable. */
export const onSyncApplied = subscribe

async function notifySyncApplied(reason: string): Promise<void> {
	debugSync('sync', 'applied remote/local changes', { reason, listeners: syncAppliedListeners.size })
	await Promise.all([...syncAppliedListeners].map(listener => listener()))
}

export function attachSync(): void {
	if (attached || typeof document === 'undefined') return
	attached = true
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') void syncNow('visible')
	})
	window.addEventListener('online', () => {
		void syncNow('online')
	})
	liveSyncTimer = setInterval(() => {
		if (document.visibilityState === 'visible') void syncNow('interval')
	}, LIVE_SYNC_INTERVAL_MS)
	void syncNow('attach')
}

export function detachSyncForTests(): void {
	if (liveSyncTimer) clearInterval(liveSyncTimer)
	liveSyncTimer = null
	attached = false
	syncAppliedListeners.clear()
}
