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

<!-- The slot the song stands in: `min-w-0 flex-1` takes whatever the row it is given comes to,
	which is the box the title is measured against and nothing of the title's own doing. -->
<div class={classNames('flex min-w-0 flex-1 items-center', classes)}>
	{#if state.track}
		<!-- The song. A banner rather than a truncation (see MarqueeText): a name of a place can be
			recognised from its head, but a song on a radio is being announced and half an
			announcement is not one. It is lettered straight onto the plate in the plate's own ink,
			having no fill and no press of its own.
			`text-right`, which is the end of the plate the plate itself is held against and the
			end the play/pause square on the band below stands at: a short title left-aligned
			drifts away from the mark it belongs to and leaves the gap on the side the two are
			read from. It settles the still line only — a title too long for the plate is a
			running track as wide as it needs, and has no end to be put against. -->
		<MarqueeText
			text={state.track.title}
			classes="min-w-0 flex-1 text-right text-xs font-medium opacity-70"
		/>
	{/if}
</div>
