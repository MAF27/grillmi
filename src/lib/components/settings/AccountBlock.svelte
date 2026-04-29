<script lang="ts">
	import Button from '../Button.svelte'
	import { authStore } from '$lib/stores/authStore.svelte'

	interface Props {
		holding: boolean
		onPasswordChange: () => void
		onSignOut: () => void
		onHoldStart: () => void
		onHoldEnd: () => void
	}

	let { holding, onPasswordChange, onSignOut, onHoldStart, onHoldEnd }: Props = $props()

	const initials = $derived(
		authStore.user?.email
			? authStore.user.email
					.split('@')[0]
					.split(/[._-]/)
					.filter(Boolean)
					.map(part => part[0])
					.slice(0, 2)
					.join('')
					.toUpperCase()
			: 'GM',
	)
</script>

<div class="card">
	<div class="avatar">{initials}</div>
	<div class="who">
		<div class="name">{authStore.user?.email.split('@')[0] ?? 'Grillmi'}</div>
		<div class="email">{authStore.user?.email ?? ''}</div>
	</div>
</div>
<div class="actions">
	<Button variant="secondary" fullWidth onclick={onPasswordChange}>Passwort ändern</Button>
	<Button variant="secondary" fullWidth onclick={onSignOut}>Abmelden</Button>
	<button
		type="button"
		id="delete-account-hold"
		class="danger"
		class:holding
		onpointerdown={onHoldStart}
		onpointerup={onHoldEnd}
		onpointerleave={onHoldEnd}
		onpointercancel={onHoldEnd}>
		Konto löschen
	</button>
	{#if holding}
		<p class="hint">Halten zum Bestätigen. Loslassen zum Abbrechen.</p>
	{/if}
</div>

<style>
	.card {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 16px;
		border-radius: 16px;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
	}
	.avatar {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--color-ember), var(--color-ember-dim));
		color: var(--color-ember-ink);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 800;
		font-size: 16px;
		text-transform: uppercase;
		flex-shrink: 0;
	}
	.who {
		min-width: 0;
		flex: 1;
	}
	.name {
		font-family: var(--font-body);
		font-size: 15px;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.email {
		margin-top: 2px;
		font-size: 12px;
		color: var(--color-fg-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 10px;
	}
	.danger {
		min-height: 48px;
		padding: 0 18px;
		border-radius: 12px;
		border: 1px solid color-mix(in srgb, var(--color-error-default) 60%, transparent);
		background: transparent;
		color: var(--color-error-default);
		font: inherit;
		font-weight: 600;
		font-size: 15px;
		cursor: pointer;
		transition: background 0.15s ease;
	}
	.danger.holding {
		background: var(--color-error-default);
		color: var(--color-fg-on-status);
	}
	.hint {
		margin: 6px 0 0;
		color: var(--color-fg-muted);
		font-size: 12px;
		text-align: center;
	}
</style>
