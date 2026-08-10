<script lang="ts">
	import classNames from 'classnames';
	import { _ } from 'svelte-i18n';
	import GameGlyph from '$components/core/GameGlyph.svelte';
	import { combatFeedService } from '$services/combatFeed.service';

	/**
	 * How many other fights have finished while this one has been going on, and the way to
	 * see them.
	 *
	 * It stands at the end of the score banner in the head of the fight, past the player's
	 * own count and on the same siege bar everything else on that row stands on — the one
	 * place in the arena that is already a running account of what is happening to the map,
	 * which is what this is: the bar under it is how far *this* town has been taken, and the
	 * number on it is how many other towns have just been fought over.
	 *
	 * Nothing is drawn until something has arrived. The feed has no history — it is what has
	 * happened since this page opened (see `combat-feed.type`) — so an arena opened into a
	 * quiet minute has nothing to offer and says nothing, rather than standing a zero over
	 * the fight. The count itself comes off once it has been read, leaving the mark alone:
	 * the fights are still there to be looked at, they are simply no longer news.
	 */
	const entries = combatFeedService.entries;
	const unread = combatFeedService.unread;

	export let classes: string = '';
</script>

{#if $entries.length > 0}
	<!-- On the banner and not over it: a plate of its own would be a second thing floating on
	     a row that is already one reading. The mark is drawn in the banner's own white, like
	     the lane counts beside it, and the count rides its corner as a badge. -->
	<button
		type="button"
		class={classNames(
			'relative flex h-full items-center px-2 text-white transition-opacity hover:opacity-80',
			classes
		)}
		aria-label={$_('combat.feed.open', { values: { count: $unread } })}
		title={$_('combat.feed.title')}
		on:click={() => combatFeedService.openFeed()}
	>
		<GameGlyph name="lorc/crossed-swords" classes="[&>svg]:size-5" />
		{#if $unread > 0}
			<!-- The number is a badge on the mark rather than a figure beside it: what it counts
			     is how much of the feed is new, which is a thing that happens *to* the mark and
			     goes away when the sheet is opened. -->
			<span
				class="badge badge-xs badge-error absolute top-0 right-0 px-1 font-semibold text-white"
			>
				{$unread}
			</span>
		{/if}
	</button>
{/if}
