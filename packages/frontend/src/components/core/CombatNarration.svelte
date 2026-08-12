<script lang="ts">
	import classNames from 'classnames';
	import { createEventDispatcher, onDestroy } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { narration } from '$services/narration.service';
	import { pickNarrationSegments, type CombatNarrationCue } from '$types/combat-narration.type';
	import { typewriterParts, typewriterWords } from '$utils/string/typewriter';
	import { orderGlyph } from '$utils/color/traits';
	import { SPAWN_INK_CLASSES } from '$components/core/spawn-colors';
	import GameGlyph from '$components/core/GameGlyph.svelte';
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
	 * **And each name wears the mark of the order that fighter made**, which the cue carries
	 * too: the very glyph the order was given with on the board (`ORDER_ICONS` — a sword, a
	 * shield, the gathering energy), inlined ahead of the name so it takes that name's own ink
	 * and its own size. The sentence says how the row went and the marks say what the two of
	 * them did to make it go that way — which is the one thing the words leave to be worked
	 * out, a line about a blow turned aside never saying whether the fighter was covering or
	 * was handed the guard by its colour. Drawn once per name however many words the name runs
	 * to (the run's `lead`), and hidden with the word it stands on, so a mark never arrives
	 * ahead of the fighter it belongs to. An order there is no glyph for draws nothing: the
	 * name is simply unmarked, exactly as every name was before there were marks.
	 *
	 * **And it is typed out, a word at a time.** A sentence that arrived whole was read as one
	 * shape and often not read at all, since it landed on the very beat the eye was on the
	 * board for; typed, it is a thing happening on the panel and the reader is walked through
	 * it at reading pace. Every word of the line is drawn from the first frame and the ones
	 * not yet reached are merely invisible ({@link revealed}), so the plate is its final size
	 * from the start — text growing into a centred, balanced box would re-wrap under the eye
	 * on every word.
	 *
	 * No line is drawn when there is no cue or the event has no line authored for it: between
	 * turns the panel is the player's to plan on, and a plate that stayed up empty would be a
	 * caption box with nothing in it standing over the orders.
	 *
	 * **The way on from the encounter is here too** — the one control on this plate, and the
	 * whole reason it is not `pointer-events-none` throughout. A turn no longer plays itself
	 * out on a timer: each row stops when it is done and waits to be pressed on from (the
	 * controller's `next`), so the button is drawn from the moment the row starts being played
	 * — greyed, saying what carries the reader on before they need it, and standing in room the
	 * plate already holds so nothing moves when it comes alive — and it is pressable only once
	 * **both** halves of the encounter are finished: the canvas, which is `awaiting`, and the
	 * words, which is this component's own typing. Either one alone would be a fight that could
	 * be skipped past the half of it the player was still reading or watching.
	 *
	 * It is drawn for a silent encounter as well, which is the one case where the line is not
	 * what the button waits for: an event nobody has authored a line for still stops the fight,
	 * and a hold with nothing on screen to release it would be a fight that could not be
	 * carried on at all.
	 */
	export let cue: CombatNarrationCue | null = null;
	/** The fight is standing at the end of this encounter with everything shown, waiting to be
	 * let on (`CombatState.awaiting`). */
	export let awaiting: boolean = false;
	/** A turn is being played out, so a press is what carries it on. What the button is drawn
	 * off, as against `awaiting`, which is what makes it pressable. */
	export let playing: boolean = false;
	export let classes: string = '';

	const dispatch = createEventDispatcher<{ next: void }>();

	/**
	 * How long one word stands before the next joins it.
	 *
	 * Fast — a dozen words land in about half a second, which reads as writing rather than as
	 * waiting. The fight is held at the reader's own pace now, so nothing is lost by a line
	 * that is still being typed when the canvas falls quiet; what a slow one would cost is the
	 * press, which cannot be answered until the sentence is on the plate whole.
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

	/** Whether the sentence is on the plate whole. True where there is nothing to type, which
	 * is a silent encounter: the words cannot be what such a row is waited on for. */
	$: typed = revealed >= words;
	/** The press is answered only where the canvas is finished *and* the words are. */
	$: pressable = awaiting && typed;
</script>

{#if line || playing || awaiting}
	<!-- The plate takes no pointer — it is laid over a panel that is pressed, and a caption
	     is a reading, not a surface. The one thing in it that *is* pressed takes its own
	     back. -->
	<div class={classNames('pointer-events-none z-20 flex flex-col items-center gap-2', classes)}>
		{#if line}
			<!-- Read out as it changes as well as drawn: the narration is the one part of a turn
			     that is words, so it is what a screen reader can follow the fight by. Polite,
			     because it arrives beat after beat and must not cut across whatever is being
			     read. The live region is the sentence itself and not the box around it, so the
			     button coming alive under it is not a change to be read out. -->
			<p
				class="max-w-md rounded-box bg-base-100/90 px-3 py-2 text-center text-xl font-medium text-balance shadow-lg"
				role="status"
				aria-live="polite"
			>
				{#each parts as part, index (index)}
					<!-- The order's mark, on the first word of the name it belongs to and nowhere
					     else. Inside that word's own span rather than beside it, so it is carried by
					     the same ink and the same reveal — and so nothing can put a line break
					     between a fighter and its mark. -->
					{@const mark = part.lead && part.move ? orderGlyph(part.move) : null}
					<!-- A word not yet typed is drawn and not inked, so it holds its own room: the
					     box is the size of the finished sentence from the first word on. The gaps
					     between words are never hidden — there is nothing to see either way, and a
					     space that came and went would move the words that were already up. -->
					<span
						class={classNames(
							'transition-opacity duration-100',
							part.color ? SPAWN_INK_CLASSES[part.color as SpawnColor] : undefined,
							{ 'opacity-0': part.word && part.index >= revealed }
						)}>{#if mark}<GameGlyph
								name={mark}
								classes="mr-1 [&>svg]:size-[0.85em]"
							/>{/if}{part.text}</span
					>
				{/each}
			</p>
		{/if}
		{#if playing || awaiting}
			<!-- The way on. It stands from the moment the row starts being played and is dead
			     until the row is over on both counts, rather than appearing when it comes alive:
			     a button that arrived at the moment it became pressable would move the line above
			     it just as the reader reached the end of it, and would leave the player with
			     nothing on screen saying what a stopped fight is waiting for.
			     Only while a turn is being played out, which is the whole of when a press means
			     anything: the line that decided a fight stands after it is over, and a way on
			     from a fight that has ended leads nowhere. -->
			<button
				type="button"
				class="btn pointer-events-auto btn-sm btn-primary"
				disabled={!pressable}
				on:click={() => dispatch('next')}
			>
				{$_('combat.next')}
			</button>
		{/if}
	</div>
{/if}
