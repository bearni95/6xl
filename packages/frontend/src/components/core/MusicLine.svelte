<script lang="ts">
	import classNames from 'classnames';
	import { onMount } from 'svelte';
	import MarqueeText from '$components/core/MarqueeText.svelte';
	import MusicGlyph from '$components/core/MusicGlyph.svelte';
	import { musicService } from '$services/music.service';
	import { showLogos, loadShowLogos } from '$services/shows.service';

	// What the radio is saying, in two lines: the show it is tuned to, and under it the song
	// itself behind the mark that says whether it is playing.
	//
	// The station first because it is the steadier of the two — a station holds while its songs
	// come and go — and because it is the wider statement: this is what you are listening to, and
	// then this is what is on. It is the order a radio announces itself in, and it is lettered
	// like one: the station is the bold line and the song is the plain one under it, a heading
	// over what is playing under it rather than a caption on it.
	//
	// A station *is* a show (see musicService), which is why the name above the song is the name
	// of a show and not a second kind of thing. It comes from the same read the dial names its
	// stations from (see StationDial), so the two never letter one station differently. A show
	// with no name to be had is left off rather than lettered with its id: this plate is not a
	// chooser, and an id here would be noise where the dial needs it to tell two options apart.
	//
	// This was the second line of the row naming the open place, back when it said only the song
	// and the show was said by the tile beside it. It is the whole of the plate in the middle of
	// the band across the top of the page now (see MusicBanner), where nothing else names the
	// show, so the radio says its own station again.
	//
	// Its own component still, because the line and the press are two different objects: the
	// plate decides that there is a radio to draw at all and what pressing it is called, and this
	// is what a radio playing looks like. The glyph is the one the standalone control wears and
	// turns over on the same store, so the triangle and the two bars are never two different
	// answers about one radio.
	//
	// A banner rather than a truncation for the title (see MarqueeText): a song is whatever the
	// record is called, and the box it stands in is a fixed width. The station above it truncates,
	// as every name of a place or a show in this game does — a show can be recognised from its
	// head.
	//
	// Nothing is drawn until there is a song. The plate around it says the same thing (it has its
	// room to withhold), and this says it on its own account because a line with no song in it is
	// a glyph beside an empty box.

	/** Anything more the caller wants on the lines — the box they are measured in, above all. The
		ink is spelled here rather than passed in, since this reads as one thing wherever it
		stands. */
	export let classes: string = '';

	// The names on the dial, which is where the station's own comes from too. Idempotent: every
	// mount shares the one fetch.
	onMount(() => void loadShowLogos());

	const music = musicService.state;

	$: state = $music;
	$: stationName =
		state.track?.showId != null ? ($showLogos.get(state.track.showId)?.name ?? null) : null;
</script>

<!-- Spans throughout: this stands inside a button, whose content model is phrasing only. -->
{#if state.track}
	<span class={classNames('flex min-w-0 flex-col text-left leading-tight', classes)}>
		{#if stationName}
			<!-- The station in bold, at the smaller of the two sizes: it is a heading over the
				song rather than a line beside it, and a heading is said by weight — which leaves
				size free to say which of the two is the longer read. -->
			<span class="truncate text-xs font-bold opacity-70">{stationName}</span>
		{/if}

		<span class="flex min-w-0 items-center gap-1 text-sm font-medium">
			<MusicGlyph playing={state.playing} classes="size-4 flex-none" />
			<!-- `min-w-0` is what lets the banner be narrower than its line, and `flex-1` is what
				gives it the rest of the line: together they are the box the title is measured
				against. -->
			<MarqueeText text={state.track.title} classes="min-w-0 flex-1" />
		</span>
	</span>
{/if}
