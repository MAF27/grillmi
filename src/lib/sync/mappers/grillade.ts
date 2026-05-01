import type { GrilladeRow } from '$lib/stores/db'

export function grilladeToServer(row: GrilladeRow): Record<string, unknown> {
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

export function grilladeFromServer(r: Record<string, unknown>): GrilladeRow {
	return {
		id: String(r.id),
		name: (r.name as string | null) ?? null,
		status: (r.status as 'planned' | 'running' | 'finished') ?? 'planned',
		targetEpoch: r.target_finish_at ? Date.parse(String(r.target_finish_at)) : null,
		startedEpoch: r.started_at ? Date.parse(String(r.started_at)) : null,
		endedEpoch: r.ended_at ? Date.parse(String(r.ended_at)) : null,
		position: Number(r.position ?? 0),
		updatedEpoch: Date.parse(String(r.updated_at ?? '')) || Date.now(),
		deletedEpoch: r.deleted_at ? Date.parse(String(r.deleted_at)) : null,
		// Server already knows this row, so future local edits should PATCH
		// rather than POST a duplicate.
		pushedToServer: true,
	}
}
