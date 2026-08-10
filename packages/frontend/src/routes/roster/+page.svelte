<script lang="ts">
	import classNames from 'classnames';
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { characters } from '@3xl/data';
	import { goto } from '$app/navigation';
	import { authService } from '$services/auth.service';
	import { openSignIn } from '$services/signInModal';
	import { leaveRoster } from '$services/roster';
	import { MAP_ROUTE } from '$services/combat';
	import { spawnService } from '$services/spawn.service';
	import { teamService, TEAM_SIZE } from '$services/team.service';
	import { showLogos, loadShowLogos } from '$services/shows.service';
	import { locationAdapter } from '$adapters/classes/location.adapter';
	import { AuthStatus } from '$types/profile.type';
	import { SpawnColor, type CharacterSpawn } from '$types/character-spawn.type';
	import { claimMintedAt, claimPlaceName } from '$utils/spawn/team-lineup';
	import CharacterStatue from '$components/core/CharacterStatue.svelte';
	import TeamLineup from '$components/core/TeamLineup.svelte';
	import FullScreenModal from '$components/core/FullScreenModal.svelte';
	import { SPAWN_FILL_CLASSES, SPAWN_SQUARE_GLYPHS } from '$components/core/spawn-colors';

	// The cards, on their own page. They were a sheet raised over the map for a long time,
	// set true by the side standing in the map's corner and false by their own ✕ — which
	// meant the roster had no address, could not be linked to or reloaded into, and was
	// mounted at the layout root so that the arena, on a route of its own, could raise it
	// over a fight. So the roster has a route, exactly as the fight does, and the two ways
	// in are navigations now (see $services/roster): whoever sends the player to their cards
	// goes here, and leaving goes back to wherever that was.
	//
	// What is drawn is unchanged, the sheet included: this is still the app's one full-view
	// surface, with its title bar, its blur in and out and its Escape. Nothing is mounted
	// until the page is — the spawn load, the face fetches, the card canvas's WebGL context
	// all start with the visit and go when it is left — which is what mounting the modal only
	// while it was open used to buy.
	function close(): void {
		void leaveRoster();
	}

	// The view is two grids, and every count in it is fixed. From lg up they stand side by
	// side in a seven-column frame — the filters and the line-up three columns wide on the
	// left, the roster four on the right, at the one gap the inner grids use, so a cell of
	// either is exactly one column of that frame wide and the two read as one rhythm across
	// the view rather than as two grids that happen to be adjacent. Below lg there is no
	// room to set four cards beside anything, so the frame becomes a single column and the
	// two stack, the cards dropping to three across to match the grid above them. There is
	// no column setting for a player to change: the counts are the layout, so there is
	// nothing left for a slider to say. (`roster:columns` is left behind in localStorage
	// unread; nothing writes it and nothing looks for it.)
	//
	// This is the page budget rather than the rendered count, which is why it stays four
	// where the grid shows three: what it bounds is how many sprites one page may stand up.
	const CARD_COLUMNS = 4;

	// A character's copies are always gathered into one cell — one statue, with a select
	// naming which of them it stands as. That was a player preference, and it is the layout
	// now for the same reason the column count is: the other reading, one cell per card
	// owned, said a fighter held six times was six fighters, which is what the select in the
	// cell is there to say instead. (`roster:group-copies` is left behind in localStorage
	// unread; nothing writes it and nothing looks for it.)

	// --- Card filters (the header toolbar) ---
	// Sentinel every "no filter" dropdown uses, so an unset filter is distinct from
	// any real value (a colour, a show name).
	const ANY = '' as const;
	let filterName = ''; // free-text match against the character label
	let filterColor: SpawnColor | typeof ANY = ANY;
	// By TMDB id rather than by name, since what the filter shows is the show's own
	// logo and that is fetched by id (see shows.service).
	let filterShow: number | typeof ANY = ANY;

	// Every spawn colour, for the colour filter's swatches (labels are the enum values).
	const COLOR_OPTIONS = Object.values(SpawnColor);

	// A colour is picked by pressing its swatch and unpicked by pressing it again —
	// which is the only way back to "all colours" now that there is no option saying so.
	function toggleColorFilter(color: SpawnColor): void {
		filterColor = filterColor === color ? ANY : color;
	}

	/** One colour's swatch in the filter: the colour itself as a rounded square, ringed
	 * while it is the one being filtered on. Nothing ringed means no colour filter, so
	 * the six unringed squares are what "all colours" looks like. The ring is the whole of
	 * the mark — an unpicked swatch is at full strength, since a swatch is the colour it
	 * names and a dimmed one is a different colour. */
	function colorSquareClasses(color: SpawnColor, active: SpawnColor | typeof ANY): string {
		return classNames(
			'aspect-square w-full rounded-md border border-black/30 transition',
			'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
			SPAWN_FILL_CLASSES[color],
			{ 'ring-2 ring-base-content ring-offset-1 ring-offset-base-100': active === color }
		);
	}

	// Same gesture as a colour swatch: press a show to filter to it, press it again to
	// let go. That is where the "All shows" option went.
	function toggleShowFilter(showId: number): void {
		filterShow = filterShow === showId ? ANY : showId;
	}

	/** One show's chip in the filter, ringed while it is the one being filtered on. The
	 * band under it is the statue's — a show's lettering is drawn to sit on something
	 * dark, and the panel it sits on there is what makes it readable here too. Unringed is
	 * the only thing that says a chip is not the one picked: a wordmark held at less than
	 * full strength is a wordmark drawn wrong. */
	function showChipClasses(showId: number, active: number | typeof ANY): string {
		return classNames(
			'flex h-8 items-center justify-center overflow-hidden rounded-md bg-black/40 px-1 transition',
			'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
			{ 'ring-2 ring-base-content ring-offset-1 ring-offset-base-100': active === showId }
		);
	}

	function resetFilters(): void {
		filterName = '';
		filterColor = ANY;
		filterShow = ANY;
	}

	// --- Pagination ---
	// The grid only ever mounts one page of statues — ROWS_PER_PAGE rows of CARD_COLUMNS
	// — so a large roster never stands up a sprite (and its looping frames) per claimed
	// card.
	const ROWS_PER_PAGE = 10;
	let page = 0; // zero-based
	// The cards' own grid, which is the thing that scrolls — so turning a page can put it
	// back at the top. The filters and the line-up beside it do not move with it.
	let gridScroller: HTMLDivElement | undefined;

	// Whether any filter is narrowing the roster (drives the Clear button).
	$: filtersActive = filterName.trim() !== '' || filterColor !== ANY || filterShow !== ANY;

	// Cards were once traded back here — ten of them bought one extra booster claim for
	// the day, and while that mode was on a tap picked a card for the pile instead of
	// fielding it. There is nothing left to buy: a box is the calendar's now, one per town,
	// year and stock (see packages/backend/supabase/booster_claims.sql), so the whole of
	// recycling has gone with the allowance it paid into — the RPC included.

	const status = authService.status;
	const profile = authService.profile;
	const spawns = spawnService.spawns;
	// The player's one team, read off their own cards (each fielded card holds a
	// slot). There is nothing to create and nothing to choose between: the slots are
	// simply there, and tapping a card fills or empties one.
	const teamSlots = teamService.slots;
	// The same line-up as the cards themselves, a null per empty slot — what the first
	// row of the grid stands up, one cell per slot whether or not it is filled.
	const teamCards = teamService.spawns;
	const teamSaving = teamService.saving;
	const teamError = teamService.error;
	const teamColorFilter = teamService.allowedColors;

	// Spawns store only a character id + geojson ids; labels, sprites and place
	// names are resolved here from the local registry and municipality layer.
	const charactersById = new Map(characters.map((character) => [character.id, character]));

	// character id → the Supabase shows it belongs to, by id and name: the name is what
	// the show filter lists, the id what puts that show's glyph on a statue's floor.
	let characterShows = new Map<string, { id: number; name: string }[]>();
	let municipalityNames: Map<string, string> | null = null;

	let loading = false;
	let error = '';
	// Guards the one-time load so the reactive block doesn't refire on every tick.
	let loadedForUser: string | null = null;

	onMount(() => authService.init());
	// The show logos the filter's chips are drawn from. Every statue in the grid asks for
	// the same collection, and the service shares the one fetch between them — asked for
	// here as well so the filter has its artwork whether or not a statue is standing.
	onMount(() => void loadShowLogos());

	$: currentUserId = $status === AuthStatus.SignedIn && $profile ? String($profile.id) : null;

	// Whose side the line-up at the head of this sheet is, for the face on its banner (see
	// TeamLineup's `owner`): the reader, this being the screen they arrange their own three
	// on. Read off the same profile the map's corner reads, so the band is the same band in
	// both places — the side is arranged here and stood up there, and a face that differed
	// between them would be two answers to whose team it is.
	$: sideOwner = $profile
		? {
				name: $profile.username || $_('profile.username.none'),
				characterId: $profile.avatarCharacterId,
				color: $profile.avatarColor,
				level: $profile.level
			}
		: null;
	$: if (currentUserId && currentUserId !== loadedForUser) {
		loadedForUser = currentUserId;
		load(currentUserId);
	}

	async function load(userId: string) {
		loading = true;
		error = '';
		try {
			const [, showsByCharacter] = await Promise.all([
				spawnService.loadSpawns(userId),
				spawnService.loadCharacterShows()
			]);
			characterShows = showsByCharacter;

			// Place names are optional — a missing layer just falls back to the id.
			try {
				const response = await fetch('/data/geo/municipis.json');
				const municipalities = (await response.json()) as GeoJSON.FeatureCollection;
				municipalityNames = locationAdapter.municipalityNames(municipalities);
			} catch {
				municipalityNames = null;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	function labelFor(id: string): string {
		return charactersById.get(id)?.label ?? id;
	}
	function basePathFor(id: string): string | null {
		return charactersById.get(id)?.basePath ?? null;
	}

	// The show whose glyph a statue stands on: the character's first, exactly as
	// `teamShowId` reads a team's, so a character carries the same badge here as on
	// the map. A character in no show leaves the floor bare.
	function showIdFor(characterId: string): number | null {
		return characterShows.get(characterId)?.[0]?.id ?? null;
	}
	// The layer parks the article after a comma to sort by; it goes back to the front
	// wherever the modal says a town — the team's region, a circle's tooltip and (again,
	// harmlessly) the statue's own panel. The Ultramar sentinel, the welcome box's and any
	// missing/unresolved location are the shared helper's to answer, since the row of
	// statues on the map already asks it the same question of the same ids.
	function locationNameFor(id: string): string {
		return claimPlaceName(id, municipalityNames ?? null);
	}

	// The distinct show names present across the roster, sorted — the options for the
	// show filter, by id and name — the id is what the chip draws a logo from and what
	// the predicate matches, the name what sorts them and what a show with no logo
	// enabled falls back to saying. Rebuilds as spawns and their show mapping load in.
	$: showFilterOptions = ((shows: Map<string, { id: number; name: string }[]>) => {
		const byId = new Map<number, string>();
		for (const spawn of $spawns) {
			for (const show of shows.get(spawn.characterId) ?? []) byId.set(show.id, show.name);
		}
		return [...byId]
			.map(([id, name]) => ({ id, name }))
			.sort((a, b) => a.name.localeCompare(b.name));
	})(characterShows);

	// The slot each fielded card holds, by spawn id. Every question the team asks of the
	// grid — which cards no filter may hide, which cells come first, which of them wears
	// the border — is answered from this, and ids are all any of them needs.
	$: teamSlotById = new Map<string, number>(
		$teamSlots.flatMap((id, slot) => (id ? [[id, slot] as [string, number]] : []))
	);

	// The roster narrowed by the header filters. All predicates AND together; an
	// unset (ANY) filter is a pass. The filter maps are threaded in as deps so the
	// list re-runs as they load or a control changes. This — not `$spawns` — is what
	// the grid renders.
	//
	// A fielded card is not in this list at all: the left grid is where the line-up stands,
	// and a card cannot be in both without being read as two cards. That holds whatever the
	// filters say, so the team is never something the roster's own controls can hide — it is
	// not in the roster's grid to hide.
	$: filteredSpawns = ((
		name: string,
		color: SpawnColor | typeof ANY,
		show: number | typeof ANY,
		shows: Map<string, { id: number; name: string }[]>,
		teamColors: Set<string> | null,
		slots: Map<string, number>
	) => {
		const needle = name.trim().toLowerCase();
		return $spawns.filter((spawn) => {
			if (slots.has(spawn.id)) return false;
			if (needle && !labelFor(spawn.characterId).toLowerCase().includes(needle)) return false;
			if (color !== ANY && spawn.color !== color) return false;
			if (show !== ANY && !(shows.get(spawn.characterId) ?? []).some((entry) => entry.id === show))
				return false;
			if (teamColors && !teamColors.has(spawn.color)) return false;
			return true;
		});
	})(filterName, filterColor, filterShow, characterShows, pickableColors, teamSlotById);

	// The ids of the cards the grid may stand up — the filtered roster as a set, which is
	// the question a place selector asks of one copy at a time: may this cell stand as that
	// card? Everything else the player owns of the same character is a place the selector
	// still lists and cannot go to.
	$: selectableIds = new Set(filteredSpawns.map((spawn) => spawn.id));

	// Every card the player owns, by character, filters and team aside. The grid is built
	// from the narrowed roster, but a cell's place selector is not: it names every town this
	// character was ever pulled in, so a player reads the whole of what they hold of a
	// fighter from the one cell rather than watching towns appear and vanish as they filter.
	$: copiesByCharacter = ((all: CharacterSpawn[]) => {
		const byCharacter = new Map<string, CharacterSpawn[]>();
		for (const spawn of all) {
			const copies = byCharacter.get(spawn.characterId);
			if (copies) copies.push(spawn);
			else byCharacter.set(spawn.characterId, [spawn]);
		}
		return byCharacter;
	})($spawns);

	// The filters and the pager work on the same list: filtering narrows it, the pager
	// walks it a page at a time. So any filter change re-pages from the start — the
	// narrowed roster always opens on its first page rather than on a page number that
	// meant something under the old filters.
	$: filterName, filterColor, filterShow, (page = 0);

	// --- What a cell is --------------------------------------------------------------
	/** One cell of the grid: the character it stands up and every copy the player owns of
	 * them that got through the filters. The character's own id keys the cell, since a
	 * character has exactly one cell — that is what grouping means. */
	interface CharacterCell {
		characterId: string;
		copies: CharacterSpawn[];
	}

	// A character claimed six times is one character, so the grid stands them up once
	// and lets the cell's select choose between their copies. The grouping happens
	// before the pager, so a page is ten rows of *characters* — a player with a hundred
	// reds of the same fighter no longer walks ten pages of the same statue.
	function groupByCharacter(spawns: CharacterSpawn[]): CharacterCell[] {
		const groups = new Map<string, CharacterSpawn[]>();
		for (const spawn of spawns) {
			const copies = groups.get(spawn.characterId);
			if (copies) copies.push(spawn);
			else groups.set(spawn.characterId, [spawn]);
		}
		// Insertion order, so the characters keep the order their first copy was in.
		return [...groups].map(([characterId, copies]) => ({ characterId, copies }));
	}

	/** The copy of this character holding the earliest team slot, or null if the player
	 * has fielded none of them. Earliest rather than first-claimed, so a character fielded
	 * twice sorts and stands as the higher of its two slots. */
	function fieldedCopy(
		copies: CharacterSpawn[],
		slots: Map<string, number>
	): CharacterSpawn | null {
		let held: CharacterSpawn | null = null;
		let heldSlot = TEAM_SIZE;
		for (const copy of copies) {
			const slot = slots.get(copy.id);
			if (slot !== undefined && slot < heldSlot) {
				held = copy;
				heldSlot = slot;
			}
		}
		return held;
	}

	// A character with a fielded copy sorts to the front, in slot order, so where the team
	// is in the grid at all it is the head of it: the lead is the first cell and the line-up
	// reads left to right before the roster it was picked from. That is the narrow grid's
	// case — with a party row there are no fielded cards left in the list for this to move,
	// and the sort is a no-op it costs nothing to leave standing. Everything else keeps the
	// order its first copy was claimed in — Array.sort is stable, so a rank every unfielded
	// character shares leaves them all where they were. Sorting happens before the pager,
	// which is what keeps the team on the first page: it must never be a page turn away
	// from the cards being read against it.
	$: characterGroups = ((slots: Map<string, number>) => {
		const groups = groupByCharacter(filteredSpawns);
		const ranks = new Map(
			groups.map((group) => {
				const held = fieldedCopy(group.copies, slots);
				return [group.characterId, held ? (slots.get(held.id) ?? TEAM_SIZE) : TEAM_SIZE];
			})
		);
		return groups.sort(
			(a, b) =>
				(ranks.get(a.characterId) ?? TEAM_SIZE) - (ranks.get(b.characterId) ?? TEAM_SIZE)
		);
	})(teamSlotById);

	// character id → the id of the copy the grid is showing in that character's cell. Only
	// holds the ones the player has picked a town for; every other cell shows its first copy.
	// Keyed by character rather than by page, so a copy picked stays picked as the filters and
	// the pages move.
	let shownCopyByCell = new Map<string, string>();
	function showCopy(characterId: string, spawnId: string): void {
		shownCopyByCell = new Map(shownCopyByCell).set(characterId, spawnId);
	}

	/** One place a character has been claimed in, in one colour — an entry in the cell's
	 * place selector, which is how a cell's copies are chosen between: it asks which town,
	 * and the colour it was pulled in there comes with the answer. */
	interface PlaceOption {
		copy: CharacterSpawn;
		locationName: string;
		// Whether the cell can actually stand as this card. A copy the filters have put
		// aside, or one holding a team slot, is still one of this character's places — it is
		// listed and disabled rather than dropped, so the selector says what the player holds
		// and, separately, what is reachable from here right now.
		selectable: boolean;
	}

	// A character's copies as the places they were pulled in, one entry per town and
	// colour: two reds from the same town say the same thing, so they are one entry, and
	// it stands the first of them up — the first *selectable* one where there is one, since
	// an entry a copy can be shown for must carry that copy and not the twin that cannot.
	// Insertion order again, so the list follows the order the copies were claimed in, and a
	// later copy taking over an entry keeps the place where its first copy put it. `names` is
	// taken as an argument so the caller's reactive statement has to name the layer these
	// places are read from.
	function groupPlaces(
		copies: CharacterSpawn[],
		selectable: Set<string>,
		_names: Map<string, string> | null
	): PlaceOption[] {
		const byPlace = new Map<string, PlaceOption>();
		for (const copy of copies) {
			const key = `${copy.locationId}|${copy.color}`;
			const held = byPlace.get(key);
			const canShow = selectable.has(copy.id);
			if (held && !(canShow && !held.selectable)) continue;
			byPlace.set(key, {
				copy,
				locationName: locationNameFor(copy.locationId),
				selectable: canShow
			});
		}
		return [...byPlace.values()];
	}

	// A page is ROWS_PER_PAGE rows at the current column count, so the slider resizes
	// the page as well as the cards.
	$: pageSize = CARD_COLUMNS * ROWS_PER_PAGE;
	$: pageCount = Math.max(1, Math.ceil(characterGroups.length / pageSize));
	// Clamp whenever the page count shrinks (a wider column count, or a filter narrowing
	// the roster) so the view never sits past the last page.
	$: if (page > pageCount - 1) page = pageCount - 1;
	$: pageStart = page * pageSize;
	// The one page of characters the grid actually stands up — not the full list.
	$: pagedGroups = characterGroups.slice(pageStart, pageStart + pageSize);

	function goToPage(next: number): void {
		page = Math.min(Math.max(0, next), pageCount - 1);
	}

	// A new page opens at its top; anything else keeps the scroll offset.
	$: page, gridScroller?.scrollTo({ top: 0 });

	/** One spawn as the statue that stands for it: who they are, the art that stands
	 * them up, the colour they bend, where they were claimed and whose glyph is
	 * painted on the floor. The resolved maps come in as arguments rather than being
	 * read off the component, so every caller has to name them and their reactive
	 * statement tracks them. */
	function toStatue(
		spawn: CharacterSpawn,
		_names: Map<string, string> | null,
		_shows: Map<string, { id: number; name: string }[]>
	) {
		return {
			label: labelFor(spawn.characterId),
			basePath: basePathFor(spawn.characterId),
			color: spawn.color,
			// The stock the card was printed on, which is the ink the statue is drawn in.
			box: spawn.box,
			locationName: locationNameFor(spawn.locationId),
			// The year, where there is a claim place for it to stand beside; the boxes that
			// belong to no town say their caption alone (see claimMintedAt).
			spawnedAt: claimMintedAt(spawn.locationId, spawn.createdAt),
			showId: showIdFor(spawn.characterId)
		};
	}

	// The current page's characters, each with the copy it is showing and the statue of
	// that copy — a copy carries its own colour and its own claim place, so switching
	// towns restands the character in the colour that copy was pulled in there with.
	// Absent a town the player picked, a character standing at the head of the grid
	// stands as the copy that put it there, so the bordered cell is the fielded card and
	// not some other one of the same fighter; everything else falls back to its first copy,
	// which is also where a shown copy filtered out of the grid lands, so the cell is
	// never left pointing at a card that isn't there. The place names, the show assignment
	// and the slots are threaded in so the grid re-derives as they load or the team changes
	// (a bare helper call would hide those deps).
	$: pagedStatues = ((
		names: Map<string, string> | null,
		shows: Map<string, { id: number; name: string }[]>,
		shown: Map<string, string>,
		slots: Map<string, number>,
		owned: Map<string, CharacterSpawn[]>,
		selectable: Set<string>
	) =>
		pagedGroups.map((group) => {
			const shownId = shown.get(group.characterId);
			const copy =
				group.copies.find((spawn) => spawn.id === shownId) ??
				fieldedCopy(group.copies, slots) ??
				group.copies[0];
			// The places are read off everything the player owns of this character rather than
			// off the cell's own copies, which are only the ones that got through the filters:
			// the rest are the disabled entries. What the cell may stand as is still the cell's
			// copies, and that is what `selectable` marks — it is the same question the grid
			// answered when it built them.
			const places = groupPlaces(owned.get(group.characterId) ?? group.copies, selectable, names);
			// Which entry the place selector sits on. Two copies from one town in one
			// colour are a single entry, so a shown copy that was the second of them has
			// none of its own — the entry that stands for its town and colour is the one
			// the selector must read, or it would show blank for a card that is right there.
			const place =
				places.find(
					(entry) =>
						entry.copy.locationId === copy.locationId && entry.copy.color === copy.color
				) ?? places[0];
			return {
				group,
				copy,
				places,
				placeValue: place.copy.id,
				statue: toStatue(copy, names, shows),
				// Whether the copy on show is the one holding a slot — the cell's border, so
				// the mark follows the card rather than the character: switch a fielded
				// character to a copy that isn't on the team and the border goes with it.
				fielded: slots.has(copy.id)
			};
		}))(
		municipalityNames,
		characterShows,
		shownCopyByCell,
		teamSlotById,
		copiesByCharacter,
		selectableIds
	);

	// The line-up as the row the map's corner draws: the cards that are actually fielded, in
	// slot order, each as the statue that stands for it. An empty slot is not a member and
	// is simply not there — the row is the side, not the shape of a side, which is the one
	// thing it stopped saying when it stopped being a grid of three cells.
	// The place names and the show assignment are threaded in for the same reason the grid's
	// are — the statues re-derive as those load rather than standing on stale captions.
	// The card each member stands for is kept beside it, since a press on the row names the
	// member and the team is toggled by the card's id.
	$: partyLineup = ((
		names: Map<string, string> | null,
		shows: Map<string, { id: number; name: string }[]>,
		cards: (CharacterSpawn | null)[]
	) =>
		cards.flatMap((spawn) =>
			spawn ? [{ spawn, statue: toStatue(spawn, names, shows) }] : []
		))(municipalityNames, characterShows, $teamCards);

	// What the row itself is handed: the statues alone, in the same order.
	$: partyMembers = partyLineup.map((entry) => entry.statue);

	// Tapping a statue puts the copy it is showing on the team or takes it off (into the
	// first free slot, or out of the one it holds). It is the statue that acts and the
	// select that only chooses which copy it stands as — picking a town to look at the copy
	// pulled there must never field it. A tap while a line-up is in flight is dropped rather
	// than queued: the team is the server's, and two saves racing would be two answers
	// to the same question.
	function handleCardTap(spawn: CharacterSpawn): void {
		if ($teamSaving) return;
		void teamService.toggle(spawn.id);
	}

	// The same move the cell's own button makes, and the only one it makes: field the
	// shown copy or take it out again — the very thing tapping the statue does.
	function handleTeamButton(spawn: CharacterSpawn): void {
		if ($teamSaving) return;
		void teamService.toggle(spawn.id);
	}

	// How many slots are filled, for the line above the grid.
	$: teamFilledCount = $teamSlots.filter(Boolean).length;

	// The colours the team can still take — its lead's own plus the ones that share a
	// colour with it — folded into the header filters, so the grid shows the cards the
	// team could actually take. It is the lead that sets the rule, so nothing is
	// narrowed while the lead slot is empty, where any card is a legal first pick.
	$: pickableColors = $teamColorFilter;

</script>

<!-- The sheet, the blur, the title bar and Escape are the modal's; everything below is
	the roster. The sheet stays even though this is a page now, for the same reason the
	arena's does: it is the one full-view surface this game has, and a fight and a roster
	being routes rather than sheets is about where they live, not about what they look like.
	The toolbar takes what it needs of that column and the grid gets the rest, which is what
	its scroll box is sized from. -->
<FullScreenModal title={$_('roster.title')} closeLabel={$_('roster.close')} on:close={close}>
	{#if $status === AuthStatus.SignedIn && $spawns.length > 0}
		{#if $teamError}
			<!-- The team is the server's, so a refused line-up is said in the server's own
			     words — the card sprang back to where it was, and this is why. -->
			<div class="alert alert-error flex-none py-2 text-sm"><span>{$teamError}</span></div>
		{/if}
	{/if}

	<div class="flex min-h-0 flex-1 flex-col">
		{#if !authService.configured}
			<div class="alert alert-warning text-sm">
				<span>{$_('roster.notConfigured')}</span>
			</div>
		{:else if $status === AuthStatus.Loading}
			<div class="flex justify-center py-12">
				<span class="loading loading-spinner loading-md"></span>
			</div>
		{:else if $status !== AuthStatus.SignedIn}
			<div class="card max-w-md bg-base-200">
				<div class="card-body gap-4">
					<p class="text-sm opacity-70">{$_('roster.signInBody')}</p>
					<!-- The way in is a box mounted at the layout root, so it would stand over this
					     page perfectly well — but a player signing in has nothing to read here until
					     they have, so the prompt leaves the roster the way they came and raises the
					     sheet there. Coming back is the same press that brought them. -->
					<button
						class="btn btn-primary btn-sm w-fit"
						on:click={() => {
							close();
							openSignIn();
						}}
					>
						{$_('roster.signIn')}
					</button>
				</div>
			</div>
		{:else if error}
			<div class="alert alert-error text-sm"><span>{error}</span></div>
		{:else if loading}
			<div class="flex items-center gap-2 text-sm opacity-70">
				<span class="loading loading-spinner loading-xs"></span>
				{$_('roster.loading')}
			</div>
		{:else if $spawns.length === 0}
			<div class="card max-w-md bg-base-200">
				<div class="card-body gap-4">
					<p class="text-sm opacity-70">{$_('roster.emptyBody')}</p>
					<!-- A player with no cards is sent to the map rather than back the way they
					     came: the box that gives them their first one is drawn on a town, and the
					     button says so. Everywhere else here, leaving is going back. -->
					<button class="btn btn-primary btn-sm w-fit" on:click={() => void goto(MAP_ROUTE)}>
						{$_('roster.openMap')}
					</button>
				</div>
			</div>
		{:else}
			<!-- What the grid is read with: the pager, and whether a line-up is in flight.
			     Nothing here says how the grid is laid out any more — the columns are fixed
			     and a character is one cell, so both of those are the layout rather than
			     something a player is asked about. -->
			<div class="mb-3 flex flex-none flex-wrap items-center justify-end gap-3">
				{#if pageCount > 1}
					<div class="join">
						<button
							class="btn join-item btn-sm"
							disabled={page === 0}
							on:click={() => goToPage(page - 1)}
							aria-label={$_('roster.previousPage')}
						>
							‹
						</button>
						<span class="btn no-animation join-item pointer-events-none btn-sm font-normal">
							{$_('roster.page', { values: { page: page + 1, total: pageCount } })}
						</span>
						<button
							class="btn join-item btn-sm"
							disabled={page >= pageCount - 1}
							on:click={() => goToPage(page + 1)}
							aria-label={$_('roster.nextPage')}
						>
							›
						</button>
					</div>
				{/if}
				{#if $teamSaving}
					<span class="flex items-center gap-2 text-xs opacity-60">
						<span class="loading loading-spinner loading-xs"></span>
						{$_('roster.savingTeam')}
					</span>
				{/if}
			</div>
			<!-- The roster: a statue per character — the same one the map's panel stands the
			     team up with — each cell naming which of that character's copies is standing
			     in it. It is four cards
			     across, on the right of the two things it is read with: the filters and the
			     line-up, which are three across on the left. A card is in one of the two
			     grids and never both — the ones holding a slot are the left grid's and are
			     left out of the right, or the same three statues would stand twice over and
			     be read as six cards. Each roster cell carries the button that fields or
			     unfields the copy it is showing, pinned to its top corner; tapping the statue
			     itself does the same thing, and picking a town only changes which copy is
			     shown. Only the current page is mounted —
			     the filters narrow the roster, the pager walks what's left ROWS_PER_PAGE rows
			     at a time — and that page scrolls in its own grid, the filters and the line-up
			     keeping their place beside it rather than travelling with it.
			     Every statue here is veiled and uncovered whatever the session has already
			     watched arrive elsewhere (alwaysReveal). A reveal is spent once per character
			     across the page normally, which on a surface whose whole content is characters
			     meant some cards swept in and the ones the player had met on the map or in a
			     pack were simply already there — one grid drawing itself two different ways. The
			     roster is the place a player comes to look at their cards, so here the picture
			     always arrives. -->
			<!-- Two grids, not one: three columns of the filters and the line-up on the left,
			     four of the roster on the right, standing in a seven-column frame at the gap both
			     of them use, so a cell of either is one column of that frame wide and the two
			     read across as a single rhythm.
			     Below lg the frame is one column instead and the two stack, the filters and the
			     line-up over the cards, both three across.
			     The frame itself does not scroll and takes exactly the height the toolbar leaves
			     it: it is the cards that scroll, inside their own grid, so the filters and the
			     line-up stay where they are however far down the roster the player reads. That is
			     what each grid being a scroll box of its own buys — and it is also what lets them
			     be clamped at all, an element that scrolls having no minimum height of its own to
			     push the frame open with. content-start on both keeps their rows at their own
			     heights rather than stretched down the frame.
			     Stacked, the same thing is said with rows: the first takes the height the filters
			     and the line-up ask for and the second takes the rest, which is the pane that
			     scrolls. The first is capped at 45vh, or a long enough list of shows would ask for
			     the whole frame and leave the cards a pane of no height at all; past the cap that
			     grid scrolls on its own, which it is already a box for.
			     The panel is each card's own, not the grid's and not the frame's. One under the
			     whole frame had said the filters, the line-up and the cards were a single
			     surface; one under the right grid alone still said the cards were a sheet with
			     things on it. They are a set of cards, so each of them is a panel of base-200
			     at half strength — enough of a tile to stand a statue on, thin enough that the
			     page keeps coming through it — and what shows between them is that same page at
			     full strength. Everything on the left stands on that
			     same page — the filter card being its own panel already, in the lighter stock,
			     and the line-up wanting nothing behind it. Dropping the grid's padding with its
			     background also puts the four columns back exactly on four of the frame's
			     seven, which the padding had been shaving a few pixels off. -->
			<div
				class="grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-3 lg:grid-cols-7 lg:grid-rows-none"
			>
				<!-- The line-up and the filters, three across: the line-up first, over all three
				     columns because it shares its own width between its members, and the filter
				     card under it over the same three. The team is what this side of the view is
				     for and the filters are what the other side is read with, so the side meets
				     the eye at the top of the column and the card that narrows the roster sits
				     below it, next to the cards it narrows. -->
				<div
					class="grid max-h-[45vh] min-h-0 grid-cols-3 content-start gap-3 overflow-y-auto lg:col-span-3 lg:max-h-none"
				>
					<!-- The line-up at the head of the column: the very row the map's corner stands
					     the side in — TeamLineup, the same component over the same statues — rather
					     than three cells of this grid drawing the team a second way. So the side a
					     player arranges here is the side they will see over the map, lapped and
					     ordered exactly as it will be there, and the two can never drift apart.
					     It is laid across all three columns because it shares its own width out.
					     Taking a card back off the team is still the one thing it does, and now it
					     is the statue that does it: pressing a member unfields it, which is the
					     gesture the roster's own cards already answer to. -->
					<TeamLineup
						members={partyMembers}
						owner={sideOwner}
						alwaysReveal
						selectable={!$teamSaving}
						on:select={(event) => handleTeamButton(partyLineup[event.detail.index].spawn)}
						classes="col-span-3"
					/>

					<!-- The filter card, under the line-up and over all three columns. Every control
					     in it ANDs with the others, and Clear at the foot lets go of all of them at
					     once. Where the shows run long the card runs past the frame, which is why the
					     column it is in is a scroll box of its own — Clear is at the bottom of the
					     card wherever that bottom falls. -->
					<div class="col-span-3 flex flex-col gap-3 rounded-box bg-base-100 p-3">
						<!-- No caption over any of the three: a search box says what it is with its
						     own placeholder, a swatch is the colour it filters to and a chip is the
						     show's own wordmark, so a word above each of them was naming what was
						     already in front of the player. What the caption carried for a screen
						     reader is carried instead by the control itself — the input's aria-label
						     here, the two groups' below. -->
						<input
							type="search"
							class="input input-sm input-bordered w-full"
							placeholder={$_('roster.searchByName')}
							aria-label={$_('roster.filterByName')}
							bind:value={filterName}
						/>

						<!-- The colours and the shows side by side, a column of the card each: the
						     colours are a block six squares can be laid out inside rather than a row
						     needing the full width, and the shows are a list that runs as long as the
						     roster's shows do — so what one saves in width the other spends in height,
						     and they cost the card the taller of the two rather than the sum. -->
						<div class="grid grid-cols-2 items-start gap-3">
							<!-- The colours are the swatches themselves rather than a list of their
							     names: there are exactly six, so they are two rows of three, and a
							     square saying red is quicker to read than the word and needs no
							     translating. Not a <label>, since there is no one control here to
							     label — a group of six buttons, each pressed or not. -->
							<div
								class="grid grid-cols-3 gap-1"
								role="group"
								aria-label={$_('roster.filterByColor')}
							>
								{#each COLOR_OPTIONS as color (color)}
									<button
										type="button"
										class={colorSquareClasses(color, filterColor)}
										title={$_(`roster.colors.${color}`)}
										aria-label={$_('roster.filterByThisColor', {
											values: { color: $_(`roster.colors.${color}`) }
										})}
										aria-pressed={filterColor === color}
										on:click={() => toggleColorFilter(color)}
									></button>
								{/each}
							</div>

							<!-- The shows say themselves the way the statues do: their own lettering,
							     not their names set in ours. One to a row, the full width of the column:
							     a wordmark is wide, and two side by side left each of them a smudge. A
							     show whose logo is not enabled yet falls back to its name, so it is
							     still there to filter by — and the whole group only stands while the
							     roster holds cards from more than nothing, which leaves the colours the
							     first of the pair's two columns and nothing in the second. -->
							{#if showFilterOptions.length > 0}
								<div
									class="flex flex-col gap-1"
									role="group"
									aria-label={$_('roster.filterByShow')}
								>
									{#each showFilterOptions as show (show.id)}
										<button
											type="button"
											class={showChipClasses(show.id, filterShow)}
											title={show.name}
											aria-label={$_('roster.filterByThisShow', {
												values: { show: show.name }
											})}
											aria-pressed={filterShow === show.id}
											on:click={() => toggleShowFilter(show.id)}
										>
											{#if $showLogos.get(show.id)}
												<img
													src={$showLogos.get(show.id)?.url}
													alt={show.name}
													class="max-h-full max-w-full object-contain"
												/>
											{:else}
												<span class="truncate text-[0.625rem] text-white/80">{show.name}</span>
											{/if}
										</button>
									{/each}
								</div>
							{/if}
						</div>

						<!-- Clear closes the card, under everything it undoes: the three filters are
						     what the card is, and the way out of them is read after them rather than
						     before there is anything to get out of. Disabled while no filter is
						     narrowing anything, so it is only a button when it has something to do. -->
						<button
							class="btn btn-ghost btn-sm w-full"
							disabled={!filtersActive}
							on:click={resetFilters}
						>
							{$_('roster.clear')}
						</button>
					</div>

				</div>

				<!-- The roster itself, four cards across, to the right of the two things it is read
				     with. Its own grid: the cards are one kind of cell and the filters and the
				     line-up another, and a single grid could not have given the one four columns and
				     the other three. The empty-roster line is a cell of it too, spanning the four,
				     rather than something laid over the box — an overlay would cover the very
				     controls a player has to reach to undo the filter that emptied it. -->
				<div
					bind:this={gridScroller}
					class="grid min-h-0 grid-cols-3 content-start gap-3 overflow-y-auto lg:col-span-4 lg:grid-cols-4"
				>
					{#each pagedStatues as { group, copy, places, placeValue, statue, fielded } (group.characterId)}
						<!-- The border is on the cell, not on the statue: it takes in the strip over
						     it too, so what it marks is this character's whole entry. Every cell
						     carries it and only a fielded one colours it in, so joining the team
						     never nudges the grid by two pixels. Nothing in this grid
						     is fielded while the line-up stands in a row of its own, so the coloured
						     border is what a card fielded from a one-grid roster would wear: it costs
						     nothing to leave standing, and it is the one thing that would have to be
						     found again if the two ever became one. -->
						<div
							class={classNames(
								'relative flex flex-col gap-2 rounded-box border-2 bg-base-200/50 p-1.5',
								{
									'border-primary': fielded,
									'border-transparent': !fielded
								}
							)}
						>
							<!-- The top of the cell, over the statue rather than laid out above it, so
							     the strip is in the same place in every cell whatever the art below it
							     does: which of this character's copies is standing on the left, the team
							     button at the right end.
							     The copies are asked for by the town they were claimed in — a native
							     select, since a menu of our own would be clipped by the scroll box this
							     grid lives in, and each option says its colour with a square, the one
							     thing an option can carry that a stylesheet cannot reach. A character the
							     player holds one of gets the select too, naming its one town: the strip
							     is the same in every cell, and a control that came and went with how many
							     copies were owned would move the team button under it.
							     The button is a minus on a fielded card, a plus on one that could still
							     be fielded, and disabled once the team is full — a plus that cannot add is
							     a dead button, and the server would refuse the card anyway. -->
							<div class="absolute inset-x-1 top-1 z-10 flex items-center gap-1">
								<select
									class="select select-xs min-w-0 max-w-[8rem] flex-initial shadow"
									aria-label={$_('roster.claimedIn', { values: { name: statue.label } })}
									value={placeValue}
									on:change={(event) => showCopy(group.characterId, event.currentTarget.value)}
								>
									{#each places as place (place.copy.id)}
										<!-- A town the cell cannot go to is still listed, disabled: the card is
										     one the player holds, and it is out of reach either because a filter
										     put it aside or because it is on the team and standing in the grid
										     to the left. Dropping it had made the selector a different list
										     under every filter, saying a character was claimed in fewer places
										     than they were. -->
										<option value={place.copy.id} disabled={!place.selectable}>
											{SPAWN_SQUARE_GLYPHS[place.copy.color]}
											{place.locationName}
										</option>
									{/each}
								</select>
								<button
									type="button"
									class={classNames(
										'btn btn-circle btn-xs ml-auto text-base leading-none shadow',
										fielded ? 'btn-primary' : 'btn-neutral'
									)}
									disabled={$teamSaving || (!fielded && teamFilledCount >= TEAM_SIZE)}
									title={$_(fielded ? 'roster.removeFromTeam' : 'roster.addToTeam', {
										values: { name: statue.label }
									})}
									aria-label={$_(fielded ? 'roster.removeFromTeam' : 'roster.addToTeam', {
										values: { name: statue.label }
									})}
									on:click={() => handleTeamButton(copy)}
								>
									{fielded ? '−' : '+'}
								</button>
							</div>
							<button
								type="button"
								class="rounded-box transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
								on:click={() => handleCardTap(copy)}
							>
								<CharacterStatue
									label={statue.label}
									basePath={statue.basePath}
									color={statue.color}
									box={statue.box}
									locationName={statue.locationName}
									spawnedAt={statue.spawnedAt}
									showId={statue.showId}
									alwaysReveal
								/>
							</button>
						</div>
					{/each}
				<!-- Said under the grid rather than laid over it: the filters are cells of that
				     grid now, and an overlay filling the box would cover the very controls the
				     player has to reach to get their cards back. Only where there are cards it
				     could be talking about: a player whose whole roster is on the team has an
				     empty grid with nothing hiding anything, the party row above holding every
				     card they own, and blaming the filters for that would be a lie. -->
				{#if filteredSpawns.length === 0 && $spawns.length > teamFilledCount}
					<div
						class="col-span-3 flex flex-col items-center justify-center gap-3 py-12 text-center lg:col-span-4"
					>
						<p class="text-sm opacity-60">{$_('roster.noMatches')}</p>
						<button class="btn btn-outline btn-sm" on:click={resetFilters}>
							{$_('roster.clearFilters')}
						</button>
					</div>
				{/if}
				</div>
			</div>
		{/if}
	</div>
</FullScreenModal>
