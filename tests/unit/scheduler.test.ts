import { describe, expect, it } from 'vitest'
import { schedule } from '$lib/scheduler/schedule'
import type { PlannedItem } from '$lib/models'

function item(over: Partial<PlannedItem> = {}): PlannedItem {
	return {
		id: 'test',
		categorySlug: 'beef',
		cutSlug: 'rinds-entrecote',
		thicknessCm: 3,
		prepLabel: null,
		doneness: 'Medium-rare',
		label: 'Test',
		cookSeconds: 360,
		restSeconds: 300,
		flipFraction: 0.5,
		idealFlipPattern: 'once',
		heatZone: 'Direct high',
		...over,
	}
}

const NOW = 1_700_000_000_000

describe('scheduler', () => {
	it('test_schedule_single_item_aligns_put_on_to_target_minus_cook_minus_rest', () => {
		const target = NOW + 60 * 60 * 1000
		const r = schedule({ targetEpoch: target, items: [item()], now: NOW })
		const s = r.items[0]
		expect(s.restingUntilEpoch).toBe(target)
		expect(s.doneEpoch).toBe(target - 300_000)
		expect(s.putOnEpoch).toBe(target - 300_000 - 360_000)
		expect(s.overdue).toBe(false)
	})

	it('test_schedule_multi_item_all_finish_at_target', () => {
		const target = NOW + 60 * 60 * 1000
		const r = schedule({
			targetEpoch: target,
			items: [
				item({ id: 'a', cookSeconds: 360, restSeconds: 300 }),
				item({ id: 'b', cookSeconds: 600, restSeconds: 0 }),
				item({ id: 'c', cookSeconds: 120, restSeconds: 60 }),
			],
			now: NOW,
		})
		for (const s of r.items) expect(s.restingUntilEpoch).toBe(target)
	})

	it('test_schedule_with_rest_time_baked_in', () => {
		const target = NOW + 60 * 60 * 1000
		const r = schedule({ targetEpoch: target, items: [item({ restSeconds: 600 })], now: NOW })
		expect(r.items[0].doneEpoch).toBe(target - 600_000)
	})

	it('test_schedule_flip_at_50_percent_default', () => {
		const target = NOW + 60 * 60 * 1000
		const r = schedule({ targetEpoch: target, items: [item({ flipFraction: 0.5 })], now: NOW })
		const s = r.items[0]
		expect(s.flipEpoch).toBe(s.putOnEpoch + 180_000)
	})

	it('test_schedule_flip_at_cut_override', () => {
		const target = NOW + 60 * 60 * 1000
		const r = schedule({ targetEpoch: target, items: [item({ flipFraction: 0.25 })], now: NOW })
		const s = r.items[0]
		expect(s.flipEpoch).toBe(s.putOnEpoch + 90_000)
	})

	it('test_schedule_overdue_item', () => {
		const target = NOW + 60_000
		const r = schedule({ targetEpoch: target, items: [item({ cookSeconds: 1800, restSeconds: 0 })], now: NOW })
		expect(r.overdue).toBe(true)
		expect(r.items[0].overdue).toBe(true)
		expect(r.items[0].putOnEpoch).toBe(NOW)
	})
})
