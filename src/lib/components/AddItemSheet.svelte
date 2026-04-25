<script lang="ts">
	import { TIMINGS, findRow } from '$lib/data/timings'
	import type { PlannedItem } from '$lib/models'
	import { formatDuration } from '$lib/util/format'
	import Button from './Button.svelte'

	type Step = 'category' | 'cut' | 'thickness' | 'doneness' | 'label'

	interface Props {
		open: boolean
		initial?: PlannedItem | null
		onclose: () => void
		oncommit: (item: Omit<PlannedItem, 'id'>) => void
	}

	let { open, initial = null, onclose, oncommit }: Props = $props()

	function titleFor(s: Step): string {
		switch (s) {
			case 'category':
				return 'Kategorie'
			case 'cut':
				return 'Stück'
			case 'thickness':
				return 'Dicke / Variante'
			case 'doneness':
				return 'Garstufe'
			case 'label':
				return 'Bezeichnung'
		}
	}

	let step = $state<Step>('category')
	let categorySlug = $state<string | null>(null)
	let cutSlug = $state<string | null>(null)
	let thicknessCm = $state<number | null>(null)
	let prepLabel = $state<string | null>(null)
	let doneness = $state<string | null>(null)
	let label = $state('')

	const category = $derived(categorySlug ? (TIMINGS.categories.find(c => c.slug === categorySlug) ?? null) : null)
	const cut = $derived(category && cutSlug ? (category.cuts.find(c => c.slug === cutSlug) ?? null) : null)
	const matchedRow = $derived(cut ? findRow(cut, thicknessCm, doneness) : undefined)
	const computedSeconds = $derived(matchedRow ? Math.round((matchedRow.cookSecondsMin + matchedRow.cookSecondsMax) / 2) : 0)

	$effect(() => {
		if (!open) return
		if (initial) {
			categorySlug = initial.categorySlug
			cutSlug = initial.cutSlug
			thicknessCm = initial.thicknessCm
			prepLabel = initial.prepLabel
			doneness = initial.doneness
			label = initial.label ?? ''
			step = 'label'
		} else {
			reset()
		}
	})

	function reset() {
		step = 'category'
		categorySlug = null
		cutSlug = null
		thicknessCm = null
		prepLabel = null
		doneness = null
		label = ''
	}

	function pickCategory(slug: string) {
		categorySlug = slug
		cutSlug = null
		step = 'cut'
	}

	function pickCut(slug: string) {
		cutSlug = slug
		const c = category?.cuts.find(cu => cu.slug === slug)
		if (!c) return
		// pre-select first available thickness or prep
		thicknessCm = c.hasThickness ? (c.rows.find(r => r.thicknessCm !== null)?.thicknessCm ?? null) : null
		prepLabel = !c.hasThickness ? (c.rows[0]?.prepLabel ?? null) : null
		doneness = c.hasDoneness ? (c.rows[0]?.doneness ?? null) : null
		step = c.hasThickness ? 'thickness' : 'doneness'
		if (!c.hasThickness && !c.hasDoneness) step = 'label'
	}

	function back() {
		if (step === 'category') {
			onclose()
			return
		}
		if (step === 'cut') step = 'category'
		else if (step === 'thickness') step = 'cut'
		else if (step === 'doneness') {
			step = cut?.hasThickness ? 'thickness' : 'cut'
		} else if (step === 'label') {
			if (cut?.hasDoneness) step = 'doneness'
			else if (cut?.hasThickness) step = 'thickness'
			else step = 'cut'
		}
	}

	function next() {
		if (!cut) return
		if (step === 'thickness') step = cut.hasDoneness ? 'doneness' : 'label'
		else if (step === 'doneness') step = 'label'
	}

	function commit() {
		if (!cut || !category || !matchedRow) return
		const inferredLabel =
			label.trim() || `${cut.name}${thicknessCm !== null ? ` ${thicknessCm} cm` : ''}${doneness ? `, ${doneness}` : ''}`
		oncommit({
			categorySlug: category.slug,
			cutSlug: cut.slug,
			thicknessCm,
			prepLabel,
			doneness,
			label: inferredLabel,
			cookSeconds: computedSeconds,
			restSeconds: matchedRow.restSeconds,
			flipFraction: matchedRow.flipFraction,
			idealFlipPattern: matchedRow.idealFlipPattern,
			heatZone: matchedRow.heatZone,
		})
		reset()
	}

	const thicknessOptions = $derived(
		cut?.hasThickness
			? [...new Set(cut.rows.map(r => r.thicknessCm).filter((v): v is number => v !== null))].sort((a, b) => a - b)
			: [],
	)
	const donenessOptions = $derived(
		cut?.hasDoneness ? [...new Set(cut.rows.map(r => r.doneness).filter((v): v is string => v !== null))] : [],
	)
	const prepOptions = $derived(
		!cut?.hasThickness && cut ? cut.rows.map(r => r.prepLabel).filter((v): v is string => v !== null) : [],
	)
</script>

