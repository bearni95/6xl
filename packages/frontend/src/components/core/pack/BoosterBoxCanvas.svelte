<script lang="ts">
	import classNames from 'classnames';
	import { createEventDispatcher, onDestroy } from 'svelte';
	import TeamLineup, { LINEUP_ROW_SPAN } from '$components/core/TeamLineup.svelte';
	import PlayerAvatar from '$components/core/PlayerAvatar.svelte';
	import { BoosterBoxGridScene } from './scene/BoosterBoxGridScene';
	import type { OpenerPack } from './scene/opener-view.type';
	import type { ClaimPull } from './scene/pull.type';
	import type { PlayerAvatar as Avatar } from '$types/player-avatar.type';

	// The booster window's boxes, drawn on a canvas instead of in the document — the same two
	// grids, the same boxes, the same gutters (see BoosterBoxGridScene, and BoosterBoxSprite for
	// one box). A box is picked out of the window and stood up by tapping it, and tapped again to
	// slice it open: the whole of what a box does is one gesture on one object, and the box is
	// what a player came to touch.
	//
	// What it opens onto is *not* on the canvas. A card is a CharacterStatue, which is a document
	// thing with its own art, its own veil and its own tooltip, and there is no reason to have a
	// second one made of sprites: so the cards stand up in a layer of this component's own,
	// underneath a canvas that is transparent, and the box coming apart over them is what
	// uncovers them. The two are one picture in two mediums, stacked.
	//
	// The roll is fired from here rather than from the scene for the same reason: what the roll
	// gives is a document, so the thing that owns the document owns the call.

	export let packs: OpenerPack[] = [];
	// How many boxes a row holds. The host's call, as it is for the document grid — unlike how
	// the cards stand once a box is open, which is not: they come out of the box, so their row is
	// the box's to say (see REVEAL_ROW and `front`).
	export let columns: number = 4;
	// The box standing up, by pack id, or null for the window. Bindable, and bound to the same
	// thing the document grid's is: a click on a town's box out on the map picks a pack, and both
	// drawings of the window stand that one up rather than one of them showing the window it is
	// in. It is set from here too, so picking a box on this canvas is the same pick.
	export let selected: string | null = null;
	export let classes: string = '';

	const dispatch = createEventDispatcher<{
		select: OpenerPack;
		back: void;
		openComplete: number;
		opened: void;
	}>();

	let host: HTMLDivElement;
	let scene: BoosterBoxGridScene | null = null;
	// Bumped when the canvas loses its GPU context for good, which remounts the host and builds
	// the scene again on a fresh one.
	let attempt = 0;
	// Whether the scene has anything on it yet. A box is three pictures and the grid shows none
	// of them until every box has all three, so between this component mounting and that moment
	// the canvas is a hole the size of the sheet — which is the whole of what this is for: the
	// canvas is held out of sight until it has something to show, and what stands in its place
	// meanwhile says the window is coming rather than that it is empty. The art is fetched long
	// before any of this (see preloadPackArt on the map page), so on a warmed window it is a
	// frame or two and nobody sees the wait at all; this is what happens when they would have.
	let sceneReady = false;

	// What the open gave, and whether the box has started to come apart over it. The cards are
	// stood up the moment the roll answers — behind a box that is still there crazed — so their
	// art is fetched and their pictures are up while the squares are still holding, and it is
	// they that decide when the box may go.
	let pulls: ClaimPull[] | null = null;
	let avatar: Avatar | null = null;
	let uncovering = false;
	// How wide the standing box's front is drawn — the face and the bevel face either side of it,
	// in canvas pixels, said by the scene and said again whenever the box is re-fitted. It is what
	// the cards are laid out in: they stand where the box's picture was, edge to edge with it,
	// rather than filling a canvas the box is only a part of. Null while no box is up.
	let front: number | null = null;
	// The box the rows are handed, which is wider than the front by exactly the 5% a row leaves
	// spare (see LINEUP_ROW_SPAN): the row centres itself in it, so what is drawn spans the front
	// and nothing else has to know how a row shares its width out. It was the mouth of the box
	// before — the hole the cards notionally came out of — which is a good deal narrower than the
	// picture they were standing under, so a card never lined up with the box it came from.
	$: rowWidth = front === null ? null : front / LINEUP_ROW_SPAN;

	// Which cards have their picture up, held as a set of spawn ids rather than counted, so a
	// statue that says it twice cannot count as two and let the box go early.
	let statuesUp = new Set<string>();
	// Nothing waits for ever: a frame that neither loads nor errors would hold a crazed box
	// together for the rest of the session. The cap is not a guess at how long art takes, it is
	// the point at which something has plainly gone wrong.
	const STATUES_WAIT = 4000;
	let statuesTimer: ReturnType<typeof setTimeout> | null = null;

	// What a box opens onto stands in the very row the map's corner and the roster stand a side
	// in (see TeamLineup): three to a row, the middle one wider and lapped over the two beside
	// it. Three, and not the caller's to change — the cards are laid out across the box's front,
	// which is nothing like as wide as the canvas (see `front`), and five across that would be
	// five slivers. So a pull of five is two rows: three, then the two that are left
	// with the avatar the box dealt standing between them, in the cell the row keeps for the
	// one it is about. A face is not a card, and that is the one place in the row it can stand
	// without reading as one.
	const REVEAL_ROW = 3;
	$: revealTop = pulls ? pulls.slice(0, REVEAL_ROW) : [];
	$: revealRest = pulls ? pulls.slice(REVEAL_ROW) : [];

	/** One pull as the row draws a member: the card itself, minus everything only the claim
	 * cared about. */
	const toMember = (pull: ClaimPull) => ({
		characterId: pull.spawn.characterId,
		label: pull.label,
		basePath: pull.basePath,
		color: pull.color,
		box: pull.spawn.box,
		locationName: pull.locationName,
		spawnedAt: pull.spawnedAt,
		showId: pull.spawn.showId
	});

	/** A row says which of its members has its picture up, counting from its own end; the
	 * row's own cards are what turn that back into the spawn the box is waiting on. */
	function rowStatueUp(row: ClaimPull[], index: number): void {
		const pull = row[index];
		if (pull) statueUp(pull.spawn.id);
	}

	// The window is assembled after mount (the claim panel loads the day's festes), so push
	// changes into the live scene rather than waiting for a remount.
	$: scene?.setPacks(packs, columns);

	// And the pick along with it, whoever made it. A pick this canvas made itself comes back
	// through here as the id it just set, which the scene answers by doing nothing.
	$: scene?.setSelected(selected);

	// Built off the host element rather than on mount, so the block below coming back after a
	// lost context builds a scene on the new canvas — `bind:this` is what says there is one.
	$: if (host && !scene) build();

	function build(): void {
		scene = new BoosterBoxGridScene(host, {
			packs,
			columns,
			selected,
			onSelect: (pack) => {
				selected = pack.id;
				dispatch('select', pack);
			},
			onBack: () => {
				selected = null;
				clearReveal();
				dispatch('back');
			},
			onOpen: (pack) => void open(pack),
			onFront: (width) => (front = width),
			onUncovering: () => (uncovering = true),
			onReady: () => (sceneReady = true),
			// The box has gone and the cards it held are standing there: this canvas has nothing
			// further to do or to answer, and what happens next is the host's whole view's to decide.
			onOpened: () => dispatch('opened'),
			onContextLost: () => {
				scene?.destroy();
				scene = null;
				sceneReady = false;
				clearReveal();
				attempt += 1;
			}
		});
	}

	/**
	 * Roll the box that has just been tapped open and stand up what it gives. The cards go up
	 * behind the box straight away, at nothing opacity: a card taken out of the layout has no
	 * width, a sprite with no width never places its sheet, and a sheet never placed never loads
	 * — the box would be waiting for pictures its own waiting had stopped. Laid out and fetched
	 * as if they were being looked at, they are ready to be uncovered rather than to start
	 * arriving when the squares have gone.
	 */
	async function open(pack: OpenerPack): Promise<void> {
		forgetStatues();
		try {
			const opened = await pack.claim();
			pulls = opened.pulls;
			avatar = opened.avatar;
			dispatch('openComplete', opened.pulls.length);
			// An empty pull is ready at once — there is nothing to stand up, and the box comes
			// apart onto the panel that says so. Otherwise the cap starts with the cards: what it
			// guards against is a picture that never arrives, which cannot happen before there are
			// pictures to wait for.
			if (opened.pulls.length === 0) scene?.uncover();
			else
				statuesTimer = setTimeout(() => {
					statuesTimer = null;
					scene?.uncover();
				}, STATUES_WAIT);
		} catch {
			// The roll threw rather than answering with cards: the box is whole again, since a box
			// that opened onto nothing at all never opened. Why is the host's to say, as every
			// other refusal is.
			clearReveal();
			scene?.seal();
		}
	}

	/** One statue's picture is up; the box may go once they all are. */
	function statueUp(id: string): void {
		statuesUp = new Set(statuesUp).add(id);
		if (pulls && pulls.every((pull) => statuesUp.has(pull.spawn.id))) {
			forgetStatues();
			scene?.uncover();
		}
	}

	function forgetStatues(): void {
		if (statuesTimer) clearTimeout(statuesTimer);
		statuesTimer = null;
		statuesUp = new Set();
	}

	function clearReveal(): void {
		forgetStatues();
		pulls = null;
		avatar = null;
		uncovering = false;
	}

	onDestroy(() => {
		forgetStatues();
		scene?.destroy();
		scene = null;
	});
