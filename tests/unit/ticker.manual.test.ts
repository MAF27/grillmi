import { describe, expect, it } from 'vitest'
import { createTicker, type TickerEvent } from '$lib/runtime/ticker'
import type { SessionItem } from '$lib/models'

const FAR_FUTURE_MS = 365 * 24 * 60 * 60 * 1000

function manualPendingItem(over: Partial<SessionItem> = {}): SessionItem {
	const farFuture = 1_000_000 + FAR_FUTURE_MS
	return {
		id: 'a',
		categorySlug: 'beef',
		cutSlug: 'entrecote',
		thicknessCm: 3,
		prepLabel: null,
		doneness: 'Medium-rare',
		label: 'Steak',
		cookSeconds: 240,
		restSeconds: 0,
		flipFraction: 0.5,
		idealFlipPattern: 'once',
		heatZone: 'Direct high',
		grateTempC: null,
		putOnEpoch: farFuture,
		flipEpoch: null,
		doneEpoch: farFuture,
		restingUntilEpoch: farFuture,
		status: 'pending',
		overdue: false,
		flipFired: false,
		platedEpoch: null,
		alarmDismissed: { putOn: null, flip: null, ready: null },
		...over,
	}
}

describe('ticker: manual mode put-on alarm', () => {
	it('does not fire put-on alarm after the user clicks Los on a manual card', () => {
		const item = manualPendingItem()
		const events: TickerEvent[] = []
		let now = 1_000_000
		const t = createTicker({
			getItems: () => [item],
			updateItem: (_, patch) => Object.assign(item, patch),
			emit: e => events.push(e),
			getLeads: () => ({ putOn: 60, flip: 30, done: 30 }),
			now: () => now,
		})

		// Pre-Los: ticker walks the item with farFuture epochs. Nothing fires.
		t.tickOnce()
		expect(events).toEqual([])

		// User clicks Los: putOn becomes now, status flips to cooking.
		Object.assign(item, {
			putOnEpoch: now,
			doneEpoch: now + item.cookSeconds * 1000,
			restingUntilEpoch: now + item.cookSeconds * 1000,
			status: 'cooking' as const,
			flipEpoch: now + (item.cookSeconds * 1000) / 2,
			flipFired: false,
		})

		now += 16
		t.tickOnce()

		expect(events.find(e => e.type === 'put-on' && e.itemId === item.id)).toBeUndefined()
	})
})
