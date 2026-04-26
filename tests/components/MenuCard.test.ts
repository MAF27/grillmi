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
		// long-press flips the title into an input; let Svelte render it
		await Promise.resolve()
		vi.useRealTimers()
		const input = container.querySelector('input.rename-input') as HTMLInputElement | null
		expect(input).toBeTruthy()
		if (!input) return
		await fireEvent.input(input, { target: { value: 'New Name' } })
		await fireEvent.keyDown(input, { key: 'Enter' })
		expect(onrename).toHaveBeenCalledWith(sampleMenu.id, 'New Name')
	})
})
