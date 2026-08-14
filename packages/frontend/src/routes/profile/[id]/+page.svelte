<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { _ } from 'svelte-i18n';
	import { characters } from '@3xl/data';
	import PublicPlayerCard from '$components/core/PublicPlayerCard.svelte';
	import TeamLineup from '$components/core/TeamLineup.svelte';
	import CharacterStatue from '$components/core/CharacterStatue.svelte';
	import RegionListRow from '$components/core/RegionListRow.svelte';
	import WorldMap from '$components/core/WorldMap.svelte';
	import { boundsForFeatures, type LatLngBounds } from '$utils/geo/bounds';
	import type { MapOverlay } from '$types/map.type';
	import { REGION_PANEL_CLASSES } from '$components/core/spawn-colors';
	import { publicProfileService, type PublicPlayer } from '$services/publicProfile.service';
	import { isSupabaseConfigured } from '$services/supabase.client';
	import { spawnService } from '$services/spawn.service';
	import { locationAdapter } from '$adapters/classes/location.adapter';
	import { showIdsByCharacter, teamShowId } from '$utils/spawn/team-show';
	import restoreCatalanArticle from '$utils/string/restore-catalan-article';
	import foldText from '$utils/string/fold-text';
	import { SpawnBox, type ClaimableShow } from '$types/character-spawn.type';
	import { teamLineupMembers } from '$utils/spawn/team-lineup';

	// Any player's profile, for anybody at all — the one page in this game that is
	// about somebody else and the one that needs no account to read. It says what the
	// map's bottom-left corner says of a player: the side they field and the reading
	// they are known by. Not stacked as the corner stacks them, though — a corner is a
	// column and a page is not, so the two stand side by side and the reading is a card
	// built for this width (PublicPlayerCard) rather than the corner's plate.
	//
	// It is not a route into the game: there is nothing to press on it but a town. The
	// card is a reading and not a pair of buttons — the picture and the reading are the
	// way into an account only where the account is your own — and the statues are
	// unselectable, which is what they already are wherever a side is a picture of a
	// side rather than a roster.
	//
	// Everything on it comes from the two definer views made for it
	// (`player_profiles_public`, `player_teams_public`) and nothing else about the
	// account is reachable: not the address it signs in with, not the rest of the
	// collection the three fielded cards came out of. See publicProfile.service.

	// The account this page is about, out of the URL. A change of id is a different
	// player, so the load below is keyed on it and a visit to two profiles in a row
	// cannot leave one wearing the other's team.
	$: userId = $page.params.id ?? '';

	let player: PublicPlayer | null = null;
	// Every show with a renderable character cast in it, as the claim roll reads them —
	// kept whole because the towns need the shows' *names* and the statues need the
	// assignment, and both come out of this one load.
	let showList: ClaimableShow[] = [];
	// Character id → the shows it belongs to; the first is the one a statue flies, as
	// on the map. Empty until the assignment lands, which leaves a floor bare rather
	// than holding the side back.
	let showsByCharacter = new Map<string, number[]>();
	// geojson feature id → municipality name, so a card can name where it was claimed.
	// Null until the layer arrives, and null for good if it does not: a place that
	// cannot be named reads as Ultramar, which is where an unplaced card comes from.
	let municipalityNames: Map<string, string> | null = null;
	// The box every polygon on the map stands inside, taken off the same layer the names
	// come out of. Null until it lands, which is a page with no map behind it rather than
	// a map framed on nothing.
	let mapBounds: LatLngBounds | null = null;
	let loading = true;
	// Set when the read itself failed — the network, a refusal. A profile that simply
	// is not there is `player === null` with no error, which is a different sentence.
	let failed = false;

	// How many more cards the More button stands up, and how many are standing when the
	// page opens. A collection is the whole of what somebody holds and can run to
	// hundreds; a statue is a clip of its own and a stack of images per frame, so
	// mounting the lot at once is a page that arrives all at the same time as itself.
	// The cards are all here either way — this is what is *drawn*, not what was fetched,
	// so pressing More costs nothing but the mounting.
	// It paginates the cards alone. The towns are all drawn at once: a row is a name, a
	// tile and a glyph — markup, not a clip — so a thousand of them cost what a thousand
	// lines of a list cost, and the column they stand in is a scroller with its own end
	// rather than a page that grows. Reset for each player loaded, so a second profile
	// opens at its own first page rather than however far down the previous one had been
	// read.
	const PAGE_SIZE = 12;
	let shown = PAGE_SIZE;

	const charactersById = new Map(characters.map((character) => [character.id, character]));

	// One load per player named in the URL. Mounted first so nothing is fetched while
	// the page is being rendered for the static fallback.
	let loadedFor: string | null = null;
	let mounted = false;
	// Asked on the client alone: the env this reads is resolved in the browser, and a
	// page rendered for the static fallback has no answer to give.
	let configured = true;
	onMount(() => {
		mounted = true;
		configured = isSupabaseConfigured();
		return () => {
			if (refitFrame) cancelAnimationFrame(refitFrame);
		};
	});
	$: if (mounted && userId && userId !== loadedFor) {
		loadedFor = userId;
		void load(userId);
	}

	async function load(id: string): Promise<void> {
		loading = true;
		failed = false;
		player = null;
		shown = PAGE_SIZE;
		// A filter is about the list it was typed over, so it does not follow the reader to
		// the next player's towns.
		townFilter = '';
		try {
			const [loaded, shows] = await Promise.all([
				publicProfileService.load(id),
				// The same assignment the map reads a character's show out of, so a
				// statue carries the same badge here as it does at the map's corner.
				spawnService.loadShows()
			]);
			// The id may have changed while this was in flight — a link followed from
			// one profile to another — and the answer to a question nobody is asking
			// any more must not land on the page.
			if (id !== loadedFor) return;
			player = loaded;
			showList = shows;
			showsByCharacter = showIdsByCharacter(
				new Map(shows.map((show) => [show.id, show.characterIds]))
			);
		} catch {
			if (id !== loadedFor) return;
			failed = true;
		} finally {
			if (id === loadedFor) loading = false;
		}

		// The place names are the map's own layer and the heaviest thing here, so they
		// are fetched after the page can already be drawn and folded in when they land.
		// A statue says Ultramar until then, exactly as one does on a map whose layer is
		// still on its way.
		//
		// The same fetch gives the map behind the page its framing: the box every polygon
		// stands inside, which is what the background is fitted to. One walk of the layer
		// for both — the file is already here, and the map that draws it fetches it again
		// through Leaflet either way.
		try {
			const response = await fetch('/data/geo/municipis.json');
			const collection = (await response.json()) as GeoJSON.FeatureCollection;
			if (id !== loadedFor) return;
			municipalityNames = locationAdapter.municipalityNames(collection);
			// Every feature's own id, not the ids that came back with a name: a polygon
			// the layer has no name for is still a polygon the map draws, and the box has
			// to hold it. (`boundsForFeatures` is what there is; the union of the lot is
			// the union of every id it knows.)
			mapBounds = boundsForFeatures(
				collection,
				new Set(collection.features.map((feature) => String(feature.properties?.id ?? '')))
			);
		} catch {
			municipalityNames = null;
			mapBounds = null;
		}
	}

	// The side as the statues draw it — the same reading the map's corner makes of the
	// signed-in player's own team, off the same function.
	$: lineup = teamLineupMembers(player?.team ?? [], {
		characters: charactersById,
		showsByCharacter,
		municipalityNames
	});

	// Whose side it is, for the face at the head of its banner (see TeamLineup's `owner`):
	// the player this page is about, off the very plate the card above the statues is drawn
	// from. So the picture on the band is the picture at the top of the page, and a reader
	// who meets these three on a town they hold meets the same face there.
	$: sideOwner = player
		? {
				name: player.profile.username || $_('profile.username.none'),
				characterId: player.profile.avatarCharacterId,
				color: player.profile.avatarColor,
				level: player.profile.level
			}
		: null;

	// And the whole collection, read exactly the same way: a card is a card, and the
	// three on the team are three of these. One entry per card held — two copies of a
	// character are two statues, since they are two cards with their own colours, their
	// own boxes and their own towns, and merging them would print a collection smaller
	// than it is.
	$: owned = teamLineupMembers(player?.collection ?? [], {
		characters: charactersById,
		showsByCharacter,
		municipalityNames
	});

	// The part of it standing right now, and how much of it is still sitting down —
	// which is what the More button says, so a reader knows whether they are three cards
	// from the end of this collection or three hundred. Both named off `shown` and
	// `owned` directly, so the grid grows the moment either moves — a card whose town
	// name has just landed re-reads without being re-pressed. Floored at zero: `shown`
	// runs past the end on the last press, and a button is only drawn while this is
	// positive anyway.
	$: visible = owned.slice(0, shown);
	$: remaining = Math.max(0, owned.length - shown);

	function showMore(): void {
		shown += PAGE_SIZE;
	}

	// Show id → its name, off the same assignment the statues take their glyph from, so
	// a town's row names the show its pin is badged with rather than a second reading of
	// it. Empty until that lands, which leaves a row's show unnamed for a moment.
	$: showNameById = new Map(showList.map((show) => [show.id, show.name]));

	// The towns they hold, as the column beside the map lists a place: the tile in the
	// colour of the side sitting there, the name, and the show that side flies.
	//
	// Every one of those three is read off the team frozen in the town's own holder row
	// — the side as it won that town, which is the side the map itself draws there, and
	// not the side its holder happens to field today. So a player who has since changed
	// their team sees these rows keep the colours they conquered in, which is what the
	// map says about those towns too.
	//
	// All three of the maps it reads are threaded in as arguments rather than closed
	// over, exactly as the map's own corner threads them (see +page.svelte's
	// playerTeamLineup): a `$:` re-runs on what the statement names, so a row re-letters
	// itself as the layer, the assignment and the show names land behind it.
	$: townRows = ((
		names: Map<string, string> | null,
		shows: Map<string, number[]>,
		showNames: Map<number, string>
	) =>
		(player?.towns ?? []).map((held) => {
			const lead = held.team[0] ?? null;
			const showId = teamShowId(
				held.team.map((member) => member.characterId),
				shows
			);
			// The name as the layer holds it, article parked after a comma. Both the
			// lettering and the ordering come off it, and they take it differently — see
			// `label` and `sortKey` below.
			const name = names?.get(held.locationId) ?? null;
			return {
				// A municipality's node key in the region tree is its bare feature id, which
				// is what the map's `region` param takes — so this key is both what names
				// the row and what opens it (see openTown).
				key: held.locationId,
				// The layer parks the article after a comma to sort by; it goes back to the
				// front wherever a town is named. A town whose name has not arrived stands
				// on its feature id rather than on Ultramar: this is a real place on the
				// map, and the sentinel would be a different claim about it.
				label: name ? restoreCatalanArticle(name) : held.locationId,
				// What the list is *ordered* by, which is the parked form and not the read
				// one: the layer writes "Alguer, l'" precisely so that an alphabetical list
				// files it under A, where a Catalan reader looks for it, rather than under L
				// with every other town whose name happens to begin with an article.
				sortKey: foldText(name ?? held.locationId),
				// And what it is *searched* by, which is the read one — a reader types what
				// they see, and what they see is "l'Alguer". The map's own search matches the
				// restored name too, so a place is found here by whatever finds it there.
				// Both folded, since both sides of a comparison have to be (see foldText).
				matchKey: foldText(name ? restoreCatalanArticle(name) : held.locationId),
				showName: showId === null ? null : (showNames.get(showId) ?? null),
				showId,
				tileClasses: lead ? REGION_PANEL_CLASSES[lead.color] : null
			};
		}))(municipalityNames, showsByCharacter, showNameById);

	// Ordered by name, and by the parked name at that (see sortKey). `localeCompare` under
	// the game's own locale rather than a bare `<`, which compares code points and would
	// file every town in an order nobody reads in.
	//
	// Sorted here rather than in the map above so the comparison is stated once over the
	// finished rows, and re-runs as the place names land behind the page: until they do,
	// every sortKey is a feature id and the list is in whatever order it was held in.
	$: sortedTowns = [...townRows].sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'ca'));

	// What is typed in the field over the list. It filters what is *drawn*, never what was
	// loaded — every town is here either way — and it is not remembered anywhere: a filter
	// is a way of looking at a list, not a fact about the player being looked at.
	let townFilter = '';
	// Folded exactly as the rows were, since both sides of a comparison have to be. An
	// empty field is not a filter: it stands for the whole list rather than for nothing.
	$: townQuery = foldText(townFilter.trim());
	$: filteredTowns = townQuery
		? sortedTowns.filter((town) => town.matchKey.includes(townQuery))
		: sortedTowns;

	// --- The map behind the page --------------------------------------------------
	// The same four layers the map at the root draws, bottom-up — municipalities,
	// comarques, províncies, territoris — so the coarser a division, the higher and
	// thicker its line sits over the finer ones inside it. Every tier in white, exactly
	// as there.
	//
	// What is *not* here is the colour wash: on the map at the root each shape is filled
	// with the colour its pin flies, which is a reading of the whole game's state (who
	// holds what, which show a town seeds to) and a thing that page is *about*. This is a
	// background. So the shapes are drawn and not painted, which is the same map with
	// nothing said over it — and none of the four is interactive, since a background that
	// answered a click would be a second page under this one.
	//
	// A constant, not a derivation: nothing on this page recolours the map, and handing
	// the component a fresh array would repaint every layer for no change.
	const mapOverlays: MapOverlay[] = [
		{ url: '/data/geo/municipis.json', style: { color: '#fff', weight: 1, fill: false }, interactive: false },
		{ url: '/data/geo/comarques.json', style: { color: '#fff', weight: 1.5, fill: false }, interactive: false },
		{ url: '/data/geo/provincies.json', style: { color: '#fff', weight: 2, fill: false }, interactive: false },
		{ url: '/data/geo/territoris.json', style: { color: '#fff', weight: 3, fill: false }, interactive: false }
	];

	// What the map is framed on. Handed over as a *fresh array* each time it is set, which
	// is what makes a refit happen at all: the component frames on the identity of this
	// prop, so the same box in the same array would be the same request it has already
	// answered.
	let mapFocus: LatLngBounds | null = null;

	// Frame it whenever the box arrives and again whenever the window changes shape. A
	// fit is a zoom against the canvas, so the zoom that held every polygon in a wide
	// window holds rather less of them in a narrow one — the map has to be asked again,
	// and asking again is the whole of keeping the polygons inside the viewport.
	//
	// Coalesced to one frame: a drag of the window edge fires resize continuously, and the
	// fit is a projection over the whole layer.
	let refitFrame = 0;
	function refit(): void {
		if (refitFrame) cancelAnimationFrame(refitFrame);
		refitFrame = requestAnimationFrame(() => {
			refitFrame = 0;
			mapFocus = mapBounds ? [[...mapBounds[0]], [...mapBounds[1]]] : null;
		});
	}
	$: if (mapBounds) refit();

	/**
	 * Open a town on the map. The map is driven entirely by its `region` query param
	 * and a municipality's key is its bare feature id, so naming one here is the whole
	 * of it — the map opens framed on that town with its panel on it.
	 *
	 * This is the one press on the page that goes anywhere. A row of this list is a
	 * place, and a place in this game is a thing you look at on the map; the alternative
	 * was a list of rows that are buttons and do nothing.
	 */
	function openTown(key: string): void {
		void goto(`/?region=${encodeURIComponent(key)}`);
	}

	// What to call the page. A nameless account is worded here rather than stored, as
	// it is everywhere else a name is missing.
	$: title = player ? (player.profile.username ?? $_('profile.username.none')) : $_('profile.title');
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<!-- The window changing shape is the whole reason the map is asked to frame itself again
	(see refit): a fit is a zoom against a canvas, and the canvas is this. -->
