<script lang="ts">
	type Candidate = {
		id: string
		title: string
		source: string
		license: string
	}
	type Tone = {
		id: string
		name: string
		description: string
		candidates: Candidate[]
	}

	const tones: Tone[] = [
		{
			id: 'glut',
			name: 'Glut',
			description: 'Tiefer Bell-Ton, sanft. Wie eine Klangschale oder ein leises Gong.',
			candidates: [
				{ id: 'glut-1', title: 'Classic clock gong', source: 'Mixkit #1068', license: 'Mixkit Free' },
				{ id: 'glut-2', title: 'Whoosh resonating metallic hit', source: 'Mixkit #619', license: 'Mixkit Free' },
				{ id: 'glut-3', title: 'Bell of promise', source: 'Mixkit #626', license: 'Mixkit Free' },
				{ id: 'glut-4', title: 'Cinematic church bell hit', source: 'Mixkit #930', license: 'Mixkit Free' },
			],
		},
		{
			id: 'funke',
			name: 'Funke',
			description: 'Kurzer hoher Tropfen. Wie ein Funke, ein Wassertropfen, ein helles "Ting".',
			candidates: [
				{ id: 'funke-1', title: 'Crystal chime', source: 'Mixkit #3109', license: 'Mixkit Free' },
				{ id: 'funke-2', title: 'Relaxing bell chime', source: 'Mixkit #1108', license: 'Mixkit Free' },
				{ id: 'funke-3', title: 'Alert quick chime', source: 'Mixkit #3108', license: 'Mixkit Free' },
				{ id: 'funke-4', title: 'Page turn chime', source: 'Mixkit #2015', license: 'Mixkit Free' },
			],
		},
		{
			id: 'kohle',
			name: 'Kohle',
			description: 'Dumpfes Klopfen. Wie ein Holzschlag, eine gedämpfte Trommel, ein Thud.',
			candidates: [
				{ id: 'kohle-1', title: 'Short bass hit', source: 'Mixkit #578', license: 'Mixkit Free' },
				{ id: 'kohle-2', title: 'Drum bass hit', source: 'Mixkit #570', license: 'Mixkit Free' },
				{ id: 'kohle-3', title: 'Tribal dry drum', source: 'Mixkit #572', license: 'Mixkit Free' },
				{ id: 'kohle-4', title: 'Hand tribal drum', source: 'Mixkit #573', license: 'Mixkit Free' },
			],
		},
		{
			id: 'klassik',
			name: 'Klassik',
			description: 'iOS-Standard Glocke. Klassisches "Ding", vertraut und hell aber nicht piercend.',
			candidates: [
				{ id: 'klassik-1', title: 'Bell notification', source: 'Mixkit #2358', license: 'Mixkit Free' },
				{ id: 'klassik-2', title: 'Software interface back', source: 'Mixkit #2354', license: 'Mixkit Free' },
				{ id: 'klassik-3', title: 'Confirmation tone', source: 'Mixkit #951', license: 'Mixkit Free' },
				{ id: 'klassik-4', title: 'Attention bell ding', source: 'Mixkit #939', license: 'Mixkit Free' },
				{ id: 'klassik-5', title: 'Service bell', source: 'Mixkit #938', license: 'Mixkit Free' },
			],
		},
	]

	let nowPlaying = $state<string | null>(null)
	let audio: HTMLAudioElement | null = null
	let chosen = $state<Record<string, string | null>>({ glut: null, funke: null, kohle: null, klassik: null })

	function play(id: string) {
		if (audio) {
			audio.pause()
			audio.currentTime = 0
		}
		audio = new Audio(`/sounds/candidates/${id}.mp3`)
		audio.onended = () => {
			nowPlaying = null
		}
		audio.onerror = () => {
			nowPlaying = null
		}
		nowPlaying = id
		void audio.play()
	}

	function stop() {
		if (audio) {
			audio.pause()
			audio.currentTime = 0
		}
		nowPlaying = null
	}

	function choose(toneId: string, candidateId: string) {
		chosen[toneId] = candidateId
	}

	const summary = $derived(
		tones
			.map(t => `${t.name}: ${chosen[t.id] ?? '(nicht gewählt)'}`)
			.concat('Lautlos: stumm')
			.join('\n'),
	)
</script>

<svelte:head>
	<title>Test Chimes · Grillmi</title>
</svelte:head>

