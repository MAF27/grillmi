import { expect, test } from '@playwright/test'

import { resetBackend } from './_lib/api'
import { activateAccount, FRONTEND_URL, login, uniqueEmail } from './_lib/auth'
import { createGrillade, newAuthedContext } from './_lib/sync'

test.beforeEach(async () => {
	await resetBackend()
})

test.describe('sync alarm fire', () => {
	test('test_alarm_fire_propagates_across_devices_and_survives_refresh', async ({ browser }) => {
		const email = uniqueEmail('alarm-fire-sync')
		const setupCtx = await browser.newContext({ baseURL: FRONTEND_URL })
		const setupPage = await setupCtx.newPage()
		await activateAccount(setupPage, email)
		await setupCtx.close()

		const a = await newAuthedContext(browser, email)
		const ctxB = await browser.newContext({ baseURL: FRONTEND_URL })
		const pageB = await ctxB.newPage()
		await login(pageB, email)

		const grilladeId = crypto.randomUUID()
		const itemId = crypto.randomUUID()
		const startedAt = new Date(Date.now() - 60_000).toISOString()

		await createGrillade(a, {
			id: grilladeId,
			name: 'Alarm Fire Sync',
			status: 'running',
			target_finish_at: new Date(Date.now() + 3_600_000).toISOString(),
			started_at: startedAt,
			ended_at: null,
			position: 1,
			updated_at: new Date().toISOString(),
			deleted_at: null,
		})
		const itemResp = await a.context.request.post(
			`${FRONTEND_URL}/api/grilladen/${grilladeId}/items`,
			{
				data: {
					id: itemId,
					label: 'Ribeye',
					cut_id: 'rinds-entrecote',
					cook_seconds_min: 600,
					cook_seconds_max: 600,
					flip_fraction: '0.5',
					rest_seconds: 120,
					status: 'cooking',
					started_at: startedAt,
				},
				headers: { 'X-CSRFToken': a.csrfToken, 'Content-Type': 'application/json' },
			},
		)
		expect(itemResp.ok()).toBeTruthy()

		await pageB.waitForFunction(
			async expectedId => {
				const { listGrilladen } = await (import('/src/lib/stores/db.ts' as string) as Promise<typeof import('$lib/stores/db')>)
				const rows = await listGrilladen()
				const row = rows.find((r: { id: string }) => r.id === expectedId)
				return Boolean(row?.session?.items?.length)
			},
			grilladeId,
			{ timeout: 10_000 },
		)

		const firedAtIso = new Date().toISOString()
		const patch = await a.context.request.patch(
			`${FRONTEND_URL}/api/grilladen/${grilladeId}/items/${itemId}`,
			{
				data: { alarm_state: { firedAt: { flip: firedAtIso } } },
				headers: { 'X-CSRFToken': a.csrfToken, 'Content-Type': 'application/json' },
			},
		)
		expect(patch.ok()).toBeTruthy()

		await pageB.evaluate(() => {
			Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
			document.dispatchEvent(new Event('visibilitychange'))
		})

		await pageB.waitForFunction(
			async args => {
				const { getGrillade } = await (import('/src/lib/stores/db.ts' as string) as Promise<typeof import('$lib/stores/db')>)
				const row = await getGrillade(args.grilladeId)
				const item = row?.session?.items.find(i => i.id === args.itemId)
				return Boolean(item?.alarmFired?.flip)
			},
			{ grilladeId, itemId },
			{ timeout: 10_000 },
		)

		await pageB.reload()
		await pageB.waitForFunction(
			async args => {
				const { getGrillade } = await (import('/src/lib/stores/db.ts' as string) as Promise<typeof import('$lib/stores/db')>)
				const row = await getGrillade(args.grilladeId)
				const item = row?.session?.items.find(i => i.id === args.itemId)
				return Boolean(item?.alarmFired?.flip)
			},
			{ grilladeId, itemId },
			{ timeout: 10_000 },
		)

		await a.context.close()
		await ctxB.close()
	})
})
