<script lang="ts">
	import classNames from 'classnames';
	import { fade } from 'svelte/transition';
	import { narration } from '$services/narration.service';
	import { pickNarrationLine, type CombatNarrationCue } from '$types/combat-narration.type';

	/**
	 * What the fight is saying about the encounter being played out, laid over the player's
	 * panel — **one sentence per row of the board**, and no more than that.
	 *
	 * The board draws no word over any fighter — a callout at the reveal gives the turn away
	 * and a callout after the fact only letters a picture that has just been drawn (see the
	 * controller's `showOrders`) — so the words stand somewhere else entirely: here, on the
	 * one plate the player is already reading the fight off. A row's line goes up as the blow
	 * settles it and stands through the fall, the ground changing hands and the beat after
	 * it, until the next row has something of its own to say.
	 *
	 * It words nothing itself. The fight hands over a cue — how the encounter went, and the
	 * two fighters it was between — and the sentence is one of the authored lines for that
	 * event, filled in ({@link pickNarrationLine}), from the collection the admin
	 * `/narration` screen writes. Which of them is seeded off the cue, so the words hold
	 * still for as long as the cue does rather than re-rolling on every render.
	 *
	 * Nothing at all is drawn when there is no cue or the event has no line authored for it:
	 * between turns the panel is the player's to plan on, and a plate that stayed up empty
	 * would be a caption box with nothing in it standing over the orders.
	 */
	export let cue: CombatNarrationCue | null = null;
	export let classes: string = '';

	// Subscribing is what fetches the collection (see the service), so the arena never has
	// to ask for it: the surface that draws narration is the one that wants it.
	$: line = pickNarrationLine($narration, cue);
</script>

{#if line}
	<!-- Read out as it changes as well as drawn: the narration is the one part of a turn
	     that is words, so it is what a screen reader can follow the fight by. Polite, because
	     it arrives beat after beat and must not cut across whatever is being read.
	     It takes no pointer — it is laid over a panel that is pressed, and a caption is a
	     reading, not a surface. -->
	<div
		class={classNames('pointer-events-none z-20 flex justify-center', classes)}
		role="status"
		aria-live="polite"
	>
		{#key line}
			<!-- Keyed on the line so each new one is faded in over the plate rather than
			     swapped in the same box: a turn is a run of these, and text that simply
			     changed under the eye read as one caption stuttering. -->
			<p
				class="max-w-md rounded-box bg-base-100/90 px-3 py-2 text-center text-xl font-medium text-balance shadow-lg"
				in:fade={{ duration: 150 }}
			>
				{line}
			</p>
		{/key}
	</div>
{/if}
