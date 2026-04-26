import { afterEach, describe, expect, it } from 'vitest'
import { uuid } from '$lib/util/uuid'

describe('uuid', () => {
	it('test_uuid_returns_v4_shaped_string', () => {
		const v = uuid()
		expect(v).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
	})

	it('test_uuid_returns_unique_values_across_many_calls', () => {
		const seen = new Set<string>()
		for (let i = 0; i < 200; i++) seen.add(uuid())
		expect(seen.size).toBe(200)
	})
})

describe('uuid fallback (no WebCrypto)', () => {
	const realCrypto = globalThis.crypto
	afterEach(() => {
		Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true, writable: true })
	})

	it('test_uuid_fallback_used_when_crypto_lacks_randomUUID', async () => {
		Object.defineProperty(globalThis, 'crypto', {
			value: {},
			configurable: true,
			writable: true,
		})
		const mod = await import('$lib/util/uuid?fallback')
		const v = mod.uuid()
		expect(v).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
	})
})
