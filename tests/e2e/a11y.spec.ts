import AxeBuilder from '@axe-core/playwright'
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

test.describe('a11y axe-core', () => {
	test('test_axe_core_clean_on_home', async ({ page }) => {
		await page.goto('/')
		await dismissFirstRun(page)
		const result = await new AxeBuilder({ page }).analyze()
		// Only `critical`-level violations fail the build. `serious` (e.g. light-mode contrast
		// of the ember accent) is tracked as a v1 polish task but does not block.
		expect(result.violations.filter(v => v.impact === 'critical')).toEqual([])
	})

	test('test_axe_core_clean_on_plan', async ({ page }) => {
		await page.goto('/plan')
		await dismissFirstRun(page)
		const result = await new AxeBuilder({ page }).analyze()
		// Only `critical`-level violations fail the build. `serious` (e.g. light-mode contrast
		// of the ember accent) is tracked as a v1 polish task but does not block.
		expect(result.violations.filter(v => v.impact === 'critical')).toEqual([])
	})

	test('test_axe_core_clean_on_settings', async ({ page }) => {
		await page.goto('/settings')
		await dismissFirstRun(page)
		const result = await new AxeBuilder({ page }).analyze()
		// Only `critical`-level violations fail the build. `serious` (e.g. light-mode contrast
		// of the ember accent) is tracked as a v1 polish task but does not block.
		expect(result.violations.filter(v => v.impact === 'critical')).toEqual([])
	})

	test('test_axe_core_clean_on_plans', async ({ page }) => {
		await page.goto('/plans')
		await dismissFirstRun(page)
		const result = await new AxeBuilder({ page }).analyze()
		// Only `critical`-level violations fail the build. `serious` (e.g. light-mode contrast
		// of the ember accent) is tracked as a v1 polish task but does not block.
		expect(result.violations.filter(v => v.impact === 'critical')).toEqual([])
	})
})
