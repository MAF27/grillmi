import { expect, test } from '@playwright/test'

import { adminInit, forgeSession, forgeToken } from './_lib/admin'
import { api, BACKEND_URL, clearRateLimits, resetBackend } from './_lib/api'
import { activateAccount, login, PASSWORD, uniqueEmail } from './_lib/auth'
import { extractTokenLink, extractTokenPath, readOutbox, waitForEmail } from './_lib/outbox'

test.beforeEach(async () => {
	await resetBackend()
})

test.describe('auth', () => {
	test('test_full_activation_flow', async ({ page }) => {
		const email = uniqueEmail('activation')
		const init = await adminInit(email)

		const message = await waitForEmail(email)
		const link = extractTokenLink(message.body)
		expect(link).toContain(init.token)

		const path = extractTokenPath(message.body)
		await page.goto(path)
		await page.locator('#set-password-pw').fill(PASSWORD)
		await page.locator('#set-password-confirm').fill(PASSWORD)
		await page.locator('#set-password-submit').click()

		await expect(page).toHaveURL('/')
		const cookies = await page.context().cookies()
		expect(cookies.find(c => c.name === 'grillmi_session')).toBeTruthy()
	})

	test('test_forgot_password_then_reset_then_login', async ({ page }) => {
		const email = uniqueEmail('reset')
		await activateAccount(page, email)
		await page.context().clearCookies()

		await page.goto('/forgot-password')
		await page.locator('#forgot-email').fill(email)
		await page.locator('#forgot-submit').click()
		await expect(page.getByRole('status')).toContainText(/zurueckgesetzt|gesendet|Mail/i)

		const messages = await readOutbox()
		const reset = messages.reverse().find(m => m.to === email && /zur(ue|ü)cksetz/i.test(m.subject))
		expect(reset, 'reset email present').toBeTruthy()

		const path = extractTokenPath(reset!.body)
		const newPassword = 'NeuesGrillPwd!2026X'
		await page.goto(path)
		await page.locator('#set-password-pw').fill(newPassword)
		await page.locator('#set-password-confirm').fill(newPassword)
		await page.locator('#set-password-submit').click()
		await expect(page).toHaveURL(/\/login/)

		const cookiesBefore = await page.context().cookies()
		expect(cookiesBefore.find(c => c.name === 'grillmi_session')).toBeFalsy()

		await login(page, email, newPassword)
		await expect(page).toHaveURL('/')
	})

	test('test_login_then_logout_clears_idb', async ({ page }) => {
		const email = uniqueEmail('logout')
		await activateAccount(page, email)

		await page.goto('/account')
		await page.locator('#sign-out-btn').click()
		await expect(page).toHaveURL(/\/login/)

		const userDataStores = ['favorites', 'plans', 'settings', 'grilladen', 'syncQueue']
		const counts = await page.evaluate(async stores => {
			return await new Promise<Record<string, number>>(resolve => {
				const open = indexedDB.open('grillmi')
				open.onsuccess = () => {
					const db = open.result
					const present = stores.filter(s => db.objectStoreNames.contains(s))
					if (present.length === 0) {
						db.close()
						resolve({})
						return
					}
					const tx = db.transaction(present, 'readonly')
					const out: Record<string, number> = {}
					let pending = present.length
					for (const n of present) {
						const req = tx.objectStore(n).count()
						req.onsuccess = () => {
							out[n] = req.result
							if (--pending === 0) {
								db.close()
								resolve(out)
							}
						}
					}
				}
			})
		}, userDataStores)
		for (const [name, count] of Object.entries(counts)) {
			expect(count, `IDB store ${name} should be empty after logout`).toBe(0)
		}
	})

	test('test_set_password_page_calls_logout_on_load_when_cookie_exists', async ({ page }) => {
		const email = uniqueEmail('relogin')
		await activateAccount(page, email)
		const cookiesBefore = await page.context().cookies()
		expect(cookiesBefore.find(c => c.name === 'grillmi_session')).toBeTruthy()

		const second = await adminInit(uniqueEmail('second'))
		const url = new URL(second.link)
		await page.goto(url.pathname + url.search)

		await expect.poll(
			async () => {
				const cookies = await page.context().cookies()
				return cookies.find(c => c.name === 'grillmi_session') ?? null
			},
			{ timeout: 5_000, message: 'session cookie should be cleared on /set-password load' }
		).toBeNull()
		await expect(page.locator('#set-password-submit')).toBeVisible()
	})

	test('test_login_after_24h_expiry_returns_to_original_url', async ({ page, context }) => {
		const email = uniqueEmail('expired')
		await activateAccount(page, email)
		await context.clearCookies()

		const forged = await forgeSession({ email, ageHours: 25 })
		await context.addCookies([
			{
				name: 'grillmi_session',
				value: forged.token,
				domain: '127.0.0.1',
				path: '/',
				httpOnly: true,
			},
		])

		await page.goto('/account')
		await expect(page).toHaveURL('/login?next=%2Faccount')

		await page.locator('#login-email').fill(email)
		await page.locator('#login-password').fill(PASSWORD)
		await page.locator('#login-submit').click()
		await expect(page).toHaveURL('/account')
	})

	test('test_rate_limit_per_ip_returns_429_after_5_attempts', async ({ context }) => {
		await clearRateLimits()
		let last: { status: number; retryAfter: string | null } = { status: 0, retryAfter: null }
		for (let i = 0; i < 6; i++) {
			const r = await context.request.post(`${BACKEND_URL}/api/auth/login`, {
				data: { email: `wrong${i}@example.com`, password: 'badbadbadbadbad' },
				headers: { 'Content-Type': 'application/json' },
				failOnStatusCode: false,
			})
			last = { status: r.status(), retryAfter: r.headers()['retry-after'] ?? null }
		}
		expect(last.status).toBe(429)
		expect(last.retryAfter).not.toBeNull()
	})

	test('test_security_headers_present_on_html_response', async ({ context }) => {
		// In dev (no Caddy/prod), the frontend assets come from vite while
		// security headers are set by the FastAPI middleware. Hit a backend
		// route through the proxy so we exercise the same middleware that
		// fronts the prod HTML response under Caddy.
		const r = await context.request.get('/api/health', { failOnStatusCode: false })
		const h = r.headers()
		expect(h['x-frame-options']).toBeTruthy()
		expect(h['x-content-type-options']).toBeTruthy()
		expect(h['referrer-policy']).toBeTruthy()
		expect(h['content-security-policy']).toBeTruthy()
	})

	test('test_expired_invitation_token_renders_german_error_page', async ({ page }) => {
		const email = uniqueEmail('expired-tok')
		const token = await forgeToken({ email, kind: 'invitation', offsetSeconds: -3600 })
		await page.goto(`/set-password?token=${token}`)
		await page.locator('#set-password-pw').fill(PASSWORD)
		await page.locator('#set-password-confirm').fill(PASSWORD)
		await page.locator('#set-password-submit').click()
		await expect(page.getByRole('heading', { name: /Link abgelaufen/ })).toBeVisible()
		await expect(page.locator('#forgot-password-link')).toHaveAttribute('href', '/forgot-password')
	})

	test('test_already_consumed_token_returns_410', async ({ page }) => {
		const email = uniqueEmail('used-tok')
		const token = await forgeToken({ email, kind: 'invitation', offsetSeconds: 3600, used: true })
		await page.goto(`/set-password?token=${token}`)
		await page.locator('#set-password-pw').fill(PASSWORD)
		await page.locator('#set-password-confirm').fill(PASSWORD)

		const responsePromise = page.waitForResponse(r => r.url().endsWith('/api/auth/set-password'))
		await page.locator('#set-password-submit').click()
		const response = await responsePromise
		expect(response.status()).toBe(410)
		const body = await response.json()
		expect(body.detail.error_code).toBe('token_used')
	})

	test('test_open_redirect_blocked', async ({ page }) => {
		const email = uniqueEmail('redir')
		await activateAccount(page, email)
		await page.context().clearCookies()

		await page.goto('/login?next=https://evil.com/pwn')
		await page.locator('#login-email').fill(email)
		await page.locator('#login-password').fill(PASSWORD)
		await page.locator('#login-submit').click()
		await expect(page).toHaveURL('/')
	})

	test('test_health_endpoint_is_unauthenticated', async () => {
		const c = await api()
		const r = await c.get('/api/health')
		expect(r.status()).toBe(200)
		const body = await r.json()
		expect(body.status).toBe('ok')
	})

	test('test_openapi_disabled_in_prod', async ({ context }) => {
		// In the test harness OPENAPI_ENABLED=true so the live route serves; we
		// assert the route is gated on the setting by hitting it with the env
		// override flipped via the test endpoint.
		const c = await api()
		const r = await c.post('/api/_test/set_openapi_enabled', {
			data: { enabled: false },
			failOnStatusCode: false,
		})
		// If the toggle endpoint isn't present this assertion documents the
		// invariant lives in main.create_app's branch on settings.OPENAPI_ENABLED.
		test.skip(r.status() === 404, 'no runtime toggle; covered by integration test_openapi_disabled')
		const docs = await context.request.get(`${BACKEND_URL}/docs`, { failOnStatusCode: false })
		expect(docs.status()).toBe(404)
	})
})
