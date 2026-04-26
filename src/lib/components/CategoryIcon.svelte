<script lang="ts">
	import Apple from '@lucide/svelte/icons/apple'
	import Beef from '@lucide/svelte/icons/beef'
	import Carrot from '@lucide/svelte/icons/carrot'
	import Drumstick from '@lucide/svelte/icons/drumstick'
	import Fish from '@lucide/svelte/icons/fish'
	import Ham from '@lucide/svelte/icons/ham'
	import Sparkles from '@lucide/svelte/icons/sparkles'

	interface Props {
		slug: string
		size?: number
	}

	let { slug, size = 28 }: Props = $props()

	// Lucide doesn't ship veal / lamb / sausage / skewer / cheese icons, so we
	// hand-draw monoline equivalents that match Lucide's stroke weight (1.6 on
	// a 24x24 viewBox) for visual consistency.
	const lucide: Record<string, typeof Beef> = {
		beef: Beef,
		pork: Ham,
		poultry: Drumstick,
		fish: Fish,
		vegetables: Carrot,
		fruit: Apple,
		special: Sparkles,
	}
	const Icon = $derived(lucide[slug])
</script>

{#if Icon}
	<Icon {size} strokeWidth={1.6} />
{:else}
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.6"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true">
		{#if slug === 'veal'}
			<!-- Calf head: narrower face, small ears, simple dot eyes. -->
			<path d="M8 9c0-2 2-3.5 4-3.5s4 1.5 4 3.5v6c0 2-1.5 3.5-4 3.5S8 17 8 15z" />
			<path d="M8 9l-2-2M16 9l2-2" />
			<circle cx="10.5" cy="12" r="0.7" fill="currentColor" stroke="none" />
			<circle cx="13.5" cy="12" r="0.7" fill="currentColor" stroke="none" />
			<path d="M10.5 16c.6.6 2.4.6 3 0" />
		{:else if slug === 'lamb'}
			<!-- Cluster of wool circles + face. -->
			<circle cx="8" cy="9" r="1.8" />
			<circle cx="12" cy="7.5" r="1.8" />
			<circle cx="16" cy="9" r="1.8" />
			<circle cx="6.5" cy="12.5" r="1.8" />
			<circle cx="17.5" cy="12.5" r="1.8" />
			<circle cx="12" cy="14" r="3.2" />
			<circle cx="10.8" cy="13.6" r="0.5" fill="currentColor" stroke="none" />
			<circle cx="13.2" cy="13.6" r="0.5" fill="currentColor" stroke="none" />
		{:else if slug === 'sausage'}
			<!-- S-curved sausage with end caps. -->
			<path d="M5 9c2-3 5-3 7 0s5 3 7 0" />
			<path d="M5 15c2-3 5-3 7 0s5 3 7 0" />
			<path d="M5 9v6M19 9v6" />
		{:else if slug === 'skewers'}
			<!-- Diagonal skewer with three pieces. -->
			<path d="M4 19l16-14" />
			<rect x="6.5" y="11.5" width="4" height="4" rx="0.8" transform="rotate(-45 8.5 13.5)" />
			<rect x="10.5" y="7.5" width="4" height="4" rx="0.8" transform="rotate(-45 12.5 9.5)" />
			<rect x="14.5" y="3.5" width="4" height="4" rx="0.8" transform="rotate(-45 16.5 5.5)" />
		{:else if slug === 'cheese'}
			<!-- Cheese wedge with holes. -->
			<path d="M3 17l9-10 9 10z" />
			<circle cx="10" cy="14.5" r="0.7" fill="currentColor" stroke="none" />
			<circle cx="14" cy="13" r="0.7" fill="currentColor" stroke="none" />
			<circle cx="15" cy="16" r="0.6" fill="currentColor" stroke="none" />
		{:else}
			<circle cx="12" cy="12" r="9" />
		{/if}
	</svg>
{/if}
