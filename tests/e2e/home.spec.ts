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

async function seedMenu(page: import('@playwright/test').Page, name: string) {
	await page.goto('/plan')
	await page.getByRole('button', { name: /Grillstück hinzufügen/ }).click()
	await page.getByRole('button', { name: 'Rind' }).click()
	await page
		.getByRole('button', { name: /Rinds-Entrecôte/ })
		.first()
		.click()
	await page.getByRole('button', { name: 'Übernehmen' }).click()
	await page.getByRole('button', { name: /Als Menü speichern/ }).click()
	await page.getByPlaceholder(/Sonntagsmenü/i).fill(name)
	await page.getByRole('button', { name: 'Speichern', exact: true }).click()
}

test.describe('home', () => {
	test('test_recent_menus_strip_hidden_on_empty', async ({ page }) => {
		await page.goto('/')
		await clearIDB(page)
		await page.goto('/')
		await expect(page.getByText('Zuletzt gespeicherte Menüs')).toHaveCount(0)
	})

	test('test_recent_menus_strip_renders_when_menus_exist', async ({ page }) => {
		await page.goto('/')
		await clearIDB(page)
		await page.goto('/')
		await seedMenu(page, 'Sonntagsmenü')
		await page.goto('/')
		await expect(page.getByText('Zuletzt gespeicherte Menüs')).toBeVisible()
		await expect(page.getByText('Sonntagsmenü')).toBeVisible()
	})

	test('test_home_renders_brand_and_hero', async ({ page }) => {
		await page.goto('/')
		await expect(page.getByRole('heading', { level: 1 })).toContainText(/Bereit zum/)
		await expect(page.getByRole('button', { name: /Neue Session/ })).toBeVisible()
		await expect(page.getByRole('button', { name: /^Menüs$/ })).toBeVisible()
		await expect(page.getByRole('button', { name: /Einstellungen/ })).toBeVisible()
	})
})
