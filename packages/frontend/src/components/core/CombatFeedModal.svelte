<script lang="ts">
	import { _ } from 'svelte-i18n';
	import CombatFeedSide from '$components/core/CombatFeedSide.svelte';
	import FullScreenModal from '$components/core/FullScreenModal.svelte';
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
	 * beating somebody, and the feed was printing half of that. Both sides are on the row
	 * now, facing each other across what happened between them, exactly as the head of a
	 * fight lays out the town and whoever holds it. Which of them is the winner is settled
	 * here ({@link duel}) rather than on the row, since the row should not have to know that
	 * `lose` means the *other* one won.
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
		town: townName(entry, $townNames),
		duel: duel(entry)
	}));

	function townName(entry: CombatFeedEntry, known: ReadonlyMap<string, string> | null): string {
		const name = known?.get(entry.locationId);
		return name ? restoreCatalanArticle(name) : entry.locationId;
	}

	/** A fight as two sides rather than as one account's account of it. `drawn` is the third
	 * outcome, where the two are simply the two and neither of them beat anybody. */
	interface Duel {
		/** The one that won, or the reporter on a draw — the side the row opens with. */
		winner: CombatFeedPlayer | null;
		/** The one that was beaten, null where it was the town's own house team. */
		loser: CombatFeedPlayer | null;
		drawn: boolean;
	}

	/**
	 * Which of the two won.
	 *
	 * The announcement is worded from the account that reported it, so `win` is the reporter
	 * beating the side that held the town and `lose` is that side beating the reporter — the
	 * one fact that has to be turned round before a line can name a winner. A draw has no
	 * winner at all and keeps the reporter first, there being nothing to put ahead of them.
	 *
	 * Either of the two may be null: the reporter's account is always named, but a town on
	 * its seeded house team belongs to nobody, and that is the side {@link CombatFeedSide}
	 * letters as the house.
	 */
	function duel(entry: CombatFeedEntry): Duel {
		if (entry.outcome === 'lose') {
			return { winner: entry.rival, loser: entry.player, drawn: false };
		}
		return { winner: entry.player, loser: entry.rival, drawn: entry.outcome === 'draw' };
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
		{#each lines as { entry, town, duel } (entry.id)}
			<!-- One fight: the line it is read as, and under it the whole of what was announced
			     about it, while it is open. The rule the row carried moves out here, so a fight
			     is one block however much of it is showing and the record is inside the same
			     division as the line it belongs to. -->
			<div class="flex flex-col border-b border-base-300/50 last:border-0">
				<!-- One fight, read across as a duel: the two that fought it facing each other over
				     what happened between them, each wearing the avatar they wear everywhere else,
				     and under the pair the town it was over with the hour at the far end.
				     Two halves of one row (`flex-1` each), so a name of any length and a name of any
				     length are laid out by the row and not by each other — the same rule the head of
				     the fight lays its two cells out under. The winner opens the row and the beaten
				     side closes it, faded, facing back into the middle: which of them won is said in
				     words between them, and the fade is only what keeps the eye on the one that did.
				     The whole line is the press, as the map's own rows are: there is one thing to do
				     with a fight here and the line is the thing to press. It names itself in its own
				     words — the two players, what happened, the town and the hour are what a screen
				     reader reads out — so it carries no label of its own, only `aria-expanded`, which
				     is the one thing about it the words do not say. -->
				<button
					type="button"
					class="flex w-full cursor-pointer flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-base-300/40"
					aria-expanded={opened.has(entry.id)}
					on:click={() => toggle(entry.id)}
				>
					<div class="flex w-full items-center gap-2">
						<CombatFeedSide player={duel.winner} />
						<!-- What happened between them, on the seam the two sides meet at: one word,
						     which is either a verb with a subject on its left and an object on its
						     right, or the noun a fight that settled nothing is. It keeps its own width
						     and the two halves give, so the seam stays in the middle of the row
						     whatever the names either side of it come to. -->
						<span class="flex-none px-1 text-xs font-semibold tracking-wide uppercase opacity-70">
							{duel.drawn ? $_('combat.feed.drew') : $_('combat.feed.beat')}
						</span>
						<CombatFeedSide player={duel.loser} reversed dimmed={!duel.drawn} />
					</div>
					<!-- Where it happened, and when. Under the pair rather than beside either of them,
					     because the town is the one thing on the row that is about neither side —
					     until it changed hands, which is the winner's doing and is said here as the
					     one thing a fight can do to the map. -->
					<div class="flex w-full items-baseline justify-between gap-2 text-xs opacity-70">
						<span class="truncate">
							{#if entry.captured}<span class="font-semibold"
									>{$_('combat.feed.captured')}</span
								>{/if}
							{town}
						</span>
						<span class="flex-none">{timeFormat.format(new Date(entry.at))}</span>
					</div>
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
