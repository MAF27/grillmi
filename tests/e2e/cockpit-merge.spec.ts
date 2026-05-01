import { expect, test } from '@playwright/test'

test.describe('cockpit merge (desktop)', () => {
	test('test_grillstuecke_persist_across_pre_post_start_transition', async ({ page }) => {
		await page.goto('/', { waitUntil: 'networkidle' })
		// Desktop defaults straight into the grill cockpit.
		await expect(page).toHaveURL(/\/grillen/)

		// Add a Grillstück: open the empty-state add card, pick category + cut.
		await page.getByRole('button', { name: /Grillstück hinzufügen/ }).click()
		await page.getByRole('button', { name: 'Rind' }).click()
		await page
			.getByRole('button', { name: /Rinds-Entrec/ })
			.first()
			.click()
		await page.getByRole('button', { name: 'Übernehmen' }).click()

		const itemLabel = await page
			.locator('.list')
			.getByText(/Rinds-Entrec/)
			.first()
			.textContent()
		await expect(page.getByTestId('plan-summary-list')).toHaveCount(0)

		// Click Los; centre swaps from compose to live timers without keeping a
		// duplicate plan rail around. URL flips to /session per the route.
		await page.getByRole('button', { name: /Los, fertig um/i }).click()
		await expect(page).toHaveURL(/\/session/)
		await expect(page.getByTestId('plan-summary-list')).toHaveCount(0)
		await expect(page.getByTestId('timer-card').first()).toContainText(itemLabel?.trim() ?? '')

		// Sidebar entry shows LIVE pill and routing target follows the live state.
		await expect(page.getByRole('button', { name: /^Grillen/ }).locator('.badge')).toContainText('LIVE')
	})

	test('test_sidebar_has_no_planen_entry', async ({ page }) => {
		await page.goto('/', { waitUntil: 'networkidle' })
		await expect(page).toHaveURL(/\/grillen/)
		const sidebarButtons = page.locator('aside.desktop-sidebar nav button')
		await expect(sidebarButtons).toHaveCount(3)
		await expect(page.getByRole('button', { name: /^Übersicht$/ })).toHaveCount(0)
		await expect(page.getByRole('button', { name: /^Planen$/ })).toHaveCount(0)
	})
})
