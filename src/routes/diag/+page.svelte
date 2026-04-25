<script lang="ts">
	import { onMount } from 'svelte'
	import { TIMINGS } from '$lib/data/timings'

	let info = $state({ ua: '', categoryCount: 0, slugs: [] as string[], firstCutsBeef: [] as string[], parseError: '' })

	onMount(() => {
		try {
			info.ua = navigator.userAgent
			info.categoryCount = TIMINGS.categories.length
			info.slugs = TIMINGS.categories.map(c => c.slug)
			const beef = TIMINGS.categories.find(c => c.slug === 'beef')
			info.firstCutsBeef = beef ? beef.cuts.map(c => c.name).slice(0, 5) : []
		} catch (e) {
			info.parseError = String(e)
		}
	})
</script>

<main class="diag">
	<h1>Grillmi Diagnose</h1>

	<dl>
		<dt>User-Agent</dt>
		<dd>{info.ua}</dd>

		<dt>Kategorien geladen</dt>
		<dd class="num" data-testid="cat-count">{info.categoryCount}</dd>

		<dt>Slugs</dt>
		<dd>{info.slugs.join(', ') || '—'}</dd>

		<dt>Rind: erste 5 Cuts</dt>
		<dd>{info.firstCutsBeef.join(' / ') || '—'}</dd>

		<dt>Parse-Fehler</dt>
		<dd class="err">{info.parseError || '—'}</dd>
	</dl>
</main>

<style>
	.diag {
		max-width: 40rem;
		margin: 0 auto;
		padding: 1.5rem;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		color: #fff;
		background: #0d0d0d;
		min-height: 100vh;
	}
	h1 {
		font-size: 1.5rem;
		margin: 0 0 1rem;
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.5rem 1rem;
	}
	dt {
		font-weight: 600;
		color: #aaa;
	}
	dd {
		margin: 0;
		word-break: break-word;
	}
	.num {
		font-family: ui-monospace, monospace;
		font-size: 1.5rem;
		color: #d35a1d;
	}
	.err {
		color: #ff6b6b;
		font-family: ui-monospace, monospace;
		white-space: pre-wrap;
	}
</style>
