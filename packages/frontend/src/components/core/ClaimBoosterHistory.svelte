<script lang="ts">
	import classNames from 'classnames';
	import { onMount } from 'svelte';
	import { characters } from '@3xl/data';
	import { authService } from '$services/auth.service';
	import { spawnService } from '$services/spawn.service';
	import { locationAdapter } from '$adapters/classes/location.adapter';
	import { resolveCharacterFaceUrl } from '$utils/mugen/character-face';
	import { groupSpawnsIntoBoosters } from '$utils/spawn/boosters';
	import { wowRarityLabel } from '$utils/rarity/wow-rarity';
	import { errorMessage } from '$utils/error/error-message';
	import { AuthStatus } from '$types/profile.type';
	import { SpawnColor } from '$types/character-spawn.type';
	import { ULTRAMAR, ULTRAMAR_ID } from '$types/location.type';
	import { WELCOME_BOX_CAPTION, isWelcomeLocation } from '$utils/spawn/welcome-box';
	import { isLevelLocation, levelPlaceName } from '$utils/spawn/level-box';

	const status = authService.status;
	const profile = authService.profile;
	const spawns = spawnService.spawns;

	// Spawns store only ids; labels, faces and place/show names resolve here.
	const charactersById = new Map(characters.map((character) => [character.id, character]));

	let showNames = new Map<number, string>();
	let municipalityNames: Map<string, string> | null = null;
	let rarityByCharacter = new Map<string, number>();
	let characterFaces = new Map<string, string | null>();
	const faceRequested = new Set<string>();

	let loading = false;
	let error = '';
	// Guards the one-time load so the reactive block doesn't refire on every tick.
	let loadedForUser: string | null = null;

	// The spawn colour rendered as its portrait ring, matching the team/card palette.
	const ringClasses: Record<SpawnColor, string> = {
		[SpawnColor.Red]: 'ring-red-500',
		[SpawnColor.Yellow]: 'ring-yellow-400',
		[SpawnColor.Blue]: 'ring-blue-500',
		[SpawnColor.Orange]: 'ring-orange-500',
		[SpawnColor.Green]: 'ring-green-500',
		[SpawnColor.Purple]: 'ring-purple-500'
	};

	const dateFormat = new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short'
	});

	onMount(() => authService.init());

	$: currentUserId = $status === AuthStatus.SignedIn && $profile ? String($profile.id) : null;
	$: if (currentUserId && currentUserId !== loadedForUser) {
		loadedForUser = currentUserId;
		load(currentUserId);
	}

	async function load(userId: string) {
		loading = true;
		error = '';
		try {
			const [, names, rarities] = await Promise.all([
				spawnService.loadSpawns(userId),
				spawnService.loadShowNames(),
				spawnService.loadRarities()
			]);
			showNames = names;
			rarityByCharacter = rarities;

			// Place names are optional — a missing layer just falls back to Ultramar.
			try {
				const response = await fetch('/data/geo/municipis.json');
				const municipalities = (await response.json()) as GeoJSON.FeatureCollection;
				municipalityNames = locationAdapter.municipalityNames(municipalities);
			} catch {
				municipalityNames = null;
			}
		} catch (err) {
			error = errorMessage(err);
		} finally {
			loading = false;
		}
	}

	// Fetch the active-face portrait for any distinct character not yet requested.
	async function loadFaces(ids: string[]): Promise<void> {
		const missing = ids.filter((id) => !faceRequested.has(id));
		if (missing.length === 0) return;
		for (const id of missing) faceRequested.add(id);
		await Promise.all(
			missing.map(async (id) => {
				const basePath = charactersById.get(id)?.basePath ?? null;
				characterFaces.set(id, basePath ? await resolveCharacterFaceUrl(id, basePath) : null);
			})
		);
		characterFaces = characterFaces; // reassign so the grid re-renders
	}

	$: loadFaces([...new Set($spawns.map((spawn) => spawn.characterId))]);

	// The player's spawns grouped into the packs they were opened in, newest first.
	$: boosters = groupSpawnsIntoBoosters($spawns);

	function labelFor(id: string): string {
		return charactersById.get(id)?.label ?? id;
	}
	function faceFor(id: string): string | null {
		return characterFaces.get(id) ?? null;
	}
	function locationNameFor(id: string): string {
		// The two boxes that belong to no town: each says its own caption, the word its box
		// carries where a place would be.
		if (isWelcomeLocation(id)) return WELCOME_BOX_CAPTION;
		if (isLevelLocation(id)) return levelPlaceName(id);
		if (id && id !== ULTRAMAR_ID) {
			const name = municipalityNames?.get(id);
			if (name) return name;
		}
		return ULTRAMAR.municipality;
	}
	function showNameFor(showId: number | null): string | null {
		return showId != null ? (showNames.get(showId) ?? null) : null;
	}
	function rarityLabelFor(id: string): string | null {
		const rarity = rarityByCharacter.get(id);
		return rarity != null ? (wowRarityLabel(rarity) ?? `Tier ${rarity}`) : null;
	}
