import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import TimerCard from '$lib/components/TimerCard.svelte'
import type { SessionItem } from '$lib/models'
import { settingsStore } from '$lib/stores/settingsStore.svelte'

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
		grateTempC: null,
		putOnEpoch: NOW + 10_000,
		flipEpoch: NOW + 100_000,
		doneEpoch: NOW + 360_000,
		restingUntilEpoch: NOW + 660_000,
		status: 'pending',
		overdue: false,
		flipFired: false,
		platedEpoch: null,
		alarmDismissed: { putOn: null, flip: null, ready: null },
		...over,
	}
}

describe('TimerCard', () => {
	afterEach(() => {
		settingsStore._reset()
		vi.useRealTimers()
	})

	it('test_renders_pending_state_with_state_color', () => {
		const { container } = render(TimerCard, {
			props: {
				item: makeItem({ putOnEpoch: Date.now() + 20_000 }),
				alarmFiring: false,
				onplate: () => {},
				onlongpress: () => {},
			},
		})
		const card = container.querySelector('[data-testid="timer-card"]')
		expect(card?.getAttribute('data-state')).toBe('pending')
	})

	it('test_renders_put_on_vorlauf_as_own_countdown_phase', async () => {
		const now = new Date('2026-04-30T12:00:00Z')
		await settingsStore.setLead('putOn', 60)
		vi.useFakeTimers()
		vi.setSystemTime(now)
		const { container, getByText } = render(TimerCard, {
			props: {
				item: makeItem({
					putOnEpoch: now.getTime() + 30_000,
					flipEpoch: now.getTime() + 180_000,
					doneEpoch: now.getTime() + 360_000,
					restingUntilEpoch: now.getTime() + 660_000,
				}),
			},
		})
		const card = container.querySelector('[data-testid="timer-card"]')
		expect(card?.getAttribute('data-state')).toBe('put-on-soon')
		expect(getByText('AUFLEGEN IN')).toBeTruthy()
		expect(getByText('00:30')).toBeTruthy()
	})

	it('test_pending_card_counts_down_to_vorlauf_start_when_put_on_lead_exists', async () => {
		const now = new Date('2026-04-30T12:00:00Z')
		await settingsStore.setLead('putOn', 60)
		vi.useFakeTimers()
		vi.setSystemTime(now)
		const { container, getByText } = render(TimerCard, {
			props: {
				item: makeItem({
					putOnEpoch: now.getTime() + 90_000,
					flipEpoch: now.getTime() + 180_000,
					doneEpoch: now.getTime() + 360_000,
					restingUntilEpoch: now.getTime() + 660_000,
				}),
			},
		})
		const card = container.querySelector('[data-testid="timer-card"]')
		expect(card?.getAttribute('data-state')).toBe('pending')
		expect(getByText('BIS VORLAUF')).toBeTruthy()
		expect(getByText('00:30')).toBeTruthy()
	})

	it('test_renders_cooking_state_with_progress_ring', () => {
		const { container } = render(TimerCard, {
			props: { item: makeItem({ status: 'cooking' }), alarmFiring: false, onplate: () => {}, onlongpress: () => {} },
		})
		const card = container.querySelector('[data-testid="timer-card"]')
		expect(card?.getAttribute('data-state')).toBe('cooking')
		expect(container.querySelector('svg.progress-ring')).toBeTruthy()
	})

	it('test_heat_line_omits_grill_method', () => {
		const { getByText, queryByText } = render(TimerCard, {
			props: {
				item: makeItem({ grateTempC: 230, heatZone: 'Direkt, Deckel zu' }),
				alarmFiring: false,
				onplate: () => {},
			},
		})
		expect(getByText('3 cm · Medium-rare · 230 °C')).toBeTruthy()
		expect(queryByText(/Direkt/)).toBeNull()
	})

	it('test_generated_label_does_not_repeat_specs_in_timer_title', () => {
		const { container, getByText, queryByText } = render(TimerCard, {
			props: {
				item: makeItem({
					label: 'Rinds-Entrecôte 1 cm, rare',
					thicknessCm: 1,
					doneness: 'rare',
					grateTempC: 230,
				}),
				alarmFiring: false,
				onplate: () => {},
			},
		})
		expect(container.querySelector('.name')?.textContent?.trim()).toBe('Rinds-Entrecôte')
		expect(getByText('1 cm · rare · 230 °C')).toBeTruthy()
		expect(queryByText('Rinds-Entrecôte 1 cm, rare')).toBeNull()
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

	it('test_unstarted_card_renders_los_button_and_calls_onstart', async () => {
		const onstart = vi.fn()
		const { getByText } = render(TimerCard, {
			props: { item: makeItem({ status: 'pending' }), status: 'unstarted', alarmFiring: false, onstart },
		})
		await fireEvent.click(getByText('Los'))
		expect(onstart).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
	})

	it('test_ready_card_renders_anrichten_button_and_calls_onplate', async () => {
		const onplate = vi.fn()
		const { getByText } = render(TimerCard, {
			props: { item: makeItem({ status: 'ready' }), alarmFiring: false, onplate },
		})
		await fireEvent.click(getByText('Anrichten'))
		expect(onplate).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
	})

	it('test_ready_card_swipe_past_threshold_calls_onplate', async () => {
		const onplate = vi.fn()
		const { container } = render(TimerCard, {
			props: { item: makeItem({ status: 'ready' }), alarmFiring: false, onplate },
		})
		const card = container.querySelector('[data-testid="timer-card"]') as HTMLElement
		await fireEvent.touchStart(card, { touches: [{ clientX: 0 }] })
		await fireEvent.touchMove(card, { touches: [{ clientX: 90 }] })
		await fireEvent.touchEnd(card)
		expect(onplate).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
	})

	it('test_long_press_invokes_onlongpress', async () => {
		vi.useFakeTimers()
		const onlongpress = vi.fn()
		const { container } = render(TimerCard, {
			props: { item: makeItem({ status: 'cooking' }), alarmFiring: false, onlongpress },
		})
		const card = container.querySelector('[data-testid="timer-card"]') as HTMLElement
		await fireEvent.touchStart(card, { touches: [{ clientX: 0 }] })
		vi.advanceTimersByTime(550)
		expect(onlongpress).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
		vi.useRealTimers()
	})
})
