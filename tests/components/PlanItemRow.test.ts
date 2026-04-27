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
		grateTempC: null,
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

		await fireEvent.click(getByLabelText('Mehr'))
		expect(onadjustcook).toHaveBeenLastCalledWith(makeItem().id, 30)

		await fireEvent.click(getByLabelText('Weniger'))
		expect(onadjustcook).toHaveBeenLastCalledWith(makeItem().id, -30)
	})

	it('test_cook_minus_disabled_at_floor', () => {
		const { getByLabelText } = render(PlanItemRow, {
			props: {
				item: makeItem({ cookSeconds: 30 }),
				onedit: () => {},
				ondelete: () => {},
				onrename: () => {},
				onadjustcook: () => {},
			},
		})
		expect((getByLabelText('Weniger') as HTMLButtonElement).disabled).toBe(true)
	})

	it('test_inline_rename_commits_on_enter_and_cancels_on_escape', async () => {
		const onrename = vi.fn()
		const { getByLabelText, container } = render(PlanItemRow, {
			props: {
				item: makeItem(),
				onedit: () => {},
				ondelete: () => {},
				onrename,
				onadjustcook: () => {},
			},
		})

		await fireEvent.click(getByLabelText('Bezeichnung umbenennen'))
		const input = container.querySelector('input.rename-input') as HTMLInputElement
		expect(input).toBeTruthy()
		await fireEvent.input(input, { target: { value: 'Renamed' } })
		await fireEvent.keyDown(input, { key: 'Enter' })
		expect(onrename).toHaveBeenCalledWith(makeItem().id, 'Renamed')

		await fireEvent.click(getByLabelText('Bezeichnung umbenennen'))
		const input2 = container.querySelector('input.rename-input') as HTMLInputElement
		await fireEvent.input(input2, { target: { value: 'Discarded' } })
		await fireEvent.keyDown(input2, { key: 'Escape' })
		expect(onrename).toHaveBeenCalledTimes(1)
	})

	it('test_remove_button_calls_ondelete', async () => {
		const ondelete = vi.fn()
		const { getByLabelText } = render(PlanItemRow, {
			props: { item: makeItem(), onedit: () => {}, ondelete, onrename: () => {}, onadjustcook: () => {} },
		})
		await fireEvent.click(getByLabelText('Entfernen'))
		expect(ondelete).toHaveBeenCalledWith(makeItem().id)
	})

	it('test_swipe_then_cancel_closes_confirm_overlay', async () => {
		const { container } = render(PlanItemRow, {
			props: { item: makeItem(), onedit: () => {}, ondelete: () => {}, onrename: () => {}, onadjustcook: () => {} },
		})
		const content = container.querySelector('.content') as HTMLElement
		await fireEvent(content, touchEvent('touchstart', 200))
		await fireEvent(content, touchEvent('touchmove', 90))
		await fireEvent(content, touchEvent('touchend', 90))
		await tick()
		await fireEvent.click(container.querySelector('.cancel')!)
		expect(container.querySelector('.del')).toBeNull()
	})
})
