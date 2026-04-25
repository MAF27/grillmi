#!/usr/bin/env tsx
/**
 * Captures Grillmi screens at iPhone-13 viewport for the Claude Design brief.
 * Run via `pnpm exec tsx scripts/capture-screenshots.ts` while a preview server
 * is running on localhost:4173. Output goes to resources/docs/screenshots/.
 */

import { chromium, devices } from '@playwright/test'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const OUT = resolve(__dirname, '..', 'resources/docs/screenshots')
mkdirSync(OUT, { recursive: true })

async function main() {
	const browser = await chromium.launch()
	const ctx = await browser.newContext({
		...devices['iPhone 13'],
		colorScheme: 'dark',
		// Force a clean state every time so screenshots aren't poisoned by
		// previous runs.
		storageState: undefined,
	})
	const page = await ctx.newPage()

	async function dismissFirstRun() {
		const verstanden = page.getByRole('button', { name: 'Verstanden' })
		if (await verstanden.isVisible().catch(() => false)) {
			await verstanden.click()
			await page.waitForTimeout(150)
		}
	}

	async function shot(name: string, path: string, prep?: () => Promise<void>) {
		await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
		await dismissFirstRun()
		if (prep) await prep()
		await page.waitForTimeout(400)
		const file = resolve(OUT, `${name}.png`)
		await page.screenshot({ path: file, fullPage: false })
		console.log('saved', name)
	}

	// Home
	await shot('01-home', '/')

	// Plan empty
	await shot('02-plan-empty', '/plan', async () => {
		await page.evaluate(() => indexedDB.deleteDatabase('grillmi-db')).catch(() => {})
		await page.reload({ waitUntil: 'networkidle' })
	})

	// Plan with AddItemSheet open at category step
	await shot('03-additem-category', '/plan', async () => {
		await page.getByRole('button', { name: /\+ Gericht/ }).click()
		await page.waitForTimeout(300)
	})

	// AddItemSheet at cut step (Rind)
	await shot('04-additem-cut', '/plan', async () => {
		await page.getByRole('button', { name: /\+ Gericht/ }).click()
		await page.waitForTimeout(200)
		await page.getByRole('button', { name: 'Rind' }).click()
		await page.waitForTimeout(300)
	})

	// AddItemSheet at specs (Entrecôte — has thickness + doneness)
	await shot('05-additem-specs', '/plan', async () => {
		await page.getByRole('button', { name: /\+ Gericht/ }).click()
		await page.waitForTimeout(200)
		await page.getByRole('button', { name: 'Rind' }).click()
		await page.waitForTimeout(200)
		await page.getByRole('button', { name: /Rinds-Entrec/ }).click()
		await page.waitForTimeout(300)
	})

	// Plan with three items committed (different shapes)
	await shot('06-plan-with-items', '/plan', async () => {
		// Item 1: Rind > Entrecôte (thickness + doneness)
		await page.getByRole('button', { name: /\+ Gericht/ }).click()
		await page.waitForTimeout(150)
		await page.getByRole('button', { name: 'Rind' }).click()
		await page.waitForTimeout(150)
		await page.getByRole('button', { name: /Rinds-Entrec/ }).click()
		await page.waitForTimeout(200)
		await page.getByRole('button', { name: 'Übernehmen' }).click()
		await page.waitForTimeout(200)

		// Item 2: Wurst > Bauernbratwurst (no choices, commits immediately)
		await page.getByRole('button', { name: /\+ Gericht/ }).click()
		await page.waitForTimeout(150)
		await page.getByRole('button', { name: 'Wurst' }).click()
		await page.waitForTimeout(150)
		await page.getByRole('button', { name: 'Bauernbratwurst' }).click()
		await page.waitForTimeout(200)

		// Item 3: Gemüse > Mais (prep variants)
		await page.getByRole('button', { name: /\+ Gericht/ }).click()
		await page.waitForTimeout(150)
		await page.getByRole('button', { name: 'Gemüse' }).click()
		await page.waitForTimeout(150)
		await page.getByRole('button', { name: /Maiskolben/ }).click()
		await page.waitForTimeout(200)
		const submit = page.getByRole('button', { name: 'Übernehmen' })
		if (await submit.isVisible().catch(() => false)) {
			await submit.click()
			await page.waitForTimeout(200)
		}
	})

	// Favorites empty
	await shot('07-favorites', '/favorites')

	// Settings
	await shot('08-settings', '/settings')

	// Session — build a plan with one item, then start it
	await shot('09-session', '/plan', async () => {
		await page.getByRole('button', { name: /\+ Gericht/ }).click()
		await page.waitForTimeout(150)
		await page.getByRole('button', { name: 'Wurst' }).click()
		await page.waitForTimeout(150)
		await page.getByRole('button', { name: 'Bauernbratwurst' }).click()
		await page.waitForTimeout(200)
		await page.getByRole('button', { name: /Los —/ }).click()
		await page.waitForURL('**/session', { timeout: 5000 })
		await page.waitForTimeout(800)
	})

	await browser.close()
}

main().catch(err => {
	console.error(err)
	process.exit(1)
})
