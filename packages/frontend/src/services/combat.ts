import { get, writable } from 'svelte/store';
import { goto } from '$app/navigation';
import localStorageWritableStore from '$utils/localStorageWritableStore';
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
	/**
	 * The battle this staging was made for — its `startedAt`, which is what keys a battle
	 * everywhere else here (see {@link battleShown}, and the arena's own `syncBattleTeam`).
	 *
	 * It is what makes a staging that outlived its page checkable: one read back off disk
	 * names the fight it was written for, so `/combat` can ask the server whether that is
	 * still the fight this player is in rather than draw a board off a stale reading. Null
	 * for a fight the server has no record of — a signed-out classic match, or Supabase
	 * unconfigured — which was never a fight anybody could come back to.
	 */
	battleId: string | null;
}

/**
 * The fight the arena is about, or null when there is none staged.
 *
 * Written down, which is the whole of why `/combat` is an address a player may simply go
 * to. It was in memory only for a while, on the reasoning that the record of a fight is the
 * server's — true, and beside the point: what is on this object is the *map's readings*,
 * and a page that had lost them could not draw a fight at all. So a visit that did not come
 * through the map — a reload, a typed address, a link, the browser's own Forward — found
 * nothing staged, was sent to `/`, and was walked straight back here by the resume rule the
 * moment the map had loaded enough to stage it again. That is a whole Leaflet canvas, its
 * geo layers and every ledger under them mounted and thrown away to carry four fields
 * across a navigation, and it reads on screen as the arena flashing through the map on its
 * way to itself.
 *
 * Kept where the rest of this app's local state is kept, so it survives a reload and a new
 * tab. It stays a cache of the map's readings and is never a record of the fight: which
 * fight the player is in is still only ever the server's answer, which is what
 * {@link stagingRestored} exists to have asked before a staging off disk is believed.
 */
export const stagedFight = localStorageWritableStore<StagedFight | null>('combat-staging', null);

/**
 * Whether what is staged came off disk rather than from the page that staged it.
 *
 * A staging written this page life is the map's, made moments ago against ledgers it had
 * just read — there is nothing to check. One read back from a previous page life names a
 * battle that may since have been reported, from this tab before it was closed or from
 * another device entirely, so `/combat` holds it against the server's open battle before
 * the page is allowed to exist. True at most once per page life, and only until whatever
 * consumes the staging has answered it.
 */
export const stagingRestored = writable<boolean>(get(stagedFight) !== null);

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
	// Staged here and now, off ledgers the stager has just read: nothing for the arena to
	// check, and nothing for it to wait on before the board goes up.
	stagingRestored.set(false);
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
	dropStaging();
	await goto(MAP_ROUTE);
}

/**
 * Forget what was staged.
 *
 * Leaving the arena, and `/combat` finding that what it was handed off disk is not the
 * fight the server has open. Both leave the battle itself alone — only reporting one ends
 * it — and both clear the flag with the staging, or the next fight staged would be taken
 * for a restored one.
 */
export function dropStaging(): void {
	stagedFight.set(null);
	stagingRestored.set(false);
}
