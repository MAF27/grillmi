import { deleteGrillade, enqueueSyncRow, getSyncMeta, listGrilladen, setSyncMeta, type GrilladeRow } from './db'
import type { PlannedItem } from '$lib/models'

const CORRUPT_CLEANUP_KEY = 'historyCorruptFinishedItemsCleanup:v1'

function createGrilladenHistoryStore() {
	let rows = $state<GrilladeRow[]>([])
	let initialized = false

	const finished = $derived(
		rows
			.filter(row => row.status === 'finished' && row.deletedEpoch === null)
			.sort((a, b) => (b.endedEpoch ?? b.updatedEpoch) - (a.endedEpoch ?? a.updatedEpoch)),
	)

	return {
		get finished() {
			return finished
		},
		async refresh() {
			rows = await listGrilladen()
			initialized = true
		},
		async init() {
			if (initialized) return
			await this.refresh()
			await this.cleanupCorruptFinished()
		},
		async cleanupCorruptFinished() {
			if ((await getSyncMeta(CORRUPT_CLEANUP_KEY)) === true) return
			const corrupt = rows.filter(
				row =>
					row.status === 'finished' &&
					row.deletedEpoch === null &&
					(row.session?.items.length ?? row.planState?.plan.items.length ?? 0) === 0,
			)
			for (const row of corrupt) {
				await deleteGrillade(row.id)
				await enqueueSyncRow({
					method: 'PATCH',
					path: `/api/grilladen/${row.id}`,
					body: JSON.stringify({ deleted_at: new Date().toISOString() }),
					createdEpoch: Date.now(),
				})
			}
			await setSyncMeta(CORRUPT_CLEANUP_KEY, true)
			if (corrupt.length > 0) await this.refresh()
		},
		async isSaved(id: string) {
			return (await getSyncMeta(`historySaved:${id}`)) === true
		},
		async toggleSaved(id: string) {
			const next = !(await this.isSaved(id))
			await setSyncMeta(`historySaved:${id}`, next)
			return next
		},
		async getNote(id: string) {
			const value = await getSyncMeta(`historyNote:${id}`)
			return typeof value === 'string' ? value : ''
		},
		async setNote(id: string, value: string) {
			await setSyncMeta(`historyNote:${id}`, value)
		},
		async loadItems(id: string): Promise<{ ok: true; items: PlannedItem[] } | { ok: false; reason: 'offline' | 'missing' }> {
			const row = rows.find(g => g.id === id) ?? (await listGrilladen()).find(g => g.id === id)
			const items = row?.session?.items ?? row?.planState?.plan.items
			if (items) return { ok: true, items: items.map(item => ({ ...item })) }
			return { ok: false, reason: navigator.onLine ? 'missing' : 'offline' }
		},
		async softDelete(id: string) {
			const deletedAt = new Date().toISOString()
			await deleteGrillade(id)
			await enqueueSyncRow({
				method: 'PATCH',
				path: `/api/grilladen/${id}`,
				body: JSON.stringify({ deleted_at: deletedAt }),
				createdEpoch: Date.now(),
			})
			await this.refresh()
		},
		_reset() {
			rows = []
			initialized = false
		},
	}
}

export const grilladenHistoryStore = createGrilladenHistoryStore()