</script>

<div class="card w-full bg-base-100 shadow-xl">
	<div class="card-body gap-4">
		<div class="flex items-center justify-between gap-3">
			<h2 class="card-title">Opened boosters</h2>
			{#if boosters.length > 0}
				<span class="badge badge-neutral" title="Packs opened">{boosters.length}</span>
			{/if}
		</div>

		{#if !authService.configured}
			<div class="alert alert-warning text-sm">
				<span>Sign-in is unavailable — Supabase is not configured.</span>
			</div>
		{:else if $status !== AuthStatus.SignedIn}
			<p class="text-sm opacity-70">Sign in to see the booster packs you've opened.</p>
		{:else if error}
			<div class="alert alert-error text-sm"><span>{error}</span></div>
		{:else if loading}
			<div class="flex items-center gap-2 text-sm opacity-70">
				<span class="loading loading-spinner loading-xs"></span>
				Loading your booster history…
			</div>
		{:else if boosters.length === 0}
			<p class="text-sm opacity-70">
				You haven't opened any booster packs yet. Pick a town's festa above to open your first.
			</p>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each boosters as booster (booster.id)}
					<li class="rounded-box border border-base-300 bg-base-200 p-3">
						<div class="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-semibold">{locationNameFor(booster.locationId)}</span>
								{#if showNameFor(booster.showId)}
									<span class="badge badge-sm badge-outline">{showNameFor(booster.showId)}</span>
								{/if}
								<span class="badge badge-sm">{booster.spawns.length} cards</span>
							</div>
							<time class="text-xs opacity-60" datetime={booster.openedAt}>
								{dateFormat.format(new Date(booster.openedAt))}
							</time>
						</div>

						<div class="flex flex-wrap gap-3">
							{#each booster.spawns as spawn (spawn.id)}
								<div class="flex w-16 flex-col items-center gap-1">
									<div
										class={classNames(
											'flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-base-300 ring-2',
											ringClasses[spawn.color] ?? 'ring-base-content/20'
										)}
										title={rarityLabelFor(spawn.characterId)
											? `${labelFor(spawn.characterId)} · ${rarityLabelFor(spawn.characterId)}`
											: labelFor(spawn.characterId)}
									>
										{#if faceFor(spawn.characterId)}
											<img
												src={faceFor(spawn.characterId)}
												alt={labelFor(spawn.characterId)}
												class="max-h-full max-w-full object-contain"
											/>
										{:else}
											<span class="px-1 text-center text-[10px] leading-tight opacity-60">
												{labelFor(spawn.characterId)}
											</span>
										{/if}
									</div>
									<span class="w-full truncate text-center text-[10px]" title={labelFor(spawn.characterId)}>
										{labelFor(spawn.characterId)}
									</span>
								</div>
							{/each}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
