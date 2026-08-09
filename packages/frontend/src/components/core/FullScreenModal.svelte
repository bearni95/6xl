<script lang="ts">
	import classNames from 'classnames';
	import { createEventDispatcher } from 'svelte';
	import { blur } from 'svelte/transition';

	// The chrome every full-view modal over the map wears: the sheet, the way it
	// arrives and leaves, its title bar and the two ways out of it. What each one
	// puts inside is the only thing that differs, so the surround is here and the
	// content is the slot.
	//
	// A modal like this is the whole view rather than a box over the map: it takes the
	// viewport, and it **blurs in and blurs out** — one way in, the same way out, for every
	// sheet in the app. Nothing behind it is dimmed and there is no backdrop to click,
	// because there is nothing of the map left showing to click at — Escape and the ✕
	// are how it closes.
	//
	// And the sheet is the whole of what moves. Raising one changes nothing outside itself:
	// nothing on the page behind it is hidden, unmounted, veiled, blurred or made inert, and
	// nothing appears that was not already there. A sheet that reached out and rearranged the
	// page under it was reliably a sheet that re-framed the map, cost Leaflet a rebuild of
	// every pin, and left the two halves of one gesture playing a quarter of a second apart.
	// So this component tells nobody it exists — no store, no count, no `raiseSheet` — and the
	// page has nothing to answer. If something behind a sheet needs to change, it is about the
	// thing that raised it (a fight, say) and belongs to that, never to the sheet being up.
	//
	// The page is not quite opaque all the way down: base-100 at full strength at the
	// top, graded to nine tenths at the foot, so the map is faintly there under the
	// last of the content and the view reads as something laid over the map rather
	// than as another screen. It is the gradient alone that paints it — a background
	// colour under a stop with alpha in it would show through and make the foot opaque
	// again, which is the whole of what the grade says. Every sheet wears it, the
	// booster window and the combat arena included: both asked for no page at all for a
	// while — a canvas of boxes, a board over the town being fought for — and both were
	// drawings read off live terrain, their ground moving with wherever the map happened
	// to be scrolled to. The grade says the thing that transparency was for, and says it
	// the same way everywhere, so there is no `transparent` prop any more.
	//
	// The blur is a Svelte transition rather than a stylesheet's, since the component
	// is only ever mounted while it is open (a CSS transition has nothing to animate
	// from on a fresh mount) and the host's `{#if}` is what lets the way out play at
	// all. So this component has no `open` prop: it exists while the modal is up, it
	// dispatches `close`, and the host's store is what decides.
	//
	// z-[1300] puts it above the map's furniture (z-[900]–z-[1000]). The combat arena wears
	// this same sheet, so two of these can be up at once — the arena is one of the
	// places that sends the player to the roster — and which of them is in front is
	// decided by the order the page mounts them in, the roster being the later. The
	// sheet is a full-height flex column: the title bar takes what it needs and the
	// slot gets the rest, which is what a scroll box inside it is sized from. A `bare`
	// sheet has neither the bar nor the padding round it — the slot is the viewport, and
	// Escape is the way out.

	/** The heading in the title bar, and the sheet's name to a screen reader whether that
	 * bar is drawn or not. */
	export let title: string;
	/** What the ✕ is called to a screen reader, e.g. `Close roster`. */
	export let closeLabel: string = 'Close';
	/**
	 * Give the whole sheet over to the slot: no title bar, and no padding around it.
	 *
	 * For a view whose content *is* the view — one drawing that wants every pixel it can
	 * have and sizes itself to what it is given — where a bar naming it and a margin round
	 * it are both chrome taken off the thing the player came for. A padded sheet with a
	 * heading is the right shape for a page of content and the wrong one for a single
	 * picture.
	 *
	 * Escape is unaffected: it is bound to the window, not to the bar, so a bare sheet is
	 * still a sheet that closes — and `closeDisabled` still holds it shut. The title is
	 * still given, and is still the sheet's name to a screen reader.
	 */
	export let bare: boolean = false;
	/**
	 * Hold the way out shut: the ✕ greys and Escape does nothing while this is true.
	 *
	 * For a view that is in the middle of something the player must not walk out of —
	 * the combat arena handing a finished fight to the server, which is what ends the
	 * battle — rather than for keeping anybody in. It is the host that knows when that
	 * is, so it is the host that says.
	 */
	export let closeDisabled: boolean = false;
	/**
	 * Make the whole sheet a way out: a click anywhere on it closes, and leaves by the same
	 * blur the ✕ and Escape leave by.
	 *
	 * For a view that has finished saying what it was raised to say and has nothing left to do —
	 * the booster window once a pack has come apart and its cards are standing there. The player
	 * has looked; the next thing they do, wherever they do it, is done with it. It is the host
	 * that knows when a sheet has reached that point, so it is the host that says, and it is off
	 * until they do: a sheet that closed on any click would be a sheet nothing inside could be
	 * touched on.
	 *
	 * `closeDisabled` still wins, as it does over both other ways out.
	 */
	export let closeOnClick: boolean = false;

	// How the sheet arrives and how it goes: 8px of blur over a quarter of a second, and the
	// same the other way. One gesture, and one `transition:` directive rather than a pair, so
	// there is no way in that is not also the way out — a sheet that left differently from the
	// way it came was a sheet each host had to have an opinion about (see the `fadeOut` that
	// used to be here, and the slide before that).
	//
	// Svelte's blur fades opacity with it, which is what makes a sheet that is on its way out
	// stop covering the map before it has finished going.
	const SHEET_BLUR = { amount: 8, duration: 250 };

	const dispatch = createEventDispatcher<{ close: void }>();

	function close(): void {
		if (closeDisabled) return;
		dispatch('close');
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') close();
	}

	// A click on the sheet, when the host has made the sheet a way out. It sits on the whole of it
	// rather than on the content, so the bar, the margin and whatever is drawn in the middle all
	// close alike — there is no part of a sheet that is done with that is not done with. The ✕
	// underneath it closes twice, which is once.
	function onSheetClick(): void {
		if (closeOnClick) close();
	}
</script>

<svelte:window on:keydown={onKeydown} />

<!-- svelte-ignore a11y-click-events-have-key-events -->
<div
	class="fixed inset-0 z-[1300]"
	role="dialog"
	aria-modal="true"
	aria-label={title}
	tabindex="-1"
	transition:blur={SHEET_BLUR}
	on:click={onSheetClick}
>
	<div
		class={classNames(
			'flex h-full w-full flex-col overflow-hidden bg-gradient-to-b from-base-100 to-base-100/90',
			{ 'gap-4 p-6': !bare }
		)}
	>
		{#if !bare}
			<div class="flex flex-none items-center gap-3">
				<h2 class="text-lg font-bold">{title}</h2>
				<button
					type="button"
					class="btn btn-circle btn-ghost btn-sm ml-auto"
					aria-label={closeLabel}
					disabled={closeDisabled}
					on:click={close}
				>
					✕
				</button>
			</div>
		{/if}
		<slot />
	</div>
</div>
