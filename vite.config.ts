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
		allowedHosts: ['grillmi.krafted.cc'],
		proxy: {
			'/api': {
				target: `http://127.0.0.1:${process.env.BACKEND_PORT ?? 8000}`,
				changeOrigin: false,
				secure: false,
			},
		},
	},
	test: {
		environment: 'jsdom',
		globals: true,
		setupFiles: ['./tests/setup.ts'],
		css: false,
		include: ['tests/unit/**/*.test.ts', 'tests/components/**/*.test.ts'],
		exclude: ['tests/e2e/**', 'node_modules/**', '.svelte-kit/**', 'build/**'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'json-summary'],
			include: ['src/lib/**/*.{ts,svelte}'],
			exclude: [
				'src/lib/data/timings.generated.json',
				'src/lib/data/timings.generated.d.ts',
				'src/lib/runtime/wakeLock.ts',
				'src/lib/sounds/player.ts',
				'src/lib/components/GlowGrates.svelte',
				'src/lib/models/index.ts',
				'src/service-worker.ts',
				'**/*.d.ts',
			],
			thresholds: {
				lines: 80,
				functions: 80,
				branches: 80,
				statements: 80,
			},
		},
		server: {
			deps: {
				inline: [/^svelte/],
			},
		},
	},
})
