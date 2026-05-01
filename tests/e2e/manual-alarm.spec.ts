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

test.describe('manual-alarm', () => {
	test('test_manual_los_does_not_fire_auflegen_banner_or_audio', async ({ page }) => {
		await page.addInitScript(() => {
			;(window as unknown as { __audioStarts: number }).__audioStarts = 0
			class FakeAudioContext {
				state = 'running'
				destination = {}
				async decodeAudioData() {
					return {}
				}
				async resume() {}
				createBufferSource() {
					return {
						buffer: null,
						connect() {},
						start() {
							;(window as unknown as { __audioStarts: number }).__audioStarts += 1
						},
					}
				}
			}
			;(window as unknown as { AudioContext: typeof FakeAudioContext }).AudioContext = FakeAudioContext
		})
		await page.goto('/')
		await clearIDB(page)
		await page.goto('/grillen')

		// Plan one item.
		await page.getByRole('button', { name: /Grillstück hinzufügen/ }).click()
		await page.getByRole('button', { name: 'Rind' }).click()
		await page
			.getByRole('button', { name: /Rinds-Entrec/ })
			.first()
			.click()
		await page.getByRole('button', { name: 'Übernehmen' }).click()

		// Switch to manual and start.
		await page.getByRole('tab', { name: 'Manuell' }).click()
		await page.getByRole('button', { name: /Manuelle Grillade starten/ }).click()

		// On the cockpit, click Los on the first card.
		await page.getByRole('button', { name: 'Los', exact: true }).first().click()

		// Manual Los is an explicit user action; the running ring is the only
		// confirmation. No Auflegen banner and no tone request should happen.
		await expect(page.getByTestId('alarm-banner')).toHaveCount(0)
		await expect.poll(() => page.evaluate(() => (window as unknown as { __audioStarts: number }).__audioStarts)).toBe(0)

		// Activity log is desktop-only. It must not record an Auflegen event for
		// the manual Los click.
		const log = page.locator('[data-testid="activity-log"]')
		if (await log.count()) {
			await expect(log).not.toContainText(/Auflegen|auflegen/i)
		}
	})
})
