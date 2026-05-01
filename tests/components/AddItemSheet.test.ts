import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import { IDBFactory } from 'fake-indexeddb'
import AddItemSheet from '$lib/components/AddItemSheet.svelte'
import type { PlannedItem } from '$lib/models'
import { favoritesStore } from '$lib/stores/favoritesStore.svelte'
import { __resetForTests } from '$lib/stores/db'

function open(oncommit: (item: Omit<PlannedItem, 'id'>) => void = () => {}, onclose: () => void = () => {}) {
	return render(AddItemSheet, { props: { open: true, initial: null, onclose, oncommit } })
}

function openEdit(initial: PlannedItem) {
	return render(AddItemSheet, { props: { open: true, initial, onclose: () => {}, oncommit: () => {} } })
}

const favConfig = {
	name: 'Mein Steak',
	categorySlug: 'beef',
	cutSlug: 'rinds-entrecote-ribeye-steak-boneless',
	thicknessCm: 3,
	prepLabel: null,
	doneness: 'Medium-rare',
	label: 'Rinds-Entrecôte 3 cm, Medium-rare',
	cookSeconds: 360,
	restSeconds: 300,
	flipFraction: 0.5,
	idealFlipPattern: 'once' as const,
	heatZone: 'Direct high',
	grateTempC: null,
}

beforeEach(() => {
	favoritesStore._reset()
	__resetForTests()
	;(globalThis as unknown as { indexedDB: unknown }).indexedDB = new IDBFactory()
})

