<script lang="ts">
	interface UserChip {
		name: string
		email: string
		initials: string
	}

	interface Props {
		user: UserChip | null
		onSignedInClick: () => void
		onSignedOutClick: () => void
		compact?: boolean
	}

	let { user, onSignedInClick, onSignedOutClick, compact = false }: Props = $props()
</script>

{#if user}
	<button class="chip signed-in" class:compact type="button" onclick={onSignedInClick} data-testid="account-chip">
		<span class="avatar">{user.initials}</span>
		{#if !compact}
			<span class="text">
				<span class="name">{user.name}</span>
				<span class="email">{user.email}</span>
			</span>
		{/if}
	</button>
{:else}
	<button class="chip signed-out" class:compact type="button" onclick={onSignedOutClick} data-testid="account-chip">
		<span class="placeholder" aria-hidden="true"></span>
		{#if !compact}
			<span>Anmelden</span>
		{/if}
	</button>
{/if}

<style>
	.chip {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		border-radius: 12px;
		font-family: var(--font-body);
		cursor: pointer;
		text-align: left;
	}
	.signed-in {
		padding: 8px 10px;
		border: 1px solid var(--color-border-subtle);
		background: var(--color-bg-surface);
		color: var(--color-fg-base);
	}
	.signed-out {
		min-height: 48px;
		padding: 10px 12px;
		border: 1px solid var(--color-border-strong);
		background: transparent;
		color: var(--color-fg-base);
		font-size: 13px;
		font-weight: 600;
	}
	.avatar,
	.placeholder {
		flex: 0 0 auto;
		border-radius: 50%;
	}
	.avatar {
		width: 32px;
		height: 32px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, var(--color-ember) 0%, var(--color-ember-dim) 100%);
		color: var(--color-ember-ink);
		font-size: 12px;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.placeholder {
		width: 28px;
		height: 28px;
		border: 1px solid var(--color-border-strong);
		background: var(--color-bg-surface);
	}
	.text {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.name,
	.email {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.name {
		font-size: 13px;
		font-weight: 600;
	}
	.email {
		font-size: 11px;
		color: var(--color-fg-muted);
	}
	.compact {
		width: auto;
		padding: 6px;
	}
</style>
