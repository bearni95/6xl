<script lang="ts">
	import classNames from 'classnames';
	import MarqueeText from '$components/core/MarqueeText.svelte';
	import MusicGlyph from '$components/core/MusicGlyph.svelte';
	import { musicService } from '$services/music.service';

	// What is playing, behind the mark that says whether it is playing: the radio said in one
	// line of text.
	//
	// It was the second line of the row naming the open place — the show that place flies where
	// there was no song, the song where there was one, a station being a show — and it is the
	// whole of the plate in the middle of the band across the top of the page now (see
	// MusicBanner). So the show is not something this line ever says any more: it is said where
	// the map says a show first, on the tile at the head of the row that names the place.
	//
	// Its own component still, because the line and the press are two different objects: the
	// plate decides that there is a radio to draw at all and what pressing it is called, and this
	// is what a radio playing looks like. The glyph is the one the standalone control wears and
	// turns over on the same store, so the triangle and the two bars are never two different
	// answers about one radio.
	//
	// A banner rather than a truncation for the title (see MarqueeText): a song is whatever the
	// record is called, and a plate is a fixed width.
	//
	// Nothing is drawn until there is a song. The plate around it says the same thing (it has a
	// fill and a border to withhold), and this says it on its own account because a line with no
	// song in it is a glyph beside an empty box.

	/** Anything more the caller wants on the line — the box it is measured in, above all. The ink
		is spelled here rather than passed in, since this reads as one line wherever it stands. */
	export let classes: string = '';

	const LINE = 'text-xs font-medium opacity-70';

	const music = musicService.state;

	$: state = $music;
</script>

<!-- Spans throughout: this stands inside a button, whose content model is phrasing only. -->
{#if state.track}
	<span class={classNames('flex min-w-0 items-center gap-1', LINE, classes)}>
		<MusicGlyph playing={state.playing} classes="size-3 flex-none" />
		<!-- `min-w-0` is what lets the banner be narrower than its line, and `flex-1` is what
			gives it the rest of the line: together they are the box the title is measured
			against. -->
		<MarqueeText text={state.track.title} classes="min-w-0 flex-1" />
	</span>
{/if}
