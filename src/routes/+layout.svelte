<script lang="ts">
	import '../app.css'
	import { onMount } from 'svelte'
	import FirstRunNotice from '$lib/components/FirstRunNotice.svelte'
	import { settingsStore } from '$lib/stores/settingsStore.svelte'

	let { children } = $props()
	let ready = $state(false)

	onMount(() => {
		void settingsStore.init().then(() => (ready = true))
		const handler = (e: Event) => {
			e.preventDefault()
			window.installPromptEvent = e as unknown as Window['installPromptEvent']
		}
		window.addEventListener('beforeinstallprompt', handler)
		return () => window.removeEventListener('beforeinstallprompt', handler)
	})

	function dismissFirstRun() {
		void settingsStore.markFirstRunSeen()
	}
</script>

{@render children()}

{#if ready && !settingsStore.firstRunSeen}
	<FirstRunNotice onclose={dismissFirstRun} />
{/if}
