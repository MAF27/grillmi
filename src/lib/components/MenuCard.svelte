<script lang="ts">
	import { tick } from 'svelte'
	import type { SavedPlan } from '$lib/models'

	interface Props {
		menu: SavedPlan
		onload: (id: string) => void
		ondelete: (id: string) => void
		onrename: (id: string, name: string) => void
	}

	let { menu, onload, ondelete, onrename }: Props = $props()

	let touchStartX = 0
	let dragX = $state(0)
	let confirming = $state(false)
	let renaming = $state(false)
	let renameValue = $state('')
	let renameInput = $state<HTMLInputElement | null>(null)
	let pressTimer: ReturnType<typeof setTimeout> | null = null

	const itemCount = $derived(menu.items.length)
	const totalSec = $derived(menu.items.reduce((s, i) => s + i.cookSeconds + (i.restSeconds || 0), 0))
	const minutes = $derived(Math.round(totalSec / 60))
	const preview = $derived(menu.items.map(i => i.label || i.cutSlug).join(' · '))

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

	async function startRename(e: Event) {
		e.stopPropagation()
		e.preventDefault()
		renameValue = menu.name
		renaming = true
		await tick()
		renameInput?.focus()
		renameInput?.select()
	}

	function commitRename() {
		const next = renameValue.trim()
		if (next && next !== menu.name) onrename(menu.id, next)
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

	function onTitlePressDown(e: Event) {
		pressTimer = setTimeout(() => {
			pressTimer = null
			void startRename(e)
		}, 350)
	}

	function onTitlePressUp() {
		if (pressTimer !== null) {
			clearTimeout(pressTimer)
			pressTimer = null
			if (!renaming) onload(menu.id)
		}
	}

	function onTitlePressCancel() {
		if (pressTimer !== null) {
			clearTimeout(pressTimer)
			pressTimer = null
		}
	}

	function confirmDelete() {
		ondelete(menu.id)
	}

	function cancelDelete() {
		confirming = false
		dragX = 0
	}
</script>

<div class="row" role="listitem">
	<div class="card" role="group" style="transform: translateX({dragX}px)" {ontouchstart} {ontouchmove} {ontouchend}>
		<div class="body">
			{#if renaming}
				<input
					bind:this={renameInput}
					bind:value={renameValue}
					class="rename-input"
					maxlength="40"
					onkeydown={onRenameKey}
					onblur={commitRename}
					aria-label="Menü umbenennen" />
			{:else}
				<button
					class="title"
					type="button"
					onmousedown={onTitlePressDown}
					ontouchstart={onTitlePressDown}
					onmouseup={onTitlePressUp}
					ontouchend={onTitlePressUp}
					onmouseleave={onTitlePressCancel}
					ontouchcancel={onTitlePressCancel}>
					{menu.name}
				</button>
			{/if}
			{#if preview}
				<div class="preview">{preview}</div>
			{/if}
			<div class="meta">{itemCount} STÜCK · {minutes} MIN</div>
		</div>
		<div class="chevron" aria-hidden="true">›</div>
	</div>
	{#if confirming}
		<div class="confirm">
			<button type="button" class="del" onclick={confirmDelete} aria-label="Löschen bestätigen">Löschen</button>
			<button type="button" class="cancel" onclick={cancelDelete} aria-label="Abbrechen">×</button>
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
	.card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 16px 18px;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: 14px;
		cursor: pointer;
		transition: transform var(--duration-fast) var(--ease-default);
	}
	.body {
		min-width: 0;
		flex: 1;
	}
	.title {
		display: block;
		width: 100%;
		text-align: left;
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 16px;
		color: var(--color-fg-base);
		background: transparent;
		border: none;
		padding: 0;
		cursor: pointer;
	}
	.rename-input {
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 16px;
		background: transparent;
		border: none;
		border-bottom: 1px solid var(--color-ember);
		color: var(--color-fg-base);
		padding: 2px 0;
		outline: none;
		width: 100%;
	}
	.preview {
		font-family: var(--font-body);
		font-size: 13px;
		color: var(--color-fg-muted);
		margin-top: 4px;
		line-height: 1.35;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta {
		font-family: var(--font-display);
		font-size: 12px;
		color: var(--color-fg-subtle);
		margin-top: 4px;
		letter-spacing: 0.04em;
		font-variant-numeric: tabular-nums;
	}
	.chevron {
		color: var(--color-ember);
		font-size: 18px;
		flex-shrink: 0;
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
