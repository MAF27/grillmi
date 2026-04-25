import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/svelte'
import TimerCard from '$lib/components/TimerCard.svelte'
import type { SessionItem } from '$lib/models'

function makeItem(over: Partial<SessionItem> = {}): SessionItem {
	const NOW = Date.now()
	return {
		id: '11111111-1111-4111-8111-111111111111',
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
		putOnEpoch: NOW + 10_000,
		flipEpoch: NOW + 100_000,
		doneEpoch: NOW + 360_000,
		restingUntilEpoch: NOW + 660_000,
		status: 'pending',
		overdue: false,
		flipFired: false,
		platedEpoch: null,
		...over,
	}
}

describe('TimerCard', () => {
	it('test_renders_pending_state_with_state_color', () => {
		const { container } = render(TimerCard, {
			props: { item: makeItem(), alarmFiring: false, onplate: () => {}, onlongpress: () => {} },
		})
		const card = container.querySelector('[data-testid="timer-card"]')
		expect(card?.getAttribute('data-state')).toBe('pending')
	})

	it('test_renders_cooking_state_with_progress_ring', () => {
		const { container } = render(TimerCard, {
			props: { item: makeItem({ status: 'cooking' }), alarmFiring: false, onplate: () => {}, onlongpress: () => {} },
		})
		const card = container.querySelector('[data-testid="timer-card"]')
		expect(card?.getAttribute('data-state')).toBe('cooking')
		expect(container.querySelector('svg.ring')).toBeTruthy()
	})

	it('test_renders_alarm_firing_state_with_pulse', () => {
		const { container } = render(TimerCard, {
			props: { item: makeItem({ status: 'cooking' }), alarmFiring: true, onplate: () => {}, onlongpress: () => {} },
		})
		expect(container.querySelector('.card.alarm')).toBeTruthy()
	})
})
