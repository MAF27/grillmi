type WakeLockState = 'idle' | 'held' | 'denied' | 'unsupported'

interface MinimalWakeLockSentinel {
	released: boolean
	addEventListener(type: 'release', cb: () => void): void
	release(): Promise<void>
}

interface WakeLockApi {
	request(type: 'screen'): Promise<MinimalWakeLockSentinel>
}

let sentinel: MinimalWakeLockSentinel | null = null
let state: WakeLockState = 'idle'
const listeners = new Set<(s: WakeLockState) => void>()

function set(s: WakeLockState) {
	state = s
	for (const l of listeners) l(s)
}

export async function requestWakeLock(): Promise<WakeLockState> {
	if (typeof navigator === 'undefined') {
		set('unsupported')
		return state
	}
	const wakeLock = (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock
	if (!wakeLock) {
		set('unsupported')
		return state
	}
	try {
		sentinel = await wakeLock.request('screen')
		set('held')
		sentinel.addEventListener('release', () => {
			sentinel = null
			if (state === 'held') set('idle')
		})
	} catch {
		set('denied')
	}
	return state
}

export async function releaseWakeLock(): Promise<void> {
	if (sentinel && !sentinel.released) {
		try {
			await sentinel.release()
		} catch {
			// best effort
		}
	}
	sentinel = null
	if (state !== 'unsupported' && state !== 'denied') set('idle')
}

export function getWakeLockState(): WakeLockState {
	return state
}

export function onWakeLockChange(cb: (s: WakeLockState) => void): () => void {
	listeners.add(cb)
	return () => listeners.delete(cb)
}
