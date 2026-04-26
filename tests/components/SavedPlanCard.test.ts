import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import SavedPlanCard from '$lib/components/SavedPlanCard.svelte'
import type { SavedPlan } from '$lib/models'

const samplePlan: SavedPlan = {
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

describe('SavedPlanCard', () => {
	it('test_renders_name_and_item_count', () => {
		const { getByText } = render(SavedPlanCard, {
			props: { savedPlan: samplePlan, onload: () => {}, onlongpress: () => {} },
		})
		expect(getByText('Mörgeli-Plausch')).toBeTruthy()
		expect(getByText('2')).toBeTruthy()
	})

	it('test_long_press_opens_action_sheet', async () => {
		vi.useFakeTimers()
		const onlongpress = vi.fn()
		const { container } = render(SavedPlanCard, {
			props: { savedPlan: samplePlan, onload: () => {}, onlongpress },
		})
		const btn = container.querySelector('button')!
		await fireEvent.pointerDown(btn)
		vi.advanceTimersByTime(600)
		expect(onlongpress).toHaveBeenCalledWith(samplePlan.id)
		vi.useRealTimers()
	})
})
