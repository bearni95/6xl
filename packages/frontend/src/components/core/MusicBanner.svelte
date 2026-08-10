<script lang="ts">
	import classNames from 'classnames';
	import MarqueeText from '$components/core/MarqueeText.svelte';
	import MusicGlyph, { musicPressLabel } from '$components/core/MusicGlyph.svelte';
	import { musicService } from '$services/music.service';

	// The radio: the play/pause and the song running past beside it, on a row of its own along the
	// map's bottom edge — half the map's width, centred, directly over the band that names the
	// open place.
	//
	// It has been the middle of the band across the top of the page, a third cell on that band
	// below it, and before either the last line of the pin the map stands on the open place. The
	// last two put it inside a reading about a town, and what is playing is not one: the map turns
	// the dial as the reader walks (see musicService.follow), so the song follows the map, but it
	// goes on playing across a walk from one town to the next and across every view opened over
	// the map. A row of its own says both of those at once — along the same edge as the place,
	// because the dial follows it, and not on the same row, because it is not a reading about it.
	// Always the same row at the same size, so it is read without being found first.
	//
	// The whole slot is the press. It was the 24px mark alone for a long time, under a rule
	// inherited from the pin — a title is a thing to read and a play/pause a thing to press, and a
	// surface that did both wherever it was struck would be two gestures on one — but this is a
	// block with exactly one thing to do, and a block like that is the thing to press. Which is
	// why the mark inside it is a mark and not a button (see MusicGlyph, which is that mark
	// wherever the radio is pressable): a button inside a button is not markup. MusicToggle is
	// still the shape for a play/pause standing among other controls.
	//
	// One line and not two, because the band is one row: the mark first, at the head of the line
	// the way a radio's own control is, and the title after it. It was a column — the title over
	// the mark — while it had a third of a band's width and nothing above or below it to keep in
	// step with; here it stands beside a name plate and two squares, and a second line would make
	// the row taller for every reader, sound or no sound.
	//
	// Nothing at all until there is a song — a press lettered with nothing is worse than no press,
	// and an empty slot says a radio is there and broken. The slot itself holds its room either
	// way, so the row it stands in keeps its height and the band under it never moves when the
	// music stops.

	export let classes: string = '';

	const music = musicService.state;

	$: state = $music;
</script>

<!-- The slot the radio stands in, held whether or not there is a radio to draw: `min-w-0 flex-1`
	takes whatever the row it is given comes to, and `justify-center` centres the banner in it. -->
<div class={classNames('flex min-w-0 flex-1 items-stretch justify-center', classes)}>
	{#if state.track}
		<!-- No fill of its own, which is what makes it the one thing on this band that is not a
			plate: the name and the two marks are the game's own furniture, drawn in the primary as
			a set, and the radio is a reading that changes under them. So it is lettered straight
			onto the band's surface in the band's own ink, and what marks it as pressable is that
			the whole of it is (see the `aria-label`).
			`self-stretch` so it is the height the row comes to rather than a height written down
			here, and capped at `max-w-xs` so a wide screen does not hand one song title the whole
			middle of the page — the cap is also what gives the banner a box that does not change
			with the length of the title in it (see MarqueeText, which needs one to know whether it
			is a banner or a still line). -->
		<button
			type="button"
			class="flex w-full min-w-0 max-w-xs cursor-pointer items-center gap-2 self-stretch rounded-lg px-3 text-base-content"
			aria-label={musicPressLabel(state.playing)}
			on:click={() => musicService.toggle()}
		>
			<!-- The mark, off the same store the press writes to: a triangle stopped, two bars
				running. First on the line and at the line's own size. The name of the press is on
				the button — this is the picture of it. -->
			<MusicGlyph playing={state.playing} classes="size-4 flex-none" />

			<!-- And the song. A banner rather than a truncation (see MarqueeText): a name of a
				place can be recognised from its head, but a song on a radio is being announced and
				half an announcement is not one. `min-w-0 flex-1` is the box it is measured against
				— the rest of the slot, with nothing of the title itself counting towards it. -->
			<MarqueeText
				text={state.track.title}
				classes="min-w-0 flex-1 text-left text-xs font-medium opacity-70"
			/>
		</button>
	{/if}
</div>
