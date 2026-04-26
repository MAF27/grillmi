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

test.describe('migration', () => {
	test('test_v1_database_migrates_to_v2_on_app_open', async ({ browser }) => {
		const context = await browser.newContext()
		const page = await context.newPage()

		// Land on a stubbed same-origin URL that does NOT boot the SvelteKit
		// app — that way no v2 connection is created before we seed v1.
		await page.route('**/__seed', route =>
			route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>seed</body></html>' }),
		)
		await page.goto('/__seed')
		await clearIDB(page)

		// Seed a v1 database with one Favorit-shaped record (a SavedPlan with name + items).
		await page.evaluate(async () => {
			const open = indexedDB.open('grillmi', 1)
			await new Promise<void>((resolve, reject) => {
				open.onupgradeneeded = () => {
					const db = open.result
					if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions')
					if (!db.objectStoreNames.contains('favorites')) db.createObjectStore('favorites')
					if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings')
				}
				open.onsuccess = () => resolve()
				open.onerror = () => reject(open.error)
			})
			const db = open.result
			const tx = db.transaction('favorites', 'readwrite')
			const seeded = {
				id: '99999999-9999-4999-8999-999999999999',
				name: 'Migrierter Plan',
				items: [
					{
						id: '88888888-8888-4888-8888-888888888888',
						categorySlug: 'beef',
						cutSlug: 'rinds-entrecote-ribeye-steak-boneless',
						thicknessCm: 3,
						prepLabel: null,
						doneness: 'Medium-rare',
						label: 'Steak',
						cookSeconds: 360,
						restSeconds: 300,
						flipFraction: 0.5,
						idealFlipPattern: 'once',
						heatZone: 'Direct high',
					},
				],
				createdAtEpoch: 1700000000000,
				lastUsedEpoch: 1700000000000,
			}
			tx.objectStore('favorites').put(seeded, seeded.id)
			await new Promise<void>(resolve => {
				tx.oncomplete = () => resolve()
				tx.onerror = () => resolve()
			})
			db.close()
		})

		await page.unroute('**/__seed')

		// App opens at v2, runs the upgrade, lands on Home.
		await page.goto('/')
		await dismissFirstRun(page)
		if (page.url().includes('/session')) {
			await page.goto('/')
			await dismissFirstRun(page)
		}

		// Menüs page now lists the migrated record.
		await page.getByRole('button', { name: /Menüs/ }).click()
		await expect(page).toHaveURL(/\/menus/)
		await expect(page.getByText('Migrierter Plan')).toBeVisible()
		await context.close()
	})
})
