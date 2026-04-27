import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import MenuCard from '$lib/components/MenuCard.svelte'
import type { SavedPlan } from '$lib/models'

const sampleMenu: SavedPlan = {
	id: '11111111-1111-4111-8111-111111111111',
	name: 'Mörgeli-Plausch',
	createdAtEpoch: 1700000000000,
	lastUsedEpoch: 1700000000000,
	items: [
		{
			id: '22222222-2222-4222-8222-222222222222',
			categorySlug: 'beef',
			cutSlug: 'entrecote',
			thicknessCm: 3,
			prepLabel: null,
			doneness: 'Medium-rare',
			label: 'Steak A',
			cookSeconds: 360,
			restSeconds: 300,
			flipFraction: 0.5,
			idealFlipPattern: 'once',
			heatZone: 'Direct high',
			grateTempC: null,
		},
		{
			id: '33333333-3333-4333-8333-333333333333',
			categorySlug: 'beef',
			cutSlug: 'entrecote',
			thicknessCm: 3,
			prepLabel: null,
			doneness: 'Medium',
			label: 'Steak B',
			cookSeconds: 420,
			restSeconds: 300,
			flipFraction: 0.5,
			idealFlipPattern: 'once',
			heatZone: 'Direct high',
			grateTempC: null,
		},
	],
}

describe('MenuCard', () => {
	it('test_renders_name_and_meta', () => {
		const { getByText } = render(MenuCard, {
			props: { menu: sampleMenu, onload: () => {}, onrename: () => {}, ondelete: () => {} },
		})
		expect(getByText('Mörgeli-Plausch')).toBeTruthy()
		expect(getByText(/STÜCK/)).toBeTruthy()
		expect(getByText(/MIN/)).toBeTruthy()
	})

	it('test_tap_loads_menu', async () => {
		vi.useFakeTimers()
		const onload = vi.fn()
		const { getByText } = render(MenuCard, {
			props: { menu: sampleMenu, onload, onrename: () => {}, ondelete: () => {} },
		})
		const titleBtn = getByText('Mörgeli-Plausch')
		await fireEvent.mouseDown(titleBtn)
		// release before the long-press window so it counts as a tap
		await fireEvent.mouseUp(titleBtn)
		expect(onload).toHaveBeenCalledWith(sampleMenu.id)
		vi.useRealTimers()
	})

	it('test_inline_rename_commits_on_enter', async () => {
		vi.useFakeTimers()
		const onrename = vi.fn()
		const { getByText, container } = render(MenuCard, {
			props: { menu: sampleMenu, onload: () => {}, onrename, ondelete: () => {} },
		})
		const titleBtn = getByText('Mörgeli-Plausch')
		await fireEvent.mouseDown(titleBtn)
		vi.advanceTimersByTime(400)
		await Promise.resolve()
		vi.useRealTimers()
		const input = container.querySelector('input.rename-input') as HTMLInputElement | null
		expect(input).toBeTruthy()
		if (!input) return
		await fireEvent.input(input, { target: { value: 'New Name' } })
		await fireEvent.keyDown(input, { key: 'Enter' })
		expect(onrename).toHaveBeenCalledWith(sampleMenu.id, 'New Name')
	})

	it('test_inline_rename_cancel_on_escape_does_not_commit', async () => {
		vi.useFakeTimers()
		const onrename = vi.fn()
		const { getByText, container } = render(MenuCard, {
			props: { menu: sampleMenu, onload: () => {}, onrename, ondelete: () => {} },
		})
		await fireEvent.mouseDown(getByText('Mörgeli-Plausch'))
		vi.advanceTimersByTime(400)
		await Promise.resolve()
		vi.useRealTimers()
		const input = container.querySelector('input.rename-input') as HTMLInputElement
		await fireEvent.input(input, { target: { value: 'X' } })
		await fireEvent.keyDown(input, { key: 'Escape' })
		expect(onrename).not.toHaveBeenCalled()
	})

	it('test_swipe_left_reveals_delete_and_confirm_calls_ondelete', async () => {
		const ondelete = vi.fn()
		const { container } = render(MenuCard, {
			props: { menu: sampleMenu, onload: () => {}, onrename: () => {}, ondelete },
		})
		const card = container.querySelector('.card') as HTMLElement
		await fireEvent.touchStart(card, { touches: [{ clientX: 100, clientY: 0 }] })
		await fireEvent.touchMove(card, { touches: [{ clientX: 0, clientY: 0 }] })
		await fireEvent.touchEnd(card)
		const del = container.querySelector('.del') as HTMLButtonElement
		expect(del).toBeTruthy()
		await fireEvent.click(del)
		expect(ondelete).toHaveBeenCalledWith(sampleMenu.id)
	})

	it('test_swipe_then_cancel_dismisses_confirm', async () => {
		const ondelete = vi.fn()
		const { container } = render(MenuCard, {
			props: { menu: sampleMenu, onload: () => {}, onrename: () => {}, ondelete },
		})
		const card = container.querySelector('.card') as HTMLElement
		await fireEvent.touchStart(card, { touches: [{ clientX: 100, clientY: 0 }] })
		await fireEvent.touchMove(card, { touches: [{ clientX: 0, clientY: 0 }] })
		await fireEvent.touchEnd(card)
		await fireEvent.click(container.querySelector('.cancel')!)
		expect(container.querySelector('.del')).toBeNull()
		expect(ondelete).not.toHaveBeenCalled()
	})
})
