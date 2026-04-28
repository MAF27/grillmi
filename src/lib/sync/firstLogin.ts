import { listFavorites, listGrilladen, listSavedPlans, getSettings, setSyncMeta } from '$lib/stores/db'
import { enqueueSyncRow } from '$lib/stores/db'
import { authStore } from '$lib/stores/authStore.svelte'

const FIRST_LOGIN_KEY = 'firstLoginMigrationComplete'

export async function runFirstLoginImport(): Promise<void> {
	const grilladen = await listGrilladen()
	const favorites = await listFavorites()
	const menus = await listSavedPlans()
	const settings = await getSettings()

	const payload = {
		grilladen: grilladen.map(g => ({
			id: g.id,
			name: g.name,
			status: g.status,
			target_finish_at: g.targetEpoch ? new Date(g.targetEpoch).toISOString() : null,
			started_at: g.startedEpoch ? new Date(g.startedEpoch).toISOString() : null,
			ended_at: g.endedEpoch ? new Date(g.endedEpoch).toISOString() : null,
			position: g.position,
		})),
		menus: menus.map((m, i) => ({ id: m.id, name: m.name, position: i })),
		favorites: favorites.map((f, i) => ({
			id: f.id,
			label: f.name,
			cut_id: f.cutSlug,
			thickness_cm: f.thicknessCm ?? null,
			doneness: f.doneness ?? null,
			prep_label: f.prepLabel ?? null,
			position: i,
			last_used_at: new Date(f.lastUsedEpoch).toISOString(),
		})),
		settings: settings ?? null,
	}

	const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
	if (authStore.csrfToken) headers['X-CSRFToken'] = authStore.csrfToken

	try {
		const response = await fetch('/api/sync/import', {
			method: 'POST',
			credentials: 'include',
			headers,
			body: JSON.stringify(payload),
		})
		if (response.ok) {
			await setSyncMeta(FIRST_LOGIN_KEY, true)
			return
		}
	} catch {
		// fall through to enqueue
	}

	await enqueueSyncRow({
		method: 'POST',
		path: '/api/sync/import',
		body: JSON.stringify(payload),
		createdEpoch: Date.now(),
	})
	await setSyncMeta(FIRST_LOGIN_KEY, true)
}
