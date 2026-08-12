<script lang="ts">
	import classNames from 'classnames';
	import { onDestroy } from 'svelte';
	import { narration } from '$services/narration.service';
	import { pickNarrationSegments, type CombatNarrationCue } from '$types/combat-narration.type';
	import { typewriterParts, typewriterWords } from '$utils/string/typewriter';
	import { SPAWN_INK_CLASSES } from '$components/core/spawn-colors';
	import type { SpawnColor } from '$types/character-spawn.type';

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
	 * event, cut into its runs ({@link pickNarrationSegments}), from the collection the admin
	 * `/narration` screen writes. Which of them is seeded off the cue, so the words hold
	 * still for as long as the cue does rather than re-rolling on every render.
	 *
	 * **A name is lettered in the colour its fighter fights in**, which the cue carries beside
	 * it. A line is about two fighters and names them a few words apart, and in one ink the
	 * reader has to work out which of the two on the board each name is — where the board has
	 * already said it, in the aura at that fighter's feet and the sparks off its blows. Same
	 * six swatches as those (`SPAWN_INK_CLASSES`), so the name and the figure are the one
	 * colour. A cue that carries none is lettered in the plate's own ink.
	 *
	 * **And it is typed out, a word at a time.** A sentence that arrived whole was read as one
	 * shape and often not read at all, since it landed on the very beat the eye was on the
	 * board for; typed, it is a thing happening on the panel and the reader is walked through
	 * it at reading pace. Every word of the line is drawn from the first frame and the ones
	 * not yet reached are merely invisible ({@link revealed}), so the plate is its final size
	 * from the start — text growing into a centred, balanced box would re-wrap under the eye
	 * on every word.
	 *
	 * Nothing at all is drawn when there is no cue or the event has no line authored for it:
	 * between turns the panel is the player's to plan on, and a plate that stayed up empty
	 * would be a caption box with nothing in it standing over the orders.
	 */
	export let cue: CombatNarrationCue | null = null;
	export let classes: string = '';

	/**
	 * How long one word stands before the next joins it.
	 *
	 * The whole sentence has to be typed well inside the beat its encounter is played out
	 * over — the shortest of those is a lane where nothing was thrown, which the controller
	 * holds for `QUIET_LANE_MS` — so this is fast: a dozen words land in about half a second,
	 * which reads as writing rather than as waiting.
	 */
	const WORD_MS = 45;

	// Subscribing is what fetches the collection (see the service), so the arena never has
	// to ask for it: the surface that draws narration is the one that wants it.
	$: segments = pickNarrationSegments($narration, cue);
	$: parts = segments ? typewriterParts(segments) : [];
	$: words = typewriterWords(parts);
	// The sentence itself, which is what a screen reader is given: a line read out word by
	// word as it was typed would be the same sentence announced a dozen times.
	$: line = parts.map((part) => part.text).join('');

	/** How many words of it are up. Every word is drawn; this is where the ink stops. */
	let revealed = 0;
	let typing: ReturnType<typeof setInterval> | null = null;

	// Retyped whenever the words change, and only then — the line is a pure function of the
	// cue, so this fires once per encounter rather than on every store write the turn makes.
	$: type(line, words);

	function type(text: string, count: number): void {
		stop();
		revealed = text ? 0 : count;
		if (!text) return;
		typing = setInterval(() => {
			revealed += 1;
			if (revealed >= count) stop();
		}, WORD_MS);
	}

	function stop(): void {
		if (typing !== null) clearInterval(typing);
		typing = null;
	}

	onDestroy(stop);
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
		<p
			class="max-w-md rounded-box bg-base-100/90 px-3 py-2 text-center text-xl font-medium text-balance shadow-lg"
		>
			{#each parts as part, index (index)}
				<!-- A word not yet typed is drawn and not inked, so it holds its own room: the
				     box is the size of the finished sentence from the first word on. The gaps
				     between words are never hidden — there is nothing to see either way, and a
				     space that came and went would move the words that were already up. -->
				<span
					class={classNames(
						'transition-opacity duration-100',
						part.color ? SPAWN_INK_CLASSES[part.color as SpawnColor] : undefined,
						{ 'opacity-0': part.word && part.index >= revealed }
					)}>{part.text}</span
				>
			{/each}
		</p>
	</div>
{/if}
