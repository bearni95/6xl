import { get, writable } from 'svelte/store';
import { goto } from '$app/navigation';
import { MAP_ROUTE } from '$services/combat';

/**
 * The roster, and the two addresses it lives between.
 *
 * The player's cards are a page of their own (`/roster`) rather than a sheet raised over
 * whatever the player happened to be looking at: the view takes the whole viewport and
 * answers nothing behind it, so what used to be a store set true and false is a navigation
 * there and back. This module is what the pages that send a player to their cards agree on.
 *
 * Nothing here decides anything about the cards themselves — the roster page reads those
 * off `spawnService` and `teamService` for itself, as the modal did.
 */

/** The roster's address. */
export const ROSTER_ROUTE = '/roster';

/**
 * Where leaving the roster goes back to.
 *
 * The roster is reached from two different pages — the side standing in the map's corner,
 * and the arena's "no active team" card — and it is the same errand from both: go and
 * arrange the team, then carry on with what you were doing. So the way out is wherever the
 * way in was, recorded when the door is opened rather than asked of the caller, which is
 * the one thing a caller could get wrong. The map is the fallback, and is what a visit that
 * lands on `/roster` directly (a reload, a link) leaves for.
 */
const returnRoute = writable<string>(MAP_ROUTE);

/** Go to the roster, remembering the page it was opened from. */
export async function openRoster(): Promise<void> {
	returnRoute.set(currentRoute());
	await goto(ROSTER_ROUTE);
}

/** Leave the roster for the page it was opened from. */
export async function leaveRoster(): Promise<void> {
	await goto(get(returnRoute));
}

/**
 * The address the player is standing at, as far as this module is concerned.
 *
 * Read off the document rather than off `$app/stores`, so this can be called from anywhere
 * — a service is not a component, and the one thing wanted here is a path. A route that is
 * somehow the roster itself is answered with the map, so leaving can never be a loop.
 */
function currentRoute(): string {
	if (typeof window === 'undefined') return MAP_ROUTE;
	const here = `${window.location.pathname}${window.location.search}`;
	return here.startsWith(ROSTER_ROUTE) ? MAP_ROUTE : here;
}
