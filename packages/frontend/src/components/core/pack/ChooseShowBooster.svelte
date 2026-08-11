<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { _, locale } from 'svelte-i18n';
	import FullScreenModal from '$components/core/FullScreenModal.svelte';
	import BoosterModal from '$components/core/BoosterModal.svelte';
	import ShowIcon from '$components/core/ShowIcon.svelte';
	import { buildClaimPull } from '$components/core/pack/claim-pull';
	import { authService } from '$services/auth.service';
	import { avatarService } from '$services/avatar.service';
	import { spawnService, type BoosterOpening } from '$services/spawn.service';
	import { errorMessage } from '$utils/error/error-message';
	import { avatarKey } from '$utils/spawn/avatar';
	import { ownedAvatarKeys, ownedSpawnKeys } from '$utils/spawn/owned';
	import { showGlyphs } from '$services/shows.service';
	import { forShow } from '$utils/show/show-icon';
	import { showLogoUrl } from '$utils/show/show-logo';
	import { showPosterUrl } from '$utils/geo/municipality-show';
	import type { ClaimableShow } from '$types/character-spawn.type';
	import type { ShowEntry, ShowsCollection } from '$types/show.type';
	import type { ClaimResult, OpenerPack } from '$components/core/pack/scene/opener-view.type';

	// A box that is opened on a show the player picks, rather than on the town it stands on.
	//
	// Every box printed for a festa major is a town's: the town decides its cover, its cast and
	// its year, and all a player does is find it. Two boxes belong to no town at all — the
	// welcome, dealt once on arriving, and the level boxes, one for every level reached — and
	// what those two have in common is exactly this sheet: there is no polygon underneath to
	// name a show, so the player is asked, and the asking IS the opening.
	//
	// So the sheet is one list: the shows, down a single column, each said by its own wordmark.
	// Picking one opens the box — the box is not drawn on this half at all and there is nothing
	// to confirm, because a box printed with a show the player has just chosen has nothing left
	// to tell them, and the sheet it is opened on (the very one a town's box is opened on)
	// stands it up full size in the next breath.
	//
	// What differs between the two boxes is what this takes as props: what it is called, the
	// word the box carries where a town and a year would go, which stock it is printed on, and
	// the RPC that actually deals it. Everything else — the pool, the wordmarks, the rarity
	// tiers, the reveal, what counts as a card the player did not already hold — is the same
	// answer to the same question, and is here once.
	//
	// It is mounted while it is up and unmounted when it is done, like every other sheet in
	// this app: the loads below are a mount's worth of work, so a player who is not being
	// offered a box pays for none of it.

	/** What the sheet is called — its heading, and its name to a screen reader. */
	export let title: string;
	/** What the title bar says, where that is not the heading under it. The bar and the
	 * heading are inches apart, so a caller with something else to say up there — how many
	 * boxes are still owed, say — says it here rather than printing one sentence twice.
	 * Unset, the bar is the heading, which is what a box that has nothing else to say wants. */
	export let barTitle: string = '';
	/** The line under that heading: what this box is and what picking a show will do. */
	export let intro: string;
	/** The box's id on the opener's sheet. One box is stood up there, so this only has to be
	 * stable across the open — it is the claim's own sentinel location. */
	export let boxId: string;
	/** Said across the head of the box in place of a town and a year (`Benvinguda`,
	 * `Nivell 7`), and said again by every card it deals as the place it came from. */
	export let caption: string;
	/** Printed on white card rather than black — the stock, which is what decides the three
	 * colours inside. Read here only for the drawing; the server prints its own. */
	export let light: boolean = false;
	/**
	 * Hold the sheet shut until the box has been opened: no ✕, no Escape, no way out.
	 *
	 * For a box that is a *gate* rather than an offer — the welcome, which is the whole of
	 * what the game is doing until it is taken. A box a player summoned for themselves is not
	 * one of those, and closes like anything else they opened.
	 */
	export let locked: boolean = false;
	/**
	 * Deal the box, on the show the player picked. The one thing about this sheet that is
	 * different per box, and deliberately the *only* thing: what a claim then means — a
	 * snapshot of what was held, five cards labelled against it, an avatar put on somebody
	 * wearing nothing — is the same for every box there is, and is below.
	 */
	export let claim: (showId: number) => Promise<BoosterOpening>;

	const dispatch = createEventDispatcher<{ close: void }>();

	const profile = authService.profile;
	// The player's collection, subscribed rather than fetched per open: the box marks what it
	// gave as new or not against what was held a moment before it (see `open`).
	const spawns = spawnService.spawns;
	const avatars = avatarService.avatars;

	// Where this sheet has got to. `choosing` is the column of shows, `opening` is the booster
	// sheet over it — and the second is held to the end of the reveal whatever the host thinks,
	// because what is on screen then is the cards, and a sheet that closed on its own claim
	// landing would take them away as they arrived.
	let phase: 'choosing' | 'opening' = 'choosing';

	// The shows this box may be asked for: every show with at least one renderable character
	// cast in it — the same pool a town's box rolls from — since what the player is choosing is
	// the roster the five cards come out of, not a decoration.
	let shows: ClaimableShow[] = [];
	let showEntryById = new Map<number, ShowEntry>();
	let loading = false;
	let loadError = '';

	// Per-character rarity tier, for labelling the cards the box reveals.
	let rarityByCharacter = new Map<string, number>();

	// Why the claim was refused, and how many cards it revealed — the two things the booster
	// sheet says over its canvas, exactly as the map page says them for the window.
	let claimError = '';
	let lastRevealed: number | null = null;

	// The box being opened, built at the moment its show was picked. The column is gone from
	// the screen by then; what is being sliced open must not be re-derived under it.
	let openingPack: OpenerPack | null = null;

	// Guards the one load per player. Not per mount: a sheet raised, closed and raised again is
	// two mounts, and each of them is a player being offered a box.
	let loadedFor: string | null = null;

	$: userId = $profile ? String($profile.id) : null;

	// What the sheet needs: the shows on offer, their wordmarks and posters, the rarity tiers
	// its cards are labelled with, and the collection "new" is read against.
	$: if (userId && userId !== loadedFor) {
		loadedFor = userId;
		void load(userId);
	}

	// Signed out with a sheet up is a sheet about nobody. It goes, and the host puts it away.
	$: if (!userId && loadedFor) dispatch('close');

	async function load(id: string): Promise<void> {
		loading = true;
		loadError = '';
		try {
			const [showList, rarities] = await Promise.all([
				spawnService.loadShows(),
				spawnService.loadRarities()
			]);
			shows = showList;
			rarityByCharacter = rarities;
		} catch (error) {
			loadError = errorMessage(error);
		} finally {
			loading = false;
		}
		await loadShowImages();
		// The collection as it stands, so the reveal can mark what the box actually added.
		// Failures leave the stores as they were: the marking is a reading of the reveal and
		// not a rule, and the box still opens.
		await Promise.allSettled([spawnService.loadSpawns(id), avatarService.load(id)]);
	}

	// The saved-show collection, for the wordmark each show is said by here and the poster its
	// box is covered in once one is picked. Optional, both of them: a show with neither is
	// still on the list, named in lettering, and its box is a plain frame — which is what every
	// other surface does with a show the author has enabled no images for.
	async function loadShowImages(): Promise<void> {
		try {
			const response = await fetch('/data/shows.json');
			if (!response.ok) return;
			const collection = (await response.json()) as ShowsCollection;
			const byId = new Map<number, ShowEntry>();
			for (const entry of collection.shows) byId.set(entry.show.id, entry);
			showEntryById = byId;
		} catch {
			// Images are optional — the row falls back to the show's name.
		}
	}

	// The column, in the order the pool arrives in (show name), each show joined to the two
	// pictures its box is printed from. Both may be missing and the show is still offered:
	// what is being chosen is a cast, and a show with a cast has to be reachable.
	$: offers = shows.map((show) => {
		const entry = showEntryById.get(show.id) ?? null;
		return {
			show,
			logoUrl: entry ? showLogoUrl(entry) : null,
			coverUrl: entry ? showPosterUrl(entry) : null
		};
	});

	/**
	 * The one box, as the opener wants it: the caption where a town and a year would be, the
	 * stock it is printed on, and the roll it fires when it is sliced open.
	 */
	function buildPack(offer: (typeof offers)[number]): OpenerPack {
		return {
			id: boxId,
			coverUrl: offer.coverUrl,
			logoUrl: offer.logoUrl,
			locationName: null,
			caption,
			label: offer.show.name,
			showId: offer.show.id,
			// It belongs to no festa, so it is celebrating nothing today; the stock is said in
			// its own right (see OpenerPack's `light`).
			today: false,
			light,
			claimed: false,
			claim: () => deal(offer.show)
		};
	}

	/**
	 * Open the box on `show`, and hand back what to reveal.
	 *
	 * One thing happens here that a town's box does not do. A box chosen this way may well be
	 * the first a player has ever opened — the welcome always is — so if they are still on the
	 * initial-letter avatar, the portrait it dealt is put on straight away rather than left in
	 * a picker they have not found yet. It is only ever done for somebody wearing nothing: an
	 * avatar already chosen is a choice, and a box does not overrule one.
	 */
	async function deal(show: ClaimableShow): Promise<ClaimResult> {
		const nothing: ClaimResult = { pulls: [], avatar: null, avatarIsNew: false };
		if (!userId) return nothing;
		claimError = '';

		// What the player held a moment ago, frozen before the roll — the whole of what "new"
		// is read against, and it has to be taken here: the claim folds its own cards into the
		// collection the instant it answers.
		const heldCards = ownedSpawnKeys($spawns);
		const heldAvatars = ownedAvatarKeys($avatars);
		// And whether they are wearing anything, for the same reason: the avatar this box deals
		// is about to be one they hold.
		const wearsNothing = !$profile?.avatarCharacterId;

		try {
			const opening = await claim(show.id);
			if (opening.avatar) {
				avatarService.remember(opening.avatar);
				if (wearsNothing) {
					// A refusal here is not a refusal of the box: the cards and the portrait are
					// dealt and kept either way, and what is lost is only that it was put on for
					// them. The picker is still where it was.
					await authService
						.setAvatar(opening.avatar.characterId, opening.avatar.color)
						.catch(() => {});
				}
			}
			return {
				pulls: await Promise.all(
					opening.spawns.map((spawn) =>
						buildClaimPull(spawn, {
							rarityByCharacter,
							showName: show.name,
							locationName: caption,
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
		}
	}

	/** Picking a show IS opening the box: the sheet the map's boxes are opened on comes up with
	 * this one stood up in it, and the roll fires when it is tapped there. */
	function open(offer: (typeof offers)[number]): void {
		claimError = '';
		lastRevealed = null;
		openingPack = buildPack(offer);
		phase = 'opening';
	}
</script>

{#if phase === 'choosing' && $locale}
	<!-- A gate is bare, and titled by this content rather than by the sheet's own bar: the bar's
		✕ is the sheet's one way out and there is no way out of that one, so a bar drawn on it
		would be a bar whose only control is greyed. A box the player summoned keeps its bar and
		its ✕ — it was asked for, so it can be walked away from. The title is given either way,
		and is what the sheet is called to a screen reader — `barTitle` where the caller has
		something of its own for the bar, the heading otherwise. -->
	<FullScreenModal
		title={barTitle || title}
		closeLabel={$_('booster.choose.close')}
		bare={locked}
		closeDisabled={locked}
		on:close={() => dispatch('close')}
	>
		<!-- What is on this sheet is two things — what it says, and what it is asking to be
			picked — and the room left over is shared out evenly between and around them rather
			than being given to either. So the two blocks each take exactly the height they come
			to and the gaps above, between and below are equal, which puts the pair in the middle
			of the sheet without either being stretched to get them there. Nothing here is
			`flex-1` for that reason: one item soaking up the free space is one item there is no
			free space left to distribute. A pool too long for the sheet leaves none to share out
			either way, and the column below shrinks and scrolls (see the note on it). -->
		<div class="flex min-h-0 flex-1 flex-col justify-evenly gap-4 p-4 sm:p-6">
			<div class="flex flex-none flex-col items-center gap-1 text-center">
				<h2 class="text-xl font-bold">{title}</h2>
				<p class="max-w-md text-sm opacity-70">{intro}</p>
			</div>

			{#if loadError}
				<div class="alert alert-error flex-none py-2 text-xs" role="alert">
					<span>{loadError}</span>
				</div>
			{/if}

			{#if loading}
				<div class="flex flex-none items-center justify-center">
					<span class="loading loading-spinner loading-lg opacity-60"></span>
				</div>
			{:else if !offers.length}
				<div class="flex flex-none items-center justify-center p-6 text-center">
					<p class="max-w-xs text-sm opacity-60">{$_('booster.choose.noShows')}</p>
				</div>
			{:else}
				<!-- The shows, one under the next, each said by its own wordmark — the lettering
					the series is known by, which is how a show says its own name; a show whose
					author has enabled none is named in type rather than left off, since what is
					being chosen is the cast the cards come out of.
					Each mark sits on the same dark plate the album's show filter stands them on
					(see CollectionModal): a wordmark is coloured lettering with a light outline,
					drawn to be read off a poster or off black card, and on a bare page the pale
					ones vanish. One column and a capped width because these are read down rather
					than scanned across, and a scroll box because the pool is however many shows
					have a cast.

					The column is as tall as its marks come to and no taller — where it sits on the
					sheet is the sheet's to settle (see the even sharing-out above), not something
					this block gets by stretching. It can still shrink, which is what `min-h-0`
					is for: a pool longer than the sheet has room for is scrolled inside this box
					rather than pushing the lettering above it off the top.

					One column on a phone and two from `sm:` up, in twice the width. A phone has
					one column of room and that is the end of it; anything wider was reading a
					single file of plates down the middle of a sheet with both halves empty, and
					the marks were being made no larger by all that space because a mark is a
					share of its own row. Twice the width and twice the columns is therefore the
					same row at the same size, with half as far to scroll — the plates keep their
					proportions and it is the emptiness that goes. Grid and not a wrapping flex
					row because these are two columns and not a paragraph of tiles: a grid track
					is the same width whatever lands in it, and the last row of an odd pool leaves
					its second cell empty rather than stretching one plate across the sheet. -->
				<div class="min-h-0 min-w-0 overflow-y-auto">
					<ul
						class="mx-auto flex w-full max-w-sm flex-col gap-2 sm:grid sm:max-w-3xl sm:grid-cols-2"
					>
						{#each offers as offer (offer.show.id)}
							{@const glyph = forShow($showGlyphs, offer.show.id)}
							<li class="flex-none">
								<!-- No height of its own: the row is as tall as the mark in it comes to.
									A wordmark is lettering and its proportions are its own — the saved ones
									run from a long thin banner to something nearly square — so a row of a
									fixed height would have been a row where the width was decided by the
									height, and the marks came out at wildly different widths as a result.
									The width is what is said here and the height is what follows. -->
								<!-- Pointed at, the plate itself answers: the dark ground fades to the theme's
									primary and the two glyphs bracketing the lettering fade to its secondary, both
									on the plate's own `transition`. It was a ring drawn round the row instead — a
									line arriving outside the plate, which is a second shape appearing beside the
									one being pointed at rather than the thing being pointed at answering. A plate
									that changes colour is that answer, and the pair of marks changing with it is
									what says the whole row is the press and not the lettering in the middle of it.
									`group` so the marks hear about a hover on the plate they stand on. -->
								<button
									type="button"
									class="group flex w-full cursor-pointer items-center justify-between overflow-hidden rounded-box bg-black/40 px-3 py-3 text-white/80 transition hover:bg-primary"
									title={offer.show.name}
									aria-label={$_('booster.choose.open', {
										values: { show: offer.show.name }
									})}
									on:click={() => open(offer)}
								>
									<!-- The show's own mark, at both ends of its row: the very glyph the map
										pins that show with, the statue paints across its floor and the box
										stamps on its lid. Twice and not once because the row is a plate with
										a wordmark centred on it, and one mark at one end would hang the whole
										row off that side; a pair brackets the lettering the way the box's own
										two grounds bracket its poster.

										A tenth of the row apiece and square, so the three things on the row are
										measured the one way: everything here is given a share of the width and
										takes whatever height that share earns it. A glyph is artwork drawn in
										a square, so a width is the whole of what it needs; the two of them
										with the wordmark's half between come to seven tenths, and the three
										left over are what `justify-between` opens as the two gaps.

										The space is kept whether or not there is a mark to put in it: a show
										with no glyph picked goes unbadged (which is the rule everywhere a show
										is badged — there is no stand-in mark) but its lettering still stands
										where every other show's does. -->
									<span class="aspect-square w-[10%] flex-none transition group-hover:text-secondary">
										<ShowIcon
											markup={glyph}
											classes="h-full w-full justify-center [&>svg]:h-full [&>svg]:w-full"
										/>
									</span>

									{#if offer.logoUrl}
										<!-- The mark is read at a width and not at whatever size it happens to
											have been drawn at: half the room inside the row. Every wordmark is
											therefore drawn to the same width, which is the whole point — the
											saved ones have no proportions in common, and anything that fixed
											their height instead let the width be decided by the lettering and
											came out wildly uneven down the column.

											Nothing caps the height: it is the width's to decide (the preflight
											leaves an image given a width its automatic height), and the row is
											as tall as the tallest thing on it comes to — this, all but always, a
											glyph a tenth of the width being only a tenth tall. -->
										<img src={offer.logoUrl} alt={offer.show.name} class="w-1/2" />
									{:else}
										<span class="truncate text-lg font-bold">{offer.show.name}</span>
									{/if}

									<!-- The mark again, closing the row. Sized exactly as its twin above and
										for the reasons given there — the pair is one bracket, so the two are
										the same square or they are not a pair. -->
									<span class="aspect-square w-[10%] flex-none transition group-hover:text-secondary">
										<ShowIcon
											markup={glyph}
											classes="h-full w-full justify-center [&>svg]:h-full [&>svg]:w-full"
										/>
									</span>
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	</FullScreenModal>
{:else if phase === 'opening' && openingPack}
	<!-- The very sheet a town's box is opened on, handed one box instead of a window: the box is
		stood up, sliced open, and the cards it held stand up in its place. `single` gives the
		sheet over to that one box, and `closeLocked` holds it shut until the box has actually
		come apart — after which the whole sheet is the way out, as it is for every other box
		that has been opened. A box that was summoned rather than given is not held shut at all:
		it can be put down again unopened, exactly as it could a moment ago on the column. -->
	<BoosterModal
		packs={[openingPack]}
		selected={boxId}
		{claimError}
		{lastRevealed}
		single
		closeLocked={locked}
		on:openComplete={(event) => (lastRevealed = event.detail)}
		on:close={() => dispatch('close')}
	/>
{/if}
