import { describe, expect, it } from 'vitest'
import generated from '$lib/data/timings.generated.json'
import { timingsSchema } from '$lib/data/timings.schema'

describe('timings schema', () => {
	const parsed = timingsSchema.parse(generated)

	it('test_timings_schema_validates_generated_json', () => {
		expect(parsed.categories.length).toBeGreaterThan(0)
	})

	it('test_timings_schema_rejects_missing_required_field', () => {
		const broken = JSON.parse(JSON.stringify(generated))
		broken.categories[0].cuts[0].rows[0].cookSecondsMin = undefined
		expect(() => timingsSchema.parse(broken)).toThrow()
	})

	it('test_timings_schema_cook_seconds_ordering', () => {
		for (const cat of parsed.categories) {
			for (const cut of cat.cuts) {
				for (const row of cut.rows) {
					expect(row.cookSecondsMax).toBeGreaterThanOrEqual(row.cookSecondsMin)
				}
			}
		}
	})

	it('test_timings_schema_category_count', () => {
		const expected = [
			'beef',
			'veal',
			'pork',
			'lamb',
			'poultry',
			'sausage',
			'skewers',
			'fish',
			'cheese',
			'vegetables',
			'fruit',
			'special',
		]
		expect(parsed.categories.map(c => c.slug)).toEqual(expected)
	})

	it('test_timings_schema_has_doneness_flag_respected', () => {
		for (const cat of parsed.categories) {
			for (const cut of cat.cuts) {
				if (cut.hasDoneness) {
					expect(cut.rows.some(r => r.doneness !== null)).toBe(true)
				} else {
					for (const row of cut.rows) expect(row.doneness).toBeNull()
				}
			}
		}
	})
})
