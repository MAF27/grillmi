import { api } from './api'

export interface AdminInitResult {
	email: string
	token: string
	link: string
}

export async function adminInit(email: string): Promise<AdminInitResult> {
	const c = await api()
	const r = await c.post('/api/_test/admin_init', { data: { email } })
	if (!r.ok()) throw new Error(`admin_init failed: ${r.status()} ${await r.text()}`)
	return (await r.json()) as AdminInitResult
}

export async function forgeToken(opts: {
	email: string
	kind?: 'invitation' | 'reset'
	offsetSeconds?: number
	used?: boolean
}): Promise<string> {
	const c = await api()
	const r = await c.post('/api/_test/forge_token', {
		data: {
			email: opts.email,
			kind: opts.kind ?? 'invitation',
			offset_seconds: opts.offsetSeconds ?? 0,
			used: opts.used ?? false,
		},
	})
	if (!r.ok()) throw new Error(`forge_token failed: ${r.status()} ${await r.text()}`)
	const body = (await r.json()) as { token: string }
	return body.token
}

export async function forgeSession(opts: { email: string; ageHours: number }): Promise<{
	token: string
	csrfToken: string
}> {
	const c = await api()
	const r = await c.post('/api/_test/forge_session', {
		data: { email: opts.email, age_hours: opts.ageHours },
	})
	if (!r.ok()) throw new Error(`forge_session failed: ${r.status()} ${await r.text()}`)
	const body = (await r.json()) as { token: string; csrf_token: string }
	return { token: body.token, csrfToken: body.csrf_token }
}
