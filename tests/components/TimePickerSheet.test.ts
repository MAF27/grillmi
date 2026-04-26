import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import TimePickerSheet from '$lib/components/TimePickerSheet.svelte'

function valueAt(h: number, m: number) {
	const d = new Date()
	d.setHours(h, m, 0, 0)
	return d.getTime()
}

describe('TimePickerSheet', () => {
	it('test_initial_value_marks_selected_rows', () => {
		const { container } = render(TimePickerSheet, {
			props: { value: valueAt(19, 30), oncommit: () => {}, oncancel: () => {} },
		})
		const selected = Array.from(container.querySelectorAll('.row.selected'))
		const text = selected.map(el => el.textContent?.trim()).filter(Boolean)
		expect(text).toContain('19')
		expect(text).toContain('30')
	})

	it('test_commit_returns_picked_date', async () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-04-26T12:00:00'))
		const oncommit = vi.fn()
		const { getByText } = render(TimePickerSheet, {
			props: { value: valueAt(18, 0), oncommit, oncancel: () => {} },
		})
		await fireEvent.click(getByText('Übernehmen'))
		expect(oncommit).toHaveBeenCalledTimes(1)
		const epoch = oncommit.mock.calls[0][0] as number
		const picked = new Date(epoch)
		expect(picked.getHours()).toBe(18)
		expect(picked.getMinutes()).toBe(0)
		vi.useRealTimers()
	})

	it('test_cancel_does_not_emit_commit', async () => {
		const oncommit = vi.fn()
		const oncancel = vi.fn()
		const { getByText } = render(TimePickerSheet, {
			props: { value: valueAt(20, 15), oncommit, oncancel },
		})
		await fireEvent.click(getByText('Abbrechen'))
		expect(oncommit).not.toHaveBeenCalled()
		expect(oncancel).toHaveBeenCalledTimes(1)
	})
})
