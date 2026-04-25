import { sveltekit } from '@sveltejs/kit/vite'
import { svelteTesting } from '@testing-library/svelte/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), svelteTesting()],
	server: {
		host: true,
		strictPort: true,
		port: 5173,
	},
	test: {
		environment: 'jsdom',
		globals: true,
		setupFiles: ['./tests/setup.ts'],
		css: false,
		server: {
			deps: {
				inline: [/^svelte/],
			},
		},
	},
})
