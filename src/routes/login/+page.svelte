<script lang="ts">
	import { goto } from '$app/navigation'
	import { page } from '$app/stores'
	import { apiFetch } from '$lib/api/client'
	import { authStore } from '$lib/stores/authStore.svelte'
	import { de } from '$lib/i18n/de'
	import Button from '$lib/components/Button.svelte'

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

<svelte:head>
	<title>Grillmi · {de.auth.signIn}</title>
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
		<h1 class="auth-title">{de.auth.signIn}</h1>

		<form class="auth-form" onsubmit={submit}>
			<label class="field">
				<span class="field-label">{de.auth.email}</span>
				<input
					id="login-email"
					class="field-input"
					type="email"
					autocomplete="email"
					required
					bind:value={email} />
			</label>
			<label class="field">
				<span class="field-label">{de.auth.password}</span>
				<input
					id="login-password"
					class="field-input"
					type="password"
					autocomplete="current-password"
					required
					bind:value={password} />
			</label>
			{#if error}
				<p class="error" role="alert">{error}</p>
			{/if}
			<Button variant="primary" size="lg" fullWidth type="submit" loading={submitting} disabled={submitting}>
				{de.auth.signIn}
			</Button>
			<a href="/forgot-password" class="muted-link">{de.auth.passwordReset}</a>
		</form>
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
	.error {
		margin: 0;
		padding: 10px 12px;
		background: var(--color-error-bg);
		color: var(--color-error-default);
		border-radius: 10px;
		font-size: 14px;
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
