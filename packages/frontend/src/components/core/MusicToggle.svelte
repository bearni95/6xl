<script lang="ts">
	import { onMount } from 'svelte';
	import MusicGlyph, { musicPressLabel } from '$components/core/MusicGlyph.svelte';
	import { musicService } from '$services/music.service';

	// The radio's play/pause drawn as a bare button, which is what a play/pause standing among
	// other controls wants to be: the plate in the burger menu is the one such place left. The
	// radio in the middle of the band across the top of the page is a slot that is entirely its
	// own press and draws the mark alone inside it (see MusicBanner, MusicGlyph) — same store, same
	// name for the press, no button in it to nest. The shape is the caller's, the reading is not.
	//
	// It says what the element is really doing rather than what it was last told to do, and
	// says it wherever the radio is pressable, because every one of those reads the one service
	// store and takes its name for the press from one place (see MusicGlyph).
	//
	// It draws nothing until there is a song, like the plate: a map whose music never
	// arrived is a map with no music control on it, not one with a dead button.
	//
	// Shape is the caller's — a ghost circle on the menu's plate — which is not a fact about a
	// play button.

	/** The button's own classes — its shape and colour belong to where it stands. */
	export let classes: string = '';

	/** The glyph's size, which follows the row of marks it is standing in. */
	export let iconClasses: string = 'size-5';

	// The read that used to be the plate's, kept here because the button may stand somewhere
	// that is up before anything else is — and the radio is a clock, so it wants to be running
	// whether or not anyone has looked at it. Idempotent: every mount shares one fetch, and the
	// map page makes it too, since neither of the two surfaces drawing this is always on screen.
	onMount(() => void musicService.load().catch(() => undefined));

	const music = musicService.state;

	$: state = $music;
</script>

{#if state.track}
	<button
		type="button"
		class={classes}
		aria-label={musicPressLabel(state.playing)}
		on:click={() => musicService.toggle()}
	>
		<!-- The one mark the radio is read by wherever it stands (see MusicGlyph): a triangle
			stopped, two bars running. -->
		<MusicGlyph playing={state.playing} classes={iconClasses} />
	</button>
{/if}
