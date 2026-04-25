<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import Button from '$lib/components/Button.svelte'
	import FavoriteCard from '$lib/components/FavoriteCard.svelte'
	import { favoritesStore } from '$lib/stores/favoritesStore.svelte'
	import { sessionStore } from '$lib/stores/sessionStore.svelte'

	onMount(async () => {
		await favoritesStore.init()
	})

	function load(id: string) {
		const fav = favoritesStore.all.find(f => f.id === id)
		if (!fav) return
		void favoritesStore.touch(id)
		sessionStore.loadFromFavorite(fav.items)
		goto('/plan')
	}

	function longPress(id: string) {
		const fav = favoritesStore.all.find(f => f.id === id)
		if (!fav) return
		const action = window.prompt(`${fav.name}\n\n1 — Umbenennen\n2 — Löschen\n\nNummer eingeben:`)
		if (action === '1') {
			const newName = window.prompt('Neuer Name:', fav.name)
			if (newName?.trim()) void favoritesStore.rename(id, newName.trim())
		}
		if (action === '2' && window.confirm(`Favorit "${fav.name}" wirklich löschen?`)) {
			void favoritesStore.remove(id)
		}
	}
</script>

<svelte:head>
	<title>Favoriten · Grillmi</title>
</svelte:head>

<main>
	<header>
		<button class="back" onclick={() => goto('/')} aria-label="Zurück">‹</button>
		<h1>Favoriten</h1>
	</header>

	{#if favoritesStore.all.length === 0}
		<p class="empty">Noch keine Favoriten — speichere eine Plan-Konstellation auf der Plan-Seite.</p>
		<Button variant="primary" onclick={() => goto('/plan')}>Neue Session</Button>
	{:else}
		<div class="list">
			{#each favoritesStore.all as fav (fav.id)}
				<FavoriteCard favorite={fav} onload={load} onlongpress={longPress} />
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
