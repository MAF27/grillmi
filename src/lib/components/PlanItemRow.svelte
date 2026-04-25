<script lang="ts">
	import { tick } from 'svelte'
	import type { PlannedItem } from '$lib/models'
	import { formatDuration } from '$lib/util/format'

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
		return parts.join(' · ')
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
</script>

<div class="row" role="listitem">
	<div class="content" role="group" style="transform: translateX({dragX}px)" {ontouchstart} {ontouchmove} {ontouchend}>
		<div class="main">
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
					{item.label || item.cutSlug}
				</button>
			{/if}
			<button class="meta" onclick={() => onedit(item.id)} aria-label={`Spezifikation bearbeiten: ${item.label || item.cutSlug}`}
				>{describe() || 'Anpassen'}</button>
		</div>

		<div class="cook" role="group" aria-label="Garzeit anpassen">
			<button
				type="button"
				class="cook-btn"
				disabled={atCookMin}
				onclick={e => adjustCook(-COOK_STEP, e)}
				aria-label="Garzeit reduzieren">−</button>
			<span class="cook-value">{formatDuration(item.cookSeconds)}</span>
			<button
				type="button"
				class="cook-btn"
				disabled={atCookMax}
				onclick={e => adjustCook(COOK_STEP, e)}
				aria-label="Garzeit erhöhen">+</button>
		</div>
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
		margin-bottom: var(--space-2);
		border-radius: var(--radius-lg);
		overflow: hidden;
		background: var(--color-error-default);
	}
	.content {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-lg);
		transition: transform var(--duration-fast) var(--ease-default);
	}
	.main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: stretch;
	}
	.title {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		background: transparent;
		border: none;
		padding: 0;
		text-align: left;
		color: inherit;
		cursor: text;
		font-family: inherit;
	}
	.title:hover {
		text-decoration: underline dashed;
		text-underline-offset: 4px;
		text-decoration-color: var(--color-fg-muted);
	}
	.rename-input {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		font-family: inherit;
		background: var(--color-bg-input);
		border: 1px solid var(--color-accent-default);
		border-radius: var(--radius-sm);
		padding: 2px 6px;
		color: var(--color-fg-base);
		width: 100%;
		min-height: 32px;
	}
	.meta {
		font-size: var(--font-size-sm);
		color: var(--color-fg-muted);
		margin-top: var(--space-1);
		background: transparent;
		border: none;
		padding: 0;
		text-align: left;
		font-family: inherit;
		cursor: pointer;
	}
	.meta:hover {
		color: var(--color-fg-base);
	}
	.cook {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		flex-shrink: 0;
	}
	.cook-btn {
		min-width: 36px;
		min-height: 36px;
		border-radius: var(--radius-full);
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-border-subtle);
		color: var(--color-fg-base);
		font-size: var(--font-size-lg);
		font-weight: 600;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
		padding: 0;
	}
	.cook-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.cook-btn:not(:disabled):active {
		background: var(--color-accent-default);
		color: var(--color-fg-on-accent);
		border-color: var(--color-accent-default);
	}
	.cook-value {
		font-family: var(--font-mono);
		font-size: var(--font-size-md);
		font-variant-numeric: tabular-nums;
		min-width: 4.5ch;
		text-align: center;
	}
	.confirm {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-2);
		padding: var(--space-3);
	}
	.del {
		background: var(--color-error-default);
		color: var(--color-fg-on-status);
		border: none;
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-4);
		min-height: 44px;
	}
	.cancel {
		background: var(--color-bg-elevated);
		color: var(--color-fg-base);
		border: 1px solid var(--color-border-default);
		border-radius: var(--radius-md);
		min-width: 44px;
		min-height: 44px;
	}
</style>
