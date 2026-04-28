import adapter from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess({ style: false }),
	kit: {
		appDir: '_grillmi',
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: 'index.html',
			precompress: false,
			strict: true,
		}),
		serviceWorker: {
			// SvelteKit auto-registers in production; we register manually from
			// the layout so we can no-op in dev (where vite serves a raw module
			// import that crashes the classic-worker loader).
			register: false,
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
