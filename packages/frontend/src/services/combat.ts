import { writable } from 'svelte/store';
import { goto } from '$app/navigation';
import type { CharacterSpawn } from '$types/character-spawn.type';
import type { TownPlateCard } from '$types/map.type';

/**
 * The fight, and the two addresses it lives between.
 *
 * Combat is a page of its own (`/combat`) rather than a sheet raised over the map: the
 * arena takes the whole viewport and answers nothing behind it, so what used to be a
 * modal opening and closing is a navigation there and back. This module is what the two
 * pages agree on — the map stages a fight and goes to it, the arena reads what was staged,
 * and leaving is a navigation home.
 *
 * Nothing here decides anything about the fight itself. Which fight a player is in is the
 * server's record, read off `battleService`; this only carries the readings the map has
 * already made and the arena has no way to make on its own.
 */

/** The arena's address. */
export const COMBAT_ROUTE = '/combat';

/** The map's — the front door of this game, and where a fight is left for. */
export const MAP_ROUTE = '/';

/**
 * What the map hands the arena when it sends the player there.
 *
 * The line-up and the town are frozen at the moment the fight is staged, exactly as they
 * were when the arena was a modal keyed on them. The plate is the town's own card as the
 * map draws it (see buildFightPlate) — a reading off the region tree, the holders and the
 * show glyphs, none of which the arena has, and all of which the map has already built.
 */
export interface StagedFight {
	/** The team being fought, as synthetic OG spawns. */
	spawns: CharacterSpawn[];
	/** The town's geojson feature id, or null for a fight over no town. */
	locationId: string | null;
	/** The generation of that town's team this fight is against, which keys it. */
	turnover: number;
	/**
	 * The town's plate, drawn over the board. Null for a fight over no town.
	 *
	 * What is on it is the map's reading and the arena has no way to make it — except for
	 * the two halves of it that are a *ledger* rather than a reading of the terrain: who is
	 * sitting on the town and how far this player has got towards shifting them. The arena's
	 * page re-reads those off Supabase for itself (see `/combat`'s livePlate), because this
	 * plate is staged the moment the fight is, which on the resume path can be before the map
	 * has finished loading the holders — and a plate built then names no occupant and counts
	 * the bar against the untouched OG team.
	 */
	plate: TownPlateCard | null;
}

/**
 * The fight the arena is about, or null when there is none staged.
 *
 * In memory only, and deliberately: a fight outlives the page but it does not outlive it
 * *here* — the record of it is on the server. A visit that lands on `/combat` with nothing
 * staged is sent to the map, which loads the open battle and stages it back (see the
 * resume rule on the map page), so a reload in the middle of a fight comes back to the
 * fight with its plate rather than to an arena with no town on it.
 */
export const stagedFight = writable<StagedFight | null>(null);

/**
 * Which battle the player has already been put back in front of.
 *
 * The map walks a player into the fight they are already in, once per battle: closing the
 * arena is not leaving the fight, so a player who came back to the map must not be dragged
 * straight back into it. It lives out here rather than on the map page because the page is
 * now mounted afresh every time the arena is left — a marker held in a component would
 * forget on exactly the visit it exists to remember.
 */
export const battleShown = writable<string | null>(null);

/** Stage a fight and go to it. */
export async function openCombat(fight: StagedFight): Promise<void> {
	stagedFight.set(fight);
	await goto(COMBAT_ROUTE);
}

/**
 * Leave the arena for the map.
 *
 * The staging is dropped on the way out, so the arena has nothing left to redraw: going
 * back to it (by the browser's own Back, say) finds nothing staged and lands on the map,
 * which is where leaving a fight puts you. The battle itself is untouched — only reporting
 * one ends it.
 */
export async function leaveCombat(): Promise<void> {
	stagedFight.set(null);
	await goto(MAP_ROUTE);
}
