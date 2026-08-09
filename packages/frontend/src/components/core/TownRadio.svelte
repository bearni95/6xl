<script lang="ts">
	import classNames from 'classnames';
	import MarqueeText from '$components/core/MarqueeText.svelte';
	import MusicToggle from '$components/core/MusicToggle.svelte';
	import { musicService } from '$services/music.service';

	// The radio: the song running past at the width of whatever it is laid on, and the play/pause
	// under it. It is the second cell of the band on the map's own bottom edge — beside the cell
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
	// The song is a line and the press is a button of its own, rather than the whole of this being
	// one press. That began as a rule about the pin — the plate under a mark is already a thing
	// that is clicked — and it survives the move for its own sake: a title is a thing to read and
	// a play/pause is a thing to press, and a surface that did both wherever it was struck would
	// be two gestures on one. There is no guard on any of it any more; a row laid over the map
	// rather than mounted into a Leaflet marker was never terrain to begin with.
	//
	// The two are stacked and not side by side, because the cell they share is half a band rather
	// than the whole of one: a title given half a width and then asked to leave room for a button
	// at the end of it is a banner running in a slot, and the banner is what the title is for. So
	// the line takes the cell's full width and the press stands under its head, which also puts
	// the mark at the same end of the cell as the line starts from.
	//
	// Nothing at all until there is a song — an empty half of a band says a radio is there and
	// broken. Both halves withhold themselves on the same store, so this never comes out as a
	// button with no line or a line with no button. Drawing nothing is also what hands the band
	// back its whole width: the cells are the children there are (see the band's `grid-flow-col`),
	// so a silent radio is one cell and not two with a hole in it.

	export let classes: string = '';

	const music = musicService.state;

	$: state = $music;
</script>

{#if state.track}
	<div class={classNames('flex min-w-0 flex-col items-start gap-1', classes)}>
		<!-- The song, lettered exactly as the show under a place's name is — a title is the same
			kind of thing on this surface as the station it came off. A banner rather than a
			truncation (see MarqueeText): the cell is a settled width and a song is whatever the
			record is called. `w-full min-w-0` is the box it is measured against — the cell's own
			width, whatever the band gave it, with nothing of the title counting towards that. -->
		<MarqueeText
			text={state.track.title}
			classes="w-full min-w-0 text-xs font-medium text-white/70"
		/>

		<!-- And the press under it, on the same store: a ghost circle, as it is on the menu's
			plate, since a filled button would be the loudest thing on a band that is mostly about
			where you are standing. `items-start` on the column is what keeps it the size of a
			button rather than the width of a line. -->
		<MusicToggle classes="btn btn-circle btn-ghost btn-xs" iconClasses="size-3" />
	</div>
{/if}
