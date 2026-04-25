import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/svelte'
import MasterClock from '$lib/components/MasterClock.svelte'

describe('MasterClock', () => {
	it('test_renders_time_remaining_monospace', () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-01-01T18:00:00Z'))
		const { getByTestId } = render(MasterClock, { props: { targetEpoch: Date.now() + 30 * 60 * 1000 } })
		expect(getByTestId('master-clock-time').textContent).toMatch(/30:00/)
		vi.useRealTimers()
	})

	it('test_warning_state_below_15_min', () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-01-01T18:00:00Z'))
		const { container } = render(MasterClock, { props: { targetEpoch: Date.now() + 10 * 60 * 1000 } })
		expect(container.querySelector('.clock')?.classList.contains('warning')).toBe(true)
		vi.useRealTimers()
	})

	it('test_critical_state_below_5_min', () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-01-01T18:00:00Z'))
		const { container } = render(MasterClock, { props: { targetEpoch: Date.now() + 3 * 60 * 1000 } })
		expect(container.querySelector('.clock')?.classList.contains('critical')).toBe(true)
		vi.useRealTimers()
	})
})
