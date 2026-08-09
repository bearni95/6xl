<script lang="ts">
	import classNames from 'classnames';
	import { createEventDispatcher } from 'svelte';
	import RegionListRow from '$components/core/RegionListRow.svelte';
	import type { RegionRow } from '$components/core/region-types';

	// Where the map is standing, said once: the near half of the row laid across the foot of the
	// terrain, against the three tabs that answer about the place it names. That row was the head
	// of the block under the map until both halves of it turned out to be about the place the map
	// is drawing — so it is read on the map, and the block is left holding the answer.
	//
	// It carried the radio for a while — the song lettered under the place's name, the row itself
	// being the play/pause — on the reading that the row naming the open place was the one press
	// with the least of its own to do. The radio is the last line of the pin the map stands on the
	// open place now (see TownRadio), where the station is already said by the plate's own second
	// line — so what is playing is read on the mark standing on the place it is playing for, and
	// this row is left to say what the place is.
	//
	// Its own component because this is the map's answer to "where am I", drawn exactly as a
	// crumb and as a row of the list of places are, and one thing is decided about it here that
	// is decided nowhere else — see `named`.

	// The place the map is open on, lettered exactly as a crumb and as a row of the list of places
	// is (see crumbRow in +page.svelte). Null draws nothing, which the page never asks for — the
	// top view is a place like any other here.
	export let row: RegionRow | null = null;
	export let classes: string = '';

	// Pressing it is picking a region — the map's own gesture and not this row's: the page answers
	// it exactly as it answers a pin or a crumb.
	const dispatch = createEventDispatcher<{ select: { key: string } }>();

	// The row as this one is drawn: whatever it was handed, less the box. Every other row in this
	// game that names a town draws the box that town has waiting at its far end, and this one did
	// too — but this row is not in a run of places to be picked from, it is the place already
	// open, and the block it heads has that same box on a tab of its own two lines under it (see
	// +page.svelte's `townBox`). So the box here was the same wrapper drawn twice within one
	// picture, at a size nobody would press it at, in the half-cell the name has to truncate
	// inside. Taken off here rather than upstream because `subdivisionCurrent` is also what marks
	// the open town in the list of places, where a box is exactly what a row is meant to carry.
	$: named = row ? { ...row, box: null } : null;
	$: press = (key: string) => dispatch('select', { key });
</script>

<!-- White ink, as on the band and in the columns below: a crumb letters what it flies in white at
	70%. No surface and no padding of its own: it is a cell of the row it stands in, which carries
	the plate, the inset and the gap — and the plate matters where that row is now, since white ink
	laid straight on the terrain is white ink on whatever colour the tiles happen to be. It is the
	pins' own surface, so the place is named on the map on the same plate the pins name it on.
	What it does carry is a box, so `classes` can hand it the `min-w-0` that
	makes it truncate inside its half rather than widening the cell. -->
<div class={classNames('flex flex-col justify-center text-white', classes)}>
	{#if named}
		<!-- The name and nothing at its far end, which is what `named` is (see above): the whole
			width goes to the place, and the box the town has waiting is read on the tab beside this
			that is about nothing else. No `boxWidth` for the same reason — there is no box here to
			be sized. -->
		<RegionListRow row={named} current onSelect={press} />
	{/if}
</div>
