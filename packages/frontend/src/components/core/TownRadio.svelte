<script lang="ts">
	import classNames from 'classnames';
	import MarqueeText from '$components/core/MarqueeText.svelte';
	import MusicToggle from '$components/core/MusicToggle.svelte';
	import { musicService } from '$services/music.service';

	// The radio: the song running past at the width of whatever it is laid on, and the play/pause
	// held at the far end of it. It is the first row of the plate on the map's own bottom edge —
	// above the row that names the open place and offers the ways of acting on it.
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
	// The song is a line and the press is a button beside it, rather than the whole row being one
	// press. That began as a rule about the pin — the plate under a mark is already a thing that
	// is clicked — and it survives the move for its own sake: a title is a thing to read and a
	// play/pause is a thing to press, and a band that did both wherever it was struck would be
	// two gestures on one surface. There is no guard on any of it any more; a row laid over the
	// map rather than mounted into a Leaflet marker was never terrain to begin with.
	//
	// Nothing at all until there is a song — a plate with an empty band across its top says a
	// radio is there and broken. Both halves withhold themselves on the same store, so the row
	// never comes out as a button with no line or a line with no button.

	export let classes: string = '';

	const music = musicService.state;

	$: state = $music;
</script>

{#if state.track}
	<div class={classNames('flex items-center gap-2', classes)}>
		<!-- The song, lettered exactly as the show under a place's name is — a title is the same
			kind of thing on this surface as the station it came off. A banner rather than a
			truncation (see MarqueeText): the plate is a settled width and a song is whatever the
			record is called. `min-w-0 flex-1` is the box it is measured against, and what leaves
			the button its own room. -->
		<MarqueeText
			text={state.track.title}
			classes="min-w-0 flex-1 text-xs font-medium text-white/70"
		/>

		<!-- And the press at the far end, on the same store: a ghost circle, as it is on the
			menu's plate, since a filled button would be the loudest thing on a plate that is
			mostly about where you are standing. -->
		<div class="flex-none">
			<MusicToggle classes="btn btn-circle btn-ghost btn-xs" iconClasses="size-3" />
		</div>
	</div>
{/if}
