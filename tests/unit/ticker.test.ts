import { describe, expect, it } from 'vitest'
import { createTicker, eventsFor, type TickerEvent } from '$lib/runtime/ticker'
import type { SessionItem } from '$lib/models'

function makeItem(over: Partial<SessionItem> = {}): SessionItem {
	const NOW = 1_000_000
	return {
		id: 'a',
		categorySlug: 'beef',
		cutSlug: 'entrecote',
		thicknessCm: 3,
		prepLabel: null,
		doneness: 'Medium-rare',
		label: 'Steak',
		cookSeconds: 360,
		restSeconds: 300,
		flipFraction: 0.5,
		idealFlipPattern: 'once',
		heatZone: 'Direct high',
		grateTempC: null,
		putOnEpoch: NOW + 1000,
		flipEpoch: NOW + 1000 + 180_000,
		doneEpoch: NOW + 1000 + 360_000,
		restingUntilEpoch: NOW + 1000 + 360_000 + 300_000,
		status: 'pending',
		overdue: false,
		flipFired: false,
		platedEpoch: null,
		...over,
	}
}

describe('ticker', () => {
	it('test_ticker_transitions_pending_to_cooking_at_put_on', () => {
		const item = makeItem()
		const events: TickerEvent[] = []
		let now = item.putOnEpoch - 100
		const t = createTicker({
			getItems: () => [item],
			updateItem: (_, patch) => Object.assign(item, patch),
			emit: e => events.push(e),
			now: () => now,
		})
		t.tickOnce()
		expect(item.status).toBe('pending')
		now = item.putOnEpoch + 1
		t.tickOnce()
		expect(item.status).toBe('cooking')
		expect(events.find(e => e.type === 'put-on')).toBeTruthy()
	})

	it('test_ticker_emits_flip_event_once', () => {
		const item = makeItem({ status: 'cooking', putOnEpoch: 0, doneEpoch: 360_000, flipEpoch: 100 })
		const events: TickerEvent[] = []
		let now = 200
		const t = createTicker({
			getItems: () => [item],
			updateItem: (_, patch) => Object.assign(item, patch),
			emit: e => events.push(e),
			now: () => now,
		})
		t.tickOnce()
		t.tickOnce()
		now = 300
		t.tickOnce()
		expect(events.filter(e => e.type === 'flip').length).toBe(1)
	})

	it('test_ticker_transitions_cooking_to_resting_at_done', () => {
		const item = makeItem({ status: 'cooking' })
		const events: TickerEvent[] = []
		const now = item.doneEpoch + 1
		const t = createTicker({
			getItems: () => [item],
			updateItem: (_, patch) => Object.assign(item, patch),
			emit: e => events.push(e),
			now: () => now,
		})
		t.tickOnce()
		expect(item.status).toBe('resting')
		expect(events.find(e => e.type === 'done')).toBeTruthy()
	})

	it('test_ticker_does_not_replay_put_on_after_refresh_when_already_cooking', () => {
		const item = makeItem({ status: 'cooking', putOnEpoch: 0 })
		const events: TickerEvent[] = []
		const t = createTicker({
			getItems: () => [item],
			updateItem: (_, patch) => Object.assign(item, patch),
			emit: e => events.push(e),
			getLeads: () => ({ putOn: 60, flip: 30, done: 30 }),
			now: () => item.putOnEpoch + 120_000,
		})
		t.tickOnce()
		expect(events.find(e => e.type === 'put-on')).toBeUndefined()
	})

	it('test_ticker_does_not_replay_done_after_refresh_when_already_resting_or_ready', () => {
		for (const status of ['resting', 'ready'] as const) {
			const item = makeItem({ status, putOnEpoch: 0, doneEpoch: 100, restingUntilEpoch: status === 'resting' ? 10_000 : 100 })
			const events: TickerEvent[] = []
			const t = createTicker({
				getItems: () => [item],
				updateItem: (_, patch) => Object.assign(item, patch),
				emit: e => events.push(e),
				getLeads: () => ({ putOn: 60, flip: 30, done: 30 }),
				now: () => 1_000,
			})
			t.tickOnce()
			expect(events.find(e => e.type === 'done')).toBeUndefined()
		}
	})

	it('test_ticker_transitions_cooking_to_ready_when_no_rest', () => {
		const item = makeItem({ status: 'cooking', restingUntilEpoch: 0, restSeconds: 0 })
		item.restingUntilEpoch = item.doneEpoch
		const events: TickerEvent[] = []
		const now = item.doneEpoch + 1
		const t = createTicker({
			getItems: () => [item],
			updateItem: (_, patch) => Object.assign(item, patch),
			emit: e => events.push(e),
			now: () => now,
		})
		t.tickOnce()
		expect(item.status).toBe('ready')
		expect(events.find(e => e.type === 'done')).toBeTruthy()
	})

	it('test_ticker_transitions_resting_to_ready', () => {
		const item = makeItem({ status: 'resting' })
		const events: TickerEvent[] = []
		const now = item.restingUntilEpoch + 1
		const t = createTicker({
			getItems: () => [item],
			updateItem: (_, patch) => Object.assign(item, patch),
			emit: e => events.push(e),
			now: () => now,
		})
		t.tickOnce()
		expect(item.status).toBe('ready')
		expect(events.find(e => e.type === 'resting-complete')).toBeTruthy()
	})

	it('test_ticker_skips_plated_items', () => {
		const item = makeItem({ status: 'plated' })
		const events: TickerEvent[] = []
		const t = createTicker({
			getItems: () => [item],
			updateItem: (_, patch) => Object.assign(item, patch),
			emit: e => events.push(e),
			now: () => item.restingUntilEpoch + 1_000_000,
		})
		t.tickOnce()
		expect(item.status).toBe('plated')
		expect(events).toEqual([])
	})

	it('test_eventsFor_returns_full_event_list_in_chronological_order', () => {
		const item = makeItem()
		const list = eventsFor(item)
		const types = list.map(e => e.type)
		expect(types).toEqual(['put-on', 'flip', 'done', 'resting-complete'])
		expect(list.every(e => e.itemId === item.id)).toBe(true)
		for (let i = 1; i < list.length; i++) expect(list[i].at).toBeGreaterThanOrEqual(list[i - 1].at)
	})

	it('test_eventsFor_omits_flip_when_flipEpoch_null_and_resting_when_no_rest', () => {
		const item = makeItem({ flipEpoch: null, restSeconds: 0 })
		item.restingUntilEpoch = item.doneEpoch
		const types = eventsFor(item).map(e => e.type)
		expect(types).toEqual(['put-on', 'done'])
	})
})
