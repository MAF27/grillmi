<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import { apiFetch } from '$lib/api/client'
	import { authStore } from '$lib/stores/authStore.svelte'
	import { resetAll } from '$lib/stores/db'
	import { de } from '$lib/i18n/de'

	interface SessionRow {
		id: string
		device_label: string
		ip_address: string | null
		last_active_at: string
		is_current: boolean
	}

	let sessions = $state<SessionRow[]>([])
	let toast = $state<string | null>(null)
	let holding = $state(false)
	let holdTimer: ReturnType<typeof setTimeout> | null = null

	onMount(async () => {
		await refreshSessions()
	})

	async function refreshSessions() {
		try {
			sessions = await apiFetch<SessionRow[]>('/api/auth/sessions')
		} catch {
			sessions = []
		}
	}

	async function revoke(id: string) {
		await apiFetch(`/api/auth/sessions/${id}/revoke`, { method: 'POST' })
		const wasCurrent = sessions.find(s => s.id === id)?.is_current
		if (wasCurrent) {
			authStore.clear()
			await resetAll()
			await goto('/login')
			return
		}
		await refreshSessions()
	}

	async function changePassword() {
		if (!authStore.user) return
		try {
			await apiFetch('/api/auth/forgot-password', {
				method: 'POST',
				body: JSON.stringify({ email: authStore.user.email }),
			})
			toast = de.auth.resetEmailSent
		} catch {
			toast = de.auth.genericError
		}
	}

	async function signOut() {
		try {
			await apiFetch('/api/auth/logout', { method: 'POST' })
		} catch {
			/* best effort */
		}
		authStore.clear()
		await resetAll()
		await goto('/login')
	}

	function startHold() {
		if (holding) return
		holding = true
		holdTimer = setTimeout(async () => {
			holding = false
			try {
				await apiFetch('/api/auth/account', { method: 'DELETE' })
				await resetAll()
				authStore.clear()
				toast = de.auth.accountDeleted
				await goto('/login')
			} catch {
				toast = de.auth.genericError
			}
		}, 500)
	}

	function endHold() {
		if (holdTimer) {
			clearTimeout(holdTimer)
			holdTimer = null
		}
		holding = false
	}
</script>

<main class="account">
	<h1>{de.auth.account}</h1>

	<section>
		<h2>{de.auth.email}</h2>
		<p>{authStore.user?.email ?? ''}</p>
	</section>

	<section>
		<h2>{de.auth.password}</h2>
		<button id="change-password-btn" type="button" onclick={changePassword}>{de.auth.passwordChange}</button>
	</section>

	<section>
		<h2>{de.auth.activeDevices}</h2>
		<ul class="sessions">
			{#each sessions as s (s.id)}
				<li>
					<div>
						<strong>{s.device_label}</strong>
						{#if s.is_current}<span class="badge">{de.auth.currentSession}</span>{/if}
					</div>
					<div class="meta">{s.ip_address ?? ''} · {s.last_active_at}</div>
					<button data-session-id={s.id} type="button" onclick={() => revoke(s.id)}>{de.auth.signOut}</button>
				</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2>{de.auth.account}</h2>
		<button id="sign-out-btn" type="button" onclick={signOut}>{de.auth.signOut}</button>
		<button
			id="delete-account-hold"
			type="button"
			class="danger"
			onpointerdown={startHold}
			onpointerup={endHold}
			onpointerleave={endHold}
			onpointercancel={endHold}>{de.auth.accountDelete}</button>
		{#if holding}
			<small class="hint">{de.auth.accountDeleteHoldHint}</small>
		{/if}
	</section>

	{#if toast}
		<div role="status" class="toast">{toast}</div>
	{/if}
</main>

<style>
	.account {
		max-width: 32rem;
		margin: 2rem auto;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.sessions {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.sessions li {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.75rem;
		border: 1px solid currentColor;
		border-radius: 0.5rem;
	}
	.badge {
		margin-left: 0.5rem;
		font-size: 0.75rem;
		opacity: 0.7;
	}
	.meta {
		opacity: 0.7;
		font-size: 0.875rem;
	}
	.danger {
		color: var(--color-danger, #b00020);
	}
	.toast {
		position: fixed;
		bottom: 1rem;
		left: 50%;
		transform: translateX(-50%);
		padding: 0.75rem 1rem;
		background: rgba(0, 0, 0, 0.85);
		color: white;
		border-radius: 0.5rem;
	}
</style>
