<script lang="ts">
	import { onMount } from 'svelte'
	import { TIMINGS } from '$lib/data/timings'
	import { authStore } from '$lib/stores/authStore.svelte'
	import { getActiveGrillade, getSyncMeta, listGrilladen, listSyncQueue, type GrilladeRow, type SyncQueueRow } from '$lib/stores/db'
	import { syncNow } from '$lib/sync'
	import { clearSyncDebugEvents, debugSync, getSyncDebugEvents, type SyncDebugEvent } from '$lib/sync/debug'
	import { getAudioDebugState, play, unlockAudio } from '$lib/sounds/player'

	type ServerResult = { ok: boolean; status?: number; body?: unknown; error?: string }

	let info = $state({
		ua: '',
		categoryCount: 0,
		slugs: [] as string[],
		firstCutsBeef: [] as string[],
		parseError: '',
	})
	let local = $state<{
		authenticated: boolean
		userEmail: string | null
		csrf: boolean
		active: GrilladeRow | null
		grilladen: GrilladeRow[]
		queue: SyncQueueRow[]
		lastPull: unknown
		audio: ReturnType<typeof getAudioDebugState>
	}>({
		authenticated: false,
		userEmail: null,
		csrf: false,
		active: null,
		grilladen: [],
		queue: [],
		lastPull: null,
		audio: { hasContext: false, state: null, cachedSounds: [] },
	})
	let server = $state<{ me: ServerResult | null; grilladen: ServerResult | null; activeItems: ServerResult | null }>({
		me: null,
		grilladen: null,
		activeItems: null,
	})
	let events = $state<SyncDebugEvent[]>([])
	let busy = $state(false)

	onMount(() => {
		try {
			info.ua = navigator.userAgent
			info.categoryCount = TIMINGS.categories.length
			info.slugs = TIMINGS.categories.map(c => c.slug)
			const beef = TIMINGS.categories.find(c => c.slug === 'beef')
			info.firstCutsBeef = beef ? beef.cuts.map(c => c.name).slice(0, 5) : []
		} catch (e) {
			info.parseError = String(e)
		}
		void refresh()
	})

	async function refresh() {
		local.authenticated = authStore.isAuthenticated
		local.userEmail = authStore.user?.email ?? null
		local.csrf = Boolean(authStore.csrfToken)
		local.active = (await getActiveGrillade()) ?? null
		local.grilladen = await listGrilladen()
		local.queue = await listSyncQueue()
		local.lastPull = await getSyncMeta('lastPullEpoch')
		local.audio = getAudioDebugState()
		events = getSyncDebugEvents()
		server.me = await fetchJson('/api/auth/me')
		server.grilladen = await fetchJson('/api/grilladen?since=1970-01-01T00%3A00%3A00Z')
		server.activeItems = local.active
			? await fetchJson(`/api/grilladen/${local.active.id}/items?since=1970-01-01T00%3A00%3A00Z`)
			: null
	}

	async function runStartupSync() {
		busy = true
		debugSync('diag', 'manual sync start')
		try {
			await syncNow('diag')
			debugSync('diag', 'manual sync done')
		} catch (error) {
			debugSync('diag', 'manual sync error', { error: String(error) })
		} finally {
			busy = false
			await refresh()
		}
	}

	async function testSound() {
		debugSync('diag', 'test sound start')
		await unlockAudio()
		await play('klassik').catch(error => debugSync('diag', 'test sound error', { error: String(error) }))
		await refresh()
	}

	function clearEvents() {
		clearSyncDebugEvents()
		events = []
	}

	async function fetchJson(path: string): Promise<ServerResult> {
		try {
			const response = await fetch(path, { credentials: 'include', headers: { Accept: 'application/json' } })
			const text = await response.text()
			let body: unknown = text
			try {
				body = text ? JSON.parse(text) : null
			} catch {
				// keep raw text
			}
			return { ok: response.ok, status: response.status, body }
		} catch (error) {
			return { ok: false, error: String(error) }
		}
	}

	function json(value: unknown): string {
		return JSON.stringify(value, null, 2)
	}
