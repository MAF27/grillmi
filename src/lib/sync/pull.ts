import { authStore } from '$lib/stores/authStore.svelte'
import {
	getActiveGrillade,
	getGrillade,
	getSyncMeta,
	listGrilladen,
	putFavorite,
	putGrillade,
	putSettings,
	setSyncMeta,
	type GrilladeRow,
} from '$lib/stores/db'
import { findCutBySlug, findRow } from '$lib/data/timings'
import { buildSessionItem, schedule } from '$lib/scheduler/schedule'
import type { Favorite, PlannedItem, Session, SessionItem } from '$lib/schemas'
import { debugSync } from './debug'

const LAST_PULL_KEY = 'lastPullEpoch'

interface DeltaResponse<T> {
	rows: T[]
	server_time: string
}

interface ServerSettings {
	value: Record<string, unknown>
	updated_at: string | null
}

export async function pull(): Promise<boolean> {
	if (!authStore.isAuthenticated) {
		debugSync('pull', 'skipped: unauthenticated')
		return false
	}
	const since = ((await getSyncMeta(LAST_PULL_KEY)) as string | undefined) ?? '1970-01-01T00:00:00Z'
	const params = `?since=${encodeURIComponent(since)}`
	debugSync('pull', 'start', { since })

	let serverTime: string | null = null
	let changed = false
	try {
		const grilladen = await fetchJson<DeltaResponse<Record<string, unknown>>>(`/api/grilladen${params}`)
		if (grilladen) {
			serverTime = grilladen.server_time
			debugSync('pull', 'grilladen received', { count: grilladen.rows.length, serverTime })
			for (const r of grilladen.rows) {
				const incoming = toGrilladeRow(r)
				// Preserve local-only fields (active session, timeline,
				// planState) so a pull mid-cook doesn't wipe in-flight state.
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
						else
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
					await retireOtherActiveGrilladen(incoming.id)
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
		// Network errors leave watermark untouched; next pull retries.
	}

	try {
		const favorites = await fetchJson<DeltaResponse<Record<string, unknown>>>(`/api/favorites${params}`)
		if (favorites) {
			serverTime = favorites.server_time
			for (const r of favorites.rows) {
				if (r.deleted_at) continue
				const fav = favoriteFromServer(r)
				if (fav) {
					await putFavorite(fav)
				}
			}
		}
	} catch (error) {
		debugSync('pull', 'favorites error', { error: String(error) })
	}

	try {
		const settings = await fetchJson<ServerSettings>(`/api/settings`)
		if (settings && settings.value) {
			await putSettings(settings.value as never)
		}
	} catch (error) {
		debugSync('pull', 'settings error', { error: String(error) })
	}

	if (serverTime) {
		await setSyncMeta(LAST_PULL_KEY, serverTime)
		debugSync('pull', 'watermark updated', { serverTime })
	}
	return changed
}

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
		})),
	})
}

async function retireOtherActiveGrilladen(activeId: string): Promise<void> {
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
	const response = await fetchJson<DeltaResponse<Record<string, unknown>>>(`/api/grilladen/${grilladeId}/items?since=1970-01-01T00%3A00%3A00Z`)
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

function favoriteFromServer(r: Record<string, unknown>): Favorite | null {
	const cutSlug = String(r.cut_id ?? '')
	const found = findCutBySlug(cutSlug)
	// Server cut_id must resolve to a known cut in the bundled timings data;
	// otherwise we can't reconstruct the rich Favorite shape the client uses.
	if (!found) return null
	const thicknessCm = r.thickness_cm == null ? null : Number(r.thickness_cm)
	const doneness = (r.doneness as string | null) ?? null
	const row = findRow(found.cut, thicknessCm, doneness)
	if (!row) return null
	const cookSeconds = Math.round((row.cookSecondsMin + row.cookSecondsMax) / 2)
	return {
		id: String(r.id),
		name: String(r.label ?? ''),
		categorySlug: found.category.slug,
		cutSlug: found.cut.slug,
		thicknessCm,
		prepLabel: (r.prep_label as string | null) ?? null,
		doneness,
		label: (r.label as string | null) ?? null,
		cookSeconds,
		restSeconds: row.restSeconds,
		flipFraction: row.flipFraction,
		idealFlipPattern: row.idealFlipPattern,
		heatZone: row.heatZone,
		grateTempC: row.grateTempC,
		createdAtEpoch: Date.parse(String(r.created_at ?? '')) || Date.now(),
		lastUsedEpoch: Date.parse(String(r.last_used_at ?? '')) || Date.now(),
	}
}

function plannedItemFromServer(r: Record<string, unknown>): PlannedItem | null {
	const cutSlug = String(r.cut_id ?? '')
	const found = findCutBySlug(cutSlug)
	if (!found) return null
	const thicknessCm = r.thickness_cm == null ? null : Number(r.thickness_cm)
	const doneness = (r.doneness as string | null) ?? null
	const prepLabel = (r.prep_label as string | null) ?? null
	const row = findRow(found.cut, thicknessCm, doneness)
	return {
		id: String(r.id),
		categorySlug: found.category.slug,
		cutSlug: found.cut.slug,
		thicknessCm,
		prepLabel,
		doneness,
		label: (r.label as string | null) ?? null,
		cookSeconds: Number(r.cook_seconds_max ?? r.cook_seconds_min ?? row?.cookSecondsMax ?? 60),
		restSeconds: Number(r.rest_seconds ?? row?.restSeconds ?? 0),
		flipFraction: Number(r.flip_fraction ?? row?.flipFraction ?? 0.5),
		idealFlipPattern: row?.idealFlipPattern ?? 'once',
		heatZone: row?.heatZone ?? '—',
		grateTempC: row?.grateTempC ?? null,
	}
}

function sessionFromServer(row: GrilladeRow, rawItems: Array<Record<string, unknown>>, plannedItems: PlannedItem[]): Session {
	const now = Date.now()
	const targetEpoch = row.targetEpoch ?? now
	const scheduled = schedule({ targetEpoch, items: plannedItems, now }).items
	const items: SessionItem[] = plannedItems.map((planned, index) => {
		const raw = rawItems[index]
		const status = String(raw.status ?? 'pending') as SessionItem['status']
		if (status === 'pending') return buildSessionItem(planned, scheduled[index], now)
		const putOnEpoch = Date.parse(String(raw.started_at ?? '')) || now
		const doneEpoch = putOnEpoch + planned.cookSeconds * 1000
		const restingUntilEpoch = doneEpoch + planned.restSeconds * 1000
		return {
			...planned,
			putOnEpoch,
			flipEpoch: planned.flipFraction > 0 ? Math.round(putOnEpoch + planned.cookSeconds * 1000 * planned.flipFraction) : null,
			doneEpoch,
			restingUntilEpoch,
			status,
			overdue: false,
			flipFired: status !== 'cooking',
			platedEpoch: raw.plated_at ? Date.parse(String(raw.plated_at)) : null,
		}
	})
	return {
		id: row.id,
		createdAtEpoch: row.startedEpoch ?? row.updatedEpoch,
		targetEpoch,
		endedAtEpoch: null,
		mode: 'auto',
		items,
	}
}

function toGrilladeRow(r: Record<string, unknown>): GrilladeRow {
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
