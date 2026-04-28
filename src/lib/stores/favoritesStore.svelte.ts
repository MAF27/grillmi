import { favoriteSchema, type Favorite } from '$lib/schemas'
import { listFavorites, putFavorite, deleteFavorite } from './db'
import { uuid } from '$lib/util/uuid'
import { enqueueSync } from '$lib/sync/queue'

export type FavoriteConfig = Omit<Favorite, 'id' | 'createdAtEpoch' | 'lastUsedEpoch'>

function favToServer(f: Favorite, position = 0) {
	return {
		id: f.id,
		label: f.name,
		cut_id: f.cutSlug,
		thickness_cm: f.thicknessCm ?? null,
		doneness: f.doneness ?? null,
		prep_label: f.prepLabel ?? null,
		position,
		last_used_at: new Date(f.lastUsedEpoch).toISOString(),
	}
}

function createFavoritesStore() {
	let items = $state<Favorite[]>([])
	let initialized = false

	return {
		get all() {
			return items
		},

		async init() {
			if (initialized) return
			initialized = true
			items = await listFavorites()
		},

		async save(config: FavoriteConfig): Promise<Favorite> {
			const now = Date.now()
			const fav: Favorite = favoriteSchema.parse({
				id: uuid(),
				createdAtEpoch: now,
				lastUsedEpoch: now,
				...config,
			})
			await putFavorite(fav)
			items = [fav, ...items]
			void enqueueSync({
				method: 'POST',
				path: '/api/favorites',
				body: JSON.stringify(favToServer(fav)),
			})
			return fav
		},

		async rename(id: string, name: string): Promise<void> {
			const idx = items.findIndex(f => f.id === id)
			if (idx === -1) return
			const updated = { ...items[idx], name }
			await putFavorite(updated)
			items = items.map(f => (f.id === id ? updated : f))
			void enqueueSync({
				method: 'PATCH',
				path: `/api/favorites/${id}`,
				body: JSON.stringify({ label: name }),
			})
		},

		async remove(id: string): Promise<void> {
			await deleteFavorite(id)
			items = items.filter(f => f.id !== id)
			void enqueueSync({ method: 'DELETE', path: `/api/favorites/${id}` })
		},

		async touch(id: string): Promise<void> {
			const idx = items.findIndex(f => f.id === id)
			if (idx === -1) return
			const updated = { ...items[idx], lastUsedEpoch: Date.now() }
			await putFavorite(updated)
			items = [updated, ...items.filter(f => f.id !== id)]
			void enqueueSync({
				method: 'PATCH',
				path: `/api/favorites/${id}`,
				body: JSON.stringify({ last_used_at: new Date(updated.lastUsedEpoch).toISOString() }),
			})
		},

		_reset() {
			items = []
			initialized = false
		},
	}
}

export const favoritesStore = createFavoritesStore()
