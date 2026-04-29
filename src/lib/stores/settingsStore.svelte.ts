import {
	userSettingsSchema,
	TONE_IDS,
	ACCENT_IDS,
	DENSITY_IDS,
	type UserSettings,
	type ToneId,
	type AccentId,
	type DensityId,
} from '$lib/schemas'
import { getSettings, putSettings } from './db'
import { enqueueSync } from '$lib/sync/queue'

const DEFAULTS: UserSettings = userSettingsSchema.parse({})
const VALID_TONES = new Set<string>(TONE_IDS)
const VALID_ACCENTS = new Set<string>(ACCENT_IDS)
const VALID_DENSITIES = new Set<string>(DENSITY_IDS)

function applyTheme(theme: UserSettings['theme']): void {
	if (typeof document === 'undefined') return
	if (theme === 'system') {
		const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
		document.documentElement.dataset.theme = dark ? 'dark' : 'light'
	} else {
		document.documentElement.dataset.theme = theme
	}
}

function applyAccent(accent: AccentId): void {
	if (typeof document === 'undefined') return
	document.documentElement.dataset.accent = accent
}

function applyDensity(density: DensityId): void {
	if (typeof document === 'undefined') return
	document.documentElement.dataset.density = density
}

function applyRings(showProgressRings: boolean): void {
	if (typeof document === 'undefined') return
	document.documentElement.dataset.rings = showProgressRings ? 'on' : 'off'
}

function migrateSounds(stored: Record<string, unknown>): UserSettings['sounds'] {
	const fallback = DEFAULTS.sounds
	const out: Record<string, ToneId> = {}
	for (const key of ['putOn', 'flip', 'done'] as const) {
		const raw = stored[key]
		out[key] = typeof raw === 'string' && VALID_TONES.has(raw) ? (raw as ToneId) : fallback[key]
	}
	return out as UserSettings['sounds']
}

function createSettingsStore() {
	let value = $state<UserSettings>(DEFAULTS)
	let initialized = false
	let mediaListener: ((e: MediaQueryListEvent) => void) | null = null
	let media: MediaQueryList | null = null

	async function persist() {
		await putSettings(value)
		void enqueueSync({
			method: 'PUT',
			path: '/api/settings',
			body: JSON.stringify({ value }),
		})
	}

	function subscribeSystem() {
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
		if (mediaListener && media) {
			media.removeEventListener('change', mediaListener)
		}
		media = window.matchMedia('(prefers-color-scheme: dark)')
		mediaListener = () => {
			if (value.theme === 'system') applyTheme('system')
		}
		media.addEventListener('change', mediaListener)
	}

	return {
		get value() {
			return value
		},
		get theme() {
			return value.theme
		},
		get sounds() {
			return value.sounds
		},
		get firstRunSeen() {
			return value.firstRunSeen
		},
		get vibrate() {
			return value.vibrate
		},
		get accent() {
			return value.accent
		},
		get density() {
			return value.density
		},
		get showProgressRings() {
			return value.showProgressRings
		},

		async init() {
			if (initialized) return
			initialized = true
			const stored = (await getSettings()) as (UserSettings & { sounds?: Record<string, unknown> }) | null
			if (stored) {
				const accent = typeof stored.accent === 'string' && VALID_ACCENTS.has(stored.accent) ? (stored.accent as AccentId) : DEFAULTS.accent
				const density =
					typeof stored.density === 'string' && VALID_DENSITIES.has(stored.density) ? (stored.density as DensityId) : DEFAULTS.density
				const migrated: UserSettings = {
					theme: stored.theme ?? DEFAULTS.theme,
					sounds: migrateSounds((stored.sounds ?? {}) as Record<string, unknown>),
					firstRunSeen: stored.firstRunSeen ?? DEFAULTS.firstRunSeen,
					vibrate: typeof stored.vibrate === 'boolean' ? stored.vibrate : DEFAULTS.vibrate,
					accent,
					density,
					showProgressRings:
						typeof stored.showProgressRings === 'boolean' ? stored.showProgressRings : DEFAULTS.showProgressRings,
				}
				value = migrated
			} else {
				value = DEFAULTS
			}
			applyTheme(value.theme)
			applyAccent(value.accent)
			applyDensity(value.density)
			applyRings(value.showProgressRings)
			subscribeSystem()
		},

		async setTheme(theme: UserSettings['theme']) {
			value = { ...value, theme }
			applyTheme(theme)
			await persist()
		},

		async setSound(event: keyof UserSettings['sounds'], soundId: ToneId) {
			value = { ...value, sounds: { ...value.sounds, [event]: soundId } }
			await persist()
		},

		async setVibrate(on: boolean) {
			value = { ...value, vibrate: on }
			await persist()
		},

		async setAccent(accent: AccentId) {
			value = { ...value, accent }
			applyAccent(accent)
			await persist()
		},

		async setDensity(density: DensityId) {
			value = { ...value, density }
			applyDensity(density)
			await persist()
		},

		async setShowProgressRings(on: boolean) {
			value = { ...value, showProgressRings: on }
			applyRings(on)
			await persist()
		},

		async markFirstRunSeen() {
			value = { ...value, firstRunSeen: true }
			await persist()
		},

		// Test helper
		_reset() {
			value = DEFAULTS
			initialized = false
		},
	}
}

export const settingsStore = createSettingsStore()
