<script lang="ts">
	import classNames from 'classnames';
	import { _ } from 'svelte-i18n';
	import GameGlyph from '$components/core/GameGlyph.svelte';
	import { orderGlyph } from '$utils/color/traits';
	import { COMBAT_ACTIONS } from '$services/combat.controller';

	/**
	 * What each of the three orders does, said along the foot of the player's panel while a
	 * turn is being planned — all three at once, one line each.
	 *
	 * The orders themselves are given on the board now — the column standing in the lane of
	 * the fighter being answered for — so the foot of the panel, which is where the three
	 * buttons used to be, is free for the one thing the board cannot say: what pressing one
	 * of them *means*. The glyph is the very mark on the button being explained
	 * ({@link orderGlyph}), so the sentence and the thing it is about are one picture.
	 *
	 * **It is a table and not a slideshow.** The three turned over one at a time for a while,
	 * a second each and round again, which meant a reader who wanted to compare two orders
	 * had to wait for the other one to come back — and that a player deciding between charge
	 * and shoot was reading the plate rather than the board. Three short lines fit in the
	 * room one long one took, so all three stand, in the order the fight lists them, and the
	 * reading is over the moment the eye reaches the bottom of it. Nothing here moves,
	 * nothing is pressed, and there is no timer: the block is as tall as it will ever be from
	 * the first frame, which is what the panel it is pinned to the foot of needs of it.
	 *
	 * A description list, because that is what it is — the order named, and what the order
	 * does — and because a screen reader then pairs each sentence with the name it belongs
	 * to rather than reading six things in a row.
	 */
	export let classes: string = '';
</script>

<!-- One plate holding the three, drawn as the fight's own narration is drawn (see
     CombatNarration): the same plate and the same ink, because it is the same voice saying
     the same kind of thing about the same board — what a row is doing while a turn plays
     out, and what an order does while one is being planned. The two never stand at once:
     the narration is up only while a turn is being carried out, and this only while one is
     being thought about. Smaller than the narration, that being one sentence and this
     three.
     Two columns rather than three lines of running text: the names are one width and the
     sentences another, so the dashes line up and the block reads down the left-hand edge as
     a list of the three things a player may do. The name never wraps — it is a single word
     and a mark, and a mark left alone on a line of its own is not a reading of anything. -->
<dl
	class={classNames(
		'grid grid-cols-[auto_1fr] items-baseline gap-x-2 gap-y-1 rounded-box bg-base-100/90 px-3 py-2 text-sm leading-snug shadow-lg',
		classes
	)}
>
	{#each COMBAT_ACTIONS as action (action)}
		{@const glyph = orderGlyph(action)}
		<dt class="font-semibold whitespace-nowrap"
			>{#if glyph}<GameGlyph name={glyph} classes="mr-1 [&>svg]:size-[0.85em]" />{/if}{$_(
				`combat.orders.${action}`
			)}</dt
		>
		<dd>— {$_(`combat.guide.${action}`)}</dd>
	{/each}
</dl>
