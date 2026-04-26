import { expect, test } from '@playwright/test'

test.describe('tones (settings)', () => {
	test('test_settings_renders_five_tones', async ({ page }) => {
		await page.goto('/settings')
		await page.getByRole('button', { name: /Auflegen/ }).click()
		// The five tones are: Glut, Funke, Kohle, Klassik, Lautlos.
		await expect(page.getByText('Glut', { exact: true })).toBeVisible()
		await expect(page.getByText('Funke', { exact: true })).toBeVisible()
		await expect(page.getByText('Kohle', { exact: true })).toBeVisible()
		await expect(page.getByText('Klassik', { exact: true })).toBeVisible()
		await expect(page.getByText('Lautlos', { exact: true })).toBeVisible()
	})

	test('test_picking_tone_updates_current_label', async ({ page }) => {
		await page.goto('/settings')
		await page.getByRole('button', { name: /Auflegen/ }).click()
		// Pick "Kohle" via its tone-pick button.
		await page.getByRole('button', { name: /Kohle/ }).first().click()
		// The accordion head shows the chosen tone name.
		await expect(page.getByRole('button', { name: /Auflegen/ })).toContainText('Kohle')
	})
})
