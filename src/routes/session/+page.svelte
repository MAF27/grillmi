<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount, onDestroy } from 'svelte'
	import AlarmBanner, { type AlarmKind } from '$lib/components/AlarmBanner.svelte'
	import MasterClock from '$lib/components/MasterClock.svelte'
	import SessionHeader from '$lib/components/SessionHeader.svelte'
	import TimerCard from '$lib/components/TimerCard.svelte'
	import { fireAlarm, messageFor, type AlarmEvent } from '$lib/runtime/alarms'
	import { createTicker, type TickerEvent } from '$lib/runtime/ticker'
	import { onWakeLockChange, releaseWakeLock, requestWakeLock, getWakeLockState } from '$lib/runtime/wakeLock'
	import { sessionStore } from '$lib/stores/sessionStore.svelte'
	import { settingsStore } from '$lib/stores/settingsStore.svelte'
	import { preload } from '$lib/sounds/player'

	let wakeLockState = $state<'idle' | 'held' | 'denied' | 'unsupported'>(getWakeLockState())
	type StickyAlarm = { id: string; itemId: string; kind: AlarmKind; itemName: string; message: string; firedAt: number }
	let stickyAlarms = $state<StickyAlarm[]>([])
	let dismissedKeys = $state<Set<string>>(new Set())
	let firingItemId = $state<string | null>(null)

	const session = $derived(sessionStore.session)
	const visibleAlarms = $derived(stickyAlarms.filter(a => !dismissedKeys.has(a.id)))
	const alarming = $derived(visibleAlarms[0] ?? null)
	const planMode = $derived(sessionStore.planMode)

	let ticker: ReturnType<typeof createTicker> | null = null
	let unsubWakeLock: (() => void) | null = null

	onMount(async () => {
		await sessionStore.init()
		await settingsStore.init()
		if (sessionStore.planMode === 'manual') {
			goto('/plan', { replaceState: true })
			return
		}
		if (!sessionStore.session) {
			goto('/plan')
			return
		}
		preload([settingsStore.sounds.putOn, settingsStore.sounds.flip, settingsStore.sounds.done]).catch(() => {})
		unsubWakeLock = onWakeLockChange(s => (wakeLockState = s))
		await requestWakeLock()
		ticker = createTicker({
			getItems: () => sessionStore.session?.items ?? [],
			updateItem: (id, patch) => {
				void sessionStore.patchItem(id, patch)
			},
			emit: (e: TickerEvent) => {
				if (e.type === 'resting-complete') return
				const item = sessionStore.session?.items.find(i => i.id === e.itemId)
				if (!item) return
				const event = e.type as AlarmEvent
				const kind: AlarmKind = event === 'flip' ? 'flip' : event === 'done' ? 'ready' : 'on'
				const msg = messageFor(event, item.label || item.cutSlug)
				const key = `${item.id}-${kind}`
				if (stickyAlarms.some(a => a.id === key) || dismissedKeys.has(key)) return
				firingItemId = item.id
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
		await sessionStore.endSession()
		await goto('/')
	}

	function plateItem(id: string) {
		void sessionStore.plateItem(id)
	}
</script>

<svelte:head>
	<title>Session · Grillmi</title>
</svelte:head>

{#if session}
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
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
</style>
