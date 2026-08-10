<script lang="ts">
	import classNames from 'classnames';
	import { onMount } from 'svelte';
	import type { Readable } from 'svelte/store';
	import { _ } from 'svelte-i18n';
	import { blur } from 'svelte/transition';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { characters } from '@3xl/data';
	import SignInButton from '$components/core/SignInButton.svelte';
	import PlayerPanel from '$components/core/PlayerPanel.svelte';
	import WorldMap from '$components/core/WorldMap.svelte';
	import MapBreadcrumbs from '$components/core/MapBreadcrumbs.svelte';
	import RegionCurrentBadge from '$components/core/RegionCurrentBadge.svelte';
	import BoosterBox from '$components/core/pack/BoosterBox.svelte';
	import MusicBanner from '$components/core/MusicBanner.svelte';
	import BandMenu from '$components/core/BandMenu.svelte';
	import RegionLocationList from '$components/core/RegionLocationList.svelte';
	import ShowShareGrid from '$components/core/ShowShareGrid.svelte';
	import LocationSearchBox from '$components/core/LocationSearchBox.svelte';
	import SocialLinks from '$components/core/SocialLinks.svelte';
	import SplashScreen from '$components/core/SplashScreen.svelte';
	import TownPin from '$components/core/TownPin.svelte';
	import CharacterClaimPanel from '$components/core/CharacterClaimPanel.svelte';
	import TeamLineup from '$components/core/TeamLineup.svelte';
	import { loadBoardEngine } from '$components/core/MugenBoard.svelte';
	import Countdown from '$components/core/Countdown.svelte';
	import CollectionModal from '$components/core/CollectionModal.svelte';
	import LeaderboardModal from '$components/core/LeaderboardModal.svelte';
	import FaqModal from '$components/core/FaqModal.svelte';
	import CreditsModal from '$components/core/CreditsModal.svelte';
	import BoosterModal from '$components/core/BoosterModal.svelte';
	import LevelBoosterModal from '$components/core/LevelBoosterModal.svelte';
	import { rosterModalOpen } from '$services/rosterModal';
	import { collectionModalOpen } from '$services/collectionModal';
	import { settingsModalOpen } from '$services/settingsModal';
	import { openSignIn } from '$services/signInModal';
	import { avatarPickerOpen } from '$services/avatarPicker';
	import { leaderboardModalOpen } from '$services/leaderboardModal';
	import { faqModalOpen, openFaq } from '$services/faqModal';
	import { radarCooldownUntil, startRadarCooldown } from '$services/radarCooldown';
	import { creditsModalOpen, openCredits } from '$services/creditsModal';
	import { boosterModalOpen } from '$services/boosterModal';
	import { openCombat, battleShown } from '$services/combat';
	import type { OpenerPack } from '$components/core/pack/scene/opener-view.type';
	import { preloadPackArt } from '$components/core/pack/scene/preload-pack-art';
	import { spawnService } from '$services/spawn.service';
	import { musicService } from '$services/music.service';
	import { authService } from '$services/auth.service';
	import { territoryService } from '$services/territory.service';
	import { battleService } from '$services/battle.service';
	import { territoryAdapter } from '$adapters/classes/territory.adapter';
	import { locationAdapter } from '$adapters/classes/location.adapter';
	import { ULTRAMAR, ULTRAMAR_ID } from '$types/location.type';
	import { WELCOME_BOX_CAPTION, isWelcomeLocation } from '$utils/spawn/welcome-box';
	import {
		LEVEL_BOX_CAPTION,
		isLevelLocation,
		pendingLevelBoxes
	} from '$utils/spawn/level-box';
	import {
		challengeAvailableAt,
		challengeCoolingDown,
		type MunicipalityChallenge,
		type MunicipalityHolder,
		type MunicipalitySiege
	} from '$types/territory.type';
	import type { OpenBattle } from '$types/battle.type';
	import { AuthStatus, type Profile } from '$types/profile.type';
	import { TEAM_SIZE, teamService } from '$services/team.service';
	import {
		buildMunicipalityTeam,
		ogTeamSpawns,
		type TeamMemberRoll
	} from '$utils/spawn/municipality-team';
	import { REGION_COLOR_CSS } from '$utils/color/region-color';
	import { coordinateSeed, seededShowId, seededShowPool } from '$utils/geo/municipality-show';
	import { teamShowId, showIdsByCharacter, holderShowIds } from '$utils/spawn/team-show';
	import { teamLineupMembers } from '$utils/spawn/team-lineup';
	import { showPosterUrl, showPosterUrlForSeed } from '$utils/geo/municipality-show';
	import { showLogoUrl } from '$utils/show/show-logo';
	import { forShow } from '$utils/show/show-icon';
	import { showGlyphs } from '$services/shows.service';
	import { SpawnColor, type CharacterSpawn } from '$types/character-spawn.type';
	import { ArtificialColor, type RegionColor } from '$types/region-color.type';
	import { REGION_PANEL_CLASSES } from '$components/core/spawn-colors';
	import {
		buildRegionTree,
		buildFillIndex,
		buildRegionNodes,
		flattenRegionNodes,
		everyTownPlurality,
		nodePath,
		regionLevelNodes,
		municipalityIdsForKey,
		type FillLevel,
		type RegionNode,
		type RegionShow,
		type RegionType
	} from '$utils/geo/region-tree';
	import { buildRegionSieges, type RegionSiege } from '$utils/geo/region-siege';
	import { groupShapes, type Grouping, type ShapeRun } from '$utils/geo/group-outline';
	import { boundsForFeatures, boundsByFeatureId, type LatLngBounds } from '$utils/geo/bounds';
	import { nearestUnclaimedBox } from '$utils/geo/nearest-box';
	import {
		centroidsByFeatureId,
		combineCentroids,
		interiorPoint,
		type Centroid,
		type LatLng,
		type RegionShape
	} from '$utils/geo/center';
	import { buildShowStandings } from '$utils/geo/show-standings';
	import restoreCatalanArticle from '$utils/string/restore-catalan-article';
	import foldText from '$utils/string/fold-text';
	import { boosterWindow } from '$utils/festes/booster-window';
	import type {
		MapBoosterBox,
		MapChallenge,
		MapGroupMark,
		MapMarker,
		MapOutline,
		MapOverlay,
		TownPlateCard
	} from '$types/map.type';
	import type { ShowEntry, ShowsCollection } from '$types/show.type';
	import { festesService, catalanTodayIso } from '$services/festes.service';
	import type { FestaWindowRow } from '$types/festivity.type';
	import { boxForFesta, claimedBoxKey, festaYear } from '$utils/spawn/claimed-box';

	/** svelte-i18n's message formatter, read off the store whose value it is. */
	type Translate = typeof _ extends Readable<infer T> ? T : never;

	// The municipality polygons, feeding the region tree and the map framing — and,
	// through each polygon's own GPS seed, the show every town flies (see
	// `buildTownShows`).
	let municipalities: GeoJSON.FeatureCollection | null = null;
	// Held until the fetches settle so the map renders against the loaded data.
	let ready = false;
	// The municipalities the map stands a booster box on, read from Supabase — the
	// `festivities` fetch, in the two reads the boxes are printed from: every town the
	// booster window reaches (three days back through four ahead), and today's alone. A
	// town in both is de festa now and gets the white card; a town only in the window has
	// a day that is past or still coming and gets the black one, exactly as the Booster
	// tab prints that town's box. Each town's `id` matches a municipality feature id, so
	// it resolves to a polygon on the map.
	let windowFestes: FestaWindowRow[] = [];
	let todayFesteIds = new Set<string>();
	// Every box this reader has already taken, as (town, year, stock) keys. The claim
	// panel below loads them; this page reads the same store, so the boxes on the map and
	// the boxes on the sheet are spent together.
	const claimedBoxes = spawnService.claimedBoxes;
	// Every booster pack in the window (three days back through four ahead), computed by
	// a hidden CharacterClaimPanel, which turns those festes + the player's shows into
	// openable packs. Kept here so clicking a box opens that town's pack at once,
	// with no extra loading. Empty when signed out or before the show pool loads.
	let claimPacks: OpenerPack[] = [];
	// The municipality whose festa pack the side panel's Booster tab shows, or
	// null when no box has been clicked yet.
	let packTownId: string | null = null;
	// Live map zoom, kept in sync by WorldMap and shown in the top-left panel.
	let currentZoom = 8;
	// The tier of pins WorldMap is currently drawing (0 = coarsest), reported back
	// as the map zooms. Drives the effective breakdown the sidebar and polygons show.
	let activeLevel = 0;
	// The map centre WorldMap reports, used to tell which region the view is
	// focused on so the sidebar and polygons follow what's zoomed into.
	let currentCenter: [number, number] = [41.8, 1.7];
	// The top view, as a value the `region` param can hold. The view above every territory
	// is the one step of the drill path with no node behind it, so there is no key for it —
	// and without one, picking it could only be said by clearing the param, which does not
	// mean the same thing: an empty param is nothing picked, and nothing picked follows the
	// zoom (see effectiveSelected), so asking for the whole of the Països Catalans while
	// zoomed into a comarca left the crumbs and the table exactly where they were. It is a
	// selection like any other now, and a linkable one. No territory slugifies to this, so
	// it can never be mistaken for a region in the tree.
	const TOP_VIEW_KEY = 'paisos-catalans';
	// What that view is called. Not in the catalogue: it is the name of the place this whole
	// map is of, which is the same word in the one language the game is written in. It is
	// said in two places — the head of the crumb bar and the band across the top of the page —
	// and they are the same step, so it is written once.
	const TOP_VIEW_LABEL = 'Països Catalans';

	// What the URL says is open.
	$: regionParam = $page.url.searchParams.get('region');

	// Whether the player asked for the top view itself, as against not having asked for
	// anything. Both leave `selected` null — there is no node to name — but only the second
	// hands the view over to the zoom.
	$: topPicked = regionParam === TOP_VIEW_KEY;

	// The single open region, driven entirely by the `region` query param, by its
	// node key — the only region the map paints with its poster, and the head of
	// the one open drill path. A node's key matches the fill index: a territory is
	// its own id, deeper tiers append theirs, a municipality is its own id. Null
	// means no region of the tree is open, which is the top view either way.
	$: selected = topPicked ? null : regionParam;

	// How many times a region has been picked. Nothing reads it for its value: it is what
	// makes a pick a movement rather than a change of state, since the region asked for may
	// well be the region already open — clicking the pin the map is already framed on asks for
	// exactly that, and so does a crumb naming a place the view has since wandered off. The URL
	// does not change on either, so nothing downstream of it would, and the framing below
	// takes this instead so that a pick always re-frames.
	let picks = 0;

	// Point the URL at a region (or clear it), which reactively re-derives every
	// piece of open/expanded/selected state below. Pushed as history so the back
	// button walks the drill path; focus and scroll are preserved across the nav.
	// Nothing is brought forward with it any more: the region is drawn on the map's own
	// Location plate, which is folded or unfolded because the player left it that way, and
	// a pin click is not a reason to overrule that — the map frames the region either way,
	// and a picked town says so on its own plate.
	function open(key: string | null) {
		picks += 1;
		const params = new URLSearchParams($page.url.searchParams);
		if (key) params.set('region', key);
		else params.delete('region');
		const query = params.toString();
		goto(query ? `?${query}` : location.pathname, { keepFocus: true, noScroll: true });
	}

	onMount(async () => {
		// Load the polygons (for the region tree, the framing and every town's own
		// seed) and the saved shows (for the name and poster a seeded show is drawn
		// with) in parallel; both are optional, so settle each independently and always
		// flip `ready` so the map renders regardless.
		const [municipisResult, savedShowsResult] = await Promise.allSettled([
			fetch(municipalityLayer).then((response) => response.json()),
			fetch('/data/shows.json').then((response) => response.json() as Promise<ShowsCollection>)
		]);

		if (municipisResult.status === 'fulfilled') {
			// The region tree simply stays empty if the polygons fail to load.
			municipalities = municipisResult.value;
		}
		if (savedShowsResult.status === 'fulfilled') {
			// Every authored show, so both a seeded and a ruling show id resolve to a name
			// and a poster. Failing to load it leaves every town unshown — a pin falls back
			// to its plain fill rather than to a wrong show.
			savedShowById = new Map(
				(savedShowsResult.value.shows ?? []).map((entry) => [
					entry.show.id,
					{ id: entry.show.id, name: entry.show.name, posterUrl: showPosterUrl(entry) }
				])
			);
			// The same entries kept whole, and not reduced to one poster: a booster box's
			// cover is picked out of the author-enabled set per town and year, and its
			// wordmark comes out of the same entry (see `festaBoxes`), so the box on the
			// map is printed from what the Booster tab prints its own from.
			showEntryById = new Map(
				(savedShowsResult.value.shows ?? []).map((entry) => [entry.show.id, entry])
			);
		}
		ready = true;

		// The show → renderable-character assignment, read once from Supabase. It is what
		// says which shows the game has anything to deal at all, so it is both the pool
		// every town's show is seeded out of (see `buildTownShows`) and the roster a town's
		// house team is rolled from. Read-only: nothing is written back. Read first of the
		// Supabase loads for that reason — the pins are lettered off it — and if it is
		// unconfigured or unreadable the map simply stands with no show on any town.
		try {
			const claimable = await spawnService.loadShows();
			showCharacterIds = new Map(claimable.map((show) => [show.id, show.characterIds]));
		} catch {
			showCharacterIds = new Map();
		}

		// The festa-major towns the boxes stand on, loaded after the map is ready so a
		// slow (or unconfigured) Supabase never blocks the map: the boxes simply pop in
		// once they arrive. The window read is what puts a box on the map at all and the
		// today read only says which card it is printed on, so each is settled on its own
		// — a failed today read leaves every box black rather than taking the whole layer
		// down with it, the same way the booster grid falls back to its dark card.
		const [windowResult, todayResult] = await Promise.allSettled([
			festesService.loadFestesForWindow(),
			festesService.loadTodayFestes()
		]);
		if (windowResult.status === 'fulfilled') windowFestes = windowResult.value;
		if (todayResult.status === 'fulfilled') {
			todayFesteIds = new Set(todayResult.value.map((festa) => festa.id));
		}

		// Who actually occupies each town, plus this player's own siege progress.
		// Loaded last and independently: a town with no holder simply stays on its
		// seeded OG team, which is exactly what an unconfigured or failing Supabase
		// leaves every town on.
		await reloadTerritory();

		// And the fight this player is already in, if any — which takes them straight to the
		// arena, off this page (see the resume rule below). A battle is not this tab's, so it
		// is waiting here however they left it and wherever they left it.
		await reloadBattle();
	});

	// --- Territory: the towns players have taken off their seeded teams ----------
	// A municipality with a holder row is occupied by that player's frozen team, and
	// that is what the panel shows and what a challenger fights; the seeded roll
	// below is only the fallback for towns nobody has taken yet. Taking a town needs
	// as many wins as it has changed hands, plus one — so every flip makes the
	// sitting team harder to shift. Those wins are paced by a cooldown rather than
	// rationed by the day: finishing a fight over a town shuts that town to that
	// player for an hour, timed from the end of the fight, and they may walk straight
	// back in once it runs out.

	// Every occupied town, this player's banked wins, and the towns currently closed to
	// them — the one they are fighting over, plus every one still cooling down — keyed
	// by municipality id. Reassigned wholesale (never mutated) so the reactive
	// statements below re-run.
	let holders = new Map<string, MunicipalityHolder>();
	let sieges = new Map<string, MunicipalitySiege>();
	let challenges = new Map<string, MunicipalityChallenge>();

	// The signed-in player, so a town they already hold isn't offered as a target.
	const profile = authService.profile;

	// Whether the corner at the foot of the map is showing the way in or the account itself
	// (see SignInButton, and the column below). Asked of the session's own state rather than
	// of `profile` being empty, because those are not the same question while the session is
	// still being restored: a visit with an account on disk has no profile for a moment, and
	// a door drawn in that moment is a door taken away again.
	const authStatus = authService.status;
	$: signedOut = $authStatus === AuthStatus.SignedOut;

	// The fight this player is already in, if any. A battle outlives the arena, the
	// page and the device it was started on, so it is loaded like any other ledger and
	// the map offers the way back into it instead of a new fight.
	const openBattle = battleService.open;

	async function reloadBattle(): Promise<void> {
		try {
			await battleService.load();
		} catch {
			battleService.clear();
		}
	}

	async function reloadTerritory(): Promise<void> {
		try {
			holders = await territoryService.loadHolders();
		} catch {
			holders = new Map();
		}
		try {
			sieges = await territoryService.loadSieges();
		} catch {
			sieges = new Map();
		}
		await reloadChallenges();
	}

	// The running cooldowns on their own — re-read whenever a fight opens, a fight
	// settles, or one of them runs out, so the Challenge button opens and closes the
	// town without a reload.
	async function reloadChallenges(): Promise<void> {
		try {
			challenges = await territoryService.loadChallenges();
		} catch {
			challenges = new Map();
		}
	}

	// A fight is a page of its own now (`/combat`), so what a settled fight did to a town and
	// what a closed one did to that town's cooldown are both read again by this page simply
	// being walked back onto: leaving the arena is a navigation home, and the mount above
	// reloads the holders, the sieges and the cooldowns. There is nothing left here to listen
	// to the arena with — it is not on this page to listen to — where there used to be an
	// `on:territory` reloading the occupancy and an `on:close` re-reading the hour a reported
	// fight starts on its town.

	// Bring the player back to their open battle the moment the map knows about one —
	// on load, and again after signing in. Leaving the arena is not leaving the fight,
	// so this deliberately fires once per battle: it puts them back in front of it, and
	// the Challenge button is what walks back in after that.
	//
	// The marker is a store out in $services/combat rather than a variable here, because this
	// page is mounted afresh every time the arena is left — a marker held here would forget on
	// exactly the visit it exists to remember, and the map would bounce the player straight
	// back into the fight they just walked out of.
	$: if ($openBattle && $openBattle.startedAt !== $battleShown) {
		battleShown.set($openBattle.startedAt);
		resumeBattle();
	}
	$: if (!$openBattle) battleShown.set(null);

	// The panel had three tabbed views and has none: it is the account, and the two views it
	// used to hold beside it — every show's standing across the map, and the window's booster
	// packs — are full-view modals on the sheet the roster and the badges already use (see
	// LeaderboardModal and BoosterModal). Both were tables and pictures being read in a 450px
	// column, and both could only be up by putting the other away; a pack in particular is
	// picked, stood up and sliced open, which is worth the viewport rather than a third of it.
	//
	// So the panel is the two buttons that raise them plus the account section under them, and
	// everything about *where the map is looking* had already left this column before them:
	// the path down to it is the bar across the top, the picked town says what it has to say
	// on its own pin, the side the player fields stands at the foot of the map, and who is
	// playing is a plate at its top-right. What is left in this column is the way in (signing
	// in) and the ways out of it.

	// How many municipalities each show flies, and its share of them all. Tallied
	// over `showsById`, which is already the seeded assignment with every held
	// town's ruling show written over it — so a conquest moves a town from one
	// show's tally to another's the moment the holders reload.
	$: showStandings = buildShowStandings(showsById);

	// Sieges and the running cooldowns are both RLS-scoped to the reader, so the
	// sets loaded before sign-in are nobody's. Reload whenever the signed-in account
	// changes (including signing out, which empties them). `$profile` is named
	// directly so the statement tracks it.
	// The open battle is the same: it belongs to an account, not to a page, so signing
	// in is what reveals the fight already waiting — and signing out puts it away.
	let siegesForUser: string | null = null;
	$: if (ready && ($profile ? String($profile.id) : null) !== siegesForUser) {
		siegesForUser = $profile ? String($profile.id) : null;
		void territoryService
			.loadSieges()
			.then((loaded) => (sieges = loaded))
			.catch(() => (sieges = new Map()));
		void reloadChallenges();
		if (siegesForUser) void reloadBattle();
		else battleService.clear();
	}

	// What the open region's shape is washed at: the thinnest wash on the map, and the floor
	// the pulse over it breathes from and back to (see buildPulse). Named because two places
	// need the same number and one of them is an animation, which cannot ask the other.
	const PICKED_WASH = 0.2;

	// The colour every division line is drawn in, at every tier. White, and
	// deliberately not the red the whole map used to be drawn in nor the colour of
	// the region it encloses: red is one of the six colours a region can fly now, so
	// a coloured border would read as a claim of its own. Colour is the wash's to
	// say; the lines only say where one region stops and the next begins, and white
	// tells that over any of the six and over the satellite alike.
	const lineColor = '#fff';

	// Coarse → fine rank of each division tier. Shared by the overlays below (which
	// tier carries the wash) and the border logic further down (which tiers keep
	// their lines), so both read the hierarchy off one list.
	const tierRank: Record<RegionType, number> = {
		Territory: 0,
		Province: 1,
		Comarca: 2,
		Municipality: 3
	};

	// The tier a rank names, which is the same list read the other way round — for the
	// one question that arrives as a rank and has to be answered about a tier (which
	// shows the level on screen is grouped by, see `showGroups`).
	const tierByRank = Object.fromEntries(
		Object.entries(tierRank).map(([tier, rank]) => [rank, tier as RegionType])
	) as Record<number, RegionType>;

	// How heavily each tier's border is drawn: the coarser the division, the thicker the
	// line, so the hierarchy is read off the map without reading a single name. Written
	// here rather than beside each overlay because the grouping line is drawn from it too
	// — it runs along these very borders and has to come out over them (see `showGroups`).
	const tierWeight: Record<RegionType, number> = {
		Territory: 3,
		Province: 2,
		Comarca: 1.5,
		Municipality: 1
	};

	// Something a region carries, gathered off the tree and keyed the way its own
	// polygons name themselves so a feature can be looked up straight from the layer
	// it arrives in: a municipality by its feature id, and every grouping by its NAME
	// — the geo layers carry codes of their own (`AT08`, `IT_alguer`) that the tree's
	// slugged ids don't match, while comarca, province and territory names are each
	// unique across the map.
	type ByRegion<T> = Record<RegionType, Map<string, T>>;

	// One walk of the tree per thing a polygon is painted from. `read` answers what a
	// node carries, or undefined where it carries nothing — a region whose show has
	// not landed, a town nobody holds — and a node answering nothing is simply left
	// out, which is what leaves the lookups below able to say "this shape has none".
	function byRegion<T>(nodes: RegionNode[], read: (node: RegionNode) => T | undefined): ByRegion<T> {
		const index: ByRegion<T> = {
			Territory: new Map(),
			Province: new Map(),
			Comarca: new Map(),
			Municipality: new Map()
		};
		const walk = (node: RegionNode) => {
			const value = read(node);
			if (value !== undefined) {
				index[node.type].set(node.type === 'Municipality' ? node.key : node.name, value);
			}
			for (const child of node.children) walk(child);
		};
		for (const node of nodes) walk(node);
		return index;
	}

	$: regionColors = byRegion(regionNodes, (node) => node.color);

	// The same walk for the show each region flies, as its TMDB id — which is what the
	// grouping line is drawn from (see `showGroups`). The id and not the show: two
	// regions fly the same show when they fly the same id, and a name is translated
	// data a TMDB refresh can move under it.
	$: regionShows = byRegion(regionNodes, (node) => node.show?.id);

	// How a feature of `tier` names itself: a municipality by its feature id, any
	// grouping by its NAME (see ByRegion). The one place that spelling is written,
	// so the lookups and the selection test below ask the same question of a shape.
	function featureKey(tier: RegionType, feature: GeoJSON.Feature | undefined): string | null {
		const props = feature?.properties;
		if (!props) return null;
		return tier === 'Municipality' ? String(props.id ?? '') : String(props.name ?? '');
	}

	// What a polygon of `tier` carries, or null when its region carries none of it (its
	// show's roster hasn't landed, or the town has no show at all) — such a shape keeps
	// its white outline and simply goes unwashed, leaving the satellite bare there, and
	// is left out of the grouping.
	//
	// A province polygon also answers from its territory: the tree drops the province
	// tier where a territory holds a single one (Illes Balears, Catalunya Nord, Andorra,
	// l'Alguer), and there the province polygon IS the territory. Written once and taken
	// by the colour and by the show alike, since that fallback is a fact about the tree
	// rather than about what is being read off it — one of them missing it would paint a
	// province the map has no province node for.
	function featureValue<T>(
		tier: RegionType,
		feature: GeoJSON.Feature | undefined,
		index: ByRegion<T>
	): T | null {
		const props = feature?.properties;
		if (!props) return null;
		const key = featureKey(tier, feature)!;
		const own = index[tier].get(key);
		if (own !== undefined) return own;
		if (tier === 'Province' && props.territory) {
			return index.Territory.get(String(props.territory)) ?? null;
		}
		return null;
	}

	// The opened region as a shape names itself — its tier plus the key its polygons
	// carry (see featureKey) — which is what lets a paint ask "is this the one that was
	// picked?" without knowing anything about the tree. Null with nothing picked, and
	// null for a key no node answers to.
	function selectedFeature(
		chosen: string | null,
		nodes: RegionNode[]
	): { tier: RegionType; key: string } | null {
		if (!chosen) return null;
		const node = findNode(nodes, chosen);
		if (!node) return null;
		return { tier: node.type, key: node.type === 'Municipality' ? node.key : node.name };
	}

	$: pickedFeature = selectedFeature(selected, regionNodes);

	// Whether the picked shape goes on wearing its wash at a zoom that is no longer drawing its
	// tier — which is a question with a side to it, because a wash is paint over everything
	// beneath it.
	//
	// Zoomed OUT past the picked shape (its tier finer than the one imaged), there is nothing
	// under it to bury: only the imaged tier fills, and every tier finer than that is drawn at
	// no strength at all. So a town picked at the town tier keeps its shape, its coat and its
	// breath through comarques, províncies and the whole country, which is the one shape on the
	// map that was asked for by name staying findable at every zoom.
	//
	// Zoomed IN past it (a comarca picked while the map draws its towns), it is dropped, and
	// that is not a limitation: the shape covers the whole of the breakdown the zoom went in to
	// read, and a coat of paint over it — let alone one swelling to 80% every four seconds —
	// would be the picked region hiding its own parts. Where the reader is stands in the crumb
	// bar and in the column; it does not have to be painted over the towns as well.
	function keptWash(tier: RegionType, imaged: number): boolean {
		return tierRank[tier] > imaged;
	}

	// The picked shape, breathing. With no marks left on the map, a wash is all a region has
	// to say what it is — and every region on the imaged tier is wearing one, so the shape
	// that was actually asked for looked like its neighbours with a thinner coat of the same
	// paint. That coat swells and falls back instead, in the region's own colour throughout:
	// a colour on this map is a claim, so a shape that changed colour to say it was picked
	// would be saying the place had changed hands, while how much of that colour there is
	// means nothing on its own — which is what leaves it free to mean this (see
	// `--animate-region-pulse`).
	//
	// Only where there is a wash to pulse, which is the paint's own answer and not a second one:
	// the picked shape wears its coat on its own tier and goes on wearing it once the zoom has
	// left that tier behind, and loses it where the map has gone inside it (see keptWash). So a
	// picked town breathes at every zoom out to the whole country, and a comarca picked while
	// the map is drawing municipalities has nothing painted to breathe.
	function buildPulse(
		picked: { tier: RegionType; key: string } | null,
		colors: ByRegion<RegionColor>,
		imaged: number
	): { url: string; key: string; opacity: number } | null {
		if (!picked) return null;
		if (tierRank[picked.tier] !== imaged && !keptWash(picked.tier, imaged)) return null;
		const url = tierLayerUrls.get(tierRank[picked.tier]);
		// The same fallback the paint takes: where a territory holds a single province, the
		// province polygon IS the territory and answers to the territory's colour (see
		// featureValue). A shape with no colour has no wash at all, and so nothing to breathe.
		const color =
			colors[picked.tier].get(picked.key) ??
			(picked.tier === 'Province' ? colors.Territory.get(picked.key) : undefined);
		if (!url || !color) return null;
		// Where the breath starts and returns to is the wash the paint gave it, named rather
		// than written out again: the two would otherwise have to be kept in step by hand, and
		// a pulse that came to rest at a strength the shape is not painted at would jump the
		// moment it stopped.
		return { url, key: picked.key, opacity: PICKED_WASH };
	}

	$: pulse = buildPulse(pickedFeature, regionColors, hiddenRank);

	// One tier's paint: a solid white line of this tier's weight, plus — on the tier
	// the map is imaging — a wash of the region's own colour across the shape.
	// Only that one tier washes: the layers stack coarsest-on-top, so a territory
	// filling too would bury every division under it, and the imaged tier is exactly
	// the one whose pins are on screen, so the polygons say in colour what the pins
	// over them already say.
	//
	// The wash sits at half strength, and the opened region's own shape is taken down
	// to 20%: a colour is a region's team, and every region on screen flying its colour
	// at the same strength left the one being looked at indistinguishable from its
	// neighbours. It is the thinnest wash on the map rather than the heaviest, so the
	// satellite reads through the one shape being looked at and what is under it can be
	// seen. Picking a comarca therefore changes nothing while the map is drawing
	// municipalities: the shape has no coat on at that zoom, and is not given one (see
	// keptWash).
	//
	// The picked shape is also the one shape that washes off its own tier: it keeps its coat
	// through every zoom OUT from the tier it belongs to, so the place the reader asked for is
	// still a shape on the terrain when the map has folded up to the whole country. Nothing is
	// buried by that — the tiers finer than the imaged one are drawn at no strength at all —
	// and the map draws it over the imaged tier's own wash rather than under it (see the pulse
	// in WorldMap), a fifth of an alpha beneath a half being a shape saying nothing.
	//
	// A fight used to make one town the exception to both halves of that — the only shape left
	// on the map, washing whatever tier was imaged and washing at 80% because it stood on black.
	// The fight is a page of its own now and this page is not behind it, so there is no spotlit
	// town here to make an exception of (see the fight section further down).
	function tierStyle(
		tier: RegionType,
		colors: ByRegion<RegionColor>,
		imaged: number,
		picked: { tier: RegionType; key: string } | null
	) {
		return (feature?: GeoJSON.Feature) => {
			const color = featureValue(tier, feature, colors);
			const key = featureKey(tier, feature);
			const isPicked = picked?.tier === tier && picked.key === key;
			const washes =
				color != null && (tierRank[tier] === imaged || (isPicked && keptWash(tier, imaged)));
			return {
				color: lineColor,
				weight: tierWeight[tier],
				// The town shapes always fill, because they are what takes the map's clicks (see
				// the overlays below) and a path is only hit where it is painted: `fill: false`
				// renders `fill="none"`, and no pointer ever reaches the inside of that. So a town
				// that is not washing fills at nothing instead, which draws exactly what no fill
				// drew and is still there to be clicked. Every coarser tier keeps the old answer —
				// it has no click to catch, and a fill it does not need would bury the tiers under it.
				fill: washes || tier === 'Municipality',
				fillColor: washes ? REGION_COLOR_CSS[color!] : lineColor,
				fillOpacity: washes ? (isPicked ? PICKED_WASH : 0.5) : 0
			};
		};
	}

	// Països Catalans polygons, built by @3xl/data's generate:geo from the
	// Eurostat LAU set (WGS84) and served from that package's public/ at /data.
	// Drawn bottom-up: municipalities, comarques, províncies, territoris — so the
	// coarser a division, the higher its line sits over the finer ones inside it,
	// and the thicker that line is drawn.
	//
	// Every tier draws its borders in white, and the tier the map is imaging also
	// washes each of its shapes in the colour that region's pin flies. So a region is
	// coloured on the map exactly as it is on its pin, and never twice.
	// Every other tier is line-only, so the satellite basemap keeps reading through
	// them, and `hiddenLineUrls` still drops the lines of the tiers finer than the
	// imaged one.
	//
	// The land itself is clickable, and a click on it does what the pin standing over that
	// spot does (see openFeature): pointing at a region and pressing its plate are the same
	// gesture, and the plate is a couple of hundred pixels of the several thousand the region
	// covers. The TOWN layer is the one that catches it, and it is the only interactive layer
	// on the map, for two reasons: the towns tessellate the whole of the Països Catalans, so
	// every point on land is inside exactly one of their shapes; and the layers stack
	// coarsest-on-top, so a territory that captured pointer events would swallow every click
	// meant for anything inside it. What the click is resolved to is not the town, though — it
	// is whichever pin is drawn over it, so a press on the same field opens Catalunya at the top
	// view and the village at the bottom one.
	//
	// Rebuilt (a fresh array) whenever a region changes colour, the map images another
	// tier, or another region is opened — that is what repaints the layers, which are
	// fetched only once.
	$: overlays = [
		{
			url: municipalityLayer,
			style: tierStyle('Municipality', regionColors, hiddenRank, pickedFeature),
			onClick: openFeature
		},
		{
			url: '/data/geo/comarques.json',
			style: tierStyle('Comarca', regionColors, hiddenRank, pickedFeature),
			interactive: false
		},
		{
			url: '/data/geo/provincies.json',
			style: tierStyle('Province', regionColors, hiddenRank, pickedFeature),
			interactive: false
		},
		{
			url: territoryLines,
			style: tierStyle('Territory', regionColors, hiddenRank, pickedFeature),
			interactive: false
		}
	] satisfies MapOverlay[];

	// --- The shows drawn as territory --------------------------------------------
	// The map says which show a region flies twice over — in the lettering on its pin and
	// in the list beside the terrain — and both say it one region at a time. What neither
	// says is the shape of a show: which stretch of the country is flying it, and whether
	// that stretch is one piece or a scattering. So the level on screen is grouped: every
	// run of touching shapes flying the same show is drawn round in one pink line, and the
	// white borders of the level itself go on being drawn inside it.
	//
	// It is worked out on whatever tier the map is imaging, off that tier's own shapes and
	// that tier's own show — the towns of a comarca at the bottom, the comarques of a
	// province a step up, the six territories at the top. So it is the same statement at
	// every zoom about a different division, and reading it is walking the map: a show
	// holding one comarca whole is one shape there and part of a larger one a tier up.
	// Nothing here decides what a region flies — that is the plurality the tree already
	// worked out (see buildRegionTree) — and nothing here knows any geometry either (see
	// `groupOutlines`).

	// The pink: the theme's own secondary, asked for by the variable Tailwind emits for it
	// so the map tracks the palette rather than pinning a copy of it, with the literal
	// behind it for the same reason every colour painted outside the class system carries
	// one (see REGION_COLOR_CSS) — an unresolvable var() computes to `none` and would
	// silently erase the line.
	const GROUP_LINE_COLOR = 'var(--color-secondary, oklch(61.9% 0.249 350.5))';

	// Each tier's polygons, by the url they are served at — the same files WorldMap draws
	// from, fetched a second time here because the grouping is worked out from the shapes
	// and the map is handed the answer rather than the question. The browser has them in
	// cache by then (the map asked first, at mount), so the cost is the parse.
	//
	// Loaded on demand: a reader who never leaves the top view never fetches the towns.
	// Reassigned rather than mutated, since a Map written into in place moves nothing here.
	let tierGeometry = new Map<string, GeoJSON.FeatureCollection>();

	// The municipality layer is already on this page for the region tree and the seeds, so
	// it is put in the cache rather than asked for again.
	$: if (municipalities && !tierGeometry.has(municipalityLayer)) {
		tierGeometry = new Map(tierGeometry).set(municipalityLayer, municipalities);
	}

	// Fetch the imaged tier's shapes the first time the zoom reaches that tier. A failure
	// leaves the tier ungrouped — the map keeps its borders and its wash, and simply says
	// nothing about which shows the level divides between.
	async function loadTierGeometry(rank: number): Promise<void> {
		const url = tierLayerUrls.get(rank);
		if (!url || tierGeometry.has(url)) return;
		try {
			const collection = (await fetch(url).then((response) =>
				response.json()
			)) as GeoJSON.FeatureCollection;
			tierGeometry = new Map(tierGeometry).set(url, collection);
		} catch {
			// Nothing to put back: the tier is simply left ungrouped.
		}
	}

	$: void loadTierGeometry(hiddenRank);

	// The grouping line for the tier on screen: the outline of every run of neighbouring
	// shapes that fly the same show.
	function showGroups(
		rank: number,
		geometry: ReadonlyMap<string, GeoJSON.FeatureCollection>,
		shows: ByRegion<number>
	): Grouping {
		const url = tierLayerUrls.get(rank);
		const collection = url ? geometry.get(url) : undefined;
		if (!collection) return NO_GROUPING;
		const tier = tierByRank[rank];
		return groupShapes(collection, (feature) => {
			const show = featureValue(tier, feature, shows);
			return show == null ? null : String(show);
		});
	}

	// A tier with nothing to say about its shows: no line and no discs. Named because it is
	// three of the answers above and a fresh empty pair each time would redraw both layers
	// for nothing every time anything on this page moved.
	const NO_GROUPING: Grouping = { chains: [], runs: [] };

	$: grouping = showGroups(hiddenRank, tierGeometry, regionShows);

	// Drawn a little heavier than the borders it runs along, at that tier's own weight —
	// where a group ends is a border of the level too, and the pink has to read as the
	// coarser of the two statements being made along the same line.
	$: showOutline = {
		chains: grouping.chains,
		style: {
			color: GROUP_LINE_COLOR,
			weight: tierWeight[tierByRank[hiddenRank]] + 1.5,
			opacity: 0.95,
			lineJoin: 'round' as const,
			lineCap: 'round' as const
		}
	} satisfies MapOutline;

	// One disc per group, carrying that show's own mark — so a stretch of country ringed in
	// pink says WHICH show it is flying, where the line alone only says that the shapes
	// inside it agree. It stands on the group and not on any one of its shapes: the point is
	// taken from the union the way a region's pin is taken from its own (see interiorPoint),
	// so a show holding a crescent of towns is marked inside that crescent rather than in the
	// bay it curves around.
	//
	// A group whose show has no glyph picked gets no disc, which is the same answer every
	// surface in this game gives (see `forShow`): there is deliberately no placeholder mark,
	// because a stand-in glyph reads as a fact about the show while its absence reads as
	// nothing at all. The line round that group is drawn either way — what it says is true
	// without a name on it.
	//
	// How much land the group covers rides along as its weight, which is what the map thins
	// the crop by where two discs would stand on one another: the mark that survives a crowd
	// is the one about the bigger piece of country.
	function buildGroupMarks(
		rank: number,
		geometry: ReadonlyMap<string, GeoJSON.FeatureCollection>,
		runs: readonly ShapeRun[],
		glyphs: ReadonlyMap<number, string>
	): MapGroupMark[] {
		const url = tierLayerUrls.get(rank);
		const collection = url ? geometry.get(url) : undefined;
		if (!collection || !runs.length) return [];

		// One pass over the tier for both readings, exactly as the region geometry takes them
		// (see buildRegionGeometry): a group's centroid is the area-weighted mean of its
		// shapes', and its shapes are what that centroid is then checked against.
		const boxes = boundsByFeatureId(collection);
		const centroids = centroidsByFeatureId(collection);

		const marks: MapGroupMark[] = [];
		runs.forEach((run, index) => {
			const iconSvg = forShow(glyphs, Number(run.group));
			if (!iconSvg) return;

			const shapes: RegionShape[] = [];
			const parts: Centroid[] = [];
			for (const member of run.members) {
				const feature = collection.features[member];
				const id = String(feature.properties?.id ?? '');
				const box = boxes.get(id);
				const centroid = centroids.get(id);
				if (box && feature.geometry) shapes.push({ geometry: feature.geometry, box });
				if (centroid) parts.push(centroid);
			}

			const centroid = combineCentroids(parts);
			const point = interiorPoint(shapes, centroid);
			// A group with no land to stand on — a tier whose shapes never loaded — is left
			// unmarked rather than marked at a guess.
			if (!point) return;
			// The run's place in the list and not its show alone: one show is several groups,
			// and two of them sharing an id would be one mark in the map's book.
			marks.push({ id: `${run.group}:${index}`, position: point, iconSvg, weight: centroid?.area ?? 0 });
		});
		return marks;
	}

	$: groupMarks = buildGroupMarks(hiddenRank, tierGeometry, grouping.runs, $showGlyphs);

	// --- Which show a town flies -------------------------------------------------
	// A town starts on the show its own geometry seeds it with, but once a player takes it
	// the town flies the ruling team's show instead: the pins, the sidebar, the
	// festa booster boxes and every coarser region's plurality tally all read from
	// the single map below, so a conquest re-labels the town everywhere the map names
	// a show at once — and re-stocks its boxes with it, the pack being a booster of
	// whatever show the town flies today.

	// Every authored show by id (name + poster), read from /data/shows.json — the one
	// source a show's lettering comes from, seeded or ruling, so an overridden town's
	// pin draws exactly like an untaken one. Empty until the fetch lands.
	let savedShowById = new Map<number, RegionShow>();

	// The same collection kept whole, by show id: what a booster box is printed from
	// (its cover picked out of the enabled posters per town and year, its wordmark out
	// of the enabled logos), which one poster url cannot answer. Read only by the
	// festa boxes; empty until the fetch lands, which leaves them plain-fronted.
	let showEntryById = new Map<number, ShowEntry>();

	// character id → the shows it belongs to, reversed from the show → characters
	// assignment the claim flow already loads.
	$: showsByCharacter = showIdsByCharacter(showCharacterIds);

	// Municipality id → the show its ruling team belongs to, for every town a player
	// holds — the team's LEAD's show, as the roster defines a team's show, so the town
	// flies whatever its first card flies. A team whose lead is in no show, or whose
	// show isn't in the saved collection, yields no entry — that town simply keeps its
	// seeded show rather than losing its pin. A ruling show with no poster does replace
	// the seeded one, and its town then goes unpinned exactly as a town seeded with a
	// poster-less show already does. Named deps so it re-derives as holders and the
	// saved shows land.
	function buildRulingShows(
		occupied: ReadonlyMap<string, MunicipalityHolder>,
		byCharacter: ReadonlyMap<string, number[]>,
		saved: ReadonlyMap<number, RegionShow>
	): Map<string, RegionShow> {
		const ruling = new Map<string, RegionShow>();
		for (const [locationId, showId] of holderShowIds(occupied.values(), byCharacter)) {
			const show = saved.get(showId);
			if (show) ruling.set(locationId, show);
		}
		return ruling;
	}

	$: rulingShowById = buildRulingShows(holders, showsByCharacter, savedShowById);

	// Municipality id → the GPS seed its show and its team are both drawn from.
	// Hashing it walks every vertex of the polygon, so it is done once off the
	// geometry and kept: everything below re-derives as shows are assigned and towns
	// change hands without touching the shapes again. It is also the list of every
	// town on the map, which is what the shows and the colours are painted over.
	function buildMunicipalitySeeds(
		collection: GeoJSON.FeatureCollection | null
	): Map<string, number> {
		const seeds = new Map<string, number>();
		if (!collection) return seeds;
		for (const feature of collection.features) {
			const id = String(feature.properties?.id ?? '');
			if (id) seeds.set(id, coordinateSeed(feature.geometry));
		}
		return seeds;
	}

	$: municipalitySeeds = buildMunicipalitySeeds(municipalities);

	// The shows a town can be seeded with: every one that has a cast, in id order —
	// the same set the album lists and the only set a booster can be rolled from, so
	// a show the admin assigns its first character to is on the map from the next
	// visit, and one whose last character goes is off it. Nothing here is authored:
	// which shows the map flies is a consequence of which shows have fighters.
	$: seedableShowIds = seededShowPool(showCharacterIds);

	// Municipality id → the show its own seed picks out of that pool, for every town
	// on the map: what a town flies until somebody takes it. A town whose seeded show
	// is not in the saved collection is left out rather than lettered wrong — as is
	// every town, before the pool lands.
	//
	// Handed to the panel that deals the boosters as well as used here: which show a
	// town's packs are printed from is this same question, and for a town nobody
	// holds it is the one thing `claim_booster` takes on trust from the browser (see
	// its "Which show this town's boxes deal"), so there is one place it is decided.
	function buildSeededShows(
		seeds: ReadonlyMap<string, number>,
		pool: readonly number[],
		saved: ReadonlyMap<number, RegionShow>
	): Map<string, RegionShow> {
		const shows = new Map<string, RegionShow>();
		for (const [id, seed] of seeds) {
			const showId = seededShowId(seed, pool);
			const show = showId == null ? undefined : saved.get(showId);
			if (show) shows.set(id, show);
		}
		return shows;
	}

	$: seededShowById = buildSeededShows(municipalitySeeds, seedableShowIds, savedShowById);

	// Municipality id → the show it flies today: the seeded one, overridden by the
	// ruling team's wherever a player holds the town. This feeds the region tree, so
	// the override rides all the way up — a comarca or province tallies its plurality
	// over the shows its towns actually fly today.
	function buildTownShows(
		seeded: ReadonlyMap<string, RegionShow>,
		ruling: ReadonlyMap<string, RegionShow>
	): Map<string, RegionShow> {
		const shows = new Map<string, RegionShow>(seeded);
		for (const [id, show] of ruling) shows.set(id, show);
		return shows;
	}

	$: showsById = buildTownShows(seededShowById, rulingShowById);

	// --- Which colour a town flies -----------------------------------------------
	// Not the same compounding as the show above: a colour on this map is a claim,
	// so only a town somebody actually holds carries one — its holder's team's LEAD's
	// colour, exactly as a held town's show is its ruling lead's show. A town still
	// on the team its own seed rolled is nobody's, and flies the map's own grey (see
	// `types/region-color.type`) whatever colour that seeded lead happens to have
	// bent. So the map before the first conquest is grey entire, and any colour on it
	// is somebody's doing.
	//
	// Fed into the region tree beside the shows, so a comarca, a province and a
	// territory each take the plurality colour of the towns beneath them just as they
	// take their plurality show — which now reads as how much of a region has been
	// taken, and by whom — and a conquest re-colours every tier above it.

	// Municipality id → the colour it flies. Grey for every town on the map, and the
	// lead colour of whoever holds it wherever one does — which is why this asks the
	// seeds for its towns rather than the shows they fly: grey is a fact about
	// occupancy and not about a roster, so a town whose show has not landed yet is
	// still an unheld town and still says so.
	//
	// A holder with an empty team keeps its grey rather than falling to no colour at
	// all: the row would be one the RPC could not have written, and a town on the map
	// with nothing painted on it would read as a hole in the map instead.
	function buildTownColors(
		seeds: ReadonlyMap<string, number>,
		occupied: ReadonlyMap<string, MunicipalityHolder>
	): Map<string, RegionColor> {
		const colors = new Map<string, RegionColor>();
		for (const id of seeds.keys()) colors.set(id, ArtificialColor.Gray);
		for (const holder of occupied.values()) {
			const lead = holder.team[0];
			if (lead) colors.set(holder.locationId, lead.color);
		}
		return colors;
	}

	$: colorsById = buildTownColors(municipalitySeeds, holders);

	// The red → yellow → green → blue region hierarchy (territory → province →
	// comarca → municipality) mirrored from the map's divisions, for the tree.
	$: regionTree = buildRegionTree(municipalities, showsById, colorsById);

	// The nested region nodes. Nothing lists them tier by tier any more — the way down
	// is the pins and the way back up is the breadcrumbs, which carry the full drill
	// path — but every region on the map is read off this: its colour, its show, and
	// what the crumbs and the search are built from.
	$: regionNodes = buildRegionNodes(regionTree);

	// The chain of nodes from the top territory down to the open (URL-selected)
	// region, kept so the clicked region and its ancestors stay highlighted.
	$: openPath = selected ? nodePath(regionNodes, selected) : [];

	// The level of pins WorldMap is currently drawing (clamped to what exists),
	// driven purely by zoom — the tier of groupings on screen right now.
	$: effectiveDepth = Math.min(Math.max(activeLevel, 0), Math.max(markerLevels.length - 1, 0));

	// The path from the top region down to the pin nearest the map centre at that
	// level — the region the view is focused on. Zoom centres on the pointer, so
	// this is the grouping under the cursor. The pin sits at the frontier tier; its
	// parent is the "open" region whose children that tier is.
	$: focusPath = focusedPath(effectiveDepth, markerLevels, currentCenter, regionNodes);

	// The effective open region the breadcrumbs and polygons reflect: the focused pin's
	// parent (null at the top view). So zooming into an area unfolds the breadcrumbs and
	// the border detail into it and zooming out walks them back up — following the
	// pointer, without touching the URL selection.
	$: effectiveSelected = focusPath.length >= 2 ? focusPath[focusPath.length - 2].key : null;

	// The region the map is open on: an explicit click (the URL `region` param) wins, so a
	// pick drills straight into what was clicked; with nothing clicked it follows the
	// zoom-driven focus instead. Asking for the top view is a click too, and it names no
	// region, which is the whole of the Països Catalans.
	$: openRegion = topPicked ? null : (selected ?? effectiveSelected);

	// The drill path down to (and including) the open region was worked out here — the URL
	// path when a region is clicked, else the zoom focus path minus its frontier pin — for the
	// bar of crumbs that stood over the map. There is no such bar: the one path this page
	// letters is the cut ABOVE the open region, folded to its dots on the row across the foot of
	// the terrain (see `abovePath`), and that one is walked off the node rather than off the view.

	// The map column had two tabs and has none: the terrain, and the shows that level divides
	// between. It was three before that, the middle of them being the list of the places the open
	// region divides into — that list is not a way of reading the terrain but what is AT the open
	// place, so it went to the block under the map, where it is one of the two things that block
	// holds. The shares have followed it out of the tab row, in the other direction: they are
	// the strip across the top of the terrain now, on the row the radar already stood at the far
	// end of (see below). A tally of eight marks is a row and never wanted a panel, and the map
	// was the tab that was up whenever anybody wanted the tally to be about somewhere — so the two
	// are read at once and this game is a map with no way to be looking at anything else.

	// The show the level is being read through: picked on the shares row at the head of the list
	// of places in the block under the map and applied to the rows below it, which is why it is
	// held on the page rather than in either box — the tally is taken over the whole level here,
	// and the list is handed what to hide. Null is the whole level.
	let activeShow: number | null = null;

	// Pressing the picked show again clears it, pressing another turns the list over to that one.
	// So there is one gesture and it is its own undo, and the reader can never be left with a
	// filter they have to find the way out of.
	function toggleShow(id: number) {
		activeShow = activeShow === id ? null : id;
	}

	// A filter belongs to the list it was picked over. Walk into another region and the list is
	// another list — of another level, in another place — so the show goes with the old one
	// rather than silently hiding most of what has just been opened. It lived with the shares row
	// while that row was a component of its own; the row is markup on this page now, so the rule
	// is here, named on the open region so it re-runs when the map moves. The row and the list
	// are one box under the map again, which changes nothing about the rule: what it is about is
	// the level, and the level is the page's.
	let filteredFor: string | null = null;
	$: if ((openRegion ?? null) !== filteredFor) {
		filteredFor = openRegion ?? null;
		activeShow = null;
	}

	// Free-text search across every location in the whole tree (all tiers), matched
	// against each region's displayed name (case- and accent-insensitive). While the
	// box holds text its matches stand in the list of places under the map, in place of the level
	// and drawn as the level is (see RegionLocationList); an empty box has nothing to say.
	let searchQuery = '';
	// Whether the field is out. Held here rather than inside the column because what is typed in
	// it is matched here, and the two are the one control.
	let searchOpen = false;
	$: normalizedQuery = foldText(searchQuery.trim());
	$: allRegions = flattenRegionNodes(regionNodes);
	$: searchResults = normalizedQuery
		? allRegions
				.filter((entry) => foldText(restoreCatalanArticle(entry.name)).includes(normalizedQuery))
				.slice(0, 100)
		: [];

	// Asking for the field: it comes out on the row under the glass that was pressed, at the head
	// of the very list the matches will stand in — so the answer is already on screen when the
	// first letter lands, and the glass is only ever reachable where that list is (its cell is in
	// the shares row, and that row heads the list). Walking onto a town without folding the field
	// away keeps it: the field being out IS what puts the list back over a town (see
	// `placesOffered`), so the question survives the map moving under it and goes the moment the
	// field does.
	function openSearch() {
		searchOpen = true;
	}

	// Ending the search: the query goes, and with it the matches it was filling the column with,
	// and the field folds back to the glyph it came out of. The head of that column is
	// untouched, since the search was never about the open region.
	function closeSearch() {
		searchQuery = '';
		searchOpen = false;
	}

	// Picking a place out of the column: the drill, exactly as a pin or a crumb does it — and
	// then the end of the search, since the question has been answered by landing somewhere and
	// a column still listing matches would be listing them about a place that is no longer the
	// one being asked about. Nothing to end when nothing was being searched for, which is what a
	// press on the level itself is.
	function openFromColumn(key: string) {
		closeSearch();
		open(key);
	}

	// What a press on a mark does: it opens the place, and that is now the whole of it. It used to
	// turn the block under the map to the tab that kind of place is read on, back when there was a
	// row of tabs and a reader could be left standing on one that was about something else. There
	// is no row: what the block holds is decided by the kind of place open (see `placesOffered`),
	// so opening the place IS turning the block, and a press that changes no selection changes
	// nothing because there is nothing left out of place to put back.
	//
	// The land takes this press too, since a click on a polygon is answered by whatever the pin
	// over it does (see pinByFeatureId) — which is the point: the terrain and the mark standing on
	// it open the same place the same way.
	function openFromPin(node: RegionNode) {
		open(node.key);
	}

	// The crumbs: a root crumb back to the top view, then one per ancestor down to the region
	// the bar is about. The last crumb is that region and renders as plain text; the rest link
	// back up to their tier.
	//
	// Every crumb carries what the town panel is given for the town it is open on, because
	// the bar letters a step the same way that panel letters its town: the show the place
	// flies, and the tile colour it is drawn in. Both are read off the node, so both are
	// whatever the map itself says — the ruling team's show on a held town, the seeded
	// plurality otherwise (see the ruling-show map), and above the municipality the
	// plurality of the towns underneath. A place cannot fly one show on the map and another
	// in the bar naming it.
	//
	// The root crumb is the whole of the Països Catalans, which is the one step of the path
	// with no region of its own: nothing in the tree stands for the lot of them, so its show
	// and colour are tallied here (see everyTownPlurality) rather than read off a node. It is
	// the same tally every tier under it gets, one tier further up, so the top view names
	// what most of the map is flying — and the step a player walks back to is lettered like
	// every other step rather than dropping to a bare word at the head of the row.
	//
	// It carries a key like every other step too (see TOP_VIEW_KEY), so clicking it opens the
	// top view instead of merely forgetting whatever was open.
	// Below the root the bar is a ladder of the four tiers and not just the steps walked into:
	// every tier has a position in the row whether or not the view has reached it, and whether
	// or not the place being looked at has that tier at all — the drill path skips a tier where
	// there is none (Andorra and l'Alguer have no comarca; a territory with one province lists
	// its comarques directly), and it stops wherever the map has got to. A position with no
	// step in it is drawn as an outlined square and pressed to take the map to the zoom that
	// tier is read at (see zoomToTier). So the row keeps its length and its rhythm as the map
	// drills — a place's name is always in the same position, whichever place it is — and every
	// tier is a press away rather than only the ones already opened.
	//
	// The word beside each tier is what the square is labelled by, and what comes back when one
	// is pressed: the bar names the tiers of this map in the map's own language, and one word
	// serves as both the label and the key it is worked back out of.
	const TIER_LADDER: [RegionType, string][] = [
		['Territory', 'territori'],
		['Province', 'província'],
		['Comarca', 'comarca'],
		['Municipality', 'municipi']
	];
	const tierByWord = new Map<string, RegionType>(
		TIER_LADDER.map(([tier, word]) => [word, tier])
	);

	$: mapPlurality = everyTownPlurality(regionNodes);

	/**
	 * A path of nodes as the bar reads it: the root step, then the ladder of the four tiers
	 * with each position filled by whatever step of the path stands at it.
	 *
	 * Written as a function because there were two paths lettered this way — the one the map was
	 * looking down, on the bar over the terrain, and the cut above it that heads the column
	 * beside it (see `aboveCrumbs`) — and two bars built from two copies of this would be two
	 * bars that could come to letter the same place differently. Only the second is left, and it
	 * is still written as a function: what the ladder is is a way of lettering a path, and that
	 * is worth saying once whether one path or two go through it. The plurality is passed in
	 * rather than read off the closure so that a statement calling this names it and re-runs
	 * when it changes.
	 *
	 * No step of it is marked `current` (see MapBreadcrumbs), because none of them is: the one
	 * path left is the cut ABOVE the open region, so its every step — the root view included, and
	 * the parent it ends on most of all — is a place the map can be taken to. Each is pressed for
	 * what any pin, row or crumb on this map is pressed for: `open` its key, which frames that
	 * place and redraws the polygons at its own tier, whichever tier that is.
	 */
	function crumbLadder(path: RegionNode[], plurality: ReturnType<typeof everyTownPlurality>) {
		return [
			{
				label: TOP_VIEW_LABEL,
				key: TOP_VIEW_KEY as string | null,
				showName: plurality.show?.name ?? null,
				showId: plurality.show?.id ?? null,
				tileClasses: plurality.color ? pinColorClasses[plurality.color] : null
			},
			...TIER_LADDER.map(([tier, word]) => {
				const node = path.find((step) => step.type === tier);
				if (!node) {
					return { label: '', key: null as string | null, empty: true, tier: word };
				}
				return {
					label: restoreCatalanArticle(node.name),
					key: node.key as string | null,
					showName: node.show?.name ?? null,
					showId: node.show?.id ?? null,
					tileClasses: node.color ? pinColorClasses[node.color] : null
				};
			})
		];
	}


	// The open location's own node and its plurality ("most seen") show. Surfaced on the
	// corner's Location plate when the open region is a leaf municipality (the table there
	// lists child rows, so a leaf has nothing to list and shows the town's own show
	// instead), and used to pick the roster the town's OG team rolls from.
	$: openNode = openRegion ? findNode(regionNodes, openRegion) : null;
	$: openShow = openNode?.show ?? null;

	// The songs, asked for by the page rather than by whatever happens to be drawing the radio.
	// Every surface that draws it also asks (see MusicToggle, MusicPlayer) and they all share the
	// one fetch, but none of them is always up: the radio is a row along the map's bottom edge now
	// (see MusicBanner and the strip it stands in), and that slot draws nothing until there is a song to
	// letter. The page is what is always here, and it needs the collection loaded for its own sake
	// anyway — `follow` below can only
	// turn a dial that has stations on it, and a radio left playing on the last visit only comes
	// back on once there is something to play.
	onMount(() => void musicService.load().catch(() => undefined));

	// The radio follows the map. Which show the place on screen flies is a statement this
	// page already makes everywhere — on the pin, in the crumb, in the column beside the map —
	// and a station is a show, so the one thing left to do with it is play it: while the
	// radio is on, the dial goes to whatever the map is open on, and the reader who drills
	// from a territory into a comarca into a town hears each of them in turn. Crossfaded,
	// and only while it is on, and never written down as their choice of station — see
	// musicService.follow, which is where all three of those are decided.
	//
	// The whole map is a place like any other here, so the top view tunes to the plurality
	// of every town on it — the same show its own crumb is lettered with (see crumbLadder).
	// A show is passed and not a node because that is the whole of what a station is: two
	// different places flying the same show are not a reason to touch the dial.
	$: musicService.follow(openShow?.id ?? mapPlurality.show?.id ?? null);

	// What the game can be asked, which is what the dots at the far end of the band drop (see
	// BandMenu). The list is here rather than in the menu because which sheets the game offers is
	// the page's business and the shape they are offered in is the menu's — the same split every
	// other list on this page is written under.
	//
	// The glyph is the very one each of them wore while it stood open on the row, so nothing a
	// reader had learned to look for changed; what is added is the name beside it, which is the
	// thing a square with a mark on it could never say. Both names are the sheet's own title
	// rather than the label the square was reached by ("Obre els crèdits"): a line in a menu is
	// the thing itself, and the press is said by its being a menu.
	$: bandMenuItems = [
		{ icon: '/assets/icons/sbed/help.svg', label: $_('faq.title'), onSelect: openFaq },
		{
			icon: '/assets/icons/delapouite/palette.svg',
			label: $_('credits.title'),
			onSelect: openCredits
		}
	];

	/** One region as the bar letters it — the spelling the page's band and the list share. */
	function crumbRow(node: RegionNode) {
		return {
			key: node.key,
			label: restoreCatalanArticle(node.name),
			showName: node.show?.name ?? null,
			showId: node.show?.id ?? null,
			tileClasses: node.color ? pinColorClasses[node.color] : null
		};
	}

	// The place the whole page is about: the region the map is open on, at any tier. It stands
	// on the band across the top of the page, above the three columns and before all else, so
	// where you are is the first thing read rather than something to be found among the places
	// inside it — and a town, which is one of its own sisters, is both stood up there and left
	// where it falls in the list, marked there (see subdivisionNodes).
	//
	// With the box that place has waiting where the window has one for it, off the same
	// `festaBoxById` a row of the list and a pin on the terrain are handed: the band is a row
	// like the rest of them, and a box is part of what a row says. Only a
	// municipality is ever found in there — a festa's id is a municipality feature id — so the
	// tiers above take nothing, and neither does the top view, whose key is no node's.
	//
	// The top view is a place like any other here: it is where the map is when nothing is
	// open, it is a selection with a key of its own (see TOP_VIEW_KEY), and the bar already
	// letters it with the plurality of every town on the map. So the band is never empty,
	// whatever the map is looking at.
	$: subdivisionCurrent = openNode
		? { ...crumbRow(openNode), box: festaBoxById.get(openNode.key) ?? null }
		: {
				key: TOP_VIEW_KEY,
				label: TOP_VIEW_LABEL,
				showName: mapPlurality.show?.name ?? null,
				showId: mapPlurality.show?.id ?? null,
				tileClasses: mapPlurality.color ? pinColorClasses[mapPlurality.color] : null
			};

	// What the column lists under it: the level one tier down — the territories at the top
	// view, and a town's own sisters once the bar has got all the way down (see
	// regionLevelNodes). It follows `openRegion` and not the URL selection alone, so the column
	// walks with the zoom exactly as the crumbs above the map do.
	//
	// The head itself is kept in rather than dropped, which only ever means a town: no coarser
	// region is among its own subdivisions, so nothing above the municipality is affected. The
	// level was handed over with the open town taken out of it, on the ground that the head had
	// already named it — but a town is read here against its sisters, and a list of every town
	// in the comarca but the one you are standing in is a list with a hole where the reader is.
	// It is listed where it falls and marked where it falls (see RegionLocationList).
	//
	// Taken out here rather than in the component because this is the list the shares below
	// are counted over: what the row says is a share of is exactly what is listed under it,
	// and two places deciding what "listed" means is how those two come to disagree — which is
	// why the open town, now that it is listed, is counted in them too.
	$: subdivisionNodes = regionLevelNodes(regionNodes, openRegion);

	// The path standing beside the badge on the row across the foot of the terrain: the way down
	// to the place the open region sits *inside*, which is the cut above it and never the open
	// region itself. The badge it stands next to has already named where the map is — a path
	// repeating it is the row saying Catalunya twice — so what the path is for is the one thing
	// the badge cannot say, which is where that place is. Its last step is therefore the parent: the
	// comarca over a town, the province over a comarca, and the Països Catalans over a territory,
	// there being nothing above a territory but the whole of them.
	//
	// Empty at the top view, which is the one place with nothing above it at all: the badge is
	// the Països Catalans and there is no superior cut to name. The path is left off rather than
	// drawn saying the same thing twice, and the row closes up around the badge and the tabs.
	$: abovePath = openNode ? nodePath(regionNodes, openNode.key).slice(0, -1) : null;

	// And that path lettered the way every path on this map is lettered (see crumbLadder), so a
	// place is the same tile, name and show wherever it is named. A path of no regions is the
	// root crumb by itself, which is exactly what a territory's superior cut is.
	$: aboveCrumbs = abovePath ? crumbLadder(abovePath, mapPlurality) : null;

	// Lettered exactly as a crumb is, off the same node fields and into the same shape,
	// because it is drawn by the same component: a place on this map is its tile, its name
	// and the show it flies, whether it is being named as a step of the path or as one of
	// the places the open region is made of.
	//
	// Plus, where the window has one for it, the box that place has waiting — the same
	// `MapBoosterBox` the map is standing on that town at this moment and the same one its
	// pin is handed (see festaBoxById), so the column and the terrain print one box per town
	// rather than two drawn from the same festa. Only a municipality can be found in there:
	// a festa's id is a municipality feature id, and only a municipality's key is its bare
	// id, so a row naming a comarca or a province looks nothing up. A town of the window
	// whose polygon the map has no centre for has no box anywhere, here included.
	$: subdivisions = subdivisionNodes.map((node) => ({
		...crumbRow(node),
		box: festaBoxById.get(node.key) ?? null
	}));

	// And the matches lettered exactly the same way, because they are drawn by exactly the same
	// row: a place turned up by a search is the same place it would have been if the drill had
	// reached it, and a search that answered in a different hand would be a second way of
	// saying a town. The tier rides along, since that is what the list groups them under
	// (see RegionLocationList's searchGroups) — and it comes off the flattened entry rather than
	// being looked back up, as the colour does.
	$: searchRows = searchResults.map((entry) => ({
		key: entry.key,
		type: entry.type,
		label: restoreCatalanArticle(entry.name),
		showName: entry.show?.name ?? null,
		showId: entry.show?.id ?? null,
		tileClasses: entry.color ? pinColorClasses[entry.color] : null,
		box: festaBoxById.get(entry.key) ?? null
	}));

	// How those places divide between the shows they fly: the same tally the leaderboard is,
	// run over the listed level instead of over every town on the map (see
	// buildShowStandings) — biggest share first, and over the places that fly anything at all,
	// so a region with no show is not counted against the shows that have one.
	//
	// And then every show the map can fly at all, at 0%, for the ones this level flies none of.
	// The tally is a row of marks read at a glance, and a row whose marks change place and
	// number at every step of the walk is one that has to be read again from scratch each time:
	// with the whole set always in it a show keeps its cell wherever the reader is standing, and
	// a level flying none of it says so — a 0% is a reading about this level, where an absent
	// mark is nothing at all. The 0% ones are drawn faint (see ShowShareGrid).
	//
	// The set is the seedable pool and not the saved collection: a show with no cast is on no
	// town anywhere (see seedableShowIds), so a cell for it would be a mark for something that
	// cannot appear however far the reader walks. Ordered as the tally orders anything — biggest
	// first — which puts the whole of the 0% tail at the end, by name among themselves.
	function buildSubdivisionShares(
		nodes: RegionNode[],
		pool: readonly number[],
		saved: ReadonlyMap<number, RegionShow>
	): { id: number; name: string; share: number }[] {
		const flown = buildShowStandings(
			new Map(nodes.filter((node) => node.show).map((node) => [node.key, node.show!]))
		).map((standing) => ({ id: standing.id, name: standing.name, share: standing.share }));

		const counted = new Set(flown.map((entry) => entry.id));
		const rest = pool
			.map((id) => saved.get(id))
			.filter((show): show is RegionShow => Boolean(show) && !counted.has(show!.id))
			.map((show) => ({ id: show.id, name: show.name, share: 0 }))
			.sort((a, b) => a.name.localeCompare(b.name));

		return [...flown, ...rest];
	}

	$: subdivisionShares = buildSubdivisionShares(subdivisionNodes, seedableShowIds, savedShowById);

	// The open town's pin, where that place is a town — and the only one anywhere on this page
	// that is drawn, the terrain carrying none at all now (see `hidden` in buildMarkers). It is
	// the mark itself and not a copy of it: it comes out of `buildMarkers`, the very function
	// the map's pins are built by, called on the one node with everything that function is given
	// for the whole tier. So the side standing on the town, its occupant, its standing and the
	// control under it are decided in exactly one place, and the block under the map cannot come
	// to say something the map's own model of that town does not.
	//
	// Towns only, because a pin's team, holder and standing are a town's alone (see
	// buildMarkers) and a coarser region's mark is its plate by itself, which is the crumb the
	// row on the map's bottom edge already letters. And a town with no show has no pin —
	// buildMarkers skips it — so the block says nothing extra about it either.
	$: townPin =
		openNode?.type === 'Municipality'
			? (buildMarkers(
					[openNode],
					regionGeometry,
					null,
					statuedTown,
					pinTeam,
					townChallenge,
					regionSieges,
					holders,
					$showGlyphs,
					festaBoxById
				)[0] ?? null)
			: null;

	// (What the town has waiting is on the pin itself now, like everything else it carries —
	// see `box` in buildMarkers.)

	// The box the open town has waiting, taken off that pin rather than looked up again: the
	// block under the map draws the very box the map is standing on the town, so the two cannot
	// come to print different copies of one offer (see festaBoxById, which is where both get it).
	$: townBox = townPin?.box ?? null;

	// Whether that box is there to be taken, which is what decides whether the town's column ends
	// with it. Two ways for it not to be: the booster window does not reach this town
	// at all (no box, which is most towns most days), or this reader has already opened the one
	// it deals — a town deals two a year and neither twice (see `claimed` in festaBoxes).
	// Being signed out is deliberately NOT one of them: the box is the offer and the door is
	// answered when it is pressed (see openPack), which is the rule the map's own box goes by, so
	// a visitor is shown what a town has rather than an absence they are not told the reason for.
	$: townBoxOffered = Boolean(townBox && !townBox.claimed);

	// Whether there is a town to draw at all. Only the bottom tier has a pin of its own: a
	// province is not a place a side stands on, and above the municipality there is no town for
	// the block to be about.
	$: townOffered = Boolean(townPin);

	// And whether the list of places is what the block holds, which is the same question upside
	// down. A municipality is read as the town it is — the wrapper it has waiting today, or, once
	// there is none to take, the side on it, the plate naming it and the fight to be had — and
	// every coarser cut is read as the places it divides into; neither has anything to say in the
	// other's shape. There was a row of tabs saying so, with one of the two always missing from
	// it; the kind of place open answers it without being asked.
	//
	// The one thing that puts the list back on a town is a search, because the list is where a
	// search is answered (see openSearch): the field turns up places from the whole map, which is
	// not a question about the open one at all. It goes again with the field. Which also means
	// the glass is unreachable from a town, the glass being a cell of the row that heads the
	// list — a reader looks for a place from the list of places, and a town is not one.
	$: placesOffered = !townOffered || searchOpen;

	// (Which of the three the block shows used to be state, and is not: a `townTab` of 'town',
	// 'box' or 'places', a row of tabs to move it with, a reset to the town on every new
	// selection, a landing the radar reserved to put the reader on the wrapper, and three guards
	// keeping it off a tab that was not there to be pressed. The three things are still three and
	// still in that order — the list where the open place is not a town, the wrapper where the
	// town has one this reader can take, the party on the town otherwise — but none of it is a
	// choice: `placesOffered` and `townBoxOffered` are facts about the open place, and a town with
	// an unopened box today has exactly one thing to say. So there is nothing for a press to
	// change and nothing for a guard to correct, and opening the pack is what turns the block over
	// to the town, which is what the reader would have pressed for anyway. The radar's landing
	// goes with it: it sends the reader to a town whose block IS the box that was asked for.)

	// Whether that block is standing at all, which is now only whether the map is ready. It was
	// written out at the `{#if}` alone while the block was a band laid over the terrain, where
	// nothing else on the page could tell the difference. It is a box in the third column from `md`
	// up now, the top half of it, so the panel under it has to know: with the block there the panel
	// is the second of two rows, and without it the column is the panel's whole (see the grid, and
	// the wrapper down there).
	// A sheet being up used to take it away as well. Nothing on this page answers a sheet any more
	// (see FullScreenModal): a full view covers the viewport, so what is behind it is not being read
	// either way, and a page that rearranged itself under one was a page that re-framed the map for
	// nobody — twice per modal.
	// It used to want a town open and the map's own tab up, both for the same reason: what it held
	// was one town, and the list of places was painted over the terrain, so a block about a town
	// with no town in it was a block about nothing. Neither holds now. The list is one of the three
	// tabs in here and the list is about the level, so there is something to say at every tier and
	// at the top view; and the map has no tabs left at all, so there is no state of that column
	// that could be a reason to take this away. What that buys is the thing this page values most: the
	// map's box stops moving. It was re-framed by every walk into a town and out of one — WorldMap
	// answers a change of box with `invalidateSize` + `syncView` + a full rebuild of every pin and
	// every booster box — and now nothing but a sheet or the window itself ever changes it.
	$: townBlock = ready;

	// (Which of the two below the tabs was the square used to be a press: a bead on the rule
	// between them handed it from the terrain to this block and back. It is the block's for good
	// now — a 1:1 of the page's own width, with the map taking what is left of the column — so
	// there is no state, no bead and nothing about the map's box that a press can move. Which is
	// also the end of the one thing that swap cost: the map's box changing is what WorldMap
	// answers with `invalidateSize` + `syncView` + a full rebuild of its pins and boxes, and
	// nothing on this page asks it to do that any more.)

	// (The standing was lifted off this pin for a while and stood on its own in the column beside
	// the map, and the pin was handed on without it. Both halves are back on the one mark at the
	// foot of the terrain: how far a town has been taken and the fight to be had for it belong
	// under the side that would have to be beaten, and a control read off one column while the
	// side it acts on stands in another is one statement cut in two.)

	// --- The open municipality's deterministic "house team" ---------------------
	// A leaf region (a municipality) has no children to drill into; instead of an
	// empty table the Location plate previews the town's team: three cards rolled
	// deterministically from the town's own seed, drawn from its top show's roster.
	// It's a read-only, client-side mirror of the claim roll (a card is never written
	// to Supabase from here) — only the show→character assignment is read below.

	// The registry, indexed by id, so a rolled team member resolves to a label + sprite.
	const charactersById = new Map(characters.map((character) => [character.id, character]));

	// show id → its renderable character ids, read once from Supabase (the same
	// `show_characters` assignment the claim panel reads). Empty when Supabase is
	// unconfigured or unreadable — the team preview simply stays hidden then.
	let showCharacterIds = new Map<number, string[]>();

	// The open leaf municipality's feature (matched by id), and the GPS seed that
	// assigns its show — the same seed we reuse to roll its team, so a town's show and
	// its team are both stable functions of its shape. Null unless a municipality with
	// no sub-regions is open, which is what having no children in the tree says: only
	// the bottom tier is a place a team stands on.
	$: municipalityFeature =
		openRegion && municipalities && openNode?.children.length === 0
			? (municipalities.features.find((feature) => String(feature.properties?.id) === openRegion) ??
				null)
			: null;
	$: municipalitySeed = municipalityFeature ? coordinateSeed(municipalityFeature.geometry) : null;

	// The town's seeded team: up to TEAM_SIZE distinct characters from its top show's
	// roster, rolled from the municipality seed and obeying the roster's colour rule.
	// The same for every player, and only what a town falls back on until somebody
	// takes it.
	$: seededTeam =
		municipalitySeed != null && openShow
			? buildMunicipalityTeam(municipalitySeed, showCharacterIds.get(openShow.id) ?? [], TEAM_SIZE)
			: [];

	// The town's holder, or null while it is still on its seeded team.
	$: openHolder = openRegion ? (holders.get(openRegion) ?? null) : null;

	// The team on the open town: whoever holds it comes first, with the seed as the
	// fallback for towns no player has beaten yet. This is what the panel draws and
	// what a challenger fights.
	$: municipalityTeam =
		openHolder && openHolder.team.length > 0
			? territoryAdapter.toTeamRolls(openHolder.team)
			: seededTeam;

	// How far this player has got towards taking the open town, and the bar. Wins
	// banked against a generation that has since been replaced count for nothing.
	$: siegeProgress = openRegion
		? territoryService.progressFor(openRegion, holders, sieges)
		: { wins: 0, required: 1, turnover: 0 };

	// A player can't challenge a town they already hold — there is nothing to take.
	$: holdsOpenTown = !!openHolder && !!$profile && openHolder.userId === String($profile.id);

	// Nor one still cooling down from their last fight over it. The server is what
	// enforces it (`start_battle`); this only closes the button so the fight isn't
	// opened onto a refusal, and it reads the deadline the server set rather than
	// timing anything itself. A challenge the server has handed back — the town was
	// taken by somebody else while the fight was open — carries no deadline and is not
	// in the loaded set at all, so the town reads as open.
	$: challengedOpenTown = !!openRegion && challengeCoolingDown(challenges.get(openRegion));

	// (A player already in a fight is not offered another one, and a cooling-down town
	// says when it reopens instead — both read in the town panel over the map, off
	// `$openBattle` and the challenge's own deadline; see buildTownChallenge.)

	// (The town's team was drawn here as cards on the shared card canvas — portraits,
	// show row and all. It is statues in the town panel over the map now, which take a
	// frames folder and nothing else, so the faces and show names that fed those cards
	// are no longer loaded at all.)

	// --- The player's own team (the statues at the map's bottom-left corner) ------
	// Stood up in the document as three statues over the map, on nothing at all (see the
	// lineup at the corner): the side this player would field, so what they are challenging
	// with is read against the town they are looking at without leaving the map for the
	// roster — and without the panel's Profile tab having to be forward for it to be on
	// screen at all, which is what being a section of that tab cost it.
	// The team is the slots on the player's own cards, so it is only renderable once
	// those have loaded; empty slots are left out, and a team with none shows nothing.
	const teamSpawns = teamService.fielded;

	// The signed-in player's id, or null — what their spawns are loaded for.
	$: currentUserId = $profile ? String($profile.id) : null;

	// One load per signed-in player, exactly as the roster and the arena do it. A
	// failure leaves the plate unmounted rather than breaking the map.
	let spawnsLoadedFor: string | null = null;
	// Whether that load has come back — settled either way, since a read that failed
	// has told us as much about this player's cards as it ever will. The statues do not
	// need it (a team with none draws nothing), but the button standing in their place
	// does: a corner saying there is no side yet for the length of a round trip, and
	// then filling with three cards, is saying something that was never true.
	let spawnsSettled = false;
	$: if (currentUserId && currentUserId !== spawnsLoadedFor) {
		spawnsLoadedFor = currentUserId;
		spawnsSettled = false;
		void spawnService
			.loadSpawns(currentUserId)
			.catch(() => {})
			.finally(() => (spawnsSettled = true));
	}

	// The level boxes: one booster for every level this player has reached, each opened on a
	// show of their own choosing (see `level-box` in @3xl/shared, and LevelBoosterModal).
	//
	// Which of them are spent is read here, beside the cards, and not by the sheet that opens
	// them: the button over the terrain has to say how many are waiting before anybody has
	// raised anything, and a count that only arrived once a sheet was open would be a button
	// that could not say what pressing it was for. One read per signed-in player, and the
	// service keeps it in step from there — a box opened marks its own level spent.
	const levelClaims = spawnService.levelClaims;
	let levelClaimsLoadedFor: string | null = null;
	$: if (currentUserId && currentUserId !== levelClaimsLoadedFor) {
		levelClaimsLoadedFor = currentUserId;
		void spawnService.loadLevelClaims(currentUserId).catch(() => {});
	} else if (!currentUserId && levelClaimsLoadedFor) {
		levelClaimsLoadedFor = null;
	}

	// The boxes still owed, oldest first — every level from the first through the one they
	// have reached with no claim against it. Nobody signed in is owed nothing: a box belongs
	// to an account, and there is no account.
	$: owedLevelBoxes = $profile ? pendingLevelBoxes($profile.level, $levelClaims) : [];
	// And how many, which is the number on the button. Zero is what greys it out — and a set
	// that has not landed yet reads as every level owed rather than as none, since the sheet
	// behind the press is refused by the server with a sentence either way, where a button
	// greyed on an unread claim is a box the player cannot see at all.
	$: levelBoxesOwed = owedLevelBoxes.length;

	// Whether the sheet is up. Raised by the button below and put down by the sheet itself —
	// on the ✕, and on the reveal being done with. One press is one box (see the modal), so
	// this is not a sheet that stays open through a run of them.
	let levelBoosterOpen = false;

	// The cards the player fields come in slot order — the leader first, as on the
	// board. They ARE the team: a card holds a team slot or it doesn't, so this is the
	// same line-up on every device the account is signed in on.
	//
	// The plate draws them from their frames folder alone: no portrait to load, and no
	// show name to resolve, since it paints the show's glyph rather than naming it.

	// geojson feature id → municipality name, so each card can name where it was
	// claimed. Null until the layer the map is drawn from has loaded.
	$: municipalityNames = municipalities ? locationAdapter.municipalityNames(municipalities) : null;

	// The player's team as the plate draws it — not a card: who they are, the art that
	// stands them up, the colour they bend, where they were claimed and the show they
	// come from, whose glyph goes on the floor they stand on. The show is the
	// character's own first show, as `teamShowId` reads it for a town's pin, so a
	// character carries the same badge here as the map gives the show. Both maps are
	// threaded in so the statement re-derives as the assignment and the place names land.
	//
	// The reading itself is `teamLineupMembers`, in @3xl/shared, because this is not the
	// only place a side is stood up any more: a player's public profile page draws the
	// same three statues off the same three facts, having loaded them by another route
	// entirely (see publicProfile.service). One function, so the two can never disagree
	// about what a card looks like.
	$: playerTeamLineup = ((shows: Map<string, number[]>, names: Map<string, string> | null) =>
		teamLineupMembers($teamSpawns, {
			characters: charactersById,
			showsByCharacter: shows,
			municipalityNames: names
		}))(showsByCharacter, municipalityNames);

	// Whose side that is, for the face at the head of its banner (see TeamLineup's `owner`):
	// this reader, since the corner stands the side THEY field. It is the same three things
	// their own plate two rows under it is drawn from, read off the one profile, so the face
	// on the band and the face on the plate cannot come out different. Null while the session
	// is still being read — a band with no owner draws the robot, which is what a side nobody
	// is behind looks like, and a face is not guessed at in the meantime.
	$: sideOwner = $profile
		? {
				name: $profile.username || $_('profile.username.none'),
				characterId: $profile.avatarCharacterId,
				color: $profile.avatarColor,
				level: $profile.level
			}
		: null;

	// Whether the furniture column is standing the player's block at all — the side, the way
	// in, and the account plate under them. It is the very condition that block is drawn on,
	// named here because a second row in that column has to know it: the author's marks close
	// the column, and which of the two is the one pushed to the foot depends on whether the
	// block above it is there to push (see the third column's `mt-auto`).
	// Whether the side at the foot of the page is unfolded, which is a question a phone asks and
	// nothing else: below `md` it is a sheet lying on the map's bottom edge, and folded it shows the
	// first 5.875rem of itself — its own rule and padding, and the whole of the coloured mark the
	// side flies: the 3rem band over its statues and the tab under it naming the player, which is
	// the show the team is from and whose it is, in the lead's own colour (see TeamLineup's
	// banner). That is enough to say whose side is standing there and to be worth pressing; the
	// statues, the account plate and the author's marks are what unfolding brings up, over the
	// terrain rather than instead of it — the map keeps its whole box either way (see the grid).
	//
	// It starts folded, and is not written down: which way the fold was left is a thing about one
	// look at one page, not a preference about how this player reads maps, and a phone landing on
	// the map with the map showing is the right first answer for everybody. From `md` up the classes
	// that read this are all `md:`-reset, so the side is a full column there whatever it holds.
	let sideOpen = false;

	// How long the fold takes, and the one place it is said as a number: the panel spells it as a
	// Tailwind duration and this clock waits it out, so the statues below are put up exactly as
	// the panel finishes opening rather than at some length that has to be kept in step by hand.
	const FOLD_MS = 250;

	// Whether the side folds at all, which is a question about the viewport and not about the
	// page: below `md` it is a sheet over the map with a press on its edge, and from `md` up it
	// is a column standing beside one. Everything else that answers this question answers it in
	// CSS (`md:` on every class the fold touches), and this is the one thing that cannot — what
	// is MOUNTED is not a thing a media query decides.
	// Watched rather than read once: a window resized across the breakpoint, or a phone turned on
	// its side, has to put the statues back up rather than leave them out of a column that is not
	// folded any more.
	// It starts saying yes, before the browser has been asked at all, and that is the safe way
	// round rather than a guess about who is reading: assuming the fold leaves the statues out,
	// and a desktop puts them up a tick later on the first measurement. Assuming the column would
	// have mounted three sprites on a phone and taken them straight back down again.
	let sideFolds = true;

	onMount(() => {
		const query = window.matchMedia('(min-width: 48rem)');
		const sync = () => (sideFolds = !query.matches);
		sync();
		query.addEventListener('change', sync);
		return () => query.removeEventListener('change', sync);
	});

	// Whether the side is standing its three cards, as against the coloured mark alone. It is
	// what the statues are actually mounted on (see TeamLineup's `statues`):
	//
	// - Folded, there are no statues. Three sprites looping behind a cut nobody can see through
	//   is three clips loaded, decoded and animated for nothing, and the whole of what the strip
	//   shows is the band and the tab, which are not theirs.
	// - At the press to open, they go up AT ONCE — before the fold moves, not after it. This is
	//   the whole of what makes the panel open in one motion: what the fold animates is a
	//   max-height, and what is drawn is `min(content, max-height)`, so the box can only run to
	//   a height its content already has. Put the cards up when the fold finished and the panel
	//   opened onto the plate alone, stopped, and then jumped the height of three cards when
	//   they landed — a fold, a pause and a resize where there was meant to be one gesture.
	//   Mounting them first costs nothing to look at, either: a statue's height is settled the
	//   moment it is in the document, its picture box being `aspect-[3/4]` of its own width and
	//   its panel a fixed number of type rows (see CharacterStatue), so the box is full size
	//   before a single frame of any clip has been asked for.
	//   And mounting is still what plays their arrival: a statue is veiled on the way in and the
	//   veil is spent once per character per session (see IdleSprite), so a row that is built
	//   fresh is a row that can be watched arriving. Which is why the corner asks for
	//   `alwaysReveal` while it folds — the session has almost certainly seen these three, and
	//   here that is not a reason to skip the one thing the gesture is for. What the panel runs
	//   into is therefore the cards' full box with the veil over it, and the sweep that uncovers
	//   them starts a beat later (VEIL_HOLD), which is about where the fold ends.
	// - At the press to close, they stay in until the panel has finished closing, for the same
	//   reason read the other way: taking them out at the press would shorten the content under
	//   the animation and the box would snap shut instead of running the fold.
	//
	// So one direction is immediate and the other waits the fold out, and the timer is cleared
	// on every change: a press answered before the last one has finished is one gesture, not two.
	let sideStatues = false;
	let foldTimer: ReturnType<typeof setTimeout> | null = null;

	$: scheduleSideStatues(sideOpen, sideFolds);

	function scheduleSideStatues(open: boolean, folds: boolean): void {
		if (foldTimer) {
			clearTimeout(foldTimer);
			foldTimer = null;
		}
		// Nothing to wait for where nothing folds: from `md` up the side is a column and its
		// cards are simply up, whatever the press was last left saying. Nothing to wait for on
		// the way open either — the fold needs the height they bring before it starts moving.
		if (!folds || open) {
			sideStatues = true;
			return;
		}
		foldTimer = setTimeout(() => {
			sideStatues = false;
			foldTimer = null;
		}, FOLD_MS);
	}

	// A full view being up is deliberately not part of this. The block used to unmount under a
	// sheet and blur back in when it went — which cost the map nothing while the column it stands
	// in was a fixed third of the page. It is not: on a phone that column is exactly as tall as
	// what is in it (see the grid), so emptying it hands the map a taller box and a re-frame,
	// twice per modal. Nothing on this page answers a sheet now (see CHROME_BLUR), so what is left
	// here is the only thing this line was ever really about: whether there is a side to draw.
	$: playerBlockShown = ready && (playerTeamLineup.length > 0 || !!$profile || signedOut);

	// --- The town a fight is staged on -------------------------------------------------
	// It used to be alone on the map. The arena was the one full view that is ABOUT a place —
	// the roster, the badges, the leaderboard and the boosters are pages laid over the map, and
	// a fight is an event on a town, which was faintly through the foot of the sheet where the
	// page grades down to nine tenths — so while a fight was up the map was that one town:
	// brought to the middle of the canvas at the zoom it stands whole at, washed at 80% instead
	// of the 20% a picked town reads the satellite through, and everything else covered in
	// black with no border left anywhere. That was the spotlight, and it reached into four
	// things here (tierStyle, buildPulse, showGroups, hiddenLineUrls) and one prop of WorldMap.
	//
	// The fight has an address of its own now, so there is no map behind it to light: going to
	// the arena leaves this page altogether. The spotlight has gone with the sheet — WorldMap
	// still knows how to draw one, nothing on this page asks it to — and every reading here is
	// back to the one answer it had before a fight could change it.

	// True while the day's challenge is being claimed off the server, so a double
	// click can't fire two `start_battle` calls (the second of which the server
	// would refuse anyway).
	let challengeStarting = false;

	// Whether there is a team to fight with at all. `start_battle` fields the team off
	// the player's own cards and refuses to open a battle unless all TEAM_SIZE slots
	// are held, so offering the button would only be offering a fight the server will
	// not have. Signed out there is no team to read and no battle to open: the arena's
	// own sign-in gate is still the way in, so the button stays live.
	$: canFieldTeam = !currentUserId || $teamSpawns.length === TEAM_SIZE;

	// --- The menu ----------------------------------------------------------------
	// There is none. The player's own views were one column dropped from a burger at the far
	// end of the breadcrumb bar, and before that a full-height drawer at the map's right edge,
	// and before that a sibling of the map taking a flat 450px of the row. What emptied it was
	// each view finding the thing it is about: the roster is the side standing in the map's own
	// corner, the account is the cog at the end of the plate under it, the standings are the
	// shares row at the head of the list of places under the map, a town's pack is the box drawn
	// on that town, the search is a cell of that same shares row, and the radio runs wherever it
	// is turned on. A menu of what is left over is a menu of nothing, so the bar over the
	// terrain says the game's name and no more.
	//
	// The sheets themselves are untouched and all still mounted at the foot of this file: each
	// is raised by its own store, so anything that wants one asks for it by name (see
	// rosterModal, collectionModal, settingsModal, legalModal).

	// Fight this town: claim its challenge, then snapshot whichever team currently sits
	// on it — the holder's if a player has taken it, the seeded roll otherwise — into
	// synthetic spawns and open the combat modal. The town only changes hands
	// server-side, once the fight is reported and enough wins have been banked.
	//
	// The challenge is claimed *before* the arena opens, and by the server. Walking out
	// of a fight that is going badly still hands back no retry: the battle it opened is
	// the one fight this player may be in until it is reported, and only reporting it
	// starts the hour before this town can be fought again. A refusal (the town still
	// cooling down, another tab having opened a battle first) leaves the arena closed
	// and re-reads the cooldowns, which closes the button too.
	//
	// Signed out there is no ledger to spend from — and no fight that could ever be
	// reported — so nothing is claimed and the arena opens exactly as it used to,
	// onto its own "no active team" gate.
	async function challenge(): Promise<void> {
		// The board engine, on its way before anything else happens. It is a lazily-loaded
		// chunk that owes nothing to which town this is or who is fighting, and it was being
		// asked for only once the sheet was already up and empty; here it comes down while
		// the server opens the battle.
		void loadBoardEngine();
		// A player in a fight is offered the way back into it, never a second one.
		if ($openBattle) {
			resumeBattle();
			return;
		}
		if (municipalityTeam.length === 0 || holdsOpenTown || challengedOpenTown) return;
		if (challengeStarting || !canFieldTeam) return;
		const townId = openRegion;
		if (!townId) return;

		const rivals = municipalityTeam;
		// The generation being fought, so a win landing after somebody else took the
		// town is recognised as having beaten a team that no longer holds it. It is
		// recorded server-side with the battle, not carried to the report.
		const turnover = siegeProgress.turnover;

		if ($profile) {
			challengeStarting = true;
			try {
				// Opens the battle and claims the town's challenge in one transaction,
				// freezing the team being fought and proving the one doing the fighting —
				// so the fight survives the town changing hands, cannot be walked away from
				// for a fresh one, and is never opened with a line-up the report would
				// later be refused for.
				const challengeSlot = await battleService.start(townId, turnover, rivals);
				if (challengeSlot) territoryService.noteChallenge(challengeSlot);
			} catch (error) {
				// Refused: a team that is not the caller's, a town still cooling down, a
				// battle already open, or the town is the player's own. Re-read both so the
				// button tells the truth — and say which it was, since a challenge that
				// simply does nothing is the one thing the button must never look like.
				console.error('Challenge refused', error);
				await reloadChallenges();
				await reloadBattle();
				return;
			} finally {
				challengeStarting = false;
			}
			// The panel may have moved on while the RPC was in flight; the battle belongs
			// to the town that was clicked, so only that town's fight may open.
			if (openRegion !== townId) return;
		}

		stageFight(ogTeamSpawns(rivals, townId), townId, turnover);
	}

	// Put the player back into the fight they are already in. The rival line-up was
	// frozen when the battle opened, so it is fielded from there rather than rolled off
	// the town again — the fight goes on being against the three that were sitting
	// there, whoever holds the town now.
	function resumeBattle(): void {
		const battle = $openBattle;
		if (!battle) return;
		// The other door into the arena, warmed for the same reason as the one above.
		void loadBoardEngine();
		stageFight(ogTeamSpawns(battle.rivals, battle.locationId), battle.locationId, battle.turnover);
	}

	/**
	 * Hand the fight over to the arena and go there.
	 *
	 * Both doors into a fight end here, and this is the whole of what the two pages share: the
	 * line-up being fought and the two things that key it, plus the town's own plate. The plate
	 * is read *now*, off this page — the region tree, the sieges, the holders and the show
	 * glyphs are all the map's, none of them are the arena's, and a card assembled a second
	 * time over there could say something the map is not saying (see buildFightPlate).
	 *
	 * It is a snapshot and stays one: what a town is called, what it flies and who is sitting
	 * on it are settled when the fight is staged, and a fight does not last long enough for
	 * that to go stale. Where it used to be `$: fightPlate`, kept live under a sheet that had
	 * this page still mounted behind it.
	 */
	function stageFight(
		spawns: CharacterSpawn[],
		locationId: string | null,
		turnover: number
	): void {
		void openCombat({
			spawns,
			locationId,
			turnover,
			plate: buildFightPlate(locationId, regionNodes, regionSieges, holders, $showGlyphs)
		});
	}

	// Per-municipality chain of region tiers, read by buildMarkers/focusBounds to
	// find the municipalities under a region and frame or pin it.
	$: fillIndex = buildFillIndex(regionTree);

	// The outermost outline of the lot — the one line overlay the tier rule never hides
	// (rank 0), which is why it is not listed among the tiers that can be.
	const territoryLines = '/data/geo/territoris.json';

	// The town shapes, named because three things want the same file: the layer they are
	// drawn in, the collection this page fetches at mount for the tree and the seeds, and
	// the grouping's cache, which is handed that same collection rather than fetching it
	// twice (see tierGeometry).
	const municipalityLayer = '/data/geo/municipis.json';

	// The line overlays that subdivide a region, each with its own tier rank. The
	// territory outline (rank 0) is never hidden, so it isn't listed.
	const lineTiers: [string, number][] = [
		['/data/geo/provincies.json', tierRank.Province],
		['/data/geo/comarques.json', tierRank.Comarca],
		[municipalityLayer, tierRank.Municipality]
	];

	// Which layer a tier's shapes are drawn in, by that tier's rank — read off the two lists
	// above rather than written out again, so the pulse below can never be sent looking for
	// the picked shape in a layer it is not in.
	const tierLayerUrls = new Map<number, string>([
		[tierRank.Territory, territoryLines],
		...lineTiers.map(([url, rank]) => [rank, url] as [number, string])
	]);

	// Find a region node by its key anywhere in the nested tree.
	function findNode(nodes: RegionNode[], key: string): RegionNode | null {
		for (const node of nodes) {
			if (node.key === key) return node;
			const found = findNode(node.children, key);
			if (found) return found;
		}
		return null;
	}

	// The tier the map is imaging right now: territories at the top view (nothing
	// selected), otherwise the effective region's child tier — the sub-division its
	// pins mark. A municipality (a leaf) images itself.
	function imagedRank(chosen: string | null, nodes: RegionNode[]): number {
		if (!chosen) return tierRank.Territory;
		const node = findNode(nodes, chosen);
		return tierRank[node?.children[0]?.type ?? 'Municipality'];
	}

	// The rank of the tier on screen — the one whose polygons carry the colour wash
	// (see the overlays) and the finest one to keep its borders. Keyed off the ZOOM
	// focus (`effectiveSelected`), never the frozen click, so the paint stays in
	// lockstep with the pins: both advance a tier together as the map zooms in, and
	// coarsen together as it zooms out — a clicked region no longer pins its border
	// tier while the zoom marches on past it.
	$: hiddenRank = imagedRank(effectiveSelected, regionNodes);

	// Hide the stroke of every line overlay finer than that tier, so only the tier on
	// screen (and everything coarser) keeps its borders — the finer divisions inside
	// would just clutter the pinned regions.
	//
	// A staged fight used to take every line off the map, its own included, the spotlight
	// having covered every border outside the town and the one left inside it being a line
	// along the edge of the only shape there was. A fight is elsewhere now, so this is the
	// zoom's answer and nothing else's.
	$: hiddenLineUrls = new Set(
		lineTiers.filter(([, rank]) => rank > hiddenRank).map(([url]) => url)
	);

	// The frontier of the WHOLE forest at a given depth: every node reached at
	// exactly `depth` tiers down, plus any branch that bottoms out sooner (its own
	// leaf), so no area is left unpinned. Depth 0 is the territories, 1 their
	// children, and so on. This is the set of regions the map marks with a pin at
	// that breakdown tier.
	function frontierAtDepth(depth: number, nodes: RegionNode[]): RegionNode[] {
		const frontier: RegionNode[] = [];
		const walk = (node: RegionNode, atDepth: number) => {
			if (atDepth === depth || node.children.length === 0) frontier.push(node);
			else for (const child of node.children) walk(child, atDepth + 1);
		};
		for (const node of nodes) walk(node, 0);
		return frontier;
	}

	// The number of tiers on the deepest branch (territory-only = 1, down to
	// municipality = 4), so the pin stack can span every drill level.
	function treeDepth(nodes: RegionNode[]): number {
		let depth = 0;
		for (const node of nodes) depth = Math.max(depth, 1 + treeDepth(node.children));
		return depth;
	}

	// The path from a root region down to the pin nearest the map centre among those
	// drawn at `level` — the region the view is centred (and so zoomed) on. A plain
	// squared lat/lng delta is enough to pick the nearest. Empty when the level has
	// no pins.
	function focusedPath(
		level: number,
		levels: MapMarker[][],
		centre: [number, number],
		nodes: RegionNode[]
	): RegionNode[] {
		const pins = levels[level] ?? [];
		if (!pins.length) return [];
		let nearest = pins[0];
		let best = Infinity;
		for (const pin of pins) {
			const dLat = pin.position[0] - centre[0];
			const dLng = pin.position[1] - centre[1];
			const distance = dLat * dLat + dLng * dLng;
			if (distance < best) {
				best = distance;
				nearest = pin;
			}
		}
		return nodePath(nodes, nearest.id);
	}

	// Every key inside a node's subtree (the node itself and all descendants),
	// used to tell which breakdown pins fall within the selected area.
	function subtreeKeys(node: RegionNode, keys: Set<string> = new Set()): Set<string> {
		keys.add(node.key);
		for (const child of node.children) subtreeKeys(child, keys);
		return keys;
	}

	// The keys whose region overlaps the selection — its ancestors (the crumbs down
	// to it), the selection itself, and its whole subtree — or null when nothing is
	// selected (then no pin is dimmed). A pin whose region isn't in this set sits
	// clear of the selection and renders faded. Ancestors are included so a coarse
	// pin that CONTAINS the selection (shown once the map zooms out to that tier)
	// isn't dimmed alongside the disjoint regions around it.
	$: relevantKeys = selected
		? new Set<string>([
				...subtreeKeys(
					findNode(regionNodes, selected) ?? { key: '', name: '', type: 'Territory', children: [] }
				),
				...openPath.map((node) => node.key)
			])
		: null;

	// The picked region when it is a town, and null for anything coarser: only a
	// municipality's key names one, so a comarca or a province lands the same as nothing
	// picked. Read off the clicked selection rather than the zoom's focus, for the reason
	// the statues are (see statuedTown) — the focus is measured from the pins, and pins
	// that moved with it would be deciding what they are drawn from.
	$: pickedTown =
		selected && findNode(regionNodes, selected)?.type === 'Municipality' ? selected : null;

	// (The map used to mark one town at a time on a narrow view — a phone is the width of one
	// plate and a bit, and a comarca's towns drawn on it were plates elbowing one another out
	// of the way. Nothing marks a town now, on any screen, so there is no crowding left to
	// answer and no rule about it.)

	// The deepest drill level in the tree (territory = level 0), so the pin stack
	// can span every level down to the municipalities.
	$: maxLevel = treeDepth(regionNodes) - 1;

	// A region key's union bounding box, the point its pin stands on, and the
	// municipality ids beneath it.
	type RegionGeometry = {
		boxes: Map<string, LatLngBounds>;
		centers: Map<string, LatLng>;
		muniIds: Map<string, string[]>;
	};

	// One pass over the polygons for each municipality's own box and centroid, then
	// aggregated up every municipality's fill chain so each region key carries the
	// union box, its municipality ids, and a centre taken from the shapes themselves
	// (see interiorPoint) rather than from the box — a box centre sits off the region
	// for anything that isn't a rectangle, which is most of them. Precomputed so
	// buildMarkers is O(regions), not O(regions × polygons) — the municipality level
	// alone is thousands of pins.
	function buildRegionGeometry(
		polygons: GeoJSON.FeatureCollection | null,
		index: Map<string, FillLevel[]>
	): RegionGeometry {
		const boxes = new Map<string, LatLngBounds>();
		const centers = new Map<string, LatLng>();
		const muniIds = new Map<string, string[]>();
		if (!polygons) return { boxes, centers, muniIds };

		const munBoxes = boundsByFeatureId(polygons);
		const munCentroids = centroidsByFeatureId(polygons);
		// Each municipality's shape beside its box, so the centre of a region can be
		// checked against the land it is meant to stand on without re-scanning the layer.
		const munShapes = new Map<string, RegionShape>();
		for (const feature of polygons.features) {
			const id = String(feature.properties?.id ?? '');
			const box = munBoxes.get(id);
			if (id && box && feature.geometry) munShapes.set(id, { geometry: feature.geometry, box });
		}

		// A grouping's centroid is the area-weighted mean of its municipalities' — the
		// centroid of the dissolved shape, accumulated as the chains are walked.
		const weights = new Map<string, Centroid[]>();
		for (const [id, levels] of index) {
			const box = munBoxes.get(id);
			const centroid = munCentroids.get(id);
			for (const level of levels) {
				let ids = muniIds.get(level.key);
				if (!ids) muniIds.set(level.key, (ids = []));
				ids.push(id);
				if (centroid) {
					let parts = weights.get(level.key);
					if (!parts) weights.set(level.key, (parts = []));
					parts.push(centroid);
				}
				if (!box) continue;
				const current = boxes.get(level.key);
				if (!current) {
					boxes.set(level.key, [[box[0][0], box[0][1]], [box[1][0], box[1][1]]]);
				} else {
					current[0][0] = Math.min(current[0][0], box[0][0]);
					current[0][1] = Math.min(current[0][1], box[0][1]);
					current[1][0] = Math.max(current[1][0], box[1][0]);
					current[1][1] = Math.max(current[1][1], box[1][1]);
				}
			}
		}

		for (const [key, ids] of muniIds) {
			const shapes: RegionShape[] = [];
			for (const id of ids) {
				const shape = munShapes.get(id);
				if (shape) shapes.push(shape);
			}
			const centroid = combineCentroids(weights.get(key) ?? []);
			const point = interiorPoint(shapes, centroid);
			// A region whose polygons never loaded has no shape to stand on and keeps the
			// box centre it has always had.
			const box = boxes.get(key);
			if (point) centers.set(key, point);
			else if (box) centers.set(key, [(box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2]);
		}

		return { boxes, centers, muniIds };
	}

	$: regionGeometry = buildRegionGeometry(municipalities, fillIndex);

	// The box every municipality the booster window's festes reach has waiting, by town.
	//
	// Nothing of this is stood on the map, and nothing can be: the boxes were marks like the
	// pins, and the map carries no marks. The pins the terrain is drawn from are handed no
	// boxes at all (see NO_BOXES) and WorldMap is given no box layer, so neither half of what
	// used to put one on a point is fed any more. They are looked up by town now — the open
	// town's own box, in the column beside the map, under the plate that names it. The set is
	// still built whole rather than for the one town, because which show a town's box is
	// printed from is a question about every town at once (see below).
	//
	// It is the box that town has waiting, not a marker standing for one: the same component
	// off the same four things — the assigned show's cover, picked out of the enabled posters
	// by town and year exactly as the pack picks it, that show's wordmark, the town's own
	// name, and the card, white for a town de festa today and black for the rest of the
	// window. Clicking it raises that town's festa booster pack (see openPack).
	//
	// Printed from what the map already holds (the show each town flies — its seeded
	// one as overridden by whoever holds the town — and the authored show
	// collection) rather than from the panel's packs, which are a signed-in player's
	// claimable set: a town de festa is de festa for a visitor too, and the box is what
	// says so. A town the player has no claimable pack for is the one case a click has
	// anything to answer for, and the panel already says it. A festa town whose polygon
	// isn't on the map has no point to stand on and is skipped. Named deps
	// (`windowFestes`, `todayFesteIds`, `showsById`, `showEntryById`, `regionGeometry`,
	// `$showGlyphs`) so the boxes reprint when any of them lands — `showsById` among them,
	// so a town that changes hands re-covers its box with the conqueror's show without a
	// reload.
	$: festaBoxes = (() => {
		const centers = regionGeometry.centers;
		const today = todayFesteIds;
		const townShows = showsById;
		const entries = showEntryById;
		// Which of these boxes this reader has already opened, so a box that is spent is
		// drawn spent. The set is the claim panel's own read (the service's store), empty
		// while signed out, which leaves every box on the map looking as it always did.
		const spent = $claimedBoxes;
		const year = new Date().getFullYear();
		const result: MapBoosterBox[] = [];
		for (const festa of windowFestes) {
			const center = centers.get(festa.id);
			if (!center) continue;
			// The show the town flies — its conqueror's, or the build's seed while nobody
			// holds it — and out of its authored entry the two pictures the box carries.
			// The cover is seeded with the same string the pack's is (place|year), so a
			// town's box on the map and in the panel are the same copy of the same show
			// rather than two draws from its enabled posters.
			const show = townShows.get(festa.id) ?? null;
			const entry = show ? (entries.get(show.id) ?? null) : null;
			result.push({
				id: festa.id,
				position: center,
				coverUrl: entry ? showPosterUrlForSeed(entry, `${festa.name}|${year}`) : null,
				logoUrl: entry ? showLogoUrl(entry) : null,
				showId: show?.id ?? null,
				// The mark the disc is stamped with, since a disc is this box with one mark on
				// it instead of four. Drawn here rather than in the map, which has no reason to
				// know what a show looks like.
				iconSvg: forShow($showGlyphs, show?.id),
				locationName: festa.name,
				light: today.has(festa.id),
				// The same key the sheet's boxes are marked with, off the same festa: this
				// town's box, for the year of the festa it is printed for, on the stock that
				// festa gives it.
				claimed: spent.has(
					claimedBoxKey(festa.id, festaYear(festa.date), boxForFesta(festa.date, todayIso))
				),
				// Neither `selected` nor `onDiscClick` is set, and there is nothing left that
				// would read them: both were about the two sizes a box was drawn at ON the
				// terrain — the whole cover on the picked town, a disc on every other town of
				// the window — and no box is drawn there any more (see NO_BOXES). Every place
				// one of these is stood up now draws the box itself, at one size, so the only
				// press it has is its own.
				onClick: () => openPack(festa.id)
			});
		}
		return result;
	})();

	// The same crop, asked by town — which is how everything that wants one asks: a pin is
	// built for a place and wants that place's box, not a list to search. The list itself is
	// still what they are built as, since which cover a box is printed with is settled over
	// every town at once.
	$: festaBoxById = new Map(festaBoxes.map((box) => [box.id, box]));

	// --- The radar ------------------------------------------------------------------------
	// Where the search starts from: the open place's own centre, or the middle of the view
	// when nothing is open. Both are "here" — a reader with a town open is standing on that
	// town, and one who has only panned there is standing wherever they panned to — and the
	// distinction matters, since the centre of a view framed on a town is not quite the town.
	// A coarser region works as a starting point too, being the middle of what is on screen.
	$: radarFrom = (selected ? regionGeometry.centers.get(selected) : null) ?? currentCenter;

	// The box the radar would take the reader to right now: the nearest one they have not
	// opened, on a town other than the one they are already on. Null when the window holds
	// nothing left for them, which is what disables the press rather than a press that
	// silently does nothing. Recomputed as the view moves, so the answer is always about
	// where the map is now.
	$: radarTarget = nearestUnclaimedBox(radarFrom, festaBoxes, selected);

	// The rest between presses (see radarCooldown). Whether it is still on is a question
	// about the clock, and nothing here ticks, so it is asked once whenever the deadline
	// moves and then answered by the readout itself: the countdown drawn over the button
	// is what runs, and its `elapsed` is what lets the button go. That is the same hand-off
	// the town challenges use, and it is why the page re-renders twice over a minute rather
	// than sixty times.
	$: radarRestUntil = $radarCooldownUntil;
	let radarRestOver = 0;
	$: radarResting = radarRestUntil > Date.now() && radarRestOver !== radarRestUntil;

	// The radar's press: open that town exactly as its pin, its crumb or its table row would,
	// which frames the map onto its polygons and stands its box up in the block beside it.
	// Nothing is claimed and nothing is raised — the reader asked where to go, not for the pack.
	// Nothing beyond the town is said either: a town with a box still to be taken shows the box
	// and nothing else (see `townBoxOffered`), so opening the town IS landing on what was asked
	// for by name. It used to have to name the tab as well, and to reserve that landing across a
	// navigation, because the wrapper was a tab of its own that every new selection reset away
	// from.
	function findNearestBox(): void {
		if (!radarTarget || radarResting) return;
		startRadarCooldown();
		open(radarTarget.id);
	}

	// Show a town's pack: open the town on the map, remember which town, and raise the booster
	// modal, which mounts the opener with that pack already stood up.
	//
	// A box is clicked where the town is, so the click is a click on the town as much as
	// on its pack: `open` points the URL at the municipality exactly as a pin, a crumb or
	// a table row does, which frames the map onto its polygons — so the map is left framed on
	// the place the pack belongs to, waiting behind the pack and there again when it closes.
	function openPack(id: string): void {
		clearPackFeedback();
		// The click is a click on the town either way, so the map goes there either way.
		open(id);
		// What a visitor gets instead of the pack. A pack is claimed against an account —
		// the roll, the allowance and the cards are all the server's, keyed to whoever is
		// asking — so opening the box for somebody with no account would stand a pack up
		// only to have it say sign in. The box is the offer; the door is what has to be
		// answered first. (`signedOut` and not an empty profile: see buildTownChallenge.)
		if (signedOut) {
			openSignIn();
			return;
		}
		packTownId = id;
		packRaisedOnTown = true;
		boosterModalOpen.set(true);
	}

	// The menu had a row that raised the same sheet on the whole window's grid instead, and it
	// has not: a pack belongs to a town, and the way to one is the box the map stands on that
	// town. The window is still all there behind whichever box was clicked — the sheet is
	// handed every pack in it and walks back out to the grid (see BoosterModal's `back`) — it
	// is only no longer a thing that can be asked for from a menu.

	// How the sheet that is up was raised. Held rather than read off the pick, because the pick
	// moves while the sheet is up — a box is stood back down, another is picked out of the grid
	// — and what the sheet was raised for does not. It is what lets a sheet raised on one box
	// give itself over to that box (see BoosterModal's `single`). Only a box raises one now, so
	// it is set and never unset; it is kept as the thing the modal is told rather than folded
	// into a `true` written at the call site, since what it says is why the sheet is up.
	let packRaisedOnTown = false;

	// --- Which packs the booster modal shows --------------------------------------
	// Every festa major in the booster window — three days back through four days
	// ahead of today, today included. A festa major is not a single evening, and the
	// window is what `claim_booster` accepts too, so every pack it lays out is a
	// pack that can actually be opened; nothing here is a preview. The claim panel
	// mounted at the foot of the page assembles them (`claimPacks`).

	// And their art is fetched the moment they exist, which is while the map is being looked
	// at rather than when a box is clicked: the canvas that draws them builds every box before
	// it shows any, so a sheet raised on a cold window stands there empty for as long as the
	// whole window's posters take (see preloadPackArt). Nothing waits on this and nothing is
	// told when it finishes — it is a head start, and the canvas asks for the same pictures
	// whether or not it finds them waiting. `claimPacks` is named directly so a window that
	// lands late, or changes, is warmed too.
	$: void preloadPackArt(claimPacks);

	// Today in Catalan time, the same day boundary the server measures the window from —
	// and what each town's festa is read against to say which of its two boxes the map is
	// standing on it (see `festaBoxes`).
	const todayIso = catalanTodayIso();
	const packWindow = boosterWindow(todayIso);

	// The window written out, both ends of it. The dates stay Catalan whatever the
	// sentence around them is set in — a festa major is dated by the Catalan calendar
	// the map is about, not by the reader's locale — and are formatted at midday UTC so
	// neither can slip onto its neighbour, with a CSS-capitalised first letter since
	// Catalan month names come out lowercase.
	const packDateFormat = new Intl.DateTimeFormat('ca-ES', {
		day: 'numeric',
		month: 'long',
		timeZone: 'UTC'
	});
	const formatPackDate = (iso: string): string => packDateFormat.format(new Date(`${iso}T12:00:00Z`));
	// Re-derived rather than fixed at load, so the sentence follows the language while the
	// two dates it is built from never move.
	$: packWindowLabel = $_('booster.window', {
		values: { from: formatPackDate(packWindow.from), to: formatPackDate(packWindow.to) }
	});

	// Why the last roll was refused (empty when it wasn't), as the hidden claim panel
	// reports it back. The server is what enforces every rule — each refusal in
	// `claim_booster` (signed out, town de festa outside the window, its box already
	// taken, a show with no claimable characters) surfaces here, and the pack reveals no
	// cards. Shown on the booster sheet, because a pack that opens onto nothing has to
	// say why.
	let claimError = '';

	// How many cards the last pack opened in this panel revealed, or null before any
	// has been opened. Zero means the pack sliced open onto an empty canvas: the roll
	// resolved to nothing. That is normally a refusal (and `claimError` then says which),
	// but it is reported separately so an empty reveal is never silent.
	let lastRevealed: number | null = null;

	// Drop whatever the last open said, so its alert doesn't hang over the next pack.
	function clearPackFeedback(): void {
		lastRevealed = null;
		claimError = '';
	}

	function onPackOpened(revealed: number): void {
		lastRevealed = revealed;
		// Nothing to re-read here: the claim panel re-reads the boxes this player has
		// taken the moment one is opened, and the count on the bar is derived from the
		// packs it hands out.
	}

	// The pack a map box click stands up, picked out of the window's full set. Null when
	// no box has been clicked, the player is signed out, or the town has no claimable show
	// yet — the last of which is the only case the modal has anything to say about, since
	// a town clicked on the map is a town the player expected a pack from. The grid
	// itself works off the same id, so this is read only to tell that case apart.
	$: packForTown = packTownId
		? (claimPacks.find((pack) => pack.id === packTownId) ?? null)
		: null;

	// A box was clicked on a town the window holds no pack for — what the modal prints in
	// place of the grid.
	$: townHasNoPack = !!packTownId && !packForTown;

	// A pin frame's fill per region colour: the same six swatches the cards, the
	// avatar rings and the combat buttons paint with, each with the ink that reads
	// on it — yellow is the one light enough to want black — plus the grey a place
	// nobody holds is painted in, which is no card's colour and is spelled at the
	// same 500 weight as the rest so an unheld tile sits at the same depth as a held
	// one. The literals live with the rest of the palette (see spawn-colors), because
	// this map is no longer the only surface tiling a region: a player's public profile
	// page lists the towns they hold with the very rows of the column beside this map,
	// and a second copy of the six is how two of them come to disagree.
	const pinColorClasses = REGION_PANEL_CLASSES;

	// The side sitting on each town, by municipality id: whoever holds it, else the
	// team its seed rolls — the very fallback the panel draws for the open town, asked
	// here of every town at once so a pin can show who is standing on it. The roll is
	// stable per municipality, so a town nobody has taken always fields the same three.
	//
	// A town whose show has no roster loaded yet (the assignment comes from Supabase)
	// simply has no team, and its pin falls back to the show's glyph rather than
	// showing an empty frame.
	function buildTownTeams(
		seeds: ReadonlyMap<string, number>,
		shows: ReadonlyMap<string, RegionShow>,
		pools: ReadonlyMap<number, string[]>,
		occupied: ReadonlyMap<string, MunicipalityHolder>
	): Map<string, TeamMemberRoll[]> {
		const teams = new Map<string, TeamMemberRoll[]>();
		for (const [id, show] of shows) {
			const seed = seeds.get(id);
			if (seed == null) continue;
			const team = buildMunicipalityTeam(seed, pools.get(show.id) ?? [], TEAM_SIZE);
			if (team.length > 0) teams.set(id, team);
		}
		for (const holder of occupied.values()) {
			if (holder.team.length > 0) teams.set(holder.locationId, territoryAdapter.toTeamRolls(holder.team));
		}
		return teams;
	}

	$: townTeams = buildTownTeams(municipalitySeeds, showsById, showCharacterIds, holders);

	// The one town that stands its side up on its pin: the selected municipality, and only
	// while it has a side to stand. Every other pin keeps the show's glyph.
	//
	// A team on the map is three cards' worth of picture, and every town wearing one at
	// once is a terrain of cards with no map left under it. On the town being looked at it
	// is the point — who is holding this, standing where they are holding it — so the map
	// says it exactly there and nowhere else, with what can be *done* about it (see
	// townChallenge) at the foot of the same pin. Nothing about a picked town is said in
	// the map's corner, and nothing is drawn between the two.
	//
	// Read off the clicked selection rather than `openRegion`, and not only because a
	// zoom focus is not a choice of town: `openRegion` falls back to the focus, the focus
	// is measured from the pins, and pins that moved with it would be deciding what they
	// are drawn from. The two agree on a municipality in any case — the focus opens the
	// tier ABOVE its pins, so only a click ever names one. A key naming a coarser region
	// simply isn't in `townTeams` and lands the same as no selection.
	$: statuedTown = selected && townTeams.has(selected) ? selected : null;

	// The side holding that town, in the shape the statues take: who they are, the colour
	// they bend, where the card itself is from and what show it flies. Built here rather
	// than in the pin because which three they are is the town's question and not the
	// mark's, and handed to the marker as plain data (see buildMarkers).
	type PinTeam = NonNullable<MapMarker['team']>;

	function buildPinTeam(
		town: string | null,
		teams: ReadonlyMap<string, TeamMemberRoll[]>,
		nodes: RegionNode[],
		placeNames: Map<string, string> | null,
		memberShows: ReadonlyMap<string, number[]>
	): PinTeam {
		if (!town) return [];
		const standingIn = restoreCatalanArticle(findNode(nodes, town)?.name ?? '');
		return (teams.get(town) ?? []).map((member) => ({
			label: charactersById.get(member.characterId)?.label ?? member.characterId,
			basePath: charactersById.get(member.characterId)?.basePath ?? null,
			color: member.color,
			// Where the card itself is from, not where it is standing (see memberPlace): a
			// claimed card carries its own town about with it.
			locationName: memberPlace(member, standingIn, placeNames),
			// The character's own show, not the town's: a held town fields the occupier's
			// cards, and marking their floor with the town's show would be a lie — the same
			// rule the sidebar's cards follow.
			showId: memberShows.get(member.characterId)?.[0] ?? null
		}));
	}

	$: pinTeam = buildPinTeam(
		statuedTown,
		townTeams,
		regionNodes,
		municipalityNames,
		showsByCharacter
	);

	// What the picked town's pin says under the side standing on it: how far this player has
	// got towards taking the place, and the one control that acts on it — the siege counter
	// and the challenge button, which used to sit in the sidebar's Location tab and then on a
	// plate at the map's corner. They belong on the pin: what is being fought is standing
	// right there, and reading the odds off one side of the screen while looking at the town
	// on the other made two things of one.
	//
	// Rebuilt off `statuedTown` for the same reason the statues are: the zoom focus is
	// measured from the pins, so nothing the pins are drawn from may be measured back off it.
	//
	// Null hides the bar entirely: no town selected, or one this player already holds —
	// there is nothing to take from yourself, which is exactly when the sidebar says
	// "Yours" instead.
	//
	// The wording is chosen here because the choice of control is: which of the three
	// things a pin can say is the same decision as which state the town is in, and that
	// is this page's to make. So the formatter is threaded in as an argument rather than
	// read off the closure — the statement below has to name it to re-derive when the
	// language changes, and a call this function made on its own would not be seen.
	// (svelte-i18n exports no name for the formatter's type, so it is read off the store
	// it is the value of, which cannot drift from it.)
	function buildTownChallenge(
		town: string | null,
		occupied: ReadonlyMap<string, MunicipalityHolder>,
		banked: ReadonlyMap<string, MunicipalitySiege>,
		cooling: ReadonlyMap<string, MunicipalityChallenge>,
		player: Profile | null,
		battle: OpenBattle | null,
		starting: boolean,
		canField: boolean,
		visitor: boolean,
		t: Translate
	): MapChallenge | null {
		if (!town) return null;
		const holder = occupied.get(town) ?? null;
		if (holder && player && holder.userId === String(player.id)) return null;

		const progress = territoryService.progressFor(town, occupied, banked);
		const siege = { wins: progress.wins, required: progress.required };

		// Nobody signed in: the control is the way in rather than the way to a fight. It
		// said "your team needs three cards you have claimed" and was dead, which is a
		// true sentence answering a question a visitor has not been let near yet — the
		// thing standing between them and this town is not their team, it is not having
		// an account. So the button is live and it opens the door (see SignInModal).
		//
		// Asked of the session's own state and not of an empty profile: a visit with an
		// account on disk has no profile for a moment, and a control that offered to sign
		// them in in that moment would be offering it to somebody already signed in.
		if (visitor) {
			return {
				siege,
				button: {
					label: t('map.challenge.start'),
					title: t('combat.signInTitle'),
					disabled: false,
					onClick: openSignIn
				},
				unlocksAt: null
			};
		}

		// A fight already in progress takes the control over, whichever town is picked:
		// there is only ever one battle, and this is the way back into it rather than
		// the way into another.
		if (battle) {
			return {
				siege,
				button: {
					label: t('map.challenge.resume'),
					title: t('map.challenge.resumeTitle'),
					disabled: false,
					onClick: resumeBattle
				},
				unlocksAt: null
			};
		}

		// A town just fought is shut for an hour, and the control gives way to the time
		// left on it — the deadline the server set when it took the report, not a
		// duration counted here. When it runs out the cooldowns are re-read, which
		// brings the button back. The server enforces it either way (`start_battle`).
		const coolingUntil = challengeAvailableAt(cooling.get(town));
		if (coolingUntil !== null) {
			return {
				siege,
				button: null,
				unlocksAt: coolingUntil,
				onUnlock: () => void reloadChallenges()
			};
		}

		return {
			siege,
			button: {
				label: t('map.challenge.start'),
				title: canField
					? t('map.challenge.startTitle')
					: t('map.challenge.noTeam', { values: { size: TEAM_SIZE } }),
				disabled: starting || !canField,
				onClick: () => void challenge()
			},
			unlocksAt: null
		};
	}

	$: townChallenge = buildTownChallenge(
		statuedTown,
		holders,
		sieges,
		challenges,
		$profile,
		$openBattle,
		challengeStarting,
		canFieldTeam,
		signedOut,
		$_
	);

	// The same counter for every region there is, not just the picked town — because every
	// pin now carries its bar. A siege is a municipality thing, so a grouping's is the sum of
	// the towns under it: what taking the whole comarca would cost and how far its towns have
	// got, which is why a parent's bar always agrees with the bars found by drilling into it.
	//
	// One post-order pass over the whole tree per change of the holder/siege sets, rather
	// than a lookup per pin per tier — every tier's pins are drawn from this one map.
	$: regionSieges = buildRegionSieges(regionNodes, holders, sieges);

	// One pin per region that has a show, dropped at the centre of the region's
	// bounding box, captioned with the show and tooltipped with the region name;
	// clicking a pin opens that region. Pins clear of the selection are flagged
	// `dimmed` so the map fades them rather than dropping them.
	//
	// The SELECTED town's pin shows the side sitting on it — the three characters
	// themselves, each on their own colour. Every other pin carries the show's glyph:
	// the same icon the panel's
	// tables badge a show with, not its poster, because a poster is a tall photographic
	// rectangle that reads as a picture dropped on the map while the flat monochrome
	// glyph reads as a marking of the territory. A show with no glyph drawn yet keeps
	// its pin and shows by name alone, exactly as it does in those tables, and the frame
	// behind the glyph is filled with the region's colour, so such a pin says both what
	// a region flies and in which colour it flies it.
	/**
	 * Where a statue on a pin says it is from: the card's OWN claim town, never the
	 * one it happens to be standing on. A holder's team is three cards claimed
	 * wherever their player pulled them, and a card belongs to its place — a town it
	 * was marched to and won does not rewrite that.
	 *
	 * A seeded roll carries no claim (it was never pulled anywhere — it IS the town's
	 * house team), and neither does a holder row frozen before the RPC copied the
	 * claim across; both say the town they stand on. So does a real claim whose name
	 * hasn't loaded yet, which keeps a statue from flashing "Ultramar" at a town it
	 * knows perfectly well while the layer arrives.
	 */
	function memberPlace(
		member: TeamMemberRoll,
		standingIn: string,
		names: Map<string, string> | null
	): string {
		if (!member.locationId) return standingIn;
		// The two boxes that belong to no town and never will: their cards say the caption
		// the box carried where a place would be.
		if (isWelcomeLocation(member.locationId)) return WELCOME_BOX_CAPTION;
		if (isLevelLocation(member.locationId)) return LEVEL_BOX_CAPTION;
		if (member.locationId === ULTRAMAR_ID) return ULTRAMAR.municipality;
		const name = names?.get(member.locationId);
		return name ? restoreCatalanArticle(name) : standingIn;
	}

	// Every pin at one tier — built, and one of them drawn (see `hidden` below). What a pin
	// said is what the column beside the map now says, and says of the whole level rather
	// than of the part of it a given zoom happens to fit; the exception is the place that
	// has been picked, which is worth a mark where it stands. The rest are still built
	// because everything else about the map is measured through them — which region the view
	// is focused on, what a click on the land opens, how a framing is fitted — so a pin is a
	// model of a place on screen whether or not there is a plate on the terrain for it.
	//
	// What a pin carries is what it is handed, which is how one function serves both the
	// mark on the map and the pin the column stands up (see townPin): the column asks with
	// the sieges and the holders and the side, and gets the whole plate with everything
	// under it; the map asks with none of them, and gets the plate alone — the show's mark,
	// the place's name and the show's name. Neither is a stripped-down version of the other,
	// and neither had to be told which it was.
	//
	// The dressings, for whoever is asking with them: the
	// picked town gets the side holding it standing under its plate, and the way to fight
	// them on it — who is holding this, standing on the very place they are holding, and
	// what to do about it. All of it is added to that pin and takes nothing away from it,
	// so the mark on the town is the same mark whichever town is picked. The statues and
	// the control are handed in already built (see pinTeam and townChallenge), since which
	// three they are and what may be done about them are the page's questions and not the
	// pin's.
	//
	// The siege bar is on every MUNICIPALITY pin, picked or not: how far a place has been
	// taken is something the place says about itself, and reading it on one town at a time
	// made the standing look like a property of being selected. So the bar comes off
	// `sieges`, which has a counter for every region (see regionSieges), and the picked
	// town's bar is the same bar with a control under it.
	//
	// And on a municipality alone, because a town is the only thing anybody takes. A comarca
	// or a province is not held by a player — what it has is towns under it, some of them
	// taken and some not — so a bar across a comarca's pin was a progress towards nothing,
	// read at a tier where nothing can be fought for. The coarser tiers say what they are and
	// what they fly, and the standing appears when the map has got down to a place that has
	// one.
	//
	// Who holds the town is on every municipality pin for the same reason and with the same
	// bounds: being occupied is a fact about the place, not about its being picked, and a
	// place only a town can be. It is read off `holders` — the occupant's live name and worn
	// avatar, joined on in Supabase — so a town nobody has taken yet says nothing about a
	// holder, its seeded house team being no player's.
	function buildMarkers(
		nodes: RegionNode[],
		geometry: RegionGeometry,
		relevant: Set<string> | null,
		statuedTown: string | null,
		statues: PinTeam,
		challengeBar: MapChallenge | null,
		sieges: ReadonlyMap<string, RegionSiege>,
		occupied: ReadonlyMap<string, MunicipalityHolder>,
		glyphs: ReadonlyMap<number, string>,
		offers: ReadonlyMap<string, MapBoosterBox>
	): MapMarker[] {
		const pins: MapMarker[] = [];
		for (const node of nodes) {
			if (!node.show) continue;
			const box = geometry.boxes.get(node.key);
			const center = geometry.centers.get(node.key);
			if (!box || !center) continue;
			pins.push({
				id: node.key,
				// On the region's own shape, not in the middle of the box around it.
				position: center,
				bounds: box,
				// The whole side, but on the picked town alone — every other pin, and every
				// tier above the towns, is its plate by itself. Only a municipality's key is
				// a municipality id, so the coarser tiers never match.
				team: node.key === statuedTown ? statues : [],
				// The picked town's bar, control and all, where the page has built one — what
				// is being fought is standing right there. Every other TOWN, and the picked one
				// on a day there is nothing to be done about it (a town already this player's,
				// which is when buildTownChallenge hands back nothing), gets the standing by
				// itself: a bar with no button under it. A pin above the towns gets neither.
				challenge:
					node.type === 'Municipality'
						? ((node.key === statuedTown ? challengeBar : null) ?? siegeBar(node, sieges))
						: null,
				// Whoever is sitting on this town, on the plate that names it. Only a
				// municipality's key is a municipality id, so the coarser tiers never match
				// and are never asked.
				holder: node.type === 'Municipality' ? pinHolder(node.key, occupied) : null,
				// What the town has waiting, where the booster window reaches it — the same
				// lookup by the same key, and for the same reason it is the town tier alone: a
				// festa is a day in a town, and no coarser region has one.
				box: offers.get(node.key) ?? null,
				iconSvg: forShow(glyphs, node.show.id),
				frameClasses: node.color ? pinColorClasses[node.color] : null,
				title: node.show.name,
				subtitle: restoreCatalanArticle(node.name),
				featureIds: geometry.muniIds.get(node.key) ?? [],
				dimmed: relevant ? !relevant.has(node.key) : false,
				// Every pin, always. Not a plate on this terrain at any tier, at any zoom, picked
				// or not — the map is the country, and a mark is a caption laid over the part of
				// it the caption is about.
				// The last one standing was the picked place's, kept on the ground that where you
				// are is worth saying on the terrain as well as in the column. The row along the
				// map's own bottom edge says it now, and says it better: the same crumb out of the
				// same fields (see RegionCurrentBadge), plus the way up out of the place, the
				// three readings of it and what is playing — in a corner that does not move,
				// where a pin stood wherever its town happened to be and went off screen with a
				// pan. What is left saying which shape is the shape: the polygon breathing under
				// the spotlight, which is the one way of pointing at a place on a map that covers
				// nothing up.
				//
				// Said here, on the mark itself, rather than by building fewer markers: the tiers
				// ARE the map's model of what is on screen (see buildMarkerLevels), and a map with
				// pins missing would have gaps in its focus, its click resolution and its framing.
				// Every pin is still the tier's, still measured for where the view is looking,
				// still what a click on the land is resolved through and still what lights its
				// region when its polygons are pointed at. This is the one flag that separates
				// being modelled from being drawn, and it is what it was built for.
				hidden: true,
				// The place, and the tab that place is read on (see openFromPin) — one press, since
				// opening somewhere and being shown it are not two things a reader asked for.
				onClick: () => openFromPin(node)
			});
		}
		return pins;
	}

	/**
	 * What a town's pin says about its occupant: what to call them and the avatar they
	 * are wearing. Null for a town nobody has taken — there is no player to name, and a
	 * seeded house team is not somebody's.
	 *
	 * Both are the holder's *current* ones, joined onto the holder row in Supabase
	 * rather than frozen onto the town when it was won (see municipality_holders.sql),
	 * so renaming yourself or changing your face changes every town you hold. The
	 * avatar's two halves travel together because an avatar is the pair; both null is
	 * the initial-letter avatar, which the pin draws off the name.
	 */
	function pinHolder(
		key: string,
		occupied: ReadonlyMap<string, MunicipalityHolder>
	): MapMarker['holder'] {
		const holder = occupied.get(key);
		if (!holder) return null;
		return {
			name: holder.holderName,
			characterId: holder.avatarCharacterId,
			color: holder.avatarColor,
			level: holder.level
		};
	}

	/**
	 * The card the arena prints over its board: the town being fought for, on the very plate
	 * its pin carries on the map (see TownPlate). The same glyph, the same colour, the same
	 * two lines, whoever is sitting on it and how far it has been taken — so what stands over
	 * the fight is the mark that was pressed to start it, rather than a second wording of one
	 * town assembled for the arena.
	 *
	 * Built from the same readings the pins are (`pinHolder`, `siegeBar`), and off the town's
	 * own node, so the card cannot say something the map is not saying. The standing comes
	 * from `siegeBar`, which is the bar with nothing under it: a fight already under way has
	 * no challenge left to offer, and the button is what would have offered it.
	 *
	 * Nothing for a fight over no town — the classic match against a mirror of the player's
	 * own team — and nothing for a key that is not a municipality's, towns being the only
	 * thing anybody holds.
	 */
	function buildFightPlate(
		key: string | null,
		nodes: RegionNode[],
		sieges: ReadonlyMap<string, RegionSiege>,
		occupied: ReadonlyMap<string, MunicipalityHolder>,
		glyphs: ReadonlyMap<number, string>
	): TownPlateCard | null {
		if (!key) return null;
		const node = findNode(nodes, key);
		if (!node || node.type !== 'Municipality' || !node.show) return null;
		return {
			iconSvg: forShow(glyphs, node.show.id),
			frameClasses: node.color ? pinColorClasses[node.color] : null,
			title: node.show.name,
			subtitle: restoreCatalanArticle(node.name),
			holder: pinHolder(key, occupied),
			challenge: siegeBar(node, sieges)
		};
	}

	// Called once, when the fight is staged (see stageFight), rather than kept live: the arena
	// is not on this page any more, so there is no card standing over a board this page is
	// behind — what it is handed is what the town was when the player walked into the fight.

	// A pin's siege standing on its own: the counter this region carries, and nothing to
	// press. Null where there is no counter to draw — a region with no towns under it, and
	// so nothing to take, which a bar of nought out of nought would say worse than not
	// drawing one.
	function siegeBar(
		node: RegionNode,
		sieges: ReadonlyMap<string, RegionSiege>
	): MapChallenge | null {
		const counter = sieges.get(node.key);
		if (!counter || counter.required <= 0) return null;
		return { siege: { wins: counter.wins, required: counter.required }, button: null, unlocksAt: null };
	}

	// The map's pin renderings as a coarse → fine stack, one per drill level from the
	// whole-map territory frontier (level 0) down to the municipalities (maxLevel).
	// WorldMap draws the finest level that stays legible at the current zoom and
	// steps between them as the map zooms in and out, so zooming in unfolds the next
	// grouping and zooming out folds back up. All named here so the statement tracks them.
	function buildMarkerLevels(
		depth: number,
		nodes: RegionNode[],
		geometry: RegionGeometry,
		relevant: Set<string> | null,
		statuedTown: string | null,
		statues: PinTeam,
		challengeBar: MapChallenge | null,
		sieges: ReadonlyMap<string, RegionSiege>,
		occupied: ReadonlyMap<string, MunicipalityHolder>,
		glyphs: ReadonlyMap<number, string>,
		offers: ReadonlyMap<string, MapBoosterBox>
	): MapMarker[][] {
		const levels: MapMarker[][] = [];
		for (let d = 0; d <= depth; d++) {
			levels.push(
				buildMarkers(
					frontierAtDepth(d, nodes),
					geometry,
					relevant,
					statuedTown,
					statues,
					challengeBar,
					sieges,
					occupied,
					glyphs,
					offers
				)
			);
		}
		return levels;
	}

	// Nothing about a siege and nothing about an occupant: the stack is told the plate's three
	// facts and no more, so a pin of it carries the show's mark, the place's name and the show's
	// name and stops there. Whose the place is, how far it has been taken and what may be done
	// about it are read in the block under the map, where there is room for them and where they
	// stand for the place that was picked rather than for whatever the zoom has drifted over.
	// Empty maps rather than a flag, because what a pin says has always been what it was given —
	// and the stack is drawn nowhere at all now (see `hidden`), so what it is not told is what
	// it never has to be kept honest about.
	const NO_SIEGES: ReadonlyMap<string, RegionSiege> = new Map();
	const NO_HOLDERS: ReadonlyMap<string, MunicipalityHolder> = new Map();
	// And nothing about a pack either, which is the same rule said about the third thing a
	// town has: no pin on this terrain carries a box, whole or folded, at any tier and at any
	// zoom, picked or not. A box is a picture of an offer and the map is a picture of a
	// country — a cover standing on a point is a wrapper laid over the place it is about, and
	// a disc on every town of the window is a rash of dots over the land they are supposed to
	// be pointing at. What a town has waiting is read where everything else about the open
	// town is read: the block under the map, on its own tab, at the box's own size (see
	// `townBox`, which takes it off the town's pin rather than off the terrain). So the map's
	// own pins are handed an empty map here exactly as they are handed no sieges and no
	// holders, and `WorldMap` is never given the `boxes` prop that would stand a layer of them
	// on the points either.
	const NO_BOXES: ReadonlyMap<string, MapBoosterBox> = new Map();

	$: markerLevels = buildMarkerLevels(
		maxLevel,
		regionNodes,
		regionGeometry,
		relevantKeys,
		null,
		[],
		null,
		NO_SIEGES,
		NO_HOLDERS,
		$showGlyphs,
		NO_BOXES
	);

	// (The picked place's own pin was built here — the same function, asked for one node and
	// handed to the map beside the stack as WorldMap's `pickedMarker`, which is what kept it
	// standing at every zoom rather than being folded away with the level it belongs to. It was
	// the last mark drawn on this terrain and there are none now: where the reader is standing
	// is said by the row along the map's bottom edge, in words, in a corner that does not move,
	// and by the polygon breathing under the spotlight, which points at a place without lying
	// over it. The stack itself is untouched — it is the model, not the drawing (see `hidden`
	// in buildMarkers) — and the map goes on resolving clicks, framing views and lighting
	// regions off it exactly as before.)

	// Every town's feature id → the pin standing over that town on the tier the map is
	// drawing right now. A pin carries the municipality ids of everything under it
	// (`featureIds`), so this is the same lookup the map builds to light a whole region when
	// one of its towns is pointed at, read off the level the map says it has settled on
	// (`activeLevel`, mirrored here as effectiveDepth).
	//
	// Every pin is hidden now (see buildMarkers), which changes nothing here and is the point:
	// a pin is the model of a place on screen whether or not a plate is drawn for it, so the
	// land goes on opening exactly what the plate would have opened.
	$: pinByFeatureId = ((pins: MapMarker[]) => {
		const byFeature = new Map<string, MapMarker>();
		for (const pin of pins) {
			for (const id of pin.featureIds ?? []) byFeature.set(id, pin);
		}
		return byFeature;
	})(markerLevels[effectiveDepth] ?? []);

	// What a click on the land does: whatever the pin over it does. Not a handler of its own
	// that happens to agree with the pin's — the pin's very own, called off the marker, so the
	// two can never be taught different things about what opening a region means.
	//
	// A shape whose pin is not on the map answers nothing: at a tier the town is not pinned at,
	// the pin over it is its comarca's or its territory's, and that is the one that is called.
	function openFeature(feature?: GeoJSON.Feature) {
		const id = featureKey('Municipality', feature);
		if (!id) return;
		pinByFeatureId.get(id)?.onClick?.();
	}

	// The bounding box the map fits when a region is selected: the union of every
	// municipality polygon under the selected key. A fresh array each time (even
	// re-selecting the same region) so the map re-frames on every pick. Null while
	// nothing is selected, leaving the map where it is.
	//
	// The top view frames every town there is, because a crumb click frames what the crumb
	// names and that crumb names the lot of them. Without this the panel would have said the
	// territories while the map stayed down in the comarca the player was leaving.
	// A pick is named as a dependency rather than only the region it picked, because the two
	// are not the same statement: picking the region already open leaves the URL exactly as it
	// was, so `selected` never dirties and the box would never be rebuilt — which is a press
	// that does nothing on the one crumb whose whole job is to bring the map back to the place
	// it names, and on the pin of a town already open.
	function boundsToFrame(
		pick: number,
		features: GeoJSON.FeatureCollection | null,
		top: boolean,
		key: string | null,
		index: Parameters<typeof municipalityIdsForKey>[0]
	): LatLngBounds | null {
		void pick;
		if (!features) return null;
		if (top) return boundsForFeatures(features, new Set(index.keys()));
		if (key) return boundsForFeatures(features, municipalityIdsForKey(index, key));
		return null;
	}

	$: focusBounds = boundsToFrame(picks, municipalities, topPicked, selected, fillIndex);

	// The box the map is zoomed to fit without being moved to — what an empty position on the
	// breadcrumb ladder asks for. Set on the press and never cleared: a fresh array is what the
	// map re-zooms on, so the same tier pressed twice is two arrays and two zooms.
	let zoomBounds: LatLngBounds | null = null;

	// The whole ladder of regions the map centre stands in, root down to the town — the finest
	// pins are the ones that reach every branch, so the path to the one nearest the centre is
	// the path this view is inside. A bar's own crumbs stop where its path stops; this goes all
	// the way down, because a tier the bar has not reached is exactly the one an empty position
	// asks to be taken to.
	$: centrePath = focusedPath(maxLevel, markerLevels, currentCenter, regionNodes);

	// The whole map as one box: the coarsest rung of that ladder, and what a tier asked for
	// with nothing under the centre falls back to.
	$: wholeMapBounds = municipalities
		? boundsForFeatures(municipalities, new Set(fillIndex.keys()))
		: null;

	// The same ladder as boxes, coarsest first — the whole map, then every region the centre
	// stands in down to its town. The map turns each into the zoom it stands whole at and rests
	// the wheel on those and nothing between them, so a spin walks the tiers and stops where
	// the bar's own positions are pressed for (see zoomToTier, which fits the same boxes).
	$: zoomStops = ladderBoxes(centrePath, regionGeometry, wholeMapBounds);

	function ladderBoxes(
		path: RegionNode[],
		geometry: RegionGeometry,
		all: LatLngBounds | null
	): LatLngBounds[] {
		const boxes: LatLngBounds[] = all ? [all] : [];
		for (const node of path) {
			const box = geometry.boxes.get(node.key);
			if (box) boxes.push(box);
		}
		return boxes;
	}

	// Take the map to the zoom a tier is read at, leaving the centre where it is: press the
	// comarca position and the bar's comarca position is the one that fills.
	//
	// So the box to fit is that tier's OWN region under the centre, not the region above it.
	// The two are a tier apart and it is the same tier twice over, which is why: what the bar
	// names is the region the view is INSIDE, and what the map pins is that region's parts (see
	// levelIndexForView) — so the view that fills the comarca position is the one framed on a
	// comarca, which is pinning its towns. Fitting the province instead is the view that *pins*
	// comarques, and its deepest crumb is the province — a position short of the one pressed,
	// which is a bar asking to be pressed twice.
	//
	// It is a test of a region's size and not of where it sits, which is why nothing here has
	// to move the view: the same centre at that zoom is inside the same region.
	//
	// A tier the place under the centre does not have resolves to the box of the nearest tier
	// above it, which is the truth about it: at Andorra there is no comarca between the
	// territory and the towns, so its comarca position is the territory's own zoom.
	function zoomToTier(word: string) {
		const tier = tierByWord.get(word);
		if (!tier) return;
		const down = centrePath.filter((node) => tierRank[node.type] <= tierRank[tier]);
		const container = down[down.length - 1] ?? null;
		// Nothing under the centre at that tier or above it means there is no path under the
		// centre at all — the polygons are still loading, or the view is out at sea. The whole
		// map is the box then, which is where a bar with nothing in it belongs.
		const bounds = container ? (regionGeometry.boxes.get(container.key) ?? null) : wholeMapBounds;
		if (!bounds) return;
		// The bar only follows the zoom while nothing is picked (see openRegion), so a tier
		// asked for while a region is open hands the view back to the zoom first — otherwise
		// the map would move under a bar frozen on the click that is being left behind.
		if (regionParam) open(null);
		zoomBounds = [
			[bounds[0][0], bounds[0][1]],
			[bounds[1][0], bounds[1][1]]
		];
	}

	// Selecting a region doesn't recolour its polygons — a shape's colour says which
	// region it belongs to, not which one is open — it only brings the shape's own wash
	// forward (see tierStyle), on top of the framing (focusBounds) and the pins, which
	// still fade outside it.

	// --- How the map's furniture comes and goes ------------------------------------
	// The blur a plate over the map plays when it arrives and when it leaves: the block under the
	// map as the polygons land, the player's side as an account signs in or out. One amount and
	// one length for both, so the furniture reads as one kind of thing coming and going rather
	// than two. (The strip across the top of the terrain played it too, while it was a tab that
	// could be down; it is the map's own row now and stands whenever the map does.)
	//
	// It has nothing to do with the sheets any more. Every piece of this chrome used to blur away
	// while a full view was up and blur back when it left — the band at the top of the page, the
	// tabs over the terrain, the side and the account, and every pin and box on the map with them.
	// That is gone entire, and so is the store that drove it: a sheet covers the viewport, so
	// there was nothing behind it to be read sharply in the first place, and the price was steep —
	// three rows of the page moving, WorldMap's own panes moving, and the fight's own spotlight
	// held on a timer to keep in step with all of it (that spotlight has since gone with the
	// fight, which is a page of its own now). A modal blurs in and blurs out and touches nothing
	// outside itself (see FullScreenModal).
	const CHROME_BLUR = { amount: 8, duration: 250 };

	// Nothing about the map has to be measured any more. The furniture that used to be positioned
	// over the terrain — the badge and its marks along the top, the side and the account at the
	// foot — is in flow now: the game's name and the two questions on the page's top row, the side
	// and the account in the third column, the list of places a tab over the terrain. One square
	// went back onto the map afterwards (the radar, top-right), and it changes none of this: a
	// button in a corner is not a band across an edge, so there is still nothing to measure.
	// Three pieces of state went with the move:
	//
	// - `topChromeHeight` / `chromeInsets`. The map was told how tall the band across its top
	//   edge was so it would deal its pins clear of the bar drawn over them. There is no bar over
	//   them: the map has the whole of its own box back, and a measurement of something that is
	//   no longer there is a number that can only go stale.
	// - The column-as-panel on a phone, with `phone`, `columnOpen` and the burger that pulled it.
	//   Below `md` the page is one column and the three parts stand one after the other, so the
	//   list of places is simply the next thing down — and a burger that opens what is already
	//   open is a press with nothing to do.
</script>

<!-- The page is a band and a grid under it: the place the map is open on across the top, and the
	three columns this game is made of below.

	The page never scrolls (`h-dvh`, `overflow-hidden`) and the band takes only the height of
	its one row (`flex-none`), so what the grid divides is whatever is left — which is why it is a
	flex column with `min-h-0 flex-1` on the grid rather than the grid being the page.

	`h-dvh` and not `h-screen`, which is the whole of why this page fits a phone. `100vh` is the
	LARGE viewport — the height the window would have if the browser's own bars were gone — so on
	a phone it is the screen plus the address bar plus the toolbar, a hundred-odd pixels of page
	laid under furniture that is actually on screen. A page that never scrolls cannot scroll them
	out of the way either, which is the worst of both: the foot of the grid (the side's folded
	strip, and the bottom of the terrain with it) sat under the browser's chrome with no gesture
	that would bring it up. `100dvh` is the viewport as it stands right now, bars counted, so what
	this box is told is what the reader can actually see.
	It is `dvh` rather than `svh` because those bars can come and go — a rotation, a browser that
	retracts its toolbar — and the small viewport would leave a band of nothing at the foot of the
	page whenever they did. Nothing here makes them move: the document has no scroll of its own,
	which is what a phone retracts chrome for, so in practice the two are the same number all
	session and the map is never re-framed by it (see WorldMap's ResizeObserver, and the side's
	wrapper for what a moving map box costs). -->
<div class="flex h-dvh flex-col overflow-hidden">
	<!-- The page's first row, and it is the whole of what stands over the three columns: the
		game's name at the near end, the radio in the middle, and what the game gets asked at the
		far end.

		Where the map is standing filled the middle of it with the radio, and does not any more:
		that row names the open place, the block under the map answers what is AT the open place,
		and the two were saying one thing from two ends of the page. It is the row along the map's
		own bottom edge now, with the way up out of the place (see the map column), so the place
		and the ways of acting on it are read in one box, on the map they are about. The radio did
		not go down with it and has come back here: a station is a show and the map tunes the dial,
		but the sound carries across a walk from one town to the next and across every view opened
		over the map, so it belongs on the row of things that are true at every tier and on every
		screen rather than in a box about a town.
		The two ends were the head of the *third* column, which is where they had landed after
		coming off a band laid over the map's top edge; a name and two questions are about the game
		and not about the furniture, so a column of furniture was only ever the nearest shelf. Both
		ends are here because this row is the one thing on the page that belongs to none of the
		three columns and to all of them.

		The whole width, and its own rule under it: what separates a row from what is under it
		belongs to neither, and the rule stands at both widths because the fold below it changes
		the columns' axis and not this band's.

		`items-stretch` is what makes them all one height: three of the four are squares, and
		stretching means they and the name's plate take whatever height the row comes to rather
		than a number written here that would have to be kept in step with it. The padding is the
		band's rather than each child's, so they are spaced by one `gap-2` and inset by one
		`px-2`. What holds the far end against the far edge is the radio in the middle, which is
		the one item here that gives: the two marks were pushed over by an `ml-auto` for as long as
		nothing between the ends did.

		It stands exactly as it is whatever else is on screen. A full view used to veil it — blur
		it out and make it inert for as long as a sheet was up — which was a row of furniture going
		quiet behind something already covering it, and it is gone with the rest of that machinery
		(see CHROME_BLUR). -->
	<div
		class="flex flex-none items-stretch gap-2 border-b-2 border-primary bg-base-100 px-2 py-2"
	>
		<!-- What it says and what size it is set at are two different things: the word is "6xl"
			and the type is `2xl`, one flat size at every viewport rather than a ramp.
			`items-center` centres it in whatever height the row hands this plate (see above);
			`leading-none` so what is centred is the type's own height and not a line box built for
			a paragraph. `font-display` is Bungee, the app's one departure from Genos, and it is the
			token and not the family that is named here (see the `@theme` block in css/app.css).

			The plate is the theme's primary at full strength. It was a bar in a row of bars with a
			path of crumbs beside it, drawn at full strength precisely where that path was drawn at
			80% — a path is a thing being looked through to the map under it; a name is not. The
			path stood beside it as its folded dots for a while after that, and has gone down to the
			row across the foot of the map to stand against the badge naming the open place: where
			you are and the way out of it are one statement, and neither of them is a fixed thing
			about the game. So nothing stands beside this plate now — the band is the game's name at
			the near end and what can be asked about the game at the far one.

			The same badge is the tab's mark (see static/favicon.ico and the link in app.html), and
			it is drawn differently there on purpose: an icon is a square with room round the word,
			because that is the box a browser gives it. This is a plate in a row of plates — as
			tall as the row makes it, as wide as the word makes it. Neither shape should be made to
			answer for the other.

			It was the tab a column of views dropped from — the player's cards and the album, a row
			each, up while the pointer was on it — and, on a phone, the handle that pulled the list
			of places down over the map. It is neither now: the views are sheets raised from the
			marks at the far end of this row, and the list of places is a tab over the terrain (see
			RegionLocationList). So the plate is only the plate — nothing hangs off it and nothing
			is asked about the pointer — and it is a `<div>` at every width. -->
		<div
			class="flex flex-none items-center gap-3 rounded-lg bg-primary px-3 py-1.5 text-white shadow-xl"
		>
			<!-- The word twice: the same lettering in the panel's surface colour, offset 3px down
				and right, and the word itself over it. A shadow drawn as a copy rather than as a
				`text-shadow`, because a shadow the thickness of this face wants to be the face — one
				solid displaced impression of it, with no blur and no spread, which is what a second
				copy of the glyphs is and what a shadow utility, spelling a colour and a radius, is
				not.
				Both copies are positioned, so the one later in the document paints over the other
				without a z-index: an absolute box would otherwise sit above in-flow type whatever
				order it is written in, and sending it under with a negative z-index would send it
				under the plate's own fill as well, there being no stacking context between them. The
				copy in flow is the one that gives the box its size; `aria-hidden` on the other, since
				a reader hearing "6xl 6xl" is being told about a shadow. -->
			<span class="relative font-display text-2xl leading-none">
				<span class="absolute left-[3px] top-[3px] text-base-100" aria-hidden="true">6xl</span>
				<span class="relative">6xl</span>
			</span>
		</div>

		<!-- (The way up out of where the map is standing — the dots and the column of place names
			they drop — stood here, against the game's name, on the reading that a path reads from
			its root and that a control belongs on the row of the game's own furniture. It is the
			first thing on the row laid along the foot of the terrain now (see the map column),
			against the badge that names the open place: a cut belongs beside its place, and the way
			OUT of somewhere and the name of where you are read as one statement rather than as two
			marks a column apart. What is left on this band is fixed things about the game.) -->

		<!-- (The radio stood here, in the middle of this row, and it is a row of its own along the
			map's bottom edge again — half the width, directly over the band that names the open
			place: see MusicBanner and the strip at the foot of the terrain. It was the one item on
			this row that gave, so with it gone the two marks below are held against the far edge by
			a margin of their own again.) -->

		<!-- What the game can be asked, at the far end and folded into one square: the dots, and
			under them a line each for the questions and for who drew the fighters (see BandMenu,
			and `bandMenuItems` for the two of them).
			They stood open on this row, a square each carrying its glyph alone — and a glyph alone
			is a thing a reader has to already know, a palette being no more obviously a table of
			artists than any other mark. The column is where the names fit, and the marks go down
			it unchanged at the head of their own names. What the row keeps is one square instead of
			a mark per question, which is the far end holding still as more is asked of the game.
			Both are the same kind of question — where all this came from — which is what makes them
			one menu rather than two things that happen to share a corner, and they are on the
			game's own top row rather than three screens in for the same reason they always were. -->
		<BandMenu items={bandMenuItems} classes="ml-auto" />
	</div>

	<!-- The three columns, and the three are the three things this game is made of:
		the terrain, the list of places, and the furniture. In that order, left to right, each an
		equal third of what the band above has left.

		The third of them used to be drawn ON the first — the badge, the radar and the marks along
		the map's top edge, the side and the account at its foot, all absolutely positioned over the
		canvas with the pointer switched off between them and the map told (in pixels) which band of
		itself was spoken for. It is a column now: in flow, positioned relatively, sized by the grid
		like its neighbours. That is what takes the `pointer-events-none`/`-auto` pairs and the
		measured `chromeInsets` out of this page in one go — none of them were about what the
		furniture says, only about it standing somewhere it did not belong. Its head has since left
		the column too: the name and the two questions are the page's top row, and the radar is the
		one square that went back onto the terrain, `z-[900]` and all, because a control that moves
		the map is the map's (see the map column above).

		Three boxes and three tracks, and which of them is a row and which a column is the fold.

		From `md` up the grid is two rows of three columns and the third column is what the second
		row is for: the map spans both rows of the two columns it always had, and beside it stand the
		block naming the open town in the top row and the furniture in the bottom. Two rows of
		`minmax(0,1fr)` and nothing else, so the two halves of that column are halves — the block is
		given exactly what the panel is given, rather than a height written down here or taken off
		what happens to be in it. Which is also why the map spans: the terrain is measured against
		the whole column beside it and not against either half of it, and a block coming and going
		in the third column must not be a resize of the first (see WorldMap's ResizeObserver, and
		the wrapper below for what a resize costs).

		The block was a band laid OVER the terrain at this width — `absolute inset-x-3 bottom-3`,
		`z-[900]`, pointer events off between its plates — hanging in the map's own pane because
		there was nowhere in the flow to put a picture of the open town. There is now: it is the
		half of the third column above the furniture, in the flow, sized by this grid like
		everything else. That is what takes the last `pointer-events-none`/`-auto` pair and the last
		z-index off this page's chrome, and it hands the map back the strip of terrain the band was
		lying across.

		Below `md` the two columns are three rows one after the other — the map, the block under it,
		the furniture — and the last of them is a flat `5.875rem`: the height of the folded strip the
		side shows of itself, and nothing else —
		its 2px rule, `p-3`, the 4.25rem coloured mark the team flies (the band and the tab naming the
		player under it), `p-3` again (see the panel, where those four are spelled out). The side is a sheet on a phone — it hangs off the bottom of this grid and
		slides up OVER the terrain as it is unfolded (see the wrapper below) — so this row is not what
		it stands in, only the room the map is asked to leave clear at the foot of the page for the
		strip that is always down there.

		Which is why it is a fixed length and not a share, nor a track measured off what is in it. It
		was `grid-rows-3` with the map spanning two, a written-down two thirds and one third that had
		nothing to do with what stood in either. Then it was `auto`, sized by the side itself — right
		about the height, wrong about everything else: a row measured off a box that folds is a row
		that changes when the box does, and the map's box is the one thing on this page that must not
		change (see the wrapper for what that costs). A number the fold cannot move is the point of it.

		The page itself never scrolls at either width (see the wrapper above); each box scrolls inside
		its own, which is why both carry `min-h-0`.

		`relative`, because the side is positioned against this grid on a phone. And no `divide-y` any
		more: the rule between the map and the side is drawn by the side's own top border, so that it
		travels with the edge it separates instead of staying behind at the strip while the sheet goes up.

		The rule was `divide-y-2 divide-primary` here, on the grid rather than on either box, on the
		ground that a separator belongs to the pair it separates. That holds while both boxes are in
		the flow; it stops holding the moment one of them can slide over the other, since `divide-y`
		draws on the box ABOVE and the line would then stay down at the strip with the sheet somewhere over
		it. So it is the side's own `border-t-2` now — same colour, same weight, and it goes where the
		side goes. Off from `md` up either way, where what separates the columns is the columns —
		and the one line that IS ruled at that width, between the two halves of the third one, is
		the block's own bottom border, so it comes and goes with the block rather than being left
		drawn across the top of a panel that is alone in its column. -->
	<div
		class="relative grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto_5.875rem] md:grid-cols-3 md:grid-rows-2"
	>
		<!-- The map. Two thirds of the width from `md` up (`md:col-span-2`), and on a phone the whole
			page but the strip the side keeps at the foot of it. It was one third of three until
			everything the column beside it held turned out to be about the map — the level listed, the
			shows that level divides between, the way to search, the side standing on the open town, the
			fight to be had for it, and the path down to where that town sits. That column had nothing
			left in it, so it is not there, and what it was standing in is the map's. Only the search's
			field and the path have moved on again since — both into the block under this map, which is
			where what is at the open place is read.
			It stands in the first of the phone's three rows and spans none of them; from `md` up it
			spans BOTH rows of the two columns it holds (`md:row-span-2`), which is the whole of what
			keeps the terrain out of the third column's arithmetic: the block above the furniture
			comes and goes with the open town, and a map measured against the top row would be
			re-framed every time it did.
			Nothing else sizes it either — raising a view over it leaves its box alone, and so does
			unfolding the side, which goes up OVER this box and never into it — so the map is never
			re-framed by anything but a pan, a zoom or a region being opened. `relative` is what the
			chrome laid over the terrain is placed against: the row across its top, and anything
			Leaflet positions inside it. (The side standing on the open town was placed against it
			too, at `md`, until that block went to stand in the column beside this one.)
			Placed by name at both widths (`row-start-1` / `md:col-start-1`) rather than left to the
			order things are mounted in: the corner beside it comes and goes with the full-view
			sheets, and a grid that filled the gap would walk the map into the hole.

			Nothing here scrolls at either width, and below `md` that is a statement about the three
			rows rather than about this one: the block under the map is a square of the page's width,
			the strip at the foot is a fixed length, and the terrain takes what is left of the page.
			What does not fit is what is INSIDE that block, and it scrolls inside itself, the way
			every box on this page does.

			One thing stands in this column: the terrain, with what the open level divides between
			laid across the top of it (see the strip below). Both are pictures of the map — the level
			it is looking at, drawn and tallied — and they were a tab each for a while, which meant a
			reader could only have one of the two answers about a level at a time. The list of the
			places that level divides into was the third of those tabs (see RegionLocationList); it is
			in the block under this column now, on that block's own tabs, because a list of names is
			not a picture of the level but an answer to what is at the open place. -->
		<div
			class="relative row-start-1 flex min-h-0 min-w-0 flex-col md:col-span-2 md:col-start-1 md:row-span-2 md:row-start-1"
		>
			{#if ready}
				<!-- The map's box, and there is nothing beside it in this column any more: no tab row
					over it, so nothing here is `flex-none` above it and nothing can hand it a taller box
					and a re-frame it never asked for.

					It takes what the column has (`flex-1`), which on a phone is the
					column less the block under it — and that block is a square of the page's own width
					(see below), so the terrain is whatever a phone has after a 1:1. It was
					the square itself for a while, and then either of them was, a bead on the rule handing
					it from one to the other. The square is the block's now, and the map is back to the
					one thing it has always been at every other width: the box that fills.

					It is also, again, a box nothing on the page resizes — no fold reaches it, no press
					moves it, and a full view leaves it alone — so Leaflet is never told the column
					changed except by a rotation or a resize of the window itself. -->
				<div class="relative min-h-0 flex-1">
					<div class="absolute inset-0 flex flex-col">
						<WorldMap
							center={[41.8, 1.7]}
							zoom={8}
							minZoom={7}
							{overlays}
							outline={showOutline}
							{groupMarks}
							{markerLevels}
							{hiddenLineUrls}
							{pulse}
							{focusBounds}
							{zoomBounds}
							{zoomStops}
							bind:currentZoom
							bind:activeLevel
							bind:currentCenter
							classes="min-h-0 flex-1"
						/>

						<!-- The strip across the top of the terrain, and the one thing left on it: the way
							OUT to a festa nobody has opened, at the far corner. It is about the map and
							nothing else — it takes the view somewhere it has not looked — so it is the map's
							own and not the page's.
							The near corner held the tally of the shows the level's places fly, with the
							looking glass as its last cell and the field under it. All three have gone down
							into the block below, at the head of the list of places they act on (see the
							panel): a share narrows that list and the glass replaces it with what a search
							turned up, so what they do and the thing they do it to are one box now rather
							than two at opposite ends of the map. What they were doing up here was being
							read at the same moment as the terrain, which the list is read at too — it
							stands in the column beside this one.
							The name of the game, the questions put to it, who drew it and the way back UP
							out of the open place are all on the band above (see the page's first row): the
							last of those stood in this corner for a while, and what sent it up was that a
							path is a control over the whole page's idea of where you are, and the band is
							where this game keeps its controls.
							`pointer-events-none` with the square turning them back on, since the room
							around it is terrain and terrain has to stay draggable. `z-[900]`
							clears Leaflet's own panes (overlays 400-600, controls 800) without reaching
							the arena's 1200. No inset is measured off it and handed to the map: the pins
							are dealt where the polygons put them, and a reader who wants what is under it
							pans. It stands whatever the map is doing — there is no tab left for it to be
							hidden behind — and a full view used to take it away too; nothing on this page
							answers a sheet any more (see CHROME_BLUR).
							`items-start`, so the square hangs from the top edge rather than stretching to
							a strip that spans the map. -->
						<div
							class="pointer-events-none absolute inset-x-3 top-3 z-[900] flex items-start gap-2"
						>
							<!-- The level boxes: one booster for every level this player has reached, waiting
								here to be opened. The near corner, where the radar holds the far one — the two
								presses on this strip are both ways to a box, and they are the two ends of the
								same offer: the radar goes and finds one out on the map, and this one is already
								the player's and is opened on the spot.
								It is drawn exactly as the radar is — the same square, the same plate, the same
								count laid over the mark — because they are the same kind of thing and a strip
								where each press is its own shape is a strip that has to be read rather than
								recognised. What it says is how many boxes are standing there, which is the one
								thing a player wants to know before pressing it, and it greys when there are
								none: a box that comes with a level is a box that is not there most of the time,
								and a live button over an empty offer is a press that answers with a refusal.
								Nothing at all when signed out — a box belongs to an account, and the corner is
								simply empty until there is one, exactly as the plate at the foot of the map is.
								The number goes ON the square and not beside it, for the radar's reason: what is
								greyed and what is counted are one thing in one place. It is a sibling of the
								button rather than a child, so the dimming that says the press is off does not
								take the count down with it, and `pointer-events-none` so the square underneath
								is the whole of the press. -->
							{#if $profile}
								<div class="relative flex-none">
									<button
										type="button"
										class="pointer-events-auto flex size-10 cursor-pointer items-center justify-center rounded-lg bg-primary shadow-xl disabled:cursor-default disabled:opacity-40"
										aria-label={$_('booster.level.button', {
											values: { count: levelBoxesOwed }
										})}
										title={$_('booster.level.button', { values: { count: levelBoxesOwed } })}
										disabled={levelBoxesOwed === 0}
										on:click={() => (levelBoosterOpen = true)}
									>
										<img src="/assets/icons/delapouite/box-unpacking.svg" class="size-6" alt="" />
									</button>
									{#if levelBoxesOwed > 0}
										<span
											class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-bold text-primary-content drop-shadow"
										>
											{levelBoxesOwed}
										</span>
									{/if}
								</div>
							{/if}

							<!-- The radar. The map carries days of festes at once and no marks to find them
								by, so the boxes waiting out there are found by panning across the country
								looking for one — which is a search, and this is the button that does it: press
								it and the map opens the nearest town whose box is still unopened (see
								findNearestBox). It stands at every width, because a box is as hard to come
								across on a desktop as on a phone.
								It has been at the far end of a bar over the map, then a mark in the furniture
								column beside it, then a square alone in this corner, then the end of a row
								with the path at the other one, then the end of one with the tally at the
								other — and it is a square alone in this corner again, the path having gone up
								to the band and the tally down into the block.
								A size of its own, where the marks it used to stand among were drawn to a
								row's height (`self-stretch aspect-square`): nothing stands beside it up here
								now, and while the tally did it was a plate of whatever height its marks came
								to and not a row to be as tall as. `size-10` is what that row came to, so the
								square is the same square. `ml-auto` so the corner it holds is the far one of a
								strip that still spans the map, and `flex-none` so it stays that square
								whatever comes to stand beside it — both on the box around it now, so the corner is
								held by the same thing whether or not anything is standing over the square.
								Disabled when there is nothing left to point at — every box in the window
								opened, or none loaded yet — because a radar that answers "here" or answers
								nothing is a press with no destination. And disabled while it is resting off its
								last answer (see radarCooldown), which is the other reason it takes no press.
								The rest is drawn ON the square rather than beside it: the seconds left are laid over
								the sweep, so what is greyed out and what is counting are one thing in one place. The
								mark stays under them — the sweep is what says which press this is, and a button that
								swapped its face for a number would read as a different button for a minute. The
								readout is a sibling of the button rather than a child of it, because the dimming that
								says the press is off is the button's own `opacity-40` and would take the number down
								with it, and the count is the one thing here that has to be read. It is
								`pointer-events-none`, so the square under it is the whole of the press again the
								moment the rest is over. -->
							<div class="relative ml-auto flex-none">
								<button
									type="button"
									class="pointer-events-auto flex size-10 cursor-pointer items-center justify-center rounded-lg bg-primary shadow-xl disabled:cursor-default disabled:opacity-40"
									aria-label={$_('map.radar.nearest')}
									disabled={!radarTarget || radarResting}
									on:click={findNearestBox}
								>
									<img src="/assets/icons/lorc/radar-sweep.svg" class="size-6" alt="" />
								</button>
								{#if radarResting}
									<Countdown
										until={radarRestUntil}
										format="seconds"
										classes="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-bold text-primary-content drop-shadow"
										on:elapsed={() => (radarRestOver = radarRestUntil)}
									/>
								{/if}
							</div>
						</div>

						<!-- The other edge of the terrain: where the map is standing, the way back up out
							of it, and what is playing. It was the head of the block under the map — see that
							block, which is the panel and nothing else now — and it is laid over the terrain
							rather than at the top of that block because what is on it is about the place the
							terrain is drawing. A row that says WHERE YOU ARE reads best on the thing you are
							looking at, and the bottom edge is the one a map has to spare — the top strip
							belongs to the two presses that act on the level (the tally and the radar), and
							the polygons a reader is working over sit in the middle of the box.
							The strip is the map's whole width (`inset-x-0`) and holds two rows stacked in its
							own flow — the radio over the band naming the place — the lower of which fills it,
							so what is on the band is placed against a box that never changes: it spanned only
							`inset-x-3` and centred a shrink-to-fit row in the middle of that while the row was
							as wide as its own contents, which is exactly the arrangement that made the plate
							a different size in every town.
							It sits ON the edge and not above it (`bottom-0`, where the strip at the top
							keeps its `top-3`): the row is the bottom of the map the way a caption is the
							bottom of a picture, and a plate floating a few pixels clear of the edge with a
							sliver of terrain under it reads as a thing that has come loose.
							`pointer-events-none` on the strip with the band turning them back on — which now
							matters only for the band's own height, the strip having no room left either side
							of it, and the terrain above it staying draggable as before; `z-[900]`
							clears Leaflet's own panes as the strip above it does.
							`bg-base-100/80`, which is the surface every plate on every pin standing on this
							map is drawn on (see TownPlate's PLATE_SURFACE) — same colour, same alpha. The
							badge is white ink with no surface of its own and the terrain under it is any
							colour at all, so it wants a plate; the plate it wants is the one this map
							already uses for white ink laid over terrain, rather than the thinner wash the
							tally at the top is drawn on, which is a wash BECAUSE the tally is about what is
							under it. This row is not — it names where the map is standing. -->
						<div
							class="pointer-events-none absolute inset-x-0 bottom-0 z-[900]"
						>
							<!-- The radio, on a row of its own directly over the band that names the place:
								the play/pause and the song running past it, and the whole of it is the press
								(see MusicBanner). Two rows and not two cells of one — what is playing and
								where the map is standing are two statements, and a reader who wants the
								second should not have to read past the first to reach it. Stacked in the
								strip's own flow, first in the document and so above the band, which is what
								this strip being anchored to the map's bottom edge already gives: it grows
								upward over the terrain and costs the band below nothing.
								Half the width (`w-1/2`) and centred on it (`mx-auto`), because a song title is
								the shorter reading of the two and a banner as wide as the map would be a line
								of mostly nothing — and because the terrain either side of it stays visible. So
								it is a plate rather than a band: it stands on the row below it and is clear of
								both of the map's sides, which is what rounds the two corners it has free
								(`rounded-t-lg`). Same surface as the band under it (`bg-base-100/80`,
								TownPlate's PLATE_SURFACE), the two of them being one thing laid along the same
								edge.
								It has been the middle of the band across the top of the page, a third cell on
								the band below this one, and the last line of the pin the map stands on the
								open place. Empty until a song is loaded — the slot holds its room, so the
								band under it never moves when the music stops. -->
							<div
								class="pointer-events-auto mx-auto flex w-1/2 min-w-0 items-center rounded-t-lg bg-base-100/80 p-2 shadow-xl"
							>
								<MusicBanner />
							</div>

							<!-- One statement on one band: where you are and the way out of it, the dots
								and the badge naming the place.
								What is playing stood in a third cell beside them for a while, and is a row of
								its own over this one now (see just above): the two things left here are both
								about the open place, and the radio was the one thing on this row that was
								not. So the band is a row again rather than a grid of counted-out columns —
								the columns were there to keep the place's own width from changing when the
								music stopped, and with nothing beside it there is nothing left to keep still.
								It spans the map and is the same width whatever is on it, which is most of what
								it is. It was a shrink-to-fit plate centred on the bottom edge, as wide as
								whatever it held, and what that gave a reader was a plate that grew and shrank as
								they walked — one width for Alcoi, another for Sant Julià de Lòria, a third the
								moment a song with a long title came on. Something always in the same place at
								the same size can be read without being found first, which is what a band along
								an edge is for. So the strip runs edge to edge (`inset-x-0`, and no
								`justify-center` left to centre anything in it) and the band fills it.
								No corners either: a rounded corner is what a plate standing clear of a boundary
								has, and this one is against three — the map's bottom edge and both its sides. It
								carried `rounded-t-lg` while it was an island in the middle of that edge, which
								is exactly the shape it has stopped being.
								The place stood on the band across the top of the page before any of this, a
								whole column away from the answers about it (see the band), and then at the head
								of the block under the map. -->
							<div
								class="pointer-events-auto flex w-full min-w-0 items-center gap-2 bg-base-100/80 p-2 shadow-xl"
							>
										<!-- The way up out of where the map is standing: the dots and the column of place
										names they drop (see MapBreadcrumbs' `dotsOnly`). First on the row, and against
										the badge, because what it letters is the cut ABOVE the place that badge names
										(see `aboveCrumbs`) — a cut belongs beside its place, and a path reads from its
										root leftward into the name it arrives at.
										It has been a bar across the map's top edge, a mark in the head of the block
										under the map, a square in the corner of the strip over the terrain, and the
										second plate on the band at the top of the page, beside the game's own name.
										What kept sending it away was that the readings kept arriving beside it — the
										badge, the tally of the level — each saying where you are while this says how
										to leave; what brings it back is that the badge came down here too, and the
										two of them ARE the one statement it was being kept apart from. Nothing else
										on this row is a fixed thing about the game, which is what the band it has
										left is now made of.
										No plate of its own: the row it stands in already carries one, and a frame
										round a single button inside a frame is a second frame (see the prop). The
										square is DaisyUI's outlined 32px, the same square an empty rung of the path
										is drawn in, and it needs no height from this row — so no `self-stretch`, the
										row being as tall as the tabs beside it rather than a line of equal squares.
										`dropUp`, because down from here is off the bottom of the map and then off the
										page: the column of names comes out of the top of the row instead.
										Nothing at all at the top view, which is the one place with nothing above it,
										and the row simply closes up — the badge and the tabs are its whole width then.
										`z-[1000]` is the column it drops rather than the square, so the names come
										down over the plate and the terrain either side of it rather than into them.
										Pressed for what the path was always pressed for: a step opens its region, an
										empty rung takes the map to that tier's zoom. Through `openFromColumn` like
										every press in the block below, so picking a place puts the search field away
										with it. -->
									{#if aboveCrumbs}
										<MapBreadcrumbs
											classes="z-[1000] flex flex-none items-center"
											crumbs={aboveCrumbs}
											onSelect={(key) => (key ? openFromColumn(key) : open(null))}
											onZoom={zoomToTier}
											dotsOnly
											dropUp
										/>
									{/if}

									<!-- Where the map is standing, said once and by one thing: the badge that names
										the place, taking whatever the dots leave. Lettered exactly as a crumb and as a
										row of the list under it are, and pressed for what every row that names a place
										is pressed for (see RegionCurrentBadge). `min-w-0 flex-1` so a long name
										truncates against the row's own edge rather than widening the plate.
										It is the one place on the page where a second way of naming the open place
										could only ever be the same tile and name twice, which is why the dots
										beside it keep no crumb of their own (see `dotsOnly`).
										It shared this row with the three tabs for a while — a grid of two halves, so a
										long town name could not walk them off the edge — and has it to itself now that
										there are none. The three things those tabs picked between are all still in the
										block under the map, in the same order; what went is the picking, each of them
										being what the open place has to say rather than one of three things it might
										(see `placesOffered` and `townBoxOffered`, and the block itself). -->

									<RegionCurrentBadge
										classes="min-w-0 flex-1"
										row={subdivisionCurrent}
										on:select={(event) => openFromColumn(event.detail.key)}
									/>

									<!-- (What is playing stood here, in a third cell beside the two of them, and it is
										the row directly above this one now — the play/pause and the song: see
										MusicBanner and the plate over this band. It is still along this edge because
										the map turns the dial as the reader walks and the badge beside it letters the
										station already; it is no longer ON this row because everything else about the
										radio — that it is on, what is on, that it goes on playing while the reader
										walks from town to town and while a full view is open over the map — is not
										about the open place at all, and two statements read as two rows.) -->
							</div>
						</div>
					</div>

					<!-- (The level the map is open on, listed, was painted over this same box, as the
						second of three tabs. It is in the block under the map now, standing wherever the
						open place is not a town — see `placesOffered`, and the block itself further
						down.) -->
				</div>
			{:else}
				<div class="flex min-h-0 flex-1 items-center justify-center">
					<span class="loading loading-spinner loading-lg"></span>
				</div>
			{/if}
		</div>

		<!-- The side standing on the open town — and under it, on the plate the pin carries,
			whose the place is, how far it has been taken and the fight to be had for it. It was
			the first thing in the column beside this map, with the standing stood off on its own
			above it; then it was laid over the map itself: the three of them are a picture of who
			is holding the place, a picture belongs on the place, and what may be done about that
			place belongs under the three who would have to be beaten.

			It is a box of the page's own grid at both widths now, and the difference between them
			is which track it stands in. Below `md` it is the second of the three rows: the next
			thing down after the terrain, and a SQUARE — `aspect-square w-full`, 1:1 of the page's
			own width, and nothing else. Two things are read in it — three statues and a plate under
			them, or a booster box, which is 30:37 of whatever width it is given — and both are
			pictures, so what they want is a picture's box rather than a strip the column happened to
			have left. Three statues and a plate laid over a map that fills a phone would cover the
			better part of what one can see of the country, which is why on that width the picture
			stands beside the place rather than on top of it.

			The square is the block's size and never a starting point for one, which is the whole of
			what is decided here. It carries no ceiling and no floor: not a share of the viewport
			(that was `max-h-[40dvh]` briefly, which cut the Municipi tab sooner than the square
			did), and not the map's floor said from this end either (`max-h-[calc(100dvh-16rem)]`,
			which was the same box drawn by subtraction). A height in here would be a second answer
			to how tall this is, and the two would disagree on exactly the phones the question is
			about. What the map gets is what the square leaves: the first row is `minmax(0,1fr)` and
			gives.

			So the answer to a column too tall for it is a SCROLL and not a taller box. Whatever
			stands in here is read inside the square, and both of the things that stand in here have
			their way of doing that (see the panel below): the town's column scrolls the panel
			itself, and the list of places is handed the height, being a scroller by nature that
			divides whatever it is given. Nothing is cut — a wrapper at the foot of a long town is
			one short drag away, in the box the picture is framed in.
			`md:aspect-auto`: from `md` up this is half of a column and the grid says how tall it is.

			From `md` up it is the TOP HALF OF THE THIRD COLUMN: `md:col-start-3 md:row-start-1`, in
			the first of two `minmax(0,1fr)` rows, with the furniture in the second. So the block and
			the panel under it divide that column exactly in two, and the block is given a height it
			does not choose — `md:aspect-auto` drops the square, and the grid stretches it into the
			half. A picture of who holds the open town is the same kind of thing as the side this
			player fields, and the two halves of one column is where those two belong.

			It was a band laid over the terrain at that width: `md:absolute` against the map's own
			column, hanging at `inset-x-3 bottom-3` on the one edge nothing else was using, at
			`z-[900]` to clear Leaflet's panes, with `pointer-events-none` on the strip and back on
			for each plate so the terrain under the gaps stayed draggable. All of that is gone with
			the move — there is no strip over the map, so there is nothing to switch the pointer off
			for and nothing to raise above a pane — and the map has the whole of its own box back.
			What it cost is nothing the map minds either: the terrain spans BOTH rows of the two
			columns it holds (see the map column), so this block coming and going re-frames it as
			little as the band did.

			Its own top edge carries the rule below `md`, `border-t-2 border-primary`, exactly as the
			side at the foot of the page carries the one that separates it from this: a rule belongs
			to the box below the line, so it travels with the edge it separates. From `md` up that
			edge is the top of a column and there is nothing above it to be divided from, so the rule
			moves to the other edge (`md:border-t-0 md:border-b-2`) — the line between the two halves
			of the column, drawn on the half that comes and goes rather than on the panel, which
			would otherwise be left with a line ruled across the top of a column it has to itself.
			`p-3` all round at both widths, there being no mark on either line to keep a head clear of.

			The whole pin and not a copy of it less its standing: `townPin` comes out of
			`buildMarkers`, the very function the map's own marks are built by, so this and the
			pin on the terrain cannot come to say two things about one town.
			`named={false}`: the town's name is the band at the top of the page, so the plate
			is drawn for the rest of what it holds and is left off entirely where there is
			neither a holder nor a standing to print (see TownPin).
			Only a town has one at all, which is what the first tab is enabled by rather than
			what this block is: the block stands at every tier and at the top view, because the
			third of its tabs is the list of places and there is a level to list wherever the map
			is standing. It leaves under a full view with the rest of the chrome, on the same 8px
			over the same 250ms, and that is now the only thing that takes it away — which is what
			finally stops the map being re-framed by a walk into a town (see `townBlock`, where
			the condition is written once so the panel below can be told which rows it has).
			It takes the width the grid gives it — the third column, or the whole of a phone —
			up to the 500px the pin on the terrain is drawn at, so the statues here are the size
			they are on a mark.

			Three things stand here and one of them at a time, and nothing picks between them —
			which is the whole of the difference between this and the row of tabs it used to carry.
			They are the same three in the same order: the places the open region divides into
			where it is any coarser cut than a town (see `placesOffered`), the wrapper where the
			town has one this reader can still take (see `townBoxOffered`), and the party on the
			town — who is on it, the plate naming it, the fight to be had for it — otherwise. They
			are three answers to one question, what is there at this place, and which of them is
			the answer is a fact about the place rather than something to be asked for: a coarser
			cut has no side standing on it, and a town de festa with an unopened box has one thing
			to say today and says the rest the moment the box is opened. So the tabs were a control
			whose every press could be worked out from what it was pressed on. The block holds one
			child, and `items-center gap-2` is what it takes to centre it, there being nothing left
			to space it from.
			The list is the newcomer, and it came off the row of tabs over the terrain, where it
			was drawn as a third way of reading the map. It never was one: the terrain and the
			shares are pictures of the level and the list is its names, which is the same kind of
			thing as the town's own side and the town's own box — what is at the place the map is
			open on. So it is read where those are read, in the block, at the block's own size.
			And the shares came down after it, with the looking glass they carried and the field
			under that: a tally of how the listed places divide is a reading of the list, and a
			press that hides rows or replaces them belongs on the box it edits rather than at the
			far corner of the map. So the two presses that act on the level and the level's own
			names are one box, and the only thing left over the terrain is the radar. -->
		{#if townBlock}
			<div
				transition:blur={CHROME_BLUR}
				class="row-start-2 flex aspect-square w-full min-h-0 min-w-0 flex-col items-center gap-2 border-t-2 border-primary p-3 md:col-start-3 md:row-start-1 md:aspect-auto md:border-b-2 md:border-t-0"
			>
				<!-- The panel, and the box in here that scrolls for one of the two things it holds:
					what the block is given is a share of a track — a 1:1 of a phone's width,
					half a column from `md` up — and what stands in it is as tall as three statues, a
					plate and a wrapper, so there is regularly a little more of this than there is room
					for. It scrolls at both widths for that reason: the half-column is the same kind of box
					as the square, a height decided by the grid rather than by what is in it. (It was
					`md:overflow-visible` while the block hung over the terrain, where it was as
					tall as its own content and there was nothing to scroll.)
					For the list it does NOT scroll, and that is the one line of difference the list
					costs: RegionLocationList is a scroller itself — it is given a height and divides
					it, which is how a comarca of forty towns is read — and a scroller inside a
					scroller is two bars for one list and a box that can be pushed out of its own
					parent. So the overflow is switched off for it and the list is handed the
					panel's height (`min-h-0 flex-1`) to do what it already does with it.
					`gap-2` for the one of the three that is more than one thing: the list of places
					comes with the row that tallies it and, while it is out, the field that fills it,
					and three boxes stacked flush read as one long box. It costs the other two nothing,
					an only child having nothing to be spaced from.
					No state is held here — the show picked on that row and whether the field is out
					are the page's, since what they are about is the level and the level is the page's
					(see `activeShow`, `searchOpen`). Which of the three things is standing is read off
					the place itself: the list of places wherever the open
					place is not a town or a search is being typed (`placesOffered`), the wrapper where the
					town has one this reader can still take (`townBoxOffered`), and the party on the town
					otherwise. They were three tabs in here, and then a row of them across the foot of the
					terrain — the same three things in the same order, with a press in the middle of it.
					What the press was for was choosing, and there is nothing to choose: a town with an
					unopened box today has exactly one thing to say, and it says the rest the moment the
					box is opened. -->
				<div
					class={classNames('flex min-h-0 w-full flex-1 flex-col items-center gap-2', {
						'overflow-y-auto': !placesOffered
					})}
				>
					{#if placesOffered}
						<!-- The head of the list: the shows the listed places fly and how much of each,
							with the looking glass as its last cell. It was a plate laid over the terrain at
							the map's near corner, and before that a tab of its own over that terrain, the
							middle of the map's bottom edge, and a row at the foot of the column beside it.
							What it is doing HERE is standing on the thing it acts on: pressing a share
							hides every row below that does not fly it, and pressing the glass replaces
							those rows with what a search turned up — both of them are edits to the list
							under this row, and they were being made from the opposite corner of the page.
							The tally is over the whole level whatever is picked, because a share is what
							this level IS and not what is left of it after a press; pressing the picked
							show again clears it and pressing another turns the list over, so there is one
							gesture and it is its own undo.
							`w-full flex-none`: it divides the panel's width into a cell per show, the way
							a grid handed a box does — it was as wide as its own marks while it floated
							over the map, which is a width that had to be read against the terrain rather
							than against anything. And no plate: `bg-base-100/30` was the terrain reading
							through a mark laid over it, and there is no terrain under this. White ink, as
							the list below it is, and the same `px-2` so the two read as one column.
							The glass leaves the map with it, so the field is reachable only where this row
							is — which is where a search is answered (see `placesOffered`, and the list,
							which puts the matches in place of the level). -->
						<ShowShareGrid
							shares={subdivisionShares}
							active={activeShow}
							classes="w-full flex-none text-white"
							on:select={(event) => toggleShow(event.detail.id)}
						>
							<!-- The looking glass, as the last cell of that grid. It stood at the far end
								of the breadcrumb bar over the map once, where it had to fold a field away
								into a glyph to leave the path any room; here the glyph is a cell like the
								shares beside it and the field comes up on the row under it.
								In this row because this row is the one that acts on the list: the cells
								beside it narrow it to a show, and this goes and finds places that are not
								on the level at all. -->
							<button
								slot="end"
								type="button"
								class="flex items-center justify-center rounded-md p-1 hover:bg-white/10"
								aria-label={$_('map.search.label')}
								aria-expanded={searchOpen}
								on:click={openSearch}
							>
								<img src="/assets/icons/lorc/magnifying-glass.svg" class="w-full" alt="" />
							</button>
						</ShowShareGrid>

						{#if searchOpen}
							<!-- The field itself, on its own row under the glyph that asked for it and above
								the rows it is about to turn over. It puts itself away when it is left empty
								and takes the matches with it on Escape (see LocationSearchBox); what it holds
								is matched by this page against the whole tree, and the matches stand in the
								list directly below in place of the level. So the question and its answer are
								one box, and nothing moves on a keystroke but the rows underneath. -->
							<LocationSearchBox
								bind:value={searchQuery}
								bind:open={searchOpen}
								classes="w-full flex-none"
							/>
						{/if}

						<!-- The level the map is open on, listed. Handed the same rows the shares row
							above it is tallied over, the same matches the field turns up, and the show
							that row has picked — the press and the rows it hides are one box now, where
							they were a glance apart while the row floated over the terrain. Picking one is
							the map's own gesture: `openFromColumn`, exactly as a crumb or the badge on the
							map's own row, so a walk down the tiers reads the same whichever of them the
							reader is using to do it. -->
						<RegionLocationList
							classes="w-full min-h-0 flex-1"
							rows={subdivisions}
							current={subdivisionCurrent}
							{searchRows}
							{searchQuery}
							{activeShow}
							on:select={(event) => openFromColumn(event.detail.key)}
						/>
					{:else if townBoxOffered && townBox}
						<!-- The wrapper, alone. A town inside the booster window with a box this reader has
							not opened is a town with one thing to say, and everything else about it is said
							over the top of it: a reader who walks into a festa and is shown three statues and
							a siege bar has to go looking for the one thing that is only there today. So the
							box takes the block whole and the party waits — for the moment it is opened, which
							is when this stops being an offer (see `townBoxOffered`) and the town's own column
							comes up in its place. The tabs did the same thing with a press in the middle of
							it; what is gone is the press and not the order.
							Drawn in the document rather than on a canvas: the very component the Booster tab
							lays its grid out with, off the very `MapBoosterBox` the pin was handed (see
							`townBox`), so the two are one object and not two pictures of one.
							At the 200px a pin draws it at, which is the size a box is read at wherever it is
							stood in a column — the component takes its height off whatever width it is given
							(30:37 of it), so the width is the whole of what has to be said.
							A button and not a div with a handler, for the reason it is one inside the pin: the
							press is the box's own and it is the pack it opens (see openPack, which answers the
							door first for a reader with no account). -->
						<button
							type="button"
							class="w-[200px] flex-none"
							on:click={() => townBox?.onClick?.()}
						>
							<BoosterBox
								coverUrl={townBox.coverUrl ?? null}
								logoUrl={townBox.logoUrl ?? null}
								showId={townBox.showId ?? null}
								locationName={townBox.locationName ?? null}
								light={townBox.light ?? false}
							/>
						</button>
					{:else if townPin}
						<!-- The party on the town: the side standing on it, the plate naming it and the fight
							to be had for it. What the block holds once there is no box to be taken — either
							because the booster window does not reach this town (which is most towns most days)
							or because the one it deals has been opened, a town dealing two a year and neither
							twice (see `townBoxOffered`). So opening a pack is what turns this block over from
							the wrapper to the town, which is the order the tabs were pressed in and is now the
							order they arrive in.
							No `box` handed over: TownPin draws one at the foot of its column where it is given
							one, and a box drawn under the statues here would be the wrapper the branch above
							this one is for, printed a second time and smaller, on the one screen where it is
							already known to be gone.
							`flex-none`: this column is what regularly outgrows the square, and a flex item in
							a column that is out of room SHRINKS before its parent scrolls. Shrunk is not the
							same as scrolled — the statues, the standing and the plate would each be squeezed a
							little to fit a box they do not fit, which is the picture being redrawn wrong rather
							than framed and read through. Held to its own height, what is too tall for the
							square scrolls inside it, which is what the panel around it is for. -->
						<TownPin
							marker={townPin}
							named={false}
							alwaysReveal
							classes="w-full max-w-[500px] flex-none"
						/>
					{/if}
				</div>
			</div>
		{/if}

		<!-- The open region stood here, the second column of three: its name and the show it flew,
			the side standing on it, how far it had been taken and the fight to be had for it, the cut
			it sat inside, what the level under it was made of and the way to look for a place that was
			not on it. Every one of those turned out to be about the map rather than about this column,
			and went to the map: the name and the show to the page's own top band, the list and the
			shares and the field to the tabs over the terrain, the side and the standing to the town's
			own mark at the foot of it, the path to the row across its top. The author's marks, which
			were never about the open place at all, close the corner beside it. Nothing was left, so
			there is no column: the map has the two thirds it stood in (see above). -->

		<!-- The furniture: the foot of the phone's column, the third column of the desktop's row. It
			held two blocks for a while — the game's badge and its marks at the head, the side and the
			account at the foot — which was the shape it had had while it was drawn over the map. Only
			the second of them is what this column is actually about: who is playing, and the three
			they field. The first has gone to the page's top row, where a game's name and the questions
			put to it belong (see the band above).

			This is the wrapper, and on a phone it is not in the flow at all: it hangs off the bottom
			edge of the grid (`absolute inset-x-0 bottom-0`) and grows UPWARD over the terrain as it is
			unfolded. That is the whole point of it. The map's box is the one thing on this page that
			must not move — WorldMap watches its own box and answers a change with `invalidateSize` +
			`syncView` + a full rebuild of every pin and every booster box (see its ResizeObserver), so
			a side that pushed the terrain up and down over a quarter of a second would be that rebuild
			fifteen times over, in the middle of the one gesture. What the grid gives the map instead
			is a height that never changes: the last row is the folded strip's own height and nothing
			else (see the grid), and the terrain stops above it whether the side is up or down. So the
			fold moves paint and nothing else, and it moves it over a map that has not noticed.
			`pointer-events-none` on the wrapper with the two things in it turning them back on: it is
			as wide as the page but only as tall as what it holds, and the band of it beside the bead
			would otherwise swallow presses meant for the terrain behind it.
			From `md` up it is `md:static` and a grid item like any other — the third column, in flow,
			sized by the grid, with the panel filling it (`md:flex-1`). Nothing overlays anything
			there: the two stand side by side, and a column that hid a third of the map would be
			solving a problem the width does not have.
			What it is NOT at that width, any more, is the whole of that column: the block naming the
			open place takes the top half of it and this is the bottom (`md:row-start-2`). Only while
			that block is standing, though — before the map is ready there is nothing above and the
			panel has the column entire (`md:row-span-2` from the first row). That used to be the
			common case and is now the rare one: the block came and went with the town, with the map's
			own tab and with every full view raised over the page, and it goes with none of the three
			since the list of places came to stand in it. That is the one thing on the page `townBlock`
			is written down for: two boxes cannot both be told a condition and be relied on to agree
			about it. The map does not take part either way, spanning both rows whatever happens here.
			A full view used to veil this whole column and make it inert, which is gone with the rest
			of that machinery (see CHROME_BLUR): a sheet covers the viewport, and this column standing
			exactly as it was under one is a column nobody is looking at rather than a distraction. -->
		<div
			class={classNames(
				'pointer-events-none absolute inset-x-0 bottom-0 z-[1000] flex min-h-0 min-w-0 flex-col md:static md:z-auto md:col-start-3 md:pointer-events-auto',
				townBlock ? 'md:row-start-2' : 'md:row-span-2 md:row-start-1'
			)}
		>
			<!-- The fold, and it is a bead threaded on the rule the panel carries: `-mb-5` is half of
				its own `size-10`, which pulls the panel up under it so the circle straddles that line
				rather than standing on top of it. It rides with the line — the rule is the panel's own
				top border and the two travel together — so the handle is always at the edge of the
				thing it moves.
				A phone's only, `md:hidden`: from `md` up the panel is a column beside the map rather
				than a sheet over it, and there is nothing to fold.
				The arrow says which way the panel will move rather than which way it is folded: down
				while the side is up (press to put it away), up while it is away (press to bring it
				back). It is the same glyph turned over, and it turns as the panel moves, so the mark
				and the fold read as the one gesture. -->
			<button
				type="button"
				class="pointer-events-auto relative z-10 -mb-5 flex size-10 cursor-pointer items-center justify-center self-center rounded-full bg-primary shadow-xl md:hidden"
				aria-expanded={sideOpen}
				aria-label={sideOpen ? $_('map.side.collapse') : $_('map.side.expand')}
				on:click={() => (sideOpen = !sideOpen)}
			>
				<img
					src="/assets/icons/delapouite/plain-arrow.svg"
					class={classNames('size-4 transition-transform duration-[250ms] ease-out', {
						'rotate-180': !sideOpen
					})}
					alt=""
				/>
			</button>

			<!-- The panel itself: who is playing and the side they field. What it is, from its top
				edge down, is the 2px rule, `p-3`, whatever the fold leaves standing, and `p-3` again —
				and the two `p-3`s are the whole reason the fold is not on this box but on the one
				inside it. Clipping the panel would clip its own bottom padding off with everything
				else, so the strip would end on whatever the cut happened to land in — the tops of
				three statues' heads, in practice, since the band is drawn OVER the row rather than
				above it and the row goes on underneath. The padding stays outside the cut instead, so
				a folded strip is inset from the foot of the page by exactly what it is inset from the
				rule at its top: a band with the same air on both sides of it, closing the page rather
				than running off the end of it.
				`bg-base-100` because it is over the terrain now and not beside it — a sheet you can
				see a map through is not a sheet. It is the page's own fill, which is what the band at
				the top wears too, so from `md` up (where the panel is simply a column) it draws
				exactly what the bare column drew and there is nothing to turn off.
				The rule that used to be the grid's `divide-y` is this panel's own `border-t-2`: what
				separates the side from the map travels with the side, so unfolding does not leave a
				line ruled across the middle of nothing. That one IS dropped from `md` up
				(`md:border-t-0`), where what separates the columns is the columns. -->
			<div
				class="pointer-events-auto flex min-h-0 min-w-0 flex-col border-t-2 border-primary bg-base-100 p-3 md:flex-1 md:border-t-0"
			>
				<!-- The box the fold actually moves. On a phone it has two heights and the bead above
					moves between them —
					- Folded (the default), `max-h-[4.25rem]`: the whole of the coloured mark a side
					  flies and nothing else — the 3rem band TeamLineup lays over its statues, plus
					  the 1.25rem tab hanging off its bottom edge with the player's name and level on
					  it (see TeamLineup, where both of those lengths are built). So what is left
					  standing is the show the side is from, its wordmark, its two glyphs and whose
					  side it is, in the lead's own colour — a strip worth pressing to see the rest
					  of. With the panel's own padding round it that comes to the 5.875rem the grid
					  keeps clear at the foot of the page (2px + 0.75 + 4.25 + 0.75), so folded the
					  side closes the page exactly where the map stops and covers nothing at all.
					- Unfolded, `max-h-[66dvh]`. What that mostly means is "as tall as what is in it",
					  the statues and the plate and the marks coming to well under two thirds of a
					  phone; the figure is the ceiling for the case where they do not, and past it this
					  box scrolls inside itself exactly as it does from `md` up. It is stated as a
					  length rather than left off because a transition needs two ends: `max-h-[4.25rem]` to
					  nothing at all is not a distance, and the fold would jump.
					  `dvh` and not `vh`, for the reason the page itself is `h-dvh` (see the wrapper at
					  the top): this sheet grows upward from the foot of the visible page, so two
					  thirds of the LARGE viewport is two thirds of a screen plus the browser's own
					  bars — a sheet that would open past the top of the page it is drawn over.
					The transition is on the max-height, which is the honest cost of animating a box
					whose real height nothing has measured: what is drawn stops growing at the content's
					own height while the max goes on to 66vh, so the last part of an unfold is over
					before the timing says it is. `ease-out` is chosen for that — it spends most of its
					distance early, which is where the whole of the visible movement is.
					`overflow-hidden` while folded and `overflow-y-auto` unfolded: a box cut to one mark
					that scrolls is a strip somebody can push half a band out of.
					The 250ms is written twice on purpose and only once as a number: here as the class
					that actually moves the box, and in `FOLD_MS`, which is the clock that puts the
					statues up as this finishes and takes them down as it closes (see `sideStatues`).
					A duration is a thing CSS owns; what is mounted is not.
					`gap-2` is here rather than on the panel because it belongs to the rows it separates,
					and they are in here.
					`mt-auto` on the block inside is still there, and still for the reason `bottom-3` was
					before there was a column: the account sits at the foot of one. It does nothing on a
					phone, where this box is exactly as tall as the block in it; from `md` up it fills
					the column and the push is what keeps the account at its foot.
					Inside `{#if ready}` like the map it came off: the side standing here is rolled
					against the town names the polygons carry, and a statue drawn before those land says
					Ultramar at a town whose name is still on its way (see claimPlaceName). -->
				<div
					class={classNames(
						'flex min-h-0 min-w-0 flex-col gap-2 transition-[max-height] duration-[250ms] ease-out md:max-h-none md:flex-1 md:overflow-y-auto',
						sideOpen ? 'max-h-[66dvh] overflow-y-auto' : 'max-h-[4.25rem] overflow-hidden'
					)}
				>
					{#if ready}
						<!-- The head of this column is gone entire, and with it the block that held it. It was
							the game's badge, the radar, and the two marks that answer for the game — a band laid
							over the map's top edge before that, absolutely positioned, its height measured off the
							DOM and handed to the map so the pins would be dealt clear of it, its pointer events off
							everywhere the plates did not cover, and a z-index picked to clear Leaflet's panes.
							Standing it in a column took all of that away, and then the column turned out to be the
							wrong shelf too: the name and the two questions are about the game rather than about
							this player, so they are the page's own top row now, and the radar is the one of the
							four that acts on the terrain, so it is back on the terrain (see both above). The music
							player passed through here as well, in the left corner and then as a card of the bar,
							before the radio became the row that names the open place.
							What is left in this column is what it was always for: who is playing, and the side
							they field. -->
						<!-- The foot of the furniture column: the side this player fields, and under it who is
							playing and the way into their account. Signed out, the middle of that block is the way
							in instead (see SignInButton): the sign-in was in a burger menu once, which put the only
							thing a visitor can do behind the mark they would have had to think to press, while the
							slot that would have said who they are stood empty. It is one slot with two states now
							— the account, or how to have one.
							The two belong together — a side and the account fielding it are one statement, and it
							is the statement every town on the map is read against: the three being challenged are
							drawn on the town's own pin in the column of places, the three doing the challenging
							stand here with their player under them, so a fight the Challenge button opens is both
							sides of it read on the one screen. The account's plate was at the map's top-right,
							opposite the town panel, which put the player at one corner and the side they field at
							another with nothing but the reader to say which of them was whose.
							`mt-auto` is what keeps it at the foot: this used to be positioned against the map's
							bottom edge, and a column has to be told to push its last block down. It grows upwards
							from there, so what arrives in it — the plate, as an account signs in — lifts the
							statues rather than walking the account off the end of the column.
							The block takes the column's whole width, statues and account row alike: they are one
							statement in one place, and a row narrower than the side above it would read as a second
							thing that happens to be nearby. It was a flat 400px while it stood on the map, which is
							a width a corner has to choose for itself; a column of the grid is given one.
							Nothing is drawn at all when there is none of it to draw — which now only happens while
							the session is still being read, since a visitor it comes back empty for is a visitor
							who gets the door.
							A full view no longer takes it away, though it still goes quiet under one: the veil is
							the whole column's now, because the column's height is the phone map's box (see the
							column above). So this blur is left playing what it was always really for — a side
							arriving as an account signs in, and going as one signs out. The statues are rebuilt
							on the way in, which is what they already are every time the map re-frames itself — a
							character that has been through its veil once never plays it again (see IdleSprite),
							so what comes back is the picture and not the reveal. -->
						{#if playerBlockShown}
							<div transition:blur={CHROME_BLUR} class="mt-auto flex flex-col gap-2">
								<!-- The three statues and nothing else: no plate under them, no heading over them,
									so what stands here is the side itself rather than a panel about it. It can stand
									bare where the map's other furniture cannot because a statue brings its own ground
									and its own panel — every word on it is already read off the card's own colour,
									never off the terrain behind it.
									The row is given its box by the column rather than positioning itself: it is
									`w-full` of whatever holds it, and a width handed to it in the same breath would be
									two width utilities on one element with nothing but stylesheet order to settle
									which of them wins.
									Only drawn once there is a side to draw — an account with no card in a team slot
									leaves the column to its plate alone — and only inside `ready`, so a statue never
									says Ultramar at a town whose name is still on its way (see claimPlaceName). -->
								{#if playerTeamLineup.length > 0}
									<!-- And it is the way into the team, pressed as a whole: the three cards standing
										here *are* the side the roster is for editing, so the reader who wants to
										change them presses the thing they want to change rather than going looking
										for it in the menu. The press is on the row and not on a card, because a
										statue in this corner is a picture of who is fielded and not a control — the
										roster is where a member is taken off (see TeamLineup's `selectable`, which
										stays false here). One target over the lot, so there is no dead strip between
										the cards either.
										Named for a screen reader, since what is inside the button is three cards'
										worth of names and colours and none of them says what pressing it does. -->
									<button
										type="button"
										class="w-full cursor-pointer rounded-box focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
										aria-label={$_('roster.open')}
										on:click={() => rosterModalOpen.set(true)}
									>
										<TeamLineup
										members={playerTeamLineup}
										owner={sideOwner}
										statues={sideStatues}
										alwaysReveal={sideFolds}
									/>
									</button>
								{:else if $profile && spawnsSettled}
									<!-- A player with no side fielded yet, in the slot the three statues take:
										the same press, said in a word instead of drawn as three cards. The row
										above is the way into the roster because it *is* the side being edited,
										and a corner that simply had nothing there left that way in to the
										statues alone — so an account with an empty team had no door to the one
										screen that fills it. Shaped like the sign-in below it rather than like
										the lineup above it, since what stands here is a button and not a
										picture of anything, and the corner already reads as a column of
										full-width rows. -->
									<button
										type="button"
										class="btn btn-primary w-full shadow-xl"
										on:click={() => rosterModalOpen.set(true)}
									>
										{$_('roster.open')}
									</button>
								{/if}

								<!-- The way in, standing where the account's plate stands once there is an account.
									One button and the whole width of the column, which is what every row of this
									corner is now the radio has left it. The form it opens — a gate of two boxes,
									the documents under them and the provider button — stood here for a while,
									and could not have been read at half of 400px in any case; it is a sheet of
									its own now, and this corner asks for it in a word (see SignInModal). -->
								{#if signedOut}
									<SignInButton />
								{/if}

								<!-- Who is playing, under the side they field: the last row of this corner, and the
									whole of it again.
									It shared this row with the radio for a while, as two halves of the column's one
									width — both of them being things this player had switched on, as against the map
									at the other corner. The radio is a row along the map's bottom edge now
									(see MusicBanner): a card of its own down here was saying, in a corner belonging to
									this player, something that is neither this player's nor this corner's — the
									sound is the game's and follows the map. What shares the row instead is the one
									press that belongs to this plate: the cog.
									No `pointer-events-auto` on it: that was needed while it stood in the column under
									the bar, which turns its own events off so the map stays pannable through the gaps
									between its plates. This corner is not that column.
									The plate is the way into the account as well as the reading of it: the picture
									opens the picker and the rest of it opens the settings sheet, which is the sheet
									this plate summarises. -->
								{#if $profile}
									<div class="flex items-stretch gap-2">
										<PlayerPanel
											profile={$profile}
											on:editavatar={() => avatarPickerOpen.set(true)}
											on:open={() => settingsModalOpen.set(true)}
											classes="min-w-0 flex-1"
										/>

										<!-- The settings, as a mark at the end of the row that summarises them. It was a
											row of the menu at the other corner of the map, which is where a player had to
											go looking for the sheet about the account they were already looking at; the
											menu keeps what is not the account's — the album, and the documents.
											A square, since it is a glyph and nothing else, and one drawn to the plate's
											own height: `self-stretch` takes the height the plate sets for the row and
											`aspect-square` reads the width off it, so the two stay one row however the
											plate is measured. Same surface as the plate, because it is the same corner's
											furniture and not a control laid over it. -->
										<button
											type="button"
											class="flex aspect-square flex-none cursor-pointer items-center justify-center rounded-lg bg-base-100/80 shadow-xl hover:bg-base-100"
											aria-label={$_('settings.title')}
											on:click={() => settingsModalOpen.set(true)}
										>
											<img src="/assets/icons/lorc/cog.svg" class="size-6" alt="" />
										</button>
									</div>
								{/if}
							</div>
						{/if}
					{/if}

					<!-- Where the author is, and it closes this column: the one row on the page that names
						something outside the game. It was the foot of the column beside this one, under
						everything the open place had to say for itself — which put a row about whoever made
						this under a list of towns, where it read as one more thing about the place. It sits
						under the player instead, because these two rows are the only ones here that name a
						person: who is playing, and who drew what they are playing with.
						The column's free space is pushed above exactly one row, and which row that is
						depends on what is standing: the block above already takes it with `mt-auto` where
						there is a block, so this row simply follows it to the foot — two `mt-auto`s in one
						flex column split the space between them and would leave the account floating in the
						middle. Where there is no block (the session is still being read), the marks take
						the push themselves and close the column alone rather than sitting at its top.
						`flex-none` because the room this column has is not much: without it this row is the
						first thing the column takes back when the side above it wants room, and the marks
						squash instead of the column scrolling.
						Outside `{#if ready}`, since nothing about it waits on the polygons, and it never comes
						and goes for anything else either: it is the last thing in a panel that is folded to a
						strip by default, so a row arriving or leaving at the foot of it is a row moving the
						whole of what unfolds. A full view used to veil it with the rest of the chrome and no
						longer does (see CHROME_BLUR). -->
					<SocialLinks classes={classNames('flex-none', { 'mt-auto': !playerBlockShown })} />
				</div>
			</div>
		</div>
	</div>
</div>

<!-- The menu stood here for a while, as a full-height drawer docked to the map's right edge:
	a block of outlined buttons with the radio under it, summoned by the same burger. It is the
	column dropped from that burger now (see the `end` slot above), which is where the game's
	badge was already dropping two of these same views. -->

<!-- Hidden, but mounted: the claim panel, kept alive only
	to compute the window's booster packs (bind:packs) so a map box click can open the town's
	pack instantly. Its own UI is never shown here — but the reason a roll was refused is
	bound out of it, since without that a `claim_booster` refusal reads as a pack that opens
	onto nothing at all. What the window still holds is counted off the packs themselves. -->
<div class="hidden" aria-hidden="true">
	<CharacterClaimPanel {seededShowById} bind:packs={claimPacks} bind:claimError />
</div>

<!-- Combat is not drawn here. Challenge stages the fight and goes to `/combat`, which is the
	arena's own page (see stageFight and $services/combat) — every other full view in this game
	is a sheet raised over this page, and the fight is the one that is not.
	It was a modal here for a long while, and before that a fixed panel of its own over a
	30%-white wash. What took it out is that a fight is the whole of what the player is doing:
	the sheet covered the viewport, so the map behind it was a Leaflet canvas nobody could see,
	kept mounted and kept in step (the spotlight, the blurs, a timer to coordinate the two) for
	the sake of a town faintly showing through the foot of a gradient. A fight has an address
	now, so it can be linked to, reloaded into, and left by going back to the map — and this
	page is not standing behind it doing anything at all.
	What used to be raised and put away is a navigation each way, and the two things this page
	still owes the arena are handed over with it: the frozen line-up and the town's own plate.
	Everything a settled fight changes here is re-read by this page being walked back onto. -->

<!-- The roster is not here either: it went out to the layout when the fight left this page,
	because the arena's "no active team" card is one of the two things that raise it and the
	arena is no longer standing over this page to raise it with (see +layout.svelte). It is
	still opened from the Roster button on the row above the panel's card grid, through the
	same `rosterModalOpen`. -->

<!-- The album, on the same sheet and over the map like the roster. Mounted only while it is
	open, which is what keeps a cast of forty-odd sprites off every other page: the show
	mapping, the player's cards and the statues all arrive with the opening. Opened from the
	book in the views the game's badge dropped when it was a tab, through
	`collectionModalOpen`. -->
{#if $collectionModalOpen}
	<CollectionModal />
{/if}

<!-- Every show's standing across the map, on the same sheet. The tally is the map's own —
	counted over every municipality's current show, seeded or ruling — so it is handed in
	rather than read again here, and it is as fresh as the map behind it. It was a tab of the
	old side panel, three columns of table in a 450px column, then a button in the menu.
	Nothing raises it at the moment: the row that did has gone from the menu, and the store is
	left standing so that whatever raises it next has something to set. -->
{#if $leaderboardModalOpen}
	<LeaderboardModal rows={showStandings} />
{/if}

<!-- What the game gets asked, on the same sheet as the rest of them. Raised by the question
	mark at the far end of the page's top row, first of the two there. Mounted only while it is open, like
	its neighbours here, so a list nobody has asked for is not standing behind the map. Its
	content is the catalogue's — see FaqModal. -->
{#if $faqModalOpen}
	<FaqModal />
{/if}

<!-- Who made what the game is drawn out of, on the same sheet as the rest of them. Raised by
	the palette at the far end of the page's top row, beside the question mark. Mounted only while it
	is open, like its neighbours here. Its list is the character registry — see CreditsModal. -->
{#if $creditsModalOpen}
	<CreditsModal />
{/if}

<!-- The window's booster packs, on the same sheet, and the one view here that is not just a
	reading: a pack is picked, stood up and sliced open, and the cards it held stand up in its
	place. That is what took it out of the panel — it was doing all of it in a 450px column,
	two covers to a row.
	Everything it works from stays on this page: the packs the hidden claim panel assembles,
	the town a map box click narrowed it to (bound, so picking a cover in there and clicking a
	box out here move the one selection), the day's allowance and whatever the last roll said.
	Mounted only while it is open, so the opener is built on opening and goes with the close.
	Two ways in — the panel's Booster button, which lands on the grid of the whole window, and
	a click on the box standing on a festa town, which opens straight onto that town's pack. -->
{#if $boosterModalOpen}
	<BoosterModal
		packs={claimPacks}
		bind:selected={packTownId}
		windowLabel={packWindowLabel}
		{claimError}
		{lastRevealed}
		{townHasNoPack}
		single={packRaisedOnTown}
		on:select={clearPackFeedback}
		on:back={clearPackFeedback}
		on:openComplete={(event) => onPackOpened(event.detail)}
		on:close={() => boosterModalOpen.set(false)}
	/>
{/if}

<!-- A level box, on the same sheet as the window's — a column of shows, and picking one opens
	the box printed with that level (see LevelBoosterModal, which shares the whole of the sheet
	with the welcome box). It is here rather than out in the layout because the press that
	raises it is here: the square in the near corner of the strip over the terrain, which is the
	only way in. Mounted only while it is open, like every other sheet on this page, so the
	pool, the wordmarks and the opener's canvas are built on opening and go with the close. -->
{#if levelBoosterOpen}
	<LevelBoosterModal on:close={() => (levelBoosterOpen = false)} />
{/if}

<!-- Draws nothing: it clears the splash the shell put up, 500ms after this page mounts.
	Here rather than in the layout because the splash is the front door's and no other
	route's — the shell has already taken it down anywhere else — so both halves of it
	stand in the same place. -->
<SplashScreen />
