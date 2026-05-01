<script lang="ts">
	import { onMount } from 'svelte'
	import { getSyncMeta, listSyncQueue } from '$lib/stores/db'

	type SyncState = 'synced' | 'pending' | 'offline'

	let ready = $state(false)
	let syncState = $state<SyncState>('synced')
	let count = $state(0)

	async function poll() {
		count = (await listSyncQueue()).length
		await getSyncMeta('lastPullEpoch').catch(() => undefined)
		syncState = !navigator.onLine ? 'offline' : count > 0 ? 'pending' : 'synced'
		ready = true
	}

	onMount(() => {
		void poll()
		const id = setInterval(() => void poll(), 1000)
		const repoll = () => void poll()
		window.addEventListener('online', repoll)
		window.addEventListener('offline', repoll)
		return () => {
			clearInterval(id)
			window.removeEventListener('online', repoll)
			window.removeEventListener('offline', repoll)
		}
	})

	const label = $derived(syncState === 'offline' ? 'Offline' : syncState === 'pending' ? `${count} ausstehend` : 'Synchronisiert')
</script>

{#if ready}
	<div class="sync-chip" data-state={syncState} data-testid="sync-chip">
		<span class="dot" aria-hidden="true"></span>
		<span>{label}</span>
	</div>
{/if}

<style>
	.sync-chip {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 32px;
		padding: 8px 10px;
		border-radius: 10px;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		color: var(--color-fg-muted);
		font-family: var(--font-body);
		font-size: 12px;
		font-weight: 600;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-state-ready);
	}
	.sync-chip[data-state='pending'] .dot {
		background: var(--color-ember);
	}
	.sync-chip[data-state='offline'] .dot {
		background: var(--color-state-pending);
	}
</style>
