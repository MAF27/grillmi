import { describe, expect, it, beforeEach } from 'vitest'
import { authStore } from '$lib/stores/authStore.svelte'

beforeEach(() => {
	authStore.clear()
})

describe('authStore', () => {
	it('test_set_session_populates_user_and_csrf_token', () => {
		authStore.setSession({
			user: { id: 'u1', email: 'm@example.com' },
			csrfToken: 'csrf-abc',
		})
		expect(authStore.user).toEqual({ id: 'u1', email: 'm@example.com' })
		expect(authStore.csrfToken).toBe('csrf-abc')
		expect(authStore.isAuthenticated).toBe(true)
	})

	it('test_clear_resets_to_null', () => {
		authStore.setSession({
			user: { id: 'u1', email: 'm@example.com' },
			csrfToken: 'csrf-abc',
		})
		authStore.clear()
		expect(authStore.user).toBe(null)
		expect(authStore.csrfToken).toBe(null)
		expect(authStore.isAuthenticated).toBe(false)
	})

	it('test_init_with_null_resets', () => {
		authStore.setSession({
			user: { id: 'u1', email: 'm@example.com' },
			csrfToken: 'csrf-abc',
		})
		authStore.init(null)
		expect(authStore.user).toBe(null)
		expect(authStore.csrfToken).toBe(null)
	})

	it('test_init_with_snapshot_populates', () => {
		authStore.init({
			user: { id: 'u9', email: 'x@example.com' },
			csrfToken: 'csrf-xyz',
		})
		expect(authStore.user?.email).toBe('x@example.com')
		expect(authStore.csrfToken).toBe('csrf-xyz')
	})
})
