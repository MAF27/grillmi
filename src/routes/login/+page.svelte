<script lang="ts">
	import { goto } from '$app/navigation'
	import { page } from '$app/stores'
	import { apiFetch } from '$lib/api/client'
	import { authStore } from '$lib/stores/authStore.svelte'
	import { de } from '$lib/i18n/de'

	let email = $state('')
	let password = $state('')
	let error = $state<string | null>(null)
	let submitting = $state(false)

	function safeNext(): string {
		const next = $page.url.searchParams.get('next') ?? ''
		if (next.startsWith('/') && !next.startsWith('//')) return next
		return '/'
	}

	async function submit(e: Event) {
		e.preventDefault()
		error = null
		submitting = true
		try {
			const data = await apiFetch<{ user: { id: string; email: string }; csrfToken: string }>('/api/auth/login', {
				method: 'POST',
				body: JSON.stringify({ email, password }),
				skipAuthRedirect: true,
			})
			authStore.setSession({ user: data.user, csrfToken: data.csrfToken })
			await goto(safeNext())
		} catch (err) {
			const status = (err as { status?: number }).status
			error = status === 429 ? de.auth.genericError : de.auth.invalidCredentials
		} finally {
			submitting = false
		}
	}
</script>

<main class="auth-screen">
	<h1>Grillmi</h1>
	<form onsubmit={submit}>
		<label>
			{de.auth.email}
			<input id="login-email" type="email" autocomplete="email" required bind:value={email} />
		</label>
		<label>
			{de.auth.password}
			<input id="login-password" type="password" autocomplete="current-password" required bind:value={password} />
		</label>
		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}
		<button id="login-submit" type="submit" disabled={submitting}>{de.auth.signIn}</button>
		<a href="/forgot-password" class="muted">{de.auth.passwordReset}</a>
	</form>
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
	.muted {
		text-align: center;
		opacity: 0.7;
	}
</style>
