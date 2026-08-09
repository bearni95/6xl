<script lang="ts">
	import classNames from 'classnames';
	import { createEventDispatcher } from 'svelte';
	import ShowIcon from '$components/core/ShowIcon.svelte';
	import { forShow } from '$utils/show/show-icon';
	import { showGlyphs } from '$services/shows.service';

	// How a list of places divides between the shows they fly, said above the list: each
	// show's own glyph with its share of the places below written under it, biggest first.
	// The map already paints this — every pin and every polygon flies its region's colour and
	// its show's mark — but only for what is on screen at the zoom the reader happens to be
	// at; this says it of the whole list, however long it is and however far down it runs.
	//
	// The glyph and nothing else names the show: it is the mark this game gives a show
	// everywhere it is named in a line (see ShowIcon), and a grid of names with percentages
	// after them would be the list below said twice. The name is on the cell's `title`, which
	// is what an unlettered mark needs to be readable at all.
	//
	// Eight to the row at most, and the artwork drawn to the whole width of its cell: a glyph
	// sized to the type beside it is a mark read as punctuation in a line, and this is not a
	// line — it is the one place on the page where the shows themselves are what is being looked
	// at, so they are given a cell rather than a lettering's worth of room.
	//
	// At most, and not always: the row is laid out with exactly as many columns as there are
	// cells to put in it, up to eight, and wraps past that. It used to be eight columns whatever
	// was in them, which leaves five empty tracks under three marks — and an empty track is 0
	// wide where the gaps between them are not, so the row runs a thumb's width past its last
	// mark on a grid whose whole width is a statement about how many shows there are. Caller's
	// choice which of the two kinds of box it is: handed a width (`w-full`, which is what it
	// takes at the head of the list of places) the tracks divide it and the marks grow and
	// shrink with it; left to itself it is as wide as its own cells, which is what it was while
	// it floated over the terrain and its width had to be read against a map.
	//
	// `grid-cols-N` is `repeat(N, minmax(0, 1fr))`, and a fr track in a shrink-to-fit grid
	// resolves to the widest content in ANY column — so where there is no width to divide the
	// columns still come out equal and as wide as the longest reading ("100%"), rather than each
	// one sized to its own percentage and the marks all different sizes.
	export let shares: { id: number; name: string; share: number }[] = [];
	// The show the list below is being read through, where one has been picked: that cell takes
	// the primary fill, so what is filling the list is said on the thing that was pressed. The
	// grid holds none of this itself — which show is picked is a fact about the list, and the
	// list is the box this row heads (see +page.svelte).
	export let active: number | null = null;
	export let classes: string = '';

	// Pressing a cell is asking for that show, and nothing more: whether that turns the filter
	// on, off or over to another show is the caller's, since the caller is what is filtered.
	const dispatch = createEventDispatcher<{ select: { id: number } }>();

	// Written out one class per count rather than composed: Tailwind reads the source for the
	// classes it is to emit, and a `grid-cols-${n}` it never sees written down is a rule it
	// never writes.
	const columnClasses = [
		'grid-cols-1',
		'grid-cols-2',
		'grid-cols-3',
		'grid-cols-4',
		'grid-cols-5',
		'grid-cols-6',
		'grid-cols-7',
		'grid-cols-8'
	];

	// The cells there are to lay out: a mark per show, and the caller's own last one where it
	// has passed one (the looking glass, today). At least one column whatever happens, an empty
	// grid being a thing with no tracks rather than a thing with none of something.
	$: cells = shares.length + ($$slots.end ? 1 : 0);
	$: columnClass = columnClasses[Math.min(Math.max(cells, 1), 8) - 1];
</script>

<div class={classNames('grid gap-2 px-2 py-1 text-xs', columnClass, classes)}>
	{#each shares as entry (entry.id)}
		{@const glyph = forShow($showGlyphs, entry.id)}
		<!-- A press, not a reading: a mark standing for a show over a list of places that fly
			shows is the shortest way to ask for just those places, and it is the mark the reader
			is already looking at. The picked one wears the primary fill and the ink that reads on
			it — the same marking the open town's own row takes in the list below, so "this one" is
			said the one way in this column. `aria-pressed` because it is a toggle and the fill is
			the whole of what says so; the name is on the cell either way, since a mark with no
			lettering is unreadable without it. -->
		<button
			type="button"
			class={classNames(
				'flex flex-col items-center gap-0.5 rounded-md p-1',
				entry.id === active ? 'bg-primary text-primary-content' : 'hover:bg-white/10'
			)}
			title={entry.name}
			aria-pressed={entry.id === active}
			on:click={() => dispatch('select', { id: entry.id })}
		>
			{#if glyph}
				<!-- The whole cell wide, in the grid's own ink. The svg carries its own 1em width
					and height, which a class outranks (see ShowIcon); `h-auto` is what leaves the
					artwork square as it takes that width, the viewBox doing the rest. -->
				<ShowIcon markup={glyph} classes="w-full [&>svg]:h-auto [&>svg]:w-full" />
			{/if}
			<!-- Its own line under the mark, rounded to the whole percent — the precision a share
				of a list this size can honestly be read at. Tabular so a grid of them lines up. -->
			<span class="font-medium tabular-nums">{Math.round(entry.share * 100)}%</span>
		</button>
	{/each}

	<!-- The last cell of the grid, and the caller's: the way to look for a place that is not on
		this level at all. It belongs on this row because this row is the one that acts on the
		list below — these cells narrow it to a show, and that one goes and finds places outside
		it altogether — and because a cell is the size a mark is read at here. -->
	<slot name="end" />
</div>