<svelte:window on:resize={refit} />

<!-- The map this profile is a profile of somebody playing, behind everything on the page:
	the same component, the same satellite basemap and the same four layers of polygons the
	map at the root draws, framed on the box every one of those polygons stands inside so
	the whole country is on screen at any window size.
	`fixed`, so it is the viewport's background and not the document's — a collection is
	taller than the screen, and a map that scrolled away with it would be a picture at the
	top of a page rather than the ground the page stands on. Behind everything (`-z-10`
	against the content's own stacking) and deaf to the pointer: it is not a way into the
	game here, and a background that panned under the reading would be one. Leaflet's own
	panes are inside this box, so nothing on the page has to reckon with their z-indexes.
	Only once there is a box to frame on: a map handed no bounds would sit at its own
	default view, which is the middle of the Atlantic.
	`z-0` under a content layer at `z-10`, rather than a negative z under nothing: daisyUI
	paints the page's own base colour on the document, and anything behind that is behind
	a wall. -->
{#if mapFocus}
	<div class="pointer-events-none fixed inset-0 z-0">
		<WorldMap overlays={mapOverlays} focusBounds={mapFocus} classes="h-full w-full" />
		<!-- The veil the page is read through: white, half of it at the top and a fifth at the
			foot, so the imagery is knocked back hardest where the account and its plates stand
			and comes through strongest under the collection, which is all pictures anyway.
			Over the map and under the page, which is a place in the stack rather than a
			decision each of them makes: `z-10` clears every Leaflet pane, since app.css caps
			the whole map — panes, controls and all — under 10 (see the flattening block there),
			and the wrapper this is inside is itself a stacking context at `z-0` under the
			content's `z-10`. So it is only ever over this map, whatever Leaflet puts in it. -->
		<div
			class="absolute inset-0 z-10 bg-gradient-to-b from-white/50 to-white/20"
		></div>
	</div>
{/if}

<!-- The page is two things down one centred stack: the account, which is now a row of two
	across the whole of it, and under that the collection, which wants every pixel the window
	has. So there is one width on this page and everything on it takes the whole of it — the
	account used to hold itself to the 400px column the map's corner reads a side at, which
	is a corner's measurement and not a page's.
	The cap is 7xl rather than 5xl because the grid's widest tier is six across: six cards
	in 1024px is a narrower card than four in the same width, and a tier that made the
	cards smaller as the window got bigger would be a strange kind of growth.
	No background of its own any more: the map is behind it, and a fill here would be a lid
	on it. So this layer is `relative z-10` — over the map — and everything on it stands on
	a plate, exactly as the furniture over the map at the root does: three of them, one per
	column of the row, and a fourth under the collection. The statues were the exception for
	a while, bringing their own ground as they do — but the exception is what made the page
	read as two, plates at the top and bare cards below.

	From `md` up it is exactly one screen tall (`h-screen`, not `min-h-screen`), and that is
	what settles the collection's height: the account row is what it is, and the collection is
	given what is left over (`flex-1` on the plate, `min-h-0` so it may be given less than its
	cards come to). A figure in `vh` could not do this — the plate does not start at the top
	of the viewport, so a cap of one screenful still put half of it below the fold, at page
	load as well as on More. Nothing here is measured or reacted to either: what is left over
	is the one thing flexbox works out for itself, and it re-works it on every resize without
	being asked.
	Below `md` the same screenful is spent differently. There is no room to put three things
	beside each other, so the row is stacked (see below) and the account alone fills a screen
	— which means the page is two screens and a reader has to travel between them. Rather
	than let them drift through that on a free scroll, it is **two panels a swipe apart**:
	the column is a scroll-snap container (`snap-y snap-mandatory`) and each of the two
	children is exactly one scrollport tall and snaps to its top. So a swipe does not leave
	the reader looking at the foot of the account and the head of the collection at once; it
	lands on one thing or the other, which is what a phone screen holds anyway.
	`h-full` on the panels and not `h-screen`: the container is inside this box's padding, so
	a viewport-tall panel would be taller than the port it snaps in and no panel would ever be
	wholly on screen. A percentage of the container is right by construction, whatever padding
	stands around it.
	The panels are turned off at `md` (`md:snap-none`, and each panel back to its own height),
	where the three columns fit beside each other and the whole page is one screen already.
	Which is why this box is `h-screen` at every size now: on a phone it is the frame the two
	panels are cut to, above it the single screen the row and the collection share.
	The lists *inside* the panels scroll on their own and are told not to hand their
	overscroll back to this container (see `overscroll-contain` on each): a reader who has
	swiped down to the end of the towns is reading the towns, not asking for the next panel. -->
<div class="relative z-10 flex h-screen w-full justify-center p-4">
	<div
		class="flex h-full w-full max-w-7xl snap-y snap-mandatory flex-col items-center gap-0 overflow-y-auto py-0 md:snap-none md:gap-6 md:py-4"
	>
		{#if loading}
			<div
				class="flex items-center gap-3 rounded-box bg-base-100/80 px-4 py-3 shadow-xl"
			>
				<span class="loading loading-spinner loading-md"></span>
				{$_('common.loading')}
			</div>
		{:else if failed}
			<p class="rounded-box bg-base-100/80 px-4 py-3 text-center shadow-xl">
				{$_('errors.generic')}
			</p>
		{:else if !configured}
			<!-- A local run with no Supabase behind it: there is nobody to look up, which is
				not the same sentence as "no such player" and must not be told as one. -->
			<p class="rounded-box bg-base-100/80 px-4 py-3 text-center shadow-xl">
				{$_('profile.notConfigured')}
			</p>
		{:else if !player}
			<p class="rounded-box bg-base-100/80 px-4 py-3 text-center shadow-xl">
				{$_('profile.public.notFound')}
			</p>
		{:else}
			<!-- The whole account across one row, rather than stacked in the column the map's
				corner reads it at. The corner had the side above the plate because a corner is
				a column and has nowhere else to put it; here there is a whole page's width, so
				the three things this page knows about a player stand side by side — who they
				are (with the way out into the game under it), the side they field, and the
				towns they hold. The card leads because that is the order the page is read in:
				this is a page about a player, and the side and the towns are what that player
				has. At the map's corner it is the other way up, the side above the plate,
				because there the side is the thing being played and the plate under it only
				says whose it is. None of the three is held to a width of its own: each takes
				the third of the row it is given, and the row takes the page. That is why the
				card is PublicPlayerCard and not the map's plate — a portrait as wide as a third
				of this page is a picture of somebody, which is what a page about them should
				open with, and the plate is built the other way round on purpose.
				`items-start` so a cell is its own height: the first two are a card and a side,
				which are as tall as they are, and stretching either to match the other would
				print a plate with a foot of nothing under it. The third takes itself out of
				that rule (`self-stretch`) because it is the one cell with no length of its own
				— a collection of towns is however many there are — so instead of setting the
				height of the row it takes it, and scrolls. So the row is as tall as the account
				beside it at every size, whether somebody holds three towns or three hundred. -->
			<!-- Three columns where there is width for three, and one stacked column where there
				is not. A phone is about as wide as one of these cells wants to be on its own: a
				name at 2xl, a side of three cards and a list of place names, all at a third of
				360px, is three things none of which can be read. So below `md` they are simply
				put one under another, in the order they are already in — which is the order the
				page is read in anyway, and why nothing has to be reordered to stack.
				Stacked, it is also the first of the two panels: one scrollport tall and snapping
				to its top. Its three rows are `auto auto 1fr`, so the card and the side take what
				they need and the towns take the whole of the rest — which is what gives that
				list a height to scroll inside, and what keeps the panel from running past the
				screen it is cut to. At `md` the rows go back to being the grid's own business
				and the panel back to its own height. -->
			<div
				class="grid h-full w-full shrink-0 snap-start grid-cols-1 grid-rows-[auto_auto_1fr] items-start gap-3 md:h-auto md:grid-cols-3 md:grid-rows-none"
			>
				<!-- Who they are and the one thing a reader of this page can do, in that order
					and in the one column: the card is what the page is about, and the button is
					what to do about it. Stacked rather than given a cell each because a button
					sitting alone in a third of the page is a button looking for something to be
					next to.
					One plate for the pair of them, the same sheet the towns beside them stand on
					— base-100 at four fifths, which is what every plate in this game is printed
					on and what makes any of it readable over satellite imagery. It is the cell's
					and not the card's: two plates, one inside the other, is the fill printed
					twice, and this is one column saying one thing.
					`self-stretch` out of the row's `items-start`, so the plate is as tall as the
					row is however tall the side beside it turns out to be: three plates of three
					different heights across one row reads as three things that happen to be near
					each other, and this row is one statement about one player.
					`justify-between` puts the height that stretch hands over between the two of
					them rather than under them both: the card at the head of the plate and the
					button at its foot, which is where a reader looks for the thing to press. The
					`gap-2` is what they are held apart by when there is no slack to divide. -->
				<div
					class="flex flex-col justify-between gap-2 self-stretch rounded-box bg-base-100/80 p-2 shadow-xl"
				>
					<PublicPlayerCard profile={player.profile} />

					<!-- The way into the game, which this page otherwise has none of: it is
						somebody else's account read from outside, and the only thing a reader of it
						can do is go and play their own. It goes to the root, the map, with nothing
						named after it — a town in the column beside this one opens the map *on that
						town*, and this opens it where a player's own map opens. -->
					<a href="/" class="btn btn-primary btn-block">
						{$_('profile.public.play')}
					</a>
				</div>

				<!-- The side, as at the map's corner: three statues on nothing at all, each
					bringing its own ground, standing the way the corner stands them. Nothing is
					passed to it that the corner does not pass — it is unselectable and unheaded
					there too, being a picture of a side rather than a roster. -->
				{#if lineup.length > 0}
					<TeamLineup members={lineup} owner={sideOwner} />
				{:else}
					<p class="rounded-box bg-base-100/80 px-4 py-3 text-center shadow-xl">
						{$_('profile.public.noTeam')}
					</p>
				{/if}

				<!-- The towns they hold, each drawn by the very row the column beside the map
					lists a place with: the tile in the colour of the side sitting there, the name,
					and the show that side flies. The same component and not a second one that
					looks like it — a town is a town wherever it is listed, and two spellings of
					one row is how a map and a profile come to disagree about a place.
					Pressing one opens the map framed on it (see openTown), which is the only
					thing a place on this page can usefully be pressed for. `current` and `marked`
					are both off: this is not the column beside a map, so there is no open place
					among these to be found or to be pointed at.
					One town per line, in the third of the row this cell is: a row is a name and a
					show, which is a line of text, and lines of text are read down a column. It
					was a grid two to four across while it had the whole page to spread over and
					stood under the account; standing beside it, it is what it always was on the
					map — a list of places, which is the very thing the column beside the map is.
					And all of them at once, with no More under it: a row is markup rather than a
					clip, so the whole of a collection of towns costs what a list of that many
					lines costs. What was paged is scrolled instead, which is the honest shape
					for it — a scrollbar says how much there is to come, which is the one thing
					the button had to be lettered with a count to say.
					In name order, and searchable, which is what a list of every one of them has
					to be to be read at all: three hundred towns in the order they were won is a
					pile rather than a list (see sortedTowns and filteredTowns). -->
				{#if townRows.length > 0}
					<!-- The scroller is two boxes, and it has to be two. This one is the grid cell:
						it is stretched to the row (`self-stretch`, since the row is otherwise
						`items-start`) so it stands as tall as the tallest of the other two columns,
						and it holds the list *out of flow* — which is what stops a player with three
						hundred towns from setting the height of the row. A cell whose content
						counted would grow the row and push the collection below it down the page,
						which is the very thing a scroller is here to prevent.
						`min-h-0` for the case where the other columns are shorter than this cell's
						own minimum would be.
						Stacked, it has no sisters to take a height from — a row of one whose only
						content is out of flow is a row of nothing, and the list would simply not be
						drawn. What gives it one there is the panel's `1fr` last row: the towns take
						whatever the card and the side leave of the screen, which is a height that
						answers to the phone it is on rather than a figure picked here. -->
					<div class="relative min-h-0 self-stretch">
						<!-- Pinned to the whole of the cell, so it is exactly as tall as the row
							however tall that turns out to be. A column of two: the field, which keeps
							its place, and under it the list, which is the only thing that scrolls
							(`min-h-0` on it, or a flex item refuses to shrink below its content and the
							overflow never happens). The field is fixed by being outside the scroller
							rather than by being `sticky` inside it — a sticky head over rows that pass
							behind it needs a ground of its own to hide them with, and the ground here
							is satellite imagery. -->
						<!-- One plate for the whole column, field and list together, rather than one
							under each town: the same base-100 at four fifths every plate in this game
							is printed on, which is what lets any of this be read over satellite
							imagery. A town had a plate of its own while the towns were a grid spread
							across the page — separate places, separately won, in separate cells — but
							a single column of them is a list, and a list stands on one sheet the way
							the column beside the map does. Which also makes the field part of the
							thing it filters instead of a stray input floating above it. -->
						<div class="absolute inset-0 flex flex-col gap-2 rounded-box bg-base-100/80 p-2 shadow-xl">
							<!-- The field at the head of the column. Not LocationSearchBox, which is the
								map's own: that one is mounted by a press, focuses itself, and folds away
								when it is left empty — none of which is wanted by a field that is simply
								always there. -->
							<input
								type="search"
								class="input input-bordered input-sm w-full flex-none"
								placeholder={$_('profile.public.filterTowns')}
								aria-label={$_('profile.public.filterTowns')}
								bind:value={townFilter}
							/>

							<!-- The list itself, scrolling in the one axis. `pe-1` keeps the rows clear
								of the scrollbar rather than letting it run over their ends. No gap: what
								spaces one row from the next is the rule between them.
								`overscroll-contain` is what keeps this list its own: on a phone the column
								outside it snaps between two panels, and without it a swipe that ran the
								towns to their end would carry straight on into the next panel. A reader at
								the foot of a list is reading the list. -->
							<div class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pe-1">
								<!-- Each town is the row and nothing around it now — the plate it used to
									carry is the column's. `flex-none` because these are flex items in a
									scroller: a column of them taller than the box would otherwise be squeezed
									to fit it, which is a list that gets thinner the more there is of it
									instead of scrolling.
									A rule after every row but the last, which is what separating a list means:
									a line under the final town would be a list that looks like it was cut off
									rather than one that ended. daisyUI's own divider, with its margins taken
									off — it brings a height of its own, and that height is the spacing these
									rows are read with. -->
								{#each filteredTowns as town, index (town.key)}
									<div class="flex-none">
										<RegionListRow row={town} onSelect={openTown} />
									</div>
									{#if index < filteredTowns.length - 1}
										<div class="divider my-0 flex-none"></div>
									{/if}
								{/each}

								<!-- A query that catches nothing says so, in the same words the map's own
									search says it in: an empty column under a field with text in it is a
									list that looks broken rather than one that looks empty. On no plate of
									its own — it is standing on the column's. -->
								{#if filteredTowns.length === 0}
									<p class="flex-none px-2 py-3 text-center text-xs opacity-60">
										{$_('map.search.empty')}
									</p>
								{/if}
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Everything they hold, one statue per card, newest first. A flat grid and
				nothing else: not the album's cells (which are characters, one apiece, owned or
				not) and not the roster's (which are filters and buttons over cards the player
				may still move). Nobody can act on any of this, so there is nothing to group
				it by and nothing to press — the collection is the whole statement, and its
				size is part of what it says.
				A statue takes its size from the cell it is in and brings the rest itself, so
				the grid is a column count and a gap and no more of a layout than that.
				Every count divides the twelve a press of More adds — two, three, four, six — so it
				always lands on a whole number of rows and the grid never ends on a part-row
				with a gap beside it, at any width. That is why the tiers stop at six rather
				than passing through five. -->
			{#if visible.length > 0}
				<!-- On a plate, like the two columns above it: the same base-100 at four fifths,
					the same rounding, the same shadow. A statue does bring its own ground — it is
					a card standing in a lit box, which is why this grid stood on nothing for as
					long as it did — but the row above it is two plates wide now, and a page whose
					top half is printed on sheets and whose bottom half is not reads as two pages.
					The plate holds the More button as well, so what is under it belongs to the
					grid it adds to rather than floating off the foot of the page.
					And from `md` up it never runs off the screen: it takes what the account row
					above it leaves of the page's one screenful (`flex-1`, with `min-h-0` so it may
					be handed less than its cards come to — a flex item will not shrink below its
					content otherwise, which is the whole of why a cap works at all), and the cards
					scroll inside it (see the grid below). A collection of three hundred is
					otherwise a page a reader falls down — and the More button, which is the thing
					they came to the foot of it for, would be a screen further away with every
					press of itself.
					On a phone it does not have to take what is left of anything: it is the second
					panel, a scrollport tall on its own account (`h-full`), snapped to. Which comes
					to the same thing for the grid inside it — a plate of a stated height, cards
					scrolling within it — by a different route, so the same two classes do the work
					at both sizes. -->
				<div
					class="flex h-full w-full shrink-0 snap-start flex-col gap-3 rounded-box bg-base-100/80 p-2 shadow-xl md:h-auto md:min-h-0 md:flex-1"
				>
					<!-- The cards are what scrolls, not the plate: the rule and the More button
						under them keep their place at its foot, so the way to see more of a
						collection never scrolls out of the collection.
						`flex-auto` and not `flex-1` — `flex-1` bases an item at zero, which for the
						one item the plate's own height is measured from would collapse the grid to
						nothing before the cap ever came into it. `min-h-0` is the other half: a flex
						item will not shrink below its content without it, and a grid that cannot
						shrink is a plate that cannot be capped. `pe-1` keeps the scrollbar off the
						last column of cards.
						`overscroll-contain` for the same reason the towns list carries it: on a phone
						this grid is inside a panel that snaps, and running out of cards is not a
						request to be taken back to the account. -->
					<div
						class="grid min-h-0 w-full flex-auto grid-cols-2 gap-3 overflow-y-auto overscroll-contain pe-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
					>
						<!-- `alwaysReveal`, as on the roster and for the same reason twice over. A
							reveal is normally spent once per character across the whole page, so on a
							surface that is nothing but characters the ones a reader had already met —
							on the map, in a pack, or on the side standing two columns above — would
							simply be there while the rest swept in: one grid drawing itself two
							different ways. And a collection holds cards, not characters: two copies
							of a character are two cards here, and the second would arrive bare
							because the first spent the reveal a moment earlier.
							It matters most on More. A press mounts twelve statues that were never on
							the page before, and every one of them has to arrive — which is what this
							gives, since the ones already standing are mounted and never ask again. -->
						{#each visible as card}
							<CharacterStatue
								characterId={card.characterId}
								label={card.label}
								basePath={card.basePath}
								color={card.color}
								box={card.box ?? SpawnBox.Black}
								locationName={card.locationName}
								spawnedAt={card.spawnedAt ?? null}
								showId={card.showId}
								alwaysReveal
							/>
						{/each}
					</div>

					<!-- Another twelve, under the ones already standing, carrying how many are
						still to come — a collection is as long as it is, and a bare "more" leaves a
						reader pressing without knowing whether they are near the end of it. It goes
						away when there are none left rather than turning into a disabled button
						that says the collection is over: the end of a collection is the last card,
						and a row of nothing under it says so.
						A rule over it, as between the towns beside it: it is not one of the cards,
						and a list wants a line where it stops. `self-center` keeps the button the
						width of its own lettering — the plate is a flex column, which would
						otherwise stretch it across the whole page. -->
					{#if remaining > 0}
						<div class="divider my-0"></div>
						<button
							type="button"
							class="btn btn-outline btn-sm self-center"
							on:click={showMore}
						>
							{$_('profile.public.more', { values: { count: remaining } })}
						</button>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
</div>
