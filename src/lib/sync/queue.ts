import { authStore } from '$lib/stores/authStore.svelte'
import {
	enqueueSyncRow,
	getSyncMeta,
	listSyncQueue,
	popSyncRow,
	type SyncQueueRow,
} from '$lib/stores/db'

const FLUSH_DEBOUNCE_MS = 200
const FIRST_LOGIN_KEY = 'firstLoginMigrationComplete'
const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushPromise: Promise<void> | null = null
let attached = false

interface EnqueueArgs {
	method: string
	path: string
	body?: string
}

export async function enqueueSync(args: EnqueueArgs): Promise<void> {
	if (!WRITE_METHODS.has(args.method)) return
	if (!authStore.isAuthenticated) return
	const ready = (await getSyncMeta(FIRST_LOGIN_KEY)) === true
	if (!ready) return

	await enqueueSyncRow({
		method: args.method,
		path: args.path,
		body: args.body,
		createdEpoch: Date.now(),
	})
	scheduleFlush()
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
			for (const row of rows) {
				const ok = await sendOne(row)
				if (!ok) break
			}
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
		response = await fetch(row.path, {
			method: row.method,
			headers,
			body: row.body,
			credentials: 'include',
		})
	} catch {
		return false
	}
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
		if (document.visibilityState === 'visible') void flush()
	})
	window.addEventListener('online', () => {
		void flush()
	})
}
