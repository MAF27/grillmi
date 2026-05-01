import { describe, expect, it } from 'vitest'
import { grilladeFromServer, grilladeToServer } from '$lib/sync/mappers/grillade'
import type { GrilladeRow } from '$lib/stores/db'

describe('grilladeMapper', () => {
	it('grilladeToServer roundtrips a planned row', () => {
		const row: GrilladeRow = {
			id: 'abc',
			name: 'Sunday',
			status: 'planned',
			targetEpoch: 1714579200000,
			startedEpoch: null,
			endedEpoch: null,
			position: 1,
			updatedEpoch: 1714579100000,
			deletedEpoch: null,
		}
		expect(grilladeToServer(row)).toEqual({
			id: 'abc',
			name: 'Sunday',
			status: 'planned',
			target_finish_at: '2024-05-01T16:00:00.000Z',
			started_at: null,
			ended_at: null,
			position: 1,
			updated_at: '2024-05-01T15:58:20.000Z',
		})
	})

	it('grilladeFromServer roundtrips a server row', () => {
		const server = {
			id: 'abc',
			name: 'Sunday',
			status: 'planned',
			target_finish_at: '2024-05-01T16:00:00+00:00',
			started_at: null,
			ended_at: null,
			position: 1,
			updated_at: '2024-05-01T15:58:20+00:00',
			deleted_at: null,
		}
		expect(grilladeFromServer(server)).toEqual({
			id: 'abc',
			name: 'Sunday',
			status: 'planned',
			targetEpoch: 1714579200000,
			startedEpoch: null,
			endedEpoch: null,
			position: 1,
			updatedEpoch: 1714579100000,
			deletedEpoch: null,
			pushedToServer: true,
		})
	})

	it('grilladeFromServer handles null timestamps and deleted_at', () => {
		const allNull = {
			id: 'g',
			name: null,
			status: 'finished',
			target_finish_at: null,
			started_at: null,
			ended_at: null,
			position: 0,
			updated_at: '2024-05-01T15:58:20+00:00',
			deleted_at: null,
		}
		expect(grilladeFromServer(allNull)).toMatchObject({
			targetEpoch: null,
			startedEpoch: null,
			endedEpoch: null,
			deletedEpoch: null,
		})

		const allSet = {
			id: 'g',
			name: 'X',
			status: 'finished',
			target_finish_at: '2024-05-01T16:00:00+00:00',
			started_at: '2024-05-01T15:00:00+00:00',
			ended_at: '2024-05-01T17:00:00+00:00',
			position: 0,
			updated_at: '2024-05-01T15:58:20+00:00',
			deleted_at: '2024-05-02T00:00:00+00:00',
		}
		expect(grilladeFromServer(allSet)).toMatchObject({
			targetEpoch: 1714579200000,
			startedEpoch: 1714575600000,
			endedEpoch: 1714582800000,
			deletedEpoch: 1714608000000,
		})
	})
})
