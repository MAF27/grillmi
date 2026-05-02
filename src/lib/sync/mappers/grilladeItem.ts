import type { GrilladeRow } from '$lib/stores/db'
import { findCutBySlug, findRow } from '$lib/data/timings'
import { buildSessionItem, schedule } from '$lib/scheduler/schedule'
import type { PlannedItem, Session, SessionItem } from '$lib/schemas'

export function plannedItemToServer(item: PlannedItem, index: number): Record<string, unknown> {
	return {
		id: item.id,
		label: item.label ?? item.cutSlug,
		cut_id: item.cutSlug,
		thickness_cm: item.thicknessCm,
		doneness: item.doneness,
		prep_label: item.prepLabel,
		cook_seconds_min: item.cookSeconds,
		cook_seconds_max: item.cookSeconds,
		flip_fraction: item.flipFraction,
		rest_seconds: item.restSeconds,
		status: 'pending',
		started_at: null,
		plated_at: null,
		position: index,
	}
}

export function sessionItemToServer(item: SessionItem, index: number): Record<string, unknown> {
	return {
		...plannedItemToServer(item, index),
		status: item.status,
		started_at: item.status === 'pending' ? null : new Date(item.putOnEpoch).toISOString(),
		plated_at: item.platedEpoch ? new Date(item.platedEpoch).toISOString() : null,
		alarm_state: alarmStateToServer(item.alarmDismissed, item.alarmFired),
	}
}

function alarmStateToServer(
	dismissed: SessionItem['alarmDismissed'],
	fired: SessionItem['alarmFired'],
): Record<string, unknown> {
	return {
		putOn: dismissed.putOn ? new Date(dismissed.putOn).toISOString() : null,
		flip: dismissed.flip ? new Date(dismissed.flip).toISOString() : null,
		ready: dismissed.ready ? new Date(dismissed.ready).toISOString() : null,
		firedAt: {
			putOn: fired.putOn ? new Date(fired.putOn).toISOString() : null,
			flip: fired.flip ? new Date(fired.flip).toISOString() : null,
			ready: fired.ready ? new Date(fired.ready).toISOString() : null,
		},
	}
}

function alarmDismissedFromServer(value: unknown): SessionItem['alarmDismissed'] {
	const empty = { putOn: null, flip: null, ready: null }
	if (!value || typeof value !== 'object') return empty
	const v = value as Record<string, unknown>
	const parse = (key: 'putOn' | 'flip' | 'ready'): number | null => {
		const raw = v[key]
		if (!raw) return null
		const epoch = Date.parse(String(raw))
		return Number.isFinite(epoch) ? epoch : null
	}
	return { putOn: parse('putOn'), flip: parse('flip'), ready: parse('ready') }
}

function alarmFiredFromServer(value: unknown): SessionItem['alarmFired'] {
	const empty = { putOn: null, flip: null, ready: null }
	if (!value || typeof value !== 'object') return empty
	const inner = (value as Record<string, unknown>).firedAt
	if (!inner || typeof inner !== 'object') return empty
	const v = inner as Record<string, unknown>
	const parse = (key: 'putOn' | 'flip' | 'ready'): number | null => {
		const raw = v[key]
		if (!raw) return null
		const epoch = Date.parse(String(raw))
		return Number.isFinite(epoch) ? epoch : null
	}
	return { putOn: parse('putOn'), flip: parse('flip'), ready: parse('ready') }
}

export function plannedItemFromServer(r: Record<string, unknown>): PlannedItem | null {
	const cutSlug = String(r.cut_id ?? '')
	const found = findCutBySlug(cutSlug)
	if (!found) return null
	const thicknessCm = r.thickness_cm == null ? null : Number(r.thickness_cm)
	const doneness = (r.doneness as string | null) ?? null
	const prepLabel = (r.prep_label as string | null) ?? null
	const row = findRow(found.cut, thicknessCm, doneness)
	return {
		id: String(r.id),
		categorySlug: found.category.slug,
		cutSlug: found.cut.slug,
		thicknessCm,
		prepLabel,
		doneness,
		label: (r.label as string | null) ?? null,
		cookSeconds: Number(r.cook_seconds_max ?? r.cook_seconds_min ?? row?.cookSecondsMax ?? 60),
		restSeconds: Number(r.rest_seconds ?? row?.restSeconds ?? 0),
		flipFraction: Number(r.flip_fraction ?? row?.flipFraction ?? 0.5),
		idealFlipPattern: row?.idealFlipPattern ?? 'once',
		heatZone: row?.heatZone ?? '—',
		grateTempC: row?.grateTempC ?? null,
	}
}

export function sessionFromServer(
	row: GrilladeRow,
	rawItems: Array<Record<string, unknown>>,
	plannedItems: PlannedItem[],
): Session {
	const now = Date.now()
	const targetEpoch = row.targetEpoch ?? now
	const scheduled = schedule({ targetEpoch, items: plannedItems, now }).items
	const items: SessionItem[] = plannedItems.map((planned, index) => {
		const raw = rawItems[index]
		const status = String(raw.status ?? 'pending') as SessionItem['status']
		const alarmDismissed = alarmDismissedFromServer(raw.alarm_state)
		const alarmFired = alarmFiredFromServer(raw.alarm_state)
		if (status === 'pending') {
			return { ...buildSessionItem(planned, scheduled[index], now), alarmDismissed, alarmFired }
		}
		const putOnEpoch = Date.parse(String(raw.started_at ?? '')) || now
		const doneEpoch = putOnEpoch + planned.cookSeconds * 1000
		const restingUntilEpoch = doneEpoch + planned.restSeconds * 1000
		return {
			...planned,
			putOnEpoch,
			flipEpoch:
				planned.flipFraction > 0
					? Math.round(putOnEpoch + planned.cookSeconds * 1000 * planned.flipFraction)
					: null,
			doneEpoch,
			restingUntilEpoch,
			status,
			overdue: false,
			flipFired: status !== 'cooking',
			platedEpoch: raw.plated_at ? Date.parse(String(raw.plated_at)) : null,
			alarmDismissed,
			alarmFired,
		}
	})
	return {
		id: row.id,
		createdAtEpoch: row.startedEpoch ?? row.updatedEpoch,
		targetEpoch,
		endedAtEpoch: null,
		mode: 'auto',
		items,
	}
}
