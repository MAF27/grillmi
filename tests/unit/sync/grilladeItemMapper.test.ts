import { describe, expect, it } from 'vitest'
import {
	plannedItemFromServer,
	plannedItemToServer,
	sessionFromServer,
	sessionItemToServer,
} from '$lib/sync/mappers/grilladeItem'
import type { PlannedItem, SessionItem } from '$lib/schemas'
import type { GrilladeRow } from '$lib/stores/db'

const PLANNED: PlannedItem = {
	id: 'p1',
	categorySlug: 'beef',
	cutSlug: 'rinds-entrecote',
	thicknessCm: 3,
	prepLabel: null,
	doneness: 'medium-rare',
	label: 'Entrecôte',
	cookSeconds: 600,
	restSeconds: 300,
	flipFraction: 0.5,
	idealFlipPattern: 'once',
	heatZone: '—',
	grateTempC: 230,
}

describe('grilladeItemMapper', () => {
	it('plannedItemToServer matches legacy serialization', () => {
		expect(plannedItemToServer(PLANNED, 0)).toEqual({
			id: 'p1',
			label: 'Entrecôte',
			cut_id: 'rinds-entrecote',
			thickness_cm: 3,
			doneness: 'medium-rare',
			prep_label: null,
			cook_seconds_min: 600,
			cook_seconds_max: 600,
			flip_fraction: 0.5,
			rest_seconds: 300,
			status: 'pending',
			started_at: null,
			plated_at: null,
			position: 0,
		})
	})

	it('plannedItemToServer falls back to cutSlug when label is null', () => {
		const noLabel: PlannedItem = { ...PLANNED, label: null }
		expect(plannedItemToServer(noLabel, 0).label).toBe('rinds-entrecote')
	})

	it('sessionItemToServer preserves status and started_at semantics', () => {
		const base: SessionItem = {
			...PLANNED,
			id: 's1',
			putOnEpoch: 1714579200000,
			flipEpoch: 1714579500000,
			doneEpoch: 1714579800000,
			restingUntilEpoch: 1714579920000,
			status: 'pending',
			overdue: false,
			flipFired: false,
			platedEpoch: null,
			alarmDismissed: { putOn: null, flip: null, ready: null },
		}
		expect(sessionItemToServer(base, 0).started_at).toBeNull()
		expect(sessionItemToServer({ ...base, status: 'cooking' }, 0).started_at).toBe('2024-05-01T16:00:00.000Z')
		expect(sessionItemToServer({ ...base, status: 'resting' }, 0).status).toBe('resting')
		expect(sessionItemToServer({ ...base, status: 'ready' }, 0).status).toBe('ready')
		expect(
			sessionItemToServer({ ...base, status: 'plated', platedEpoch: 1714580000000 }, 1),
		).toMatchObject({
			status: 'plated',
			plated_at: '2024-05-01T16:13:20.000Z',
			position: 1,
		})
	})

	it('plannedItemFromServer recovers cookSeconds when server omits it', () => {
		const server = {
			id: 'p',
			cut_id: 'rinds-entrecote',
			thickness_cm: 3,
			doneness: 'medium-rare',
			prep_label: null,
			label: 'Entrecôte',
			cook_seconds_min: null,
			cook_seconds_max: null,
			rest_seconds: null,
			flip_fraction: null,
		}
		expect(plannedItemFromServer(server)).toMatchObject({
			cookSeconds: 600,
			restSeconds: 300,
			flipFraction: 0.5,
		})
	})

	it('plannedItemFromServer returns null when cut_id is unknown', () => {
		expect(plannedItemFromServer({ cut_id: 'no-such-cut' })).toBeNull()
	})

	it('sessionItemToServer serializes alarm dismissal timestamps as ISO strings', () => {
		const item: SessionItem = {
			...PLANNED,
			id: 's2',
			putOnEpoch: 1714579200000,
			flipEpoch: 1714579500000,
			doneEpoch: 1714579800000,
			restingUntilEpoch: 1714579920000,
			status: 'cooking',
			overdue: false,
			flipFired: false,
			platedEpoch: null,
			alarmDismissed: { putOn: 1714579250000, flip: null, ready: null },
		}
		expect(sessionItemToServer(item, 0).alarm_state).toEqual({
			putOn: '2024-05-01T16:00:50.000Z',
			flip: null,
			ready: null,
		})
	})

	it('sessionFromServer hydrates alarmDismissed from server alarm_state for pending and running items', () => {
		const future = Date.now() + 60 * 60 * 1000
		const startedAt = Date.now() - 30 * 1000
		const row: GrilladeRow = {
			id: 'g',
			name: 'X',
			status: 'running',
			targetEpoch: future,
			startedEpoch: startedAt,
			endedEpoch: null,
			position: 0,
			updatedEpoch: startedAt,
			deletedEpoch: null,
		}
		const planned: PlannedItem[] = [PLANNED, { ...PLANNED, id: 'p2' }]
		const rawItems = [
			{
				status: 'cooking',
				started_at: new Date(startedAt).toISOString(),
				alarm_state: { flip: '2024-05-01T16:05:00.000Z' },
			},
			{
				status: 'pending',
				started_at: null,
				alarm_state: { putOn: '2024-05-01T15:55:00.000Z', flip: null, ready: null },
			},
		]
		const session = sessionFromServer(row, rawItems, planned)
		expect(session.items[0].alarmDismissed).toEqual({
			putOn: null,
			flip: Date.parse('2024-05-01T16:05:00.000Z'),
			ready: null,
		})
		expect(session.items[1].alarmDismissed).toEqual({
			putOn: Date.parse('2024-05-01T15:55:00.000Z'),
			flip: null,
			ready: null,
		})
	})

	it('sessionFromServer reconstructs SessionItem timing for an in-flight running grillade', () => {
		// Pin targetEpoch far in the future so the scheduler doesn't flag pending
		// items as overdue (which would flip status to 'cooking').
		const future = Date.now() + 60 * 60 * 1000
		const startedAt = Date.now() - 30 * 1000
		const row: GrilladeRow = {
			id: 'g',
			name: 'X',
			status: 'running',
			targetEpoch: future,
			startedEpoch: startedAt,
			endedEpoch: null,
			position: 0,
			updatedEpoch: startedAt,
			deletedEpoch: null,
		}
		const planned: PlannedItem[] = [PLANNED, { ...PLANNED, id: 'p2' }]
		const rawItems = [
			{ status: 'cooking', started_at: new Date(startedAt).toISOString() },
			{ status: 'pending', started_at: null },
		]
		const session = sessionFromServer(row, rawItems, planned)
		expect(session.id).toBe('g')
		expect(session.items).toHaveLength(2)
		expect(session.items[0].status).toBe('cooking')
		expect(session.items[0].putOnEpoch).toBe(startedAt)
		expect(session.items[0].doneEpoch).toBe(startedAt + 600 * 1000)
		expect(session.items[0].restingUntilEpoch).toBe(startedAt + 600 * 1000 + 300 * 1000)
		expect(session.items[1].status).toBe('pending')
	})
})
