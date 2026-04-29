import { expect, test } from '@playwright/test'

test.describe('cockpit merge (desktop)', () => {
	test('test_grillstuecke_persist_across_pre_post_start_transition', async ({ page }) => {
		await page.goto('/', { waitUntil: 'networkidle' })
		// Sidebar Grillen entry navigates to /plan when no session exists.
		await page.getByRole('button', { name: /^Grillen$/ }).click()
		await expect(page).toHaveURL(/\/plan/)

		// Add a Grillstück: open the empty-state add card, pick category + cut.
		await page.getByRole('button', { name: /Grillstück hinzufügen/ }).click()
		await page.getByRole('button', { name: 'Rind' }).click()
		await page.getByRole('button', { name: /Rinds-Entrec/ }).first().click()
		await page.getByRole('button', { name: 'Übernehmen' }).click()

		const summaryItems = page.locator('[data-testid="plan-summary-list"] li')
		await expect(summaryItems).toHaveCount(1)
		const itemLabel = await summaryItems.first().locator('.name').textContent()

		// Click Los; centre swaps to live cockpit, summary list keeps showing the
		// same item with a status dot. URL flips to /session per the route.
		await page.getByRole('button', { name: /Los, fertig um/i }).click()
		await expect(page).toHaveURL(/\/session/)
		await expect(summaryItems).toHaveCount(1)
		await expect(summaryItems.first().locator('.name')).toHaveText(itemLabel ?? '')
		await expect(summaryItems.first().locator('.dot')).toBeVisible()

		// Sidebar entry shows LIVE pill and routing target follows the live state.
		await expect(page.getByRole('button', { name: /^Grillen/ }).locator('.badge')).toContainText('LIVE')
	})

	test('test_sidebar_has_no_planen_entry', async ({ page }) => {
		await page.goto('/', { waitUntil: 'networkidle' })
		const sidebarButtons = page.locator('aside.desktop-sidebar nav button')
		await expect(sidebarButtons).toHaveCount(4)
		await expect(page.getByRole('button', { name: /^Planen$/ })).toHaveCount(0)
	})
})
