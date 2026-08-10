<script lang="ts">
	import { onMount } from 'svelte';
	import { authService } from '$services/auth.service';
	import { avatarService } from '$services/avatar.service';
	import { openSignIn } from '$services/signInModal';
	import { spawnService } from '$services/spawn.service';
	import { territoryService } from '$services/territory.service';
	import { errorMessage } from '$utils/error/error-message';
	import { avatarKey } from '$utils/spawn/avatar';
	import { ownedAvatarKeys, ownedSpawnKeys } from '$utils/spawn/owned';
	import { AuthStatus } from '$types/profile.type';
	import { SpawnBox, type ClaimableShow } from '$types/character-spawn.type';
	import type { GeoRegion } from '$types/location.type';
	import type { ShowEntry, ShowsCollection } from '$types/show.type';
	import { showPosterUrl, showPosterUrlForSeed } from '$utils/geo/municipality-show';
	import { holderShowIds, showIdsByCharacter } from '$utils/spawn/team-show';
	import { showLogoUrl } from '$utils/show/show-logo';
	import { catalanTodayIso, festesService } from '$services/festes.service';
	import type { RegionShow } from '$utils/geo/region-tree';
	import { buildClaimPull } from '$components/core/pack/claim-pull';
	import type { ClaimResult, OpenerPack } from '$components/core/pack/scene/opener-view.type';
	import type { FestaShowPair, FestaWindowRow } from '$types/festivity.type';
	import { boxForFesta, claimedBoxKey, festaYear } from '$utils/spawn/claimed-box';

	// The window's booster packs, assembled from the festes in range and surfaced to the
	// parent (`bind:packs`) so it can render the pack-grid canvas below this content.
	// Each carries its own poster cover and the roll it fires when sliced open.
	export let packs: OpenerPack[] = [];

	// The window's celebrating towns — every one holding its festa major from three days
	// back through four days ahead (the same range `claim_booster` accepts). Loaded on
	// mount; each is paired with a show below, and the pack grid renders one booster per
	// pair whose show this player can claim. Each carries the festa its box is printed
	// for — the nearest to today, as the RPC picks it — which is what says the box's
	// stock and its year, and so whether this player has already taken it.
	let windowFestes: FestaWindowRow[] = [];

	// Municipality id → the show its own geometry seeds it with, handed down by the map
	// (see `+page.svelte`'s `buildSeededShows`) rather than worked out again here: the
	// pool it is drawn from is every show with a cast, which is a Supabase read the map
	// already makes, and a box has to be printed with the show the pin beside it says.
	// It is what a town flies until somebody takes it (see `buildFestaPairs`), not
	// necessarily what it flies today. Empty until the map's own loads land, which
	// leaves the grid without packs rather than with wrong ones.
	export let seededShowById: ReadonlyMap<string, RegionShow> = new Map();

	// Today in Catalan time, which is what tells a white box from a black one: the window
	// hands each town the festa its box is printed for (the nearest to today, as
	// `claim_booster` picks it), and a box is white exactly when that festa is on. Read
	// once when the window lands rather than kept ticking — a player crossing midnight
	// with the sheet open reloads the window anyway.
	let todayIso = catalanTodayIso();

	const status = authService.status;
	const profile = authService.profile;
	// The player's collection, subscribed rather than fetched per open: a pack marks
	// what it gave as new or not against what was already held, and the answer has to
	// be read off the moment before the roll (see makeClaim).
	const spawns = spawnService.spawns;
	const avatars = avatarService.avatars;
	// Who holds which town — read, never loaded here (the map owns that call): it is
	// what decides the show a town's boxes are printed from, once it has been taken.
	const holders = territoryService.holders;

	let shows: ClaimableShow[] = [];
	let loadingShows = false;
	let showsError = '';

	// Saved show entry per show id, joined from shows.json (the admin enables each
	// show's posters there). Kept whole — not reduced to a single URL — so the pack
	// cover can be picked per location+year from the enabled set at open time.
	// Independent of auth, so loaded up front.
	let showEntryById = new Map<number, ShowEntry>();

	// The show currently being opened (locks out concurrent opens), plus the error
	// from the last open attempt, if any. `claimError` is bindable because a host that
	// only borrows this panel's packs (the map's booster tab renders the panel hidden,
	// for its packs alone) still has to be able to say why a pack opened to nothing —
	// every one of `claim_booster`'s refusals lands here, and a pack that reveals no
	// cards is otherwise indistinguishable from a bug.
	let claimingId: number | null = null;
	export let claimError = '';

	// Guards the one-time load so the reactive block doesn't refire on every store tick.
	let loadedForUser: string | null = null;

	// Per-character rarity tier from Supabase `character_templates`, so the revealed
	// card can show the claimed character's rarity. Empty until the shows load. It is the
	// one lookup a pull needs that is not the local registry's (see buildClaimPull, which
	// takes it and reads the rest out of @3xl/data for itself).
	let rarityByCharacter = new Map<string, number>();

	// The place the open pack is tied to, captured at claim time and shown on each
	// revealed card's location strip.
	let lastLocationName = '';

	// Every box this player has already taken, as (town, year, stock) keys — the
	// service's own store, so anything else drawing a box reads the same set. A town
	// deals two boxes a year and no more, and this is which of them are spent.
	const claimedBoxes = spawnService.claimedBoxes;

	onMount(() => {
		authService.init();
		void loadPosters();
		void loadWindowFestes();
	});

	// Load the window's celebrating municipalities (from Supabase, via the festes
	// service). Fetched once; a failure leaves the grid empty. Each town arrives with
	// the festa its box is printed for, which is the whole of what the box is — its
	// stock and its year — so nothing else has to be read to know which box a town is
	// offering. Pairing each with the show it actually flies is left to the reactive
	// derivation below, since that answer moves as towns change hands.
	async function loadWindowFestes() {
		try {
			todayIso = catalanTodayIso();
			windowFestes = await festesService.loadFestesForWindow();
		} catch {
			// The window stays empty: a grid with no packs, rather than wrong ones.
		}
	}

	// Load the saved-show collection (public JSON) and index each entry by show id
	// so the pack cover can be resolved from its enabled posters at open time.
	async function loadPosters() {
		try {
			const res = await fetch('/data/shows.json');
			if (!res.ok) return;
			const data = (await res.json()) as ShowsCollection;
			const map = new Map<number, ShowEntry>();
			for (const entry of data.shows) {
				map.set(entry.show.id, entry);
			}
			showEntryById = map;
		} catch {
			// Posters are optional — cards fall back to a placeholder.
		}
	}

	// Once a signed-in user is known, load the claimable shows once. A player signing out
	// takes their claims with them: the boxes they had taken are theirs and not this
	// browser's, and left standing they would grey out somebody else's window.
	$: currentUserId = $status === AuthStatus.SignedIn && $profile ? String($profile.id) : null;
	$: if (currentUserId && currentUserId !== loadedForUser) {
		loadedForUser = currentUserId;
		load();
	} else if (!currentUserId && loadedForUser) {
		loadedForUser = null;
		spawnService.forgetClaimedBoxes();
	}

	async function load() {
		loadingShows = true;
		showsError = '';
		try {
			const [showList, rarities] = await Promise.all([
				spawnService.loadShows(),
				// Rarity tiers label the revealed cards (the roll itself is server-side).
				spawnService.loadRarities()
			]);
			shows = showList;
			rarityByCharacter = rarities;
		} catch (error) {
			showsError = errorMessage(error);
		} finally {
			loadingShows = false;
		}
		void refreshClaimedBoxes();
		void loadCollection();
	}

	// What the player already holds — their cards and their avatars — which is the
	// whole of what "new" is read against when a pack opens (see makeClaim). Loaded
	// here rather than left to whichever surface happens to want it: this panel is the
	// one that opens packs, and a collection that had not arrived would mark every
	// card in the pack as new. Failures are swallowed and leave the stores as they
	// were; the marking is a reading of the reveal, not a rule, and a pack still opens.
	async function loadCollection(): Promise<void> {
		if (!currentUserId) return;
		await Promise.allSettled([
			spawnService.loadSpawns(currentUserId),
			avatarService.load(currentUserId)
		]);
	}

	// The boxes this player has already taken, re-read from the server (which is what
	// enforces the rule) so the grid can stand the spent ones down. Called when the
	// player is known and again after every open — the year a box is filed under is
	// the server's reading of the festivity calendar, not something the browser is
	// told back.
	async function refreshClaimedBoxes() {
		if (!currentUserId) return;
		try {
			await spawnService.loadClaimedBoxes(currentUserId);
		} catch {
			// Non-fatal: an unread claim leaves a box looking openable, and the server
			// refuses it with a sentence the panel already shows.
		}
	}

	// The pack cover for a show at a place: picked from that show's enabled posters by
	// hashing the place + year, so each location/year combo gets its own (stable)
	// cover. The year is "now" — the same year the pack and the spawn are stamped with.
	function resolvePosterUrl(show: ClaimableShow, claimRegion: GeoRegion): string | null {
		const entry = showEntryById.get(show.id);
		const seed = `${claimRegion.municipality ?? ''}|${new Date().getFullYear()}`;
		return entry ? showPosterUrlForSeed(entry, seed) : null;
	}

	// The show's wordmark for the foot of the pack, out of the same collection the cover
	// comes from. Not seeded like the poster is: a place gets its own cover because there
	// are many posters and one of them may as well be this town's, whereas a show has one
	// name and says it the same way everywhere.
	function resolveLogoUrl(show: ClaimableShow): string | null {
		const entry = showEntryById.get(show.id);
		return entry ? showLogoUrl(entry) : null;
	}

	// Build the roll one grid pack fires when the player slices it open — a closure
	// bound to its show + place. The Supabase roll persists what it gives at open time
	// (not when the pack is picked) and returns it to reveal — the cards, and the one
	// avatar the box dealt (nothing at all on failure, which reveals nothing). Both
	// rules (a festa major inside the booster window, and one box per town, year and
	// stock) are enforced server-side by the claim_booster RPC. Opening a box earns no
	// experience — that comes from winning fights only (see award_combat_exp).
	function makeClaim(show: ClaimableShow, claimRegion: GeoRegion): () => Promise<ClaimResult> {
		return async () => {
			const nothing: ClaimResult = { pulls: [], avatar: null, avatarIsNew: false };
			if (!currentUserId || !claimRegion.id) return nothing;
			claimingId = show.id;
			claimError = '';

			// What the player held a moment ago, frozen before the roll — the whole of what
			// "new" is read against. It has to be taken here and not after: the claim folds
			// its own cards into the collection the instant it answers, and a set read then
			// would find every card in the pack already owned, by itself. Two cards of the
			// same thing in one pack are therefore both new, which is the truth about the
			// pack rather than about the second card.
			const heldCards = ownedSpawnKeys($spawns);
			const heldAvatars = ownedAvatarKeys($avatars);

			try {
				const opening = await spawnService.claimBooster(show.id, claimRegion.id);
				// This box is spent now: re-read the claims so it stands down, here and
				// wherever else it is drawn.
				void refreshClaimedBoxes();

				// The avatar joins the player's collection here rather than in the spawn
				// service: the avatars are that service's, and this is the one place a new
				// one arrives outside a fresh load. A repeat replaces the row it already
				// held, so the collection does not grow on a colour already owned.
				if (opening.avatar) avatarService.remember(opening.avatar);

				// Capture the place and resolve each portrait so the revealed cards carry
				// the character's face and the town it was claimed in.
				lastLocationName = claimRegion.municipality ?? '';
				return {
					pulls: await Promise.all(
						opening.spawns.map((spawn) =>
							buildClaimPull(spawn, {
								rarityByCharacter,
								showName: show.name,
								locationName: lastLocationName,
								held: heldCards
							})
						)
					),
					avatar: opening.avatar,
					avatarIsNew: opening.avatar
						? !heldAvatars.has(avatarKey(opening.avatar.characterId, opening.avatar.color))
						: false
				};
			} catch (error) {
				claimError = errorMessage(error);
				return nothing;
			} finally {
				claimingId = null;
			}
		};
	}

	// --- Which show a town's boxes deal ------------------------------------------
	// The same answer the map paints its pins with (see `+page.svelte`'s "Which show a
	// town flies"), asked here for the boxes: a town deals boosters of the show it
	// flies, which is the build's seed until somebody takes the town and its
	// conqueror's from then on. Derived rather than stored, so a siege re-stocks the
	// town's boxes the moment the holders reload — nothing is re-fetched and no
	// assignment is written anywhere.

	// character id → the shows it belongs to, reversed out of the claimable pool this
	// panel already loads (the same `show_characters` assignment the map reads).
	$: showsByCharacter = showIdsByCharacter(
		new Map(shows.map((show) => [show.id, show.characterIds]))
	);

	// Municipality id → the show its occupying team flies: the sitting lead's show, for
	// every town somebody holds. The holders are the map's own load — this panel is
	// mounted inside it and shares the store rather than fetching them a second time —
	// so the derivation re-runs as the map reloads territory after a fight.
	$: rulingShowIds = holderShowIds($holders.values(), showsByCharacter);

	// The window's (festa, show) pairs: the seeded show per town, overridden by the
	// ruling one wherever a player holds it. A ruling show absent from the authored
	// collection cannot be drawn as a box, so that town keeps its seeded show rather
	// than dropping out of the grid — the same fallback the map's pins make.
	function buildFestaPairs(
		festes: FestaWindowRow[],
		seeded: ReadonlyMap<string, RegionShow>,
		ruling: ReadonlyMap<string, number>,
		saved: ReadonlyMap<number, ShowEntry>
	): FestaShowPair[] {
		return festes.map((festa) => {
			const rulingId = ruling.get(festa.id);
			const entry = rulingId == null ? undefined : saved.get(rulingId);
			const flown: RegionShow | undefined = entry
				? { id: entry.show.id, name: entry.show.name, posterUrl: showPosterUrl(entry) }
				: undefined;
			return { festa, show: flown ?? seeded.get(festa.id) };
		});
	}

	$: festaPairs = buildFestaPairs(windowFestes, seededShowById, rulingShowIds, showEntryById);

	// Assemble the window's grid packs from the festes in range: one booster per
	// celebrating town whose show this player can claim. Each pack carries its
	// poster cover, whether its box is still there to open, and a roll bound to that
	// show + place. Empty when signed out or before the show pool loads. Kept as a pure
	// function of its inputs so the reactive block below re-runs when any of them
	// change.
	function computePacks(
		festaPairs: FestaShowPair[],
		showPool: ClaimableShow[],
		_posters: Map<number, ShowEntry>,
		today: string,
		spent: ReadonlySet<string>,
		userId: string | null
	): OpenerPack[] {
		if (!userId) return [];
		const claimableById = new Map(showPool.map((show) => [show.id, show]));
		const out: OpenerPack[] = [];
		for (const { festa, show } of festaPairs) {
			if (!show) continue;
			const claimable = claimableById.get(show.id);
			if (!claimable) continue;
			const claimRegion: GeoRegion = {
				id: festa.id,
				municipality: festa.name,
				province: festa.prov ?? '',
				country: festa.territory ?? ''
			};
			// Which of the town's two boxes this is, and whether it is still there: the
			// same three things the server works out for itself (see `claimed-box`), read
			// off the festa this town's box is printed for.
			const box = boxForFesta(festa.date, today);
			out.push({
				id: festa.id,
				coverUrl: resolvePosterUrl(claimable, claimRegion),
				logoUrl: resolveLogoUrl(claimable),
				locationName: festa.name,
				label: claimable.name,
				showId: claimable.id,
				today: festa.date === today,
				light: box === SpawnBox.White,
				claimed: spent.has(claimedBoxKey(festa.id, festaYear(festa.date), box)),
				claim: makeClaim(claimable, claimRegion)
			});
		}
		return out;
	}

	// The window's grid packs, recomputed whenever the window's festes, the claimable
	// show pool, the enabled posters, the day, the boxes already taken or the signed-in
	// user change. (All six are named here so the reactive statement actually re-runs when
	// any of them updates.)
	$: packs = computePacks(festaPairs, shows, showEntryById, todayIso, $claimedBoxes, currentUserId);