<main>
	<header>
		<h1>Tone testen</h1>
		<p class="lede">Wähle pro Kategorie den passenden Ton. Lautlos braucht kein Audio.</p>
	</header>

	<section class="final">
		<h2>Finale Töne</h2>
		<p class="tone-desc">Getrimmt auf 1.5s, normalisiert auf -14 LUFS, mono 96 kbps.</p>
		<ul class="candidates">
			{#each ['glut', 'funke', 'kohle', 'klassik'] as toneId (toneId)}
				<li>
					<button
						class="play"
						class:playing={nowPlaying === `final-${toneId}`}
						onclick={() => {
							if (nowPlaying === `final-${toneId}`) {
								stop()
							} else {
								if (audio) {
									audio.pause()
									audio.currentTime = 0
								}
								audio = new Audio(`/sounds/${toneId}.mp3`)
								audio.onended = () => {
									nowPlaying = null
								}
								audio.onerror = () => {
									nowPlaying = null
								}
								nowPlaying = `final-${toneId}`
								void audio.play()
							}
						}}
						aria-label={`${toneId} ${nowPlaying === `final-${toneId}` ? 'stoppen' : 'abspielen'}`}>
						{nowPlaying === `final-${toneId}` ? '■' : '▶'}
					</button>
					<div class="meta">
						<div class="title">{toneId}</div>
						<div class="sub">/sounds/{toneId}.mp3</div>
					</div>
				</li>
			{/each}
		</ul>
	</section>

	{#each tones as tone (tone.id)}
		<section>
			<div class="tone-head">
				<h2>{tone.name}</h2>
				<p class="tone-desc">{tone.description}</p>
				<p class="tone-chosen">
					Gewählt: <strong>{chosen[tone.id] ?? 'noch keiner'}</strong>
				</p>
			</div>
			<ul class="candidates">
				{#each tone.candidates as candidate (candidate.id)}
					<li class:chosen={chosen[tone.id] === candidate.id}>
						<button
							class="play"
							class:playing={nowPlaying === candidate.id}
							onclick={() => (nowPlaying === candidate.id ? stop() : play(candidate.id))}
							aria-label={`${candidate.title} ${nowPlaying === candidate.id ? 'stoppen' : 'abspielen'}`}>
							{nowPlaying === candidate.id ? '■' : '▶'}
						</button>
						<div class="meta">
							<div class="title">{candidate.title}</div>
							<div class="sub">{candidate.source} · {candidate.license}</div>
						</div>
						<button class="choose" onclick={() => choose(tone.id, candidate.id)}>
							{chosen[tone.id] === candidate.id ? '✓ Gewählt' : 'Wählen'}
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/each}

	<section class="summary">
		<h2>Auswahl</h2>
		<pre>{summary}</pre>
		<p class="hint">
			Sag mir die Auswahl, dann finalisiere ich Audio (trim, normalize, encode mono 96 kbps) und committe sie als <code
				>glut.mp3</code
			>, <code>funke.mp3</code>, <code>kohle.mp3</code>, <code>klassik.mp3</code>.
		</p>
	</section>
</main>

<style>
	main {
		max-width: 720px;
		margin: 0 auto;
		padding: 2rem 1.5rem 4rem;
		color: var(--color-fg-base);
	}
	header {
		margin-bottom: 2rem;
	}
	h1 {
		font-family: var(--font-display);
		font-size: 2rem;
		font-weight: 700;
		letter-spacing: -0.01em;
		margin: 0 0 0.5rem;
	}
	.lede {
		color: var(--color-fg-muted);
		font-size: 0.9375rem;
	}
	section {
		margin-bottom: 2.5rem;
	}
	.tone-head {
		margin-bottom: 0.75rem;
	}
	h2 {
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 0.25rem;
	}
	.tone-desc {
		font-size: 0.875rem;
		color: var(--color-fg-muted);
		margin: 0 0 0.25rem;
	}
	.tone-chosen {
		font-size: 0.8125rem;
		color: var(--color-fg-subtle);
		margin: 0;
	}
	.candidates {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.candidates li {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		padding: 0.875rem 1rem;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
	}
	.candidates li.chosen {
		border-color: var(--color-accent-default);
		background: var(--color-accent-muted);
	}
	.play {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		border: 1px solid var(--color-border-default);
		background: var(--color-bg-elevated);
		color: var(--color-fg-base);
		font-size: 1rem;
		cursor: pointer;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.play.playing {
		background: var(--color-accent-default);
		color: var(--color-fg-on-accent);
		border-color: var(--color-accent-default);
	}
	.meta {
		flex: 1;
		min-width: 0;
	}
	.title {
		font-weight: 600;
		font-size: 0.9375rem;
	}
	.sub {
		font-size: 0.8125rem;
		color: var(--color-fg-muted);
		margin-top: 0.125rem;
	}
	.choose {
		min-height: 44px;
		padding: 0 1rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border-default);
		background: transparent;
		color: var(--color-fg-base);
		font-size: 0.875rem;
		cursor: pointer;
		flex-shrink: 0;
	}
	.candidates li.chosen .choose {
		background: var(--color-accent-default);
		color: var(--color-fg-on-accent);
		border-color: var(--color-accent-default);
	}
	.summary pre {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.875rem;
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
		padding: 1rem;
		white-space: pre-wrap;
	}
	.hint {
		font-size: 0.8125rem;
		color: var(--color-fg-muted);
	}
	code {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.8125rem;
		background: var(--color-bg-elevated);
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
	}
</style>
