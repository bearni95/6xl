<script lang="ts">
	import classNames from 'classnames';
	import ShowTile from '$components/core/ShowTile.svelte';

	// One step of the map's breadcrumb path, drawn the way the town panel draws the town it
	// is open on: the show's glyph on a tile in the place's own colour, and beside it the
	// place over the show it flies. A crumb and that panel are the same statement about the
	// same kind of thing — this is where the map is looking — so they are lettered alike, and
	// walking up the path reads as a column of those plates laid on their side.
	//
	// Every step has a show, not just a town: above the municipality it is the plurality of
	// the towns underneath, which is the same show that tier's polygon is filled from, and
	// at the head of the path it is the plurality of every town on the map.
	//
	// Split out of MapBreadcrumbs because a crumb has two states and one body: the step the
	// map is on is inert text and every step above it is a button back to its tier, and
	// neither wants its own copy of a tile, a glyph and two lines.
	//
	// The radio on the far end of that bar was drawn as one of these for a while: a song over
	// the station it plays on is the same object as a place over the show it flies. The second
	// line is still the slot that made that possible — the station was a dial rather than a
	// word — and the song stood in it again later, under the name of the open place. Neither is
	// here now: the radio is the middle of the band across the top of the page (see
	// MusicBanner), so every crumb this game draws letters the show it flies. The slot stays
	// because a crumb's own line is the one thing about it that could be something other than a
	// name to be read.

	// The place, with its article already restored by the caller.
	export let label: string = '';
	// The show this place flies, and its id for the glyph. A tier with no show named leaves
	// the second line off rather than lettering a dash: a crumb is read in a row of crumbs,
	// and a column of dashes down the path says nothing.
	export let showName: string | null = null;
	export let showId: number | null = null;
	// The tile's fill plus the ink that reads on it — the place's own colour, in the same six
	// the pins, the cards and the town panel paint with. Null leaves the tile on the neutral
	// surface, which is what a tier with nothing rolled under it yet gets.
	export let tileClasses: string | null = null;
	// The step the map is actually on: the end of the path, and the one crumb that is not a
	// way of leaving it. Only the weight of the name changes — a crumb is the same statement
	// whether or not it is the one being made.
	export let current: boolean = false;
	// Cut the name short with an ellipsis instead of running past whatever holds the crumb.
	// Only the collapsed bar asks for this, and only for the one step it keeps: a path folded
	// down to a single crumb has already given that crumb every pixel there is, so if the name
	// still does not fit there is nothing left to widen and the ellipsis is the honest mark.
	// A crumb in a path never truncates — see below.
	export let truncated: boolean = false;
</script>

<!-- Spans throughout, not divs: a crumb above the current one is wrapped in a `<button>`,
	whose content model is phrasing only. `whitespace-nowrap` rather than the panel's
	`truncate` — a crumb is never given less room than its name asks for: a path too long for
	the bar is collapsed to this one step (see MapBreadcrumbs) rather than being made to fit
	by cutting its names short. -->
<span class="flex items-center gap-2">
	<!-- The tile the town panel and the pins draw, at 32px with a 20px glyph: the same plate,
		sized for a line of them (see ShowTile). Decorative — the show is named in the line
		right beside it. -->
	<ShowTile {showId} {tileClasses} />

	<span class={classNames('flex flex-col text-left leading-tight', { 'min-w-0': truncated })}>
		<span
			class={classNames(
				'text-sm',
				truncated ? 'truncate' : 'whitespace-nowrap',
				current ? 'font-semibold' : 'font-medium'
			)}
		>
			{label}
		</span>
		<!-- The second line, given from outside when it is something other than a name to be
			read: the radio's is the dial it is tuned by, since a station says its own name and
			the way to change it in one place (see StationDial). Phrasing content only, like
			everything else in here — a crumb in the path is wrapped in a button — and the ink
			and size are the slot's own, since what stands here is no longer this component's
			line. Nothing in the slot means the crumb letters what it flies, as every step of
			the path does. -->
		{#if $$slots.default}
			<slot />
		{:else if showName}
			<!-- Faded rather than white at 70%: a crumb is drawn on whatever it is stood on, and
				the one place that is not the map's own dark surface is the head of the column
				beside it, which carries the primary fill to say the map is looking at that place.
				White ink on that fill is not readable, so the second line takes the ink of the
				first and only steps back from it — which on every dark surface is the very colour
				it was spelled as. -->
			<span
				class={classNames(
					'text-xs font-medium opacity-70',
					truncated ? 'truncate' : 'whitespace-nowrap'
				)}
			>
				{showName}
			</span>
		{/if}
	</span>
</span>
