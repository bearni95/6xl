<script lang="ts">
	import classNames from 'classnames';
	import { _ } from 'svelte-i18n';
	import GameGlyph from '$components/core/GameGlyph.svelte';
	import { combatFeedService } from '$services/combatFeed.service';

	/**
	 * How many other fights have finished while this one has been going on, and the way to
	 * see them.
	 *
	 * It stands at the far corner of the player's own panel, across the row from the account
	 * (see CombatArena): the panel is the side of the screen that is about the player rather
	 * than about the fight, and what the rest of the game is doing meanwhile is news to the
	 * player and not to the board. It stood at the end of the score banner in the head of the
	 * fight until that banner came off, which is why nothing drew it for a while.
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
	<!-- The outlined square the panel draws every one of its own presses as — the arrows that
	     turn it, the way back from the concede — so a control that is not an order is the same
	     shape wherever the panel puts one. Two marks and no words, like those: the catalogue's
	     wording is the label, said to a screen reader and to a pointer resting on it.
	     `relative` because daisyUI's button is not positioned, and the count rides its corner. -->
	<button
		type="button"
		class={classNames('btn relative btn-outline btn-square btn-sm', classes)}
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
{/if}
