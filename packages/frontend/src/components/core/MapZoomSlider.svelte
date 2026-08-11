<script lang="ts">
	import classNames from 'classnames';
	import { createEventDispatcher } from 'svelte';

	// The map's ladder of levels as one control, and the only thing that moves this map's zoom
	// at all (every gesture that used to is off — see WorldMap's mount): a notch per level, the
	// coarsest divisions at the left end and the finest at the right.
	//
	// A rung is a way the terrain is CUT and not a place on it — the territoris, the províncies,
	// the comarques, the municipis — which is what a level is. The places are the column's to
	// name (the dots on the band below drop the path down to where you are); this says how
	// finely the country under it is divided, which no list of names says, and says it as a
	// distance, so how far in the reader has come is read off the thumb without anything being
	// lettered at all.
	//
	// Nothing is drawn but the strip. Each rung was numbered under its notch for a while, and a
	// column of figures under a control is a second thing to read where the position had already
	// said it: what a reader wants off this is how deep they are and which way to drag, and both
	// of those are the thumb. What each rung is is still SAID — to a screen reader, which has no
	// thumb to look at (see `steps`) — and the level itself is lettered all over the map it
	// draws: the divisions on the terrain, the places in the column, the badge on the band.
	//
	// It adjusts the zoom and nothing else. Where a crumb pressed in that column OPENS the place
	// it names, a rung here only takes the map to the zoom that level is read at, leaving the
	// centre where it is (see +page.svelte's zoomLadder and zoomToLadderStep).

	// One rung per level, coarsest first, each said in full: nothing on screen, and what the
	// thumb is standing on wherever the strip is read rather than looked at.
	export let steps: string[] = [];
	// Which rung the map is standing on — the caller's to say, since it is a fact about where
	// the map is looking and not about this control.
	export let value: number = 0;
	export let label: string = '';
	export let classes: string = '';

	const dispatch = createEventDispatcher<{ pick: { index: number } }>();

	$: max = Math.max(steps.length - 1, 0);
	$: clamped = Math.min(Math.max(value, 0), max);

	// Where the thumb is drawn, which is not quite the same question as which rung the map is
	// on: a zoom is animated and the level it lands on is read off the map once it has stopped,
	// so between the drag and the arrival the two disagree. The thumb stays where it was put and
	// the map catches up to it — the alternative is a thumb that snaps back to the level being
	// left the instant it is released, then walks forward again a moment later.
	//
	// Assigned from `clamped` alone, so a drag moving `position` never re-runs this and undoes
	// itself; whenever the map's own level changes, the thumb follows it.
	let position = 0;
	$: position = clamped;

	// On `change` and not on `input`: a drag reports every pixel it crosses, and every one of
	// those would be a zoom animation started and abandoned. What is asked for is the rung the
	// reader let go on.
	function pick() {
		dispatch('pick', { index: position });
	}
</script>

<input
	type="range"
	class={classNames('range range-xs range-primary w-full', classes)}
	min="0"
	{max}
	step="1"
	aria-label={label}
	aria-valuetext={steps[position] ?? ''}
	bind:value={position}
	on:change={pick}
/>
