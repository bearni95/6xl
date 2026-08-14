<script lang="ts">
	import classNames from 'classnames';
	import { createEventDispatcher, onDestroy } from 'svelte';
	import CharacterStatue from '$components/core/CharacterStatue.svelte';
	import PlayerAvatar from '$components/core/PlayerAvatar.svelte';
	import BoosterBox from './BoosterBox.svelte';
	import type { OpenerPack } from './scene/opener-view.type';
	import type { ClaimPull } from './scene/pull.type';
	import type { PlayerAvatar as Avatar } from '$types/player-avatar.type';

	// The booster window's packs, in the document rather than on a canvas, on three
	// states that are the same three taps they have always been:
	//   — every pack on offer at cell width, in two grids: the towns of festa today,
	//     printed on white card, then the rest of the window on black;
	//   — one pack stood up on its own, filling the height it is given, when it is
	//     picked;
	//   — the cards it held, as statues, when the stood-up pack is tapped again — the
	//     tap that fires the roll, so the spawn is still persisted at open time.
	// Nothing here holds a GPU context, so a whole day's packs and the cards they open
	// onto cost the page nothing beyond the images themselves.

	export let packs: OpenerPack[] = [];
	// How many packs a row holds, and how many columns the opened cards stand in.
	// Both are the host's call — a panel a third of the viewport wide asks for fewer
	// than a full-width page would.
	export let columns: number = 2;
	export let revealColumns: number = 2;
	// False shows the packs but opens none of them — the allowance is spent, so a pack
	// would only slice open onto nothing.
	export let interactive: boolean = true;
	// The pack standing on its own, by id, or null for the grid. Bindable, because a
	// host may stand one up itself (clicking a town's box on the map picks its pack) and must
	// follow along when the player picks another here.
	export let selected: string | null = null;
	export let classes: string = '';

	const dispatch = createEventDispatcher<{
		select: OpenerPack;
		back: void;
		openComplete: number;
	}>();

	// The cards the standing pack revealed, or null while it is still sealed. Dropped
	// whenever a different pack comes forward, so a pack never opens onto the last
	// one's cards.
	let pulls: ClaimPull[] | null = null;
	// The avatar that box dealt, shown in the cell after its cards, and whether it is
	// one the player did not already hold. Dropped with them, and for the same reason.
	let avatar: Avatar | null = null;
	let avatarIsNew = false;
	// True while the roll is in flight — the pack is already tapped, and a second tap
	// must not fire a second claim.
	let opening = false;
	// The tap has landed and the box is coming apart (see BoosterBox, which breaks every surface of
	// it into a grid of squares of that surface's own tone and dissolves the four together). It is
	// not the same thing as the roll being out: the dissolve is the box's own animation and holds
	// through a roll that answers inside it, which is why the cards wait on `unsealed` and not on
	// `pulls` alone — swapping them in the moment the server replied would cut the box off
	// mid-crumble.
	let unsealing = false;
	// The box has started to go, and the box has gone: it says both itself. The first is what the
	// cards come up on — they have the dissolving second to come up through, so the squares uncover
	// cards already standing rather than a space that fills itself in afterwards — and the second is
	// when the box is out of the document.
	let uncovering = false;
	let unsealed = false;

	// The cards are stood up as soon as the roll answers, behind the box that is still standing
	// there crazed, and it is they that decide when it may go: which of them have their picture up
	// (they say so themselves — see IdleSprite's `ready`, and `veiled` below for why they arrive
	// bare here), and whether that is all of them.
	//
	// Held as a set of spawn ids rather than counted, so a statue that says it twice — a clip
	// reloaded under it, a re-measure — cannot count as two and let the box go early.
	let statuesUp = new Set<string>();
	// Nothing waits for ever. A frame that neither loads nor errors would otherwise hold a crazed
	// box together for the rest of the session, and a box that will not come apart is worse than a
	// card that arrives a moment after the squares have gone. The cap is generous: it is not a
	// guess at how long art takes, it is the point at which something has plainly gone wrong.
	const STATUES_WAIT = 4000;
	let statuesTimedOut = false;
	let statuesTimer: ReturnType<typeof setTimeout> | null = null;

	// Which pack the state above belongs to. `selected` is the host's to change too,
	// so the reset is driven off a change in it rather than off the picking.
	let shown: string | null = null;
	$: if (selected !== shown) {
		shown = selected;
		pulls = null;
		avatar = null;
		avatarIsNew = false;
		opening = false;
		unsealing = false;
		uncovering = false;
		unsealed = false;
		forgetStatues();
	}

	// What the box waits on: every card it gave standing with its picture up. An empty pull is
	// ready at once — there is nothing to stand up, and the box comes apart onto the panel that
	// says so.
	$: cardsUp =
		pulls !== null &&
		(statuesTimedOut || pulls.every((pull) => statuesUp.has(pull.spawn.id)));

	// The stood-up pack's own space, measured, and where the front of the box has its middle in it.
	//
	// The cards are centred on the picture they came out of rather than on the space they are
	// standing in, and the two are not the same point: a box is a lid over a front, so the front's
	// middle falls half the lid's depth below the middle of the whole box — a twelfth of the box's
	// width, the lid being a sixth of it deep — and the box itself is centred here. The drawn width
	// is whichever measurement runs out first at the box's own 30:37, which is the same `min` the
	// box is handed as a height below; a share of the space alone would be wrong for every panel
	// that bounds the height instead of the width.
	//
	// Measured rather than said in cqw, which would only cover the width-limited case: a length in
	// two container units needs the space to be a size container, and this one takes its height off
	// a flex line — a host that mounted it without a definite height would find the whole panel
	// collapse to nothing rather than merely mis-centre.
	const BOX_RATIO = 37 / 30;
	// What share of the box's width its front takes, all told: the face at four fifths
	// plus the bevel face either side of it (see BEVEL_FACE in BoosterBox). It is the
	// front that is fitted to this space, not the box — so the box itself is wider than
	// the space by exactly this, and the same figure appears in the height the box is
	// handed below.
	const FRONT_SHARE = 0.89406;
	let bodyWidth = 0;
	let bodyHeight = 0;
	$: boxWidth = Math.min(bodyWidth / FRONT_SHARE, bodyHeight / BOX_RATIO);
	$: frontDrop = boxWidth / 12;

	/** One statue's picture is up. */
	function statueUp(id: string): void {
		statuesUp = new Set(statuesUp).add(id);
	}

	/** No statues standing, no cap running — for a pack stood back down or another coming
	 * forward. */
	function forgetStatues(): void {
		if (statuesTimer) clearTimeout(statuesTimer);
		statuesTimer = null;
		statuesTimedOut = false;
		statuesUp = new Set();
	}

	$: selectedPack = selected ? (packs.find((pack) => pack.id === selected) ?? null) : null;

	// The grid state shows the packs in two, the towns of festa today first. Each keeps the
	// order the panel handed them in, which is the calendar's — the split only lifts today
	// out of the middle of that list, it does not re-sort either half.
	$: todayPacks = packs.filter((pack) => pack.today);
	$: windowPacks = packs.filter((pack) => !pack.today);

	// Tailwind only emits the column classes it can see spelled out, so the counts a
	// host may ask for are written in full here.
	const COLUMN_CLASSES: Record<number, string> = {
		1: 'grid-cols-1',
		2: 'grid-cols-2',
		3: 'grid-cols-3',
		4: 'grid-cols-4',
		5: 'grid-cols-5'
	};
	// Five is the ceiling because five is what a pack gives: on a full-view sheet the whole
	// of a pull stands in one row, which no smaller count can do without putting part of it
	// on a second one.
	const columnClass = (count: number): string =>
		COLUMN_CLASSES[Math.min(5, Math.max(1, Math.round(count)))];

	// One revealed cell, marked or not. What a pack *added* is not something a player
	// can read off the cards themselves — five statues look the same whether they are
	// the first of their kind or the fifth — so the ones that are new to the collection
	// are ringed in the primary and the rest are ringed in nothing.
	//
	// A border either way, and never none: the two states must not differ by a couple of
	// pixels of box, or a row with one repeat in it would sit a hair out of line with the
	// rest. The transparent one holds the same space and shows what is behind it.
	//
	// `flex` rather than a plain block, so the avatar in the last cell is handed the
	// row's height to centre a square in — see PlayerAvatar, which centres what it is
	// given but cannot invent a height to centre it in.
	const cellClasses = (isNew: boolean): string =>
		classNames('flex rounded-md border-2', isNew ? 'border-primary' : 'border-transparent');

	function pick(pack: OpenerPack): void {
		selected = pack.id;
		dispatch('select', pack);
	}

	function back(): void {
		selected = null;
		dispatch('back');
	}

	// Slice the standing pack open: roll its booster and stand up whatever it gives.
	// A refusal resolves to no cards at all — the host is the one that says why (it
	// holds the claim panel the refusal is reported on), so this only reports how many
	// came out, zero included.
	async function open(): Promise<void> {
		const pack = selectedPack;
		if (!pack || opening || pulls) return;
		const id = pack.id;
		opening = true;
		// The box comes apart on the tap and not on the answer: the tap is the box being opened, and
		// whatever the roll takes is time the opened box stands there.
		unsealing = true;
		uncovering = false;
		unsealed = false;
		forgetStatues();
		try {
			const opened = await pack.claim();
			// Another pack came forward while the roll was in flight — its cards are
			// not this one's to show.
			if (shown !== id) return;
			const cards = opened.pulls;
			pulls = cards;
			avatar = opened.avatar;
			avatarIsNew = opened.avatarIsNew;
			dispatch('openComplete', cards.length);
			// The cards go up behind the box from here, and the box waits on them. Start the cap
			// with them: what it guards against is a picture that never arrives, which cannot
			// happen before there are pictures to wait for.
			if (cards.length > 0) {
				statuesTimer = setTimeout(() => {
					statuesTimer = null;
					statuesTimedOut = true;
				}, STATUES_WAIT);
			}
		} finally {
			if (shown === id) {
				opening = false;
				// The roll threw rather than answering with cards: the box is whole again, since a box
				// that opened onto nothing at all never opened. Why is the host's to say, as every
				// other refusal is.
				if (!pulls) {
					avatar = null;
					avatarIsNew = false;
					unsealing = false;
					uncovering = false;
					unsealed = false;
					forgetStatues();
				}
			}
		}
	}

	onDestroy(forgetStatues);
