<script lang="ts">
	import { TIMINGS, findRow } from '$lib/data/timings'
	import type { PlannedItem } from '$lib/models'
	import { formatDuration } from '$lib/util/format'
	import Button from './Button.svelte'

	type Step = 'category' | 'cut' | 'specs'

	interface Props {
		open: boolean
		initial?: PlannedItem | null
		onclose: () => void
		oncommit: (item: Omit<PlannedItem, 'id'>) => void
	}

	let { open, initial = null, onclose, oncommit }: Props = $props()

	let step = $state<Step>('category')
	let categorySlug = $state<string | null>(null)
	let cutSlug = $state<string | null>(null)
	let thicknessCm = $state<number | null>(null)
	let prepLabel = $state<string | null>(null)
	let doneness = $state<string | null>(null)

	const category = $derived(categorySlug ? (TIMINGS.categories.find(c => c.slug === categorySlug) ?? null) : null)
	const cut = $derived(category && cutSlug ? (category.cuts.find(c => c.slug === cutSlug) ?? null) : null)
	const matchedRow = $derived(cut ? findRow(cut, thicknessCm, doneness) : undefined)
	const computedSeconds = $derived(matchedRow ? Math.round((matchedRow.cookSecondsMin + matchedRow.cookSecondsMax) / 2) : 0)

	const donenessOrder = ['Bleu', 'Rare', 'Medium-rare', 'Medium', 'Medium-well', 'Well-done']
	const donenessOptions = $derived.by<string[]>(() => {
		if (!cut?.hasDoneness) return []
		const set = new Set(cut.rows.map(r => r.doneness).filter((v): v is string => v !== null))
		return donenessOrder.filter(d => set.has(d)).concat([...set].filter(d => !donenessOrder.includes(d)))
	})

	// Em-dash prepLabels are data holes — filter them so the user never picks "—".
	const prepOptions = $derived(
		!cut?.hasThickness && cut
			? [...new Set(cut.rows.map(r => r.prepLabel).filter((v): v is string => v !== null && v !== '—' && v !== '-'))]
			: [],
	)

	// What the specs step actually needs to ask. Single-option choices are
	// auto-applied in pickCut() and not rendered.
	const needsThickness = $derived(!!cut?.hasThickness)
	const needsPrep = $derived(prepOptions.length > 1)
	const needsDoneness = $derived(donenessOptions.length > 1)
	const specsHasAnything = $derived(needsThickness || needsPrep || needsDoneness)

	function titleFor(s: Step): string {
		switch (s) {
			case 'category':
				return 'Kategorie'
			case 'cut':
				return 'Stück'
			case 'specs':
				if (needsThickness && needsDoneness) return 'Dicke & Garstufe'
				if (needsThickness) return 'Dicke'
				if (needsDoneness) return 'Garstufe'
				if (needsPrep) return 'Variante'
				return 'Anpassen'
		}
	}

	$effect(() => {
		if (!open) return
		if (initial) {
			categorySlug = initial.categorySlug
			cutSlug = initial.cutSlug
			thicknessCm = initial.thicknessCm
			prepLabel = initial.prepLabel
			doneness = initial.doneness
			step = specsHasAnything ? 'specs' : 'cut'
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
	}

	function pickCategory(slug: string) {
		categorySlug = slug
		cutSlug = null
		step = 'cut'
	}

	function pickCut(slug: string) {
		const cat = categorySlug ? TIMINGS.categories.find(c => c.slug === categorySlug) : null
		const c = cat?.cuts.find(cu => cu.slug === slug)
		if (!c) return
		cutSlug = slug

		// Pre-select defaults based on the cut's row shape.
		if (c.hasThickness) {
			const ts = c.rows.map(r => r.thicknessCm).filter((v): v is number => v !== null)
			thicknessCm = ts.length > 0 ? Math.min(...ts) : null
			prepLabel = null
		} else {
			thicknessCm = null
			const preps = [...new Set(c.rows.map(r => r.prepLabel).filter((v): v is string => v !== null && v !== '—' && v !== '-'))]
			prepLabel = preps[0] ?? null
		}
		if (c.hasDoneness) {
			const dones = c.rows.map(r => r.doneness).filter((v): v is string => v !== null)
			doneness = dones.includes('Medium-rare') ? 'Medium-rare' : (dones[0] ?? null)
		} else {
			doneness = null
		}

		// If nothing remains for the user to choose, commit immediately.
		// Em-dash placeholders don't count as choices.
		const remainingPrep = !c.hasThickness
			? new Set(c.rows.map(r => r.prepLabel).filter(p => p && p !== '—' && p !== '-')).size
			: 0
		const remainingDone = c.hasDoneness ? new Set(c.rows.map(r => r.doneness).filter(Boolean)).size : 0
		if (!c.hasThickness && remainingPrep <= 1 && remainingDone <= 1) {
			commit()
		} else {
			step = 'specs'
		}
	}

	function back() {
		if (step === 'category') {
			onclose()
			return
		}
		if (step === 'cut') {
			step = initial ? 'specs' : 'category'
		} else if (step === 'specs') {
			step = 'cut'
		}
	}

	function autoLabel(): string {
		if (!cut) return ''
		const parts: string[] = [cut.name]
		if (thicknessCm !== null) parts[0] += ` ${formatThickness(thicknessCm)} cm`
		if (doneness) parts.push(doneness)
		if (prepLabel && !cut.hasThickness && prepOptions.length > 1) parts.push(prepLabel)
		return parts.join(', ')
	}

	function commit() {
		if (!cut || !category || !matchedRow) return
		const baseLabel = initial?.label ?? autoLabel()
		oncommit({
			categorySlug: category.slug,
			cutSlug: cut.slug,
			thicknessCm,
			prepLabel,
			doneness,
			label: baseLabel,
			cookSeconds: computedSeconds,
			restSeconds: matchedRow.restSeconds,
			flipFraction: matchedRow.flipFraction,
			idealFlipPattern: matchedRow.idealFlipPattern,
			heatZone: matchedRow.heatZone,
		})
		reset()
	}

	function formatThickness(cm: number): string {
		return Number.isInteger(cm) ? String(cm) : cm.toFixed(1)
	}

	// Thickness range: snap to 0.5 cm steps, extend 1 cm below documented min
	// (with a hard floor of 1.5 cm for thin slices), keep documented max as
	// upper bound.
	const THICKNESS_FLOOR = 1.5
	const thicknessOptions = $derived.by<number[]>(() => {
		if (!cut?.hasThickness) return []
		const ts = cut.rows.map(r => r.thicknessCm).filter((v): v is number => v !== null)
		if (ts.length === 0) return []
		const documentedMin = Math.min(...ts)
		const max = Math.max(...ts)
		const min = Math.max(THICKNESS_FLOOR, Math.round((documentedMin - 1) * 2) / 2)
		const out: number[] = []
		for (let v = min; v <= max + 1e-6; v = Math.round((v + 0.5) * 10) / 10) {
			out.push(Math.round(v * 10) / 10)
		}
		return out
	})

	function stepThickness(delta: number) {
		if (thicknessOptions.length === 0) return
		const current = thicknessCm ?? thicknessOptions[0]
		const idx = thicknessOptions.findIndex(o => Math.abs(o - current) < 1e-6)
		if (idx === -1) {
			thicknessCm = thicknessOptions[0]
			return
		}
		const next = idx + delta
		if (next < 0 || next >= thicknessOptions.length) return
		thicknessCm = thicknessOptions[next]
	}

	const atThicknessMin = $derived(
		thicknessOptions.length === 0 || (thicknessCm !== null && Math.abs(thicknessCm - thicknessOptions[0]) < 1e-6),
	)
	const atThicknessMax = $derived(
		thicknessOptions.length === 0 ||
			(thicknessCm !== null && Math.abs(thicknessCm - thicknessOptions[thicknessOptions.length - 1]) < 1e-6),
	)

	const specsComplete = $derived.by(() => {
		if (!cut) return false
		if (cut.hasThickness && thicknessCm === null) return false
		if (!cut.hasThickness && prepOptions.length > 0 && prepLabel === null) return false
		if (cut.hasDoneness && doneness === null) return false
		return true
	})
</script>

{#if open}
	<div class="scrim" role="presentation" onclick={onclose}></div>
	<div class="sheet" role="dialog" aria-modal="true" aria-label="Eintrag hinzufügen">
		<header>
			<button class="back" onclick={back} aria-label="Zurück">‹</button>
			<div class="title-stack">
				{#if cut && step === 'specs'}
					<span class="subtitle">{cut.name}</span>
				{/if}
				<h2>{titleFor(step)}</h2>
			</div>
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
			{:else if step === 'specs' && cut}
				{#if needsThickness}
					<section class="section">
						<h3>Dicke</h3>
						<div class="stepper">
							<button type="button" class="step" disabled={atThicknessMin} onclick={() => stepThickness(-1)} aria-label="Dünner"
								>−</button>
							<div class="stepper-value">
								<span class="num">{thicknessCm !== null ? formatThickness(thicknessCm) : '—'}</span>
								<span class="unit">cm</span>
							</div>
							<button type="button" class="step" disabled={atThicknessMax} onclick={() => stepThickness(1)} aria-label="Dicker"
								>+</button>
						</div>
					</section>
				{:else if needsPrep}
					<section class="section">
						<h3>Variante</h3>
						<ul class="list">
							{#each prepOptions as opt (opt)}
								<li>
									<button type="button" class="row" class:active={prepLabel === opt} onclick={() => (prepLabel = opt)}
										>{opt}</button>
								</li>
							{/each}
						</ul>
					</section>
				{/if}
				{#if needsDoneness}
					<section class="section">
						<h3>Garstufe</h3>
						<div class="chips">
							{#each donenessOptions as opt (opt)}
								<button type="button" class:active={doneness === opt} onclick={() => (doneness = opt)}>{opt}</button>
							{/each}
						</div>
					</section>
				{/if}
			{/if}
		</div>

		<footer>
			<div class="cook-summary">
				{#if matchedRow && step === 'specs'}
					Geschätzte Garzeit: <strong>{formatDuration(computedSeconds)}</strong>
					{#if matchedRow.restSeconds > 0}, Ruhezeit: <strong>{formatDuration(matchedRow.restSeconds)}</strong>{/if}
				{/if}
			</div>
			{#if step === 'specs'}
				<Button variant="primary" fullWidth disabled={!specsComplete} onclick={commit}>Übernehmen</Button>
			{/if}
		</footer>
	</div>
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
	.title-stack {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		min-width: 0;
	}
	.subtitle {
		font-size: var(--font-size-xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-widest);
		color: var(--color-fg-muted);
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}
	.section {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.section h3 {
		margin: 0;
		font-size: var(--font-size-sm);
		text-transform: uppercase;
		letter-spacing: var(--tracking-widest);
		color: var(--color-fg-muted);
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
	.stepper {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-lg);
	}
	.step {
		min-width: 56px;
		min-height: 56px;
		border-radius: var(--radius-full);
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-border-subtle);
		color: var(--color-fg-base);
		font-size: var(--font-size-2xl);
		font-weight: 600;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
		padding: 0;
	}
	.step:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.step:not(:disabled):active {
		background: var(--color-accent-default);
		color: var(--color-fg-on-accent);
		border-color: var(--color-accent-default);
	}
	.stepper-value {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		font-family: var(--font-mono);
	}
	.stepper-value .num {
		font-size: var(--font-size-3xl);
		font-variant-numeric: tabular-nums;
		min-width: 4ch;
		text-align: center;
	}
	.stepper-value .unit {
		font-size: var(--font-size-md);
		color: var(--color-fg-muted);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.chips button {
		padding: var(--space-2) var(--space-4);
		min-height: 44px;
		border-radius: var(--radius-md);
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		color: var(--color-fg-base);
	}
	.chips button.active {
		background: var(--color-accent-default);
		color: var(--color-fg-on-accent);
		border-color: var(--color-accent-default);
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
		min-height: 1.4em;
	}
	.cook-summary strong {
		color: var(--color-fg-base);
		font-family: var(--font-mono);
	}
</style>