</script>

<main class="diag">
	<header>
		<div>
			<h1>Grillmi Diagnose</h1>
			<p>Öffne diese Seite auf Desktop und Telefon, dann vergleiche Local, Server und Log.</p>
		</div>
		<div class="actions">
			<button type="button" onclick={refresh} disabled={busy}>Aktualisieren</button>
			<button type="button" onclick={runStartupSync} disabled={busy}>Flush + Pull</button>
			<button type="button" onclick={testSound} disabled={busy}>Testton</button>
			<button type="button" onclick={clearEvents}>Log löschen</button>
		</div>
	</header>

	<section>
		<h2>Basics</h2>
		<dl>
			<dt>User-Agent</dt>
			<dd>{info.ua}</dd>
			<dt>Kategorien geladen</dt>
			<dd class="num" data-testid="cat-count">{info.categoryCount}</dd>
			<dt>Slugs</dt>
			<dd>{info.slugs.join(', ') || '-'}</dd>
			<dt>Rind: erste 5 Cuts</dt>
			<dd>{info.firstCutsBeef.join(' / ') || '-'}</dd>
			<dt>Parse-Fehler</dt>
			<dd class="err">{info.parseError || '-'}</dd>
		</dl>
	</section>

	<section class="grid">
		<div>
			<h2>Local</h2>
			<pre>{json(local)}</pre>
		</div>
		<div>
			<h2>Server</h2>
			<pre>{json(server)}</pre>
		</div>
	</section>

	<section>
		<h2>Sync / Alarm Log</h2>
		{#if events.length === 0}
			<p>Keine Einträge.</p>
		{:else}
			<div class="events">
				{#each events as e}
					<article>
						<div class="event-head">
							<span>{e.at}</span>
							<strong>{e.source}</strong>
							<span>{e.event}</span>
						</div>
						{#if e.data !== undefined}
							<pre>{json(e.data)}</pre>
						{/if}
					</article>
				{/each}
			</div>
		{/if}
	</section>
</main>

<style>
	.diag {
		max-width: 72rem;
		margin: 0 auto;
		padding: 1.5rem;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		color: #fff;
		background: #0d0d0d;
		min-height: 100vh;
	}
	header {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: flex-start;
		margin-bottom: 1rem;
	}
	h1,
	h2,
	p {
		margin-top: 0;
	}
	h1 {
		font-size: 1.5rem;
		margin-bottom: 0.25rem;
	}
	h2 {
		font-size: 1rem;
		color: #f19a5b;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: flex-end;
	}
	button {
		border: 1px solid #555;
		border-radius: 6px;
		background: #222;
		color: #fff;
		padding: 0.55rem 0.75rem;
		font: inherit;
	}
	button:disabled {
		opacity: 0.5;
	}
	section {
		border-top: 1px solid #333;
		padding-top: 1rem;
		margin-top: 1rem;
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.5rem 1rem;
	}
	dt {
		font-weight: 600;
		color: #aaa;
	}
	dd {
		margin: 0;
		word-break: break-word;
	}
	.num {
		font-family: ui-monospace, monospace;
		font-size: 1.5rem;
		color: #d35a1d;
	}
	.err {
		color: #ff6b6b;
		font-family: ui-monospace, monospace;
		white-space: pre-wrap;
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 1rem;
	}
	pre {
		margin: 0;
		padding: 0.75rem;
		border-radius: 6px;
		background: #171717;
		color: #ddd;
		overflow: auto;
		font-size: 0.78rem;
		line-height: 1.35;
	}
	.events {
		display: grid;
		gap: 0.75rem;
	}
	article {
		border: 1px solid #333;
		border-radius: 6px;
		padding: 0.75rem;
		background: #121212;
	}
	.event-head {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
		color: #ccc;
	}
	@media (max-width: 800px) {
		header,
		.grid {
			display: block;
		}
		.actions {
			justify-content: flex-start;
			margin-top: 1rem;
		}
		dl {
			grid-template-columns: 1fr;
		}
	}
</style>
