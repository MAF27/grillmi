import { goto } from '$app/navigation'
import { authStore } from '$lib/stores/authStore.svelte'
import { enqueueSync } from '$lib/sync/queue'

interface ApiFetchOptions extends RequestInit {
	skipAuthRedirect?: boolean
	enqueueOn5xx?: boolean
}

interface ApiError extends Error {
	status: number
	body?: unknown
}

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

export async function apiFetch<T = unknown>(path: string, init: ApiFetchOptions = {}): Promise<T> {
	const method = (init.method ?? 'GET').toUpperCase()
	const headers = new Headers(init.headers)
	if (!headers.has('Accept')) headers.set('Accept', 'application/json')
	if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

	if (WRITE_METHODS.has(method)) {
		const csrf = authStore.csrfToken
		if (csrf) headers.set('X-CSRFToken', csrf)
	}

	let response: Response
	try {
		response = await fetch(path, {
			...init,
			method,
			headers,
			credentials: 'include',
		})
	} catch (err) {
		if (init.enqueueOn5xx !== false && WRITE_METHODS.has(method)) {
			await enqueueSync({
				method,
				path,
				body: typeof init.body === 'string' ? init.body : undefined,
			})
		}
		throw err
	}

	if (response.status === 401 && !init.skipAuthRedirect) {
		authStore.clear()
		const next = encodeURIComponent(window.location.pathname + window.location.search)
		const safe = window.location.pathname.startsWith('/login') ? '' : `?next=${next}`
		await goto(`/login${safe}`)
		throw await asError(response)
	}

	if (response.status === 409) {
		throw await asError(response)
	}

	if (response.status >= 500 && WRITE_METHODS.has(method)) {
		if (init.enqueueOn5xx !== false) {
			await enqueueSync({
				method,
				path,
				body: typeof init.body === 'string' ? init.body : undefined,
			})
		}
		throw await asError(response)
	}

	if (!response.ok) {
		throw await asError(response)
	}

	if (response.status === 204) return undefined as T
	const ct = response.headers.get('Content-Type') ?? ''
	if (ct.includes('application/json')) return (await response.json()) as T
	return (await response.text()) as unknown as T
}

async function asError(response: Response): Promise<ApiError> {
	let body: unknown = undefined
	try {
		body = await response.json()
	} catch {
		body = undefined
	}
	const err = new Error(`api ${response.status}`) as ApiError
	err.status = response.status
	err.body = body
	return err
}
