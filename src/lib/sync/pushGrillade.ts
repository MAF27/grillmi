import type { GrilladeRow } from '$lib/stores/db'
import { enqueueSync } from './queue'

function serialize(row: GrilladeRow): Record<string, unknown> {
	return {
		id: row.id,
		name: row.name,
		status: row.status,
		target_finish_at: row.targetEpoch ? new Date(row.targetEpoch).toISOString() : null,
		started_at: row.startedEpoch ? new Date(row.startedEpoch).toISOString() : null,
		ended_at: row.endedEpoch ? new Date(row.endedEpoch).toISOString() : null,
		position: row.position,
		updated_at: new Date(row.updatedEpoch).toISOString(),
	}
}

export async function pushGrilladeCreate(row: GrilladeRow): Promise<void> {
	await enqueueSync({
		method: 'POST',
		path: '/api/grilladen',
		body: JSON.stringify(serialize(row)),
	})
}

export async function pushGrilladeUpdate(row: GrilladeRow): Promise<void> {
	await enqueueSync({
		method: 'PATCH',
		path: `/api/grilladen/${row.id}`,
		body: JSON.stringify(serialize(row)),
	})
}
