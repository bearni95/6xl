<script lang="ts">
	import classNames from 'classnames';
	import MarqueeText from '$components/core/MarqueeText.svelte';
	import MusicToggle from '$components/core/MusicToggle.svelte';
	import { musicService } from '$services/music.service';

	// The radio, on the mark standing on the place it is playing for: the last line of the pin's
	// plate, the song running past at the width of the plate and the play/pause held at the far
	// end of it.
	//
	// It is on the pin because that is where the station is already said. A station is a show and
	// the map tunes the radio to the show the open place flies (see musicService.follow), and the
	// pin's own second line is that show, on a tile in that place's colour — so the plate already
	// carries everything about the radio except what is on and whether it is running, which is
	// what this adds. Anywhere else the radio has stood it had to letter its own station to be
	// read at all.
	//
	// The song is a line and the press is a button beside it, rather than the whole row being one
	// press: the plate under the pin is already a thing that is clicked (it opens the region), so
	// a row on it that meant something else pressed anywhere would be two gestures on one surface.
	// A button at the end of the line is the mark that says which part of it acts.
	//
	// Nothing at all until there is a song — a plate with an empty band across its foot says a
	// radio is there and broken. Both halves withhold themselves on the same store, so the row
	// never comes out as a button with no line or a line with no button.

	export let classes: string = '';

	const music = musicService.state;

	$: state = $music;
</script>

{#if state.track}
	<div class={classNames('flex items-center gap-2', classes)}>
		<!-- The song, lettered exactly as the plate's own second line is — a title is the same
			kind of thing on this surface as the show under the place's name. A banner rather than
			a truncation (see MarqueeText): a plate is a fixed width and a song is whatever the
			record is called. `min-w-0 flex-1` is the box it is measured against, and what leaves
			the button its own room. -->
		<MarqueeText
			text={state.track.title}
			classes="min-w-0 flex-1 text-xs font-medium text-white/70"
		/>

		<!-- And the press at the far end, on the same store: a ghost circle, as it is on the
			menu's plate, since a filled button would be the loudest thing on a mark that is about
			a town. -->
		<MusicToggle classes="btn btn-circle btn-ghost btn-xs flex-none" iconClasses="size-3" />
	</div>
{/if}
