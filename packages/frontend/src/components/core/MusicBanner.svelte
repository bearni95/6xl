<script lang="ts">
	import classNames from 'classnames';
	import MarqueeText from '$components/core/MarqueeText.svelte';
	import { musicService } from '$services/music.service';

	// What is playing, said and not pressed: the song running past on a row of its own along the
	// map's bottom edge — three fifths of the map's width, held against its right end, directly
	// over the band that names the open place.
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
	// The play/pause is no longer in here. The whole slot was the press for a while, with the mark
	// at the head of the line and the title after it — a block with exactly one thing to do being
	// the thing to press — and the control is a square at the far end of the band below now (see
	// MusicToggle, and the band): a play/pause is a button, and a reader looking for one looks for
	// a button rather than for a line of text that happens to answer. So this is a reading again,
	// which is all it ever looked like. Same store either way, so the title and the mark under it
	// are never two answers to what is on.
	//
	// One line, because the row is one row: the title and nothing else. Nothing at all until there
	// is a song — an empty banner says a radio is there and broken — and the row it stands in
	// closes up with it, the band under it being anchored to the map's edge and so never moved by
	// what happens above it.

	export let classes: string = '';

	const music = musicService.state;

	$: state = $music;
</script>

<!-- The slot the song stands in. It takes no share of anything and asks for none: the plate
	around it is as narrow as what is in it and capped at half the viewport (see +page.svelte's
	radio row), so the width flows from the title outward and is stopped by the cap rather than
	handed down from a row. Which is why there is no `flex-1` here — a slot that grew to fill its
	parent, in a parent measuring itself by that slot, is the width asking itself. `min-w-0` so
	the cap can make it narrower than the line it holds, which is the moment the banner starts
	running. -->
<div class={classNames('flex min-w-0 items-center', classes)}>
	{#if state.track}
		<!-- The song. A banner rather than a truncation (see MarqueeText): a name of a place can be
			recognised from its head, but a song on a radio is being announced and half an
			announcement is not one. It is lettered straight onto the plate in the plate's own ink,
			having no fill and no press of its own.
			`text-right`, which is the end of the plate the plate itself is held against and the
			end the play/pause square on the band below stands at. It decides nothing while the
			plate is the width of the line — a box with no slack in it has no end to put a line
			against — and it decides nothing at the cap either, where the line is a running track
			wider than the box. It is kept for the hair of slack sub-pixel layout can leave at the
			cap, and because it is the answer this plate should give if it is ever handed a width
			again: the anchored end is the one the reading is set against. -->
		<MarqueeText
			text={state.track.title}
			classes="min-w-0 text-right text-xs font-medium opacity-70"
		/>
	{/if}
</div>
