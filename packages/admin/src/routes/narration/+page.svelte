<script lang="ts">
	import classNames from 'classnames';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import {
		NARRATION_LINES_PER_EVENT,
		NARRATION_LINE_MAX_LENGTH,
		fillNarration,
		unknownNarrationTokens,
		type CombatNarrationCollection,
		type CombatNarrationEvent,
		type NarrationEventSpec,
		type NarrationPlaceholder
	} from '$types/combat-narration.type';

	// What the fight says over each encounter it plays out — one row of the board, one
	// sentence. A section per way an encounter can go, and the section is the definition:
	// the lines are typed in it, previewed in it against a made-up lane, and saved from it.
	//
	// The catalogue is the server's, not this screen's (`GET /api/combat-narration/events`):
	// it is the same list the fight announces from and the same list the API validates
	// against, so a section can never offer an event — or a `{placeholder}` — that a save
	// would then be refused for. A new thing for the fight to say appears here by being
	// added to `@3xl/shared`'s `combat-narration.type`, and nothing on this screen changes.
	//
	// The read/write API is served by @3xl/backend (default :2002), which writes
	// public/combat-narration.json straight into the git tree.
	const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:2002';

	let events: NarrationEventSpec[] = [];
	let collection: CombatNarrationCollection = { lines: {} };

	let loading = false;
	let loadError = '';

	// One draft per event: the lines as they currently read on screen, which is not yet
	// what the file says. Held apart from `collection` so saving one section cannot throw
	// away what is half-typed in another — only the section that was saved is re-seeded.
	let drafts = new Map<CombatNarrationEvent, string[]>();

	// Which section is in flight, so only that one's button spins.
	let savingEvent: CombatNarrationEvent | null = null;
	// The last refusal per section, in the server's own words.
	let errorByEvent = new Map<CombatNarrationEvent, string>();

	/**
	 * The lane a preview is drawn against. Made-up names rather than a real character's:
	 * what is being read is the shape of the sentence, and two names of very different
	 * lengths are what shows whether a line still reads when the fighters are not the ones
	 * in the author's head.
	 */
	const SAMPLE: Record<NarrationPlaceholder, string> = {
		attacker: 'Son Goku',
		target: 'Bulma',
		loader: 'Son Goku',
		guard: 'Bulma',
		one: 'Son Goku',
		other: 'Bulma'
	};

	onMount(load);

	async function load(): Promise<void> {
		if (!browser) return;
		loading = true;
		loadError = '';
		try {
			const [eventsRes, collectionRes] = await Promise.all([
				fetch(`${API_BASE}/api/combat-narration/events`),
				fetch(`${API_BASE}/api/combat-narration`)
			]);
			if (!eventsRes.ok) throw new Error(`Failed to load the catalogue (${eventsRes.status})`);
			if (!collectionRes.ok) {
				throw new Error(`Failed to load the narration (${collectionRes.status})`);
			}
			events = ((await eventsRes.json()) as { events: NarrationEventSpec[] }).events;
			collection = (await collectionRes.json()) as CombatNarrationCollection;
			reseed();
		} catch (error) {
			loadError = error instanceof Error ? error.message : String(error);
		} finally {
			loading = false;
		}
	}

	/** Every section back onto what the file says, with one empty row to write into. */
	function reseed(): void {
		drafts = new Map(events.map((event) => [event.id, linesOf(event.id)]));
	}

	/**
	 * One event's authored lines plus a blank row at the foot of them — a section always
	 * offers somewhere to write, so nothing has to be pressed before a line can be typed.
	 * The blank is dropped on save rather than stored (see the API's validate).
	 */
	function linesOf(event: CombatNarrationEvent): string[] {
		return [...(collection.lines[event] ?? []), ''];
	}

	/**
	 * Rewrite one line of one section. A new Map and a new array rather than a mutation:
	 * every reading a section shows — its count, its preview, whether it is dirty — is
	 * derived from `drafts`, and a mutated Map is the same Map as far as that is concerned.
	 */
	function setLine(event: CombatNarrationEvent, index: number, value: string): void {
		const lines = [...(drafts.get(event) ?? [])];
		lines[index] = value;
		// Writing in the last row opens another under it, so a section never runs out of
		// somewhere to write — up to the cap, which is what the API will take.
		if (index === lines.length - 1 && value.trim() && lines.length < NARRATION_LINES_PER_EVENT) {
			lines.push('');
		}
		drafts = new Map(drafts).set(event, lines);
		clearError(event);
	}

	/** Drop one line. The row goes; nothing is written until the section is saved. */
	function removeLine(event: CombatNarrationEvent, index: number): void {
		const lines = (drafts.get(event) ?? []).filter((_, at) => at !== index);
		drafts = new Map(drafts).set(event, lines.length > 0 ? lines : ['']);
		clearError(event);
	}

	function clearError(event: CombatNarrationEvent): void {
		if (!errorByEvent.has(event)) return;
		const next = new Map(errorByEvent);
		next.delete(event);
		errorByEvent = next;
	}

	/** What a section would save: its rows, blanks dropped, as the API takes them. */
	function written(lines: string[]): string[] {
		return lines.map((line) => line.trim()).filter(Boolean);
	}

	/** Whether a section says something the file does not. */
	function dirty(event: CombatNarrationEvent, lines: string[]): boolean {
		const saved = collection.lines[event] ?? [];
		const draft = written(lines);
		return draft.length !== saved.length || draft.some((line, at) => line !== saved[at]);
	}

	/**
	 * What is wrong with a line, in this screen's own words, or ''.
	 *
	 * The same two things the API refuses a save for, said while it is being typed: a
	 * placeholder the event cannot fill (a hole in the sentence, on screen, mid-fight) and
	 * a line too long to read in the middle of a turn.
	 */
	function faultOf(event: CombatNarrationEvent, line: string): string {
		const text = line.trim();
		if (!text) return '';
		const unknown = unknownNarrationTokens(event, text);
		if (unknown.length > 0) {
			return `Nothing fills ${unknown.map((token) => `{${token}}`).join(', ')} here`;
		}
		if (text.length > NARRATION_LINE_MAX_LENGTH) {
			return `${text.length}/${NARRATION_LINE_MAX_LENGTH} characters`;
		}
		return '';
	}

	function faulted(event: CombatNarrationEvent, lines: string[]): boolean {
		return lines.some((line) => faultOf(event, line) !== '');
	}

	/** Write one section into the collection. Its own rows are what is sent. */
	async function save(event: CombatNarrationEvent): Promise<void> {
		const lines = written(drafts.get(event) ?? []);
		savingEvent = event;
		clearError(event);
		try {
			const res = await fetch(`${API_BASE}/api/combat-narration`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ event, lines })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({ message: res.statusText }));
				throw new Error(body.message ?? 'Save failed');
			}
			// The response is the whole collection as it now stands on disk, so this section
			// is re-seeded from the file rather than from what was typed — which is what
			// makes it stop reading dirty.
			collection = (await res.json()) as CombatNarrationCollection;
			drafts = new Map(drafts).set(event, linesOf(event));
		} catch (error) {
			errorByEvent = new Map(errorByEvent).set(
				event,
				error instanceof Error ? error.message : String(error)
			);
		} finally {
			savingEvent = null;
		}
	}

	// How much of the fight has words on it at all. An event with nothing authored is one
	// the fight plays out in silence — legitimate, and worth being able to see at a glance.
	$: authored = events.filter((event) => (collection.lines[event.id] ?? []).length > 0).length;
