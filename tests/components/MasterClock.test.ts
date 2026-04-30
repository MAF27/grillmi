import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/svelte'
import MasterClock from '$lib/components/MasterClock.svelte'

describe('MasterClock', () => {
	it('test_renders_absolute_finish_time', () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-01-01T18:00:00Z'))
		const { getByTestId } = render(MasterClock, { props: { targetEpoch: new Date('2026-01-01T18:30:00Z').getTime() } })
		expect(getByTestId('master-clock-time').textContent).toMatch(/19:30/)
		vi.useRealTimers()
	})

	it('test_renders_eyebrow_label', () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-01-01T18:00:00Z'))
		const { getByText } = render(MasterClock, { props: { targetEpoch: Date.now() + 30 * 60 * 1000 } })
		expect(getByText('Fertig um')).toBeInTheDocument()
		vi.useRealTimers()
	})

	it('test_still_renders_absolute_time_when_target_passed', () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-01-01T18:00:00Z'))
		const { getByTestId } = render(MasterClock, { props: { targetEpoch: Date.now() - 5 * 60 * 1000 } })
		expect(getByTestId('master-clock-time').textContent).toMatch(/18:55/)
		vi.useRealTimers()
	})
})
