import { request, type APIRequestContext } from '@playwright/test'

export const BACKEND_URL = 'http://127.0.0.1:8001'

let _client: APIRequestContext | null = null

export async function api(): Promise<APIRequestContext> {
	if (!_client) _client = await request.newContext({ baseURL: BACKEND_URL })
	return _client
}

export async function resetBackend(): Promise<void> {
	const c = await api()
	const r = await c.post('/api/_test/reset')
	if (!r.ok()) throw new Error(`reset failed: ${r.status()}`)
}

export async function clearRateLimits(): Promise<void> {
	const c = await api()
	await c.post('/api/_test/clear_rate_limits')
}
