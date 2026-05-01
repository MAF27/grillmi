<script lang="ts">
	import { formatHHMM } from '$lib/util/format'

	interface Props {
		targetEpoch: number
		size?: 'mobile' | 'desktop'
	}

	let { targetEpoch, size = 'mobile' }: Props = $props()
</script>

<div class="clock" class:desktop={size === 'desktop'} aria-live="off">
	<div class="eyebrow">Fertig um</div>
	<div class="time" data-testid="master-clock-time" data-mask-time>{formatHHMM(targetEpoch)}</div>
</div>

<style>
	.clock {
		padding: 12px 20px 24px;
		text-align: center;
	}
	.eyebrow {
		font-family: var(--font-body);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-fg-muted);
		margin-bottom: 4px;
	}
	.time {
		font-family: var(--font-display);
		font-size: 56px;
		font-weight: 700;
		line-height: 1;
		color: var(--color-fg-base);
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
	}
	.clock.desktop {
		padding: 4px 0 28px;
		text-align: left;
	}
	.clock.desktop .eyebrow {
		font-size: 12px;
	}
	.clock.desktop .time {
		font-size: 88px;
	}
</style>
