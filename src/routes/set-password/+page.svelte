<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import { page } from '$app/stores'
	import { apiFetch } from '$lib/api/client'
	import { authStore } from '$lib/stores/authStore.svelte'
	import { de } from '$lib/i18n/de'
	import { runFirstLoginImport } from '$lib/sync/firstLogin'

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

<main class="auth-screen">
	{#if initialError === 'token_expired'}
		<h1>{de.auth.linkExpired}</h1>
		<p>Bitte fordere einen neuen Link an.</p>
		<a id="forgot-password-link" href="/forgot-password">{de.auth.passwordReset}</a>
	{:else if initialError === 'token_used'}
		<h1>{de.auth.linkUsed}</h1>
		<p>Dieser Link wurde bereits verwendet.</p>
		<a id="forgot-password-link" href="/forgot-password">{de.auth.passwordReset}</a>
	{:else}
		<h1>{de.auth.passwordSet}</h1>
		<form onsubmit={submit}>
			<label>
				{de.auth.newPassword}
				<input id="set-password-pw" type="password" autocomplete="new-password" required bind:value={password} />
			</label>
			<label>
				{de.auth.password} (Wiederholung)
				<input id="set-password-confirm" type="password" autocomplete="new-password" required bind:value={confirm} />
			</label>
			<small class="hint">{de.auth.minPasswordHint}</small>
			{#if error}
				<p class="error" role="alert">{error}</p>
			{/if}
			<button id="set-password-submit" type="submit" disabled={submitting}>{de.auth.passwordSet}</button>
		</form>
	{/if}
</main>

<style>
	.auth-screen {
		max-width: 24rem;
		margin: 4rem auto;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.error {
		color: var(--color-danger, #b00020);
	}
	.hint {
		opacity: 0.7;
	}
</style>
