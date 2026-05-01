import type { Plan, Session } from '$lib/models'
import { debugSync } from '$lib/sync/debug'
import { pushGrilladeCreate, pushGrilladeUpdate, pushPlannedItems, pushSessionItems } from '$lib/sync/pushGrillade'
import { getActiveGrillade, listGrilladen, putGrillade, type GrilladeRow } from './db'

export async function pushPlannedDraft(plan: Plan): Promise<void> {
	const active = await getActiveGrillade()
	if (!active || active.status !== 'planned') {
		debugSync('grilladeStore', 'push planned skipped', { activeId: active?.id, status: active?.status })
		return
	}
	debugSync('grilladeStore', 'push planned start', {
		id: active.id,
		pushedToServer: Boolean(active.pushedToServer),
		items: plan.items.length,
	})
	await repairMissingServerRow(active)
	if (!(await queueGrillade(active))) return
	active.syncedItemIds = await pushPlannedItems(active, plan.items)
	await putGrillade(active)
	debugSync('grilladeStore', 'push planned queued', { id: active.id, syncedItemIds: active.syncedItemIds })
}

export async function pushRunningSession(session: Session | null): Promise<void> {
	const active = await getActiveGrillade()
	if (!active || active.status !== 'running' || !session) {
		debugSync('grilladeStore', 'push running skipped', {
			activeId: active?.id,
			status: active?.status,
			hasSession: Boolean(session),
		})
		return
	}
	debugSync('grilladeStore', 'push running start', {
		id: active.id,
		pushedToServer: Boolean(active.pushedToServer),
		items: session.items.length,
	})
	await repairMissingServerRow(active)
	if (!(await queueGrillade(active))) return
	active.syncedItemIds = await pushSessionItems(active, session.items)
	await putGrillade(active)
	debugSync('grilladeStore', 'push running queued', { id: active.id, syncedItemIds: active.syncedItemIds })
}

export async function pushFinishedGrillade(): Promise<void> {
	const all = await listGrilladen()
	const recent = all
		.filter(g => g.status === 'finished' && g.deletedEpoch === null)
		.sort((a, b) => (b.endedEpoch ?? 0) - (a.endedEpoch ?? 0))[0]
	if (!recent) return
	if (!(await queueGrillade(recent))) return
	if (!recent.pushedToServer) await putGrillade(recent)
}

async function queueGrillade(row: GrilladeRow): Promise<boolean> {
	if (!row.pushedToServer) {
		const queued = await pushGrilladeCreate(row)
		if (queued) row.pushedToServer = true
		return queued
	}
	return pushGrilladeUpdate(row)
}

async function repairMissingServerRow(row: GrilladeRow): Promise<void> {
	if (!row.pushedToServer || typeof fetch === 'undefined') return
	try {
		const response = await fetch(`/api/grilladen/${row.id}`, { credentials: 'include', headers: { Accept: 'application/json' } })
		debugSync('grilladeStore', 'server row check', { id: row.id, status: response.status })
		if (response.status !== 404) return
		row.pushedToServer = false
		row.syncedItemIds = []
		await putGrillade(row)
		debugSync('grilladeStore', 'server row missing: reset push flags', { id: row.id })
	} catch (error) {
		debugSync('grilladeStore', 'server row check error', { id: row.id, error: String(error) })
	}
}
