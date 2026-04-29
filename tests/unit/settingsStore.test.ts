import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { settingsStore } from '$lib/stores/settingsStore.svelte'
import { __resetForTests, putSettings } from '$lib/stores/db'

beforeEach(() => {
	settingsStore._reset()
	__resetForTests()
	;(globalThis as unknown as { indexedDB: unknown }).indexedDB = new IDBFactory()
})

describe('settingsStore', () => {
	it('test_theme_persists', async () => {
		await settingsStore.setTheme('dark')
		expect(settingsStore.theme).toBe('dark')
	})

	it('test_save_new_tone_value_persists', async () => {
		await settingsStore.setSound('flip', 'kohle')
		expect(settingsStore.sounds.flip).toBe('kohle')
	})

	it('test_first_run_flag_persists', async () => {
		expect(settingsStore.firstRunSeen).toBe(false)
		await settingsStore.markFirstRunSeen()
		expect(settingsStore.firstRunSeen).toBe(true)
	})

	it('test_legacy_chime_value_falls_back_to_new_default', async () => {
		// Seed IDB with the legacy `chime-1` value before the store reads it.
		await putSettings({
			theme: 'dark',
			sounds: { putOn: 'chime-1', flip: 'chime-2', done: 'chime-3' } as never,
			firstRunSeen: false,
			vibrate: true,
			accent: 'ember',
			density: 'comfortable',
			showProgressRings: true,
		})
		settingsStore._reset()
		await settingsStore.init()
		expect(settingsStore.sounds.putOn).toBe('glut')
		expect(settingsStore.sounds.flip).toBe('funke')
		expect(settingsStore.sounds.done).toBe('klassik')
	})

	it('test_vibrate_toggle_persists', async () => {
		expect(settingsStore.vibrate).toBe(true)
		await settingsStore.setVibrate(false)
		expect(settingsStore.vibrate).toBe(false)
	})
})
