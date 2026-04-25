import { userSettingsSchema, type UserSettings } from '$lib/schemas'
import { getSettings, putSettings } from './db'

const DEFAULTS: UserSettings = userSettingsSchema.parse({})

function applyTheme(theme: UserSettings['theme']): void {
	if (typeof document === 'undefined') return
	if (theme === 'system') {
		const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
		document.documentElement.dataset.theme = dark ? 'dark' : 'light'
	} else {
		document.documentElement.dataset.theme = theme
	}
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
		if (typeof window === 'undefined') return
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

		async init() {
			if (initialized) return
			initialized = true
			const stored = await getSettings()
			value = stored ?? DEFAULTS
			applyTheme(value.theme)
			subscribeSystem()
		},

		async setTheme(theme: UserSettings['theme']) {
			value = { ...value, theme }
			applyTheme(theme)
			await persist()
		},

		async setSound(event: keyof UserSettings['sounds'], soundId: string) {
			value = { ...value, sounds: { ...value.sounds, [event]: soundId } }
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
