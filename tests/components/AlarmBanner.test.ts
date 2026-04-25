import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import AlarmBanner from '$lib/components/AlarmBanner.svelte'

describe('AlarmBanner', () => {
	it('test_renders_message', () => {
		const { getByText } = render(AlarmBanner, { props: { message: 'Steak auflegen', onDismiss: () => {} } })
		expect(getByText('Steak auflegen')).toBeInTheDocument()
	})

	it('test_auto_dismiss_after_8s', () => {
		vi.useFakeTimers()
		const onDismiss = vi.fn()
		render(AlarmBanner, { props: { message: 'Test', onDismiss } })
		vi.advanceTimersByTime(8000)
		expect(onDismiss).toHaveBeenCalled()
		vi.useRealTimers()
	})

	it('test_tap_dismisses', async () => {
		const onDismiss = vi.fn()
		const { getByLabelText } = render(AlarmBanner, { props: { message: 'Test', onDismiss } })
		await fireEvent.click(getByLabelText('Banner schliessen'))
		expect(onDismiss).toHaveBeenCalled()
	})
})
