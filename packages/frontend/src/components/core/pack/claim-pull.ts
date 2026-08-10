import { characters } from '@3xl/data';
import { resolveCharacterFaceUrl } from '$utils/mugen/character-face';
import { spawnKey } from '$utils/spawn/owned';
import { claimMintedAt } from '$utils/spawn/team-lineup';
import type { CharacterSpawn } from '$types/character-spawn.type';
import type { ClaimPull } from './scene/pull.type';

// One rolled card, turned into the thing the reveal draws.
//
// A box answers with `character_spawns` rows and nothing else — an id, a colour, a place,
// a stock — because that is the whole of what the server keeps. What a card *shows* is
// assembled here from three places the server has never heard of: the local @3xl/data
// registry (the label and the sprite folder, and through it the portrait), the rarity
// tiers the browser reads out of `character_templates`, and the player's own collection
// as it stood a moment before the box was opened.
//
// It lives beside the boxes rather than inside the panel that opens them because there is
// more than one kind of box now: a town's, out of the festa window, and the welcome one a
// player is given on arriving. Two copies of this would be two answers to what a card
// looks like, differing first in some small way and then in a visible one.

/** The registry by id — what a card's label and sprite folder are looked up in. */
export const charactersById = new Map(characters.map((character) => [character.id, character]));

/** A character's display name, falling back to its id: an archive that no longer holds a
 * character must not take the card off the screen with it. */
export function characterLabel(id: string): string {
	return charactersById.get(id)?.label ?? id;
}

/** Everything about a pull that is not on the spawn itself. */
export interface ClaimPullContext {
	/** Per-character rarity tier, from Supabase `character_templates`. Missing reads as none. */
	rarityByCharacter: ReadonlyMap<string, number>;
	/** The show the box was rolled from, as the card names it. */
	showName: string | null;
	/** The place the card says it comes from — a town, or a box's caption. */
	locationName: string | null;
	/**
	 * The player's cards as {@link spawnKey}s *before* this box was opened. It has to be a
	 * snapshot taken then: a claim folds its own cards into the collection the instant it
	 * answers, and a set read after would find every card in the box already owned, by
	 * itself. Two of the same thing in one box are therefore both new, which is the truth
	 * about the box rather than about the second card.
	 */
	held: ReadonlySet<string>;
}

/**
 * Assemble the display card for one rolled spawn: label + face from the local registry,
 * colour off the spawn, and whether it is one the player did not already hold.
 */
export async function buildClaimPull(
	spawn: CharacterSpawn,
	context: ClaimPullContext
): Promise<ClaimPull> {
	const basePath = charactersById.get(spawn.characterId)?.basePath ?? null;
	const faceUrl = basePath ? await resolveCharacterFaceUrl(spawn.characterId, basePath) : null;
	return {
		spawn,
		label: characterLabel(spawn.characterId),
		basePath,
		faceUrl,
		color: spawn.color,
		rarity: context.rarityByCharacter.get(spawn.characterId) ?? null,
		showName: context.showName,
		locationName: context.locationName || null,
		// Dated only where the place beside it is a town: a card out of the welcome or a
		// level box says its box's caption alone, exactly as that box's own head does
		// (see claimMintedAt).
		spawnedAt: claimMintedAt(spawn.locationId, spawn.createdAt),
		isNew: !context.held.has(spawnKey(spawn.characterId, spawn.color, spawn.locationId))
	};
}
