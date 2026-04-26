import { expect, test } from '@playwright/test'

interface SeededSession {
	id: string
	createdAtEpoch: number
	targetEpoch: number
	endedAtEpoch: number | null
	items: Array<Record<string, unknown>>
}

async function dismissFirstRun(page: import('@playwright/test').Page) {
	const btn = page.getByRole('button', { name: 'Verstanden' })
	if (await btn.isVisible().catch(() => false)) {
		await btn.click({ force: true })
		await page
			.locator('dialog.notice')
			.waitFor({ state: 'detached', timeout: 5000 })
			.catch(() => {})
	}
}

async function seedSession(page: import('@playwright/test').Page, session: SeededSession) {
	await page.evaluate(async s => {
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
		const tx = db.transaction('sessions', 'readwrite')
		tx.objectStore('sessions').put(s, 'current')
		await new Promise<void>(resolve => {
			tx.oncomplete = () => resolve()
			tx.onerror = () => resolve()
		})
		db.close()
	}, session)
}

function makeSession(targetOffsetMs: number, statusOverride?: string): SeededSession {
	const now = Date.now()
	const target = now + targetOffsetMs
	const cookSeconds = 360
	const restSeconds = 300
	const putOnEpoch = target - (cookSeconds + restSeconds) * 1000
	const doneEpoch = target - restSeconds * 1000
	const restingUntilEpoch = target
	const status = statusOverride ?? (now < putOnEpoch ? 'pending' : now < doneEpoch ? 'cooking' : 'ready')
	return {
		id: '99999999-9999-4999-8999-999999999999',
		createdAtEpoch: now,
		targetEpoch: target,
		endedAtEpoch: null,
		items: [
			{
				id: '88888888-8888-4888-8888-888888888888',
				categorySlug: 'beef',
				cutSlug: 'rinds-entrecote-ribeye-steak-boneless',
				thicknessCm: 3,
				prepLabel: null,
				doneness: 'Medium-rare',
				label: 'Test-Steak',
				cookSeconds,
				restSeconds,
				flipFraction: 0.5,
				idealFlipPattern: 'once',
				heatZone: 'Direct high',
				putOnEpoch,
				flipEpoch: putOnEpoch + (cookSeconds * 1000) / 2,
				doneEpoch,
				restingUntilEpoch,
				status,
				overdue: false,
				flipFired: false,
				platedEpoch: null,
			},
		],
	}
}

test.describe('resume', () => {
	test('test_active_session_resumes_on_reload', async ({ page }) => {
		await page.goto('/', { waitUntil: 'load' })
		await dismissFirstRun(page)
		await seedSession(page, makeSession(30 * 60 * 1000))
		await page.goto('/', { waitUntil: 'load' })
		await expect(page).toHaveURL(/\/session/)
		await expect(page.getByText('Test-Steak').first()).toBeVisible()
	})

	test('test_stale_session_auto_ends', async ({ page }) => {
		await page.goto('/', { waitUntil: 'load' })
		await dismissFirstRun(page)
		// Target 5 hours in the past — older than the 4 h staleness threshold.
		await seedSession(page, makeSession(-5 * 60 * 60 * 1000))
		await page.goto('/', { waitUntil: 'load' })
		await expect(page).toHaveURL(/\/$|^[^/]*\/?$/)
		await expect(page.getByRole('heading', { level: 1 })).toContainText(/Bereit zum/)

		// IDB should now be empty for the current session.
		const remaining = await page.evaluate(async () => {
			return await new Promise<unknown>(resolve => {
				const open = indexedDB.open('grillmi')
				open.onsuccess = () => {
					const tx = open.result.transaction('sessions', 'readonly')
					const req = tx.objectStore('sessions').get('current')
					req.onsuccess = () => resolve(req.result ?? null)
					req.onerror = () => resolve(null)
				}
				open.onerror = () => resolve(null)
			})
		})
		expect(remaining).toBeNull()
	})
})
