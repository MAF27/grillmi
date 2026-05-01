import type { GrilladeRow } from '$lib/stores/db'
import type { PlannedItem, SessionItem } from '$lib/models'
import { enqueueWrite } from '../coordinator'
import {
	grilladeToServer,
	plannedItemToServer,
	sessionItemToServer,
} from '../mappers'

export async function pushGrilladeCreate(row: GrilladeRow): Promise<boolean> {
	return enqueueWrite({
		method: 'POST',
		path: '/api/grilladen',
		body: JSON.stringify(grilladeToServer(row)),
	})
}

export async function pushGrilladeUpdate(row: GrilladeRow): Promise<boolean> {
	return enqueueWrite({
		method: 'PATCH',
		path: `/api/grilladen/${row.id}`,
		body: JSON.stringify(grilladeToServer(row)),
	})
}

export async function pushPlannedItems(row: GrilladeRow, items: PlannedItem[]): Promise<string[]> {
	const synced = new Set(row.syncedItemIds ?? [])
	const current = new Set(items.map(item => item.id))

	for (const [index, item] of items.entries()) {
		const method = synced.has(item.id) ? 'PATCH' : 'POST'
		const queued = await enqueueWrite({
			method,
			path: method === 'POST' ? `/api/grilladen/${row.id}/items` : `/api/grilladen/${row.id}/items/${item.id}`,
			body: JSON.stringify(plannedItemToServer(item, index)),
		})
		if (queued) synced.add(item.id)
	}

	for (const id of [...synced]) {
		if (current.has(id)) continue
		const queued = await enqueueWrite({
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
		const queued = await enqueueWrite({
			method,
			path: method === 'POST' ? `/api/grilladen/${row.id}/items` : `/api/grilladen/${row.id}/items/${item.id}`,
			body: JSON.stringify(sessionItemToServer(item, index)),
		})
		if (queued) synced.add(item.id)
	}

	for (const id of [...synced]) {
		if (current.has(id)) continue
		const queued = await enqueueWrite({
			method: 'DELETE',
			path: `/api/grilladen/${row.id}/items/${id}`,
		})
		if (queued) synced.delete(id)
	}

	return [...synced]
}
