import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import SessionHeader from '$lib/components/SessionHeader.svelte'

describe('SessionHeader', () => {
	it('test_renders_eat_time_in_auto_mode', () => {
		const { container } = render(SessionHeader, {
			props: {
				targetEpoch: new Date(2026, 3, 26, 19, 5).getTime(),
				wakeLockState: 'held',
				planMode: 'auto',
				placement: 'desktop',
				onEnd: () => {},
			},
		})
		expect(container.querySelector('.badge-eyebrow')?.textContent?.trim()).toBe('Essen um')
		expect(container.querySelector('.badge-value')?.textContent?.trim()).toBe('19:05')
	})

	it('test_renders_manual_badge_in_manual_mode', () => {
		const { container } = render(SessionHeader, {
			props: {
				targetEpoch: 0,
				wakeLockState: 'held',
				planMode: 'manual',
				onEnd: () => {},
			},
		})
		expect(container.querySelector('.badge-eyebrow')?.textContent?.trim()).toBe('Modus')
		expect(container.querySelector('.badge-value.manual')?.textContent?.trim()).toBe('Manuell')
	})

	it('test_wake_lock_state_renders_corresponding_label', () => {
		const states: Array<{ s: 'idle' | 'held' | 'denied' | 'unsupported'; label: string }> = [
			{ s: 'held', label: 'Aktiv' },
			{ s: 'idle', label: 'Idle' },
			{ s: 'denied', label: 'Verweigert' },
			{ s: 'unsupported', label: 'N/A' },
		]
		for (const { s, label } of states) {
			const { container, unmount } = render(SessionHeader, {
				props: { targetEpoch: 0, wakeLockState: s, planMode: 'auto', onEnd: () => {} },
			})
			expect(container.querySelector('.wake-text')?.textContent?.trim()).toBe(label)
			unmount()
		}
	})

	it('test_end_button_opens_confirm_dialog_then_calls_onEnd', async () => {
		const onEnd = vi.fn()
		const { container, getByText } = render(SessionHeader, {
			props: { targetEpoch: 0, wakeLockState: 'idle', planMode: 'auto', onEnd },
		})
		await fireEvent.click(getByText('Beenden'))
		const dialog = container.querySelector('[role="dialog"]')
		expect(dialog).toBeTruthy()
		const confirmBtn = dialog!.querySelector('.confirm-end') as HTMLButtonElement
		await fireEvent.click(confirmBtn)
		expect(onEnd).toHaveBeenCalledTimes(1)
	})

	it('test_end_button_cancel_closes_dialog_without_calling_onEnd', async () => {
		const onEnd = vi.fn()
		const { container, getByText } = render(SessionHeader, {
			props: { targetEpoch: 0, wakeLockState: 'idle', planMode: 'auto', onEnd },
		})
		await fireEvent.click(getByText('Beenden'))
		await fireEvent.click(container.querySelector('.cancel')!)
		expect(container.querySelector('[role="dialog"]')).toBeNull()
		expect(onEnd).not.toHaveBeenCalled()
	})
})
