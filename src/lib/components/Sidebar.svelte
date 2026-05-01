<script lang="ts">
	export interface SidebarItem {
		id: string
		label: string
		icon: string
		badge?: string
	}

	interface Props {
		items: SidebarItem[]
		current: string
		onChange: (id: string) => void
		accent?: string
	}

	let { items, current, onChange, accent = 'var(--color-accent-default)' }: Props = $props()
</script>

<nav class="sidebar-nav" aria-label="Hauptnavigation" style={`--sidebar-accent: ${accent}`}>
	{#each items as item (item.id)}
		<button class="item" class:active={item.id === current} type="button" onclick={() => onChange(item.id)}>
			<span class="bar" aria-hidden="true"></span>
			<span class="icon" aria-hidden="true">{item.icon}</span>
			<span class="label">{item.label}</span>
			{#if item.badge}
				<span class="badge">{item.badge}</span>
			{/if}
		</button>
	{/each}
</nav>

<style>
	.sidebar-nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.item {
		position: relative;
		display: grid;
		grid-template-columns: 20px minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
		min-height: 40px;
		padding: 10px 12px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--color-fg-base);
		font-family: var(--font-body);
		font-size: 14px;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}
	.item.active {
		background: color-mix(in srgb, var(--sidebar-accent) 12%, transparent);
		color: var(--sidebar-accent);
		font-weight: 600;
	}
	.bar {
		position: absolute;
		left: -1px;
		top: 8px;
		bottom: 8px;
		width: 3px;
		border-radius: 2px;
		background: transparent;
	}
	.item.active .bar {
		background: var(--sidebar-accent);
	}
	.icon {
		width: 20px;
		text-align: center;
		font-size: 18px;
		line-height: 1;
		color: var(--color-fg-muted);
	}
	.item.active .icon {
		color: var(--sidebar-accent);
	}
	.label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.badge {
		padding: 2px 6px;
		border-radius: 6px;
		background: var(--color-ember);
		color: var(--color-ember-ink);
		font-size: 10px;
		font-weight: 700;
		line-height: 1.1;
		letter-spacing: 0.04em;
	}
</style>
