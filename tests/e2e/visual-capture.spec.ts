/**
 * Phase 9 step 4: agent-browser visual diff capture.
 *
 * Drives Chromium against (a) the Glühen prototype HTML on :8000 and (b) the
 * dev/preview server on :4173, captures screenshots of each canonical state
 * to .tmp/visual-diff/{prototype,app}/, and produces inputs for the drift
 * reconciliation pass.
 *
 * Skipped by default; run with `VISUAL_CAPTURE=1 pnpm exec playwright test
 * tests/e2e/visual-capture.spec.ts`.
 *
 * Requires `python3 -m http.server 8000` in the prototype dir prior to invoke.
 */

import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const HERE = resolve(__filename, '..')
const VIEWPORT = { width: 390, height: 844 }
const ROOT = resolve(HERE, '../../.tmp/visual-diff')
const PROTO_BASE = 'http://localhost:8000/Grillmi%20Redesign.html'
const APP_BASE = 'http://localhost:4173'

test.use({
	viewport: VIEWPORT,
	hasTouch: true,
	reducedMotion: 'reduce',
	colorScheme: 'dark',
})

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
	if (!process.env.VISUAL_CAPTURE) test.skip()
	if (!existsSync(`${ROOT}/prototype`)) mkdirSync(`${ROOT}/prototype`, { recursive: true })
	if (!existsSync(`${ROOT}/app`)) mkdirSync(`${ROOT}/app`, { recursive: true })
})

async function captureProto(page: Page, screen: 'home' | 'plan' | 'session' | 'favorites' | 'settings', filename: string) {
	// Patch the inline TWEAKS literal so the prototype renders the picked
	// startScreen on first paint without needing to drive the segmented
	// TweakRadio (which is a pointer-drag track, not a native radio).
	await page.route('**/Grillmi%20Redesign.html', async route => {
		const proto = await page.context().request.fetch(PROTO_BASE)
		const html = await proto.text()
		const patched = html.replace(/"startScreen":\s*"\w+"/, `"startScreen": "${screen}"`)
		await route.fulfill({ contentType: 'text/html', body: patched })
	})
	await page.setViewportSize({ width: 1280, height: 1100 })
	await page.goto(PROTO_BASE, { waitUntil: 'networkidle' })
	// Babel-standalone needs a moment after networkidle to compile + mount.
	await page.waitForTimeout(1500)
	await page.unroute('**/Grillmi%20Redesign.html')

	// The DirectionA artboard is the immediate child of the IPhoneShell that
	// owns the rendered phone-frame. Grab whatever wraps the shell content.
	const shell = page.locator('[style*="border-radius: 14"]').first()
	if (await shell.isVisible().catch(() => false)) {
		await shell.screenshot({ path: `${ROOT}/prototype/${filename}.png` })
	} else {
		await page.screenshot({ path: `${ROOT}/prototype/${filename}.png`, fullPage: false })
	}
}