describe('AddItemSheet', () => {
	it('test_cascading_steps_advance_on_tap', async () => {
		const { getByText, container } = open()

		// Step 1: category grid is shown.
		expect(container.querySelector('h2')?.textContent).toBe('Kategorie')

		// Tap "Rind" → step advances to cut list.
		await fireEvent.click(getByText('Rind'))
		expect(container.querySelector('h2')?.textContent).toBe('Grillstück')

		// Tap "Rinds-Entrecôte" → step advances to specs (has thickness + doneness).
		await fireEvent.click(getByText('Rinds-Entrecôte'))
		const heading = container.querySelector('h2')?.textContent
		expect(heading).toBeTruthy()
		expect(/Dicke|Garstufe|Anpassen/.test(heading!)).toBe(true)
	})

	it('test_back_chevron_returns_to_previous_step', async () => {
		const { getByText, getByLabelText, container } = open()

		await fireEvent.click(getByText('Rind'))
		expect(container.querySelector('h2')?.textContent).toBe('Grillstück')

		await fireEvent.click(getByText('Rinds-Entrecôte'))
		expect(container.querySelector('h2')?.textContent).not.toBe('Grillstück')

		// Back from specs returns to cut list.
		await fireEvent.click(getByLabelText('Zurück'))
		expect(container.querySelector('h2')?.textContent).toBe('Grillstück')

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

		let safety = 50
		while (!inc.disabled && safety-- > 0) {
			await fireEvent.click(inc)
		}
		expect(inc.disabled).toBe(true)
		expect(dec.disabled).toBe(false)

		safety = 50
		while (!dec.disabled && safety-- > 0) {
			await fireEvent.click(dec)
		}
		expect(dec.disabled).toBe(true)
		expect(inc.disabled).toBe(false)
	})

	it('test_thickness_minus_disabled_at_documented_min', async () => {
		const { getByText, getByLabelText, container } = open()
		await fireEvent.click(getByText('Rind'))
		await fireEvent.click(getByText('Rinds-Filet'))

		const num = () => parseFloat(container.querySelector('.thickness-value .num')!.textContent!.trim())
		const dec = getByLabelText('Dünner') as HTMLButtonElement

		expect(num()).toBe(1)
		expect(dec.disabled).toBe(true)
	})

	it('test_thickness_steps_in_half_cm_increments_between_documented_min_and_max', async () => {
		const { getByText, getByLabelText, container } = open()
		await fireEvent.click(getByText('Rind'))
		await fireEvent.click(getByText('Rinds-Filet'))

		const num = () => parseFloat(container.querySelector('.thickness-value .num')!.textContent!.trim())
		const inc = getByLabelText('Dicker') as HTMLButtonElement

		const seen = [num()]
		let safety = 20
		while (!inc.disabled && safety-- > 0) {
			await fireEvent.click(inc)
			seen.push(num())
		}
		expect(seen).toEqual([1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5])
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
		expect(arg.cutSlug).toBe('rinds-entrecote')
		expect(arg.thicknessCm).toBeGreaterThan(0)
		expect(arg.doneness).toBeTruthy()
		expect(arg.cookSeconds).toBeGreaterThan(0)
		expect(arg.restSeconds).toBeGreaterThanOrEqual(0)
		expect(arg.label).toContain('Rinds-Entrecôte')
	})

	it('test_default_grill_method_is_not_rendered_as_tip_or_heat_summary', async () => {
		const { getByText, queryByText } = open()

		await fireEvent.click(getByText('Rind'))
		await fireEvent.click(getByText('Rinds-Entrecôte'))

		expect(queryByText(/Direkt, Deckel zu/)).toBeNull()
	})

	it('test_non_default_grill_method_is_rendered_as_tip', async () => {
		const { getByText, getByLabelText } = open()

		await fireEvent.click(getByText('Rind'))
		await fireEvent.click(getByText('Rinds-Entrecôte'))
		const inc = getByLabelText('Dicker') as HTMLButtonElement
		for (let i = 0; i < 8; i += 1) {
			await fireEvent.click(inc)
		}

		expect(getByText('Grillmethode: Reverse-Sear (indirekt zu direkt)')).toBeTruthy()
	})

	it('test_first_step_renders_categories_and_favorites_tabs', async () => {
		const { getByRole } = open()
		expect(getByRole('tab', { name: 'Kategorie' })).toBeTruthy()
		expect(getByRole('tab', { name: 'Favoriten' })).toBeTruthy()
	})

	it('test_favorites_tab_hidden_in_edit_mode', async () => {
		const initial: PlannedItem = {
			id: '11111111-1111-4111-8111-111111111111',
			...favConfig,
		}
		const { queryByRole } = openEdit(initial)
		expect(queryByRole('tab', { name: 'Kategorie' })).toBeNull()
		expect(queryByRole('tab', { name: 'Favoriten' })).toBeNull()
	})

	it('test_favorites_tab_lists_saved_favorites', async () => {
		await favoritesStore.save({ ...favConfig, name: 'Steak A' })
		await favoritesStore.save({ ...favConfig, name: 'Steak B' })

		const { getByRole, getByText } = open()
		await fireEvent.click(getByRole('tab', { name: 'Favoriten' }))

		expect(getByText('Steak A')).toBeTruthy()
		expect(getByText('Steak B')).toBeTruthy()
	})

	it('test_favorites_tab_empty_state', async () => {
		const { getByRole, getByText, container } = open()
		await fireEvent.click(getByRole('tab', { name: 'Favoriten' }))
		expect(getByText(/noch keine Favoriten/i)).toBeTruthy()

		await fireEvent.click(getByText('Zur Kategorie'))
		expect(container.querySelector('h2')?.textContent).toBe('Kategorie')
	})

	it('test_tap_favorite_commits_and_closes_sheet', async () => {
		await favoritesStore.save({ ...favConfig, name: 'Mein Steak' })
		const oncommit = vi.fn()
		const onclose = vi.fn()
		const { getByRole, getByText } = open(oncommit, onclose)

		await fireEvent.click(getByRole('tab', { name: 'Favoriten' }))
		const row = getByText('Mein Steak').closest('button')!
		await fireEvent.pointerDown(row)
		await fireEvent.pointerUp(row)

		expect(oncommit).toHaveBeenCalledTimes(1)
		const payload = oncommit.mock.calls[0][0] as Record<string, unknown>
		expect(payload).not.toHaveProperty('id')
		expect(payload).not.toHaveProperty('name')
		expect(payload).not.toHaveProperty('createdAtEpoch')
		expect(payload).not.toHaveProperty('lastUsedEpoch')
		expect(payload.categorySlug).toBe('beef')
		expect(payload.cookSeconds).toBe(360)
		expect(onclose).toHaveBeenCalledTimes(1)
	})

	it('test_specs_step_inline_save_favorite', async () => {
		const onclose = vi.fn()
		const saveSpy = vi.spyOn(favoritesStore, 'save')
		const { getByText, getByLabelText } = open(() => {}, onclose)

		await fireEvent.click(getByText('Rind'))
		await fireEvent.click(getByText('Rinds-Entrecôte'))
		await fireEvent.click(getByText(/Als Favorit speichern/))

		const input = getByLabelText('Favorit-Name') as HTMLInputElement
		await fireEvent.input(input, { target: { value: 'Mein Steak' } })
		await fireEvent.keyDown(input, { key: 'Enter' })

		expect(saveSpy).toHaveBeenCalledTimes(1)
		const arg = saveSpy.mock.calls[0][0] as { name: string; cookSeconds: number }
		expect(arg.name).toBe('Mein Steak')
		expect(arg.cookSeconds).toBeGreaterThan(0)
		expect(onclose).not.toHaveBeenCalled()
		saveSpy.mockRestore()
	})
})
