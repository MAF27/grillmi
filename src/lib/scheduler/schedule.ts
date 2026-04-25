import type { PlannedItem, SessionItem } from '$lib/models'

export interface ScheduleInput {
	targetEpoch: number
	items: PlannedItem[]
	now: number
}

export interface ScheduledItem {
	item: PlannedItem
	putOnEpoch: number
	flipEpoch: number | null
	doneEpoch: number
	restingUntilEpoch: number
	overdue: boolean
}

export interface ScheduleResult {
	items: ScheduledItem[]
	overdue: boolean
	earliestPutOn: number
	latestDone: number
}

/**
 * Pure scheduler. Computes per-item put-on / flip / done / resting-until epochs
 * such that every item finishes resting by targetEpoch. Items that would have
 * to start in the past are flagged `overdue` — caller decides UI treatment.
 */
export function schedule({ targetEpoch, items, now }: ScheduleInput): ScheduleResult {
	const scheduled: ScheduledItem[] = items.map(item => {
		const cookMs = item.cookSeconds * 1000
		const restMs = item.restSeconds * 1000
		const restingUntilEpoch = targetEpoch
		const doneEpoch = restingUntilEpoch - restMs
		const putOnEpoch = doneEpoch - cookMs
		const flipEpoch = item.flipFraction > 0 && item.flipFraction < 1 ? putOnEpoch + Math.round(cookMs * item.flipFraction) : null
		const overdue = putOnEpoch < now
		return {
			item,
			putOnEpoch: overdue ? now : putOnEpoch,
			flipEpoch: overdue && flipEpoch !== null ? Math.max(flipEpoch, now) : flipEpoch,
			doneEpoch: overdue ? now + cookMs : doneEpoch,
			restingUntilEpoch: overdue ? now + cookMs + restMs : restingUntilEpoch,
			overdue,
		}
	})

	const earliestPutOn = scheduled.reduce((m, s) => Math.min(m, s.putOnEpoch), Infinity)
	const latestDone = scheduled.reduce((m, s) => Math.max(m, s.restingUntilEpoch), -Infinity)
	return {
		items: scheduled,
		overdue: scheduled.some(s => s.overdue),
		earliestPutOn,
		latestDone,
	}
}

/** Build a SessionItem from a PlannedItem + scheduled epochs. */
export function buildSessionItem(planned: PlannedItem, sched: ScheduledItem, now: number): SessionItem {
	const status: SessionItem['status'] = sched.overdue && sched.putOnEpoch <= now ? 'cooking' : 'pending'
	return {
		...planned,
		putOnEpoch: sched.putOnEpoch,
		flipEpoch: sched.flipEpoch,
		doneEpoch: sched.doneEpoch,
		restingUntilEpoch: sched.restingUntilEpoch,
		status,
		overdue: sched.overdue,
		flipFired: false,
		platedEpoch: null,
	}
}
