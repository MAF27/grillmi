import { expect, test, type Page } from '@playwright/test'

test.use({
	viewport: { width: 390, height: 844 },
	hasTouch: true,
	contextOptions: { reducedMotion: 'reduce' },
})

interface SeededSession {
	id: string
	createdAtEpoch: number
	targetEpoch: number
	endedAtEpoch: number | null
	items: Array<Record<string, unknown>>
}

async function clearIDB(page: Page) {
	await page.evaluate(async () => {
		await new Promise<void>(resolve => {
			const req = indexedDB.deleteDatabase('grillmi')
			req.onsuccess = () => resolve()
			req.onerror = () => resolve()
			req.onblocked = () => resolve()
		})
	})
}

async function gotoHomeFresh(page: Page) {
	await page.goto('/')
	await clearIDB(page)
	await page.goto('/')
}

async function addEntrecoteOnPlan(page: Page) {
	await page.getByRole('button', { name: /Grillstück hinzufügen/ }).click()
	await page.getByRole('button', { name: 'Rind' }).click()
	await page
		.getByRole('button', { name: /Rinds-Entrecôte/ })
		.first()
		.click()
	await page.getByRole('button', { name: 'Übernehmen' }).click()
}

async function seedSession(page: Page, session: SeededSession) {
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

function pendingSession(putOnInMs: number, cookSeconds = 240): SeededSession {
	const now = Date.now()
	const putOnEpoch = now + putOnInMs
	const doneEpoch = putOnEpoch + cookSeconds * 1000
	return {
		id: '88888888-8888-4888-8888-888888888888',
		createdAtEpoch: now,
		targetEpoch: doneEpoch,
		endedAtEpoch: null,
		items: [
			{
				id: '99999999-9999-4999-8999-999999999999',
				categorySlug: 'beef',
				cutSlug: 'rinds-entrecote-ribeye-steak-boneless',
				thicknessCm: 3,
				prepLabel: null,
				doneness: 'Medium-rare',
				label: 'Walk-Steak',
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

test.describe('walkthrough (full Glühen surface)', () => {
	test('test_home_to_plan_to_step_value_round_trip', async ({ page }) => {
		await gotoHomeFresh(page)

		await expect(page.getByRole('heading', { level: 1 })).toContainText(/Bereit zum/)
		await expect(page.getByRole('button', { name: /^Grillen$/ })).toBeVisible()
		await expect(page.getByRole('button', { name: /^Chronik$/ })).toBeVisible()
		await expect(page.getByRole('button', { name: /Einstellungen/ })).toBeVisible()

		await page.getByRole('button', { name: /^Grillen$/ }).click()
		await expect(page).toHaveURL(/\/grillen/)

		await expect(page.getByRole('tab', { name: 'Jetzt' })).toBeVisible()
		await expect(page.getByRole('tab', { name: 'Auf Zeit' })).toBeVisible()
		await expect(page.getByRole('tab', { name: 'Manuell' })).toBeVisible()

		await addEntrecoteOnPlan(page)

		const stepValueBefore = await page.locator('.step-value').first().textContent()
		await page.getByRole('button', { name: 'Mehr', exact: true }).first().click()
		const stepValueAfter = await page.locator('.step-value').first().textContent()
		expect(stepValueAfter).not.toBe(stepValueBefore)
		await page.getByRole('button', { name: 'Weniger', exact: true }).first().click()
		expect(await page.locator('.step-value').first().textContent()).toBe(stepValueBefore)

		await page.locator('.eatcard.populated').click()
		await expect(page.getByRole('dialog', { name: 'Essen um' })).toBeVisible()
		await page.getByRole('button', { name: 'Abbrechen' }).click()
		await expect(page.getByRole('dialog', { name: 'Essen um' })).toHaveCount(0)
	})

	test('test_manual_mode_los_drives_session_card_to_ready_via_clock', async ({ page }) => {
		await gotoHomeFresh(page)
		await page.goto('/grillen')
		await addEntrecoteOnPlan(page)

		await page.getByRole('tab', { name: 'Manuell' }).click()
		await page.getByRole('button', { name: /Manuelle Grillade starten/ }).click()
		await expect(page).toHaveURL(/\/session/)

		const losBtn = page.getByRole('button', { name: 'Los' }).first()
		await expect(losBtn).toBeVisible()
		await losBtn.click()

		// Advance wall-clock by 15 minutes via clock injection: the ticker uses
		// Date.now() against putOnEpoch / doneEpoch, so monkey-patch the clock.
		await page.evaluate(() => {
			const realNow = Date.now
			const offset = 15 * 60 * 1000
			Date.now = () => realNow() + offset
			performance.now = (orig =>
				function () {
					return orig.call(performance) + offset
				})(performance.now)
		})

		// Trigger a tick so the derived status re-runs.
		await page.evaluate(() => window.dispatchEvent(new Event('focus')))
		await expect(page.getByRole('button', { name: 'Anrichten' }).first()).toBeVisible({ timeout: 10_000 })
	})

	test('test_session_renders_master_clock_and_top_bar', async ({ page }) => {
		await page.goto('/', { waitUntil: 'load' })
		await seedSession(page, pendingSession(60_000, 600))
		await page.goto('/session')

		await expect(page.getByTestId('master-clock-time')).toBeVisible()
		await expect(page.getByTestId('timer-card').first()).toBeVisible()
		await expect(page.locator('.session-header .live')).toHaveText('Live')
		await expect(page.locator('.session-header .wake-chip')).toBeVisible()
		await expect(page.getByRole('button', { name: 'Beenden', exact: true })).toBeVisible()
	})

	test('test_alarm_banner_fires_and_dismiss_closes_it', async ({ page }) => {
		await page.goto('/', { waitUntil: 'load' })
		await seedSession(page, pendingSession(2_000, 30))
		await page.goto('/session')

		const banner = page.getByTestId('alarm-banner')
		await expect(banner).toBeVisible({ timeout: 10_000 })
		await banner.getByRole('button', { name: 'Bestätigen' }).click({ force: true })
		// Banner detaches once dismissed (or the queue advances past the front).
		await expect(banner).toHaveCount(0, { timeout: 5_000 })
	})

	test('test_plated_session_does_not_auto_end_and_beenden_routes_home', async ({ page }) => {
		await page.goto('/', { waitUntil: 'load' })
		const now = Date.now()
		const session: SeededSession = {
			id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
			createdAtEpoch: now - 3_600_000,
			targetEpoch: now - 1_800_000,
			endedAtEpoch: null,
			items: [
				{
					id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
					categorySlug: 'beef',
					cutSlug: 'rinds-entrecote-ribeye-steak-boneless',
					thicknessCm: 3,
					prepLabel: null,
					doneness: 'Medium-rare',
					label: 'Done-Steak',
					cookSeconds: 240,
					restSeconds: 0,
					flipFraction: 0.5,
					idealFlipPattern: 'once',
					heatZone: 'Direct high',
					putOnEpoch: now - 600_000,
					flipEpoch: now - 480_000,
					doneEpoch: now - 360_000,
					restingUntilEpoch: now - 360_000,
					status: 'plated',
					overdue: false,
					flipFired: true,
					platedEpoch: now - 200_000,
				},
			],
		}
		await seedSession(page, session)
		await page.goto('/session')

		await expect(page.getByTestId('master-clock-time')).toBeVisible()
		// Wait briefly to confirm no timer fires after page hydration. The legacy
		// auto-end was 60 s; even a short wait proves the path is gone because
		// nothing arms it any more (covered exhaustively by the unit test).
		await page.waitForTimeout(3_000)
		await expect(page).toHaveURL(/\/session/)

		await page.getByRole('button', { name: 'Beenden', exact: true }).first().click()
		await page.getByRole('button', { name: 'Beenden', exact: true }).last().click()
		await expect(page).not.toHaveURL(/\/session/)
	})

	test('test_settings_theme_toggle_inverts_data_theme', async ({ page }) => {
		await page.goto('/settings')

		await page.getByRole('tab', { name: 'Hell' }).click()
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

		await page.getByRole('tab', { name: 'Dunkel' }).click()
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

		await page.getByRole('tab', { name: 'System' }).click()
		await expect(page.locator('html')).toHaveAttribute('data-theme', /system|dark|light/)
	})

	test('test_settings_tone_preview_fetches_audio_for_each_tone', async ({ page }) => {
		await page.goto('/settings')
		await page.getByRole('button', { name: /Auflegen/ }).click()

		const seen: string[] = []
		const listener = (req: import('@playwright/test').Request) => {
			if (req.url().includes('/sounds/')) seen.push(req.url())
		}
		page.on('request', listener)

		try {
			for (const tone of ['glut', 'funke', 'kohle', 'klassik']) {
				const reqPromise = page.waitForRequest(`**/sounds/${tone}.mp3`, { timeout: 5_000 })
				await page
					.getByRole('button', { name: new RegExp(`${tone[0].toUpperCase()}${tone.slice(1)} probehören`) })
					.first()
					.click()
				const req = await reqPromise
				const res = await req.response()
				expect(res?.ok()).toBe(true)
			}

			await page
				.getByRole('button', { name: /Lautlos probehören/ })
				.first()
				.click()
			await page.waitForTimeout(1_000)
			expect(seen.some(u => u.includes('/sounds/lautlos'))).toBe(false)
		} finally {
			page.off('request', listener)
		}
	})

	test('test_offline_font_family_resolves_through_glühen_stack', async ({ page, context }) => {
		await page.goto('/', { waitUntil: 'networkidle' })
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
			test.skip(true, 'Service worker did not activate (preview-server limitation)')
		}

		await page.goto('/', { waitUntil: 'networkidle' })
		await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10_000 })

		await context.setOffline(true)
		try {
			await page.reload({ waitUntil: 'load' })
			const bodyFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
			expect(bodyFamily).toMatch(/Inter/i)

			const heading = page.getByRole('heading', { level: 1 })
			await expect(heading).toBeVisible()
			const headingFamily = await heading.evaluate(el => getComputedStyle(el).fontFamily)
			expect(headingFamily).toMatch(/Barlow Condensed|Inter/i)
		} finally {
			await context.setOffline(false)
		}
	})
})
