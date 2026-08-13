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
	 * the first frame, which is what the panel it is pinned to the foot of needs of it.
	 */
	export let classes: string = '';
</script>

<!-- One plate holding the three, drawn as the fight's own narration is drawn (see
     CombatNarration): the same plate and the same ink, because it is the same voice saying
     the same kind of thing about the same board — what a row is doing while a turn plays
     out, and what an order does while one is being planned. The two never stand at once:
     the narration is up only while a turn is being carried out, and this only while one is
     being thought about. At the narration's own size too, being read at the same distance
     from the same plate.
     Two columns rather than a mark inline with each sentence: the marks are one width and
     stand in a column of their own, so the three sentences begin on the same edge and a
     line that has to wrap wraps under itself rather than under the glyph. Both columns are
     as wide as what stands in them and the pair of them is centred in the plate, so the
     block sits in the middle of the panel while the sentences still share an edge — a
     centred *line* would put three different lengths on three different left edges, which
     is a list that no longer reads down. -->
<ul
	class={classNames(
		'grid grid-cols-[auto_auto] items-baseline justify-center gap-x-2 gap-y-1 rounded-box bg-base-100/90 px-3 py-2 text-xl leading-snug shadow-lg',
		classes
	)}
>
	{#each COMBAT_ACTIONS as action (action)}
		{@const glyph = orderGlyph(action)}
		<li class="col-span-2 grid grid-cols-subgrid items-baseline">
			<span class="flex-none"
				>{#if glyph}<GameGlyph name={glyph} classes="[&>svg]:size-[1em]" />{/if}<span
					class="sr-only">{$_(`combat.orders.${action}`)}</span
				></span
			>
			<span>{$_(`combat.guide.${action}`)}</span>
		</li>
	{/each}
</ul>
