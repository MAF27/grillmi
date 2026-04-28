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
				await putFavorite({
					id: String(r.id),
					name: String(r.label ?? ''),
					cutId: String(r.cut_id ?? ''),
					thicknessCm: r.thickness_cm == null ? undefined : Number(r.thickness_cm),
					doneness: (r.doneness as never) ?? undefined,
					prepLabel: (r.prep_label as string) ?? undefined,
					createdAtEpoch: Date.parse(String(r.created_at ?? '')) || Date.now(),
					lastUsedEpoch: Date.parse(String(r.last_used_at ?? '')) || Date.now(),
				})
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
