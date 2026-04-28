import { authStore } from '$lib/stores/authStore.svelte'
import {
	getSyncMeta,
	putFavorite,
	putGrillade,
	putSavedPlan,
	putSettings,
	setSyncMeta,
	type GrilladeRow,
} from '$lib/stores/db'
import { findCutBySlug, findRow } from '$lib/data/timings'
import type { Favorite } from '$lib/schemas'

const LAST_PULL_KEY = 'lastPullEpoch'

interface DeltaResponse<T> {
	rows: T[]
	server_time: string
}

interface ServerSettings {
	value: Record<string, unknown>
	updated_at: string | null
}

export async function pull(): Promise<void> {
	if (!authStore.isAuthenticated) return
	const since = ((await getSyncMeta(LAST_PULL_KEY)) as string | undefined) ?? '1970-01-01T00:00:00Z'
	const params = `?since=${encodeURIComponent(since)}`

	let serverTime: string | null = null
	try {
		const grilladen = await fetchJson<DeltaResponse<Record<string, unknown>>>(`/api/grilladen${params}`)
		if (grilladen) {
			serverTime = grilladen.server_time
			for (const r of grilladen.rows) {
				await putGrillade(toGrilladeRow(r))
			}
		}
	} catch {
		// Network errors leave watermark untouched; next pull retries.
	}

	try {
		const menus = await fetchJson<DeltaResponse<Record<string, unknown>>>(`/api/menus${params}`)
		if (menus) {
			serverTime = menus.server_time
			for (const r of menus.rows) {
				if (r.deleted_at) continue
				await putSavedPlan({
					id: String(r.id),
					name: String(r.name ?? ''),
					items: [],
					createdAtEpoch: Date.parse(String(r.created_at ?? '')) || Date.now(),
					lastUsedEpoch: Date.parse(String(r.updated_at ?? '')) || Date.now(),
				})
			}
		}
	} catch {
		/* noop */
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
	} catch {
		/* noop */
	}

	try {
		const settings = await fetchJson<ServerSettings>(`/api/settings`)
		if (settings && settings.value) {
			await putSettings(settings.value as never)
		}
	} catch {
		/* noop */
	}

	if (serverTime) {
		await setSyncMeta(LAST_PULL_KEY, serverTime)
	}
}

async function fetchJson<T>(path: string): Promise<T | null> {
	const response = await fetch(path, {
		credentials: 'include',
		headers: { Accept: 'application/json' },
	})
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
	}
}
