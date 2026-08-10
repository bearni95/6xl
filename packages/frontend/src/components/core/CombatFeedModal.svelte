<script lang="ts">
	import { _ } from 'svelte-i18n';
	import FullScreenModal from '$components/core/FullScreenModal.svelte';
	import PlayerAvatar from '$components/core/PlayerAvatar.svelte';
	import { combatFeedService } from '$services/combatFeed.service';
	import restoreCatalanArticle from '$utils/string/restore-catalan-article';
	import type { CombatFeedEntry, CombatFeedPlayer } from '$types/combat-feed.type';

	/**
	 * Every fight that has finished elsewhere while this one has been going on, read out.
	 *
	 * It is the button's other half: the counter at the corner of the orders panel says how
	 * many, and this says which. One line a fight — **both** the players in it, which of
	 * them won, and the town it was over — newest first, on the same sheet every full view
	 * in this app is drawn on.
	 *
	 * A line used to name one player and read the fight from their side ("X won at Y"),
	 * which is how the announcement is worded — `outcome` is stated from the account that
	 * reported it — and it is not how a fight reads to anybody else: a win is somebody
	 * beating somebody, and the feed was printing half of that. Both are in it now, and they
	 * are in a **sentence** ({@link sentence}): the whole wording lives in the catalogue and
	 * the three names are handed to it, rather than the row being a face and a name and a
	 * level at either end of a verb. A fight assembled out of boxes leaves the grammar to
	 * the layout, and grammar is not a thing a flex row can be right about.
	 *
	 * The list is the service's and arrives by socket, so nothing is fetched here and there
	 * is nothing to refresh: a fight that finishes while this sheet is up is drawn onto it
	 * as it lands.
	 *
	 * **A fight names a town and never a code.** What travels on the channel is the geojson
	 * feature id, because the server has no idea what a town is called — no table there holds
	 * a place name; the layer the map is drawn from is the only thing that does. The service
	 * reads that layer as the fight starts rather than as this sheet is raised (see its
	 * `townNamesById`), so a name is in hand well before there is a line to put it on, and
	 * what is printed is what the map would print: the gazetteer's trailing article moved back
	 * to the front, the way every other place name in this game is set. The id is what is left
	 * when the layer cannot be had at all, which is the same nothing the map would fall back
	 * on.
	 */
	const entries = combatFeedService.entries;
	const townNames = combatFeedService.townNamesById;

	/**
	 * Which lines have been opened onto the whole of what arrived with them.
	 *
	 * A line says three things about a fight — who, what, and where — and the announcement
	 * carries a good deal more than that: what it paid, how much of the team came through,
	 * how many stood against them, whether the town changed hands, whether it was fought
	 * against a generation that had already been superseded, and the id behind every one of
	 * those readings. None of it belongs on the line, and all of it is worth being able to
	 * see, so the line is the press and the record drops out underneath it.
	 *
	 * A set rather than one open id: two fights opened at once are two fights being compared,
	 * which is the reason to be reading the record at all, and an accordion would shut the
	 * first the moment the second was asked for. It is rebuilt rather than mutated on every
	 * press, because Svelte's legacy reactive tracking follows assignments and a `Set` that
	 * is only added to never re-renders anything.
	 */
	let opened: ReadonlySet<string> = new Set();

	function toggle(id: string): void {
		const next = new Set(opened);
		if (!next.delete(id)) next.add(id);
		opened = next;
	}

	// The clock only: a feed is about what is happening now, and a date over every line of it
	// would be the same date on all of them.
	const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

	// Both stores are named in the statement itself, so the lines are rebuilt when either the
	// feed or the layer moves — a name that arrived into something only a helper could see
	// would have left every line standing at the id it was first drawn with.
	$: lines = $entries.map((entry) => ({
		entry,
		said: sentence(entry, townName(entry, $townNames)),
		face: winner(entry)
	}));

	function townName(entry: CombatFeedEntry, known: ReadonlyMap<string, string> | null): string {
		const name = known?.get(entry.locationId);
		return name ? restoreCatalanArticle(name) : entry.locationId;
	}

	/**
	 * The fight, in one sentence.
	 *
	 * Both the players, which of them won and the town it was over, said the way the game
	 * would say it out loud — the whole wording in the catalogue and the three names handed
	 * to it, rather than a row of boxes the reader has to assemble a fight out of. Which
	 * means the *grammar* is the catalogue's too: where the verb sits, what the preposition
	 * is and whether taking a town is a clause of its own are all things a language decides,
	 * and none of them survive being drawn as three cells in a line.
	 *
	 * Three sentences, and they are three because the sentence differs and not because the
	 * data does: a fight won, a fight won that took the town with it, and a fight that
	 * settled nothing — which has no winner, and reads as the two of them together.
	 *
	 * The announcement is worded from the account that reported it, so `win` is the reporter
	 * beating whoever held the town and `lose` is that side beating the reporter. Turning
	 * that round is the whole of what this has to know beyond the words.
	 */
	function sentence(entry: CombatFeedEntry, town: string): string {
		const beaten = entry.outcome === 'lose' ? entry.player : entry.rival;
		const won = entry.outcome === 'lose' ? entry.rival : entry.player;
		const values = { winner: named(won), loser: named(beaten), town };
		if (entry.outcome === 'draw') return $_('combat.feed.said.drew', { values });
		if (entry.captured) return $_('combat.feed.said.captured', { values });
		return $_('combat.feed.said.beat', { values });
	}

	/**
	 * What to call one of the two in that sentence.
	 *
	 * A null side is a town still on its seeded house team, which belongs to nobody — so it
	 * is called the house rather than left as a hole in the middle of a sentence; and an
	 * account that has never named itself is worded, as it is everywhere else in this game,
	 * never stored.
	 */
	function named(player: CombatFeedPlayer | null): string {
		if (!player) return $_('combat.feed.house');
		return player.name ?? $_('combat.feed.anonymous');
	}

	/** The face the line is marked with: the winner's, or the reporter's where nobody won.
	 * One mark and not a portrait of each side — the sentence is what names them both. */
	function winner(entry: CombatFeedEntry): CombatFeedPlayer {
		return entry.outcome === 'lose' && entry.rival ? entry.rival : entry.player;
	}

	function close(): void {
		combatFeedService.closeFeed();
	}
