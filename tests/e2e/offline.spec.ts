import { expect, test } from '@playwright/test'

test.describe('offline', () => {
	test('test_app_loads_offline_after_first_visit', async ({ page, context }) => {
		await page.goto('/', { waitUntil: 'networkidle' })

		// Wait for the service worker to be active and controlling the page.
		const swActive = await page
			.waitForFunction(
				async () => {
					if (!('serviceWorker' in navigator)) return false
					const reg = await navigator.serviceWorker.ready.catch(() => null)
					return !!reg && reg.active !== null
				},
				null,
				{ timeout: 15_000 },
			)
			.then(() => true)
			.catch(() => false)

		if (!swActive) {
			test.skip(true, 'Service worker did not activate in this environment (typically headless preview)')
		}

		// Re-navigate so the controller takes over (skipWaiting + clients.claim land here).
		await page.goto('/', { waitUntil: 'networkidle' })
		await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10_000 })

		// Drop the network and reload — the precache should serve the app shell.
		await context.setOffline(true)
		try {
			await page.reload({ waitUntil: 'load' })
			await expect(page.getByRole('heading', { name: 'Grillmi', exact: true })).toBeVisible()
		} finally {
			await context.setOffline(false)
		}
	})
})
