<script lang="ts">
	import classNames from 'classnames';
	import { createEventDispatcher } from 'svelte';
	import { fade } from 'svelte/transition';
	import { _ } from 'svelte-i18n';
	import FullScreenModal from '$components/core/FullScreenModal.svelte';
	import BoosterBoxCanvas from '$components/core/pack/BoosterBoxCanvas.svelte';
	import { boosterModalOpen } from '$services/boosterModal';
	import type { OpenerPack } from '$components/core/pack/scene/opener-view.type';

	// The booster window's packs, on the same sheet the roster and the badges are drawn on.
	// It was a tab of the panel beside the map, which meant a pack was picked, stood up and
	// sliced open inside a 450px column — two covers to a row, and the five cards a pack gives
	// three to a row in whatever height the panel had left under its own header. A pack opening
	// is the one thing this game does that is worth a whole view, so it has one.
	//
	// Nothing here is loaded or decided by this modal. The packs, the window they cover, which
	// of them are already taken and whatever the last roll said are all the host's — the hidden
	// claim panel on the map page assembles them, and `claim_booster` is what refuses or pays
	// out — so this is the view of that state and the events that move it. Which keeps the map's
	// festa boxes and this grid on one set of packs rather than two.

	// Every openable pack in the window (three days back through four ahead), as the host's
	// claim panel built them.
	export let packs: OpenerPack[] = [];
	// Which town's pack is stood up, or null for the grid of all of them. Bound, because the
	// grid sets it when a cover is picked and a box click on the map sets it from outside.
	export let selected: string | null = null;
	// The stretch of calendar on offer, written out in Catalan by the host (both ends of it).
	export let windowLabel: string = '';
	// Why the last roll gave nothing, straight from `claim_booster`; empty when it did give.
	export let claimError: string = '';
	// How many cards the last pack revealed, or null before any has been opened. Zero is a
	// pack that sliced open onto an empty canvas.
	export let lastRevealed: number | null = null;
	// A box already opened says so by being drawn faded and refusing to come apart, and by
	// nothing else. There was a line of type here to that effect, and it was wrong the moment
	// it was right: a box is spent the instant it is opened, so the sentence came up over the
	// cards the player had just pulled out of it and told them they could not do the thing they
	// had visibly just done. What a spent box is, it is on the box.
	// True when a box was clicked on a town the window holds no pack for — the one thing the
	// grid cannot say for itself, since it only ever knows the packs it was handed.
	export let townHasNoPack: boolean = false;
	// Whether the sheet was raised on one town's box rather than on the window: a box clicked
	// out on the map, which is a player asking for that pack and not for the calendar it sits
	// in. The host says so, since it is the host that raised it.
	export let single: boolean = false;

	// The sheet given over to the one box, which is what `single` asks for while that box is
	// actually the thing on screen. A player who walks back out to the window from here is
	// looking at the window like anybody else, and gets its name and its ways out back — a
	// sheet with no ✕ on it is fine for a view that came up on one object and is left by
	// opening it, and is a trap on a view somebody is browsing.
	$: alone = single && selected !== null;

	const dispatch = createEventDispatcher<{
		select: void;
		back: void;
		openComplete: number;
	}>();

	// True from the moment a box has finished coming apart. The window was raised to open a pack;
	// once one is open and its cards are standing there, the sheet has said everything it was
	// raised to say, so the whole of it becomes the way out and the next click anywhere on it
	// closes. It is never put back: a pack is opened once, and what follows a pack being opened
	// is leaving.
	//
	// It is also how the sheet goes. Every other way out of every other sheet is a slide back
	// down to the edge it came up from, which says where the view went; a pack that has been
	// opened is cards standing on the town they were pulled on, and posting them off the bottom
	// of the screen is taking away something still being looked at rather than putting a view
	// down. So this one fades, and what fades up through it is that town.
	let revealed = false;

	function close(): void {
		boosterModalOpen.set(false);
	}
</script>

<!-- The same page every other full view stands on: base-100 at full strength at the top,
	graded to nine tenths at the foot, so the map is faintly there under the last of it. This
	sheet painted nothing for a while — the reasoning being that a pack belongs to the town it
	was claimed on and should be sliced open over it — but a window of boxes read off live
	terrain is a window whose ground changes with wherever the map happens to be scrolled to,
	and a grade that lets the town through at the foot says the same thing without asking the
	boxes to stand on it. -->
<FullScreenModal
	title={$_('booster.title')}
	closeLabel={$_('booster.close')}
	bare={alone}
	closeOnClick={revealed}
	on:close={close}
