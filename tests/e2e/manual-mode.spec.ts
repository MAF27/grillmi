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

test.describe('manual-mode', () => {
	test('test_manual_mode_renders_inline_on_plan', async ({ page }) => {
		await page.goto('/')
		await clearIDB(page)
		await page.goto('/grillen')

		await page.getByRole('button', { name: /Grillstück hinzufügen/ }).click()
		await page.getByRole('button', { name: 'Rind' }).click()
		await page
			.getByRole('button', { name: /Rinds-Entrecôte/ })
			.first()
			.click()
		await page.getByRole('button', { name: 'Übernehmen' }).click()

		await page.getByRole('tab', { name: 'Manuell' }).click()

		await page.getByRole('button', { name: /Manuelle Grillade starten/ }).click()
		await expect(page.getByRole('button', { name: 'Los' }).first()).toBeVisible()
	})

	test('test_manual_mode_redirects_session_to_plan', async ({ page }) => {
		await page.goto('/')
		await clearIDB(page)
		await page.goto('/grillen')

		await page.getByRole('button', { name: /Grillstück hinzufügen/ }).click()
		await page.getByRole('button', { name: 'Rind' }).click()
		await page
			.getByRole('button', { name: /Rinds-Entrecôte/ })
			.first()
			.click()
		await page.getByRole('button', { name: 'Übernehmen' }).click()

		await page.getByRole('tab', { name: 'Manuell' }).click()
		await page.goto('/session')
		await expect(page).toHaveURL(/\/grillen/)
	})
})
