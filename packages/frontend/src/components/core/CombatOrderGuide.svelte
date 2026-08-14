<script lang="ts">
	import classNames from 'classnames';
	import { _ } from 'svelte-i18n';
	import GameGlyph from '$components/core/GameGlyph.svelte';
	import { orderGlyph } from '$utils/color/traits';
	import { COMBAT_ACTIONS } from '$services/combat.controller';

	/**
	 * What each of the three orders does, said across the middle of the player's panel while
	 * a turn is being planned — all three at once, one line each.
	 *
	 * The orders themselves are given on the board now — the column standing in the lane of
	 * the fighter being answered for — so the panel, which is where the three buttons used to
	 * be, is free for the one thing the board cannot say: what pressing one of them *means*. The glyph is the very mark on the button being explained
	 * ({@link orderGlyph}), which is the whole of what ties a line to an order here: the
	 * order is not named in words, since its name is already lettered under the pointer on
	 * the board and a plate that says `Carrega — ` before every line is a column of labels
	 * standing between the reader and the three things they came to read. The mark is
	 * decorative to a screen reader, so the name is kept for one in `sr-only` text — a
	 * sentence with nothing to pair it to is not a reading of anything.
	 *
	 * **Each line says what the order does and nothing else.** What an order costs or fails
	 * to do — that charging leaves you uncovered, that defending banks nothing — is a thing
	 * the fight itself shows the moment it happens, and the reader in front of this plate is
	 * choosing between three moves rather than auditing them.
	 *
	 * **It is a table and not a slideshow.** The three turned over one at a time for a while,
	 * a second each and round again, which meant a reader who wanted to compare two orders
	 * had to wait for the other one to come back — and that a player deciding between charge
	 * and shoot was reading the plate rather than the board. Three short lines fit in the
	 * room one long one took, so all three stand, in the order the fight lists them, and the
	 * reading is over the moment the eye reaches the bottom of it. Nothing here moves,
	 * nothing is pressed, and there is no timer: the block is as tall as it will ever be from
	 * the first frame, which is what a block centred in the card needs to be — one that grew
	 * would push off both edges at once.
	 *
	 * **It is not plated.** The lines stand on the panel's own card, across the whole width
	 * it gives them, exactly as the narration does over the middle of that same card: the
	 * card is the plate, and a fill and an edge of their own inside it were a box drawn round
	 * a thing that already had one.
	 */
	export let classes: string = '';
</script>

<!-- The three lines and nothing round them, drawn as the fight's own narration is drawn
     (see CombatNarration): the same ink at the same size, because it is the same voice
     saying the same kind of thing about the same board — what a row is doing while a turn
     plays out, and what an order does while one is being planned. The two never stand at
     once: the narration is up only while a turn is being carried out, and this only while
     one is being thought about.
     **No plate of its own.** It is laid on the panel's card, which is a plate already, and
     a second fill with a second edge and a second shadow inside that one read as a box
     pasted onto the panel rather than as the panel talking. What kept the words off the
     card's edge was this block's own padding; the card's is what does it now, so the three
     lines take the whole width they are given.
     Every line is centred on its own, mark and sentence together, rather than the three
     being set in a pair of columns and the block of them centred: columns hold the
     sentences to one left edge, which puts the whole reading off to one side of a block as
     wide as the panel. So each row is its own centred line here, and a sentence long enough
     to wrap wraps centred too. -->
<ul
	class={classNames(
		'flex w-full flex-col items-center gap-y-1 text-center text-xl leading-snug',
		classes
	)}
>
	{#each COMBAT_ACTIONS as action (action)}
		{@const glyph = orderGlyph(action)}
		<li class="flex items-baseline justify-center gap-x-2">
			<span class="flex-none"
				>{#if glyph}<GameGlyph name={glyph} classes="[&>svg]:size-[1em]" />{/if}<span
					class="sr-only">{$_(`combat.orders.${action}`)}</span
				></span
			>
			<span>{$_(`combat.guide.${action}`)}</span>
		</li>
	{/each}
</ul>
