import { authStore } from '$lib/stores/authStore.svelte'
import {
	enqueueSyncRow,
	listSyncQueue,
	popSyncRow,
	type SyncQueueRow,
} from '$lib/stores/db'
import { debugSync } from './debug'
import { pull } from './pull'

const FLUSH_DEBOUNCE_MS = 200
const LIVE_SYNC_INTERVAL_MS = 1500
const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushPromise: Promise<void> | null = null
let attached = false
let liveSyncTimer: ReturnType<typeof setInterval> | null = null
let liveSyncPromise: Promise<void> | null = null

interface EnqueueArgs {
	method: string
	path: string
	body?: string
}

export async function enqueueSync(args: EnqueueArgs): Promise<boolean> {
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

export function scheduleFlush(): void {
	if (flushTimer) clearTimeout(flushTimer)
	flushTimer = setTimeout(() => {
		flushTimer = null
		void flush()
	}, FLUSH_DEBOUNCE_MS)
}

export async function flush(): Promise<void> {
	if (flushPromise) return flushPromise
	flushPromise = (async () => {
		try {
			const rows = (await listSyncQueue()).sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
			debugSync('queue', 'flush start', { count: rows.length })
			for (const row of rows) {
				const ok = await sendOne(row)
				if (!ok) break
			}
			debugSync('queue', 'flush done', { remaining: (await listSyncQueue()).length })
		} finally {
			flushPromise = null
		}
	})()
	return flushPromise
}

async function sendOne(row: SyncQueueRow): Promise<boolean> {
	if (row.id === undefined) return false
	const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
	if (authStore.csrfToken) headers['X-CSRFToken'] = authStore.csrfToken
	let response: Response
	try {
		debugSync('queue', 'send start', { id: row.id, method: row.method, path: row.path })
		response = await fetch(row.path, {
			method: row.method,
			headers,
			body: row.body,
			credentials: 'include',
		})
	} catch (error) {
		debugSync('queue', 'send network error', { id: row.id, method: row.method, path: row.path, error: String(error) })
		return false
	}
	const text = await response.clone().text().catch(() => '')
	debugSync('queue', 'send response', {
		id: row.id,
		method: row.method,
		path: row.path,
		status: response.status,
		body: text.slice(0, 300),
	})
	if (response.status === 401) {
		authStore.clear()
		if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
			const next = encodeURIComponent(window.location.pathname + window.location.search)
			window.location.assign(`/login?next=${next}`)
		}
		return false
	}
	// 409 (stale): drop the queued write; the client refetches via pull.
	// 2xx: drop the row. 4xx other than 401: drop too (client bug, do not block flush).
	// 5xx: keep the row for retry.
	if (response.status >= 500) return false
	await popSyncRow(row.id)
	return true
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

export async function syncNow(reason = 'manual'): Promise<void> {
	if (liveSyncPromise) return liveSyncPromise
	liveSyncPromise = (async () => {
		try {
			if (!authStore.isAuthenticated) return
			debugSync('sync', 'cycle start', { reason })
			await flush()
			await pull()
			debugSync('sync', 'cycle done', { reason })
		} finally {
			liveSyncPromise = null
		}
	})()
	return liveSyncPromise
}

export function detachSyncForTests(): void {
	if (liveSyncTimer) clearInterval(liveSyncTimer)
	liveSyncTimer = null
	attached = false
}
