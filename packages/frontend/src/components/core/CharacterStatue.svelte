<script lang="ts">
	import classNames from 'classnames';
	import IdleSprite from '$components/core/IdleSprite.svelte';
	import ShowIcon from '$components/core/ShowIcon.svelte';
	import restoreCatalanArticle from '$utils/string/restore-catalan-article';
	import { spawnYearLabel } from '$utils/spawn/year';
	import { forShow } from '$utils/show/show-icon';
	import { showGlyphs } from '$services/shows.service';
	import { SPAWN_FILL_CLASSES } from '$components/core/spawn-colors';
	import { SpawnBox, type SpawnColor } from '$types/character-spawn.type';

	// One character, as this game draws one: a statue of them — standing on a tilted
	// floor in their own colour with their show's mark painted on it, and, where there is
	// room for it, a panel underneath saying their name and the place they were claimed.
	//
	// What their colour grants them for free in a fight is not on the card at all: the
	// colour is on it, and the colour is what says so (see `colorPassives`) — a glyph
	// repeating it was a second copy of the same fact and is drawn nowhere here.
	//
	// It stands on its own: hand it a character from the seed or from Supabase — the
	// frames folder, a colour, and the two captions — and it assembles the whole
	// picture itself, taking nothing from the surface it is put on but its width. The
	// colour is the whole of a fighter, so what it grants is read off it here rather
	// than passed in: no caller has to know the game's rules to draw one.
	//
	// This is the only place that picture is built. The map's own corner grids the fielded
	// three onto one row; the picked town's pin stands the three holding it at a fixed
	// width out on the map — the difference between those surfaces is the width they hand
	// this statue, never a second drawing of the same thing.

	export let label: string = '';
	export let basePath: string | null = null;
	// The colour this copy bends — the whole of what one claimed card brings to a fight that
	// another doesn't, and the whole of what this card is painted in.
	//
	// Null is a statue of a *character* rather than of a card: the album, where what stands in
	// a cell is the fighter the game holds and not a copy anybody pulled, so there is no colour
	// to paint and nothing to say about a box. Such a statue is printed dark grey and lettered
	// white — see UNPAINTED — which is also what makes an unowned one legible at half strength:
	// a colour dimmed by half is a different colour, and grey is only ever more grey.
	export let color: SpawnColor | null = null;
	// The booster box this card came out of. It is not another colour on the card — it
	// is the ink: the show's mark on the floor and everything written on the panel are
	// drawn in it, and the bands the rows sit on in the other one. A card that says
	// nothing about where it came from — a town's garrison, a seeded side — is printed
	// black, which is what the commoner box is.
	export let box: SpawnBox = SpawnBox.Black;
	// Where the card was claimed — the town's name as the layer holds it, article and
	// all. Null leaves the name standing on its own.
	export let locationName: string | null = null;
	// When this copy was minted, in whatever form the row carries it. It is said as a
	// two-digit apostrophe year beside the place — 2026 reads '26 — since the panel has
	// room for a mark, not a date. Null leaves the place standing on its own — which is what
	// a card out of the welcome or a level box arrives with, its second row saying that box's
	// caption where a town would be, and a caption having no season to be from (see
	// `claimMintedAt`, where the three surfaces that stand these up decide it).
	export let spawnedAt: string | number | Date | null = null;
	// What the second row says instead of a claim place, for a statue that is not of a copy:
	// the album's, where the cell is a character and there is no town and no year to name. It
	// says the show they are cast in there — the same fact the glyph on the floor carries, in
	// the one place on the card a reader who does not know the mark can read it — and takes
	// the row over, since a card with nothing claimed has no season to be from either. Given
	// rather than read off `showId`: the names live with the logos, which a statue has no
	// business fetching.
	export let subtitle: string | null = null;
	// The TMDB id of the character's show — the one the admin `/characters` screen
	// assigns it. Its glyph is painted across the floor. Null, or a show with no glyph
	// drawn for it yet, leaves the floor bare rather than badging it with a stand-in.
	export let showId: number | null = null;
	// Mirror the character. True is the player's own side; false the unmirrored art a
	// rival side uses, so the two face each other.
	export let flipped: boolean = true;
	// Passed straight to the sprite: veil this character even if the session has already
	// watched it arrive somewhere else. A statue has no opinion on whether a reveal is worth
	// spending — the surface standing it up does (see IdleSprite's `alwaysReveal`).
	export let alwaysReveal: boolean = false;
	// Passed straight to the sprite as well: whether the character arrives behind a veil at all.
	// False for a surface that uncovers its statues itself — a pack's box dissolves to show them
	// (see PackGrid) — and such a surface waits for `ready`, which the sprite says when its
	// picture is up and this statue forwards.
	export let veiled: boolean = true;
	export let classes: string = '';

	// The ground: the square itself, laid down flat and seen in perspective, rather than
	// a trapezoid drawn to look like one. It is a real tilt, so whatever is put on the
	// tile — the show's glyph — is laid down with it instead of standing up on top of a
	// shape that merely resembles a floor.
	//
	// The two numbers are chosen to land the tile exactly where the drawn trapezoid used
	// to be. Turning a square of side S about its front edge by θ, seen from a distance
	// d, puts its back edge at d/(d + S·sinθ) of the front's width and a height of
	// S·cosθ·d/(d + S·sinθ) above it. Wanting a back edge half the front's and a depth of
	// a third of the square gives d = S·sinθ and cosθ = 2/3 — that is θ = 48.19° and
	// d = 0.7454·S. The distance is in cqw so it tracks the square's own width (the
	// square declares itself the container), CSS perspective taking no percentage.
	const GROUND_DEPTH = 1 / 3;

	// The block is four boxes — this floor, the panel, and a bevel face down each side of it —
	// and every one of its joins is two boxes that merely *meet*. Two boxes that meet exactly
	// leave a hairline: each edge is anti-aliased against the page rather than against its
	// neighbour, and this one is anti-aliased twice over, being a transformed layer. So the
	// page shows through every seam and the solid reads as pieces. Nothing here is off by a
	// hair — the numbers below are exact — so the answer is not to move a piece but to have
	// each join overlap by a pixel, always in the direction the later-painted piece covers.
	// This one is the earliest painted, so it is dropped a pixel: its front edge runs a pixel
	// under the panel and its two cut corners a pixel under the faces, all of it hidden behind
	// fill of the same colour, and the silhouette does not move. The nudge is applied after the
	// projection (leftmost is outermost), so it shifts the finished picture rather than the
	// square the projection is taken of, which has to stay a square for any of it to hold.
	const GROUND =
		'origin-bottom [transform:translateY(1px)_perspective(74.536cqw)_rotateX(48.19deg)]';

	// Its four corners are cut off — an octagon rather than a square, a tenth of each side
	// nearest a corner taken away. A tenth because the panel below is four fifths of the
	// card centred under it: taking a tenth off each end leaves the flat run along the
	// floor's front edge exactly the panel's own width, so the tile ends where the reading
	// begins and the two line up down both sides. The cut is made in the tile's own square
	// before the tilt, a transform mapping whatever shape is left, so the four diagonals are
	// laid down with the floor and read as bevelled edges of it rather than as notches in a
	// picture. There is nothing but fill to cut: neither the tile nor the panel is outlined,
	// a line around either being a line across a solid that is all one colour.
	const GROUND_CUT =
		'[clip-path:polygon(10%_0,90%_0,100%_10%,100%_90%,90%_100%,10%_100%,0_90%,0_10%)]';

	// What a cut corner leaves is a face, and these are the two front ones: the panel is the
	// front of the same block the floor is the top of, so each side of it carries the slanted
	// face the corner cut opened. They fill the two notches the cut takes out of the tile's
	// bottom corners and carry on down the panel's sides, which is what turns a clipped
	// square and a caption under it into one bevelled solid.
	//
	// Their geometry is read off the cut, not chosen. The cut's inner end is the tenth mark
	// along the bottom edge (x = 0.1 of the card); its outer end is on the tile's side a tenth
	// of the way back, which the perspective has drawn in to (1 − 1/1.1)/2 = 0.04545 of the
	// card and lifted 0.1·(2/3)/1.1 = 0.0606 above the front edge. So a face is 0.05455 of the
	// card wide, and the edge across its top rises 0.0606 over that width — 48.01°, which a
	// skew about the inner edge applies to the whole strip at once, top and bottom together,
	// leaving nothing vertical to measure: the strip is simply as tall as the panel it stands
	// beside. The width is in cqw against the card (the root declares itself a container), the
	// panel's own width being no use to a figure taken from the square.
	//
	// The pixel of overlap the floor gives the face along the cut, the face gives the panel along
	// its side: it is a pixel wider than the figure and pulled a pixel over the panel by a
	// negative margin, so its outer edge stays exactly where the cut leaves it and only its inner
	// edge moves — onto fill of its own colour. Widening it inward carries the skew's origin in
	// with it, which lifts the top edge by the same pixel's worth of slope; that lift is the
	// overlap the floor's own drop was aimed at, and it is the face, not the cut, that draws the
	// finished edge — the two lines being parallel, so what the reader sees is still one straight
	// bevel.
	const BEVEL_FACE = 'absolute inset-y-0 w-[calc(5.4545cqw_+_1px)]';
	const BEVEL_FACE_LEFT = 'right-full -mr-px origin-right [transform:skewY(48.01deg)]';
	const BEVEL_FACE_RIGHT = 'left-full -ml-px origin-left [transform:skewY(-48.01deg)]';

	// The character stands halfway up that plane — on the middle of the floor, with as
	// much of it behind them as in front.
	const BASELINE = GROUND_DEPTH / 2;

	// The two stocks, as everything drawn in the box's own colour and everything drawn
	// against it. The ink is the box: black card is read in black, white card in white.
	// The bands under the rows are the other one at the very opacities they always
	// carried — three tenths under the name, a fifth under the place — so a white card
	// veils its colour with black exactly as heavily as a black card veils it with white,
	// and the panel keeps the shape it had.
	//
	// Written out as whole classes because Tailwind only emits what it can see spelled
	// out: neither half of one of these can be built from `box` at runtime.
	const STOCK: Record<
		SpawnBox,
		{
			glyph: string;
			ink: string;
			inkMuted: string;
			rowName: string;
			rowPlace: string;
		}
	> = {
		[SpawnBox.Black]: {
			glyph: 'text-black/60',
			ink: 'text-black',
			inkMuted: 'text-black/70',
			rowName: 'bg-white/30',
			rowPlace: 'bg-white/20'
		},
		[SpawnBox.White]: {
			glyph: 'text-white/60',
			ink: 'text-white',
			inkMuted: 'text-white/70',
			rowName: 'bg-black/30',
			rowPlace: 'bg-black/20'
		}
	};

	// The stock a statue with no colour is printed on: dark grey card, white lettering, and the
	// bands under the rows the same white kept far lower than the two above spend it — a band
	// is a veil over a colour there, and here there is no colour under it to let through, only
	// the grey the card is. Grey rather than black so the card is an object with faces: the
	// bevel down each side of the panel is the fill under one flat black band, which on black
	// stock is black on black and no bevel at all. The show's mark keeps the strength it has on
	// a printed card, since it is painted on the floor either way.
	const UNPAINTED = {
		glyph: 'text-white/60',
		ink: 'text-white',
		inkMuted: 'text-white/70',
		rowName: 'bg-white/10',
		rowPlace: 'bg-white/5'
	};

	// Black for anything that arrives without a box, and for anything that arrives with
	// a word this card has no stock for — a statue is drawn either way.
	$: stock = color ? (STOCK[box] ?? STOCK[SpawnBox.Black]) : UNPAINTED;

	// What the card is painted: the colour, or the dark grey an uncoloured statue is printed on.
	// One name for the fill because it is the floor, the panel, both bevel faces and the veil
	// the character arrives behind — the card being one object in one colour is what says the
	// picture and the reading below it are the same thing.
	$: fill = color ? SPAWN_FILL_CLASSES[color] : 'bg-zinc-800';

	$: showIcon = forShow($showGlyphs, showId);

	// The gazetteer files the towns come from park the article after a comma to sort by
	// — "Vall de Boí, la" — so the statue puts it back at the front before saying it.
	// A caller that has already restored it hands over a name with no trailing article
	// to move, and gets it back untouched.
	$: place = locationName ? restoreCatalanArticle(locationName) : null;

	// The year the copy was minted, as the cards and the booster pack already say it.
	$: year = spawnYearLabel(spawnedAt);

	// What the second row actually carries. A subtitle takes the whole of it — it is what a
	// card with nothing claimed says in place of a claim, so there is no place beside it and no
	// season it could be from. Otherwise the row is the two it has always been.
	$: caption = subtitle ?? place;
	$: mark = subtitle ? null : year;
