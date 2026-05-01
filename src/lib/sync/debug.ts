const KEY = 'grillmiSyncDebug'
const MAX_EVENTS = 200

export interface SyncDebugEvent {
	at: string
	source: string
	event: string
	data?: unknown
}

export function debugSync(source: string, event: string, data?: unknown): void {
	if (typeof window === 'undefined') return
	const row: SyncDebugEvent = {
		at: new Date().toISOString(),
		source,
		event,
		data: sanitize(data),
	}
	if (window.localStorage) {
		const rows = getSyncDebugEvents()
		rows.unshift(row)
		window.localStorage.setItem(KEY, JSON.stringify(rows.slice(0, MAX_EVENTS)))
	}
	console.info('[sync]', source, event, row.data ?? '')
}

export function getSyncDebugEvents(): SyncDebugEvent[] {
	if (typeof window === 'undefined' || !window.localStorage) return []
	try {
		const raw = window.localStorage.getItem(KEY)
		return raw ? (JSON.parse(raw) as SyncDebugEvent[]) : []
	} catch {
		return []
	}
}

export function clearSyncDebugEvents(): void {
	if (typeof window === 'undefined') return
	window.localStorage.removeItem(KEY)
}

function sanitize(value: unknown): unknown {
	if (value === undefined) return undefined
	try {
		return JSON.parse(JSON.stringify(value))
	} catch {
		return String(value)
	}
}
