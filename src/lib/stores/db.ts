import { openDB, type IDBPDatabase } from 'idb'
import type { Session, Favorite, UserSettings } from '$lib/models'

interface GrillmiDB {
	sessions: { key: string; value: Session }
	favorites: { key: string; value: Favorite }
	settings: { key: string; value: UserSettings }
}

const DB_NAME = 'grillmi'
const DB_VERSION = 1
const CURRENT_SESSION_KEY = 'current'
const SETTINGS_KEY = 'user'

let dbPromise: Promise<IDBPDatabase<GrillmiDB>> | null = null

function getDB(): Promise<IDBPDatabase<GrillmiDB>> {
	if (!dbPromise) {
		dbPromise = openDB<GrillmiDB>(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions')
				if (!db.objectStoreNames.contains('favorites')) db.createObjectStore('favorites')
				if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings')
			},
		})
	}
	return dbPromise
}

export async function getCurrentSession(): Promise<Session | undefined> {
	const db = await getDB()
	return db.get('sessions', CURRENT_SESSION_KEY)
}

export async function putCurrentSession(s: Session): Promise<void> {
	const db = await getDB()
	await db.put('sessions', JSON.parse(JSON.stringify(s)) as Session, CURRENT_SESSION_KEY)
}

export async function clearCurrentSession(): Promise<void> {
	const db = await getDB()
	await db.delete('sessions', CURRENT_SESSION_KEY)
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

export async function getSettings(): Promise<UserSettings | undefined> {
	const db = await getDB()
	return db.get('settings', SETTINGS_KEY)
}

export async function putSettings(s: UserSettings): Promise<void> {
	const db = await getDB()
	await db.put('settings', JSON.parse(JSON.stringify(s)) as UserSettings, SETTINGS_KEY)
}

export async function resetAll(): Promise<void> {
	const db = await getDB()
	const tx = db.transaction(['sessions', 'favorites', 'settings'], 'readwrite')
	await Promise.all([tx.objectStore('sessions').clear(), tx.objectStore('favorites').clear(), tx.objectStore('settings').clear()])
	await tx.done
}

// Test-only helper to reset the connection cache (allows fake-indexeddb between tests).
export function __resetForTests(): void {
	dbPromise = null
}
