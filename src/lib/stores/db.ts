import { openDB, type IDBPDatabase } from 'idb'
import type { Plan, Session, Favorite, SavedPlan, UserSettings } from '$lib/models'

export interface PersistedPlanState {
	plan: Plan
	planMode: 'auto' | 'manual'
}

export interface TimelineEvent {
	kind: 'on' | 'flip' | 'resting' | 'ready' | 'plated'
	itemName: string
	at: number
}

export interface GrilladeRow {
	id: string
	name: string | null
	status: 'planned' | 'running' | 'finished'
	targetEpoch: number | null
	startedEpoch: number | null
	endedEpoch: number | null
	position: number
	updatedEpoch: number
	deletedEpoch: number | null
	planState?: PersistedPlanState
	session?: Session
	timeline?: TimelineEvent[]
}

export interface SyncQueueRow {
	id?: number
	method: string
	path: string
	body?: string
	createdEpoch: number
}

export interface SyncMetaRow {
	key: string
	value: string | number | boolean | null
}

interface GrillmiDB {
	sessions: { key: string; value: Session }
	favorites: { key: string; value: Favorite }
	plans: { key: string; value: SavedPlan }
	settings: { key: string; value: UserSettings }
	planState: { key: string; value: PersistedPlanState }
	grilladen: { key: string; value: GrilladeRow }
	syncQueue: { key: number; value: SyncQueueRow }
	syncMeta: { key: string; value: SyncMetaRow }
}

const DB_NAME = 'grillmi'
const DB_VERSION = 4
const CURRENT_SESSION_KEY = 'current'
const CURRENT_PLAN_KEY = 'current'
const SETTINGS_KEY = 'user'

let dbPromise: Promise<IDBPDatabase<GrillmiDB>> | null = null

function getDB(): Promise<IDBPDatabase<GrillmiDB>> {
	if (!dbPromise) {
		dbPromise = openDB<GrillmiDB>(DB_NAME, DB_VERSION, {
			async upgrade(db, oldVersion, _newVersion, tx) {
				if (oldVersion < 1) {
					db.createObjectStore('sessions')
					db.createObjectStore('favorites')
					db.createObjectStore('settings')
					db.createObjectStore('plans')
				}
				if (oldVersion >= 1 && oldVersion < 2) {
					const oldStore = tx.objectStore('favorites')
					const records = (await oldStore.getAll()) as unknown as SavedPlan[]
					const keys = (await oldStore.getAllKeys()) as string[]
					db.deleteObjectStore('favorites')
					db.createObjectStore('plans')
					db.createObjectStore('favorites')
					if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings')
					if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions')
					const plansStore = tx.objectStore('plans')
					for (let i = 0; i < records.length; i++) {
						const key = keys[i] ?? records[i].id
						await plansStore.put(records[i], key)
					}
				}
				if (oldVersion < 3) {
					if (!db.objectStoreNames.contains('planState')) db.createObjectStore('planState')
				}
				if (oldVersion < 4) {
					db.createObjectStore('grilladen', { keyPath: 'id' })
					db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true })
					db.createObjectStore('syncMeta', { keyPath: 'key' })

					let legacySession: Session | undefined
					let legacyPlanState: PersistedPlanState | undefined
					if (db.objectStoreNames.contains('sessions')) {
						legacySession = (await tx.objectStore('sessions').get(CURRENT_SESSION_KEY)) as Session | undefined
					}
					if (db.objectStoreNames.contains('planState')) {
						legacyPlanState = (await tx
							.objectStore('planState')
							.get(CURRENT_PLAN_KEY)) as PersistedPlanState | undefined
					}
					if (legacySession || legacyPlanState) {
						const grillade: GrilladeRow = {
							id: crypto.randomUUID(),
							name: null,
							status: legacySession ? 'running' : 'planned',
							targetEpoch: (legacyPlanState?.plan as { targetEpoch?: number } | undefined)?.targetEpoch ?? null,
							startedEpoch: legacySession ? Date.now() : null,
							endedEpoch: null,
							position: 0,
							updatedEpoch: Date.now(),
							deletedEpoch: null,
							session: legacySession,
							planState: legacyPlanState,
						}
						await tx.objectStore('grilladen').put(grillade)
					}
					if (db.objectStoreNames.contains('sessions')) db.deleteObjectStore('sessions')
					if (db.objectStoreNames.contains('planState')) db.deleteObjectStore('planState')
				}
			},
		})
	}
	return dbPromise
}

export async function listGrilladen(): Promise<GrilladeRow[]> {
	const db = await getDB()
	const all = await db.getAll('grilladen')
	return all.filter(g => g.deletedEpoch === null).sort((a, b) => a.position - b.position)
}

export async function getGrillade(id: string): Promise<GrilladeRow | undefined> {
	const db = await getDB()
	return db.get('grilladen', id)
}

export async function putGrillade(g: GrilladeRow): Promise<void> {
	const db = await getDB()
	await db.put('grilladen', JSON.parse(JSON.stringify(g)) as GrilladeRow)
}

export async function deleteGrillade(id: string): Promise<void> {
	const db = await getDB()
	const existing = await db.get('grilladen', id)
	if (!existing) return
	existing.deletedEpoch = Date.now()
	existing.updatedEpoch = Date.now()
	await db.put('grilladen', existing)
}

