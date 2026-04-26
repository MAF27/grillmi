import { expect, test } from '@playwright/test'

async function dismissFirstRun(page: import('@playwright/test').Page) {
	const btn = page.getByRole('button', { name: 'Verstanden' })
	try {
		await btn.waitFor({ state: 'visible', timeout: 3000 })
	} catch {
		return
	}
	await btn.click({ force: true })
	await page
		.locator('.notice')
		.waitFor({ state: 'detached', timeout: 5000 })
		.catch(() => {})
}

async function clearIDB(page: import('@playwright/test').Page) {
	await page.evaluate(async () => {
		await new Promise<void>(resolve => {
			const req = indexedDB.deleteDatabase('grillmi')
			req.onsuccess = () => resolve()
			req.onerror = () => resolve()
			req.onblocked = () => resolve()
		})
	})
}

test.describe('saved-plans', () => {
	test('test_save_and_reload_saved_plan', async ({ page }) => {
		await page.route('**/__seed', route =>
			route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>seed</body></html>' }),
		)
		await page.goto('/__seed')
		await clearIDB(page)
		await page.unroute('**/__seed')
		await page.goto('/')
		await dismissFirstRun(page)

		// If a stale session is still around (e.g., from a previous test), end up on /session — bounce home.
		if (page.url().includes('/session')) {
			await page.goto('/')
			await dismissFirstRun(page)
		}

		// Plan an item.
		await page.getByRole('button', { name: /Neue Session/ }).click()
		await expect(page).toHaveURL(/\/plan/)
		await page.getByRole('button', { name: /\+ Gericht/ }).click()
		await page.getByRole('button', { name: 'Rind' }).click()
		await page
			.getByRole('button', { name: /Rinds-Entrecôte/ })
			.first()
			.click()
		await page.getByRole('button', { name: 'Übernehmen' }).click()

		// Save the plan as a Plan-Vorlage.
		await page.getByRole('button', { name: /Plan speichern/ }).click()
		await page.getByPlaceholder(/Mörgeli-Plausch/i).fill('Test-Plausch')
		await page.getByRole('button', { name: 'Speichern', exact: true }).click()

		// Persisted to IDB in the `plans` store.
		const stored = await page.evaluate(async () => {
			const all = await new Promise<unknown[]>(resolve => {
				const open = indexedDB.open('grillmi')
				open.onsuccess = () => {
					const tx = open.result.transaction('plans', 'readonly')
					const req = tx.objectStore('plans').getAll()
					req.onsuccess = () => resolve(req.result as unknown[])
					req.onerror = () => resolve([])
				}
				open.onerror = () => resolve([])
			})
			return all
		})
		expect(stored.length).toBeGreaterThan(0)
		expect((stored[0] as { name: string }).name).toBe('Test-Plausch')
	})
})
