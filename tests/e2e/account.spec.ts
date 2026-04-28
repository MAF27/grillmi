import { expect, test } from '@playwright/test'

import { resetBackend } from './_lib/api'
import { activateAccount, FRONTEND_URL, login, uniqueEmail } from './_lib/auth'
import { readOutbox } from './_lib/outbox'

test.beforeEach(async () => {
	await resetBackend()
})

test.describe('account', () => {
	test('test_account_page_shows_current_session_marker', async ({ page }) => {
		const email = uniqueEmail('current-marker')
		await activateAccount(page, email)
		await page.goto('/account')
		const currentRow = page.locator('.sessions li', { hasText: 'dieses Gerät' })
		await expect(currentRow).toHaveCount(1)
	})

	test('test_revoke_other_session_logs_that_browser_out', async ({ browser }) => {
		const email = uniqueEmail('revoke-other')
		const ctxA = await browser.newContext({ baseURL: FRONTEND_URL })
		const pageA = await ctxA.newPage()
		await activateAccount(pageA, email)

		const ctxB = await browser.newContext({ baseURL: FRONTEND_URL })
		const pageB = await ctxB.newPage()
		await login(pageB, email)

		await pageA.goto('/account')
		const otherRow = pageA.locator('.sessions li', { hasNotText: 'dieses Gerät' })
		await expect(otherRow).toHaveCount(1)
		await otherRow.locator('button[data-session-id]').click()

		await pageB.goto('/')
		await expect(pageB).toHaveURL(/\/login/, { timeout: 10_000 })

		await ctxA.close()
		await ctxB.close()
	})

	test('test_password_change_button_sends_reset_email', async ({ page }) => {
		const email = uniqueEmail('pwchange')
		await activateAccount(page, email)
		await page.goto('/account')

		await page.locator('#change-password-btn').click()
		await expect(page.getByRole('status')).toContainText(/Mail|gesendet|Konto/)

		const messages = await readOutbox()
		const resetMail = messages.find(m => m.to === email && /zur(ue|ü)cksetz/i.test(m.subject))
		expect(resetMail).toBeTruthy()
	})

	test('test_account_delete_with_hold_button_redirects_to_login_and_wipes_idb', async ({ page }) => {
		const email = uniqueEmail('account-delete')
		await activateAccount(page, email)
		await page.goto('/account')

		const button = page.locator('#delete-account-hold')
		await button.dispatchEvent('pointerdown')
		await expect(page).toHaveURL(/\/login/, { timeout: 5_000 })

		const idbState = await page.evaluate(async () => {
			const dbs = await indexedDB.databases()
			const grillmi = dbs.find(d => d.name === 'grillmi')
			if (!grillmi) return { present: false, total: 0 }
			return await new Promise<{ present: boolean; total: number }>(resolve => {
				const open = indexedDB.open('grillmi')
				open.onsuccess = () => {
					const db = open.result
					const names = Array.from(db.objectStoreNames)
					if (names.length === 0) {
						db.close()
						resolve({ present: true, total: 0 })
						return
					}
					const tx = db.transaction(names, 'readonly')
					let total = 0
					let pending = names.length
					for (const n of names) {
						const req = tx.objectStore(n).count()
						req.onsuccess = () => {
							total += req.result
							if (--pending === 0) {
								db.close()
								resolve({ present: true, total })
							}
						}
					}
				}
			})
		})
		expect(idbState.total).toBe(0)
	})

	test('test_session_list_renders_parsed_device_label', async ({ browser }) => {
		const email = uniqueEmail('device-label')
		const ctx = await browser.newContext({
			baseURL: FRONTEND_URL,
			userAgent:
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
		})
		const page = await ctx.newPage()
		await activateAccount(page, email)
		await page.goto('/account')

		const row = page.locator('.sessions li', { hasText: /Mac/i })
		await expect(row).toHaveCount(1)
		await expect(row).toContainText(/Safari/i)

		await ctx.close()
	})

	test('test_revoking_current_session_logs_caller_out', async ({ page }) => {
		const email = uniqueEmail('revoke-self')
		await activateAccount(page, email)
		await page.goto('/account')

		const currentRow = page.locator('.sessions li', { hasText: 'dieses Gerät' })
		await currentRow.locator('button[data-session-id]').click()

		await expect(page).toHaveURL(/\/login/, { timeout: 5_000 })
	})
})
