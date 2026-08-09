<script context="module" lang="ts">
	// What pressing the mark is called, wherever the press is — the button on the menu's plate,
	// and the whole of the radio's cell on the map's bottom edge, which carries this name itself
	// and draws the mark inside it as a picture (see MusicToggle, TownRadio). One radio,
	// so one name for the press: two names would be two controls to anyone who reaches them by
	// their names.
	export const musicPressLabel = (playing: boolean) => (playing ? 'Pause music' : 'Play music');
</script>

<script lang="ts">
	// The radio's one mark: a triangle when it is stopped, two bars when it is running.
	//
	// Its own component because it is drawn wherever the radio is pressable — today as the whole
	// of a button on the menu's plate (see MusicToggle) and as the mark inside the cell that is
	// itself the press on the map's bottom edge (see TownRadio), and it has stood inside a line
	// of text that was the press before that. Two copies of the paths
	// would be how the game comes to show a triangle in one corner and two bars in the other for
	// one radio.
	//
	// It says what the audio element is really doing rather than what it was last told to do:
	// both callers read it off the one service store.

	/** Which of the two it is. */
	export let playing: boolean = false;
	/** The glyph's size, which follows whatever it stands in. */
	export let classes: string = 'size-5';
</script>

<svg viewBox="0 0 24 24" fill="currentColor" class={classes} aria-hidden="true">
	{#if playing}
		<path d="M6 5h4v14H6zM14 5h4v14h-4z" />
	{:else}
		<path d="M8 5v14l11-7z" />
	{/if}
</svg>
