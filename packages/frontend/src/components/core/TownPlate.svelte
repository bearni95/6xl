<script context="module" lang="ts">
	// The one plate a place is printed on, and the tile at the left end of it. Named here
	// because the map builds its pins imperatively (Leaflet hands out DOM, not templates —
	// see WorldMap's markerElement) and this draws the same plate declaratively for
	// everywhere else, and two copies of a class list are how two marks that are meant to be
	// the same mark come to look like two.
	//
	// No margin of its own: a pin holds this clear of the point it stands on and adds that
	// itself, and a plate drawn anywhere else is placed by whatever it is placed in.
	//
	// A plate standing on a point has to settle its own width, and rounds its corners because
	// it is a card dropped on terrain. One laid into a column of things is neither: it takes
	// the width of what it is stacked with and squares its corners against them, since a
	// rounded edge above a flush one is a notch. Same surface, same padding, same everything
	// else — which is why the two are written as one list and a variation on it, rather than
	// as one list overridden from outside: two utilities for one property leave which of them
	// wins to the order they happen to come out in the stylesheet.
	const PLATE_SURFACE = 'flex flex-col gap-1.5 bg-base-100/80 p-1.5 text-white shadow-lg';
	export const PLATE_CLASSES = `${PLATE_SURFACE} min-w-[200px] max-w-[15rem] rounded-lg`;
	export const PLATE_FLUSH_CLASSES = `${PLATE_SURFACE} w-full`;
	export const TILE_CLASSES = 'flex size-10 flex-none items-center justify-center rounded-lg';
</script>

<script lang="ts">
	import classNames from 'classnames';
	import TownHolder from '$components/core/TownHolder.svelte';
	import TownChallenge from '$components/core/TownChallenge.svelte';
	import type { MapChallenge, MapMarker } from '$types/map.type';

	// Everything a mark says about a place, on one surface: the show's glyph on a tile in
	// the region's colour, the place's name and the show it flies beside it, whose it is
	// under them, and how far it has been taken under that — what the place is, whose it is,
	// and what may be done about it, in the order they are read.
	//
	// The same plate the map's pins carry, drawn wherever a place has to be named away from
	// the map: the arena names the town a fight is over with it, so the card over the board
	// is the card that was pressed to get there rather than a second way of saying one town.
	//
	// It decides nothing about what it draws. Whether there is a holder to name, whether
	// there is a standing to count out and whether that standing comes with a control are all
	// the caller's — the arena hands over a challenge with no button, because a fight already
	// under way is not a fight to be started.

	// The show's glyph, inlined so it paints in the tile's own ink rather than a baked
	// colour (see inlineIconMarkup). Null is lettering alone: with no colour either, no tile.
	export let iconSvg: string | null = null;
	// The region's colour as a fill plus the ink that reads on it.
	export let frameClasses: string | null = null;
	// The show the place flies — the second line, under the place's own name.
	export let title: string;
	// The place's name — the top line, and the one that takes the ink.
	export let subtitle: string | undefined = undefined;
	export let holder: MapMarker['holder'] = null;
	export let challenge: MapChallenge | null = null;
	// Laid into a column rather than dropped on a point: the plate takes its container's
	// width instead of finding its own, and squares its corners (see the class lists above).
	export let flush: boolean = false;
	// Whether the plate says the place's own name. A plate dropped on terrain has to — it is
	// the only thing naming the point it stands on — but one laid into a column that has just
	// named the place at its head would be saying it twice, and the second saying is the one
	// that reads as a stray row. What is left is what only the plate says: whose the place is
	// and how far it has been taken.
	export let named: boolean = true;
	// Which end of the head row the tile is at. A plate is read tile-first everywhere it stands
	// on its own — a pin on the map, a card in a column — because a picture is where a reading
	// starts. Mirrored, the two lines take the row's width and are ranged right, and the tile
	// follows them: the same head row read from the other end, for a plate laid into the
	// left-hand half of something whose middle is where its mark belongs (the head of the fight,
	// where the tile faces the account's own portrait across the seam). Nothing else about the
	// plate turns round with it — the rows under the head are blocks of their own width.
	export let mirrored: boolean = false;
	export let classes: string = '';
</script>

<div class={classNames(flush ? PLATE_FLUSH_CLASSES : PLATE_CLASSES, classes)}>
	<!-- The head row: the tile at the left end, the two lines beside it — or, mirrored, the two
		lines first and the tile at the right end. `min-w-0` is what lets a line longer than the
		plate's own width truncate rather than push the plate wider — a flex item's floor is its
		content otherwise. The tile is decorative: the show is named in the line right beside it,
		so announcing the glyph too would read it twice.
		Turning the row round is two things and they only work together: the tile is sent to the
		other end (`order-last`, so the markup keeps saying picture-then-lines and only the
		painting changes) and the lines take whatever width is spare and set themselves against it
		(`flex-1 text-right`). Without the second the tile would sit next to the type in the
		middle of the row rather than at the end of it, since a row of two shrink-to-fit boxes is
		as wide as they are. -->
	{#if named}
		<div class="flex items-center gap-2">
			{#if iconSvg || frameClasses}
				<div
					class={classNames(
						TILE_CLASSES,
						'[&>svg]:size-7',
						frameClasses ?? 'bg-base-100 text-base-content',
						mirrored && 'order-last'
					)}
					aria-hidden="true"
				>
					{@html iconSvg ?? ''}
				</div>
			{/if}
			<div
				class={classNames(
					'flex min-w-0 flex-col leading-tight',
					mirrored ? 'flex-1 text-right' : 'text-left'
				)}
			>
				{#if subtitle}
					<span class="truncate text-xs font-semibold">{subtitle}</span>
				{/if}
				<span class="truncate text-xs font-medium text-white/70">{title}</span>
			</div>
		</div>
	{/if}

	{#if holder}
		<TownHolder name={holder.name} characterId={holder.characterId} color={holder.color} />
	{/if}

	{#if challenge}
		<TownChallenge
			siege={challenge.siege}
			button={challenge.button}
			unlocksAt={challenge.unlocksAt}
			onUnlock={challenge.onUnlock}
		/>
	{/if}
</div>
