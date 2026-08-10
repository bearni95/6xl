<script lang="ts">
	import classNames from 'classnames';
	import { _ } from 'svelte-i18n';
	import type { MapChallenge } from '$types/map.type';

	/**
	 * How far a town has been taken: wins banked against wins needed, drawn and said at once.
	 *
	 * The picture is what carries at the distance a pin is looked at from and the figures are
	 * what a reader checks once they are close, so the bar is deep enough to hold them rather
	 * than being a rule with a caption beside it. The two are one object and cannot disagree —
	 * the same two numbers fill it and letter it.
	 *
	 * The count is laid over the bar rather than put inside it: a `<progress>` is a replaced
	 * element with no inside to put anything in, and it is what draws the fill (a width measured
	 * from `value` and `max`, which is not something a class can say). So the element keeps the
	 * drawing and a span over it keeps the lettering, both in the same box. White with a shadow
	 * under it, since the type crosses the filled part and the empty part and has to read on
	 * both.
	 *
	 * It carries no surface of its own: everywhere it stands — a pin's plate, the head of a
	 * fight — it is already on one, and a second would print a card inside a card.
	 *
	 * Its own file because it stands two ways round and neither is the other's variation on a
	 * plate: lying down it is the standing under a town's name (see TownChallenge), and standing
	 * up it is the seam between the town and whoever holds it in the head of the fight (see
	 * CombatHead). Two copies of a bar are how one quantity comes to be drawn two ways.
	 */

	export let siege: MapChallenge['siege'];
	// Which way round it stands. Upright it is a fixed 40x20 — the depth of the portrait it
	// stands beside in the head of the fight, half as wide — where lying down it fills whatever
	// width it is given and settles its own depth.
	export let vertical: boolean = false;
	export let classes: string = '';
</script>

<!-- Upright, the element is drawn lying down and turned: a `<progress>` fills along its inline
	axis and there is no property that says otherwise, so what stands the bar on end is the
	quarter turn. Anticlockwise, which is what puts the fill's near end at the foot of the box —
	a quantity read upwards, the way anything measuring how full something is is read. The
	element is laid out at the swapped size (`h-5 w-10`) and centred on the box before it turns,
	so the turn lands it exactly in the 40x20 the box measures: a rotation moves paint and not
	layout, so the box has to be the size the paint will end up at.

	Squared, and only upright. The corner radius a bar is drawn with is the theme's box radius,
	which is most of twenty pixels: on a bar that wide it is not a rounded corner but a shape,
	and the fill — rounded by the same amount, on its own box — comes out an ellipse a fraction
	of the width it is meant to say. So the element and both of the fills the two engines draw
	are squared, and the twenty pixels the box measures are the twenty pixels that read. Lying
	down there is a plate's width to round against and nothing to lose by it.

	The empty part is base-100, the same surface everything else in the head is printed on. Left
	alone it is the fill's own colour at a fifth, which on a bar this size is a block of pale
	blue standing between the two plates. -->

<div
	class={classNames('relative', vertical ? 'h-10 w-5 flex-none' : 'w-full', classes)}
	title={$_('map.challenge.siege')}
>
	<progress
		class={classNames(
			'progress progress-primary',
			vertical
				? 'absolute top-1/2 left-1/2 h-5 w-10 -translate-x-1/2 -translate-y-1/2 -rotate-90 rounded-none bg-base-100 [&::-moz-progress-bar]:rounded-none [&::-webkit-progress-value]:rounded-none'
				: 'block h-6 w-full'
		)}
		value={siege.wins}
		max={siege.required}
	></progress>
	<!-- The same two numbers, written to the room there is for them. Lying down that is the
		fraction as anyone writes it; upright there are twenty pixels across, which a slash and
		two figures do not fit in and a required count that has reached double figures does not
		fit in at all — so the fraction is set the way a fraction is set when there is no width
		for a slash, one number over the other with the rule between them. It is the same
		reading, not a shorter one. -->
	<span
		class={classNames(
			'pointer-events-none absolute inset-0 flex items-center justify-center font-bold tabular-nums text-white drop-shadow-md',
			vertical ? 'flex-col gap-0.5 text-[10px] leading-none' : 'text-xs'
		)}
	>
		{#if vertical}
			<span>{siege.wins}</span>
			<span class="h-px w-2.5 bg-white/80"></span>
			<span>{siege.required}</span>
		{:else}
			{siege.wins}/{siege.required}
		{/if}
	</span>
</div>
