<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import Button from '$lib/components/Button.svelte'
	import MenuCard from '$lib/components/MenuCard.svelte'
	import { menusStore } from '$lib/stores/menusStore.svelte'
	import { sessionStore } from '$lib/stores/sessionStore.svelte'

	onMount(async () => {
		await menusStore.init()
	})

	function load(id: string) {
		const menu = menusStore.all.find(p => p.id === id)
		if (!menu) return
		void menusStore.touch(id)
		sessionStore.loadFromMenu(menu.items)
		goto('/plan')
	}

	function rename(id: string, name: string) {
		void menusStore.rename(id, name)
	}

	function remove(id: string) {
		void menusStore.remove(id)
	}
</script>

<svelte:head>
	<title>Menüs · Grillmi</title>
</svelte:head>

<main>
	<header>
		<button class="back" onclick={() => goto('/')} aria-label="Zurück">‹</button>
		<h1>Menüs</h1>
	</header>

	{#if menusStore.all.length === 0}
		<p class="empty">Noch kein Menü gespeichert. Stelle einen Plan zusammen und tippe auf <strong>Als Menü speichern</strong>.</p>
		<Button variant="primary" fullWidth onclick={() => goto('/plan')}>Neue Session</Button>
	{:else}
		<div class="list" role="list">
			{#each menusStore.all as menu (menu.id)}
				<MenuCard {menu} onload={load} onrename={rename} ondelete={remove} />
			{/each}
		</div>
		<div class="cta">
			<Button variant="primary" size="lg" fullWidth onclick={() => goto('/plan')}>Neue Session</Button>
		</div>
	{/if}
</main>

<style>
	main {
		max-width: 600px;
		margin: 0 auto;
		padding: env(safe-area-inset-top) 24px calc(40px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-height: 100dvh;
	}
	header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 60px 0 16px;
	}
	header h1 {
		font-family: var(--font-display);
		font-size: 30px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: -0.01em;
		margin: 0;
	}
	.back {
		background: transparent;
		border: none;
		color: var(--color-fg-base);
		font-size: 22px;
		min-width: 44px;
		min-height: 44px;
		cursor: pointer;
	}
	.empty {
		color: var(--color-fg-muted);
		text-align: center;
		padding: 24px;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.cta {
		margin-top: 24px;
	}
</style>
