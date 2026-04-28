import { expect, test, type BrowserContext } from '@playwright/test'

import { adminInit } from './_lib/admin'
import { resetBackend } from './_lib/api'
import {
	activateAccount,
	FRONTEND_URL,
	login,
	loginViaApi,
	markFirstLoginComplete,
	PASSWORD,
	uniqueEmail,
} from './_lib/auth'

test.beforeEach(async () => {
	await resetBackend()
})

interface AuthedContext {
	context: BrowserContext
	csrfToken: string
}

async function newAuthedContext(browser: import('@playwright/test').Browser, email: string): Promise<AuthedContext> {
	const ctx = await browser.newContext({ baseURL: FRONTEND_URL })
	const { csrfToken } = await loginViaApi(ctx, email)
	return { context: ctx, csrfToken }
}

async function createGrillade(authed: AuthedContext, body: Record<string, unknown>): Promise<Record<string, unknown>> {
	const r = await authed.context.request.post(`${FRONTEND_URL}/api/grilladen`, {
		data: body,
		headers: { 'X-CSRFToken': authed.csrfToken, 'Content-Type': 'application/json' },
	})
	if (!r.ok()) throw new Error(`create grillade failed: ${r.status()} ${await r.text()}`)
	return (await r.json()) as Record<string, unknown>
}