</script>

<div class={classNames('flex min-h-0 flex-col gap-3', classes)}>
	{#if selectedPack}
		<!-- One pack, stood up: it takes the whole height it is given, and the tap that
			opens it is the pack itself. Once it is open the cards stand in its place. -->
		<div class="flex flex-none justify-end">
			<button type="button" class="btn btn-ghost btn-xs" on:click={back}>
				Tots els sobres
			</button>
		</div>

		<!-- The cards and the box stand in one box, the cards in it and the box over them: what
			a pack gave is stood up the moment the roll answers, behind a box that is still there
			crazed, so its statues are measured, their art is fetched and their pictures are up while
			the squares are still holding — and the box does not come apart until they say they are (see
			`cardsUp`, handed over as its `ready`). That is the whole of the fix: the crumble used to
			end on an empty panel that then filled itself in, because the cards were not so much as
			mounted until the last square had gone.

			They are hidden and not undrawn while they wait, and hidden by opacity rather than by
			`hidden`: a card taken out of the layout has no width, a sprite with no width never places its
			sheet, and a sheet never placed never loads — the box would be waiting for pictures its own
			waiting had stopped. At nought opacity they are laid out and fetched exactly as if they were
			being looked at, and `pointer-events-none` keeps a card nobody can see from answering a
			tooltip.

			They come up the moment the box starts to go rather than when it has gone, over the second the
			squares take to dissolve (`duration-1000` is the box's own SHELL_FADE said in CSS). Uncovering
			is not one moment: inside the box's silhouette the squares hand the cards over as they blur
			away, and outside it — a stood-up box fills one measurement of this space and the cards fill
			both — there is nothing to hand anything over, so the fade is what brings those in. One second
			for both, so the box's card and the cards it held cross in the middle. -->
		<div
			class="relative flex min-h-0 min-w-0 flex-1 flex-col"
			aria-busy={unsealing && !unsealed}
			bind:clientWidth={bodyWidth}
			bind:clientHeight={bodyHeight}
		>
			{#if pulls}
				{#if pulls.length}
					<!-- Three boxes and not one, because the cards are doing three things at once: this
						one scrolls, the one inside it centres, and the grid inside that lays the cards out.
						They cannot be the same box — a grid that centred its rows *and* scrolled would put
						its first row above the top of its own scroll, where nothing can reach it, which is
						what a centred overflow always does. Kept apart, the middle box is exactly as tall as
						the scroller while the cards fit and grows past it when they do not, so the centring
						gives way to scrolling instead of fighting it.

						What they are centred on is the front of the box and not this space: the padding is
						twice the drop (see `frontDrop`), which against a border-box height moves the middle
						down by half of it and leaves the box its own height, so a pull that fits adds
						nothing to scroll. It comes through as a custom property, being a measured length no
						class can carry.

						The cards keep their own height whichever way it goes: rows left to take a share of
						whatever height is spare would stand five cards at two different sizes, and a row of
						statues has to read as one row. -->
					<div
						class={classNames(
							'min-h-0 flex-1 overflow-y-auto transition-opacity duration-1000',
							uncovering ? 'opacity-100' : 'pointer-events-none opacity-0'
						)}
					>
						<div
							class="flex min-h-full items-center pt-[calc(var(--front-drop)*2)]"
							style:--front-drop="{frontDrop}px"
						>
							<div class={classNames('grid w-full gap-2', columnClass(revealColumns))}>
								{#each pulls as pull (pull.spawn.id)}
									<div class={cellClasses(pull.isNew)}>
										<!-- Bare, and not behind a veil of its own: the box dissolving over it is the
											reveal, and a sprite veil under that would spend a character's one reveal on
											a sweep held behind something opaque (see IdleSprite's `veiled`). What it
											says instead is when its picture is up, which is what the box is waiting to
											hear. -->
										<CharacterStatue
											characterId={pull.spawn.characterId}
											label={pull.label}
											basePath={pull.basePath}
											color={pull.color}
											box={pull.spawn.box}
											locationName={pull.locationName}
											spawnedAt={pull.spawnedAt}
											showId={pull.spawn.showId}
											veiled={false}
											classes="w-full min-w-0"
											on:ready={() => statueUp(pull.spawn.id)}
										/>
									</div>
								{/each}

								{#if avatar}
									<div class={cellClasses(avatarIsNew)}>
										<!-- The avatar the box dealt, in the cell after the last card. It is the
											same component the player's own row wears (see ProfileTile), in the
											colour it was dealt in, because what is shown is the very thing that
											will be standing there once it is picked — not a picture of it. It
											fills its cell, so it is as wide as a card and reads as one of the
											things the box gave rather than as a note about them. Unnamed: a
											statue says which character it is because a card is a character, and
											an avatar is a face. -->
										<PlayerAvatar
											characterId={avatar.characterId}
											color={avatar.color}
											size="w-full"
											classes="w-full"
										/>
									</div>
								{/if}
							</div>
						</div>
					</div>
				{:else}
					<!-- The pack sliced open onto nothing. Why is the host's to say — every
						refusal lands on its claim panel — so this only keeps the box from
						reading as a pack that never opened. -->
					<div
						class={classNames(
							'flex min-h-0 flex-1 items-center justify-center p-6 text-center transition-opacity duration-1000',
							uncovering ? 'opacity-100' : 'pointer-events-none opacity-0'
						)}
					>
						<p class="max-w-xs text-sm opacity-60">El sobre s'ha obert buit.</p>
					</div>
				{/if}
			{/if}

			{#if !unsealed}
				<!-- The box, over whatever is waiting under it and gone from the document the moment it
					says it has gone — a box that stayed would keep the cards under a button. A container,
					so the box standing in it can be capped by this width as well as by this height.
					`max-w-full` cannot do that job: an absolute max on the box resolves against the
					button, and the button has already grown to whatever width the box asked for, so the
					pair overflow together — measured at a sidebar's width, a box given the full height came
					out 392px wide in a 230px panel. -->
				<div class="@container absolute inset-0 flex min-w-0 justify-center">
					<button
						type="button"
						class={classNames('flex min-h-0 min-w-0 items-center justify-center', {
							'cursor-wait': unsealing,
							'cursor-pointer': !unsealing && interactive
						})}
						disabled={!interactive || unsealing}
						aria-label="Obre el sobre"
						on:click={open}
					>
						<!-- Stood up, the pack fills whichever of the two the box runs out of first: as
							tall as the space allows, unless the width allows less, in which case it is as
							tall as this width earns it. The ratio is the box's, so this only says which
							measurement decides — and it has to be said as a height, since that is the one
							the box does not work out for itself.

							What the width is measured against is the *front*, in its totality: the face and
							the two bevel faces the corner cuts opened down its sides, which together are
							89.406% of the box (a face four fifths of the width, plus 4.703% either side —
							see BEVEL_FACE). So the box is drawn 1/0.89406 of this container, and its front
							spans the container edge to edge; the lid, being the full width of the box, is
							the one part that runs past — 5.9% of the container each side, which is a
							sidebar's own padding and no more. Fitting the *box* to the container is what
							used to be asked for (a bare 1.23333 of the width), and it left the poster
							standing inside two gutters a tenth of the panel wide apiece. The height factor
							is the two together: 30:37 of a width, 1.23333, over that 0.89406.

							`items-center` on the button matters as much as the cap: a flex item is stretched
							to its line by default, and a stretched height beats a height read off the
							aspect, which is what left the box a tall thin slab of the panel's full height
							rather than a box.

							The tap tells it to come apart, the cards under it tell it when it may finish, and
							it says when it has. Nothing is dimmed and nothing spins over it: a box that has
							tiled itself is its own answer to having been tapped, and it now holds that state
							for as long as the wait lasts — where before it went whatever was or was not ready,
							which is what left a spinner to explain the emptiness afterwards. -->
						<BoosterBox
							coverUrl={selectedPack.coverUrl}
							logoUrl={selectedPack.logoUrl}
							showId={selectedPack.showId}
							locationName={selectedPack.locationName}
							caption={selectedPack.caption ?? null}
							light={selectedPack.light}
							opening={unsealing}
							ready={cardsUp}
							classes="h-[min(100%,100cqw*1.37948)]"
							on:uncovering={() => (uncovering = true)}
							on:opened={() => (unsealed = true)}
						/>
					</button>
				</div>
			{/if}
		</div>
	{:else}
		<!-- Two grids, the towns of festa today above the rest of the window. The window runs
			three days back through four ahead, so most of what is on offer belongs to a festa
			that is over or has not started — the ones happening now were spread through that
			list in date order, which is a reason to look for them rather than a way of being
			shown them. They come out of the list rather than being repeated at the head of it:
			one booster is one box, and the same town offered twice is two tiles that open the
			same pack.

			The split is drawn by the boxes themselves — today's are printed on white card and
			the rest on black — so neither grid needs a heading to say which it is. One scroller
			holds both, so the panel scrolls as one list; each grid packs to its own top, a row
			given a share of the spare height being a row that draws its packs taller than the
			one below it. -->
		<div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
			{#each [todayPacks, windowPacks] as group, index (index)}
				{#if group.length > 0}
					<div class={classNames('grid flex-none content-start gap-3', columnClass(columns))}>
						{#each group as pack (pack.id)}
							<button
								type="button"
								class="flex min-w-0 flex-col"
								disabled={!interactive}
								title={pack.label}
								on:click={() => pick(pack)}
							>
								<BoosterBox
									coverUrl={pack.coverUrl}
									logoUrl={pack.logoUrl}
									showId={pack.showId}
									locationName={pack.locationName}
									caption={pack.caption ?? null}
									light={pack.light}
								/>
							</button>
						{/each}
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>
