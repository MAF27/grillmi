import { expect, test } from '@playwright/test'

import { resetBackend } from './_lib/api'
import { activateAccount, FRONTEND_URL, login, uniqueEmail } from './_lib/auth'
import { createGrillade, newAuthedContext } from './_lib/sync'

test.beforeEach(async () => {
	await resetBackend()
})

test.describe('sync alarm fire', () => {
	test.describe.configure({ timeout: 90_000 })

	test('test_alarm_fire_propagates_across_devices_renders_banner_survives_refresh_and_dismiss_round_trips', async ({
		browser,
	}) => {
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

		// Device B opens the cockpit and waits for the pulled grillade to land in IDB.
		await pageB.goto('/grillen')
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

		// Device A patches the alarm fire timestamp via the API (the same call the
		// frontend would make when its ticker fires the flip alarm naturally).
		const firedAtIso = new Date().toISOString()
		const patch = await a.context.request.patch(
			`${FRONTEND_URL}/api/grilladen/${grilladeId}/items/${itemId}`,
			{
				data: { alarm_state: { firedAt: { flip: firedAtIso } } },
				headers: { 'X-CSRFToken': a.csrfToken, 'Content-Type': 'application/json' },
			},
		)
		expect(patch.ok()).toBeTruthy()

		// Trigger Device B's pull via visibility change.
		await pageB.evaluate(() => {
			Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
			document.dispatchEvent(new Event('visibilitychange'))
		})

		// Device B's UI shows the flip alarm card.
		const banner = pageB.locator('[data-testid="alarm-banner"]')
		await expect(banner).toBeVisible({ timeout: 10_000 })
		await expect(banner).toHaveAttribute('data-kind', 'flip')

		// A hard refresh on Device B keeps the card visible.
		await pageB.reload()
		await expect(pageB.locator('[data-testid="alarm-banner"]')).toBeVisible({ timeout: 10_000 })

		// Device B dismisses the alarm. Use direct DOM click because the banner's
		// per-second message rerender keeps the button visually unstable.
		await pageB.evaluate(() => {
			const btn = document.querySelector('[data-testid="alarm-banner"] .dismiss') as HTMLButtonElement | null
			btn?.click()
		})

		// Card disappears on Device B and the dismiss is in IDB.
		await expect(pageB.locator('[data-testid="alarm-banner"]')).toHaveCount(0, { timeout: 5_000 })
		await pageB.waitForFunction(
			async args => {
				const { getGrillade } = await (import('/src/lib/stores/db.ts' as string) as Promise<typeof import('$lib/stores/db')>)
				const row = await getGrillade(args.grilladeId)
				const item = row?.session?.items.find(i => i.id === args.itemId)
				return Boolean(item?.alarmDismissed?.flip)
			},
			{ grilladeId, itemId },
			{ timeout: 10_000 },
		)

		// Force the sync queue to flush so the dismiss reaches the backend.
		await pageB.evaluate(async () => {
			Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
			document.dispatchEvent(new Event('visibilitychange'))
			const sync = await (import('/src/lib/sync/coordinator.ts' as string) as Promise<typeof import('$lib/sync/coordinator')>)
			await sync.flush()
		})

		// Backend reflects the dismiss.
		await expect.poll(
			async () => {
				const r = await a.context.request.get(`${FRONTEND_URL}/api/grilladen/${grilladeId}/items`, {
					headers: { 'X-CSRFToken': a.csrfToken },
				})
				if (!r.ok()) return null
				const body = (await r.json()) as { rows: Array<{ id: string; alarm_state: Record<string, unknown> }> }
				const row = body.rows.find(r => r.id === itemId)
				return row?.alarm_state?.flip ?? null
			},
			{ timeout: 15_000, intervals: [500, 1_000, 2_000] },
		).toBeTruthy()

		await a.context.close()
		await ctxB.close()
	})
})
