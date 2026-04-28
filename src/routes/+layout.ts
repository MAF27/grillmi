import { redirect } from '@sveltejs/kit'
import type { LayoutLoad } from './$types'

export const prerender = false
export const ssr = false
export const trailingSlash = 'never'

const PUBLIC_PATHS = ['/login', '/set-password', '/forgot-password']

export const load: LayoutLoad = async ({ fetch, url }) => {
	const isPublic = PUBLIC_PATHS.some(p => url.pathname === p || url.pathname.startsWith(p + '/'))
	try {
		const response = await fetch('/api/auth/me', {
			headers: { Accept: 'application/json' },
			credentials: 'include',
		})
		if (response.status === 401) {
			if (isPublic) return { auth: null }
			const next = encodeURIComponent(url.pathname + url.search)
			throw redirect(303, `/login?next=${next}`)
		}
		if (!response.ok) {
			return { auth: null }
		}
		const data = (await response.json()) as { user: { id: string; email: string }; csrfToken: string }
		return { auth: { user: data.user, csrfToken: data.csrfToken } }
	} catch (err) {
		// `redirect` is thrown above. If it's a real network error during dev with no backend, treat as no-auth.
		if (err && typeof err === 'object' && 'status' in err) throw err
		if (isPublic) return { auth: null }
		return { auth: null }
	}
}