</script>

<FullScreenModal
	title={$_('combat.feed.title')}
	closeLabel={$_('combat.feed.close')}
	on:close={close}
>
	<!-- The list scrolls inside the sheet rather than the sheet scrolling, as the leaderboard's
	     table does: the title bar stays put however far down the feed a fight sits. -->
	<div class="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-box bg-base-200/50">
		{#each lines as { entry, said, face } (entry.id)}
			<!-- One fight: the line it is read as, and under it the whole of what was announced
			     about it, while it is open. The rule the row carried moves out here, so a fight
			     is one block however much of it is showing and the record is inside the same
			     division as the line it belongs to. -->
			<div class="flex flex-col border-b border-base-300/50 last:border-0">
				<!-- One fight, said in one sentence: both the players in it, which of them won and
				     the town it was over, written out (see `sentence`) rather than laid out. It was
				     a row of boxes for a while — a face and a name and a level at either end of a
				     word — which is a fight the reader has to assemble out of its parts, and which
				     leaves the grammar to the layout: where a verb sits and what a preposition is
				     are the catalogue's to decide, not a flex row's.
				     One face beside it, the winner's, which is a mark on the line and not a fourth
				     thing to read: the sentence has already named them.
				     The whole line is the press, as the map's own rows are: there is one thing to do
				     with a fight here and the line is the thing to press. It names itself in its own
				     words — the sentence and the hour are what a screen reader reads out — so it
				     carries no label of its own, only `aria-expanded`, which is the one thing about
				     it the words do not say. -->
				<button
					type="button"
					class="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-base-300/40"
					aria-expanded={opened.has(entry.id)}
					on:click={() => toggle(entry.id)}
				>
					<PlayerAvatar
						characterId={face.characterId}
						color={face.color}
						initial={(face.name ?? '?').slice(0, 1).toUpperCase()}
						size="w-10"
						textClasses="text-base"
						ownColors={false}
					/>
					<!-- The sentence wraps rather than truncating: it is a sentence, and half of one
					     says something other than what happened. `min-w-0` so it may, a flex item
					     being floored at its own content otherwise. -->
					<span class="min-w-0 flex-1 text-sm">{said}</span>
					<span class="flex-none self-start text-xs opacity-60"
						>{timeFormat.format(new Date(entry.at))}</span
					>
				</button>
				{#if opened.has(entry.id)}
					<!-- The announcement itself, as the app holds it: the entry the adapter read off
					     the channel, every field of it, in the order the type declares them. Not the
					     line's own reading of it — the town is its geojson id down here, because that
					     is what arrived and this is the record rather than the sentence.
					     It scrolls on its own axis rather than wrapping (`overflow-x-auto` on a `pre`,
					     which is what keeps the indentation meaning something), so a long id runs
					     inside this box and never widens the sheet the list is drawn on. -->
					<pre
						class="mx-4 mb-3 overflow-x-auto rounded-box bg-base-300/60 p-3 font-mono text-xs">{JSON.stringify(
							entry,
							null,
							2
						)}</pre>
				{/if}
			</div>
		{:else}
			<!-- Nothing has finished yet. The sheet is only reachable once something has, so this
			     is the state of a feed whose fights have all been read and then trimmed away —
			     rare, and still worth a sentence rather than an empty box. -->
			<p class="p-6 text-center text-sm opacity-70">{$_('combat.feed.empty')}</p>
		{/each}
	</div>
</FullScreenModal>
