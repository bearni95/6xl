<script lang="ts">
	import classNames from 'classnames';
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { characters, type CharacterOption } from '@3xl/data';
	import { authService } from '$services/auth.service';
	import { collectionModalOpen } from '$services/collectionModal';
	import { spawnService } from '$services/spawn.service';
	import { showLogos, loadShowLogos } from '$services/shows.service';
	import { AuthStatus } from '$types/profile.type';
	import { DEFAULT_RARITY } from '$types/character-template.type';
	import type { CharacterSpawn } from '$types/character-spawn.type';
	import CharacterStatue from '$components/core/CharacterStatue.svelte';
	import FullScreenModal from '$components/core/FullScreenModal.svelte';

	// The album: every card the game holds, as one grid five across, with the shows the game
	// has named down the left of it. It is the counterpart of the roster, which is the cards a
	// player has: here the set is the whole set whatever they hold, and what holding one does
	// is bring its statue up to full strength.
	//
	// So a character appears once per show they are cast in and not once altogether: what a
	// cell says is "this fighter, out of this show", which is the pair a booster is rolled on
	// and therefore the pair there is something to own.
	//
	// The statues are the roster's own component with no colour handed to it: a cell is about
	// a character and not about a copy, and there is no copy to read a colour off (see
	// CharacterStatue's `color`). Dark grey card, white lettering — which is also what keeps an
	// unowned one legible at half strength, a colour dimmed by half being a different colour.
	//
	// Like every other full view it is only mounted while it is open, so the show mapping, the
	// player's cards and forty-odd sprites all arrive with the opening and go with the close.

	function close(): void {
		collectionModalOpen.set(false);
	}

	// Five to a row, whatever the sheet's width and whatever the cells are of: the album is one
	// grid, so its rhythm is a count and not something measured off the cards. What that width
	// leaves after the column of shows is shared out between the five.
	const STATUE_GRID = 'grid-cols-5';

	const status = authService.status;
	const profile = authService.profile;
	const spawns = spawnService.spawns;

	// The registry is what can actually be drawn, so it is what the album is built from: a
	// character assigned to a show upstream but not imported here has no art to stand up and
	// is simply not in the set.
	const charactersById = new Map<string, CharacterOption>(
		characters.map((character) => [character.id, character])
	);

	// character id → the shows it is cast in, which is the assignment the admin `/characters`
	// screen makes and the same one the roster reads.
	let characterShows = new Map<string, { id: number; name: string }[]>();
	// character id → its rarity tier, out of the same `character_templates` the claim reads:
	// the tier is Supabase's, authored in the admin, and nothing in the local registry carries
	// it. A character the table has nothing to say about stands at DEFAULT_RARITY.
	let rarityByCharacter = new Map<string, number>();
	let loading = true;
	let error = '';

	onMount(() => authService.init());
	// The logos the left column is lettered with — the same collection the roster's show
	// filter draws its chips from, and the same one fetch shared with every statue standing.
	onMount(() => void loadShowLogos());
	onMount(() => void loadShows());

	async function loadShows(): Promise<void> {
		loading = true;
		error = '';
		try {
			// Both together: the tiers are what the cast is ordered by, so a set standing
			// before them has arrived is a set in an order it is about to leave.
			const [shows, rarities] = await Promise.all([
				spawnService.loadCharacterShows(),
				spawnService.loadRarities()
			]);
			characterShows = shows;
			rarityByCharacter = rarities;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	// The player's cards, loaded here as well as by the roster: the album can be the first
	// thing opened in a session, and the set has to be able to say what is already held.
	// Guarded so the reactive statement does not re-fetch on every tick.
	let loadedForUser: string | null = null;
	$: currentUserId = $status === AuthStatus.SignedIn && $profile ? String($profile.id) : null;
	$: if (currentUserId && currentUserId !== loadedForUser) {
		loadedForUser = currentUserId;
		void spawnService.loadSpawns(currentUserId).catch(() => {});
	}

	// The album's rows: one per show that has a renderable cast, the show's name deciding the
	// order and each cast standing rarest first — the run of a show reads as a ladder down from
	// what is hardest to pull, which is the one thing a set of cards is graded by. Nothing here
	// is claimed, so there is no claim order for it to be in; two fighters on the same tier are
	// alphabetical, since a tie has to break somewhere and a name is the only other thing a cell
	// says. A character the tiers do not name sorts as DEFAULT_RARITY rather than as nothing, so
	// an album standing before the tiers arrive is the same album re-graded and not re-shuffled.
	$: showRows = ((
		shows: Map<string, { id: number; name: string }[]>,
		rarities: Map<string, number>
	) => {
		const byShow = new Map<number, { id: number; name: string; cast: CharacterOption[] }>();
		for (const [characterId, entries] of shows) {
			const character = charactersById.get(characterId);
			if (!character) continue;
			for (const show of entries) {
				const row = byShow.get(show.id) ?? { id: show.id, name: show.name, cast: [] };
				row.cast.push(character);
				byShow.set(show.id, row);
			}
		}
		const rarityOf = (character: CharacterOption) =>
			rarities.get(character.id) ?? DEFAULT_RARITY;
		for (const row of byShow.values())
			row.cast.sort(
				(a, b) => rarityOf(b) - rarityOf(a) || a.label.localeCompare(b.label)
			);
		return [...byShow.values()].sort((a, b) => a.name.localeCompare(b.name));
	})(characterShows, rarityByCharacter);

	// --- The show filter ------------------------------------------------------------------
	// Which show the grid is narrowed to, or ANY for the whole set. Same gesture as the
	// roster's own chips: press a show to filter to it, press it again to let go — which is
	// the only way back to every show, there being no option that says so.
	const ANY = '' as const;
	let filterShow: number | typeof ANY = ANY;

	function toggleShowFilter(showId: number): void {
		filterShow = filterShow === showId ? ANY : showId;
	}

	/** One show's chip in the column — its lettering over how much of it has been collected —
	 * ringed while it is the one being filtered on. Unringed is the only thing that says a chip
	 * is not the one picked: a wordmark held at less than full strength is a wordmark drawn
	 * wrong. The ring is on the whole chip rather than on the band inside it, the bar under the
	 * lettering being part of what is pressed. */
	function showChipClasses(showId: number, active: number | typeof ANY): string {
		return classNames(
			'flex w-full flex-none flex-col gap-1 rounded-md p-1 transition',
			'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
			{ 'ring-2 ring-base-content ring-offset-1 ring-offset-base-100': active === showId }
		);
	}

	// Every pair the player holds a copy of, as `character|show`. A card that does not say
	// which show it came out of — one rolled across all of them — is a copy of that character
	// and nothing more, so it is recorded under `*` and stands for them wherever they are cast
	// rather than for nowhere at all.
	$: ownedPairs = ((all: CharacterSpawn[]) => {
		const held = new Set<string>();
		for (const spawn of all) held.add(`${spawn.characterId}|${spawn.showId ?? '*'}`);
		return held;
	})($spawns);

	// The shows as the column draws them: each with how much of its cast the player has and how
	// big that cast is. Counted over the show's own characters rather than over the player's
	// cards, so a fighter pulled six times is one of them collected and not six — the album is
	// a set, and the bar under a logo says how much of the set is in.
	$: showTiles = ((
		rows: { id: number; name: string; cast: CharacterOption[] }[],
		held: Set<string>
	) =>
		rows.map((row) => ({
			...row,
			held: row.cast.filter(
				(character) =>
					held.has(`${character.id}|${row.id}`) || held.has(`${character.id}|*`)
			).length,
			total: row.cast.length
		})))(showRows, ownedPairs);

	// The whole album as one figure: every cell there is, and how many of them are in. Cells
	// rather than characters, so a fighter cast in two shows is two things to collect — which
	// is what the grid says, and the column beside it is the same set read as one bar. It is
	// the sum of the shows' own counts and not a second reckoning of the holdings, so the
	// column and the chips can never disagree about the same cards.
	$: albumTotals = ((tiles: { held: number; total: number }[]) =>
		tiles.reduce(
			(sum, tile) => ({ held: sum.held + tile.held, total: sum.total + tile.total }),
			{ held: 0, total: 0 }
		))(showTiles);
	// How much of the bar is filled. Nothing collected out of nothing is empty rather than
	// full: an album with no cells in it has not been finished.
	$: albumPercent = albumTotals.total > 0 ? (albumTotals.held / albumTotals.total) * 100 : 0;

	// The album as it is drawn: one flat run of cells, a show's whole cast before the next
	// show's, each carrying the one thing the set has to say about it — whether the player
	// holds it. Flat because the grid is one grid: a row per show gave every show a row of its
	// own however few it had in it, so the set was read as a stack of ragged strips rather than
	// as a sheet of cards. Which show a cell is of is still on the cell, painted across the
	// statue's own floor, so nothing is lost by the shows no longer being the layout.
	//
	// Answered here rather than by a helper the markup calls, because a call in the template
	// names only the function — the cards arriving after the mount would have changed nothing on
	// screen. The rows, the holdings and the filter are all named as arguments for the same
	// reason.
	//
	// A show picked in the column drops every cell that is not of it, which is also what keeps
	// the sheet cheap: a filtered album stands up one show's cast rather than the whole set.
	$: albumCells = ((
		rows: { id: number; name: string; cast: CharacterOption[] }[],
		held: Set<string>,
		show: number | typeof ANY
	) =>
		rows
			.filter((row) => show === ANY || row.id === show)
			.flatMap((row) =>
				row.cast.map((character) => ({
					// A character cast in two shows has a cell in each, so the pair keys one.
					key: `${row.id}|${character.id}`,
					showId: row.id,
					// The show's name in words, for the row under the character's own: a cell has
					// no town and no year to say there, and the mark on its floor is the same fact
					// for a reader who already knows the mark.
					showName: row.name,
					character,
					owned: held.has(`${character.id}|${row.id}`) || held.has(`${character.id}|*`)
				}))
			))(showRows, ownedPairs, filterShow);
</script>

<!-- The sheet, the slide, the title bar and Escape are the modal's; the album is what is put
	on it — the shows named down the left, and the whole set beside them as one grid. -->
<FullScreenModal
	title={$_('collection.title')}
	closeLabel={$_('collection.close')}
	on:close={close}
>
	<div class="flex min-h-0 flex-1 flex-col">
		{#if error}
			<div class="alert alert-error text-sm"><span>{error}</span></div>
		{:else if loading}
			<div class="flex items-center gap-2 text-sm opacity-70">
				<span class="loading loading-spinner loading-xs"></span>
				{$_('collection.loading')}
			</div>
		{:else if showRows.length === 0}
			<p class="text-sm opacity-60">{$_('collection.empty')}</p>
		{:else}
			<!-- The shows down the left, the set to the right of them. The row takes the height the
				sheet leaves and its two halves take that height with it — no `items-start`, which
				had let each of them stand at whatever its content came to: a grid as tall as its
				cards has nothing to scroll, and the sheet clipping it is what a player reads as the
				album simply stopping partway down. -->
			<div class="flex min-h-0 flex-1 gap-4">
				<!-- The shows say themselves the way they do in the roster's filter: their own
					lettering, one to a row, on the band that lettering is drawn to sit on, and each
					of them the way into its own cast — pressed to narrow the grid to that show,
					pressed again to let go. A show whose logo is not enabled yet falls back to its
					name, so the column still names it and can still be filtered by. Its own scroll
					box, so a long list of shows never takes the sheet's height off the grid it
					stands beside. -->
				<div
					class="flex w-24 flex-none flex-col gap-2 overflow-y-auto sm:w-32"
					role="group"
					aria-label={$_('collection.filterByShow')}
				>
					{#each showTiles as show (show.id)}
						<button
							type="button"
							class={showChipClasses(show.id, filterShow)}
							title={show.name}
							aria-label={$_('collection.filterByThisShow', { values: { show: show.name } })}
							aria-pressed={filterShow === show.id}
							on:click={() => toggleShowFilter(show.id)}
						>
							<div
								class="flex h-10 flex-none items-center justify-center overflow-hidden rounded-md bg-black/40 px-1"
							>
								{#if $showLogos.get(show.id)}
									<img
										src={$showLogos.get(show.id)?.url}
										alt={show.name}
										class="max-h-full max-w-full object-contain"
									/>
								{:else}
									<span class="truncate text-xs text-white/80">{show.name}</span>
								{/if}
							</div>

							<!-- How much of this show is in, under its lettering: the bar and the reading
								of it are one thing, drawn the way the player's own experience bar is (see
								PlayerPanel) — the figure stands in flow with its own padding and the bar is
								stretched behind it, so the bar is as tall as the type comes to and the count
								is centred in it by construction. `h-full` because `.progress` brings a height
								of its own that an over-constrained top/bottom pair would lose to. The bar is
								hidden from a screen reader: what it draws is the two numbers, and those are
								right there as text. -->
							<div class="relative w-full">
								<progress
									class="progress progress-primary absolute inset-0 h-full w-full"
									value={show.held}
									max={show.total}
									aria-hidden="true"
								></progress>
								<!-- Over the bar, so it is painted after it, and centred across the width: a
									figure about the whole bar reads from the middle of it rather than from the
									end the fill happens to have reached. The tight black shadow is what lets
									one colour of lettering cross a bar that is two — the fill where the show
									has been collected, the track where it has not. -->
								<span
									class="relative block truncate px-1 text-center font-mono text-[0.65rem] text-white text-shadow-xs text-shadow-black"
								>
									{show.held}/{show.total}
								</span>
							</div>
						</button>
					{/each}
				</div>

				<!-- The whole album as one bar, standing between the shows and the set: as tall as
					the column of shows, since it is that column read all at once, and filling from the
					bottom up the way a thing being filled does. It says the same as the bars in the
					chips beside it — how many cells are in out of how many there are — but over every
					show at once, which is the one figure neither the chips nor the grid can show.
					No lettering on it: a bar this narrow has nowhere to put two numbers, and they are
					on the pointer instead (the title) and on a screen reader (the value). It draws
					itself rather than being a `progress`, that element having no vertical form to
					take; the fill's height is a runtime figure, so it arrives as a custom property —
					the one thing a class cannot carry (as IdleSprite's placements do). -->
				<div
					class="relative w-3 flex-none overflow-hidden rounded-full bg-base-300"
					role="progressbar"
					aria-label={$_('collection.overall')}
					aria-valuemin={0}
					aria-valuemax={albumTotals.total}
					aria-valuenow={albumTotals.held}
					title="{albumTotals.held}/{albumTotals.total}"
				>
					<div
						class="absolute inset-x-0 bottom-0 h-[var(--collected)] bg-primary transition-[height] duration-300"
						style:--collected="{albumPercent}%"
					></div>
				</div>

				<!-- The set, in one grid five columns wide however many shows it runs through: a
					show's whole cast before the next show's, and a card the player holds no copy of
					standing at half strength — the cell is there either way, since the album is the
					set and not the shelf. It is this grid that scrolls, so the column of shows keeps
					its place beside it.
					The statues are veiled like every other surface's: the veil is what stands in the
					card while the frames are on their way, and taking it off left the cell blank
					until the whole clip had arrived. -->
				<div
					class={classNames(
						'grid min-h-0 min-w-0 flex-1 content-start gap-2 overflow-y-auto',
						STATUE_GRID
					)}
				>
					{#each albumCells as cell (cell.key)}
						<div class={classNames({ 'opacity-50': !cell.owned })}>
							<CharacterStatue
								characterId={cell.character.id}
								label={cell.character.label}
								basePath={cell.character.basePath}
								showId={cell.showId}
								subtitle={cell.showName}
							/>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</FullScreenModal>
