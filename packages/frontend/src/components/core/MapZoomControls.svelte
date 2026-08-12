<script lang="ts">
	import classNames from 'classnames';
	import { createEventDispatcher } from 'svelte';
	import { _ } from 'svelte-i18n';

	// The map's ladder of levels as a pair of presses, and the only thing that moves this map's
	// zoom at all (every gesture that used to is off — see WorldMap's mount): one step coarser,
	// one step finer, and between them the way to the map on its own.
	//
	// A rung is a way the terrain is CUT and not a place on it — the territoris, the províncies,
	// the comarques, the municipis — which is what a level is. The places are the column's to
	// name (the dots on the band below drop the path down to where you are); this says how
	// finely the country under it is divided, which no list of names says.
	//
	// It was a stepped strip — a notch per level, dragged, the depth read off the thumb — and the
	// depth is the one thing a pair of buttons cannot say. What it gives instead is a press: a
	// reader who wants the next level down aims at a square and hits it, where a thumb had to be
	// picked up, carried the right distance and let go on the right notch, on a strip whose
	// notches were four pixels apart on a phone. The two things this control is ever asked for
	// are one level in and one level out, and both of those are now one press.
	//
	// Nothing is lettered on it. What each rung is is still SAID — to a screen reader, which has
	// no map to look at (see `steps`, announced as the map arrives at each level) — and the level
	// itself is drawn all over the map it moves: the divisions on the terrain, the places in the
	// column, the badge on the band.
	//
	// The two ends are dead ends and are drawn as such: at the whole country there is nothing
	// coarser to ask for and at the finest cut nothing finer, so the press that would ask is
	// disabled rather than left to do nothing when it is pressed.
	//
	// It adjusts the zoom and nothing else. Where a crumb pressed in that column OPENS the place
	// it names, a press here only takes the map to the zoom the next level is read at, leaving
	// the centre where it is (see MapScreen's zoomLadder and zoomToLadderStep).

	// One rung per level, coarsest first, each said in full: nothing on screen, and the whole of
	// what this control can tell a reader who is not looking at the terrain.
	export let steps: string[] = [];
	// Which rung the map is standing on — the caller's to say, since it is a fact about where
	// the map is looking and not about this control.
	export let value: number = 0;
	// Whether the way to the map on its own is offered. It is not on the page that already IS
	// the map on its own, where the globe would be a press back to where the reader is standing.
	export let alone: boolean = true;
	export let classes: string = '';

	const dispatch = createEventDispatcher<{ pick: { index: number } }>();

	// The map with nothing else on the page. A literal rather than MAP_ROUTE, which is the front
	// door ('/') and the place a fight comes back to — the opposite end of this press.
	const MAP_ALONE_ROUTE = '/map';

	$: max = Math.max(steps.length - 1, 0);
	$: clamped = Math.min(Math.max(value, 0), max);

	// Coarser is down the ladder and finer is up it: rung 0 is the whole country and the last
	// rung is the finest cut it can be drawn in (see zoomLadder). So the minus asks for the rung
	// before and the plus for the one after, which is what a level in and a level out are.
	function step(delta: number) {
		const next = clamped + delta;
		if (next < 0 || next > max) return;
		dispatch('pick', { index: next });
	}

	const squareClasses =
		'btn btn-square btn-outline btn-sm aspect-square flex-none border-white/60 text-white hover:border-white hover:bg-white/10 hover:text-white';
</script>

<!-- The three of them named once, as one control, rather than three unrelated squares standing
	next to each other. -->
<div
	role="group"
	aria-label={$_('map.zoom.label')}
	class={classNames('flex items-center gap-2', classes)}
>
	<button
		type="button"
		class={squareClasses}
		aria-label={$_('map.zoom.out')}
		disabled={clamped <= 0}
		on:click={() => step(-1)}
	>
		<svg viewBox="0 0 24 24" fill="currentColor" class="size-4" aria-hidden="true">
			<path d="M5 11h14v2H5z" />
		</svg>
	</button>

	<!-- The way to the map on its own — the same terrain, the same open place, at whatever size
		the screen is, with the furniture around it dropped: no column at the side and no block
		under it, the band across the top staying where it is on both addresses (see `/map`, and
		MapScreen's `chrome`). A globe rather than a word because it stands between two marks and a row of
		three reads as one control only if all three are marks. It is a LINK and not a button:
		what it does is go somewhere, and a reader who wants it in another tab should get one. -->
	{#if alone}
		<a href={MAP_ALONE_ROUTE} class={squareClasses} aria-label={$_('map.zoom.alone')}>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				class="size-4"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="9" />
				<ellipse cx="12" cy="12" rx="4.25" ry="9" />
				<path d="M3 12h18M4.7 6.9h14.6M4.7 17.1h14.6" />
			</svg>
		</a>
	{/if}

	<button
		type="button"
		class={squareClasses}
		aria-label={$_('map.zoom.in')}
		disabled={clamped >= max}
		on:click={() => step(1)}
	>
		<svg viewBox="0 0 24 24" fill="currentColor" class="size-4" aria-hidden="true">
			<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
		</svg>
	</button>

	<!-- Which level the map has arrived at, said as it changes and drawn nowhere: the strip used
		to carry it as the thumb's own value, and a reader who cannot see the terrain would
		otherwise press this control twice and be told nothing either time. -->
	<span class="sr-only" aria-live="polite">{steps[clamped] ?? ''}</span>
</div>
