import { expect, test } from '@playwright/test'

async function dismissFirstRun(page: import('@playwright/test').Page) {
	const btn = page.getByRole('button', { name: 'Verstanden' })
	if (await btn.isVisible().catch(() => false)) {
		await btn.click({ force: true })
		await page
			.locator('dialog.notice')
			.waitFor({ state: 'detached', timeout: 5000 })
			.catch(() => {})
	}
}

test.describe('plan-to-session', () => {
	test('test_full_plan_flow_single_item', async ({ page }) => {
		await page.goto('/', { waitUntil: 'networkidle' })
		await dismissFirstRun(page)
		await page.getByRole('button', { name: /Neue Session/ }).click()
		await expect(page).toHaveURL(/\/plan/)
	})
})
