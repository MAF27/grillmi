<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import { page } from '$app/stores'
	import { apiFetch } from '$lib/api/client'
	import { authStore } from '$lib/stores/authStore.svelte'
	import { de } from '$lib/i18n/de'
	import { runFirstLoginImport } from '$lib/sync/firstLogin'
	import Button from '$lib/components/Button.svelte'

	let password = $state('')
	let confirm = $state('')
	let error = $state<string | null>(null)
	let submitting = $state(false)
	let initialError = $state<'token_expired' | 'token_used' | null>(null)

	const token = $derived($page.url.searchParams.get('token') ?? '')

	onMount(async () => {
		try {
			await apiFetch('/api/auth/logout', { method: 'POST', skipAuthRedirect: true, enqueueOn5xx: false })
		} catch {
			// Logout best-effort.
		}
		authStore.clear()
	})

	function safeNext(): string {
		const next = $page.url.searchParams.get('next') ?? ''
		if (next.startsWith('/') && !next.startsWith('//')) return next
		return '/'
	}

	async function submit(e: Event) {
		e.preventDefault()
		error = null
		if (password.length < 12) {
			error = de.auth.minPasswordHint
			return
		}
		if (password !== confirm) {
			error = 'Passwoerter stimmen nicht ueberein.'
			return
		}
		submitting = true
		try {
			const result = await apiFetch<{ kind: 'invitation' | 'reset'; user?: { id: string; email: string }; csrfToken?: string }>(
				'/api/auth/set-password',
				{
					method: 'POST',
					body: JSON.stringify({ token, password }),
					skipAuthRedirect: true,
				}
			)
			if (result.kind === 'invitation' && result.user && result.csrfToken) {
				authStore.setSession({ user: result.user, csrfToken: result.csrfToken })
				await runFirstLoginImport()
				await goto(safeNext())
			} else {
				await goto('/login')
			}
		} catch (err) {
			const status = (err as { status?: number }).status
			const body = (err as { body?: { detail?: { error_code?: string } } }).body
			if (status === 410) {
				initialError = body?.detail?.error_code === 'token_used' ? 'token_used' : 'token_expired'
			} else if (status === 422) {
				error = de.auth.breachedPasswordHint
			} else {
				error = de.auth.genericError
			}
		} finally {
			submitting = false
		}
	}
</script>

<svelte:head>
	<title>Grillmi · {de.auth.passwordSet}</title>
</svelte:head>

<main class="auth-screen">
	<div class="auth-card">
		<div class="brand">
			<svg class="flame" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<path
					d="M12 2c1 3-1 4-1 7 0 1.5 1 3 2.5 3S16 10.5 16 9c0-2-1-3-1-4 2 1 5 4 5 8 0 4-3.5 7-8 7s-8-3-8-7c0-3 2-5 4-6.5C7.2 5.7 9 4 12 2z" />
			</svg>
			<span class="wordmark">Grillmi</span>
		</div>

		{#if initialError === 'token_expired'}
			<h1 class="auth-title">{de.auth.linkExpired}</h1>
			<p class="status status-warning">Bitte fordere einen neuen Link an.</p>
			<a id="forgot-password-link" href="/forgot-password" class="muted-link">{de.auth.passwordReset}</a>
		{:else if initialError === 'token_used'}
			<h1 class="auth-title">{de.auth.linkUsed}</h1>
			<p class="status status-warning">Dieser Link wurde bereits verwendet.</p>
			<a id="forgot-password-link" href="/forgot-password" class="muted-link">{de.auth.passwordReset}</a>
		{:else}
			<h1 class="auth-title">{de.auth.passwordSet}</h1>
			<form class="auth-form" onsubmit={submit}>
				<label class="field">
					<span class="field-label">{de.auth.newPassword}</span>
					<input
						id="set-password-pw"
						class="field-input"
						type="password"
						autocomplete="new-password"
						required
						bind:value={password} />
				</label>
				<label class="field">
					<span class="field-label">{de.auth.password} (Wiederholung)</span>
					<input
						id="set-password-confirm"
						class="field-input"
						type="password"
						autocomplete="new-password"
						required
						bind:value={confirm} />
				</label>
				<small class="hint">{de.auth.minPasswordHint}</small>
				{#if error}
					<p class="error" role="alert">{error}</p>
				{/if}
				<Button variant="primary" size="lg" fullWidth type="submit" loading={submitting} disabled={submitting}>
					{de.auth.passwordSet}
				</Button>
			</form>
		{/if}
	</div>
</main>

<style>
	.auth-screen {
		min-height: 100dvh;
		background: var(--color-bg-base);
		color: var(--color-fg-base);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		padding-top: calc(24px + env(safe-area-inset-top));
		padding-bottom: calc(24px + env(safe-area-inset-bottom));
	}
	.auth-card {
		width: 100%;
		max-width: 28rem;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-xl);
		padding: 32px 24px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		box-shadow: var(--shadow-md);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.flame {
		color: var(--color-ember);
	}
	.wordmark {
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
	}
	.auth-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: 40px;
		line-height: 1;
		font-weight: 600;
		letter-spacing: -0.01em;
		text-transform: uppercase;
	}
	.auth-form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.field-label {
		font-family: var(--font-body);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-fg-muted);
	}
	.field-input {
		min-height: 48px;
		padding: 12px 14px;
		background: var(--color-bg-surface-2);
		border: 1px solid var(--color-border-strong);
		border-radius: 12px;
		color: var(--color-fg-base);
		font-family: var(--font-body);
		font-size: 16px;
	}
	.field-input:focus {
		outline: none;
		border-color: var(--color-ember);
		box-shadow: 0 0 0 3px var(--color-accent-muted);
	}
	.hint {
		color: var(--color-fg-muted);
		font-size: 13px;
	}
	.error {
		margin: 0;
		padding: 10px 12px;
		background: var(--color-error-bg);
		color: var(--color-error-default);
		border-radius: 10px;
		font-size: 14px;
	}
	.status {
		margin: 0;
		padding: 12px 14px;
		border-radius: 10px;
		font-size: 14px;
	}
	.status-warning {
		background: var(--color-state-resting-bg);
		color: var(--color-state-resting);
	}
	.muted-link {
		text-align: center;
		color: var(--color-fg-muted);
		font-size: 14px;
		text-decoration: none;
		padding: 8px;
	}
	.muted-link:hover {
		color: var(--color-ember);
	}
</style>
