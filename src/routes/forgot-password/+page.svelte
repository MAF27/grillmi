<script lang="ts">
	import { apiFetch } from '$lib/api/client'
	import { de } from '$lib/i18n/de'

	let email = $state('')
	let submitting = $state(false)
	let sent = $state(false)

	async function submit(e: Event) {
		e.preventDefault()
		submitting = true
		try {
			await apiFetch('/api/auth/forgot-password', {
				method: 'POST',
				body: JSON.stringify({ email }),
				skipAuthRedirect: true,
			})
		} catch {
			// Same generic outcome regardless.
		}
		sent = true
		submitting = false
	}
</script>

<main class="auth-screen">
	<h1>{de.auth.passwordReset}</h1>
	{#if sent}
		<p role="status">{de.auth.resetEmailSent}</p>
		<a href="/login" class="muted">{de.auth.signIn}</a>
	{:else}
		<form onsubmit={submit}>
			<label>
				{de.auth.email}
				<input id="forgot-email" type="email" autocomplete="email" required bind:value={email} />
			</label>
			<button id="forgot-submit" type="submit" disabled={submitting}>{de.auth.passwordReset}</button>
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
	.muted {
		text-align: center;
		opacity: 0.7;
	}
</style>
