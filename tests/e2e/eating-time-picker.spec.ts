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

test.describe('eating-time picker', () => {
	test('test_picker_opens_on_card_tap', async ({ page }) => {
		await page.goto('/')
		await clearIDB(page)
		await page.goto('/plan')

		// Add an item so the eating-time card becomes populated and tappable.
		await page.getByRole('button', { name: /Grillstück hinzufügen/ }).click()
		await page.getByRole('button', { name: 'Rind' }).click()
		await page
			.getByRole('button', { name: /Rinds-Entrecôte/ })
			.first()
			.click()
		await page.getByRole('button', { name: 'Übernehmen' }).click()

		await page.locator('.eatcard.populated').click()
		await expect(page.getByRole('dialog', { name: 'Essen um' })).toBeVisible()
		await expect(page.getByRole('button', { name: 'Übernehmen' })).toBeVisible()
		await expect(page.getByRole('button', { name: 'Abbrechen' })).toBeVisible()
	})

	test('test_picker_cancel_closes_without_change', async ({ page }) => {
		await page.goto('/')
		await clearIDB(page)
		await page.goto('/plan')

		await page.getByRole('button', { name: /Grillstück hinzufügen/ }).click()
		await page.getByRole('button', { name: 'Rind' }).click()
		await page
			.getByRole('button', { name: /Rinds-Entrecôte/ })
			.first()
			.click()
		await page.getByRole('button', { name: 'Übernehmen' }).click()

		await page.locator('.eatcard.populated').click()
		await page.getByRole('button', { name: 'Abbrechen' }).click()
		await expect(page.getByRole('dialog', { name: 'Essen um' })).toHaveCount(0)
	})
})
