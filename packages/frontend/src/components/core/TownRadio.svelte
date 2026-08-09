<script lang="ts">
	import classNames from 'classnames';
	import MarqueeText from '$components/core/MarqueeText.svelte';
	import MusicGlyph, { musicPressLabel } from '$components/core/MusicGlyph.svelte';
	import { musicService } from '$services/music.service';

	// The radio: the song running past at the width of whatever it is laid on, and the play/pause
	// under it. It is the last cell of the band on the map's own bottom edge — beside the cell
	// that names the open place and offers the way up out of it, not above it.
	//
	// It was the last line of the pin the map stands on that same place, and what put it there
	// was that the station is already said on a pin: a station is a show, the map tunes the radio
	// to the show the open place flies (see musicService.follow), and the pin's second line is
	// that show on a tile in the place's colour — so the plate carried everything about the radio
	// except what is on and whether it is running. The row it is on now says the station just as
	// well, being lettered with the same crumb out of the same fields (see RegionCurrentBadge),
	// and it says it from a corner that does not move: a pin stands where its town is, so the
	// radio went wherever the map was panned and was as small as a caption on a mark.
	//
	// The whole cell is the press. It was the mark alone for a long time, under a rule inherited
	// from the pin — a title is a thing to read and a play/pause a thing to press, and a surface
	// that did both wherever it was struck would be two gestures on one — but the surface in
	// question is a third of a band with one control on it and nothing else it could mean, so
	// what the rule was buying was a 24px target where a whole cell was going spare. It is the
	// reading that already made the row naming the open place its own press (see RegionListRow's
	// `pressHead`): where a block has exactly one thing to do, the block is the thing to press.
	//
	// Which is why the mark is a mark here and not a button (see MusicGlyph, which is that mark
	// wherever the radio is pressable): a button inside a button is not markup. It keeps the round
	// ghost surface it wore, so nothing about it looks different — it is simply no longer the only
	// part of the cell that answers. MusicToggle is still the shape for a play/pause standing
	// among other controls, which is what the menu's plate is.
	//
	// The two are stacked and not side by side, because the cell they share is the last third of
	// a band rather than the whole of one: a title given a third of a width and then asked to
	// leave room for a mark at the end of it is a banner running in a slot, and the banner is
	// what the title is for. So the line takes the cell's full width and the mark stands under
	// its head, which also puts it at the same end of the cell as the line starts from.
	//
	// Nothing at all until there is a song — an empty cell says a radio is there and broken. Both
	// halves withhold themselves on the same store, so this never comes out as a press with no
	// line or a line with no mark. The band does not close up around the absence: its columns
	// are counted out and the place spans two of them either way, so a reader who turns the sound
	// off does not find the name of where they are standing a different size afterwards.

	export let classes: string = '';

	const music = musicService.state;

	$: state = $music;
</script>

{#if state.track}
	<!-- `w-full` and `text-left`, because a button's own instinct is to be as wide as what is in
		it and to centre that: what this one is is a cell, and a cell is the width its column was
		given and reads from the same edge the place's name in the cell beside it does. -->
	<button
		type="button"
		class={classNames('flex w-full min-w-0 flex-col items-start gap-1 text-left', classes)}
		aria-label={musicPressLabel(state.playing)}
		on:click={() => musicService.toggle()}
	>
		<!-- The song, lettered exactly as the show under a place's name is — a title is the same
			kind of thing on this surface as the station it came off. A banner rather than a
			truncation (see MarqueeText): the cell is a settled width and a song is whatever the
			record is called. `w-full min-w-0` is the box it is measured against — the cell's own
			width, whatever the band gave it, with nothing of the title counting towards that. -->
		<MarqueeText
			text={state.track.title}
			classes="w-full min-w-0 text-xs font-medium text-white/70"
		/>

		<!-- And the mark under it, off the same store the press writes to: a triangle stopped, two
			bars running. A ghost circle, as it is on the menu's plate, since a filled control would
			be the loudest thing on a band that is mostly about where you are standing.
			`items-start` on the column keeps it the size of a mark rather than the width of a line;
			`pointer-events-none` so the press is the cell's and a hover is not read as being over
			some smaller thing inside it. The name of the press is on the button — this is the
			picture of it, and `aria-hidden` because it says the same thing a second time. -->
		<span class="btn btn-circle btn-ghost btn-xs pointer-events-none" aria-hidden="true">
			<MusicGlyph playing={state.playing} classes="size-3" />
		</span>
	</button>
{/if}
