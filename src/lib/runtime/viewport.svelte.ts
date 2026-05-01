import { browser } from '$app/environment'

function createViewport() {
	let isDesktop = $state(browser ? window.matchMedia('(min-width: 1024px)').matches : false)
	let cleanup: (() => void) | null = null

	return {
		get isDesktop() {
			return isDesktop
		},
		start() {
			if (!browser || cleanup) return cleanup ?? (() => {})
			const query = window.matchMedia('(min-width: 1024px)')
			isDesktop = query.matches
			const update = (event: MediaQueryListEvent) => {
				isDesktop = event.matches
			}
			query.addEventListener('change', update)
			cleanup = () => {
				query.removeEventListener('change', update)
				cleanup = null
			}
			return cleanup
		},
	}
}

export const viewport = createViewport()
