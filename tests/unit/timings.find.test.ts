import { describe, expect, it } from 'vitest'
import { findCategory, findCut, findRow, TIMINGS } from '$lib/data/timings'

const RIND_FILET = 'rinds-filet-beef-tenderloin-filet-mignon'
const ENTRECOTE = 'rinds-entrecote-ribeye-steak-boneless'

describe('findRow', () => {
	it('test_findCategory_returns_undefined_for_unknown_slug', () => {
		expect(findCategory('nonsense')).toBeUndefined()
	})

	it('test_findCut_returns_undefined_for_unknown_slug', () => {
		expect(findCut('beef', 'nonsense')).toBeUndefined()
	})

	it('test_rare_and_medium_rare_at_1cm_have_distinct_cook_times', () => {
		const cut = findCut('beef', RIND_FILET)!
		const rare = findRow(cut, 1, 'rare')!
		const mediumRare = findRow(cut, 1, 'medium-rare')!
		expect(rare.cookSecondsMin).toBe(120)
		expect(mediumRare.cookSecondsMin).toBe(150)
		expect(rare.cookSecondsMin).not.toBe(mediumRare.cookSecondsMin)
	})

	it('test_doneness_match_is_case_insensitive', () => {
		const cut = findCut('beef', ENTRECOTE)!
		const lower = findRow(cut, 2, 'rare')!
		const upper = findRow(cut, 2, 'RARE')!
		expect(lower.cookSecondsMin).toBe(upper.cookSecondsMin)
	})

	it('test_thickness_off_grid_snaps_to_nearest_no_interpolation', () => {
		const cut = findCut('beef', RIND_FILET)!
		const exact1 = findRow(cut, 1, 'rare')!
		const exact2 = findRow(cut, 2, 'rare')!
		const between = findRow(cut, 1.4, 'rare')!
		const between2 = findRow(cut, 1.6, 'rare')!
		expect(between.cookSecondsMin).toBe(exact1.cookSecondsMin)
		expect(between2.cookSecondsMin).toBe(exact2.cookSecondsMin)
	})

	it('test_thickness_above_max_snaps_to_documented_max', () => {
		const cut = findCut('beef', RIND_FILET)!
		const max = findRow(cut, 5, 'rare')!
		const above = findRow(cut, 99, 'rare')!
		expect(above.cookSecondsMin).toBe(max.cookSecondsMin)
	})

	it('test_thickness_below_min_snaps_to_documented_min', () => {
		const cut = findCut('beef', RIND_FILET)!
		const min = findRow(cut, 1, 'rare')!
		const below = findRow(cut, 0.5, 'rare')!
		expect(below.cookSecondsMin).toBe(min.cookSecondsMin)
	})

	it('test_findRow_returns_undefined_when_no_doneness_matches', () => {
		const cut = findCut('beef', RIND_FILET)!
		expect(findRow(cut, 1, 'extra-rare')).toBeUndefined()
	})

	it('test_findRow_ignores_thickness_axis_when_cut_has_none', () => {
		const sausage = findCategory('sausage')!.cuts.find(c => !c.hasThickness)
		if (!sausage) return
		const row = findRow(sausage, 999, null)
		expect(row).toBeTruthy()
	})

	it('test_grate_temp_parsed_from_reference', () => {
		const cut = findCut('beef', RIND_FILET)!
		const row = findRow(cut, 1, 'rare')!
		expect(row.grateTempC).toBe(230)
	})

	it('test_grate_temp_present_for_every_row', () => {
		const missing: string[] = []
		for (const c of TIMINGS.categories) {
			for (const cut of c.cuts) {
				for (const row of cut.rows) {
					if (typeof row.grateTempC !== 'number' || row.grateTempC <= 0) {
						missing.push(`${cut.slug}/${row.thicknessCm ?? row.prepLabel}/${row.doneness}`)
					}
				}
			}
		}
		expect(missing).toEqual([])
	})
})
