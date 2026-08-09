<script lang="ts">
	import classNames from 'classnames';
	import { onMount } from 'svelte';
	import { musicPressLabel } from '$components/core/MusicGlyph.svelte';
	import MusicLine from '$components/core/MusicLine.svelte';
	import { musicService } from '$services/music.service';

	// The radio on the map, whole: the middle of the band across the top of the page, between the
	// way back up out of the open place and the two marks that answer for the game.
	//
	// It was the second line of the row naming the open place — the mark and the song lettered
	// under a town's name, the row itself being the press (see MusicLine, RegionCurrentBadge) —
	// which put the radio wherever that row happened to be standing, and that row is about the
	// place. What is playing is not: the map turns the dial as the reader walks (see
	// musicService.follow), so the song moves with the map, but the control belongs to the game's
	// own furniture rather than to whichever block is naming a town this minute. On the band it
	// stands among the things that are true at every tier and on every screen.
	//
	// The line it letters is the one it always was — the mark that says whether the radio is
	// running, and the title running past behind it — pressed for the one thing a radio with no
	// skip has to be pressed for. What changed is that the press is a button of its own now: on
	// the row it could not be one, a button not holding a button, and the row itself had to be it.
	//
	// A plate rather than a square, because the two ends of that band carry one glyph each and
	// this carries a line of running text. It takes the middle of the row and is capped, so the
	// title is measured against a box that does not change with the length of a town's name (see
	// MarqueeText, which needs a box to know whether it is a banner or a still line).
	//
	// It draws nothing at all until there is a song — a plate lettered with nothing is worse than
	// no plate — and the middle of the band is simply empty until then, the far marks being held
	// where they are by this slot either way.
	//
	// No state of its own: musicService owns the audio element and the clock, and the name for
	// pressing it comes from where every copy of the control takes it (see MusicGlyph).

	export let classes: string = '';

	// The songs (@3xl/data's music.json, by way of the service), asked for here: this is up on
	// every visit while the menu's plate is mounted only while the drawer is open, so it is the
	// map's copy of the radio that gets the collection loaded at all. Idempotent — every mount
	// shares the one fetch. A failed read leaves no song loaded and no plate drawn.
	onMount(() => void musicService.load().catch(() => undefined));

	const music = musicService.state;

	$: state = $music;
</script>

<!-- The slot the plate stands in, held whether or not there is a plate: `flex-1 min-w-0` is what
	takes the room between the two ends of the band, and what keeps the far marks against the far
	edge without a margin of their own (see +page.svelte's band). `justify-center` centres the
	plate in what is left between those ends. -->
<div class={classNames('flex min-w-0 flex-1 items-stretch justify-center', classes)}>
	{#if state.track}
		<!-- The band's own furniture: the primary fill, the same corner and the same shadow the
			name's plate and the two marks wear, `self-stretch` so it is the height the row comes to
			rather than a height written down here. Capped at `max-w-xs` so a wide screen does not
			hand one song title the whole middle of the page. -->
		<button
			type="button"
			class="flex w-full min-w-0 max-w-xs cursor-pointer items-center self-stretch rounded-lg bg-primary px-3 text-white shadow-xl"
			aria-label={musicPressLabel(state.playing)}
			on:click={() => musicService.toggle()}
		>
			<MusicLine classes="min-w-0 flex-1" />
		</button>
	{/if}
</div>
