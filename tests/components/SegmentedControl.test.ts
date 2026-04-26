import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import SegmentedControl from '$lib/components/SegmentedControl.svelte'

const segments = [
	{ id: 'a', label: 'Alpha' },
	{ id: 'b', label: 'Bravo' },
	{ id: 'c', label: 'Charlie' },
]

describe('SegmentedControl', () => {
	it('test_renders_each_segment', () => {
		const { getByText } = render(SegmentedControl, {
			props: { segments, value: 'a', onchange: () => {} },
		})
		expect(getByText('Alpha')).toBeInTheDocument()
		expect(getByText('Bravo')).toBeInTheDocument()
		expect(getByText('Charlie')).toBeInTheDocument()
	})

	it('test_active_segment_carries_active_class', () => {
		const { getByText } = render(SegmentedControl, {
			props: { segments, value: 'b', onchange: () => {} },
		})
		const active = getByText('Bravo')
		const inactive = getByText('Alpha')
		expect(active.classList.contains('active')).toBe(true)
		expect(inactive.classList.contains('active')).toBe(false)
		expect(active.getAttribute('aria-selected')).toBe('true')
		expect(inactive.getAttribute('aria-selected')).toBe('false')
	})

	it('test_onchange_fires_on_segment_click', async () => {
		const onchange = vi.fn()
		const { getByText } = render(SegmentedControl, {
			props: { segments, value: 'a', onchange },
		})
		await fireEvent.click(getByText('Charlie'))
		expect(onchange).toHaveBeenCalledWith('c')
	})
})
