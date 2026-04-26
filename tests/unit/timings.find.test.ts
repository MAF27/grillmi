import { describe, expect, it } from 'vitest'
import { findCategory, findCut, findRow } from '$lib/data/timings'

const RIND_FILET = 'rinds-filet-beef-tenderloin-filet-mignon'
const ENTRECOTE = 'rinds-entrecote-ribeye-steak-boneless'

describe('findRow', () => {
	it('test_findCategory_returns_undefined_for_unknown_slug', () => {
		expect(findCategory('nonsense')).toBeUndefined()
	})

	it('test_findCut_returns_undefined_for_unknown_slug', () => {
		expect(findCut('beef', 'nonsense')).toBeUndefined()
	})

	it('test_blutig_and_englisch_at_1cm_have_distinct_cook_times', () => {
		const cut = findCut('beef', RIND_FILET)!
		const blutig = findRow(cut, 1, 'blutig')!
		const englisch = findRow(cut, 1, 'englisch')!
		expect(blutig.cookSecondsMin).toBe(120)
		expect(englisch.cookSecondsMin).toBe(150)
		expect(blutig.cookSecondsMin).not.toBe(englisch.cookSecondsMin)
	})

	it('test_doneness_match_is_case_insensitive', () => {
		const cut = findCut('beef', ENTRECOTE)!
		const lower = findRow(cut, 2, 'blutig')!
		const upper = findRow(cut, 2, 'BLUTIG')!
		expect(lower.cookSecondsMin).toBe(upper.cookSecondsMin)
	})

	it('test_thickness_off_grid_snaps_to_nearest_no_interpolation', () => {
		const cut = findCut('beef', RIND_FILET)!
		const exact1 = findRow(cut, 1, 'blutig')!
		const exact2 = findRow(cut, 2, 'blutig')!
		const between = findRow(cut, 1.4, 'blutig')!
		const between2 = findRow(cut, 1.6, 'blutig')!
		expect(between.cookSecondsMin).toBe(exact1.cookSecondsMin)
		expect(between2.cookSecondsMin).toBe(exact2.cookSecondsMin)
	})

	it('test_thickness_above_max_snaps_to_documented_max', () => {
		const cut = findCut('beef', RIND_FILET)!
		const max = findRow(cut, 5, 'blutig')!
		const above = findRow(cut, 99, 'blutig')!
		expect(above.cookSecondsMin).toBe(max.cookSecondsMin)
	})

	it('test_thickness_below_min_snaps_to_documented_min', () => {
		const cut = findCut('beef', RIND_FILET)!
		const min = findRow(cut, 1, 'blutig')!
		const below = findRow(cut, 0.5, 'blutig')!
		expect(below.cookSecondsMin).toBe(min.cookSecondsMin)
	})

	it('test_findRow_returns_undefined_when_no_doneness_matches', () => {
		const cut = findCut('beef', RIND_FILET)!
		expect(findRow(cut, 1, 'sehr-blutig')).toBeUndefined()
	})

	it('test_findRow_ignores_thickness_axis_when_cut_has_none', () => {
		const sausage = findCategory('sausage')!.cuts.find(c => !c.hasThickness)
		if (!sausage) return
		const row = findRow(sausage, 999, null)
		expect(row).toBeTruthy()
	})
})
