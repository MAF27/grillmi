import { defineConfig, devices } from '@playwright/test'

const STORAGE_STATE = 'tests/e2e/_setup/.default-user-storage.json'
const ACCOUNTS_SPECS = ['**/auth.spec.ts', '**/sync.spec.ts', '**/account.spec.ts']

export default defineConfig({
	testDir: 'tests/e2e',
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
			name: 'setup',
			testMatch: /tests\/e2e\/_setup\/seed-default-user\.setup\.ts/,
			use: { ...devices['Desktop Chrome'] },
		},
		{
			name: 'legacy',
			use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
			testIgnore: [...ACCOUNTS_SPECS, '**/_setup/**', '**/_lib/**'],
			dependencies: ['setup'],
		},
		{
			name: 'accounts',
			testMatch: ACCOUNTS_SPECS,
			use: { ...devices['Desktop Chrome'] },
			dependencies: ['legacy'],
		},
	],
})
