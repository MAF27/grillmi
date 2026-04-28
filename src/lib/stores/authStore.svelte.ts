export interface AuthUser {
	id: string
	email: string
}

export interface AuthSnapshot {
	user: AuthUser
	csrfToken: string
}

function createAuthStore() {
	let user = $state<AuthUser | null>(null)
	let csrfToken = $state<string | null>(null)

	return {
		get user() {
			return user
		},
		get csrfToken() {
			return csrfToken
		},
		get isAuthenticated() {
			return user !== null
		},

		init(snapshot: AuthSnapshot | null): void {
			if (snapshot === null) {
				user = null
				csrfToken = null
				return
			}
			user = snapshot.user
			csrfToken = snapshot.csrfToken
		},

		setSession(snapshot: AuthSnapshot): void {
			user = snapshot.user
			csrfToken = snapshot.csrfToken
		},

		clear(): void {
			user = null
			csrfToken = null
		},
	}
}

export const authStore = createAuthStore()
