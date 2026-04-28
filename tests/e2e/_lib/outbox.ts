import { api } from './api'

export interface OutboxMessage {
	to: string
	subject: string
	body: string
}

export async function readOutbox(): Promise<OutboxMessage[]> {
	const c = await api()
	const r = await c.get('/api/_test/outbox')
	if (!r.ok()) throw new Error(`outbox fetch failed: ${r.status()}`)
	return (await r.json()) as OutboxMessage[]
}

export async function clearOutbox(): Promise<void> {
	const c = await api()
	await c.post('/api/_test/outbox/clear')
}

export async function waitForEmail(toAddress: string, timeoutMs = 10_000): Promise<OutboxMessage> {
	const start = Date.now()
	while (Date.now() - start < timeoutMs) {
		const messages = await readOutbox()
		const match = messages.find(m => m.to.toLowerCase() === toAddress.toLowerCase())
		if (match) return match
		await new Promise(r => setTimeout(r, 100))
	}
	throw new Error(`no email to ${toAddress} arrived within ${timeoutMs}ms`)
}

export function extractTokenLink(body: string): string {
	const match = body.match(/https?:\/\/[^\s]+\/(?:set-password|reset-password)\?token=[A-Za-z0-9_-]+/)
	if (!match) throw new Error('no token link in email body')
	return match[0]
}

export function extractTokenPath(body: string): string {
	const link = extractTokenLink(body)
	const url = new URL(link)
	return url.pathname + url.search
}
