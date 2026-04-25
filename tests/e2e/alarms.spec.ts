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
		const tx = db.transaction('sessions', 'readwrite')
		tx.objectStore('sessions').put(s, 'current')
		await new Promise<void>(resolve => {
			tx.oncomplete = () => resolve()
			tx.onerror = () => resolve()
		})
		db.close()
	}, session)
}

/**
 * Build a session whose only item starts cooking ~`putOnInMs` from now and
 * has the given total cook duration. The item begins in `pending` so the
 * ticker emits a `put-on` transition the moment wall-clock crosses the epoch.
 */
function pendingSession(putOnInMs: number, cookSeconds = 240): SeededSession {
	const now = Date.now()
	const putOnEpoch = now + putOnInMs
	const doneEpoch = putOnEpoch + cookSeconds * 1000
	return {
		id: '77777777-7777-4777-8777-777777777777',
		createdAtEpoch: now,
		targetEpoch: doneEpoch,
		endedAtEpoch: null,
		items: [
			{
				id: '66666666-6666-4666-8666-666666666666',
				categorySlug: 'beef',
				cutSlug: 'rinds-entrecote-ribeye-steak-boneless',
				thicknessCm: 3,
				prepLabel: null,
				doneness: 'Medium-rare',
				label: 'Alarm-Steak',
				cookSeconds,
				restSeconds: 0,
				flipFraction: 0.5,
				idealFlipPattern: 'once',
				heatZone: 'Direct high',
				putOnEpoch,
				flipEpoch: putOnEpoch + (cookSeconds * 1000) / 2,
				doneEpoch,
				restingUntilEpoch: doneEpoch,
				status: 'pending',
				overdue: false,
				flipFired: false,
				platedEpoch: null,
			},
		],
	}
}

test.describe('alarms', () => {
	test('test_put_on_alarm_fires_at_scheduled_time', async ({ page }) => {
		await page.goto('/', { waitUntil: 'load' })
		await dismissFirstRun(page)

		// Seed a session that puts on in 2 seconds.
		await seedSession(page, pendingSession(2_000))
		await page.goto('/session', { waitUntil: 'load' })

		// AlarmBanner uses role="alert"; expect it to appear once the ticker crosses the put-on epoch.
		await expect(page.getByTestId('alarm-banner')).toBeVisible({ timeout: 10_000 })
		await expect(page.getByTestId('alarm-banner')).toContainText('Alarm-Steak')
	})

	test('test_flip_alarm_does_not_pause_main_timer', async ({ page }) => {
		await page.goto('/', { waitUntil: 'load' })
		await dismissFirstRun(page)

		// Seed a session that's already cooking and 1s before its flip event.
		const now = Date.now()
		const cookSeconds = 60
		const putOnEpoch = now - 29_000
		const doneEpoch = putOnEpoch + cookSeconds * 1000
		const session: SeededSession = {
			id: '55555555-5555-4555-8555-555555555555',
			createdAtEpoch: now - 30_000,
			targetEpoch: doneEpoch,
			endedAtEpoch: null,
			items: [
				{
					id: '44444444-4444-4444-8444-444444444444',
					categorySlug: 'beef',
					cutSlug: 'rinds-entrecote-ribeye-steak-boneless',
					thicknessCm: 3,
					prepLabel: null,
					doneness: 'Medium-rare',
					label: 'Flip-Steak',
					cookSeconds,
					restSeconds: 0,
					flipFraction: 0.5,
					idealFlipPattern: 'once',
					heatZone: 'Direct high',
					putOnEpoch,
					flipEpoch: putOnEpoch + 30_000,
					doneEpoch,
					restingUntilEpoch: doneEpoch,
					status: 'cooking',
					overdue: false,
					flipFired: false,
					platedEpoch: null,
				},
			],
		}
		await seedSession(page, session)
		await page.goto('/session', { waitUntil: 'load' })

		// Flip banner should fire shortly.
		await expect(page.getByTestId('alarm-banner')).toBeVisible({ timeout: 10_000 })

		// The TimerCard's main countdown must keep ticking while the banner is up.
		const card = page.locator('[data-testid="timer-card"]').first()
		const before = (await card.textContent()) ?? ''
		await page.waitForTimeout(1500)
		const after = (await card.textContent()) ?? ''
		expect(after).not.toBe(before)
	})
})
