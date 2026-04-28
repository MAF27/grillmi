import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
	testDir: 'tests/e2e',
	testIgnore: ['**/_setup/**', '**/_lib/**'],
	fullyParallel: false,
	retries: 0,
	workers: 1,
	timeout: 30_000,
	use: {
		baseURL: 'http://127.0.0.1:5173',
		trace: 'on-first-retry',
	},
	globalSetup: './tests/e2e/_setup/global-setup.ts',
	globalTeardown: './tests/e2e/_setup/global-teardown.ts',
	webServer: {
		command: 'pnpm dev',
		port: 5173,
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
		env: { BACKEND_PORT: '8001' },
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
})
