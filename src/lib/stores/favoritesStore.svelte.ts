import { favoriteSchema, type Favorite, type PlannedItem } from '$lib/schemas'
import { listFavorites, putFavorite, deleteFavorite } from './db'
import { uuid } from '$lib/util/uuid'

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

		async save(name: string, planItems: PlannedItem[]): Promise<Favorite> {
			const now = Date.now()
			const fav: Favorite = favoriteSchema.parse({
				id: uuid(),
				name,
				items: planItems,
				createdAtEpoch: now,
				lastUsedEpoch: now,
			})
			await putFavorite(fav)
			items = [fav, ...items]
			return fav
		},

		async rename(id: string, name: string): Promise<void> {
			const idx = items.findIndex(f => f.id === id)
			if (idx === -1) return
			const updated = { ...items[idx], name }
			await putFavorite(updated)
			items = items.map(f => (f.id === id ? updated : f))
		},

		async remove(id: string): Promise<void> {
			await deleteFavorite(id)
			items = items.filter(f => f.id !== id)
		},

		async touch(id: string): Promise<void> {
			const idx = items.findIndex(f => f.id === id)
			if (idx === -1) return
			const updated = { ...items[idx], lastUsedEpoch: Date.now() }
			await putFavorite(updated)
			items = [updated, ...items.filter(f => f.id !== id)]
		},

		_reset() {
			items = []
			initialized = false
		},
	}
}

export const favoritesStore = createFavoritesStore()
