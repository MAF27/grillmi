<script lang="ts">
	interface Props {
		accent?: string
	}

	let { accent = 'var(--color-ember)' }: Props = $props()

	const grates = Array.from({ length: 14 }, (_, i) => i)
	const id = `gg-${Math.random().toString(36).slice(2, 9)}`
</script>

<svg class="grates" width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
	<defs>
		<radialGradient id="{id}-glow" cx="50%" cy="78%" r="60%">
			<stop offset="0%" stop-color={accent} stop-opacity="0.55" />
			<stop offset="40%" stop-color={accent} stop-opacity="0.15" />
			<stop offset="100%" stop-color={accent} stop-opacity="0" />
		</radialGradient>
		<linearGradient id="{id}-fade" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0%" stop-color="#000" stop-opacity="0.7" />
			<stop offset="60%" stop-color="#000" stop-opacity="0" />
			<stop offset="100%" stop-color="#000" stop-opacity="0.7" />
		</linearGradient>
	</defs>
	<rect width="390" height="844" fill="url(#{id}-glow)" />
	<g stroke="rgba(255,255,255,0.04)" stroke-width="1.5">
		{#each grates as i (i)}
			<line x1={-200 + i * 60} y1="844" x2={i * 60 + 100} y2="0" />
		{/each}
	</g>
	<rect width="390" height="844" fill="url(#{id}-fade)" />
</svg>

<style>
	.grates {
		position: absolute;
		inset: 0;
		opacity: 0.5;
		pointer-events: none;
	}
	:global([data-theme='light']) .grates {
		opacity: 0.35;
	}
	:global([data-theme='light']) .grates g line {
		stroke: rgba(26, 20, 17, 0.08);
	}
</style>