</script>

<!-- The card declares itself a container so the bevel's faces can be sized off its width:
	they are a share of the square above them, not of the panel they stand beside. -->
<div class={classNames('@container flex min-w-0 flex-col', classes)}>
	<!-- The box the character is seen through: a third again as tall as it is wide,
		which is the room a standing character needs. It draws nothing of its own — the
		floor and the panel below carry the colour. -->
	<div class="relative aspect-[3/4] w-full">
		<!-- The square at the foot of it is what the character is drawn against, and it
			stays 1:1 whatever the box around it is: the size a character comes out at is a
			share of this square, so a taller box would otherwise make every character
			taller with it. The ground is drawn across its bottom third and the rest of the
			box is head room above. The character stands at the height its own sprite earns
			it — a tall one fills the square, a short one does not — and nothing is inset or
			clipped, so no part of a frame is ever cut. -->
		<div class="@container absolute inset-x-0 bottom-0 aspect-square">
			<!-- The floor tile: the square laid flat. The show's glyph is painted across the
				whole of it — the same mark the map pins that show with — so it is tilted by
				the tile rather than sitting up on it, and the character stands in front of
				it. In the box's own ink, at less than full strength so it reads as painted on
				the ground and never as loud as whoever is standing on it. -->
			<div
				class={classNames('absolute inset-0', stock.glyph, GROUND, GROUND_CUT, fill)}
			>
				{#if showIcon}
					<!-- The colour is the tile's to set: the glyph paints in `currentColor`, so
						it takes it from here rather than carrying one of its own. -->
					<ShowIcon markup={showIcon} classes="absolute inset-0 [&>svg]:h-full [&>svg]:w-full" />
				{/if}
			</div>

			<!-- The loading veil's squares are painted the character's own colour, the same fill
				the floor under them and the panel below take, with the grid's shading laid over
				it. So what stands there while the art is on its way is the card's colour in
				another form rather than a grey stand-in, and the only thing that changes when the
				character arrives is that the colour stops being square. -->
			<IdleSprite
				{basePath}
				{label}
				{flipped}
				{alwaysReveal}
				{veiled}
				baseline={BASELINE}
				veilFill={fill}
				on:ready
			/>
		</div>
	</div>

	<!-- Who that is, then where and when they were claimed — on a panel in the same colour
		the floor is painted, so the card reads as one object in one colour rather than a
		picture with a caption. What they are from is not said in words on either half: the
		mark painted across the floor is the whole of it, as the colour is the whole of what
		they carry into a fight.
		Either line too long for the card is cut with an ellipsis rather than wrapped: a row
		of these must keep one height between them, whatever they are called and wherever
		they were pulled.

		The rows sit on four fifths of the floor's front edge, centred under it. That edge is
		the axis the tile turns about, so it is the square's own bottom line and the full
		width of the card; holding the panel just inside it keeps the picture the widest
		thing on the card and the reading narrower than the thing it is about. It is the same
		four fifths the tile's cut corners leave flat along that edge (see GROUND_CUT), so
		the panel's sides continue the tile's — change one of the two and the other has to
		follow. Nothing outlines it: a border would be a line where the two bevel faces meet
		its sides, holding them a pixel off the block they are faces of. -->
	<div
		class={classNames('relative w-4/5 min-w-0 self-center', stock.ink, fill)}
	>
		<!-- The bevel's two faces, hung off the panel's sides so they are as tall as it is
			whatever the rows come to (see BEVEL_FACE). They are the same colour the floor and
			the panel are, under one flat black band: a face turned away from the light is darker
			than the top it was cut from, and one band across the whole height is what says it is
			one face rather than the three the rows read as. Nothing is written on them, so they
			are hidden from a screen reader, which is being read the rows themselves. -->
		<div
			class={classNames(BEVEL_FACE, BEVEL_FACE_LEFT, fill)}
			aria-hidden="true"
		>
			<div class="absolute inset-0 bg-black/40"></div>
		</div>
		<div
			class={classNames(BEVEL_FACE, BEVEL_FACE_RIGHT, fill)}
			aria-hidden="true"
		>
			<div class="absolute inset-0 bg-black/40"></div>
		</div>

		<!-- Each row carries its own band over the colour, three tenths, a fifth and a tenth
			as the panel goes down: the veil is heaviest under the name and thins away below it,
			so the row that is read first stands off the colour furthest and the colour comes
			back as the rows go on. The band is whichever of the two the ink is not, so a card
			is always its own two colours and never a third: black card writes in black on white
			bands, white card in white on black ones. The colour underneath is meant to stay the
			colour either way — that is what the opacities are for. The ink is the box's, not
			the swatch's: it is no longer chosen per colour the way it has to be when the panel
			itself is the ground (see SPAWN_PANEL_CLASSES, which this no longer takes). -->
		<div
			class={classNames(
				'truncate px-1 py-0.5 text-center text-sm font-semibold',
				stock.rowName
			)}
			title={label}
		>
			{label}
		</div>
		{#if caption || mark}
			<!-- The place and the year it was minted share the row: the town gives way first,
				cut with an ellipsis, while the year keeps its two characters whatever the card's
				width — a mark of which season a copy is from is no use half-shown. A card with
				nothing claimed says its show along this row instead, and says it alone (see
				`caption`). -->
			<div
				class={classNames(
					'flex items-baseline justify-center gap-1 px-1 py-0.5 text-xs',
					stock.rowPlace,
					stock.inkMuted
				)}
			>
				{#if caption}
					<span class="truncate" title={caption}>{caption}</span>
				{/if}
				{#if mark}
					<span class="flex-none tabular-nums">{mark}</span>
				{/if}
			</div>
		{/if}
	</div>
</div>
