import { expect, test as setup } from '@playwright/test'

import { adminInit } from '../_lib/admin'
import { BACKEND_URL, resetBackend } from '../_lib/api'
import { PASSWORD } from '../_lib/auth'

const STORAGE_STATE = 'tests/e2e/_setup/.default-user-storage.json'
export const DEFAULT_EMAIL = 'default-user@example.com'

setup('seed default user', async ({ page }) => {
	await resetBackend()
	const init = await adminInit(DEFAULT_EMAIL)
	const response = await page.context().request.post(`${BACKEND_URL}/api/auth/set-password`, {
		data: { token: init.token, password: PASSWORD },
		headers: { 'Content-Type': 'application/json' },
	})
	expect(response.ok(), await response.text()).toBe(true)

	const cookies = await page.context().cookies()
	const sessionCookie = cookies.find(c => c.name === 'grillmi_session')
	expect(sessionCookie).toBeTruthy()
	await page.context().addCookies([
		{
			name: sessionCookie!.name,
			value: sessionCookie!.value,
			domain: '127.0.0.1',
			path: sessionCookie!.path,
			expires: sessionCookie!.expires,
			httpOnly: sessionCookie!.httpOnly,
			secure: sessionCookie!.secure,
			sameSite: sessionCookie!.sameSite,
		},
		{
			name: sessionCookie!.name,
			value: sessionCookie!.value,
			domain: 'localhost',
			path: sessionCookie!.path,
			expires: sessionCookie!.expires,
			httpOnly: sessionCookie!.httpOnly,
			secure: sessionCookie!.secure,
			sameSite: sessionCookie!.sameSite,
		},
	])

	await page.context().storageState({ path: STORAGE_STATE })
})