</script>

<div class="flex-1 bg-base-200 p-6 md:p-10">
	<div class="mx-auto flex max-w-5xl flex-col gap-6">
		<header class="flex flex-col gap-2">
			<div class="flex items-center gap-3">
				<h1 class="text-3xl font-bold">Narration</h1>
				<span class="badge badge-neutral">{authored}/{events.length} with lines</span>
			</div>
			<p class="text-sm opacity-70">
				What the game says over a fight while it is being played out. The board itself prints
				no word over any fighter — a callout at the reveal gives the turn away, and one after
				the fact only letters a picture that has just been drawn — so the words stand on the
				player's own panel instead: <strong>one sentence per encounter</strong>, an encounter
				being a row of the board and the duel between the two fighters standing in it. The
				walk out, the blow, the guard it came off and the ground that changes hands are all
				the one event, so they get the one line, and it stands for as long as that row is
				being played.
			</p>
			<p class="text-sm opacity-70">
				A section per way an encounter can go — that is the whole of what the fight
				announces, and every row that is still being fought gets one of them, including the
				three where nothing was thrown at all. Write as many ways of saying each as you
				like: the fight picks one per encounter, seeded off the encounter itself, so two
				identical blows are not narrated in identical words. Save writes that section into
				<code class="font-mono">@3xl/data</code>'s
				<code class="font-mono">public/combat-narration.json</code>, which is what the arena
				reads. The game is Catalan — these lines are the text a player sees, not a key.
			</p>
			<a class="link link-primary text-sm" href="/">← Back to stage</a>
		</header>

		{#if loadError}
			<div class="alert alert-error">
				<span>{loadError}</span>
			</div>
		{:else if loading}
			<div class="flex items-center gap-2 opacity-70">
				<span class="loading loading-spinner loading-sm"></span>
				<span>Loading narration…</span>
			</div>
		{:else}
			{#each events as event (event.id)}
				{@const lines = drafts.get(event.id) ?? ['']}
				{@const saved = collection.lines[event.id] ?? []}
				<section class="card bg-base-100 shadow-xl">
					<div class="card-body gap-4">
						<div class="flex flex-wrap items-center gap-3">
							<h2 class="card-title font-mono text-base">{event.id}</h2>
							<span class="badge badge-ghost text-xs">
								{saved.length}
								{saved.length === 1 ? 'line' : 'lines'}
							</span>
							{#if saved.length === 0}
								<span class="badge badge-warning badge-sm">silent</span>
							{/if}
							<!-- What the event can fill, which is the whole of what a line may name.
							     Drawn from the catalogue the API validates against, so what is offered
							     here and what would be taken are one list. -->
							<div class="ml-auto flex flex-wrap gap-1">
								{#each event.placeholders as placeholder (placeholder)}
									<code class="badge badge-outline badge-sm font-mono">
										{'{' + placeholder + '}'}
									</code>
								{/each}
							</div>
						</div>
						<p class="text-sm opacity-70">{event.summary}</p>

						<div class="flex flex-col gap-2">
							{#each lines as line, index (index)}
								{@const fault = faultOf(event.id, line)}
								<div class="flex flex-col gap-1">
									<div class="flex items-center gap-2">
										<input
											class={classNames('input input-sm input-bordered w-full font-medium', {
												'input-error': fault !== ''
											})}
											placeholder={index === lines.length - 1
												? 'Another way of saying it…'
												: ''}
											value={line}
											maxlength={NARRATION_LINE_MAX_LENGTH + 20}
											on:input={(e) => setLine(event.id, index, e.currentTarget.value)}
										/>
										<button
											type="button"
											class="btn btn-ghost btn-sm btn-square"
											aria-label="Remove this line"
											title="Remove this line"
											disabled={!line.trim()}
											on:click={() => removeLine(event.id, index)}
										>
											✕
										</button>
									</div>
									{#if fault}
										<p class="text-xs text-error">{fault}</p>
									{:else if line.trim()}
										<!-- The same line as the player would meet it: the placeholders
										     written in, against a lane made up for the purpose. It is the
										     one reading that says whether a sentence works — a line is
										     written with its braces in and read without them. -->
										<p class="text-xs opacity-60">
											{fillNarration(line.trim(), SAMPLE)}
										</p>
									{/if}
								</div>
							{/each}
						</div>

						{#if errorByEvent.has(event.id)}
							<div class="alert alert-error text-sm">
								<span>{errorByEvent.get(event.id)}</span>
							</div>
						{/if}

						<div class="card-actions items-center justify-end gap-3">
							{#if dirty(event.id, lines)}
								<span class="text-xs opacity-60">Unsaved</span>
							{/if}
							<button
								type="button"
								class="btn btn-primary btn-sm"
								disabled={savingEvent !== null ||
									!dirty(event.id, lines) ||
									faulted(event.id, lines)}
								on:click={() => save(event.id)}
							>
								{#if savingEvent === event.id}
									<span class="loading loading-spinner loading-xs"></span>
								{/if}
								Save
							</button>
						</div>
					</div>
				</section>
			{/each}
		{/if}
	</div>
</div>
