import { expect, test } from '@playwright/test'

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

test.describe('menus', () => {
	test('test_save_and_reload_menu', async ({ page }) => {
		await page.route('**/__seed', route =>
			route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>seed</body></html>' }),
		)
		await page.goto('/__seed')
		await clearIDB(page)
		await page.unroute('**/__seed')
		await page.goto('/')

		// Bounce home if a stale session lands us on /session.
		if (page.url().includes('/session')) {
			await page.goto('/')
		}

		// Plan an item.
		await page.getByRole('button', { name: /Neue Session/ }).click()
		await expect(page).toHaveURL(/\/plan/)
		await page.getByRole('button', { name: /Grillstück hinzufügen/ }).click()
		await page.getByRole('button', { name: 'Rind' }).click()
		await page
			.getByRole('button', { name: /Rinds-Entrecôte/ })
			.first()
			.click()
		await page.getByRole('button', { name: 'Übernehmen' }).click()

		// Save the plan as a Menü.
		await page.getByRole('button', { name: /Als Menü speichern/ }).click()
		await page.getByPlaceholder(/Sonntagsmenü/i).fill('Test-Menü')
		await page.getByRole('button', { name: 'Speichern', exact: true }).click()

		// Persisted to IDB in the `plans` store (legacy schema name).
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
		expect((stored[0] as { name: string }).name).toBe('Test-Menü')
	})
})
