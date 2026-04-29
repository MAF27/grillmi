<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount, onDestroy } from 'svelte'
	import AlarmBanner, { type AlarmKind } from '$lib/components/AlarmBanner.svelte'
	import ActivityLog, { type ActivityEvent } from '$lib/components/desktop/ActivityLog.svelte'
	import BigTimerCard from '$lib/components/BigTimerCard.svelte'
	import MasterClock from '$lib/components/MasterClock.svelte'
	import PlanSummaryList from '$lib/components/desktop/PlanSummaryList.svelte'
	import SessionHeader from '$lib/components/SessionHeader.svelte'
	import TimerCard from '$lib/components/TimerCard.svelte'
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
	let activity = $state<ActivityEvent[]>([])

	const session = $derived(grilladeStore.session)
	const visibleAlarms = $derived(
		stickyAlarms
			.filter(a => !dismissedKeys.has(a.id))
			.slice()
			.reverse(),
	)
	const alarming = $derived(visibleAlarms[0] ?? null)
	const planMode = $derived(grilladeStore.planMode)

	let ticker: ReturnType<typeof createTicker> | null = null
	let unsubWakeLock: (() => void) | null = null

	onMount(async () => {
		await grilladeStore.init()
		await settingsStore.init()
		if (grilladeStore.planMode === 'manual') {
			goto('/plan', { replaceState: true })
			return
		}
		if (!grilladeStore.session) {
			goto('/plan')
			return
		}
		preload([settingsStore.sounds.putOn, settingsStore.sounds.flip, settingsStore.sounds.done]).catch(() => {})
		unsubWakeLock = onWakeLockChange(s => (wakeLockState = s))
		await requestWakeLock()
		ticker = createTicker({
			getItems: () => grilladeStore.session?.items ?? [],
			updateItem: (id, patch) => {
				void grilladeStore.patchItem(id, patch)
			},
			emit: (e: TickerEvent) => {
				if (e.type === 'resting-complete') return
				const item = grilladeStore.session?.items.find(i => i.id === e.itemId)
				if (!item) return
				const event = e.type as AlarmEvent
				const kind: AlarmKind = event === 'flip' ? 'flip' : event === 'done' ? 'ready' : 'on'
				const msg = messageFor(event, item.label || item.cutSlug)
				const key = `${item.id}-${kind}`
				if (stickyAlarms.some(a => a.id === key) || dismissedKeys.has(key)) return
				firingItemId = item.id
				activity = [{ kind, itemName: item.label || item.cutSlug, at: Date.now() }, ...activity].slice(0, 30) as ActivityEvent[]
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

	function plateItem(id: string) {
		void grilladeStore.plateItem(id)
	}
</script>

<svelte:head>
	<title>Session · Grillmi</title>
</svelte:head>

{#if session}
	{#if viewport.isDesktop}
		<div class="desktop-session">
			<PlanSummaryList items={session.items} statusByItem={Object.fromEntries(session.items.map(item => [item.id, item.status]))} />
			<section class="cockpit-centre">
				<div class="desktop-top">
					<SessionHeader targetEpoch={session.targetEpoch} {wakeLockState} {planMode} onEnd={endSession} />
				</div>
				<MasterClock targetEpoch={session.targetEpoch} size="desktop" />
				<div class="big-grid">
					{#each session.items as item (item.id)}
						<BigTimerCard {item} alarmFiring={firingItemId === item.id} onplate={plateItem} />
					{/each}
				</div>
			</section>
			<aside class="right-pane">
				{#if alarming}
					{#key alarming.id}
						<AlarmBanner
							kind={alarming.kind}
							itemName={alarming.itemName}
							count={visibleAlarms.length}
							message={alarming.message}
							placement="top"
							onDismiss={dismissAlarm} />
					{/key}
				{/if}
				<ActivityLog events={activity} />
			</aside>
		</div>
	{:else}
	<div class="screen">
		<SessionHeader targetEpoch={session.targetEpoch} {wakeLockState} {planMode} onEnd={endSession} />

		<MasterClock targetEpoch={session.targetEpoch} />

		<div class="grid-wrap">
			<div class="grid">
				{#each session.items as item (item.id)}
					<TimerCard {item} alarmFiring={firingItemId === item.id} onplate={plateItem} />
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
{/if}

<style>
	.desktop-session {
		display: grid;
		grid-template-columns: 280px minmax(0, 1fr) 320px;
		min-height: 100dvh;
		background: var(--color-bg-base);
		color: var(--color-fg-base);
	}
	.cockpit-centre {
		min-width: 0;
		padding: 24px 28px 36px;
	}
	.desktop-top :global(.session-header) {
		position: static;
		background: transparent;
	}
	.desktop-top :global(.bar) {
		padding: 0 0 18px;
	}
	.big-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
	}
	.right-pane {
		position: relative;
		min-width: 0;
		padding: 24px;
		border-left: 1px solid var(--color-border-subtle);
		background: var(--color-bg-panel);
	}
	@media (max-width: 1279px) {
		.desktop-session {
			grid-template-columns: 280px minmax(0, 1fr) 300px;
		}
		.big-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
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
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
</style>
