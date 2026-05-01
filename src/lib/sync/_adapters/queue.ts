import { authStore } from '$lib/stores/authStore.svelte'
import { popSyncRow, type SyncQueueRow } from '$lib/stores/db'
import { debugSync } from '../debug'

export type SendOutcome = 'sent' | 'keep' | 'auth_lost'

/** Sends one queued write to the server. Translates HTTP status into a flush
 * outcome: 5xx keeps the row for retry; 401 clears auth and signals the caller
 * to stop the flush; 2xx, 409, and other 4xx drop the row. */
export async function sendQueueRow(row: SyncQueueRow): Promise<SendOutcome> {
	if (row.id === undefined) return 'keep'
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
		debugSync('queue', 'send network error', {
			id: row.id,
			method: row.method,
			path: row.path,
			error: String(error),
		})
		return 'keep'
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
		return 'auth_lost'
	}
	// 5xx keeps the row for retry. 2xx/409/other-4xx drops the row.
	if (response.status >= 500) return 'keep'
	await popSyncRow(row.id)
	return 'sent'
}
