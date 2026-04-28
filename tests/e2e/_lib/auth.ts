import type { BrowserContext, Page } from '@playwright/test'

import { adminInit } from './admin'

export const PASSWORD = 'GrillEr3rgut!safe2026'

export async function activateAccount(page: Page, email: string, password = PASSWORD): Promise<void> {
	const result = await adminInit(email)
	const url = new URL(result.link)
	await page.goto(url.pathname + url.search)
	await page.locator('#set-password-pw').fill(password)
	await page.locator('#set-password-confirm').fill(password)
	await page.locator('#set-password-submit').click()
	await page.waitForURL(url => !url.pathname.startsWith('/set-password'), { timeout: 15_000 })
}

export async function login(page: Page, email: string, password = PASSWORD): Promise<void> {
	await page.goto('/login')
	await page.locator('#login-email').fill(email)
	await page.locator('#login-password').fill(password)
	await page.locator('#login-submit').click()
	await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 15_000 })
}

export async function provisionUser(page: Page, email: string, password = PASSWORD): Promise<void> {
	await activateAccount(page, email, password)
	await page.context().clearCookies()
}

export const FRONTEND_URL = 'http://127.0.0.1:5173'

export async function loginViaApi(context: BrowserContext, email: string, password = PASSWORD): Promise<{ csrfToken: string }> {
	const r = await context.request.post(`${FRONTEND_URL}/api/auth/login`, {
		data: { email, password },
		headers: { 'Content-Type': 'application/json' },
	})
	if (!r.ok()) throw new Error(`api login failed: ${r.status()} ${await r.text()}`)
	const body = (await r.json()) as { csrfToken: string }
	return { csrfToken: body.csrfToken }
}

export async function markFirstLoginComplete(page: Page): Promise<void> {
	await page.evaluate(async () => {
		const { setSyncMeta } = await import('/src/lib/stores/db.ts')
		await setSyncMeta('firstLoginMigrationComplete', true)
	})
}

export function uniqueEmail(prefix: string): string {
	const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
	return `${prefix}-${stamp}@example.com`
}
