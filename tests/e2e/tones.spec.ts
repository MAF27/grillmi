import { expect, test } from '@playwright/test'

test.describe('tones (settings)', () => {
	test('test_settings_renders_five_tones', async ({ page }) => {
		await page.goto('/settings')
		await page.getByRole('button', { name: /Auflegen/ }).click()
		// Scope to the picker's tone-name nodes; the head label also reads the
		// current tone, which would collide under getByText strict mode.
		const names = page.locator('.tone-name')
		await expect(names.filter({ hasText: /^Glut$/ })).toBeVisible()
		await expect(names.filter({ hasText: /^Funke$/ })).toBeVisible()
		await expect(names.filter({ hasText: /^Kohle$/ })).toBeVisible()
		await expect(names.filter({ hasText: /^Klassik$/ })).toBeVisible()
		await expect(names.filter({ hasText: /^Lautlos$/ })).toBeVisible()
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