async function patchGrillade(
	authed: AuthedContext,
	id: string,
	body: Record<string, unknown>
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

async function deleteGrillade(authed: AuthedContext, id: string): Promise<number> {
	const r = await authed.context.request.delete(`${FRONTEND_URL}/api/grilladen/${id}`, {
		headers: { 'X-CSRFToken': authed.csrfToken },
		failOnStatusCode: false,
	})
	return r.status()
}

async function listGrilladen(authed: AuthedContext, since = '1970-01-01T00:00:00Z'): Promise<Array<Record<string, unknown>>> {
	const r = await authed.context.request.get(`${FRONTEND_URL}/api/grilladen?since=${encodeURIComponent(since)}`)
	if (!r.ok()) throw new Error(`list grilladen failed: ${r.status()}`)
	const body = (await r.json()) as { rows: Array<Record<string, unknown>>; server_time: string }
	return body.rows
}

function newGrillade(name: string): Record<string, unknown> {
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

test.describe('sync', () => {
	test('test_grillade_created_in_context_a_appears_in_context_b', async ({ browser }) => {
		const email = uniqueEmail('sync-pair')
		const setupCtx = await browser.newContext({ baseURL: FRONTEND_URL })
		const setupPage = await setupCtx.newPage()
		await activateAccount(setupPage, email)
		await setupCtx.close()

		const a = await newAuthedContext(browser, email)
		const b = await newAuthedContext(browser, email)

		const created = await createGrillade(a, newGrillade('Pair Grillade'))
		const rows = await listGrilladen(b)
		expect(rows.find(r => r.id === created.id)).toBeTruthy()

		await a.context.close()
		await b.context.close()
	})

	test('test_concurrent_patch_resolves_lww', async ({ browser }) => {
		const email = uniqueEmail('lww')
		const setupCtx = await browser.newContext({ baseURL: FRONTEND_URL })
		const setupPage = await setupCtx.newPage()
		await activateAccount(setupPage, email)
		await setupCtx.close()

		const a = await newAuthedContext(browser, email)
		const b = await newAuthedContext(browser, email)
		const created = await createGrillade(a, newGrillade('LWW'))
		const id = created.id as string
		const baseTs = created.updated_at as string

		const newer = new Date(Date.parse(baseTs) + 5_000).toISOString()
		const aPatch = await patchGrillade(a, id, { ...created, name: 'A wins', updated_at: newer })
		expect(aPatch.status).toBe(200)

		const stalePatch = await patchGrillade(b, id, { ...created, name: 'B loses', updated_at: baseTs })
		expect(stalePatch.status).toBe(409)

		const refetch = await b.context.request.get(`${FRONTEND_URL}/api/grilladen/${id}`)
		const final = (await refetch.json()) as Record<string, unknown>
		expect(final.name).toBe('A wins')

		await a.context.close()
		await b.context.close()
	})

	test('test_offline_writes_replay_on_reconnect', async ({ browser }) => {
		const email = uniqueEmail('offline-replay')
		const setupCtx = await browser.newContext({ baseURL: FRONTEND_URL })
		const setupPage = await setupCtx.newPage()
		await activateAccount(setupPage, email)
		await setupCtx.close()

		const ctx = await browser.newContext({ baseURL: FRONTEND_URL })
		const page = await ctx.newPage()
		await login(page, email)
		await markFirstLoginComplete(page)

		const a = { context: ctx, csrfToken: '' } as AuthedContext
		const meResp = await ctx.request.get(`${FRONTEND_URL}/api/auth/me`)
		a.csrfToken = ((await meResp.json()) as { csrfToken: string }).csrfToken

		const id = crypto.randomUUID()
		await ctx.setOffline(true)
		await page.evaluate(async grillade => {
			const { putGrillade } = await (import('/src/lib/stores/db.ts' as string) as Promise<typeof import('$lib/stores/db')>)
			await putGrillade(grillade as unknown as import('$lib/stores/db').GrilladeRow)
			const { enqueueSync } = await (import('/src/lib/sync/queue.ts' as string) as Promise<typeof import('$lib/sync/queue')>)
			await enqueueSync({
				method: 'POST',
				path: '/api/grilladen',
				body: JSON.stringify(grillade),
			})
			const { flush } = await (import('/src/lib/sync/queue.ts' as string) as Promise<typeof import('$lib/sync/queue')>)
			try {
				await flush()
			} catch {
				/* expected offline */
			}
		}, { ...newGrillade('Offline Replay'), id })

		await ctx.setOffline(false)
		await page.evaluate(async () => {
			const { flush } = await (import('/src/lib/sync/queue.ts' as string) as Promise<typeof import('$lib/sync/queue')>)
			await flush()
		})

		const rows = await listGrilladen(a)
		expect(rows.find(r => r.id === id)).toBeTruthy()
		await ctx.close()
	})

	test('test_first_login_bulk_import_runs_once', async ({ browser }) => {
		const email = uniqueEmail('bulk-import')
		const ctx = await browser.newContext({ baseURL: FRONTEND_URL })
		const page = await ctx.newPage()

		const init = await adminInit(email)
		const url = new URL(init.link)
		await page.goto(url.pathname + url.search)

		await page.evaluate(async () => {
			const { putFavorite } = await (import('/src/lib/stores/db.ts' as string) as Promise<typeof import('$lib/stores/db')>)
			const now = Date.now()
			for (let i = 0; i < 5; i++) {
				await putFavorite({
					id: crypto.randomUUID(),
					name: `Fav ${i}`,
					categorySlug: 'beef',
					cutSlug: 'rinds-entrecote-ribeye-steak-boneless',
					thicknessCm: 2.5,
					doneness: 'medium',
					prepLabel: null,
					label: null,
					cookSeconds: 480,
					restSeconds: 300,
					flipFraction: 0.5,
					idealFlipPattern: 'once',
					heatZone: 'Direkt, Deckel zu',
					grateTempC: null,
					createdAtEpoch: now,
					lastUsedEpoch: now,
				})
			}
		})

		await page.locator('#set-password-pw').fill(PASSWORD)
		await page.locator('#set-password-confirm').fill(PASSWORD)
		await page.locator('#set-password-submit').click()
		await page.waitForURL(url => url.pathname === '/', { timeout: 15_000 })

		const favs = (await ctx.request
			.get(`${FRONTEND_URL}/api/favorites?since=1970-01-01T00:00:00Z`)
			.then(r => r.json())) as { rows: unknown[] }
		expect(favs.rows).toHaveLength(5)

		// Sign out via API + cookie clear; then log back in and confirm no duplicate.
		const me = (await ctx.request
			.get(`${FRONTEND_URL}/api/auth/me`)
			.then(r => r.json())) as { csrfToken: string }
		await ctx.request.post(`${FRONTEND_URL}/api/auth/logout`, {
			headers: { 'X-CSRFToken': me.csrfToken },
		})
		await ctx.clearCookies()

		await login(page, email)
		const after = (await ctx.request
			.get(`${FRONTEND_URL}/api/favorites?since=1970-01-01T00:00:00Z`)
			.then(r => r.json())) as { rows: unknown[] }
		expect(after.rows).toHaveLength(5)
		await ctx.close()
	})

	test('test_pull_after_foreground_fetches_recent_changes', async ({ browser }) => {
		const email = uniqueEmail('foreground-pull')
		const setupCtx = await browser.newContext({ baseURL: FRONTEND_URL })
		const setupPage = await setupCtx.newPage()
		await activateAccount(setupPage, email)
		await setupCtx.close()

		const a = await newAuthedContext(browser, email)
		const ctxB = await browser.newContext({ baseURL: FRONTEND_URL })
		const pageB = await ctxB.newPage()
		await login(pageB, email)

		// Hide B
		await pageB.evaluate(() => {
			Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
			document.dispatchEvent(new Event('visibilitychange'))
		})

		const created = await createGrillade(a, newGrillade('From A'))

		await pageB.evaluate(() => {
			Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
			document.dispatchEvent(new Event('visibilitychange'))
		})

		await pageB.waitForFunction(
			async expectedId => {
				const { listGrilladen } = await (import('/src/lib/stores/db.ts' as string) as Promise<typeof import('$lib/stores/db')>)
				const rows = await listGrilladen()
				return rows.some((r: { id: string }) => r.id === expectedId)
			},
			created.id,
			{ timeout: 10_000 }
		)

		await a.context.close()
		await ctxB.close()
	})

	test('test_grillade_soft_delete_propagates_to_other_device', async ({ browser }) => {
		const email = uniqueEmail('soft-delete')
		const setupCtx = await browser.newContext({ baseURL: FRONTEND_URL })
		const setupPage = await setupCtx.newPage()
		await activateAccount(setupPage, email)
		await setupCtx.close()

		const a = await newAuthedContext(browser, email)
		const ctxB = await browser.newContext({ baseURL: FRONTEND_URL })
		const pageB = await ctxB.newPage()
		await login(pageB, email)

		const created = await createGrillade(a, newGrillade('To Delete'))

		// Make sure B sees it before we delete.
		await pageB.waitForFunction(
			async id => {
				const { listGrilladen } = await (import('/src/lib/stores/db.ts' as string) as Promise<typeof import('$lib/stores/db')>)
				const rows = await listGrilladen()
				return rows.some((r: { id: string }) => r.id === id)
			},
			created.id,
			{ timeout: 10_000 }
		)

		const status = await deleteGrillade(a, created.id as string)
		expect(status).toBe(204)

		// Foreground B
		await pageB.evaluate(() => {
			Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
			document.dispatchEvent(new Event('visibilitychange'))
		})

		await pageB.waitForFunction(
			async id => {
				const { listGrilladen } = await (import('/src/lib/stores/db.ts' as string) as Promise<typeof import('$lib/stores/db')>)
				const rows = await listGrilladen()
				const row = rows.find((r: { id: string }) => r.id === id)
				return !row || row.deletedEpoch != null
			},
			created.id,
			{ timeout: 10_000 }
		)

		await a.context.close()
		await ctxB.close()
	})

	test('test_409_on_stale_patch_triggers_refetch', async ({ browser }) => {
		const email = uniqueEmail('409-refetch')
		const setupCtx = await browser.newContext({ baseURL: FRONTEND_URL })
		const setupPage = await setupCtx.newPage()
		await activateAccount(setupPage, email)
		await setupCtx.close()

		const a = await newAuthedContext(browser, email)
		const created = await createGrillade(a, newGrillade('Stale'))
		const id = created.id as string
		const baseTs = created.updated_at as string

		const newer = new Date(Date.parse(baseTs) + 5_000).toISOString()
		await patchGrillade(a, id, { ...created, name: 'server-truth', updated_at: newer })

		// Stale patch - should 409
		const stale = await patchGrillade(a, id, { ...created, name: 'client-stale', updated_at: baseTs })
		expect(stale.status).toBe(409)

		// Client refetches
		const refetch = await a.context.request.get(`${FRONTEND_URL}/api/grilladen/${id}`)
		const fresh = (await refetch.json()) as Record<string, unknown>
		expect(fresh.name).toBe('server-truth')

		await a.context.close()
	})

	test('test_offline_indicator_does_not_block_writes', async ({ browser }) => {
		const email = uniqueEmail('airplane')
		const setupCtx = await browser.newContext({ baseURL: FRONTEND_URL })
		const setupPage = await setupCtx.newPage()
		await activateAccount(setupPage, email)
		await setupCtx.close()

		const ctx = await browser.newContext({ baseURL: FRONTEND_URL })
		const page = await ctx.newPage()
		await login(page, email)
		await markFirstLoginComplete(page)

		const id1 = crypto.randomUUID()
		const id2 = crypto.randomUUID()
		const now = new Date().toISOString()

		const favorites = [id1, id2].map((id, i) => ({
			idb: {
				id,
				name: `Offline Fav ${i}`,
				categorySlug: 'beef',
				cutSlug: 'rinds-entrecote-ribeye-steak-boneless',
				thicknessCm: 2.5,
				doneness: 'medium',
				prepLabel: null,
				label: null,
				cookSeconds: 480,
				restSeconds: 300,
				flipFraction: 0.5,
				idealFlipPattern: 'once' as const,
				heatZone: 'Direkt, Deckel zu',
				grateTempC: null,
				createdAtEpoch: Date.now(),
				lastUsedEpoch: Date.now(),
			},
			wire: {
				id,
				label: `Offline Fav ${i}`,
				cut_id: 'rinds-entrecote-ribeye-steak-boneless',
				thickness_cm: 2.5,
				doneness: 'medium',
				prep_label: null,
				position: i,
				last_used_at: now,
				updated_at: now,
				deleted_at: null,
			},
		}))

		await page.evaluate(async () => {
			await (import('/src/lib/stores/db.ts' as string) as Promise<typeof import('$lib/stores/db')>)
			await (import('/src/lib/sync/queue.ts' as string) as Promise<typeof import('$lib/sync/queue')>)
		})

		await ctx.setOffline(true)
		const idbCount = await page.evaluate(async items => {
			const { putFavorite, listFavorites } = await (import('/src/lib/stores/db.ts' as string) as Promise<typeof import('$lib/stores/db')>)
			const { enqueueSync } = await (import('/src/lib/sync/queue.ts' as string) as Promise<typeof import('$lib/sync/queue')>)
			for (const item of items) {
				await putFavorite(item.idb)
				await enqueueSync({
					method: 'POST',
					path: '/api/favorites',
					body: JSON.stringify(item.wire),
				})
			}
			return (await listFavorites()).length
		}, favorites)
		expect(idbCount).toBe(2)

		await ctx.setOffline(false)
		await page.evaluate(async () => {
			const { flush } = await (import('/src/lib/sync/queue.ts' as string) as Promise<typeof import('$lib/sync/queue')>)
			await flush()
		})

		const serverFavs = (await ctx.request
			.get(`${FRONTEND_URL}/api/favorites?since=1970-01-01T00:00:00Z`)
			.then(r => r.json())) as { rows: Array<{ id: string }> }
		expect(serverFavs.rows.find(r => r.id === id1)).toBeTruthy()
		expect(serverFavs.rows.find(r => r.id === id2)).toBeTruthy()
		await ctx.close()
	})
})
