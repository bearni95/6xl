import { ULTRAMAR, ULTRAMAR_ID } from '../../types/location.type';
import { WELCOME_BOX_CAPTION, isWelcomeLocation } from './welcome-box';
import { LEVEL_BOX_CAPTION, isLevelLocation } from './level-box';
import type { SpawnBox, SpawnColor } from '../../types/character-spawn.type';
import restoreCatalanArticle from '../string/restore-catalan-article';

/**
 * The team as the statues draw it (see the frontend's `TeamLineup`): who is
 * fielded, the art that stands them up, the colour they bend, where they were
 * claimed and the show whose glyph goes on the floor under them.
 *
 * It is not a card and it is not a `character_spawns` row: nothing here is stored
 * anywhere, and everything is resolved — the label and the sprite folder out of
 * the local registry, the place out of the map's own layer, the show out of the
 * assignment the claim roll already reads.
 */
export interface TeamLineupMember {
	/** Which character it is. The statue letters itself off this — a name is the
	 * registry's answer to an id and not something a line-up decides — so `label` beside
	 * it is only what to say where the registry no longer holds the character. */
	characterId: string;
	label: string;
	basePath: string | null;
	color: SpawnColor;
	box?: SpawnBox;
	locationName: string | null;
	spawnedAt?: string | number | Date | null;
	showId: number | null;
}

/**
 * The least of a card this needs to draw one. A `CharacterSpawn` is one, and so is
 * a row of the `player_spawns_public` view — which carries no spawn id at all,
 * because another player's card is a thing to look at rather than a thing to act
 * on.
 */
export interface TeamLineupSpawn {
	characterId: string;
	color: SpawnColor;
	box?: SpawnBox;
	locationId?: string | null;
	createdAt?: string | null;
}

/** What a character id has to be resolved against to be stood up at all. */
export interface TeamLineupCharacter {
	label: string;
	basePath: string | null;
}

/**
 * Everything outside the cards themselves that a line-up is read against. All
 * three are handed in rather than reached for: this is a pure function, and the
 * two surfaces that call it (the map's own corner and the public profile page)
 * have loaded them by different routes.
 */
export interface TeamLineupContext {
	/** The local registry, keyed by character id — what a card is drawn from. */
	characters: ReadonlyMap<string, TeamLineupCharacter>;
	/** Character id → the shows it belongs to; the first is the one it flies. */
	showsByCharacter: ReadonlyMap<string, number[]>;
	/**
	 * Geojson feature id → municipality name, or `null` while the map layer those
	 * names come out of is still on its way. Null and "no such town" read the same:
	 * a place that cannot be named is Ultramar, which is where a card claimed off
	 * the map comes from anyway.
	 */
	municipalityNames: ReadonlyMap<string, string> | null;
}

/**
 * A spawn's claim place; the Ultramar sentinel and any unresolved id read as
 * Ultramar. The two boxes that belong to no town are the ids that are not towns and
 * are not failures to name one either — each says its own caption, the word its box
 * carries where a place would be (see {@link WELCOME_BOX_CAPTION} and
 * {@link LEVEL_BOX_CAPTION}). A level card says `Nivell` and not which level: the
 * level is on the box and not on the card, and what these cards have in common is
 * having come from levelling up at all.
 */
export function claimPlaceName(
	id: string | null | undefined,
	names: ReadonlyMap<string, string> | null
): string {
	if (isWelcomeLocation(id)) return WELCOME_BOX_CAPTION;
	if (isLevelLocation(id)) return LEVEL_BOX_CAPTION;
	if (id && id !== ULTRAMAR_ID) {
		const name = names?.get(id);
		if (name) return restoreCatalanArticle(name);
	}
	return ULTRAMAR.municipality;
}

/**
 * When a copy was minted, as the statue's panel says it — or nothing at all for a
 * card out of one of the two boxes that belong to no town.
 *
 * The year is said *beside a place*: it is which edition of that town's festa the
 * copy came from, and it is half of "Barcelona '26". A welcome or a level box says
 * its own caption where the place goes ({@link claimPlaceName}), and a caption is
 * not an edition — "Benvinguda '26" dates a thing that has no seasons. The box
 * itself has always drawn its head this way (see BoosterBox's `place`, where a
 * caption replaces the pair outright rather than joining them); this is the same
 * rule on the cards it dealt, so a card says exactly what the box it came out of
 * said.
 */
export function claimMintedAt<T>(
	locationId: string | null | undefined,
	createdAt: T
): T | null {
	return isWelcomeLocation(locationId) || isLevelLocation(locationId) ? null : createdAt;
}

/**
 * The fielded cards as the row of statues draws them, in the order they were
 * handed over — the lead first, as on the board.
 *
 * A card whose character is not in the local registry keeps its id as a label and
 * gets no sprite folder, which is what the statue already falls back to: a
 * character the archives no longer hold must not take the rest of the side off
 * screen with it.
 */
export function teamLineupMembers(
	spawns: readonly TeamLineupSpawn[],
	context: TeamLineupContext
): TeamLineupMember[] {
	return spawns.map((spawn) => {
		const character = context.characters.get(spawn.characterId);
		return {
			characterId: spawn.characterId,
			label: character?.label ?? spawn.characterId,
			basePath: character?.basePath ?? null,
			color: spawn.color,
			// The box it was pulled from, which is the ink its statue is drawn in.
			box: spawn.box,
			locationName: claimPlaceName(spawn.locationId, context.municipalityNames),
			// When the card was minted, said as an apostrophe year beside the place — and
			// said by nothing at all where there is no place to say it beside.
			spawnedAt: claimMintedAt(spawn.locationId, spawn.createdAt ?? null),
			showId: context.showsByCharacter.get(spawn.characterId)?.[0] ?? null
		};
	});
}
