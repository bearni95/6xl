<script lang="ts">
	import classNames from 'classnames';
	import { onMount } from 'svelte';
	import MusicToggle from '$components/core/MusicToggle.svelte';
	import ShowIcon from '$components/core/ShowIcon.svelte';
	import StationDial from '$components/core/StationDial.svelte';
	import { musicService } from '$services/music.service';
	import { forShow } from '$utils/show/show-icon';
	import { showGlyphs } from '$services/shows.service';

	// The radio, whole: one plate in the burger menu with the three things a listener
	// needs — what is on air, a play/pause, and the dial that picks the station.
	//
	// It stood in the map's top-left corner, which is a corner of the map: a plate that
	// is always up is a plate that is always in the way, and the one thing on it a
	// player reaches for often is the pause — which is on the plate at the map's bottom edge
	// now, at the end of the line naming the song (see TownRadio). What is left
	// here is what is only wanted when it is wanted: which station, and what is on it. The
	// menu is where everything that is not the map already lives.
	//
	// It is also the only place left that offers the dial by hand. The map turns it by
	// itself as the reader moves (see musicService.follow), which is the whole of what
	// most listening to this radio is; a listener who wants to hear something other than
	// where they are standing comes here for it.
	//
	// A station is a show, and what is playing on it is decided by the clock rather
	// than by this plate: the song and the second of it come from musicService, which
	// folds the time of day into the show's day order (see there). So there is no step
	// to the next song here — a listener picks another station, they do not skip what a
	// station is playing.
	//
	// The dial is the second line rather than a control beside it, because that line
	// was already naming the show: on a radio the station's name and the way to change
	// it are one thing, and the plate has no room to say it twice (see StationDial).
	//
	// It is a base-100 plate with a border, not the black one it was over the terrain:
	// black was for being read off satellite imagery, and inside the menu there is no
	// terrain to be read off — the surface it stands on is the page's own, and the block
	// of buttons above it is bordered base-100 for the same reason.
	//
	// No state of its own: what is on air, whether it is running and which station it
	// is on belong to musicService, which owns the audio element so that the sound
	// outlives anything that happens on screen, and which reads the authored
	// collection itself.

	export let classes: string = '';

	// The songs (@3xl/data's music.json, by way of the service). Asked for here because
	// the menu is a place that can be opened before anything else has; it is one shared
	// fetch either way. A failed read leaves no song loaded, and the plate is then not
	// drawn at all rather than standing there empty. The shows the dial is named from are
	// its own read now (see StationDial).
	onMount(() => void musicService.load().catch(() => undefined));

	const music = musicService.state;

	$: state = $music;
	$: showIcon = forShow($showGlyphs, state.track?.showId);
</script>

{#if state.track}
	<div
		class={classNames(
			'flex items-center gap-2 rounded-lg border border-base-300 bg-base-100 p-2 text-base-content',
			classes
		)}
	>
		<!-- The show the song opens, on the same 40px tile at the same 28px glyph the town
			panel and the pins draw. Decorative: the show is named in the line beside it. -->
		{#if showIcon}
			<div
				class="flex size-10 flex-none items-center justify-center rounded-lg bg-base-200 text-base-content"
				aria-hidden="true"
			>
				<ShowIcon markup={showIcon} classes="[&>svg]:size-7" />
			</div>
		{/if}

		<!-- `min-w-0` is what lets a long title truncate instead of widening the plate. -->
		<div class="flex min-w-0 flex-1 flex-col text-left leading-tight">
			<span class="truncate text-sm font-semibold">{state.track.title}</span>
			<StationDial classes="text-xs font-medium text-base-content/70" />
		</div>

		<!-- The same button as the one at the end of the pin's radio line, and the same store
			behind it: a ghost circle in both places, because this plate is a quiet object
			among the menu's outlined ones and a mark on a pin is about a town. -->
		<MusicToggle classes="btn btn-circle btn-ghost btn-sm flex-none" />
	</div>
{/if}
