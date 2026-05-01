/**
 * Web Audio API-based playback. Lazily decodes each sound on first use,
 * caches the decoded buffer in-memory for subsequent plays. No-op in SSR.
 */

import { debugSync } from '$lib/sync/debug'

let ctx: AudioContext | null = null
const buffers = new Map<string, AudioBuffer>()

function getContext(): AudioContext | null {
	if (typeof window === 'undefined') {
		debugSync('audio', 'context unavailable: ssr')
		return null
	}
	if (ctx) return ctx
	const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
	if (!Ctor) {
		debugSync('audio', 'context unavailable: unsupported')
		return null
	}
	ctx = new Ctor()
	debugSync('audio', 'context created', { state: ctx.state })
	return ctx
}

async function load(soundId: string): Promise<AudioBuffer | null> {
	const cached = buffers.get(soundId)
	if (cached) {
		debugSync('audio', 'buffer cache hit', { soundId })
		return cached
	}
	const c = getContext()
	if (!c) return null
	const res = await fetch(`/sounds/${soundId}.mp3`)
	debugSync('audio', 'sound fetch response', { soundId, status: res.status })
	if (!res.ok) return null
	const data = await res.arrayBuffer()
	const buf = await c.decodeAudioData(data)
	buffers.set(soundId, buf)
	debugSync('audio', 'sound decoded', { soundId, duration: buf.duration })
	return buf
}

export async function play(soundId: string): Promise<void> {
	if (soundId === 'lautlos') {
		debugSync('audio', 'play skipped: silent sound', { soundId })
		return
	}
	const c = getContext()
	const buf = await load(soundId)
	if (!c || !buf) {
		debugSync('audio', 'play skipped: missing context or buffer', { soundId, hasContext: Boolean(c), hasBuffer: Boolean(buf) })
		return
	}
	if (c.state === 'suspended') {
		debugSync('audio', 'resume before play', { soundId })
		await c.resume()
	}
	const src = c.createBufferSource()
	src.buffer = buf
	src.connect(c.destination)
	src.start(0)
	debugSync('audio', 'play started', { soundId, state: c.state })
}

export async function preload(soundIds: string[]): Promise<void> {
	await Promise.all(soundIds.filter(id => id !== 'lautlos').map(id => load(id).catch(() => null)))
}

export async function unlockAudio(): Promise<void> {
	const c = getContext()
	if (!c || c.state !== 'suspended') {
		debugSync('audio', 'unlock skipped', { hasContext: Boolean(c), state: c?.state ?? null })
		return
	}
	await c.resume()
	debugSync('audio', 'unlock resumed', { state: c.state })
}

export function getAudioDebugState(): { hasContext: boolean; state: string | null; cachedSounds: string[] } {
	return {
		hasContext: Boolean(ctx),
		state: ctx?.state ?? null,
		cachedSounds: [...buffers.keys()],
	}
}
