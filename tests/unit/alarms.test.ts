import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { alarmSoundFor, fireAlarm, fireHaptic, messageFor } from '$lib/runtime/alarms'
import { settingsStore } from '$lib/stores/settingsStore.svelte'
import * as player from '$lib/sounds/player'
import { __resetForTests } from '$lib/stores/db'

describe('alarms haptic', () => {
	const original = (navigator as Navigator & { vibrate?: unknown }).vibrate
	afterEach(() => {
		Object.defineProperty(navigator, 'vibrate', {
			value: original,
			configurable: true,
			writable: true,
		})
	})

	it('test_navigator_vibrate_called_when_available', () => {
		const spy = vi.fn()
		Object.defineProperty(navigator, 'vibrate', {
			value: spy,
			configurable: true,
			writable: true,
		})
		fireHaptic()
		expect(spy).toHaveBeenCalledWith([200])
	})

	it('test_navigator_vibrate_no_op_when_unsupported', () => {
		Object.defineProperty(navigator, 'vibrate', {
			value: undefined,
			configurable: true,
			writable: true,
		})
		expect(() => fireHaptic()).not.toThrow()
	})
})

describe('alarms message + sound mapping', () => {
	beforeEach(() => {
		__resetForTests()
		settingsStore._reset()
		;(globalThis as unknown as { indexedDB: unknown }).indexedDB = new IDBFactory()
	})

	it('test_messageFor_uses_german_per_event', () => {
		expect(messageFor('put-on', 'Steak')).toBe('Steak jetzt auflegen')
		expect(messageFor('flip', 'Cervelat')).toBe('Cervelat: jetzt wenden')
		expect(messageFor('done', 'Mais')).toBe('Mais ist fertig')
	})

	it('test_alarmSoundFor_picks_event_specific_tone_from_settings', async () => {
		await settingsStore.init()
		await settingsStore.setSound('putOn', 'kohle')
		await settingsStore.setSound('flip', 'klassik')
		await settingsStore.setSound('done', 'glut')
		expect(alarmSoundFor('put-on')).toBe('kohle')
		expect(alarmSoundFor('flip')).toBe('klassik')
		expect(alarmSoundFor('done')).toBe('glut')
	})

	it('test_fireAlarm_invokes_player_and_haptic', async () => {
		await settingsStore.init()
		const playSpy = vi.spyOn(player, 'play').mockResolvedValue(undefined)
		const vib = vi.fn()
		Object.defineProperty(navigator, 'vibrate', { value: vib, configurable: true, writable: true })
		await fireAlarm('flip')
		expect(playSpy).toHaveBeenCalledWith(settingsStore.sounds.flip)
		expect(vib).toHaveBeenCalled()
		playSpy.mockRestore()
	})

	it('test_fireAlarm_swallows_player_errors', async () => {
		await settingsStore.init()
		const playSpy = vi.spyOn(player, 'play').mockRejectedValue(new Error('audio blocked'))
		await expect(fireAlarm('flip')).resolves.toBeUndefined()
		playSpy.mockRestore()
	})
})
