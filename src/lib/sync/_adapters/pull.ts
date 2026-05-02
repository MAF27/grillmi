import { authStore } from '$lib/stores/authStore.svelte'
import {
	getActiveGrillade,
	getGrillade,
	listGrilladen,
	putFavorite,
	putGrillade,
	putSettings,
	type GrilladeRow,
} from '$lib/stores/db'
import type { PlannedItem } from '$lib/schemas'
import { debugSync } from '../debug'
import {
	favoriteFromServer,
	grilladeFromServer,
	plannedItemFromServer,
	sessionFromServer,
	settingsValueFromServer,
	type ServerSettings,
} from '../mappers'

export interface PullResult {
	serverTime: string | null
	changed: boolean
	/** IDs of grilladen in the delta whose status is planned/running. The
	 * coordinator uses these to retire other-active rows after pull completes. */
	activeIds: string[]
}

interface DeltaResponse<T> {
	rows: T[]
	server_time: string
}

/** Fetches deltas since `since`, writes rows to IDB, and returns metadata.
 * Watermark plumbing and single-active enforcement live in the coordinator. */
export async function pullDeltas(since: string): Promise<PullResult> {
	if (!authStore.isAuthenticated) {
		debugSync('pull', 'skipped: unauthenticated')
		return { serverTime: null, changed: false, activeIds: [] }
	}
	const params = `?since=${encodeURIComponent(since)}`
	debugSync('pull', 'start', { since })

	let serverTime: string | null = null
	let changed = false
	const activeIds: string[] = []

	try {
		const grilladen = await fetchJson<DeltaResponse<Record<string, unknown>>>(`/api/grilladen${params}`)
		if (grilladen) {
			serverTime = grilladen.server_time
			debugSync('pull', 'grilladen received', { count: grilladen.rows.length, serverTime })
			for (const r of grilladen.rows) {
				const incoming = grilladeFromServer(r)
				const existing = await getGrillade(incoming.id)
				const beforeSignature = grilladeSignature(existing)
				if (existing) {
					incoming.session = existing.session
					incoming.timeline = existing.timeline
					incoming.planState = existing.planState
					incoming.syncedItemIds = existing.syncedItemIds
				}
				if (incoming.status === 'planned' || incoming.status === 'running') {
					const rows = await fetchGrilladeItemRows(incoming.id)
					const items = rows.map(plannedItemFromServer).filter((item): item is PlannedItem => item !== null)
					debugSync('pull', 'active row items received', {
						id: incoming.id,
						status: incoming.status,
						rowCount: rows.length,
						mappedCount: items.length,
					})
					if (items.length > 0) {
						if (incoming.status === 'running') incoming.session = sessionFromServer(incoming, rows, items)
						else if (existing?.planState) {
							// Server doesn't track plan.mode or planMode — preserve the
							// local choice (Jetzt / Auf Zeit / Manuell) instead of
							// resetting it on every pull.
							incoming.planState = {
								plan: {
									...existing.planState.plan,
									targetEpoch: incoming.targetEpoch ?? existing.planState.plan.targetEpoch,
									items,
								},
								planMode: existing.planState.planMode,
							}
						} else
							incoming.planState = {
								plan: {
									targetEpoch: incoming.targetEpoch ?? Date.now(),
									items,
									mode: incoming.targetEpoch ? 'time' : 'now',
								},
								planMode: 'auto',
							}
						incoming.syncedItemIds = items.map(item => item.id)
					}
					activeIds.push(incoming.id)
				}
				await putGrillade(incoming)
				changed = grilladeSignature(incoming) !== beforeSignature || changed
				debugSync('pull', 'stored grillade', {
					id: incoming.id,
					status: incoming.status,
					hasSession: Boolean(incoming.session),
					planItems: incoming.planState?.plan.items.length ?? 0,
					sessionItems: incoming.session?.items.length ?? 0,
				})
			}
		}
		changed = (await refreshLocalActiveItems()) || changed
	} catch (error) {
		debugSync('pull', 'grilladen error', { error: String(error) })
	}

	try {
		const favorites = await fetchJson<DeltaResponse<Record<string, unknown>>>(`/api/favorites${params}`)
		if (favorites) {
			serverTime = favorites.server_time
			for (const r of favorites.rows) {
				if (r.deleted_at) continue
				const fav = favoriteFromServer(r)
				if (fav) await putFavorite(fav)
			}
		}
	} catch (error) {
		debugSync('pull', 'favorites error', { error: String(error) })
	}

	try {
		const settings = await fetchJson<ServerSettings>(`/api/settings`)
		const value = settingsValueFromServer(settings)
		if (value) await putSettings(value as never)
	} catch (error) {
		debugSync('pull', 'settings error', { error: String(error) })
	}

	return { serverTime, changed, activeIds }
}

