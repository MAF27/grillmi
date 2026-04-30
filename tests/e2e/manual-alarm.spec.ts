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
	test('test_manual_los_fires_auflegen_banner_and_activity_log', async ({ page }) => {
		await page.goto('/')
		await clearIDB(page)
		await page.goto('/plan')

		// Plan one item.
		await page.getByRole('button', { name: /Grillstück hinzufügen/ }).click()
		await page.getByRole('button', { name: 'Rind' }).click()
		await page.getByRole('button', { name: /Rinds-Entrec/ }).first().click()
		await page.getByRole('button', { name: 'Übernehmen' }).click()

		// Switch to manual and start.
		await page.getByRole('tab', { name: 'Manuell' }).click()
		await page.getByRole('button', { name: /Manuelle Grillade starten/ }).click()

		// On the cockpit, click Los on the first card.
		await page.getByRole('button', { name: 'Los', exact: true }).first().click()

		// Auflegen banner appears within a couple of ticks.
		await expect(page.getByTestId('alarm-banner')).toBeVisible({ timeout: 5_000 })
		await expect(page.getByTestId('alarm-banner')).toHaveAttribute('data-kind', 'on')

		// Activity log records the Auflegen event (desktop-only). On mobile this
		// step is skipped because the right pane does not render.
		const log = page.locator('[data-testid="activity-log"]')
		if (await log.count()) {
			await expect(log).toContainText(/Auflegen|auflegen/i)
		}
	})
})
