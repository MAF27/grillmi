import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import { createRawSnippet } from 'svelte'
import HoldButton from '$lib/components/HoldButton.svelte'

const Label = (text: string) =>
	createRawSnippet(() => ({ render: () => `<span>${text}</span>` }))

describe('HoldButton', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	it('test_pointerdown_then_full_hold_invokes_onConfirm', async () => {
		const onConfirm = vi.fn()
		const { getByRole } = render(HoldButton, { props: { holdMs: 200, onConfirm, children: Label('Hold') } })
		const btn = getByRole('button')
		await fireEvent.pointerDown(btn)
		vi.advanceTimersByTime(220)
		expect(onConfirm).toHaveBeenCalledTimes(1)
	})

	it('test_pointerup_before_hold_completes_cancels', async () => {
		const onConfirm = vi.fn()
		const { getByRole } = render(HoldButton, { props: { holdMs: 500, onConfirm, children: Label('Hold') } })
		const btn = getByRole('button')
		await fireEvent.pointerDown(btn)
		vi.advanceTimersByTime(100)
		await fireEvent.pointerUp(btn)
		vi.advanceTimersByTime(500)
		expect(onConfirm).not.toHaveBeenCalled()
	})

	it('test_pointerleave_cancels', async () => {
		const onConfirm = vi.fn()
		const { getByRole } = render(HoldButton, { props: { holdMs: 500, onConfirm, children: Label('Hold') } })
		const btn = getByRole('button')
		await fireEvent.pointerDown(btn)
		vi.advanceTimersByTime(100)
		await fireEvent.pointerLeave(btn)
		vi.advanceTimersByTime(500)
		expect(onConfirm).not.toHaveBeenCalled()
	})
})