/** Refreshes the locally-stored active grillade against the server's items, in
 * case the delta watermark missed item-level edits. Returns true if anything
 * changed. */
async function refreshLocalActiveItems(): Promise<boolean> {
	const active = await getActiveGrillade()
	if (!active || (active.status !== 'planned' && active.status !== 'running')) return false
	const beforeSignature = grilladeSignature(active)
	const rows = await fetchGrilladeItemRows(active.id)
	const items = rows.map(plannedItemFromServer).filter((item): item is PlannedItem => item !== null)
	debugSync('pull', 'local active items refresh', {
		id: active.id,
		status: active.status,
		rowCount: rows.length,
		mappedCount: items.length,
	})
	if (items.length === 0) return false
	if (active.status === 'running') active.session = sessionFromServer(active, rows, items)
	else if (active.planState)
		active.planState = {
			plan: {
				...active.planState.plan,
				targetEpoch: active.targetEpoch ?? active.planState.plan.targetEpoch,
				items,
			},
			planMode: active.planState.planMode,
		}
	else
		active.planState = {
			plan: {
				targetEpoch: active.targetEpoch ?? Date.now(),
				items,
				mode: active.targetEpoch ? 'time' : 'now',
			},
			planMode: 'auto',
		}
	active.syncedItemIds = items.map(item => item.id)
	active.updatedEpoch = Math.max(active.updatedEpoch, ...rows.map(r => Date.parse(String(r.updated_at ?? '')) || 0))
	const changed = grilladeSignature(active) !== beforeSignature
	if (!changed) return false
	await putGrillade(active)
	return changed
}

function grilladeSignature(row: GrilladeRow | undefined): string {
	if (!row) return 'missing'
	return JSON.stringify({
		id: row.id,
		status: row.status,
		targetEpoch: row.targetEpoch,
		startedEpoch: row.startedEpoch,
		endedEpoch: row.endedEpoch,
		deletedEpoch: row.deletedEpoch,
		planItems: row.planState?.plan.items.map(item => ({
			id: item.id,
			label: item.label,
			cutSlug: item.cutSlug,
			thicknessCm: item.thicknessCm,
			doneness: item.doneness,
			cookSeconds: item.cookSeconds,
			restSeconds: item.restSeconds,
		})),
		sessionItems: row.session?.items.map(item => ({
			id: item.id,
			status: item.status,
			label: item.label,
			cutSlug: item.cutSlug,
			putOnEpoch: item.putOnEpoch,
			doneEpoch: item.doneEpoch,
			restingUntilEpoch: item.restingUntilEpoch,
			flipFired: item.flipFired,
			platedEpoch: item.platedEpoch,
			alarmDismissed: item.alarmDismissed,
			alarmFired: item.alarmFired,
		})),
	})
}

/** Marks every other planned/running grillade as finished+deleted. The
 * coordinator runs this after a delta pull surfaces a fresh active row. */
export async function retireOtherActiveGrilladen(activeId: string): Promise<void> {
	const now = Date.now()
	const localRows = await listGrilladen()
	await Promise.all(
		localRows
			.filter(row => row.id !== activeId && (row.status === 'planned' || row.status === 'running'))
			.map(row =>
				putGrillade({
					...row,
					status: 'finished',
					endedEpoch: row.endedEpoch ?? now,
					updatedEpoch: now,
					deletedEpoch: now,
				}),
			),
	)
}

async function fetchGrilladeItemRows(grilladeId: string): Promise<Array<Record<string, unknown>>> {
	const response = await fetchJson<DeltaResponse<Record<string, unknown>>>(
		`/api/grilladen/${grilladeId}/items?since=1970-01-01T00%3A00%3A00Z`,
	)
	if (!response) return []
	return response.rows
		.filter(r => !r.deleted_at)
		.sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
}

async function fetchJson<T>(path: string): Promise<T | null> {
	const response = await fetch(path, {
		credentials: 'include',
		headers: { Accept: 'application/json' },
	})
	const text = await response.clone().text().catch(() => '')
	debugSync('pull', 'fetch response', { path, status: response.status, body: text.slice(0, 300) })
	if (response.status === 401) {
		authStore.clear()
		return null
	}
	if (!response.ok) return null
	return (await response.json()) as T
}
