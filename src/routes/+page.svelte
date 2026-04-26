<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import Button from '$lib/components/Button.svelte'
	import EmptyState from '$lib/components/EmptyState.svelte'
	import { sessionStore } from '$lib/stores/sessionStore.svelte'
	import { settingsStore } from '$lib/stores/settingsStore.svelte'
	import { savedPlansStore } from '$lib/stores/savedPlansStore.svelte'

	let installAvailable = $state(false)

	onMount(async () => {
		await sessionStore.init()
		await savedPlansStore.init()
		await settingsStore.init()
		installAvailable = typeof window !== 'undefined' && !!window.installPromptEvent
		if (sessionStore.session) goto('/session')
	})

	function startNewSession() {
		goto('/plan')
	}
	function openSavedPlans() {
		goto('/plans')
	}
	function openSettings() {
		goto('/settings')
	}
	async function installApp() {
		const evt = window.installPromptEvent
		if (!evt) return
		await evt.prompt()
		installAvailable = false
		window.installPromptEvent = undefined
	}
</script>

<svelte:head>
	<title>Grillmi</title>
</svelte:head>

<main>
	<header>
		<h1>Grillmi</h1>
		<p class="tagline">Mehrere Timer, ein Grill, alles auf den Punkt.</p>
	</header>

	<EmptyState
		title="Bereit zum Grillen?"
		description="Plane deine Session, setze die Zielzeit fürs Essen, und Grillmi sagt dir genau, wann was auf den Rost muss.">
		{#snippet actions()}
			<Button variant="primary" size="lg" fullWidth onclick={startNewSession}>Neue Session</Button>
			<Button variant="secondary" fullWidth onclick={openSavedPlans}>Plan-Vorlagen</Button>
			<Button variant="ghost" fullWidth onclick={openSettings}>Einstellungen</Button>
			{#if installAvailable}
				<Button variant="ghost" fullWidth onclick={installApp}>App installieren</Button>
			{/if}
		{/snippet}
	</EmptyState>
</main>

<style>
	main {
		max-width: 560px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-4) var(--space-12);
		min-height: 100dvh;
	}
	header {
		text-align: center;
		padding-top: var(--space-6);
	}
	h1 {
		font-family: var(--font-display);
		font-size: var(--font-size-3xl);
		letter-spacing: var(--tracking-tight);
		margin: 0;
		color: var(--color-accent-default);
	}
	.tagline {
		color: var(--color-fg-muted);
		font-size: var(--font-size-md);
		margin: var(--space-2) 0 0;
	}
</style>
