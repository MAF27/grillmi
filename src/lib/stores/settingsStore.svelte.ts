import { userSettingsSchema, TONE_IDS, type UserSettings, type ToneId } from '$lib/schemas'
import { getSettings, putSettings } from './db'

const DEFAULTS: UserSettings = userSettingsSchema.parse({})
const VALID_TONES = new Set<string>(TONE_IDS)

function applyTheme(theme: UserSettings['theme']): void {
	if (typeof document === 'undefined') return
	if (theme === 'system') {
		const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
		document.documentElement.dataset.theme = dark ? 'dark' : 'light'
	} else {
		document.documentElement.dataset.theme = theme
	}
}

// Migrate any persisted sound id outside the new five-tone set to the new
// default for that event. Existing users who had `chime-1..8` end up with the
// Glühen defaults on next launch; the next setSound() persists the migration.
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

		async init() {
			if (initialized) return
			initialized = true
			const stored = (await getSettings()) as (UserSettings & { sounds?: Record<string, unknown> }) | null
			if (stored) {
				const migrated: UserSettings = {
					theme: stored.theme ?? DEFAULTS.theme,
					sounds: migrateSounds((stored.sounds ?? {}) as Record<string, unknown>),
					firstRunSeen: stored.firstRunSeen ?? DEFAULTS.firstRunSeen,
					vibrate: typeof stored.vibrate === 'boolean' ? stored.vibrate : DEFAULTS.vibrate,
				}
				value = migrated
			} else {
				value = DEFAULTS
			}
			applyTheme(value.theme)
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
