import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { grilladenHistoryStore } from '$lib/stores/grilladenHistoryStore.svelte'
import { __resetForTests, listGrilladen, listSyncQueue, putGrillade, type GrilladeRow } from '$lib/stores/db'

beforeEach(() => {
	grilladenHistoryStore._reset()
	__resetForTests()
	;(globalThis as unknown as { indexedDB: unknown }).indexedDB = new IDBFactory()
})

function row(over: Partial<GrilladeRow> = {}): GrilladeRow {
	return {
		id: crypto.randomUUID(),
		name: null,
		status: 'finished',
		targetEpoch: null,
		startedEpoch: Date.now() - 600_000,
		endedEpoch: Date.now(),
		position: 0,
		updatedEpoch: Date.now(),
		deletedEpoch: null,
		...over,
	}
}

describe('grilladenHistoryStore', () => {
	it('test_init_soft_deletes_finished_rows_without_item_snapshot', async () => {
		await putGrillade(row({ id: 'bad' }))
		await putGrillade(
			row({
				id: 'good',
				session: {
					id: 'session',
					createdAtEpoch: Date.now(),
					targetEpoch: Date.now(),
					endedAtEpoch: null,
					mode: 'auto',
					items: [
						{
							id: 'item',
							categorySlug: 'beef',
							cutSlug: 'entrecote',
							thicknessCm: 3,
							prepLabel: null,
							doneness: 'Medium',
							label: 'Steak',
							cookSeconds: 300,
							restSeconds: 60,
							flipFraction: 0.5,
							idealFlipPattern: 'once',
							heatZone: 'Direct high',
							grateTempC: null,
							putOnEpoch: Date.now(),
							flipEpoch: null,
							doneEpoch: Date.now(),
							restingUntilEpoch: Date.now(),
							status: 'ready',
							overdue: false,
							flipFired: false,
							platedEpoch: null,
							alarmDismissed: { putOn: null, flip: null, ready: null },
						},
					],
				},
			}),
		)

		await grilladenHistoryStore.init()

		expect(grilladenHistoryStore.finished.map(g => g.id)).toEqual(['good'])
		expect((await listGrilladen()).map(g => g.id)).toEqual(['good'])
		expect(await listSyncQueue()).toHaveLength(1)
	})
})
