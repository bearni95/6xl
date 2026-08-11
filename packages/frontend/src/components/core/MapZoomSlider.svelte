<script lang="ts">
	import classNames from 'classnames';
	import { createEventDispatcher } from 'svelte';

	// The map's ladder of levels as one control: a notch per rung, the whole of the map at the
	// left end and the place the map is standing in at the right, numbered along the bottom.
	//
	// It says the same thing the dots on the band below it say — the path from the top view
	// down to where you are — and it says it as a distance rather than as a list of names: how
	// deep the reader has walked is read off the thumb's position without opening anything, and
	// any level above is one drag away instead of a press, a column and a name to find in it.
	// Which is also why the rungs are numbered and not lettered: the names are the column's to
	// give, and a name at every notch of a strip this wide is a row of shreds.
	//
	// It adjusts the zoom and nothing else. Where a crumb pressed in that column OPENS the place
	// it names, a rung here only takes the map to the zoom that place stands whole at, leaving
	// the centre where it is — so what changes is the divisions drawn on the terrain, which is
	// the whole of what a level is (see +page.svelte's zoomToLadderStep, and zoomToTier beside
	// it, which is the same movement asked for a tier rather than a place).

	// One rung per level, coarsest first: the number printed under the notch, and what that
	// level is, said to a screen reader rather than drawn (the names belong to the column).
	export let steps: { number: number; title: string }[] = [];
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

<div class={classNames('flex flex-col gap-1', classes)}>
	<input
		type="range"
		class="range range-xs range-primary w-full"
		min="0"
		{max}
		step="1"
		aria-label={label}
		aria-valuetext={steps[position]?.title ?? ''}
		bind:value={position}
		on:change={pick}
	/>

	<!-- The numbers, one under each notch. `justify-between` rather than a measured position
		per number: the ends are the ends, and the rungs between them are evenly spaced because
		the slider's own steps are. The rung the map is standing on is the one in full ink, so
		the reading survives the thumb being mid-animation. -->
	<div class="flex justify-between px-1 text-[10px] leading-none tabular-nums">
		{#each steps as step, index}
			<span
				title={step.title}
				class={classNames(index === clamped ? 'font-bold opacity-100' : 'opacity-60')}
			>
				{step.number}
			</span>
		{/each}
	</div>
</div>
