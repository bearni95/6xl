<script lang="ts">
	import classNames from 'classnames';
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import GameGlyph from '$components/core/GameGlyph.svelte';
	import { orderGlyph } from '$utils/color/traits';
	import { COMBAT_ACTIONS } from '$services/combat.controller';

	/**
	 * What each of the three orders does, said one at a time along the foot of the player's
	 * panel while a turn is being planned.
	 *
	 * The orders themselves are given on the board now — the column standing in the lane of
	 * the fighter being answered for — so the foot of the panel, which is where the three
	 * buttons used to be, is free for the one thing the board cannot say: what pressing one
	 * of them *means*. The glyph is the very mark on the button being explained
	 * ({@link ORDER_ICONS}), so the sentence and the thing it is about are one picture.
	 *
	 * **It is read rather than worked**: nothing here is pressed and there is no way to hold
	 * a slide or step it. It turns once a second, always onwards, and comes round again — a
	 * fourth slide is the first one, so a reader who looks up mid-cycle is never more than
	 * three seconds from any of the three.
	 *
	 * **All three stand in the one cell** of a single-cell grid, always drawn, and what
	 * changes is where each is and whether it is inked. Which is not tidiness: a slide that
	 * mounted and unmounted would take the plate's height with it — the three sentences are
	 * different lengths — so the box would grow and shrink under a panel whose corners are
	 * pinned to it. Stacked, the cell is as tall as the longest of the three from the first
	 * frame and nothing under it ever moves. The same trick, for the same reason, as the
	 * account/give-up crossfade at the panel's other corner.
	 *
	 * Which leaves each slide with three places to be, off one index: the one being read
	 * stands in the middle, the one that has just been read has gone off to the left, and the
	 * rest wait to the right. So every turn of it is the same movement in the same direction,
	 * the wrap included — the slide that has to get from the left back to the right does it
	 * while it is invisible.
	 *
	 * Nothing is hidden from a screen reader and nothing is announced: the three sentences
	 * are all in the document, in order, and a reading of them is the whole of what this
	 * says. A live region would read the same three lines out over and over, once a second,
	 * for as long as a player was thinking.
	 */
	export let classes: string = '';

	/** How long one order stands before the next takes its place. A second is long enough to
	 * read a line of it and short enough that the three are one thing rather than three
	 * things that happen to share a box. */
	const SLIDE_MS = 1000;
	/** How long the change itself takes. Half the beat, so a slide is plainly moving and is
	 * plainly still by the time the next one is due. */
	const SLIDE_CLASSES = 'transition-all duration-500';

	let at = 0;

	// On mount rather than at once: this component is drawn on a page that is prerendered,
	// and a timer started there would be a server ticking for a reader that is not on it.
	onMount(() => {
		const turning = setInterval(() => {
			at = (at + 1) % COMBAT_ACTIONS.length;
		}, SLIDE_MS);
		return () => clearInterval(turning);
	});

	/** The one that has just been read, and is therefore the one on its way out to the left.
	 * Everything that is neither this nor the one being read is waiting to the right. */
	$: gone = (at + COMBAT_ACTIONS.length - 1) % COMBAT_ACTIONS.length;
</script>

<!-- Bottom-aligned, because the three sentences are three lengths and this block is pinned
     to the foot of the panel: each plate is its own height and they share the edge they
     stand on, so the box grows upward into room the panel has and never opens a gap under
     the shortest of them. Stretched, all three would be as tall as the longest and two of
     them would be a sentence at the top of an empty plate. -->
<div class={classNames('grid items-end justify-items-center', classes)}>
	{#each COMBAT_ACTIONS as action, index (action)}
		{@const glyph = orderGlyph(action)}
		<!-- Drawn as the fight's own narration is drawn (see CombatNarration): the same plate,
		     the same ink and the same size, because it is the same voice saying the same kind
		     of thing about the same board — what a row is doing while a turn plays out, and
		     what an order does while one is being planned. The two never stand at once: the
		     narration is up only while a turn is being carried out, and this only while one is
		     being thought about. -->
		<p
			class={classNames(
				'col-start-1 row-start-1 max-w-md rounded-box bg-base-100/90 px-3 py-2 text-center text-xl font-medium text-balance shadow-lg',
				SLIDE_CLASSES,
				{
					'translate-x-0 opacity-100': index === at,
					'-translate-x-6 opacity-0': index === gone,
					'translate-x-6 opacity-0': index !== at && index !== gone
				}
			)}
		>{#if glyph}<GameGlyph
					name={glyph}
					classes="mr-1 [&>svg]:size-[0.85em]"
				/>{/if}{$_(`combat.orders.${action}`)} — {$_(`combat.guide.${action}`)}</p
		>
	{/each}
</div>
