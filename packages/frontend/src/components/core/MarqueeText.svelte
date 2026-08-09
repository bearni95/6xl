<script lang="ts">
	import classNames from 'classnames';

	// A line that is longer than the box holding it, said in full: the box scrolls it past
	// horizontally, end to end, for as long as it stands there.
	//
	// It is for the one line on screen that cannot be shortened and cannot be given more
	// room — a song's title on the radio (see TownRadio), which is one cell of the band laid
	// on the map's bottom edge, and the title is whatever the record is called. An
	// ellipsis is the honest mark when a name can be recognised from its head (a town, an
	// account); a song on a radio is being announced, and half an announcement is not one.
	//
	// It scrolls only when it has to. A line that fits is drawn still: motion is what says
	// there is more of it, so a banner that moved anyway would say that about every song.
	// Which of the two it is comes from measuring, not from counting characters — the same
	// twenty letters fit or do not fit depending on the face they are set in and the box
	// they are in, and only the browser knows both. The measurement is its own copy of the
	// line, laid out of flow and invisible at its natural width, so it keeps reading the
	// truth after the banner has started moving (the running copies are padded and doubled,
	// and would measure themselves rather than the line).
	//
	// The track holds the line twice: the second copy is the first one's tail arriving, so
	// there is no moment where the box is empty and none where the line jumps back. The
	// shift and the seam are in the keyframes (see `animate-marquee` in css/app.css); what
	// is here is the pair and the padding they are spaced by.

	/** The line to carry. */
	export let text: string = '';
	/** The box's own classes — ink, size and weight belong to where it stands. */
	export let classes: string = '';

	let boxWidth = 0;
	let textWidth = 0;

	// A pixel of slack: sub-pixel layout can leave a line that fits reporting a hair wider
	// than the box it fits in, and that hair would set the whole banner running.
	$: overflows = textWidth > boxWidth + 1;
</script>

<span
	class={classNames('relative block w-full overflow-hidden', classes)}
	bind:clientWidth={boxWidth}
>
	<!-- The ruler: the line at its natural width, out of flow so it takes no room and
		invisible so it is never read twice — by an eye or by a screen reader. -->
	<span
		class="pointer-events-none invisible absolute whitespace-nowrap"
		aria-hidden="true"
		bind:clientWidth={textWidth}>{text}</span
	>

	{#if overflows}
		<!-- `w-max` so the track is as wide as both copies ask for rather than as wide as the
			box, which is the whole point of it. `motion-reduce` leaves the line still for a
			reader who has asked for no motion: they get the head of it, as an ellipsis would
			have given them. -->
		<span class="flex w-max animate-marquee will-change-transform motion-reduce:animate-none">
			<span class="whitespace-nowrap pe-8">{text}</span>
			<span class="whitespace-nowrap pe-8" aria-hidden="true">{text}</span>
		</span>
	{:else}
		<span class="block whitespace-nowrap">{text}</span>
	{/if}
</span>
