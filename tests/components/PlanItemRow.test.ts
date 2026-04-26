import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'
import PlanItemRow from '$lib/components/PlanItemRow.svelte'
import type { PlannedItem } from '$lib/models'

function makeItem(over: Partial<PlannedItem> = {}): PlannedItem {
	return {
		id: '22222222-2222-4222-8222-222222222222',
		categorySlug: 'beef',
		cutSlug: 'rinds-entrecote-ribeye-steak-boneless',
		thicknessCm: 3,
		prepLabel: null,
		doneness: 'Medium-rare',
		label: 'Steak',
		cookSeconds: 360,
		restSeconds: 300,
		flipFraction: 0.5,
		idealFlipPattern: 'once',
		heatZone: 'Direct high',
		...over,
	}
}

function touchEvent(type: string, clientX: number) {
	const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & {
		touches: Array<{ clientX: number }>
		changedTouches: Array<{ clientX: number }>
	}
	const list = [{ clientX }]
	Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : list })
	Object.defineProperty(ev, 'changedTouches', { value: list })
	return ev
}

describe('PlanItemRow', () => {
	it('test_swipe_left_reveals_delete', async () => {
		const ondelete = vi.fn()
		const { container, getByLabelText } = render(PlanItemRow, {
			props: { item: makeItem(), onedit: () => {}, ondelete, onrename: () => {}, onadjustcook: () => {} },
		})

		const content = container.querySelector('.content') as HTMLElement
		expect(content).toBeTruthy()

		// Swipe left ~110 px past the 80 px threshold.
		await fireEvent(content, touchEvent('touchstart', 200))
		await fireEvent(content, touchEvent('touchmove', 90))
		await fireEvent(content, touchEvent('touchend', 90))
		await tick()

		const confirm = getByLabelText('Löschen bestätigen')
		expect(confirm).toBeInTheDocument()

		await fireEvent.click(confirm)
		expect(ondelete).toHaveBeenCalledWith(makeItem().id)
	})

	it('test_tap_opens_editor', async () => {
		const onedit = vi.fn()
		const { getByRole } = render(PlanItemRow, {
			props: { item: makeItem(), onedit, ondelete: () => {}, onrename: () => {}, onadjustcook: () => {} },
		})

		const editButton = getByRole('button', { name: /Spezifikation bearbeiten/ })
		await fireEvent.click(editButton)
		expect(onedit).toHaveBeenCalledWith(makeItem().id)
	})

	it('test_cook_adjust_emits_delta_and_clamps_to_min', async () => {
		const onadjustcook = vi.fn()
		const { getByLabelText } = render(PlanItemRow, {
			props: {
				item: makeItem({ cookSeconds: 60 }),
				onedit: () => {},
				ondelete: () => {},
				onrename: () => {},
				onadjustcook,
			},
		})

		// "+" emits a +30 delta.
		await fireEvent.click(getByLabelText('Mehr'))
		expect(onadjustcook).toHaveBeenLastCalledWith(makeItem().id, 30)

		// "−" at 60s emits a -30 delta (clamped to 30s floor).
		await fireEvent.click(getByLabelText('Weniger'))
		expect(onadjustcook).toHaveBeenLastCalledWith(makeItem().id, -30)
	})
})
