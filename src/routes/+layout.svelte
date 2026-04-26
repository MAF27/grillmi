<script lang="ts">
	import '../app.css'
	import { onMount } from 'svelte'
	import { settingsStore } from '$lib/stores/settingsStore.svelte'

	let { children } = $props()

	onMount(() => {
		void settingsStore.init()
		const handler = (e: Event) => {
			e.preventDefault()
			window.installPromptEvent = e as unknown as Window['installPromptEvent']
		}
		window.addEventListener('beforeinstallprompt', handler)
		return () => window.removeEventListener('beforeinstallprompt', handler)
	})
</script>

{@render children()}
