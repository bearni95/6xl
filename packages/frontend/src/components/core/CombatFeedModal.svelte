<script lang="ts">
	import classNames from 'classnames';
	import { _ } from 'svelte-i18n';
	import FullScreenModal from '$components/core/FullScreenModal.svelte';
	import PlayerAvatar from '$components/core/PlayerAvatar.svelte';
	import { combatFeedService } from '$services/combatFeed.service';
	import { locationAdapter } from '$adapters/classes/location.adapter';
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
	 * as it lands. The one thing that *is* fetched is the town names, and only the first
	 * time the sheet is opened — the announcements name towns by geojson id, since the
	 * server has no idea what a town is called, and the layer that does is the very one the
	 * map draws. A missing layer leaves the ids standing, which is what the map does with a
	 * town it cannot name either.
	 */
	const entries = combatFeedService.entries;

	// The clock only: a feed is about what is happening now, and a date over every line of it
	// would be the same date on all of them.
	const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

	let names: Map<string, string> | null = null;
	let asked = false;

	// Asked for on mount, which is when the sheet is raised — the component only exists while
	// it is up. Named nowhere else: the button and the counter never need a name.
	loadNames();

	async function loadNames(): Promise<void> {
		if (asked) return;
		asked = true;
		try {
			const response = await fetch('/data/geo/municipis.json');
			const municipalities = (await response.json()) as GeoJSON.FeatureCollection;
			names = locationAdapter.municipalityNames(municipalities);
		} catch {
			// The ids stand for themselves. A feed that says nothing because a map layer was
			// not there would be worse than one naming a town by its number.
			names = null;
		}
	}

	function townName(entry: CombatFeedEntry): string {
		return names?.get(entry.locationId) ?? entry.locationId;
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
		{#each $entries as entry (entry.id)}
			<!-- One fight, read the way the game says one: whoever fought it on the left, wearing
			     the avatar they wear everywhere else, then what they did and where, then the hour
			     it happened at. -->
			<div class="flex items-center gap-3 border-b border-base-300/50 px-4 py-3 last:border-0">
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
						<span class="opacity-70">{townName(entry)}</span>
					</span>
				</div>
				<span class="flex-none text-xs opacity-60">{timeFormat.format(new Date(entry.at))}</span>
			</div>
		{:else}
			<!-- Nothing has finished yet. The sheet is only reachable once something has, so this
			     is the state of a feed whose fights have all been read and then trimmed away —
			     rare, and still worth a sentence rather than an empty box. -->
			<p class="p-6 text-center text-sm opacity-70">{$_('combat.feed.empty')}</p>
		{/each}
	</div>
</FullScreenModal>
