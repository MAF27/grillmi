import type { GrilladeRow } from '$lib/stores/db'
import type { PlannedItem, SessionItem } from '$lib/models'
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

export async function pushGrilladeCreate(row: GrilladeRow): Promise<boolean> {
	return enqueueSync({
		method: 'POST',
		path: '/api/grilladen',
		body: JSON.stringify(serialize(row)),
	})
}

export async function pushGrilladeUpdate(row: GrilladeRow): Promise<boolean> {
	return enqueueSync({
		method: 'PATCH',
		path: `/api/grilladen/${row.id}`,
		body: JSON.stringify(serialize(row)),
	})
}

export async function pushPlannedItems(row: GrilladeRow, items: PlannedItem[]): Promise<string[]> {
	const synced = new Set(row.syncedItemIds ?? [])
	const current = new Set(items.map(item => item.id))

	for (const [index, item] of items.entries()) {
		const method = synced.has(item.id) ? 'PATCH' : 'POST'
		const queued = await enqueueSync({
			method,
			path: method === 'POST' ? `/api/grilladen/${row.id}/items` : `/api/grilladen/${row.id}/items/${item.id}`,
			body: JSON.stringify(serializePlannedItem(item, index)),
		})
		if (queued) synced.add(item.id)
	}

	for (const id of [...synced]) {
		if (current.has(id)) continue
		const queued = await enqueueSync({
			method: 'DELETE',
			path: `/api/grilladen/${row.id}/items/${id}`,
		})
		if (queued) synced.delete(id)
	}

	return [...synced]
}

export async function pushSessionItems(row: GrilladeRow, items: SessionItem[]): Promise<string[]> {
	const synced = new Set(row.syncedItemIds ?? [])
	const current = new Set(items.map(item => item.id))

	for (const [index, item] of items.entries()) {
		const method = synced.has(item.id) ? 'PATCH' : 'POST'
		const queued = await enqueueSync({
			method,
			path: method === 'POST' ? `/api/grilladen/${row.id}/items` : `/api/grilladen/${row.id}/items/${item.id}`,
			body: JSON.stringify(serializeSessionItem(item, index)),
		})
		if (queued) synced.add(item.id)
	}

	for (const id of [...synced]) {
		if (current.has(id)) continue
		const queued = await enqueueSync({
			method: 'DELETE',
			path: `/api/grilladen/${row.id}/items/${id}`,
		})
		if (queued) synced.delete(id)
	}

	return [...synced]
}

function serializePlannedItem(item: PlannedItem, index: number): Record<string, unknown> {
	return {
		id: item.id,
		label: item.label ?? item.cutSlug,
		cut_id: item.cutSlug,
		thickness_cm: item.thicknessCm,
		doneness: item.doneness,
		prep_label: item.prepLabel,
		cook_seconds_min: item.cookSeconds,
		cook_seconds_max: item.cookSeconds,
		flip_fraction: item.flipFraction,
		rest_seconds: item.restSeconds,
		status: 'pending',
		started_at: null,
		plated_at: null,
		position: index,
	}
}

function serializeSessionItem(item: SessionItem, index: number): Record<string, unknown> {
	return {
		...serializePlannedItem(item, index),
		status: item.status,
		started_at: item.status === 'pending' ? null : new Date(item.putOnEpoch).toISOString(),
		plated_at: item.platedEpoch ? new Date(item.platedEpoch).toISOString() : null,
	}
}
