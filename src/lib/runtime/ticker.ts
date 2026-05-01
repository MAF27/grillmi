import type { SessionItem, ItemStatus, ScheduleEvent } from '$lib/models'
import { debugSync } from '$lib/sync/debug'

export type TickerEvent =
	| { type: 'put-on'; itemId: string; leadSeconds: number }
	| { type: 'flip'; itemId: string; leadSeconds: number }
	| { type: 'done'; itemId: string; leadSeconds: number }
	| { type: 'resting-complete'; itemId: string }

export interface TickerLeads {
	putOn: number
	flip: number
	done: number
}

export interface TickerHooks {
	getItems(): SessionItem[]
	updateItem(id: string, patch: Partial<SessionItem>): void
	emit(event: TickerEvent): void
	getLeads?: () => TickerLeads
	now?: () => number
}

/**
 * A minimal RAF-driven ticker. Each frame, it walks the current items and
 * computes the *correct* state from absolute wall-clock — never accumulating
 * deltas. Backgrounded tabs simply catch up on their next frame. The ticker
 * owns no state of its own beyond which transitions it has already announced
 * (so we don't emit a put-on twice).
 */
export function createTicker(hooks: TickerHooks) {
	let raf: number | null = null
	let timer: ReturnType<typeof setTimeout> | null = null
	const fired = new Set<string>()
	const now = () => (hooks.now ? hooks.now() : Date.now())

	function primeExistingAlarms() {
		const t = now()
		const leads = hooks.getLeads ? hooks.getLeads() : { putOn: 0, flip: 0, done: 0 }
		const primed: string[] = []
		for (const item of hooks.getItems()) {
			const target = computeStatus(item, t)
			if (target.status === 'plated') continue
			// Put-on: only suppress on resume after the item already started
			// cooking. In Jetzt Modus the slowest item has putOnEpoch=now and
			// status=pending; the alarm must fire on the first tick.
			if (item.status !== 'pending' && t >= item.putOnEpoch - leads.putOn * 1000) {
				fired.add(`${item.id}:put-on`)
				primed.push(`${item.id}:put-on`)
			}
			// Flip: suppress if the alarm already fired (flipFired) or the cook
			// is already over (target is resting or ready). A user mid-cook who
			// missed the flip moment still gets a single replay on next tick.
			const flipPassed = item.flipFired || target.status === 'resting' || target.status === 'ready'
			if (item.flipEpoch !== null && flipPassed && t >= item.flipEpoch - leads.flip * 1000) {
				fired.add(`${item.id}:flip`)
				primed.push(`${item.id}:flip`)
			}
			// Done: suppress if cooking is already over.
			if ((target.status === 'resting' || target.status === 'ready') && t >= item.doneEpoch - leads.done * 1000) {
				fired.add(`${item.id}:done`)
				primed.push(`${item.id}:done`)
			}
		}
		debugSync('ticker', 'primed existing alarms', { count: primed.length, primed, now: t, leads })
	}

	function tick() {
		const t = now()
		const leads = hooks.getLeads ? hooks.getLeads() : { putOn: 0, flip: 0, done: 0 }
		for (const item of hooks.getItems()) {
			const prevStatus = item.status
			const target = computeStatus(item, t)
			if (target.status !== prevStatus) {
				debugSync('ticker', 'status transition', { itemId: item.id, from: prevStatus, to: target.status, now: t })
				hooks.updateItem(item.id, { status: target.status })
				if (prevStatus === 'resting' && target.status === 'ready') {
					if (!fired.has(`${item.id}:resting-complete`)) {
						fired.add(`${item.id}:resting-complete`)
						debugSync('ticker', 'emit', { type: 'resting-complete', itemId: item.id })
						hooks.emit({ type: 'resting-complete', itemId: item.id })
					}
				}
			}
			if (target.status === 'plated') continue
			if (prevStatus === 'pending' && !fired.has(`${item.id}:put-on`) && t >= item.putOnEpoch - leads.putOn * 1000) {
				fired.add(`${item.id}:put-on`)
				debugSync('ticker', 'emit', { type: 'put-on', itemId: item.id, leadSeconds: leads.putOn })
				hooks.emit({ type: 'put-on', itemId: item.id, leadSeconds: leads.putOn })
			}
			if (!item.flipFired && item.flipEpoch !== null && t >= item.flipEpoch - leads.flip * 1000 && target.status !== 'pending') {
				hooks.updateItem(item.id, { flipFired: true })
				if (!fired.has(`${item.id}:flip`)) {
					fired.add(`${item.id}:flip`)
					debugSync('ticker', 'emit', { type: 'flip', itemId: item.id, leadSeconds: leads.flip })
					hooks.emit({ type: 'flip', itemId: item.id, leadSeconds: leads.flip })
				}
			}
			if (prevStatus === 'cooking' && !fired.has(`${item.id}:done`) && t >= item.doneEpoch - leads.done * 1000) {
				fired.add(`${item.id}:done`)
				debugSync('ticker', 'emit', { type: 'done', itemId: item.id, leadSeconds: leads.done })
				hooks.emit({ type: 'done', itemId: item.id, leadSeconds: leads.done })
			}
		}
	}

	function computeStatus(item: SessionItem, t: number): { status: ItemStatus } {
		if (item.status === 'plated') return { status: 'plated' }
		if (t < item.putOnEpoch) return { status: 'pending' }
		if (t < item.doneEpoch) return { status: 'cooking' }
		if (item.restingUntilEpoch > item.doneEpoch && t < item.restingUntilEpoch) return { status: 'resting' }
		return { status: 'ready' }
	}

	function loop() {
		tick()
		if (typeof requestAnimationFrame !== 'undefined') {
			raf = requestAnimationFrame(loop)
		} else {
			timer = setTimeout(loop, 250)
		}
	}

	return {
		start() {
			debugSync('ticker', 'start', { itemCount: hooks.getItems().length })
			primeExistingAlarms()
			loop()
		},
		stop() {
			debugSync('ticker', 'stop')
			if (raf !== null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(raf)
			if (timer !== null) clearTimeout(timer)
			raf = null
			timer = null
		},
		// Test helper: drive a single tick at a controlled `now`.
		tickOnce: tick,
		_primeExistingAlarms: primeExistingAlarms,
		_fired: fired,
	}
}

/** Build the upcoming schedule event list for a single SessionItem (for inspection in tests / UI). */
export function eventsFor(item: SessionItem): ScheduleEvent[] {
	const events: ScheduleEvent[] = [{ type: 'put-on', at: item.putOnEpoch, itemId: item.id }]
	if (item.flipEpoch !== null) events.push({ type: 'flip', at: item.flipEpoch, itemId: item.id })
	events.push({ type: 'done', at: item.doneEpoch, itemId: item.id })
	if (item.restingUntilEpoch > item.doneEpoch)
		events.push({ type: 'resting-complete', at: item.restingUntilEpoch, itemId: item.id })
	return events
}