>
	<!-- The sheet is the window on a canvas, and nothing beside it. It was drawn twice — the
		document's own grid on the left and the canvas on the right, both bound to the one pick —
		which is one window shown twice on a sheet whose whole point is that a pack opening is
		worth the viewport: two half-width drawings of the same thing, each too small to be the
		thing. The canvas is the one that is kept, boxes and reveal and all (see BoosterBoxSprite,
		which draws every surface off the very figures the document's box is written with).

		What the left column also held, and what is kept above the canvas, is the stretch of
		calendar on offer and whatever the last roll had to say — neither belongs to a drawing of
		the window, and the canvas is not where a sentence is read. -->
	<!-- Faded in rather than simply there: the sheet slides up from the bottom edge over a
		quarter second, and everything it carries arriving whole on the first frame of that made
		the slide a picture being moved rather than a view opening. It comes up as the sheet
		settles — the delay is the slide's own length, so the fade starts where it stops — and
		only on the way in: the way out is the sheet going, and a fade laid over that would be two
		things leaving at different speeds. -->
	<div
		class={classNames('flex min-h-0 flex-1 flex-col gap-4', { 'p-3': alone })}
		in:fade={{ duration: 250, delay: 250 }}
	>
		<!-- The stretch of calendar on offer, both ends of it named. Every pack under it is
			openable: a festa major runs over its weekend rather than on one evening, so the window
			reaches three days back and four ahead, and `claim_booster` takes the same range.
			Not said at all when the sheet was raised on one town's box: what a player asked for
			there is that pack, and the window it belongs to is the one thing they did not ask
			about. -->
		{#if !alone}
			<div class="flex flex-none items-center justify-center">
				<span class="truncate text-sm font-bold first-letter:uppercase">{windowLabel}</span>
			</div>
		{/if}

		<!-- Why the last roll revealed nothing. `claim_booster` refuses for reasons the player can
			act on (the town's box is already taken, its festa is out of the window), and the panel
			that reports them is mounted hidden on the map page — so a pack sliced open onto an
			empty canvas would say nothing at all without this. -->
		{#if claimError}
			<div class="alert alert-error flex-none py-2 text-xs" role="alert">
				<span>{claimError}</span>
			</div>
		{:else if lastRevealed === 0}
			<!-- The pack opened and the roll came back with nothing, without an error to go with it.
				Rare, but it must not read as a blank canvas. -->
			<div class="alert alert-warning flex-none py-2 text-xs" role="alert">
				<span>El sobre s'ha obert però no n'ha sortit cap carta.</span>
			</div>
		{/if}

		<!-- The window itself, on the plate the grid used to share with it: the padding is the
			plate's, so the canvas is handed a box holding boxes and draws no margin of its own. The
			ground is not — the plate takes everything under the calendar line, and a second fill
			over the sheet's own page would be a panel drawn round boxes that need no framing. What
			is left of the plate is the ground under the two sentences that stand in for a window
			there is nothing in: those are text to be read, not boxes, and text wants something
			behind it.
			A box is picked out of the window and stood up by tapping it, the button under the canvas
			slices it open, and the cards it held stand up in its place. Those cards are documents even here:
			the canvas is transparent and they are laid out behind it, so what comes apart is a
			canvas and what it uncovers is the page.

			The pick is bound to the same id a click on a town's box out on the map sets, so a modal
			opened on a town opens on that town's box rather than on the window it sits in. -->
		<div
			class={classNames('min-h-0 min-w-0 flex-1 rounded-box p-3', {
				'bg-base-200': !packs.length || townHasNoPack
			})}
		>
			{#if townHasNoPack}
				<div class="flex h-full items-center justify-center p-6 text-center">
					<p class="max-w-xs text-sm opacity-60">
						Aquest municipi encara no té cap sobre per obrir. Inicia sessió i torna-ho a provar.
					</p>
				</div>
			{:else if packs.length}
				<BoosterBoxCanvas
					{packs}
					columns={4}
					bind:selected
					on:select={() => dispatch('select')}
					on:back={() => dispatch('back')}
					on:opened={() => (revealed = true)}
					on:openComplete={(event) => dispatch('openComplete', event.detail)}
				/>
			{:else}
				<div class="flex h-full items-center justify-center p-6 text-center">
					<p class="max-w-xs text-sm opacity-60">
						Ara mateix no hi ha cap sobre per obrir. Inicia sessió i clica una estrella daurada
						del mapa.
					</p>
				</div>
			{/if}
		</div>
	</div>
</FullScreenModal>
