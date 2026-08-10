<script lang="ts">
	import classNames from 'classnames';
	import { _ } from 'svelte-i18n';
	import FullScreenModal from '$components/core/FullScreenModal.svelte';
	import PlayerAvatar from '$components/core/PlayerAvatar.svelte';
	import { combatFeedService } from '$services/combatFeed.service';
	import restoreCatalanArticle from '$utils/string/restore-catalan-article';
	import type { CombatFeedEntry } from '$types/combat-feed.type';
	import type { CombatOutcome } from '$types/combat.type';

	/**
	 * Every fight that has finished elsewhere while this one has been going on, read out.
	 *
	 * It is the button's other half: the counter in the head of the fight says how many, and
	 * this says which. One line a fight — who fought it, what it came to, and the town it
	 * was over — newest first, on the same sheet every full view in this app is drawn on.
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
		town: townName(entry, $townNames)
	}));

	function townName(entry: CombatFeedEntry, known: ReadonlyMap<string, string> | null): string {
		const name = known?.get(entry.locationId);
		return name ? restoreCatalanArticle(name) : entry.locationId;
	}

	// What a fight came to, in the colours the fight itself is counted in: the player's own
	// info blue for a win, the rivals' error red for a loss. A capture is the same win said
	// louder, because taking a town is the only thing in this game that changes the map.
	function outcomeLabel(entry: CombatFeedEntry): string {
		if (entry.captured) return $_('combat.feed.captured');
		return $_(`combat.feed.outcome.${entry.outcome}`);
	}

	const outcomeClasses: Record<CombatOutcome, string> = {
		win: 'text-info',
		lose: 'text-error',
		draw: 'opacity-70'
	};

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
		{#each lines as { entry, town } (entry.id)}
			<!-- One fight: the line it is read as, and under it the whole of what was announced
			     about it, while it is open. The rule the row carried moves out here, so a fight
			     is one block however much of it is showing and the record is inside the same
			     division as the line it belongs to. -->
			<div class="flex flex-col border-b border-base-300/50 last:border-0">
				<!-- One fight, read the way the game says one: whoever fought it on the left, wearing
				     the avatar they wear everywhere else, then what they did and where, then the hour
				     it happened at.
				     The whole line is the press, as the map's own rows are: there is one thing to do
				     with a fight here and the line is the thing to press. It names itself in its own
				     words — the player, the outcome, the town and the hour are what a screen reader
				     reads out — so it carries no label of its own, only `aria-expanded`, which is the
				     one thing about it the words do not say. -->
				<button
					type="button"
					class="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-base-300/40"
					aria-expanded={opened.has(entry.id)}
					on:click={() => toggle(entry.id)}
				>
					<PlayerAvatar
						characterId={entry.player.characterId}
						color={entry.player.color}
						initial={(entry.player.name ?? '?').slice(0, 1).toUpperCase()}
						size="w-10"
						textClasses="text-base"
						ownColors={false}
					/>
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="truncate font-semibold">
							{entry.player.name ?? $_('combat.feed.anonymous')}
							<span class="ml-1 text-xs font-normal opacity-60">
								{$_('profile.levelBadge', { values: { level: entry.player.level } })}
							</span>
						</span>
						<span class="truncate text-sm">
							<span class={classNames('font-semibold', outcomeClasses[entry.outcome])}>
								{outcomeLabel(entry)}
							</span>
							<span class="opacity-70">{town}</span>
						</span>
					</div>
					<span class="flex-none text-xs opacity-60">{timeFormat.format(new Date(entry.at))}</span>
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