{#if open}
	<div class="scrim" role="presentation" onclick={onclose}></div>
	<dialog open class="sheet" aria-label="Eintrag hinzufügen">
		<header>
			<button class="back" onclick={back} aria-label="Zurück">‹</button>
			<h2>{titleFor(step)}</h2>
			<button class="dismiss" onclick={onclose} aria-label="Schliessen">×</button>
		</header>

		<div class="body">
			{#if step === 'category'}
				<div class="grid">
					{#each TIMINGS.categories as c (c.slug)}
						<button class="tile" onclick={() => pickCategory(c.slug)}>{c.name}</button>
					{/each}
				</div>
			{:else if step === 'cut' && category}
				<ul class="list">
					{#each category.cuts as c (c.slug)}
						<li>
							<button class="row" onclick={() => pickCut(c.slug)}>{c.name}</button>
						</li>
					{/each}
				</ul>
			{:else if step === 'thickness' && cut}
				{#if cut.hasThickness}
					<div class="thickness">
						<div class="value">{thicknessCm} cm</div>
						<div class="thumbs">
							{#each thicknessOptions as opt (opt)}
								<button class:active={thicknessCm === opt} onclick={() => (thicknessCm = opt)}>{opt} cm</button>
							{/each}
						</div>
					</div>
				{:else}
					<ul class="list">
						{#each prepOptions as opt (opt)}
							<li>
								<button
									class="row"
									class:active={prepLabel === opt}
									onclick={() => {
										prepLabel = opt
										next()
									}}>{opt}</button>
							</li>
						{/each}
					</ul>
				{/if}
			{:else if step === 'doneness' && cut}
				<div class="chips">
					{#each donenessOptions as opt (opt)}
						<button
							class:active={doneness === opt}
							onclick={() => {
								doneness = opt
								next()
							}}>{opt}</button>
					{/each}
				</div>
			{:else if step === 'label' && cut}
				<label class="label-input">
					<span>Eigene Bezeichnung (optional)</span>
					<input
						type="text"
						bind:value={label}
						maxlength="40"
						placeholder={`${cut.name}${thicknessCm !== null ? ` ${thicknessCm} cm` : ''}${doneness ? `, ${doneness}` : ''}`} />
				</label>
			{/if}
		</div>

		<footer>
			<div class="cook-summary">
				{#if matchedRow}
					Geschätzte Garzeit: <strong>{formatDuration(computedSeconds)}</strong>
					{#if matchedRow.restSeconds > 0}, Ruhezeit: <strong>{formatDuration(matchedRow.restSeconds)}</strong>{/if}
				{/if}
			</div>
			{#if step === 'thickness' && cut?.hasThickness}
				<Button variant="primary" fullWidth onclick={next}>Weiter</Button>
			{:else if step === 'label'}
				<Button variant="primary" fullWidth onclick={commit}>Übernehmen</Button>
			{/if}
		</footer>
	</dialog>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: var(--color-bg-overlay);
		z-index: var(--z-modal);
	}
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		max-height: 85dvh;
		background: var(--color-bg-elevated);
		color: var(--color-fg-base);
		border: none;
		border-top-left-radius: var(--radius-xl);
		border-top-right-radius: var(--radius-xl);
		padding: 0;
		z-index: calc(var(--z-modal) + 1);
		display: flex;
		flex-direction: column;
		width: 100%;
		max-width: 600px;
		margin: 0 auto;
		animation: slideUp var(--duration-slow) var(--ease-spring);
	}
	@keyframes slideUp {
		from {
			transform: translateY(100%);
		}
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--color-border-subtle);
	}
	header h2 {
		margin: 0;
		font-size: var(--font-size-lg);
		font-family: var(--font-display);
	}
	.back,
	.dismiss {
		background: transparent;
		border: none;
		color: var(--color-fg-base);
		min-width: 44px;
		min-height: 44px;
		font-size: var(--font-size-2xl);
		cursor: pointer;
	}
	.body {
		flex: 1;
		overflow: auto;
		padding: var(--space-4);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-3);
	}
	.tile {
		background: var(--color-bg-surface);
		color: var(--color-fg-base);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-lg);
		min-height: 88px;
		font-size: var(--font-size-md);
		cursor: pointer;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.list .row {
		width: 100%;
		text-align: left;
		padding: var(--space-4);
		min-height: 56px;
		background: var(--color-bg-surface);
		color: var(--color-fg-base);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-2);
		font-size: var(--font-size-md);
		cursor: pointer;
	}
	.list .row.active {
		border-color: var(--color-accent-default);
	}
	.thickness {
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.value {
		font-family: var(--font-mono);
		font-size: var(--font-size-3xl);
	}
	.thumbs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		justify-content: center;
	}
	.thumbs button {
		min-width: 56px;
		min-height: 56px;
		border-radius: var(--radius-md);
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		color: var(--color-fg-base);
		font-family: var(--font-mono);
	}
	.thumbs button.active {
		background: var(--color-accent-default);
		color: var(--color-fg-on-accent);
		border-color: var(--color-accent-default);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.chips button {
		padding: var(--space-2) var(--space-4);
		min-height: 44px;
		border-radius: var(--radius-full);
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		color: var(--color-fg-base);
	}
	.chips button.active {
		background: var(--color-accent-default);
		color: var(--color-fg-on-accent);
	}
	.label-input {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.label-input span {
		font-size: var(--font-size-sm);
		color: var(--color-fg-muted);
	}
	.label-input input {
		min-height: 44px;
		padding: var(--space-3);
		background: var(--color-bg-input);
		border: 1px solid var(--color-border-default);
		border-radius: var(--radius-md);
		color: var(--color-fg-base);
		font-size: var(--font-size-md);
	}
	footer {
		padding: var(--space-3) var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom));
		border-top: 1px solid var(--color-border-subtle);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.cook-summary {
		font-size: var(--font-size-sm);
		color: var(--color-fg-muted);
	}
	.cook-summary strong {
		color: var(--color-fg-base);
		font-family: var(--font-mono);
	}
</style>
