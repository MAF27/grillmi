import adapter from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess({ style: false }),
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: 'index.html',
			precompress: false,
			strict: true,
		}),
		serviceWorker: {
			register: true,
		},
		prerender: {
			handleHttpError: ({ path, message }) => {
				// PWA icons + sounds are sourced manually before deploy (Spec 2 §Phase 12).
				// Until they ship, treat their absence as a warning, not a build failure.
				if (path.startsWith('/icons/') || path.startsWith('/sounds/')) {
					console.warn(`prerender: ${message}`)
					return
				}
				throw new Error(message)
			},
		},
	},
}

export default config
