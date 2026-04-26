import { savedPlanSchema, type SavedPlan, type PlannedItem } from '$lib/schemas'
import { listSavedPlans, putSavedPlan, deleteSavedPlan } from './db'
import { uuid } from '$lib/util/uuid'

function createSavedPlansStore() {
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

		async save(name: string, planItems: PlannedItem[]): Promise<SavedPlan> {
			const now = Date.now()
			const plan: SavedPlan = savedPlanSchema.parse({
				id: uuid(),
				name,
				items: planItems,
				createdAtEpoch: now,
				lastUsedEpoch: now,
			})
			await putSavedPlan(plan)
			items = [plan, ...items]
			return plan
		},

		async rename(id: string, name: string): Promise<void> {
			const idx = items.findIndex(p => p.id === id)
			if (idx === -1) return
			const updated = { ...items[idx], name }
			await putSavedPlan(updated)
			items = items.map(p => (p.id === id ? updated : p))
		},

		async remove(id: string): Promise<void> {
			await deleteSavedPlan(id)
			items = items.filter(p => p.id !== id)
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

export const savedPlansStore = createSavedPlansStore()
