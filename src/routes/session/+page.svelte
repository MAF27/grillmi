<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount, onDestroy } from 'svelte'
	import AlarmBanner, { type AlarmKind } from '$lib/components/AlarmBanner.svelte'
	import MasterClock from '$lib/components/MasterClock.svelte'
	import SessionHeader from '$lib/components/SessionHeader.svelte'
	import TimerCard, { type TimerCardStatus } from '$lib/components/TimerCard.svelte'
	import DesktopCockpit from '$lib/components/desktop/DesktopCockpit.svelte'
	import { viewport } from '$lib/runtime/viewport.svelte'
	import { fireAlarm, messageFor, type AlarmEvent } from '$lib/runtime/alarms'
	import { createTicker, type TickerEvent } from '$lib/runtime/ticker'
	import { onWakeLockChange, releaseWakeLock, requestWakeLock, getWakeLockState } from '$lib/runtime/wakeLock'
	import { grilladeStore } from '$lib/stores/grilladeStore.svelte'
	import { settingsStore } from '$lib/stores/settingsStore.svelte'
	import { preload } from '$lib/sounds/player'

	let wakeLockState = $state<'idle' | 'held' | 'denied' | 'unsupported'>(getWakeLockState())
	type StickyAlarm = { id: string; itemId: string; kind: AlarmKind; itemName: string; message: string; firedAt: number }
	let stickyAlarms = $state<StickyAlarm[]>([])
	let dismissedKeys = $state<Set<string>>(new Set())
	let firingItemId = $state<string | null>(null)
	let endingForAllPlated = false
	let mounted = $state(false)

	const session = $derived(grilladeStore.session)
	const sessionMode = $derived(session?.mode ?? grilladeStore.planMode)
	const visibleAlarms = $derived(
		stickyAlarms
			.filter(a => !dismissedKeys.has(a.id))
			.slice()
			.reverse(),
	)
	const alarming = $derived(visibleAlarms[0] ?? null)

	let ticker: ReturnType<typeof createTicker> | null = null
	let unsubWakeLock: (() => void) | null = null

	onMount(async () => {
		await grilladeStore.init()
		await settingsStore.init()
		if (!grilladeStore.session) {
			goto('/plan')
			return
		}
		mounted = true
		// On desktop, /session and /plan render the same DesktopCockpit, which
		// owns the ticker and wakeLock lifecycle once a session exists.
		if (viewport.isDesktop) return
		preload([settingsStore.sounds.putOn, settingsStore.sounds.flip, settingsStore.sounds.done]).catch(() => {})
		unsubWakeLock = onWakeLockChange(s => (wakeLockState = s))
		await requestWakeLock()
		ticker = createTicker({
			getItems: () => grilladeStore.session?.items ?? [],
			updateItem: (id, patch) => {
				void grilladeStore.patchItem(id, patch)
			},
			getLeads: () => ({
				putOn: settingsStore.leadPutOnSeconds,
				flip: settingsStore.leadFlipSeconds,
				done: settingsStore.leadDoneSeconds,
			}),
			emit: (e: TickerEvent) => {
				if (e.type === 'resting-complete') return
				const item = grilladeStore.session?.items.find(i => i.id === e.itemId)
				if (!item) return
				const event = e.type as AlarmEvent
				const kind: AlarmKind = event === 'flip' ? 'flip' : event === 'done' ? 'ready' : 'on'
				// Manual mode: tapping Los is the cook telling the app the item is on the
				// grill; the ring starting to run is the only confirmation. No chime, no toast.
				if (event === 'put-on' && grilladeStore.session?.mode === 'manual') return
				const msg = messageFor(event, item.label || item.cutSlug, e.leadSeconds)
				const key = `${item.id}-${kind}`
				if (stickyAlarms.some(a => a.id === key) || dismissedKeys.has(key)) return
				firingItemId = item.id
				void grilladeStore.appendTimelineEvent({ kind, itemName: item.label || item.cutSlug, at: Date.now() })
				stickyAlarms = [
					...stickyAlarms,
					{
						id: key,
						itemId: item.id,
						kind,
						itemName: item.label || item.cutSlug,
						message: msg,
						firedAt: Date.now(),
					},
				]
				void fireAlarm(event)
			},
		})
		ticker.start()
	})

	onDestroy(() => {
		if (ticker) ticker.stop()
		void releaseWakeLock()
		if (unsubWakeLock) unsubWakeLock()
	})

	function dismissAlarm() {
		if (!alarming) return
		const next = new Set(dismissedKeys)
		next.add(alarming.id)
		dismissedKeys = next
		const remaining = stickyAlarms.filter(a => !next.has(a.id))
		firingItemId = remaining[0]?.itemId ?? null
	}

	async function endSession() {
		await grilladeStore.endSession()
		await goto('/')
	}

	$effect(() => {
		if (mounted && !viewport.isDesktop && !session) void goto('/plan')
	})

	$effect(() => {
		if (endingForAllPlated) return
		const live = grilladeStore.session
		if (!live) return
		const finished = live.items.length === 0 || live.items.every(i => i.status === 'plated')
		if (!finished) return
		endingForAllPlated = true
		void endSession()
	})

	function plateItem(id: string) {
		void grilladeStore.plateItem(id)
	}

	function removeItem(id: string) {
		void grilladeStore.removeSessionItem(id)
	}

	function startItem(id: string) {
		void grilladeStore.startSessionItem(id)
	}

	// Items in a manual session are pinned at a far-future putOnEpoch until the
	// user clicks Los; surface that as 'unstarted' so the card paints the start
	// affordance instead of a misleading countdown.
	const UNSTARTED_HORIZON_MS = 30 * 24 * 60 * 60 * 1000
	function statusFor(item: { status: string; putOnEpoch: number }): TimerCardStatus | undefined {
		if (item.status === 'pending' && item.putOnEpoch > Date.now() + UNSTARTED_HORIZON_MS) return 'unstarted'
		return undefined
	}
</script>

<svelte:head>
	<title>Grillade · Grillmi</title>
</svelte:head>

{#if viewport.isDesktop}
	<DesktopCockpit />
{:else if session}
	<div class="screen">
		<SessionHeader targetEpoch={session.targetEpoch} {wakeLockState} planMode={sessionMode} onEnd={endSession} />

		{#if grilladeStore.sessionHasStarted}
			<MasterClock targetEpoch={session.targetEpoch} />
		{:else}
			<div class="awaiting" data-testid="awaiting-start">Tippe auf Los, um die erste Grillzeit zu starten.</div>
		{/if}

		<div class="grid-wrap">
			<div class="grid">
				{#each session.items as item (item.id)}
					<TimerCard
						{item}
						status={statusFor(item)}
						alarmFiring={firingItemId === item.id}
						onplate={plateItem}
						onstart={startItem}
						onremove={removeItem} />
				{/each}
			</div>
		</div>

		{#if alarming}
			{#key alarming.id}
				<AlarmBanner
					kind={alarming.kind}
					itemName={alarming.itemName}
					count={visibleAlarms.length}
					message={alarming.message}
					onDismiss={dismissAlarm} />
			{/key}
		{/if}
	</div>
{/if}

<style>
	.screen {
		position: relative;
		min-height: 100dvh;
		background: var(--color-bg-base);
		color: var(--color-fg-base);
		display: flex;
		flex-direction: column;
	}
	.grid-wrap {
		flex: 1;
		overflow-y: auto;
		padding: 0 16px 120px;
	}
	.awaiting {
		color: var(--color-fg-muted);
		font-size: 14px;
		text-align: center;
		padding: 20px 16px;
	}
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
</style>