</script>

<div class="card w-full bg-base-100 shadow-xl">
	<div class="card-body gap-4">
		<h1 class="card-title">Claim a character</h1>

		{#if !authService.configured}
			<div class="alert alert-warning text-sm">
				<span>Sign-in is unavailable — Supabase is not configured.</span>
			</div>
		{:else if $status === AuthStatus.Loading}
			<div class="flex justify-center py-6">
				<span class="loading loading-spinner loading-md"></span>
			</div>
		{:else if $status !== AuthStatus.SignedIn}
			<p class="text-sm opacity-70">
				Sign in to spawn a random character from your shows.
			</p>
			<button class="btn btn-primary btn-sm" on:click={openSignIn}>Sign in</button>
		{:else}
			<p class="text-sm opacity-70">
				Pick a town celebrating its festa major this week, below — from three days back
				through four days ahead — to open its booster. Each town deals you two boxes a year
				and no more: the white one on the day of its festa, the black one around it. The
				spawn is saved to your account, tagged with that place.
			</p>

			{#if showsError}
				<div class="alert alert-error text-sm"><span>{showsError}</span></div>
			{:else if loadingShows}
				<div class="flex items-center gap-2 text-sm opacity-70">
					<span class="loading loading-spinner loading-xs"></span>
					Loading your shows…
				</div>
			{:else if shows.length === 0}
				<div class="alert alert-info text-sm">
					<span>No shows with characters have been synced yet. Check back later.</span>
				</div>
			{/if}

			{#if claimError}
				<div class="alert alert-error text-sm"><span>{claimError}</span></div>
			{/if}
		{/if}
	</div>
</div>
