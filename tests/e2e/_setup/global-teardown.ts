import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PID_FILE = resolve(HERE, '.backend.pid')

export default async function globalTeardown() {
	if (!existsSync(PID_FILE)) return
	const pid = Number(readFileSync(PID_FILE, 'utf8').trim())
	try {
		process.kill(pid, 'SIGTERM')
	} catch {
		/* already gone */
	}
	for (let i = 0; i < 30; i++) {
		try {
			process.kill(pid, 0)
		} catch {
			break
		}
		await new Promise(r => setTimeout(r, 100))
	}
	try {
		unlinkSync(PID_FILE)
	} catch {
		/* ignore */
	}
}
