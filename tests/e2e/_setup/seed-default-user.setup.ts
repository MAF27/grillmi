import { expect, test as setup } from '@playwright/test'

import { adminInit } from '../_lib/admin'
import { resetBackend } from '../_lib/api'
import { FRONTEND_URL, PASSWORD } from '../_lib/auth'

const STORAGE_STATE = 'tests/e2e/_setup/.default-user-storage.json'
export const DEFAULT_EMAIL = 'default-user@example.com'

setup('seed default user', async ({ page }) => {
	await resetBackend()
	const init = await adminInit(DEFAULT_EMAIL)
	const url = new URL(init.link)
	await page.goto(url.pathname + url.search)
	await page.locator('#set-password-pw').fill(PASSWORD)
	await page.locator('#set-password-confirm').fill(PASSWORD)
	await page.locator('#set-password-submit').click()
	await page.waitForURL(url => !url.pathname.startsWith('/set-password'), { timeout: 15_000 })

	const cookies = await page.context().cookies()
	expect(cookies.find(c => c.name === 'grillmi_session')).toBeTruthy()

	await page.context().storageState({ path: STORAGE_STATE })
	void FRONTEND_URL
})
