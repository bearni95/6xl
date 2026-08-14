<script context="module" lang="ts">
	// What share of its own width a full row covers. The three cells come to 110% of it and the
	// middle pulls 15% of that back over the two beside it, so 95% is drawn and 5% is spare (see
	// `cellShares`, which says why the shares are not simply made to add up).
	//
	// Exported because a surface that has to line this row up with something else cannot work it
	// out from outside — a booster box's front, which the cards it opens onto stand edge to edge
	// with. Such a surface asks for 1/0.95 of the width it wants covered and centres the row in
	// it (`classes="justify-center"`), which puts the drawn ends exactly on the ends it is
	// matching. Everything else hands the row a width and lets the 5% fall where it falls.
	export const LINEUP_ROW_SPAN = 0.95;
</script>

<script lang="ts">
	import classNames from 'classnames';
	import { createEventDispatcher, onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import CharacterStatue from '$components/core/CharacterStatue.svelte';
	import PlayerAvatar from '$components/core/PlayerAvatar.svelte';
	import ShowIcon from '$components/core/ShowIcon.svelte';
	import { showLogos, loadShowLogos, showGlyphs } from '$services/shows.service';
	import { REGION_BAND_CLASSES } from '$components/core/spawn-colors';
	import { SpawnBox, type SpawnColor } from '$types/character-spawn.type';
	import { ArtificialColor } from '$types/region-color.type';

	// The team as a row of cards — who is fielded, what colour they bend, where they
	// were claimed and what show they come from. The card itself is CharacterStatue's;
	// this is only the row, sharing its width between them, and the banner over it that
	// says whose side it is — the lead's colour and the lead's show, in the show's own
	// lettering. That is the row's, not a statue's: a card says the show it is from with
	// the mark on its floor, and a side says the show it flies once, over all three.

	// One entry per team member, in the order they are fielded (the leader first).
	// `spawnedAt` is what a real card was minted at, and it is optional for the same
	// reason its claim place is: a town's seeded house team was never minted, so it
	// leaves the year out and the statue says the place alone. `box` is optional on the
	// same grounds — a side that was never pulled out of anything is printed black, the
	// statue's own default and what the commoner box is.
	export let members: {
		characterId: string;
		label: string;
		basePath: string | null;
		color: SpawnColor;
		box?: SpawnBox;
		locationName: string | null;
		spawnedAt?: string | number | Date | null;
		showId: number | null;
	}[] = [];
	// Mirror the characters — true (the default) is the player's own side.
	export let flipped: boolean = true;
	// Passed straight through to every statue: veil each character even where the session
	// has already watched it arrive. The row has no opinion on whether a reveal is worth
	// spending — the surface standing it up does. The map's corner spends none (a side that
	// re-frames itself as the map moves would flicker); the roster spends one on every card,
	// being the place a player comes to look at them.
	export let alwaysReveal: boolean = false;
	// Whether a member can be pressed. False wherever the row is a picture of a side — the
	// map's corner, a town's pin — since a button around a statue would offer a press that
	// does nothing. True on the roster, where pressing a member is how it comes off the
	// team; it is dispatched as `select` with the member's own index, which is the index it
	// arrived at and not the place the row stood it in.
	export let selectable: boolean = false;
	// Passed straight through as well: whether a character arrives behind a veil at all.
	// False for a surface that uncovers the row itself — a booster box dissolves over its
	// cards, and a veil under that would spend a character's one reveal behind something
	// opaque. Such a surface waits instead on `ready`, which each statue says when its
	// picture is up and this row forwards with the member it was said of.
	export let veiled: boolean = true;
	// Whether this side is nobody's: a town's seeded house team, rolled from its own seed and
	// never claimed by a player. Such a side flies the map's own grey on its banner whatever
	// colour the seed happened to bend its lead — the same rule the terrain, the pins and the
	// crumbs already follow (ArtificialColor.Gray; see buildTownColors on the map). A colour on
	// this map is a claim, so a band in one of the six over an unheld town would say somebody's
	// red holds it. The statues under it keep their rolled colours: those are what the three of
	// them fight in, which is a fact about the cards and not about who the place belongs to.
	export let seeded: boolean = false;
	// Whether the row flies its lead's show over it at all. False where the three cards are not
	// a side: what a booster box opens onto is five cards dealt out of one box, stood in this
	// row because the row is the shape a handful of cards is read in — the first of them leads
	// nothing, and a band in its colour lettered with its show would say the pull belonged to
	// somebody's team. The box the cards came out of has already said which show they are from,
	// on its own poster, and each card goes on saying it with the mark on its floor.
	export let bannered: boolean = true;
	// Whether the three cards are drawn at all. False leaves the coloured mark standing on its
	// own — the band and the tab naming the player under it — and nothing else: no statue is
	// mounted, so no clip is loaded, no frame is decoded and no loop is run.
	//
	// It exists for the fold at the foot of a phone (see the map page): folded, the side is cut
	// to exactly that mark, and three sprites playing behind the cut are three sprites nobody
	// can see. Taking them out is also what gives each unfolding its arrival back — a statue's
	// veil is spent on the way in and never again (see IdleSprite's `revealedPaths`), so a row
	// that is mounted fresh each time is a row that can be watched arriving each time.
	//
	// The mark is absolutely positioned over the row's head room, so with no cards under it the
	// row would measure nothing and the mark would be painted over whatever came next. The row
	// is given the mark's own height instead — its two lengths, said here because this is the
	// one place that has to stand them up without the cards (see the banner below).
	export let statues: boolean = true;
	// Whose side this is, for the face at the head of the banner: the name they are called
	// by — already worded for a player who never chose one, exactly as a town's plate words
	// its holder — and the two halves of the avatar they wear, which are only ever read
	// together (see PlayerAvatar; both null is the initial-letter avatar, drawn off the name).
	//
	// It is the OWNER of the side and never a member of it: the map's corner and the roster
	// hand over the reader's own account, a town's pin hands over whoever holds the town, and
	// a public profile hands over the player whose page it is. So the band says the same two
	// things a card does — whose these three are, and what show they fly.
	//
	// Null where nobody is behind the side, which is what `seeded` already means and is drawn
	// the same way: the robot stands in for the face (see below).
	export let owner: {
		name: string;
		characterId: string | null;
		color: SpawnColor | null;
		level: number;
	} | null = null;
	export let classes: string = '';

	const dispatch = createEventDispatcher<{
		select: { index: number };
		ready: { index: number };
	}>();

	// Whether something other than a member is standing in the middle of the row. The one
	// thing that is ever put there is a face — the avatar a booster box deals, which comes
	// out of the same box as the cards either side of it and is not one of them.
	$: hasMiddle = Boolean($$slots.middle);

	// The three cells: 35% of the row to each flank and 40% to the middle, which is
	// pulled 7.5% over each of the two beside it. Said as widths — a basis that neither
	// grows nor shrinks — rather than as shares of what is left, so each cell measures
	// exactly the figure it was given whatever the row turns out to be. Shares were how
	// this read while the three of them and the margins happened to come to a whole row;
	// these do not (110% of basis less the 15% the middle pulls back is 95%), so the row
	// carries 5% of empty at its far end, and a share would have quietly handed that out
	// again and made every cell wider than it says.
	// The middle is raised because overlapping is a question of paint order otherwise,
	// and paint order runs one way: it would cover the flank before it and be covered by
	// the flank after it, which is an overlap on one side only.
	// All three are raised over the banner behind them, and the middle over the two flanks:
	// the band is the ground this side stands on, so a head that reaches into it stands in
	// front of it rather than being cut off at its edge. Two levels and not one, since flanks
	// level with the middle would leave the last-painted of them lapping the middle back.
	// Written out as whole classes because Tailwind only emits what it can see spelled.
	// Any cell past the third (there is no such team) falls back to a flank's width.
	const cellShares = [
		'relative z-10 shrink-0 grow-0 basis-[35%]',
		'relative z-20 -mx-[7.5%] shrink-0 grow-0 basis-[40%]',
		'relative z-10 shrink-0 grow-0 basis-[35%]'
	];

	// Where each member stands. The team arrives in slot order — the leader first — and the
	// row's middle is the wider piece lapped over the two beside it, so that is where the
	// leader goes: the one the row is about stands in front of their side rather than at the
	// end of it. Only the first two trade places; everyone after keeps the order they came
	// in, so nothing is ever dropped by being arranged. A side of one has no middle to stand
	// in and is left where it is.
	// Each carries the index it arrived at, so what a press says is which member was
	// pressed rather than which cell it happened to be standing in.
	$: standing = members.map((member, index) => ({ member, index }));
	$: lineup =
		standing.length < 2 ? standing : [standing[1], standing[0], ...standing.slice(2)];

	// The cells the row actually stands, in the order they are drawn. With something else in
	// the middle the members do not trade places: the swap exists to bring the leader into
	// that cell, and the cell is taken — so they simply fill the places either side of it in
	// the order they arrived, and the first of them keeps the front of the row.
	$: cells = hasMiddle
		? [
				...standing.slice(0, 1).map((entry) => ({ middle: false as const, ...entry })),
				{ middle: true as const },
				...standing.slice(1).map((entry) => ({ middle: false as const, ...entry }))
			]
		: lineup.map((entry) => ({ middle: false as const, ...entry }));

	// The logos are not fetched by being subscribed to (the glyphs are; these are not), so the
	// row asks for them itself — every row, since every row is bannered. The load is memoised in
	// the service, so a screen full of these shares the one read of the collection.
	onMount(() => void loadShowLogos());

	// The side's lead, whose colour and show the banner is: the first member as it arrived,
	// never the cell the row stood it in — the same lead the map takes a held town's show from,
	// so a side flies the one show wherever it is drawn. Null for a row with nobody in it, which
	// draws no band — a colour with no side under it is a stripe of paint.
	$: lead = members[0] ?? null;
	// The lead's show as the author enabled it, or null where the side flies none, where the
	// show has no logo enabled, and until the collection lands — the band is then the colour
	// alone. Nothing stands in for a missing wordmark: this band is not where a reader finds
	// out what show it is (the statues under it carry the mark, and the roster names it), so a
	// name lettered in its place would be a second kind of banner.
	$: bannerLogo = lead?.showId != null ? ($showLogos.get(lead.showId) ?? null) : null;
	// The same show's glyph, which stands at both ends of the band. Unlike the logos these are
	// fetched by being subscribed to, so naming the store here is what asks for the collection.
	// It is read off the lead's show and not off the wordmark: the glyph is the show's own mark,
	// so a show with a picked glyph and no enabled logo flies the two marks and no lettering,
	// exactly as a show with neither flies the colour alone.
	$: bannerGlyph = lead?.showId != null ? ($showGlyphs.get(lead.showId) ?? null) : null;
	// What the band is painted: the lead's colour where a player is behind this side, the map's
	// grey (the same 500 weight the pins spell it) where nobody is — both at nine tenths, since
	// a band lies over the row rather than closing it off.
	$: bandFill = REGION_BAND_CLASSES[seeded || !lead ? ArtificialColor.Gray : lead.color];

	// Whether the face at the head of the band is a player's or the robot's. A side rolled
	// from a town's own seed belongs to nobody — there is no account behind it to have a
	// picture — so it wears the one mark that says so, on exactly the bands that already fly
	// the map's grey rather than somebody's colour. A side with no owner named is drawn the
	// same way for the same reason.
	$: nobodys = seeded || !owner;

	// The letter under a face nobody has picked yet, off the name shown beside it wherever
	// that name is shown — the same spelling the account's own plate and a town's holder row
	// use, so one player is one letter everywhere they appear.
	$: ownerInitial = (owner?.name || '?').charAt(0).toUpperCase();

	// What the row stands on when there are no cards in it (see `statues`): the height of the
	// mark alone, which is the 3rem band plus the 1.25rem tab wherever there is somebody to
	// name on it. Both are absolutely positioned, so without this the row measures zero and
	// the mark lies over whatever the surface put after it.
	// Nothing when the cards are there — they are what the row is measured by — and nothing
	// where there is no mark either, an empty row being an empty row.
	$: markOnlyHeight =
		statues || !(lead && bannered) ? '' : nobodys ? 'min-h-12' : 'min-h-[4.25rem]';
</script>

<div class={classNames('relative flex w-full', markOnlyHeight, classes)}>
	<!-- The side's banner: the whole width of the row and hung off its top edge, so it lies
		across the head room every statue carries above its square rather than taking a strip of
		the row's height away from the cards. It is painted in the lead's colour with the ink that
		reads on it (REGION_BAND_CLASSES — yellow is the one swatch that wants black), or in the
		map's grey where the side is nobody's (see `seeded`). The fill is the swatch at nine
		tenths and the ink is not: a band lying over the row lets a little of what it lies on
		through, while the lettering and the marks on it stay solid.
		Four marks stand on it, pushed apart to its two ends: the show's glyph, then the face of
		whoever the side belongs to with the show's wordmark beside it, then the show's glyph
		again. The middle two are one group — a side is whose it is and what it flies, and those
		two things are said together or the band is a show with a stranger's picture loose on it.
		All four are **2rem tall and told so**, which is the one arrangement in which they agree.
		Height is what the band is built out of rather than
		what it is given — the band is the padding around a row of that height, so it is the same
		band under every show and the colour keeps a clear margin above and below the lettering
		instead of running up against it. The wordmark is `h-8` at its own aspect, however wide
		or narrow it was drawn, the glyphs are `h-8 w-auto` at theirs, and the face is a `w-8`
		square (PlayerAvatar reads the square off the width). None is asked for a
		share of anything: a mark sized `h-full` is a percentage of a row that is only as tall as
		its own contents, which resolves to auto and leaves a glyph at the 1em its markup was
		rewritten to (see inlineIconMarkup) — a mark a third the height of the lettering beside
		it, which is what this arrangement is the fix for. The row keeps two fifths of the width
		clear of the middle, twice what it kept before, since that clearance is where the
		glyphs stand — and it is the group that is held to three fifths now rather than the
		wordmark alone, so a face cannot buy itself room out of the glyphs' clearance. The
		wordmark is not recoloured — the enabled logos are coloured lettering
		with a light outline, which reads on any of the six — and the glyphs take the band's own
		ink, being inline svg (see ShowIcon). Only the face is always there: a side whose show
		has no wordmark, no glyph or neither — or whose marks are still on their way — flies the
		same band at the same height and never a thinner stripe that grows when one lands, and
		with nothing at its ends to be pushed away from the row centres what it does have.
		Behind the statues, all three of which are raised over it (see cellShares): the band is
		the ground the side stands on, not a lid over it. Drawn only where the row is a side at
		all (see `bannered`); it is hung off the top edge rather than taking a strip of the row,
		so a row without it stands its cards in exactly the same places. -->
	{#if lead && bannered}
		<div
			class={classNames(
				'absolute inset-x-0 top-0 z-0 flex min-h-12 items-center rounded-md px-2 py-2',
				bandFill
			)}
		>
			<div
				class={classNames('flex h-8 w-full items-center gap-2', {
					'justify-between': bannerGlyph,
					'justify-center': !bannerGlyph
				})}
			>
				<ShowIcon markup={bannerGlyph} classes="[&>svg]:h-8 [&>svg]:w-auto" />
				<!-- The middle of the band, and it is two marks and not one: whose side this is,
					then what show it flies. The face stands to the LEFT of the wordmark and inside
					the same group, so the two are read as the one statement and travel together —
					centred where there is no glyph to be pushed away from, held off the ends by the
					glyphs where there is.
					The `max-w-[60%]` that was the wordmark's is the GROUP's now, which is what keeps
					the clearance the two glyphs stand in from being eaten by a face: the band still
					keeps two fifths of its width clear of the middle, and the wordmark takes what is
					left of that once the face has had its 2rem. `min-w-0` on both, so a wide wordmark
					shrinks inside the cap rather than pushing it. -->
				<div class="flex min-w-0 max-w-[60%] items-center gap-2">
					{#if nobodys}
						<!-- Nobody's side: the town's own seed rolled these three and no account is
							behind them, so the face is a robot. It is the vendored game-icons mark
							(delapouite/robot-antennas) drawn as an `<img>` by URL, which is how the
							canvas-side icons are held in this project — white artwork, and the grey
							band's ink is white, so it wants no colour of its own. It is not framed as
							a portrait is: there is no picture here to put in a frame, and a square of
							backdrop under a robot would read as an account that has one. -->
						<img
							src="/assets/icons/delapouite/robot-antennas.svg"
							class="size-8 flex-none"
							alt=""
						/>
					{:else}
						<!-- The player behind the side, wearing the very avatar their own plate wears
							— the same component, so a face changed in the picker is changed on every
							band that player's side stands on, and a stranger's face on a town's pin is
							the face their profile page shows.
							`ownColors={false}` at every one of those: a band is somebody's side and
							not always the reader's, and a letter avatar printed on the READER's team
							colour would be saying a thing about whoever's side this is that is not
							true. `w-8` matches the glyphs' `h-8` beside it, the square being read off
							the width (see PlayerAvatar). -->
						<PlayerAvatar
							characterId={owner!.characterId}
							color={owner!.color}
							initial={ownerInitial}
							ownColors={false}
							size="w-8"
							textClasses="text-sm font-bold"
							classes="flex-none"
						/>
					{/if}
					{#if bannerLogo}
						<img
							src={bannerLogo.url}
							alt={bannerLogo.name}
							class="h-8 min-w-0 object-contain"
						/>
					{/if}
				</div>
				<ShowIcon markup={bannerGlyph} classes="[&>svg]:h-8 [&>svg]:w-auto" />
			</div>
		</div>

		<!-- Who the side belongs to, said in words: the name they are called by and the level
			they are at, which is how every other surface in this game names a player (see
			PlayerPanel and PublicPlayerCard, both of which put those two and no more on the
			plate). The face on the band is the same account seen a different way; this is the
			part of it that has to be read rather than recognised.
			OUTSIDE the coloured bar and centred under it — `top-12` is the band's own height,
			the row inside it being `h-8` in `py-2` — so the bar keeps its four marks and its
			margins, and the name hangs from its bottom edge as a caption does. Absolutely
			placed, so it takes no height of its own from a row whose height is the cards': the
			banner already lies across the statues' head room rather than in the row, and a
			caption in the flow would have pushed the three of them down by however long the
			name ran.
			`z-30` is over the statues (10) and the middle one that laps them (20). It has to
			be: this is type over pictures, and the pictures are opaque. It is also why the row
			is a SIBLING of the band rather than a child of it — the band carries `z-0`, which
			makes it a stacking context of its own, and nothing inside a z-0 box can rise past a
			z-10 box beside it however high it is numbered.
			It carries the BAND'S OWN FILL, and its ink with it (`bandFill` is the pair), which
			is what makes it part of the plate rather than lettering dropped on the statues: the
			two shapes meet with nothing between them, so a side flies one coloured mark that
			happens to be a bar with a tab under it. That also settles what colour the type is —
			it is on the swatch now, so it takes the ink picked to read on the swatch, which is
			black on yellow and white on the other six. Rounded at the foot alone
			(`rounded-b-md`), the corners it shares with the bar being no corners at all.
			`whitespace-nowrap` and `-translate-x-1/2` off the centre, so a long name grows into
			the row on both sides and stays centred rather than truncating: nothing here is a
			column with a width to keep — the whole row is only as wide as it is — and a name
			cut in half names nobody.
			Its height is a fixed 1.25rem — `text-xs` is a 1rem line box, `py-0.5` the quarter
			round it — and that is a number something else has to know: on a phone the side folds
			to exactly the band and this tab, so what the fold leaves standing is spelled 3rem +
			1.25rem there (see the map page's fold box). A tab that changed height would leave
			the strip cutting through it.
			Only where there IS somebody, which is the same question the face asks (see
			`nobodys`): a side rolled from a town's own seed has no account to name, so it wears
			the robot and says nothing under it. The fold does not shrink for those — it is one
			length, and a length that moved with what happened to be standing in the panel would
			re-frame the map every time an account signed in. -->
		{#if !nobodys}
			<div
				class={classNames(
					'pointer-events-none absolute left-1/2 top-12 z-30 -translate-x-1/2 whitespace-nowrap rounded-b-md px-2 py-0.5 text-xs font-semibold',
					bandFill
				)}
			>
				{owner!.name}
				<span class="opacity-80">
					{$_('profile.levelBadge', { values: { level: owner!.level } })}
				</span>
			</div>
		{/if}
	{/if}

	<!-- The statue is the same picture on either surface, so it is written once and the
		cell's share of the row goes to whichever element is standing it up: the statue
		itself where the row is a picture of a side, and the button around it where a press
		means something. A row that is only looked at gets no button at all rather than a
		dead one — the map's corner and a town's pin are exactly the markup they always
		were.
		None of it where the surface has asked for the mark alone (see `statues`): not a hidden
		card, not a card at no opacity — no statue in the document at all, which is the only
		state in which nothing is being loaded, decoded or looped for it. -->
	{#if statues}
		{#each cells as cell, place (place)}
			{#if cell.middle}
				<!-- Whatever was handed to the middle, in the cell the leader would have stood in and
					at the same share of the row: raised over the two beside it, lapped over both. It is
					centred down the cell because it is not a statue and has no ground to stand on — a
					face is a square, and a square as wide as this cell is nothing like as tall as the
					card either side of it. -->
				<div class={classNames('flex min-w-0 items-center', cellShares[place] ?? cellShares[0])}>
					<slot name="middle" />
				</div>
			{:else}
				{@const statue = {
					characterId: cell.member.characterId,
					label: cell.member.label,
					basePath: cell.member.basePath,
					color: cell.member.color,
					box: cell.member.box ?? SpawnBox.Black,
					locationName: cell.member.locationName,
					spawnedAt: cell.member.spawnedAt ?? null,
					showId: cell.member.showId,
					flipped,
					alwaysReveal,
					veiled
				}}
				{#if selectable}
					<button
						type="button"
						class={classNames(
							'min-w-0 rounded-box transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
							cellShares[place] ?? cellShares[0]
						)}
						on:click={() => dispatch('select', { index: cell.index })}
					>
						<CharacterStatue
							{...statue}
							classes="w-full"
							on:ready={() => dispatch('ready', { index: cell.index })}
						/>
					</button>
				{:else}
					<CharacterStatue
						{...statue}
						classes={cellShares[place] ?? cellShares[0]}
						on:ready={() => dispatch('ready', { index: cell.index })}
					/>
				{/if}
			{/if}
		{/each}
	{/if}
</div>
