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

test.describe('favorites', () => {
	test('test_save_favorite_from_sheet', async ({ page }) => {
		await page.route('**/__seed', route =>
			route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>seed</body></html>' }),
		)
		await page.goto('/__seed')
		await clearIDB(page)
		await page.unroute('**/__seed')
		await page.goto('/')
		await dismissFirstRun(page)
		if (page.url().includes('/session')) {
			await page.goto('/')
			await dismissFirstRun(page)
		}

		await page.getByRole('button', { name: /Neue Session/ }).click()
		await expect(page).toHaveURL(/\/grillen/)
		await page.getByRole('button', { name: /Grillstück hinzufügen/ }).click()
		await page.getByRole('button', { name: 'Rind' }).click()
		await page
			.getByRole('button', { name: /Rinds-Entrecôte/ })
			.first()
			.click()

		// Inline "Als Favorit speichern" on the specs step.
		await page.getByRole('button', { name: 'Als Favorit speichern' }).click()
		const nameInput = page.getByLabel('Favorit-Name')
		await nameInput.fill('Lieblings-Steak')
		await nameInput.press('Enter')

		// Persisted to IDB in the `favorites` store.
		const stored = await page.evaluate(async () => {
			return await new Promise<unknown[]>(resolve => {
				const open = indexedDB.open('grillmi')
				open.onsuccess = () => {
					const tx = open.result.transaction('favorites', 'readonly')
					const req = tx.objectStore('favorites').getAll()
					req.onsuccess = () => resolve(req.result as unknown[])
					req.onerror = () => resolve([])
				}
				open.onerror = () => resolve([])
			})
		})
		expect(stored.length).toBe(1)
		expect((stored[0] as { name: string }).name).toBe('Lieblings-Steak')

		// Sheet stays open — close it, then reopen the sheet, switch to Favoriten tab, see the entry.
		await page.getByRole('button', { name: 'Schliessen' }).click()
		await page.getByRole('button', { name: /Grillstück hinzufügen/ }).click()
		await page.getByRole('tab', { name: 'Favoriten' }).click()
		await expect(page.getByText('Lieblings-Steak')).toBeVisible()
	})

	test('test_load_favorite_into_plan', async ({ page }) => {
		// Stub a same-origin URL that doesn't boot the app, so we can seed IDB
		// at v2 before the layout's init opens its own connection.
		await page.route('**/__seed', route =>
			route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>seed</body></html>' }),
		)
		await page.goto('/__seed')
		await clearIDB(page)

		// Seed one Favorit directly in IDB.
		await page.evaluate(async () => {
			const open = indexedDB.open('grillmi', 2)
			await new Promise<void>((resolve, reject) => {
				open.onupgradeneeded = () => {
					const db = open.result
					if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions')
					if (!db.objectStoreNames.contains('favorites')) db.createObjectStore('favorites')
					if (!db.objectStoreNames.contains('plans')) db.createObjectStore('plans')
					if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings')
				}
				open.onsuccess = () => resolve()
				open.onerror = () => reject(open.error)
			})
			const db = open.result
			const tx = db.transaction('favorites', 'readwrite')
			const fav = {
				id: '11111111-1111-4111-8111-111111111111',
				name: 'Geseedeter Favorit',
				categorySlug: 'beef',
				cutSlug: 'rinds-entrecote-ribeye-steak-boneless',
				thicknessCm: 3,
				prepLabel: null,
				doneness: 'Medium-rare',
				label: 'Rinds-Entrecôte 3 cm, Medium-rare',
				cookSeconds: 360,
				restSeconds: 300,
				flipFraction: 0.5,
				idealFlipPattern: 'once',
				heatZone: 'Direct high',
				createdAtEpoch: Date.now(),
				lastUsedEpoch: Date.now(),
			}
			tx.objectStore('favorites').put(fav, fav.id)
			await new Promise<void>(resolve => {
				tx.oncomplete = () => resolve()
				tx.onerror = () => resolve()
			})
			db.close()
		})
		await page.unroute('**/__seed')

		await page.goto('/')
		await dismissFirstRun(page)
		if (page.url().includes('/session')) {
			await page.goto('/')
			await dismissFirstRun(page)
		}

		await page.getByRole('button', { name: /Neue Session/ }).click()
		await expect(page).toHaveURL(/\/grillen/)
		await page.getByRole('button', { name: /Grillstück hinzufügen/ }).click()
		await page.getByRole('tab', { name: 'Favoriten' }).click()
		await page.getByText('Geseedeter Favorit').click()

		// Sheet closed, plan now contains the configured item.
		await expect(page.getByText(/Rinds-Entrecôte/)).toBeVisible()
	})
})
