import { describe, expect, it } from 'vitest'
import { formatDuration, formatHHMM, formatRelative, isTomorrow } from '$lib/util/format'

describe('format', () => {
	it('test_formatHHMM_zero_pads_hour_and_minute', () => {
		const d = new Date(2026, 3, 26, 7, 5).getTime()
		expect(formatHHMM(d)).toBe('07:05')
	})

	it('test_formatDuration_under_one_hour_uses_mm_ss', () => {
		expect(formatDuration(0)).toBe('00:00')
		expect(formatDuration(59)).toBe('00:59')
		expect(formatDuration(60)).toBe('01:00')
		expect(formatDuration(3599)).toBe('59:59')
	})

	it('test_formatDuration_over_one_hour_uses_h_mm_ss', () => {
		expect(formatDuration(3600)).toBe('1:00:00')
		expect(formatDuration(3661)).toBe('1:01:01')
	})

	it('test_formatDuration_floors_negatives_to_zero', () => {
		expect(formatDuration(-30)).toBe('00:00')
	})

	it('test_formatRelative_handles_past_present_and_future', () => {
		const now = 1_000_000_000_000
		expect(formatRelative(now - 1000, now)).toBe('jetzt')
		expect(formatRelative(now + 30_000, now)).toBe('in 30 s')
		expect(formatRelative(now + 5 * 60_000, now)).toBe('in 5 min')
		expect(formatRelative(now + 90 * 60_000, now)).toBe('in 1 h 30 min')
	})

	it('test_isTomorrow_true_when_more_than_twelve_hours_out', () => {
		const now = new Date(2026, 3, 26, 12, 0).getTime()
		expect(isTomorrow(now + 13 * 3600_000, now)).toBe(true)
	})

	it('test_isTomorrow_false_when_within_twelve_hours_same_day', () => {
		const now = new Date(2026, 3, 26, 12, 0).getTime()
		expect(isTomorrow(now + 2 * 3600_000, now)).toBe(false)
	})

	it('test_isTomorrow_true_when_calendar_day_changes_even_if_close', () => {
		const now = new Date(2026, 3, 26, 23, 30).getTime()
		const target = new Date(2026, 3, 27, 0, 30).getTime()
		expect(isTomorrow(target, now)).toBe(true)
	})
})
