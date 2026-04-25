import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import AddItemSheet from '$lib/components/AddItemSheet.svelte'
import type { PlannedItem } from '$lib/models'

function open(oncommit: (item: Omit<PlannedItem, 'id'>) => void = () => {}, onclose: () => void = () => {}) {
	return render(AddItemSheet, { props: { open: true, initial: null, onclose, oncommit } })
}

describe('AddItemSheet', () => {
	it('test_cascading_steps_advance_on_tap', async () => {
		const { getByText, container } = open()

		// Step 1: category grid is shown.
		expect(container.querySelector('h2')?.textContent).toBe('Kategorie')

		// Tap "Rind" → step advances to cut list.
		await fireEvent.click(getByText('Rind'))
		expect(container.querySelector('h2')?.textContent).toBe('Stück')

		// Tap "Rinds-Entrecôte" → step advances to specs (has thickness + doneness).
		await fireEvent.click(getByText('Rinds-Entrecôte'))
		const heading = container.querySelector('h2')?.textContent
		expect(heading).toBeTruthy()
		expect(/Dicke|Garstufe|Anpassen/.test(heading!)).toBe(true)
	})

	it('test_back_chevron_returns_to_previous_step', async () => {
		const { getByText, getByLabelText, container } = open()

		await fireEvent.click(getByText('Rind'))
		expect(container.querySelector('h2')?.textContent).toBe('Stück')

		await fireEvent.click(getByText('Rinds-Entrecôte'))
		expect(container.querySelector('h2')?.textContent).not.toBe('Stück')

		// Back from specs returns to cut list.
		await fireEvent.click(getByLabelText('Zurück'))
		expect(container.querySelector('h2')?.textContent).toBe('Stück')

		// Back from cut returns to categories.
		await fireEvent.click(getByLabelText('Zurück'))
		expect(container.querySelector('h2')?.textContent).toBe('Kategorie')
	})

	it('test_thickness_stepper_clamps_to_min_max', async () => {
		const { getByText, getByLabelText } = open()

		await fireEvent.click(getByText('Rind'))
		await fireEvent.click(getByText('Rinds-Entrecôte'))

		const dec = getByLabelText('Dünner') as HTMLButtonElement
		const inc = getByLabelText('Dicker') as HTMLButtonElement

		// Click "thicker" until disabled — the stepper must clamp at the documented max.
		let safety = 50
		while (!inc.disabled && safety-- > 0) {
			await fireEvent.click(inc)
		}
		expect(inc.disabled).toBe(true)
		expect(dec.disabled).toBe(false)

		// Click "thinner" all the way down — the stepper must clamp at the floor (1.5 cm).
		safety = 50
		while (!dec.disabled && safety-- > 0) {
			await fireEvent.click(dec)
		}
		expect(dec.disabled).toBe(true)
		expect(inc.disabled).toBe(false)
	})

	it('test_final_step_dispatches_new_item_with_computed_cook_time', async () => {
		const oncommit = vi.fn()
		const { getByText } = open(oncommit)

		await fireEvent.click(getByText('Rind'))
		await fireEvent.click(getByText('Rinds-Entrecôte'))
		await fireEvent.click(getByText('Übernehmen'))

		expect(oncommit).toHaveBeenCalledTimes(1)
		const arg = oncommit.mock.calls[0][0] as Omit<PlannedItem, 'id'>
		expect(arg.categorySlug).toBe('beef')
		expect(arg.cutSlug).toBe('rinds-entrecote-ribeye-steak-boneless')
		expect(arg.thicknessCm).toBeGreaterThan(0)
		expect(arg.doneness).toBe('Medium-rare')
		expect(arg.cookSeconds).toBeGreaterThan(0)
		expect(arg.restSeconds).toBeGreaterThanOrEqual(0)
		expect(arg.label).toContain('Rinds-Entrecôte')
	})
})
