import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { settingsStore } from '$lib/stores/settingsStore.svelte'
import { __resetForTests } from '$lib/stores/db'

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

	it('test_sound_assignment_persists', async () => {
		await settingsStore.setSound('flip', 'chime-7')
		expect(settingsStore.sounds.flip).toBe('chime-7')
	})

	it('test_first_run_flag_persists', async () => {
		expect(settingsStore.firstRunSeen).toBe(false)
		await settingsStore.markFirstRunSeen()
		expect(settingsStore.firstRunSeen).toBe(true)
	})
})
