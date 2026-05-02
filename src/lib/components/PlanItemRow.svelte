<script lang="ts">
	import { tick } from 'svelte'
	import type { PlannedItem } from '$lib/models'
	import { formatDuration } from '$lib/util/format'
	import { tipsForItem } from '$lib/util/tips'

	interface Props {
		item: PlannedItem
		onedit: (id: string) => void
		ondelete: (id: string) => void
		onrename: (id: string, label: string) => void
		onadjustcook: (id: string, deltaSeconds: number) => void
	}

	let { item, onedit, ondelete, onrename, onadjustcook }: Props = $props()

	const COOK_STEP = 30
	const COOK_MIN = 30
	const COOK_MAX = 6 * 60 * 60

	let touchStartX = 0
	let dragX = $state(0)
	let confirming = $state(false)
	let renaming = $state(false)
	let renameValue = $state('')
	let renameInput = $state<HTMLInputElement | null>(null)
	let tipsOpen = $state(false)

	function ontouchstart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX
	}
	function ontouchmove(e: TouchEvent) {
		const dx = e.touches[0].clientX - touchStartX
		dragX = Math.min(0, dx)
	}
	function ontouchend() {
		if (dragX < -80) {
			confirming = true
		} else {
			dragX = 0
		}
	}

	function confirmDelete() {
		ondelete(item.id)
	}
	function cancelDelete() {
		confirming = false
		dragX = 0
	}

	function describe(): string {
		const parts: string[] = []
		if (item.thicknessCm !== null) parts.push(`${item.thicknessCm} cm`)
		else if (item.prepLabel && item.prepLabel !== '—' && item.prepLabel !== '-') parts.push(item.prepLabel)
		if (item.doneness) parts.push(item.doneness)
		if (parts.length === 0 && item.prepLabel) parts.push(item.prepLabel)
		if (item.grateTempC) parts.push(`${item.grateTempC} °C`)
		return parts.join(' · ')
	}

	function displayTitle(): string {
		const fallback = item.label || item.cutSlug
		if (!item.label) return fallback
		let title = item.label.trim()
		if (item.doneness) title = title.replace(new RegExp(`,?\\s*${escapeRegExp(item.doneness)}$`, 'i'), '').trim()
		if (item.thicknessCm !== null) {
			const thickness = `${item.thicknessCm}`.replace('.', '[.,]')
			title = title.replace(new RegExp(`\\s+${thickness}\\s*cm$`, 'i'), '').trim()
		}
		if (item.prepLabel && item.prepLabel !== '—' && item.prepLabel !== '-') {
			title = title.replace(new RegExp(`,?\\s*${escapeRegExp(item.prepLabel)}$`, 'i'), '').trim()
		}
		return title || fallback
	}

	function escapeRegExp(value: string): string {
		return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	}

	async function startRename(e: MouseEvent) {
		e.stopPropagation()
		renameValue = item.label ?? ''
		renaming = true
		await tick()
		renameInput?.focus()
		renameInput?.select()
	}

	function commitRename() {
		const next = renameValue.trim()
		if (next && next !== item.label) onrename(item.id, next)
		renaming = false
	}

	function cancelRename() {
		renaming = false
	}

	function onRenameKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault()
			commitRename()
		} else if (e.key === 'Escape') {
			e.preventDefault()
			cancelRename()
		}
	}

	function adjustCook(delta: number, e: MouseEvent) {
		e.stopPropagation()
		const next = Math.max(COOK_MIN, Math.min(COOK_MAX, item.cookSeconds + delta))
		if (next === item.cookSeconds) return
		onadjustcook(item.id, next - item.cookSeconds)
	}

	const atCookMin = $derived(item.cookSeconds <= COOK_MIN)
	const atCookMax = $derived(item.cookSeconds >= COOK_MAX)
	const meta = $derived(describe())
	const title = $derived(displayTitle())
	const tips = $derived(tipsForItem(item))
	const tipsId = $derived(`tips-${item.id}`)

	function toggleTips(e: MouseEvent) {
		e.stopPropagation()
		tipsOpen = !tipsOpen
	}
</script>

