<script lang="ts">
	import { TIMINGS, findRow } from '$lib/data/timings'
	import type { PlannedItem, Favorite } from '$lib/models'
	import { formatDuration } from '$lib/util/format'
	import { favoritesStore } from '$lib/stores/favoritesStore.svelte'
	import Button from './Button.svelte'

	type Step = 'category' | 'cut' | 'specs'
	type Tab = 'categories' | 'favorites'

	interface Props {
		open: boolean
		initial?: PlannedItem | null
		onclose: () => void
		oncommit: (item: Omit<PlannedItem, 'id'>) => void
	}

	let { open, initial = null, onclose, oncommit }: Props = $props()

	let step = $state<Step>('category')
	let tab = $state<Tab>('categories')
	let categorySlug = $state<string | null>(null)
	let cutSlug = $state<string | null>(null)
	let thicknessCm = $state<number | null>(null)
	let prepLabel = $state<string | null>(null)
	let doneness = $state<string | null>(null)

	let saveFavoriteOpen = $state(false)
	let favoriteName = $state('')

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
			tab = 'categories'
			step = specsHasAnything ? 'specs' : 'cut'
		} else {
			reset()
			void favoritesStore.init()
		}
	})

	function reset() {
		step = 'category'
		tab = 'categories'
		categorySlug = null
		cutSlug = null
		thicknessCm = null
		prepLabel = null
		doneness = null
		saveFavoriteOpen = false
		favoriteName = ''
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
			if (tab === 'favorites') {
				tab = 'categories'
				return
			}
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

	function applyFavorite(fav: Favorite) {
		oncommit({
			categorySlug: fav.categorySlug,
			cutSlug: fav.cutSlug,
			thicknessCm: fav.thicknessCm,
			prepLabel: fav.prepLabel,
			doneness: fav.doneness,
			label: fav.label,
			cookSeconds: fav.cookSeconds,
			restSeconds: fav.restSeconds,
			flipFraction: fav.flipFraction,
			idealFlipPattern: fav.idealFlipPattern,
			heatZone: fav.heatZone,
		})
		void favoritesStore.touch(fav.id)
		onclose()
	}

	let pressTimer: ReturnType<typeof setTimeout> | null = null
	let longPressed = false

	function favPointerdown(fav: Favorite) {
		longPressed = false
		pressTimer = setTimeout(() => {
			longPressed = true
			pressTimer = null
			handleFavoriteLongPress(fav)
		}, 500)
	}
	function favPointerup(fav: Favorite) {
		if (pressTimer) {
			clearTimeout(pressTimer)
			pressTimer = null
			if (!longPressed) applyFavorite(fav)
		}
	}
	function favPointercancel() {
		if (pressTimer) {
			clearTimeout(pressTimer)
			pressTimer = null
		}
	}

	function handleFavoriteLongPress(fav: Favorite) {
		const action = window.prompt(`${fav.name}\n\n1. Umbenennen\n2. Löschen\n\nNummer eingeben:`)
		if (action === '1') {
			const newName = window.prompt('Neuer Name:', fav.name)
			if (newName?.trim()) void favoritesStore.rename(fav.id, newName.trim())
		}
		if (action === '2' && window.confirm(`Favorit "${fav.name}" wirklich löschen?`)) {
			void favoritesStore.remove(fav.id)
		}
	}

	function openSaveFavorite() {
		favoriteName = ''
		saveFavoriteOpen = true
	}

	async function confirmSaveFavorite() {
		const name = favoriteName.trim()
		if (!name || !cut || !category || !matchedRow) return
		await favoritesStore.save({
			name,
			categorySlug: category.slug,
			cutSlug: cut.slug,
			thicknessCm,
			prepLabel,
			doneness,
			label: autoLabel(),
			cookSeconds: computedSeconds,
			restSeconds: matchedRow.restSeconds,
			flipFraction: matchedRow.flipFraction,
			idealFlipPattern: matchedRow.idealFlipPattern,
			heatZone: matchedRow.heatZone,
		})
		saveFavoriteOpen = false
		favoriteName = ''
	}

	function favoriteSummary(fav: Favorite): string {
		return fav.label ?? fav.cutSlug
	}

	function favoriteLastUsed(fav: Favorite): string {
		return new Date(fav.lastUsedEpoch).toLocaleDateString('de-CH')
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

	const showTabs = $derived(open && step === 'category' && initial === null)
</script>

{#if open}
	<div class="scrim" role="presentation" onclick={onclose}></div>
	<div class="sheet" role="dialog" aria-modal="true" aria-label="Eintrag hinzufügen">
		<div class="handle" aria-hidden="true"></div>
		<header>
			<button class="back" onclick={back} aria-label="Zurück">‹</button>
			<div class="title-stack">
				{#if cut && step === 'specs'}
					<span class="subtitle">{cut.name.toUpperCase()}</span>
				{:else if category && step === 'cut'}
					<span class="subtitle">{category.name.toUpperCase()}</span>
				{/if}
				<h2>{titleFor(step)}</h2>
			</div>
			<button class="dismiss" onclick={onclose} aria-label="Schliessen">×</button>
		</header>

		{#if showTabs}
			<div class="tabs" role="tablist" aria-label="Modus">
				<button
					type="button"
					role="tab"
					aria-selected={tab === 'categories'}
					class:active={tab === 'categories'}
					onclick={() => (tab = 'categories')}>Kategorie</button>
				<button
					type="button"
					role="tab"
					aria-selected={tab === 'favorites'}
					class:active={tab === 'favorites'}
					onclick={() => (tab = 'favorites')}>Favoriten</button>
			</div>
		{/if}

		<div class="body">
			{#if step === 'category' && tab === 'favorites'}
				{#if favoritesStore.all.length === 0}
					<div class="empty-state">
						<p>Du hast noch keine Favoriten. Stelle ein Stück zusammen und speichere es unten.</p>
						<Button variant="ghost" onclick={() => (tab = 'categories')}>Zur Kategorie</Button>
					</div>
				{:else}
					<ul class="fav-list">
						{#each favoritesStore.all as fav (fav.id)}
							<li>
								<button
									type="button"
									class="fav-row"
									onpointerdown={() => favPointerdown(fav)}
									onpointerup={() => favPointerup(fav)}
									onpointerleave={favPointercancel}
									onpointercancel={favPointercancel}>
									<span class="fav-name">{fav.name}</span>
									<span class="fav-summary">{favoriteSummary(fav)}</span>
									<span class="fav-last">Zuletzt: {favoriteLastUsed(fav)}</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			{:else if step === 'category'}
				<div class="grid">
					{#each TIMINGS.categories as c (c.slug)}
						<button class="tile" onclick={() => pickCategory(c.slug)}>
							<span class="tile-icon" aria-hidden="true">
								<svg
									width="28"
									height="28"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.6"
									stroke-linecap="round"
									stroke-linejoin="round">
									<circle cx="12" cy="12" r="9" />
								</svg>
							</span>
							<span class="tile-name">{c.name}</span>
						</button>
					{/each}
				</div>
			{:else if step === 'cut' && category}
				<ul class="cut-list">
					{#each category.cuts as c (c.slug)}
						{@const baseSec = Math.round(
							c.rows.reduce((s, r) => s + (r.cookSecondsMin + r.cookSecondsMax) / 2, 0) / Math.max(1, c.rows.length),
						)}
						<li>
							<button class="cut-row" onclick={() => pickCut(c.slug)}>
								<span class="cut-name">{c.name}</span>
								<span class="cut-time">~{Math.max(1, Math.round(baseSec / 60))} min</span>
							</button>
						</li>
					{/each}
				</ul>
			{:else if step === 'specs' && cut}
				{#if needsThickness}
					<section class="section">
						<h3>Dicke</h3>
						<div class="thickness-card">
							<button
								type="button"
								class="round-step"
								disabled={atThicknessMin}
								onclick={() => stepThickness(-1)}
								aria-label="Dünner">−</button>
							<div class="thickness-value">
								<span class="num">{thicknessCm !== null ? formatThickness(thicknessCm) : '—'}</span>
								<span class="unit">cm</span>
							</div>
							<button
								type="button"
								class="round-step"
								disabled={atThicknessMax}
								onclick={() => stepThickness(1)}
								aria-label="Dicker">+</button>
						</div>
					</section>
				{:else if needsPrep}
					<section class="section">
						<h3>Variante</h3>
						<ul class="variant-list">
							{#each prepOptions as opt (opt)}
								<li>
									<button type="button" class="variant-row" class:active={prepLabel === opt} onclick={() => (prepLabel = opt)}
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
			{#if step === 'specs' && matchedRow}
				<div class="cook-summary">
					<span class="cook-eyebrow">Garzeit</span>
					<span class="cook-values">
						<strong class="cook-cook">{formatDuration(computedSeconds)}</strong>
						{#if matchedRow.restSeconds > 0}
							<span class="cook-sep">+ Ruhe</span>
							<strong class="cook-rest">{formatDuration(matchedRow.restSeconds)}</strong>
						{/if}
					</span>
				</div>
			{/if}
			{#if step === 'specs'}
				<div class="footer-actions">
					{#if saveFavoriteOpen}
						<input
							type="text"
							class="favorite-input"
							bind:value={favoriteName}
							maxlength="60"
							placeholder="Name speichern"
							aria-label="Favorit-Name"
							onkeydown={e => {
								if (e.key === 'Enter') {
									e.preventDefault()
									void confirmSaveFavorite()
								}
							}} />
						<Button variant="primary" size="sm" disabled={!favoriteName.trim()} onclick={confirmSaveFavorite}>Speichern</Button>
					{:else if initial === null}
						<Button variant="accentGhost" size="sm" disabled={!specsComplete} onclick={openSaveFavorite}
							>★ Als Favorit speichern</Button>
					{/if}
					<Button variant="primary" size="lg" fullWidth disabled={!specsComplete} onclick={commit}>Übernehmen</Button>
				</div>
			{/if}
		</footer>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: var(--color-bg-overlay);
		backdrop-filter: blur(4px);
		z-index: var(--z-modal);
	}
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		max-height: 85dvh;
		background: var(--color-bg-surface);
		color: var(--color-fg-base);
		border: none;
		border-top-left-radius: 24px;
		border-top-right-radius: 24px;
		padding: 0;
		z-index: calc(var(--z-modal) + 1);
		display: flex;
		flex-direction: column;
		width: 100%;
		max-width: 600px;
		margin: 0 auto;
		box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.5);
		animation: aSheetIn 0.3s cubic-bezier(0.2, 0.7, 0.3, 1);
	}
	@keyframes aSheetIn {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}
	.handle {
		height: 4px;
		width: 36px;
		background: var(--color-border-strong);
		border-radius: 2px;
		margin: 10px auto 6px;
	}
	header {
		display: flex;
		align-items: center;
		padding: 8px 16px 14px;
		border-bottom: 1px solid var(--color-border-subtle);
	}
	header h2 {
		margin: 0;
		font-size: 22px;
		font-family: var(--font-display);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.01em;
	}
	.title-stack {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		min-width: 0;
		flex: 1;
		text-align: center;
	}
	.subtitle {
		font-family: var(--font-body);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.12em;
		color: var(--color-ember);
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
		font-size: 22px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.tabs {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
		margin: 14px 16px 0;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: 16px;
		padding: 4px;
	}
	.tabs button {
		min-height: 40px;
		background: transparent;
		border: none;
		color: var(--color-fg-base);
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 14px;
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.tabs button.active {
		background: var(--color-ember);
		color: var(--color-ember-ink);
	}
	.body {
		flex: 1;
		overflow: auto;
	}
	.section {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-bottom: 24px;
	}
	.section h3 {
		margin: 0;
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--color-fg-muted);
	}
	.grid {
		padding: 16px;
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 8px;
	}
	.tile {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
		background: var(--color-bg-surface-2);
		color: var(--color-fg-base);
		border: 1px solid var(--color-border-subtle);
		border-radius: 14px;
		padding: 18px 12px;
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
	}
	.tile:hover {
		border-color: var(--color-border-strong);
	}
	.tile-icon {
		color: var(--color-ember);
		opacity: 0.85;
		display: inline-flex;
	}
	.tile-name {
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 14px;
	}
	.cut-list {
		padding: 8px 16px 16px;
		list-style: none;
		margin: 0;
	}
	.cut-row {
		width: 100%;
		background: transparent;
		border: none;
		border-bottom: 1px solid var(--color-border-subtle);
		padding: 14px 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		color: var(--color-fg-base);
		cursor: pointer;
		text-align: left;
		font-family: var(--font-body);
	}
	.cut-name {
		font-size: 16px;
		font-weight: 500;
	}
	.cut-time {
		font-family: var(--font-display);
		font-size: 13px;
		color: var(--color-fg-muted);
		font-variant-numeric: tabular-nums;
	}
	.fav-list {
		list-style: none;
		padding: 8px 16px 16px;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.fav-row {
		width: 100%;
		text-align: left;
		padding: 14px 18px;
		min-height: 64px;
		background: var(--color-bg-surface-2);
		color: var(--color-fg-base);
		border: 1px solid var(--color-border-subtle);
		border-radius: 14px;
		font: inherit;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.fav-name {
		font-size: 16px;
		font-weight: 600;
	}
	.fav-summary {
		font-size: 13px;
		color: var(--color-fg-muted);
	}
	.fav-last {
		font-size: 12px;
		color: var(--color-fg-subtle);
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
	}
	.empty-state {
		display: flex;
		flex-direction: column;
		gap: 12px;
		align-items: center;
		text-align: center;
		padding: 24px;
		color: var(--color-fg-muted);
	}
	.empty-state p {
		margin: 0;
	}

	/* Specs step */
	.section,
	footer {
		padding-left: 20px;
		padding-right: 20px;
	}
	.section {
		padding-top: 0;
	}
	.body > .section:first-child {
		padding-top: 20px;
	}
	.thickness-card {
		background: var(--color-bg-surface-2);
		border: 1px solid var(--color-border-subtle);
		border-radius: 14px;
		padding: 14px 18px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.round-step {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		border: 1px solid var(--color-border-strong);
		background: transparent;
		color: var(--color-fg-base);
		font-size: 20px;
		cursor: pointer;
		flex-shrink: 0;
	}
	.round-step:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.thickness-value {
		display: flex;
		align-items: baseline;
		gap: 6px;
	}
	.thickness-value .num {
		font-family: var(--font-display);
		font-size: 48px;
		font-weight: 600;
		line-height: 1;
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
		min-width: 3ch;
		text-align: center;
	}
	.thickness-value .unit {
		font-family: var(--font-body);
		font-size: 12px;
		color: var(--color-fg-muted);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.variant-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.variant-row {
		width: 100%;
		text-align: left;
		padding: 14px 16px;
		background: var(--color-bg-surface-2);
		border: 1px solid var(--color-border-subtle);
		border-radius: 12px;
		color: var(--color-fg-base);
		font-family: var(--font-body);
		font-weight: 500;
		font-size: 14px;
		cursor: pointer;
	}
	.variant-row.active {
		background: rgba(255, 122, 26, 0.13);
		border-color: var(--color-ember);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.chips button {
		padding: 12px 16px;
		min-height: 44px;
		border-radius: 10px;
		background: transparent;
		border: 1px solid var(--color-border-strong);
		color: var(--color-fg-base);
		font-family: var(--font-body);
		font-weight: 500;
		font-size: 14px;
		cursor: pointer;
	}
	.chips button.active {
		background: var(--color-ember);
		color: var(--color-ember-ink);
		border-color: var(--color-ember);
	}
	footer {
		padding-top: 16px;
		padding-bottom: calc(16px + env(safe-area-inset-bottom));
		border-top: 1px solid var(--color-border-subtle);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.cook-summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: var(--color-bg-surface-2);
		border: 1px solid var(--color-border-subtle);
		border-radius: 12px;
		padding: 12px 16px;
	}
	.cook-eyebrow {
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-fg-muted);
	}
	.cook-values {
		display: flex;
		gap: 16px;
		align-items: baseline;
		font-family: var(--font-display);
		font-size: 14px;
		font-variant-numeric: tabular-nums;
	}
	.cook-cook {
		color: var(--color-ember);
		font-weight: 700;
	}
	.cook-sep {
		color: var(--color-fg-muted);
		margin-right: 4px;
	}
	.cook-rest {
		color: var(--color-fg-base);
	}
	.footer-actions {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.favorite-input {
		min-height: 44px;
		padding: 12px;
		background: var(--color-bg-surface-2);
		border: 1px solid var(--color-border-strong);
		border-radius: 12px;
		color: var(--color-fg-base);
		font-size: 16px;
		font-family: var(--font-body);
	}
</style>
