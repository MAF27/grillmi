import { savedPlanSchema, type SavedPlan, type PlannedItem } from '$lib/schemas'
import { listSavedPlans, putSavedPlan, deleteSavedPlan } from './db'
import { uuid } from '$lib/util/uuid'
import { enqueueSync } from '$lib/sync/queue'

function createMenusStore() {
	let items = $state<SavedPlan[]>([])
	let initialized = false

	return {
		get all() {
			return items
		},

		async init() {
			if (initialized) return
			initialized = true
			items = await listSavedPlans()
		},

		async save(name: string, menuItems: PlannedItem[]): Promise<SavedPlan> {
			const now = Date.now()
			const menu: SavedPlan = savedPlanSchema.parse({
				id: uuid(),
				name,
				items: menuItems,
				createdAtEpoch: now,
				lastUsedEpoch: now,
			})
			await putSavedPlan(menu)
			items = [menu, ...items]
			void enqueueSync({
				method: 'POST',
				path: '/api/menus',
				body: JSON.stringify({ id: menu.id, name: menu.name, position: 0 }),
			})
			return menu
		},

		async rename(id: string, name: string): Promise<void> {
			const idx = items.findIndex(p => p.id === id)
			if (idx === -1) return
			const updated = { ...items[idx], name }
			await putSavedPlan(updated)
			items = items.map(p => (p.id === id ? updated : p))
			void enqueueSync({
				method: 'PATCH',
				path: `/api/menus/${id}`,
				body: JSON.stringify({ name }),
			})
		},

		async remove(id: string): Promise<void> {
			await deleteSavedPlan(id)
			items = items.filter(p => p.id !== id)
			void enqueueSync({ method: 'DELETE', path: `/api/menus/${id}` })
		},

		async touch(id: string): Promise<void> {
			const idx = items.findIndex(p => p.id === id)
			if (idx === -1) return
			const updated = { ...items[idx], lastUsedEpoch: Date.now() }
			await putSavedPlan(updated)
			items = [updated, ...items.filter(p => p.id !== id)]
		},

		_reset() {
			items = []
			initialized = false
		},
	}
}

export const menusStore = createMenusStore()