<div class="row" role="listitem">
	<div class="content" role="group" style="transform: translateX({dragX}px)" {ontouchstart} {ontouchmove} {ontouchend}>
		<div class="main">
			<div class="body">
				{#if renaming}
					<input
						bind:this={renameInput}
						bind:value={renameValue}
						class="rename-input"
						maxlength="40"
						onkeydown={onRenameKey}
						onblur={commitRename}
						aria-label="Bezeichnung bearbeiten" />
				{:else}
					<button class="title" onclick={startRename} aria-label="Bezeichnung umbenennen">
						{title}
					</button>
				{/if}
				{#if meta}
					<button
						class="meta"
						onclick={() => onedit(item.id)}
						aria-label={`Spezifikation bearbeiten: ${item.label || item.cutSlug}`}>{meta}</button>
				{/if}
			</div>

			{#if tips.length > 0}
				<button
					type="button"
					class="tips-btn"
					class:active={tipsOpen}
					onclick={toggleTips}
					aria-expanded={tipsOpen}
					aria-controls={tipsId}
					aria-label={tipsOpen ? 'Tipps ausblenden' : 'Tipps anzeigen'}>
					<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
						<circle cx="7" cy="7" r="6.25" fill="none" stroke="currentColor" stroke-width="1.4" />
						<rect x="6.3" y="5.7" width="1.4" height="4.2" rx="0.7" fill="currentColor" />
						<circle cx="7" cy="3.9" r="0.85" fill="currentColor" />
					</svg>
				</button>
			{/if}

			<div class="stepper" role="group" aria-label="Garzeit anpassen">
				<button type="button" class="step-btn" disabled={atCookMin} onclick={e => adjustCook(-COOK_STEP, e)} aria-label="Weniger"
					>−</button>
				<span class="step-value">{formatDuration(item.cookSeconds)}</span>
				<button type="button" class="step-btn" disabled={atCookMax} onclick={e => adjustCook(COOK_STEP, e)} aria-label="Mehr"
					>+</button>
			</div>

			<button class="remove" onclick={() => ondelete(item.id)} aria-label="Entfernen">
				<svg width="24" height="24" viewBox="0 0 22 22" aria-hidden="true">
					<circle cx="11" cy="11" r="11" fill="var(--color-bg-surface-2)" stroke="var(--color-border-strong)" />
					<rect x="5.5" y="10" width="11" height="2" rx="1" fill="var(--color-fg-muted)" />
				</svg>
			</button>
		</div>

		{#if tipsOpen && tips.length > 0}
			<ul class="tips-tray" id={tipsId}>
				{#each tips as tip (tip)}
					<li>{tip}</li>
				{/each}
			</ul>
		{/if}
	</div>
	{#if confirming}
		<div class="confirm">
			<button class="del" onclick={confirmDelete} aria-label="Löschen bestätigen">Löschen</button>
			<button class="cancel" onclick={cancelDelete} aria-label="Abbrechen">×</button>
		</div>
	{/if}
</div>

<style>
	.row {
		position: relative;
		margin-bottom: 8px;
		border-radius: 14px;
		overflow: hidden;
		background: var(--color-error-default);
	}
	.content {
		display: flex;
		flex-direction: column;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: 14px;
		overflow: hidden;
		transition: transform var(--duration-fast) var(--ease-default);
	}
	.main {
		display: flex;
		align-items: stretch;
		gap: 0;
	}
	.body {
		flex: 1;
		padding: 12px 14px 12px 16px;
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
		justify-content: center;
	}
	.title {
		font-family: var(--font-body);
		font-size: 15px;
		font-weight: 600;
		line-height: 1.25;
		background: transparent;
		border: none;
		padding: 0;
		text-align: left;
		color: var(--color-fg-base);
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.rename-input {
		background: transparent;
		border: none;
		border-bottom: 1px solid var(--color-ember);
		color: var(--color-fg-base);
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 15px;
		padding: 2px 0;
		outline: none;
	}
	.meta {
		font-family: var(--font-body);
		font-size: 13px;
		color: var(--color-fg-muted);
		letter-spacing: 0.02em;
		line-height: 1.3;
		background: transparent;
		border: none;
		padding: 0;
		text-align: left;
		cursor: pointer;
	}
	.meta:hover {
		color: var(--color-fg-base);
	}
	.stepper {
		display: inline-flex;
		align-items: stretch;
		align-self: center;
		margin: 0 6px 0 8px;
		background: var(--color-bg-surface-2);
		border: 1px solid var(--color-border-subtle);
		border-radius: 999px;
		overflow: hidden;
		height: 44px;
	}
	.step-btn {
		width: 36px;
		background: transparent;
		border: none;
		color: var(--color-fg-muted);
		cursor: pointer;
		font-size: 18px;
		font-weight: 500;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.step-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.step-value {
		min-width: 56px;
		padding: 0 4px;
		text-align: center;
		font-family: var(--font-display);
		font-size: 19px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.01em;
		color: var(--color-fg-base);
		display: flex;
		align-items: center;
		justify-content: center;
		border-left: 1px solid var(--color-border-subtle);
		border-right: 1px solid var(--color-border-subtle);
	}
	.remove {
		flex-shrink: 0;
		width: 44px;
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.tips-btn {
		flex-shrink: 0;
		align-self: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: transparent;
		border: 1px solid var(--color-border-subtle);
		color: var(--color-fg-muted);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all var(--duration-fast) var(--ease-default);
	}
	.tips-btn:hover {
		color: var(--color-ember);
		border-color: var(--color-ember);
	}
	.tips-btn.active {
		background: rgba(255, 122, 26, 0.13);
		border-color: var(--color-ember);
		color: var(--color-ember);
	}
	.tips-tray {
		list-style: none;
		margin: 0;
		padding: 12px 16px 14px 32px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		background: var(--color-bg-surface-2);
		border-top: 1px solid var(--color-border-subtle);
	}
	.tips-tray li {
		position: relative;
		padding-left: 14px;
		font-family: var(--font-body);
		font-size: 12.5px;
		line-height: 1.45;
		color: var(--color-fg-base);
	}
	.tips-tray li::before {
		content: '';
		position: absolute;
		left: 0;
		top: 7px;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--color-ember);
	}
	.confirm {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		padding: 12px;
	}
	.del {
		background: var(--color-error-default);
		color: #fff;
		border: none;
		border-radius: 10px;
		padding: 8px 16px;
		min-height: 44px;
		cursor: pointer;
	}
	.cancel {
		background: var(--color-bg-elevated);
		color: var(--color-fg-base);
		border: 1px solid var(--color-border-default);
		border-radius: 10px;
		min-width: 44px;
		min-height: 44px;
		cursor: pointer;
	}
</style>
