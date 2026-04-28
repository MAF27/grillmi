import { spawn } from 'node:child_process'
import { existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../../..')
const BACKEND_DIR = resolve(REPO_ROOT, 'backend')
const PID_FILE = resolve(HERE, '.backend.pid')
const LOG_FILE = resolve(HERE, '.backend.log')
const HEALTH_URL = 'http://127.0.0.1:8001/api/health'
const BOOT_TIMEOUT_MS = 60_000

async function waitForHealth(): Promise<void> {
	const start = Date.now()
	while (Date.now() - start < BOOT_TIMEOUT_MS) {
		try {
			const r = await fetch(HEALTH_URL)
			if (r.ok) return
		} catch {
			/* not yet up */
		}
		await new Promise(r => setTimeout(r, 500))
	}
	throw new Error(`backend did not respond at ${HEALTH_URL} within ${BOOT_TIMEOUT_MS}ms`)
}

export default async function globalSetup() {
	if (existsSync(PID_FILE)) {
		const oldPid = Number(readFileSync(PID_FILE, 'utf8').trim())
		try {
			process.kill(oldPid, 'SIGTERM')
		} catch {
			/* already dead */
		}
		unlinkSync(PID_FILE)
	}

	const log = openSync(LOG_FILE, 'w')
	const child = spawn(
		'uv',
		['run', 'python', resolve(HERE, 'server.py')],
		{
			cwd: BACKEND_DIR,
			detached: true,
			stdio: ['ignore', log, log],
			env: { ...process.env, E2E_BACKEND_PORT: '8001' },
		}
	)
	child.unref()
	writeFileSync(PID_FILE, String(child.pid))

	try {
		await waitForHealth()
	} catch (e) {
		try {
			process.kill(child.pid!, 'SIGTERM')
		} catch {
			/* ignore */
		}
		const tail = readFileSync(LOG_FILE, 'utf8').slice(-2000)
		throw new Error(`${(e as Error).message}\n--- backend log tail ---\n${tail}`)
	}
}
