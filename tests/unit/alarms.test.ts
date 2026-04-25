import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireHaptic } from '$lib/runtime/alarms'

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