async function captureFullPage(page: Page, path: string, filename: string) {
	await page.goto(`${APP_BASE}${path}`, { waitUntil: 'load' })
	await page.waitForTimeout(300)
	await page.screenshot({ path: `${ROOT}/app/${filename}.png`, fullPage: false })
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

async function addEntrecoteOnPlan(page: Page) {
	await page.getByRole('button', { name: /Grillstück hinzufügen/ }).click()
	await page.getByRole('button', { name: 'Rind' }).click()
	await page
		.getByRole('button', { name: /Rinds-Entrecôte/ })
		.first()
		.click()
	await page.getByRole('button', { name: 'Übernehmen' }).click()
}

test.describe('visual capture (prototype + app)', () => {
	test('proto_home', async ({ page }) => {
		await captureProto(page, 'home', 'home')
	})
	test('proto_plan', async ({ page }) => {
		await captureProto(page, 'plan', 'plan')
	})
	test('proto_session', async ({ page }) => {
		await captureProto(page, 'session', 'session')
	})
	test('proto_favorites', async ({ page }) => {
		await captureProto(page, 'favorites', 'menus')
	})
	test('proto_settings', async ({ page }) => {
		await captureProto(page, 'settings', 'settings')
	})

	test('app_home_empty', async ({ page }) => {
		await page.goto(APP_BASE)
		await clearIDB(page)
		await captureFullPage(page, '/', 'home-empty')
	})

	test('app_home_with_menu', async ({ page }) => {
		await page.goto(APP_BASE)
		await clearIDB(page)
		await page.goto(`${APP_BASE}/plan`)
		await addEntrecoteOnPlan(page)
		await page.getByRole('button', { name: /Als Menü speichern/ }).click()
		await page.getByPlaceholder(/Sonntagsmenü/i).fill('Capture-Menü')
		await page.getByRole('button', { name: 'Speichern', exact: true }).click()
		await expect(page.getByRole('button', { name: 'Speichern', exact: true })).toHaveCount(0)
		await captureFullPage(page, '/', 'home-with-menu')
	})

	test('app_plan_empty', async ({ page }) => {
		await page.goto(APP_BASE)
		await clearIDB(page)
		await captureFullPage(page, '/plan', 'plan-empty')
	})

	test('app_plan_filled', async ({ page }) => {
		await page.goto(APP_BASE)
		await clearIDB(page)
		await page.goto(`${APP_BASE}/plan`)
		await addEntrecoteOnPlan(page)
		await page.waitForTimeout(300)
		await page.screenshot({ path: `${ROOT}/app/plan-filled.png`, fullPage: false })
	})

	test('app_plan_manual', async ({ page }) => {
		await page.goto(APP_BASE)
		await clearIDB(page)
		await page.goto(`${APP_BASE}/plan`)
		await addEntrecoteOnPlan(page)
		await page.getByRole('tab', { name: 'Manuell' }).click()
		await page.waitForTimeout(300)
		await page.screenshot({ path: `${ROOT}/app/plan-manual.png`, fullPage: false })
	})

	test('app_addsheet_category', async ({ page }) => {
		await page.goto(APP_BASE)
		await clearIDB(page)
		await page.goto(`${APP_BASE}/plan`)
		await page.getByRole('button', { name: /Grillstück hinzufügen/ }).click()
		await page.waitForTimeout(300)
		await page.screenshot({ path: `${ROOT}/app/addsheet-category.png`, fullPage: false })
	})

	test('app_addsheet_cut', async ({ page }) => {
		await page.goto(APP_BASE)
		await clearIDB(page)
		await page.goto(`${APP_BASE}/plan`)
		await page.getByRole('button', { name: /Grillstück hinzufügen/ }).click()
		await page.getByRole('button', { name: 'Rind' }).click()
		await page.waitForTimeout(300)
		await page.screenshot({ path: `${ROOT}/app/addsheet-cut.png`, fullPage: false })
	})

	test('app_addsheet_specs', async ({ page }) => {
		await page.goto(APP_BASE)
		await clearIDB(page)
		await page.goto(`${APP_BASE}/plan`)
		await page.getByRole('button', { name: /Grillstück hinzufügen/ }).click()
		await page.getByRole('button', { name: 'Rind' }).click()
		await page
			.getByRole('button', { name: /Rinds-Entrecôte/ })
			.first()
			.click()
		await page.waitForTimeout(300)
		await page.screenshot({ path: `${ROOT}/app/addsheet-specs.png`, fullPage: false })
	})

	test('app_session_with_alarm', async ({ page }) => {
		await page.goto(APP_BASE)
		const now = Date.now()
		const session = {
			id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
			createdAtEpoch: now,
			targetEpoch: now + 600_000,
			endedAtEpoch: null,
			items: [
				{
					id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
					categorySlug: 'beef',
					cutSlug: 'rinds-entrecote-ribeye-steak-boneless',
					thicknessCm: 3,
					prepLabel: null,
					doneness: 'Medium-rare',
					label: 'Capture-Steak',
					cookSeconds: 300,
					restSeconds: 0,
					flipFraction: 0.5,
					idealFlipPattern: 'once',
					heatZone: 'Direct high',
					putOnEpoch: now + 1_000,
					flipEpoch: now + 1_000 + 150_000,
					doneEpoch: now + 1_000 + 300_000,
					restingUntilEpoch: now + 1_000 + 300_000,
					status: 'pending',
					overdue: false,
					flipFired: false,
					platedEpoch: null,
				},
			],
		}
		await page.evaluate(async s => {
			const open = indexedDB.open('grillmi', 2)
			await new Promise<void>(resolve => {
				open.onupgradeneeded = () => {
					const db = open.result
					if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions')
					if (!db.objectStoreNames.contains('favorites')) db.createObjectStore('favorites')
					if (!db.objectStoreNames.contains('plans')) db.createObjectStore('plans')
					if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings')
				}
				open.onsuccess = () => resolve()
				open.onerror = () => resolve()
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
		await page.goto(`${APP_BASE}/session`)
		// Wait long enough for the put-on epoch to fire and the banner to render.
		await page.waitForTimeout(3_500)
		await page.screenshot({ path: `${ROOT}/app/session-mid-cook-alarm.png`, fullPage: false })
	})

	test('app_menus', async ({ page }) => {
		await page.goto(APP_BASE)
		await clearIDB(page)
		await page.goto(`${APP_BASE}/plan`)
		await addEntrecoteOnPlan(page)
		await page.getByRole('button', { name: /Als Menü speichern/ }).click()
		await page.getByPlaceholder(/Sonntagsmenü/i).fill('Capture-Menü')
		await page.getByRole('button', { name: 'Speichern', exact: true }).click()
		await expect(page.getByRole('button', { name: 'Speichern', exact: true })).toHaveCount(0)
		await captureFullPage(page, '/menus', 'menus')
	})

	test('app_settings_expanded', async ({ page }) => {
		await page.goto(`${APP_BASE}/settings`)
		await page.getByRole('button', { name: /Auflegen/ }).click()
		await page.waitForTimeout(300)
		await page.screenshot({ path: `${ROOT}/app/settings-expanded.png`, fullPage: false })
	})
})