</script>

<!-- The canvas, and nothing else: it takes the whole of what it is given. The word that used to
	stand under it opened the box standing on it, and the box does that itself now — which gives the
	canvas back the height the control was holding, and leaves the boxes the only thing in the
	view. -->
<div class={classNames('flex h-full w-full flex-col', classes)}>
	{#key attempt}
		<!-- The canvas's own box, kept whether or not there is a canvas in it yet: the scene
			measures the element it is given, so it has to have been laid out at its full size
			before it can build anything to put in it. -->
		<div class="relative min-h-0 w-full flex-1">
			<div
				bind:this={host}
				class={classNames(
					'absolute inset-0 overflow-hidden transition-opacity duration-300',
					sceneReady ? 'opacity-100' : 'opacity-0'
				)}
			>
				{#if pulls}
					<!-- What the box gave, under the box: a document layer the canvas is laid over (the scene
						pins the canvas above this one, and the canvas draws on nothing). It comes up over the
						second the squares take to dissolve rather than when they have gone, so the crumble
						hands the cards over as it goes instead of ending on a space that then fills itself in.

						Nothing here answers a pointer, and neither does the canvas over it once the box has
						gone: the click on an open pack belongs to the whole view, which closes on it. -->
					<div
						class={classNames(
							'pointer-events-none absolute inset-0 z-0 flex items-center overflow-y-auto p-2 transition-opacity duration-1000',
							uncovering ? 'opacity-100' : 'opacity-0'
						)}
					>
						{#if pulls.length}
							<!-- Laid out across the box's front and not across the canvas: the cards stand where
								the picture was, edge to edge with it, centred where the box stands — which is the
								middle, always, the scene fitting a stood box to the canvas about its centre. So a
								row of three ends exactly where the poster over it ended, and the lid, being the
								full width of the box, is the one part that stands proud of them. What the box is
								handed is a little wider than that: a row draws 95% of its own width and centres
								itself in it (see LINEUP_ROW_SPAN), so the drawn ends land on the front's. The
								width is a measured length, so it comes through as a custom property; no class can
								carry a number only known at runtime. Until the scene has said one — which cannot
								happen before a box is standing — the layer's own width stands in. -->
							<!-- The cards are bare, and not behind a veil of their own: the box dissolving over
								them is the reveal, and a sprite veil under that would spend a character's one
								reveal on a sweep held behind something opaque. What each says instead is when its
								picture is up, which is what the box is waiting to hear — the row forwards it with
								the place in that row it was said of, and the row's own cards name the spawn. -->
							<div
								class={classNames(
									'mx-auto flex flex-col gap-2',
									rowWidth ? 'w-[var(--row-width)]' : 'w-full'
								)}
								style:--row-width={rowWidth ? `${rowWidth}px` : null}
							>
								<!-- Unbannered, both rows of it: what a box gives is five cards, not a side, so
									the row is borrowed here for the shape it lays a handful of cards out in and
									nothing else. The band would be painted in whatever colour the first card
									happened to come out and lettered with its show, over four others that owe it
									nothing — and the show is already said twice here, by the box that has just
									come apart over them and by the mark on each card's own floor. -->
								<TeamLineup
									members={revealTop.map(toMember)}
									veiled={false}
									bannered={false}
									classes="justify-center"
									on:ready={(event) => rowStatueUp(revealTop, event.detail.index)}
								/>
								{#if revealRest.length || avatar}
									<!-- The second row, and the avatar in the middle of it. The same component
										either way: with a face to stand there it is handed one, and with none — a
										box that dealt no avatar — the two cards left simply take the front of the
										row, as any short side does. -->
									{#if avatar}
										<TeamLineup
											members={revealRest.map(toMember)}
											veiled={false}
											bannered={false}
											classes="justify-center"
											on:ready={(event) => rowStatueUp(revealRest, event.detail.index)}
										>
											<!-- The avatar the box dealt: the same component the player's own row
												wears, in the colour it was dealt in, because what is shown is the very
												thing that will be standing there once it is picked — not a picture of
												it. Unnamed, and no card's panel under it: a statue says which character
												it is because a card is a character, and an avatar is a face. -->
											<PlayerAvatar
												slot="middle"
												characterId={avatar.characterId}
												color={avatar.color}
												size="w-full"
												classes="w-full"
											/>
										</TeamLineup>
									{:else}
										<TeamLineup
											members={revealRest.map(toMember)}
											veiled={false}
											bannered={false}
											classes="justify-center"
											on:ready={(event) => rowStatueUp(revealRest, event.detail.index)}
										/>
									{/if}
								{/if}
							</div>
						{:else}
							<!-- The box sliced open onto nothing. Why is the page's to say — every refusal lands
								on its claim panel — so this only keeps the box from reading as one that never
								opened. -->
							<div class="flex w-full items-center justify-center p-6 text-center">
								<p class="max-w-xs text-sm opacity-60">El sobre s'ha obert buit.</p>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			{#if !sceneReady}
				<!-- Where the window will be, while it is on its way. Not a page of its own and
					nothing to read: the sheet paints no ground, the boxes stand on the map, and a
					sentence here would be a sentence read once and never again. -->
				<div class="absolute inset-0 flex items-center justify-center">
					<span class="loading loading-spinner loading-lg opacity-60"></span>
				</div>
			{/if}
		</div>
	{/key}
</div>
