import { describe, expect, it } from 'vitest'
import { favoriteFromServer } from '$lib/sync/mappers/favorite'

describe('favoriteMapper', () => {
	it('favoriteFromServer reconstructs cookSeconds from cut, thickness, and doneness', () => {
		const fav = favoriteFromServer({
			id: 'f',
			label: 'Sunday Steak',
			cut_id: 'rinds-entrecote',
			thickness_cm: 3,
			doneness: 'medium-rare',
			prep_label: null,
			last_used_at: '2024-05-01T15:00:00+00:00',
			created_at: '2024-05-01T15:00:00+00:00',
		})
		expect(fav).toMatchObject({
			id: 'f',
			name: 'Sunday Steak',
			categorySlug: 'beef',
			cutSlug: 'rinds-entrecote',
			thicknessCm: 3,
			doneness: 'medium-rare',
			cookSeconds: 600,
			restSeconds: 300,
			flipFraction: 0.5,
		})
	})

	it('favoriteFromServer returns null when cut_id does not resolve in the bundled timings', () => {
		expect(
			favoriteFromServer({
				id: 'f',
				label: 'X',
				cut_id: 'nope',
				thickness_cm: 2,
				doneness: 'medium',
			}),
		).toBeNull()
	})
})
