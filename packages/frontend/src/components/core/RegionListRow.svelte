<script lang="ts">
	import classNames from 'classnames';
	import MapBreadcrumb from '$components/core/MapBreadcrumb.svelte';
	import BoosterBox from '$components/core/pack/BoosterBox.svelte';
	import type { MapBoosterBox } from '$types/map.type';

	// One place as the column beside the map lists it: the tile in its own colour, the name and
	// the show it flies, and at the far end whatever that place has waiting.
	//
	// Its own component because the column lists places twice — the level under the open region,
	// and the places a search has turned up — and those are the same statement about the same
	// kind of thing. Two copies of this markup would be how one list comes to look like two,
	// which is the very thing MapBreadcrumb was split out of the bar for.
	export let row: {
		key: string;
		label: string;
		showName: string | null;
		showId: number | null;
		tileClasses: string | null;
		// The box that place has waiting, where the booster window has one for it — the very
		// `MapBoosterBox` the map is standing on that town. Only a town ever has one.
		box?: MapBoosterBox | null;
	};
	// The place the map is open on. Said to a screen reader as `aria-current`, wherever this row
	// stands.
	export let current: boolean = false;
	// And said in ink, which is a different question: a row *in a list* that is the open place
	// takes the primary fill, so it can be found among its sisters without being counted along
	// them. The row at the head of the column is the open place too and takes no fill — a head
	// is where a reader looks first, not somewhere they have to find anything.
	export let marked: boolean = false;
	export let onSelect: (key: string) => void;
	// The width the box is drawn at, which is how its height is said — the caller's, since it
	// is a fact about the run of rows and not about one of them (see REGION_ROW_BOX_WIDTH).
	export let boxWidth: string = '';

	// Two presses on one row: the name, which opens the place, and the box, which opens what
	// the place has waiting. The box was a picture for a while and the row was pressed to the
	// same end, the pack being reached by opening the town — but a box is the mark this game
	// asks to be tapped, and a picture of one that answers by drilling the map is that mark
	// lying about itself.
	//
	// The box stands outside the name's button either way: a button holds phrasing content,
	// which is why the crumb in it is spans throughout (see MapBreadcrumb), and a box is a
	// block of planes. A row with nothing beside the name is a plain flex box of one item,
	// which is every row of every tier above the municipality.
	//
	// The row naming the open place used to hand a couple more things in beside the name — the
	// radio's play/pause, stood on the crumb's own tile, and the song at the far end — for the
	// same reason the box is out here: a button does not hold a button. Then the mark and the
	// song became that row's second line, handed in through a slot, and the row itself was the
	// press. Both are gone with the radio, which is a row of its own along the map's bottom edge
	// now, its play/pause a square on the band under that (see MusicBanner, MusicToggle): every
	// row this game draws is one press that opens a place, and what stands under the name is the
	// show it flies.
</script>

<!-- `min-w-0` because the list that draws most of these lays them two to a line (see
	RegionLocationList), and a grid track is floored at its content's own width unless the item
	standing in it says otherwise — without it a long town name widens its column instead of
	truncating inside it, and the two columns stop being halves. It costs the flex rows that draw
	this elsewhere nothing: they hand it a share of their own width already. -->
<div
	class={classNames(
		'flex min-w-0 items-stretch rounded-md',
		marked ? 'bg-primary text-primary-content hover:bg-primary/90' : 'hover:bg-white/10'
	)}
>
	<button
		type="button"
		aria-current={current ? 'page' : undefined}
		class="block min-w-0 flex-1 px-2 py-1 text-left"
		on:click={() => onSelect(row.key)}
	>
		<MapBreadcrumb
			label={row.label}
			showName={row.showName}
			showId={row.showId}
			tileClasses={row.tileClasses}
			truncated
		/>
	</button>

	{#if row.box}
		<!-- At the far end of the entry and as tall as the entry is. The height is the one that is
			said, and it is said as a width: a box hands back whichever of the two it is not given
			(see BoosterBox's 30:37), and it is the width that has to be settled before the row is
			laid out, since a flex item nobody has given a width is measured by what is inside it —
			which for a box whose every figure is a share of its own width is not a measurement at
			all, and came out wider than the column.
			Named by the name printed on the box itself, which is the town's. -->
		<button type="button" class="flex-none pr-2" on:click={() => row.box?.onClick?.()}>
			<BoosterBox
				coverUrl={row.box.coverUrl ?? null}
				logoUrl={row.box.logoUrl ?? null}
				showId={row.box.showId ?? null}
				locationName={row.box.locationName ?? null}
				light={row.box.light ?? false}
				classes={boxWidth}
			/>
		</button>
	{/if}
</div>