export async function getActiveGrillade(): Promise<GrilladeRow | undefined> {
	const all = await listGrilladen()
	return all.find(g => g.status === 'running' || g.status === 'planned')
}

export async function listFavorites(): Promise<Favorite[]> {
	const db = await getDB()
	const all = await db.getAll('favorites')
	return all.sort((a, b) => b.lastUsedEpoch - a.lastUsedEpoch)
}

export async function putFavorite(f: Favorite): Promise<void> {
	const db = await getDB()
	await db.put('favorites', JSON.parse(JSON.stringify(f)) as Favorite, f.id)
}

export async function deleteFavorite(id: string): Promise<void> {
	const db = await getDB()
	await db.delete('favorites', id)
}

export async function listSavedPlans(): Promise<SavedPlan[]> {
	const db = await getDB()
	const all = await db.getAll('plans')
	return all.sort((a, b) => b.lastUsedEpoch - a.lastUsedEpoch)
}

export async function putSavedPlan(p: SavedPlan): Promise<void> {
	const db = await getDB()
	await db.put('plans', JSON.parse(JSON.stringify(p)) as SavedPlan, p.id)
}

export async function deleteSavedPlan(id: string): Promise<void> {
	const db = await getDB()
	await db.delete('plans', id)
}

export async function getSettings(): Promise<UserSettings | undefined> {
	const db = await getDB()
	return db.get('settings', SETTINGS_KEY)
}

export async function putSettings(s: UserSettings): Promise<void> {
	const db = await getDB()
	await db.put('settings', JSON.parse(JSON.stringify(s)) as UserSettings, SETTINGS_KEY)
}

// Compatibility shims: the legacy session/planState helpers now read and write
// the active Grillade row so existing callers do not need to migrate at once.
export async function getCurrentSession(): Promise<Session | undefined> {
	const active = await getActiveGrillade()
	return active?.session
}

export async function putCurrentSession(s: Session): Promise<void> {
	const active = (await getActiveGrillade()) ?? newDefaultGrillade()
	active.session = JSON.parse(JSON.stringify(s)) as Session
	active.status = 'running'
	active.startedEpoch = active.startedEpoch ?? Date.now()
	active.updatedEpoch = Date.now()
	await putGrillade(active)
}

export async function clearCurrentSession(): Promise<void> {
	const active = await getActiveGrillade()
	if (!active) return
	active.session = undefined
	active.timeline = undefined
	active.status = 'finished'
	active.endedEpoch = Date.now()
	active.updatedEpoch = Date.now()
	await putGrillade(active)
}

export async function getCurrentTimeline(): Promise<TimelineEvent[]> {
	const active = await getActiveGrillade()
	return active?.timeline ?? []
}

export async function appendTimelineEvent(event: TimelineEvent): Promise<TimelineEvent[]> {
	const active = (await getActiveGrillade()) ?? newDefaultGrillade()
	const next = [event, ...(active.timeline ?? [])].slice(0, 60)
	active.timeline = next
	active.updatedEpoch = Date.now()
	await putGrillade(active)
	return next
}

export async function getCurrentPlanState(): Promise<PersistedPlanState | undefined> {
	const active = await getActiveGrillade()
	return active?.planState
}

export async function putCurrentPlanState(state: PersistedPlanState): Promise<void> {
	const active = (await getActiveGrillade()) ?? newDefaultGrillade()
	active.planState = JSON.parse(JSON.stringify(state)) as PersistedPlanState
	active.updatedEpoch = Date.now()
	await putGrillade(active)
}

export async function clearCurrentPlanState(): Promise<void> {
	const active = await getActiveGrillade()
	if (!active) return
	active.planState = undefined
	active.updatedEpoch = Date.now()
	await putGrillade(active)
}

function newDefaultGrillade(): GrilladeRow {
	return {
		id: crypto.randomUUID(),
		name: null,
		status: 'planned',
		targetEpoch: null,
		startedEpoch: null,
		endedEpoch: null,
		position: 0,
		updatedEpoch: Date.now(),
		deletedEpoch: null,
	}
}

export async function listSyncQueue(): Promise<SyncQueueRow[]> {
	const db = await getDB()
	return db.getAll('syncQueue')
}

export async function enqueueSyncRow(row: Omit<SyncQueueRow, 'id'>): Promise<number> {
	const db = await getDB()
	return (await db.add('syncQueue', row as SyncQueueRow)) as number
}

export async function popSyncRow(id: number): Promise<void> {
	const db = await getDB()
	await db.delete('syncQueue', id)
}

export async function getSyncMeta(key: string): Promise<SyncMetaRow['value'] | undefined> {
	const db = await getDB()
	const row = await db.get('syncMeta', key)
	return row?.value
}

export async function setSyncMeta(key: string, value: SyncMetaRow['value']): Promise<void> {
	const db = await getDB()
	await db.put('syncMeta', { key, value })
}

export async function resetAll(): Promise<void> {
	const db = await getDB()
	const stores: (keyof GrillmiDB)[] = ['favorites', 'plans', 'settings', 'grilladen', 'syncQueue', 'syncMeta']
	const tx = db.transaction(stores, 'readwrite')
	await Promise.all(stores.map(name => tx.objectStore(name).clear()))
	await tx.done
}

// Test-only helper to reset the connection cache (allows fake-indexeddb between tests).
export function __resetForTests(): void {
	dbPromise = null
}
