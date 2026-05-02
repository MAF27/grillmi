import type { Browser, BrowserContext } from '@playwright/test'

import { FRONTEND_URL, loginViaApi } from './auth'

export interface AuthedContext {
	context: BrowserContext
	csrfToken: string
}

export async function newAuthedContext(browser: Browser, email: string): Promise<AuthedContext> {
	const ctx = await browser.newContext({ baseURL: FRONTEND_URL })
	const { csrfToken } = await loginViaApi(ctx, email)
	return { context: ctx, csrfToken }
}

export async function createGrillade(
	authed: AuthedContext,
	body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const r = await authed.context.request.post(`${FRONTEND_URL}/api/grilladen`, {
		data: body,
		headers: { 'X-CSRFToken': authed.csrfToken, 'Content-Type': 'application/json' },
	})
	if (!r.ok()) throw new Error(`create grillade failed: ${r.status()} ${await r.text()}`)
	return (await r.json()) as Record<string, unknown>
}

export async function patchGrillade(
	authed: AuthedContext,
	id: string,
	body: Record<string, unknown>,
): Promise<{ status: number; json: unknown }> {
	const r = await authed.context.request.patch(`${FRONTEND_URL}/api/grilladen/${id}`, {
		data: body,
		headers: { 'X-CSRFToken': authed.csrfToken, 'Content-Type': 'application/json' },
		failOnStatusCode: false,
	})
	let json: unknown = null
	try {
		json = await r.json()
	} catch {
		/* no body */
	}
	return { status: r.status(), json }
}

export async function deleteGrillade(authed: AuthedContext, id: string): Promise<number> {
	const r = await authed.context.request.delete(`${FRONTEND_URL}/api/grilladen/${id}`, {
		headers: { 'X-CSRFToken': authed.csrfToken },
		failOnStatusCode: false,
	})
	return r.status()
}

export async function listGrilladen(
	authed: AuthedContext,
	since = '1970-01-01T00:00:00Z',
): Promise<Array<Record<string, unknown>>> {
	const r = await authed.context.request.get(
		`${FRONTEND_URL}/api/grilladen?since=${encodeURIComponent(since)}`,
	)
	if (!r.ok()) throw new Error(`list grilladen failed: ${r.status()}`)
	const body = (await r.json()) as { rows: Array<Record<string, unknown>>; server_time: string }
	return body.rows
}

export function newGrillade(name: string): Record<string, unknown> {
	return {
		id: crypto.randomUUID(),
		name,
		status: 'planned',
		target_finish_at: new Date(Date.now() + 3_600_000).toISOString(),
		started_at: null,
		ended_at: null,
		position: 1,
		updated_at: new Date().toISOString(),
		deleted_at: null,
	}
}
