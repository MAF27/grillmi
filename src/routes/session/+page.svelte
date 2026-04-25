<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount, onDestroy } from 'svelte'
	import AlarmBanner from '$lib/components/AlarmBanner.svelte'
	import Button from '$lib/components/Button.svelte'
	import SessionHeader from '$lib/components/SessionHeader.svelte'
	import StateGroupHeader from '$lib/components/StateGroupHeader.svelte'
	import TimerCard from '$lib/components/TimerCard.svelte'
	import { fireAlarm, messageFor, type AlarmEvent } from '$lib/runtime/alarms'
	import { createTicker, type TickerEvent } from '$lib/runtime/ticker'
	import { onWakeLockChange, releaseWakeLock, requestWakeLock, getWakeLockState } from '$lib/runtime/wakeLock'
	import { sessionStore } from '$lib/stores/sessionStore.svelte'
	import { settingsStore } from '$lib/stores/settingsStore.svelte'
	import { preload } from '$lib/sounds/player'
	import type { ItemStatus } from '$lib/models'

	let wakeLockState = $state<'idle' | 'held' | 'denied' | 'unsupported'>(getWakeLockState())
	let alarmQueue = $state<{ id: string; message: string; firingItemId: string }[]>([])
	let firingItemId = $state<string | null>(null)
	let collapsed = $state<Record<ItemStatus, boolean>>({
		pending: false,
		cooking: false,
		resting: false,
		ready: false,
		plated: true,
	})

	const session = $derived(sessionStore.session)

	const cookingItems = $derived(sessionStore.cookingItems)
	const restingItems = $derived(sessionStore.restingItems)
	const readyItems = $derived(sessionStore.readyItems)
	const pendingItems = $derived(sessionStore.pendingItems)
	const platedItems = $derived(sessionStore.platedItems)
	const autoEndDeadline = $derived(sessionStore.autoEndDeadline)

	let ticker: ReturnType<typeof createTicker> | null = null
	let unsubWakeLock: (() => void) | null = null

	onMount(async () => {
		await sessionStore.init()
		await settingsStore.init()
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
				const msg = messageFor(event, item.label || item.cutSlug)
				firingItemId = item.id
				alarmQueue = [...alarmQueue, { id: `${item.id}-${event}-${Date.now()}`, message: msg, firingItemId: item.id }]
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
		const next = alarmQueue.slice(1)
		alarmQueue = next
		firingItemId = next[0]?.firingItemId ?? null
	}

	function toggleGroup(state: ItemStatus) {
		collapsed = { ...collapsed, [state]: !collapsed[state] }
	}

	async function endSession() {
		await sessionStore.endSession()
		await goto('/')
	}

	function plateItem(id: string) {
		void sessionStore.plateItem(id)
	}

	function longPressItem(id: string) {
		const item = sessionStore.session?.items.find(i => i.id === id)
		if (!item) return
		const action = window.prompt(
			`${item.label}\n\n1 — Jetzt fertig\n2 — Aus Session entfernen\n\nNummer eingeben (Abbrechen für nichts):`,
		)
		if (action === '1') void sessionStore.forceReady(id)
		if (action === '2') void sessionStore.removeSessionItem(id)
	}

	const groups: { state: ItemStatus; items: typeof cookingItems }[] = $derived([
		{ state: 'cooking', items: cookingItems },
		{ state: 'resting', items: restingItems },
		{ state: 'ready', items: readyItems },
		{ state: 'pending', items: pendingItems },
		{ state: 'plated', items: platedItems },
	])
</script>

<svelte:head>
	<title>Session · Grillmi</title>
</svelte:head>

{#if session}
	<SessionHeader targetEpoch={session.targetEpoch} {wakeLockState} onEnd={endSession} />

	{#if alarmQueue[0]}
		{#key alarmQueue[0].id}
			<AlarmBanner message={alarmQueue[0].message} onDismiss={dismissAlarm} />
		{/key}
	{/if}

	<main>
		{#each groups as group (group.state)}
			{#if group.items.length > 0}
				<StateGroupHeader
					state={group.state}
					count={group.items.length}
					expanded={!collapsed[group.state]}
					ontoggle={() => toggleGroup(group.state)} />
				{#if !collapsed[group.state]}
					<div class="group">
						{#each group.items as item (item.id)}
							<TimerCard {item} alarmFiring={firingItemId === item.id} onplate={plateItem} onlongpress={longPressItem} />
						{/each}
					</div>
				{/if}
			{/if}
		{/each}

		{#if autoEndDeadline}
			<div class="autoend" role="status">
				Alles aufgetragen — Session endet in 60 s.
				<Button variant="ghost" size="sm" onclick={() => sessionStore.cancelAutoEnd()}>Rückgängig</Button>
			</div>
		{/if}
	</main>
{/if}

<style>
	main {
		max-width: 600px;
		margin: 0 auto;
		padding: var(--space-3) var(--space-4) calc(var(--space-12) + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.group {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.autoend {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3);
		background: var(--color-state-ready-bg);
		border: 1px solid var(--color-state-ready);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
	}
</style>
