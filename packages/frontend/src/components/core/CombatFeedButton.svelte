<script lang="ts">
	import classNames from 'classnames';
	import { _ } from 'svelte-i18n';
	import GameGlyph from '$components/core/GameGlyph.svelte';
	import { combatFeedService } from '$services/combatFeed.service';

	/**
	 * How many fights have finished everywhere else, and the way to see them.
	 *
	 * It stands in two places, and they are the two ends of what this game is: the band across
	 * the top of the map, immediately before the dots the rest of the questions fold into, and
	 * the far corner of the player's own panel in a fight (see CombatArena) — the side of the
	 * screen that is about the player rather than about the board. The channel is the app's and
	 * not the arena's (see +layout.svelte), so the same count is the same count wherever it is
	 * pressed, and the sheet it raises is the one mounted at the root.
	 *
	 * Which means it carries **no shape of its own**. The band's presses are the name plate's
	 * fill drawn to the row's own height; the panel's are outlined squares the size of its
	 * arrows; and a mark that looked like either of them in the other place would be a mark
	 * that had wandered in. So the caller says where it stands (`classes`, on the box the row
	 * lays out) and what it is made of (`buttonClasses`, on the press), and what is in here is
	 * only what is true of it anywhere: the glyph, the count on its corner, and what pressing
	 * it does.
	 *
	 * Nothing is drawn until something has arrived — the box included, which is why the box is
	 * in here rather than round the outside: a wrapper left standing would be a square of
	 * nothing on the band, and an empty cell in the panel's corner. The feed has no history
	 * beyond the tail it opens on (see `combat-feed.type`), so a session that has heard nothing
	 * says nothing rather than standing a zero on the row. The count itself comes off once it
	 * has been read, leaving the mark alone: the fights are still there to be looked at, they
	 * are simply no longer news.
	 */
	const entries = combatFeedService.entries;
	const unread = combatFeedService.unread;

	/** Where the mark stands: whatever the row it is on lays its items out by. */
	export let classes: string = '';
	/** What the press is made of: the surface it is drawn on, in that row's own terms. */
	export let buttonClasses: string = '';
</script>

{#if $entries.length > 0}
	<div class={classNames('flex', classes)}>
		<!-- Two marks and no words, like every other press on both rows it stands in: the
		     catalogue's wording is the label, said to a screen reader and to a pointer resting on
		     it. `relative` because the count rides the corner, and neither daisyUI's button nor a
		     bare one is positioned. -->
		<button
			type="button"
			class={classNames(
				'relative flex cursor-pointer items-center justify-center',
				buttonClasses
			)}
			aria-label={$_('combat.feed.open', { values: { count: $unread } })}
			title={$_('combat.feed.title')}
			on:click={() => combatFeedService.openFeed()}
		>
			<GameGlyph name="lorc/crossed-swords" classes="[&>svg]:size-5" />
			{#if $unread > 0}
				<!-- The number is a badge on the mark rather than a figure beside it: what it counts
				     is how much of the feed is new, which is a thing that happens *to* the mark and
				     goes away when the sheet is opened. Hung off the corner rather than inside it, the
				     square being exactly the glyph's own room. -->
				<span
					class="badge badge-xs badge-error absolute -top-1 -right-1 px-1 font-semibold text-white"
				>
					{$unread}
				</span>
			{/if}
		</button>
	</div>
{/if}
