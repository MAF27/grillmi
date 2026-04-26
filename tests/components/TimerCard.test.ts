import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
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
		expect(container.querySelector('svg.progress-ring')).toBeTruthy()
	})

	it('test_renders_alarm_firing_state_with_pulse', () => {
		const { container } = render(TimerCard, {
			props: { item: makeItem({ status: 'cooking' }), alarmFiring: true, onplate: () => {}, onlongpress: () => {} },
		})
		expect(container.querySelector('.card.alarm')).toBeTruthy()
	})

	it('test_progress_ring_does_not_render_flip_marker', () => {
		const { container } = render(TimerCard, {
			props: { item: makeItem({ status: 'cooking' }), alarmFiring: false, onplate: () => {} },
		})
		expect(container.querySelector('svg.progress-ring circle.flip')).toBeNull()
	})

	it('test_remove_button_renders_when_onremove_provided_and_invokes_callback', async () => {
		const onremove = vi.fn()
		const { container } = render(TimerCard, {
			props: { item: makeItem({ status: 'cooking' }), alarmFiring: false, onremove },
		})
		const btn = container.querySelector('button.remove') as HTMLButtonElement | null
		expect(btn).toBeTruthy()
		await fireEvent.click(btn!)
		expect(onremove).toHaveBeenCalledTimes(1)
		expect(onremove).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
	})

	it('test_remove_button_absent_when_onremove_not_provided', () => {
		const { container } = render(TimerCard, {
			props: { item: makeItem({ status: 'cooking' }), alarmFiring: false, onplate: () => {} },
		})
		expect(container.querySelector('button.remove')).toBeNull()
	})
})
