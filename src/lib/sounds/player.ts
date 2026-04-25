/**
 * Web Audio API-based playback. Lazily decodes each sound on first use,
 * caches the decoded buffer in-memory for subsequent plays. No-op in SSR.
 */

let ctx: AudioContext | null = null
const buffers = new Map<string, AudioBuffer>()

function getContext(): AudioContext | null {
	if (typeof window === 'undefined') return null
	if (ctx) return ctx
	const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
	if (!Ctor) return null
	ctx = new Ctor()
	return ctx
}

async function load(soundId: string): Promise<AudioBuffer | null> {
	const cached = buffers.get(soundId)
	if (cached) return cached
	const c = getContext()
	if (!c) return null
	const res = await fetch(`/sounds/${soundId}.mp3`)
	if (!res.ok) return null
	const data = await res.arrayBuffer()
	const buf = await c.decodeAudioData(data)
	buffers.set(soundId, buf)
	return buf
}

export async function play(soundId: string): Promise<void> {
	const c = getContext()
	const buf = await load(soundId)
	if (!c || !buf) return
	if (c.state === 'suspended') await c.resume()
	const src = c.createBufferSource()
	src.buffer = buf
	src.connect(c.destination)
	src.start(0)
}

export async function preload(soundIds: string[]): Promise<void> {
	await Promise.all(soundIds.map(id => load(id).catch(() => null)))
}
