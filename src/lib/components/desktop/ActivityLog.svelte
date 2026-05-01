<script lang="ts">
	export interface ActivityEvent {
		kind: 'on' | 'flip' | 'resting' | 'ready' | 'plated'
		itemName: string
		at: number
	}

	interface Props {
		events: ActivityEvent[]
	}

	let { events }: Props = $props()

	const kindLabel: Record<ActivityEvent['kind'], string> = {
		on: 'Auflegen',
		flip: 'Wenden',
		resting: 'Ruht',
		ready: 'Fertig',
		plated: 'Angerichtet',
	}

	function relative(epoch: number) {
		const seconds = Math.max(0, Math.round((Date.now() - epoch) / 1000))
		if (seconds < 60) return 'gerade eben'
		return `vor ${Math.round(seconds / 60)} min`
	}
</script>

<section class="activity" data-testid="activity-log">
	<h2>Aktivität</h2>
	{#if events.length === 0}
		<p>Noch keine Ereignisse.</p>
	{:else}
		<ul>
			{#each events as event, index (`${event.at}-${index}`)}
				<li>
					<span class="dot" data-kind={event.kind} aria-hidden="true"></span>
					<span>
						<strong>{event.itemName}</strong>
						<small>{kindLabel[event.kind]} · {relative(event.at)}</small>
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.activity {
		margin-top: 18px;
	}
	h2 {
		margin: 0 0 12px;
		font-family: var(--font-display);
		font-size: 20px;
		font-weight: 600;
		text-transform: uppercase;
	}
	p {
		margin: 0;
		color: var(--color-fg-muted);
		font-size: 13px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 10px;
		align-items: start;
	}
	.dot {
		width: 8px;
		height: 8px;
		margin-top: 5px;
		border-radius: 50%;
		background: var(--color-ember);
	}
	.dot[data-kind='ready'],
	.dot[data-kind='plated'] {
		background: var(--color-state-ready);
	}
	.dot[data-kind='resting'] {
		background: var(--color-state-resting);
	}
	strong,
	small {
		display: block;
	}
	strong {
		font-size: 13px;
	}
	small {
		margin-top: 2px;
		color: var(--color-fg-muted);
		font-size: 11px;
	}
</style>
