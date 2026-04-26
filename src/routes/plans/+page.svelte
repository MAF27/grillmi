<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import Button from '$lib/components/Button.svelte'
	import SavedPlanCard from '$lib/components/SavedPlanCard.svelte'
	import { savedPlansStore } from '$lib/stores/savedPlansStore.svelte'
	import { sessionStore } from '$lib/stores/sessionStore.svelte'

	onMount(async () => {
		await savedPlansStore.init()
	})

	function load(id: string) {
		const plan = savedPlansStore.all.find(p => p.id === id)
		if (!plan) return
		void savedPlansStore.touch(id)
		sessionStore.loadFromSavedPlan(plan.items)
		goto('/plan')
	}

	function longPress(id: string) {
		const plan = savedPlansStore.all.find(p => p.id === id)
		if (!plan) return
		const action = window.prompt(`${plan.name}\n\n1. Umbenennen\n2. Löschen\n\nNummer eingeben:`)
		if (action === '1') {
			const newName = window.prompt('Neuer Name:', plan.name)
			if (newName?.trim()) void savedPlansStore.rename(id, newName.trim())
		}
		if (action === '2' && window.confirm(`Plan-Vorlage "${plan.name}" wirklich löschen?`)) {
			void savedPlansStore.remove(id)
		}
	}
</script>

<svelte:head>
	<title>Plan-Vorlagen · Grillmi</title>
</svelte:head>

<main>
	<header>
		<button class="back" onclick={() => goto('/')} aria-label="Zurück">‹</button>
		<h1>Plan-Vorlagen</h1>
	</header>

	{#if savedPlansStore.all.length === 0}
		<p class="empty">Noch keine Plan-Vorlage gespeichert. Stelle einen Plan zusammen und tippe auf Plan speichern.</p>
		<Button variant="primary" onclick={() => goto('/plan')}>Neue Session</Button>
	{:else}
		<div class="list">
			{#each savedPlansStore.all as plan (plan.id)}
				<SavedPlanCard savedPlan={plan} onload={load} onlongpress={longPress} />
			{/each}
		</div>
	{/if}
</main>

<style>
	main {
		max-width: 600px;
		margin: 0 auto;
		padding: env(safe-area-inset-top) var(--space-4) var(--space-12);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-height: 100dvh;
	}
	header {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding-top: var(--space-4);
	}
	header h1 {
		font-family: var(--font-display);
		font-size: var(--font-size-2xl);
		margin: 0;
	}
	.back {
		background: transparent;
		border: none;
		color: var(--color-fg-base);
		font-size: var(--font-size-2xl);
		min-width: 44px;
		min-height: 44px;
	}
	.empty {
		color: var(--color-fg-muted);
		text-align: center;
		padding: var(--space-6);
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
</style>
