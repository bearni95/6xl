import { derived, get, writable, type Readable } from 'svelte/store';
import { goto } from '$app/navigation';
import { MAP_ROUTE } from '$services/combat';
import { authService } from '$services/auth.service';
import { spawnService } from '$services/spawn.service';
import { teamService, TEAM_SIZE } from '$services/team.service';
import { canFieldFullTeam } from '$utils/color/compare';
import { AuthStatus } from '$types/profile.type';
import type { CombatColor } from '$types/character-definition.type';

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

/**
 * Go to the roster, remembering the page it was opened from.
 *
 * `replaceState` is for the trip nobody asked for — the one `TeamGate` makes on a player
 * whose side is unfinished — where the page being left is a page they are not allowed to be
 * on: a step in the history there would be a Back that bounces straight forward again.
 */
export async function openRoster(options: { replaceState?: boolean } = {}): Promise<void> {
	returnRoute.set(currentRoute());
	await goto(ROSTER_ROUTE, { replaceState: options.replaceState ?? false });
}

/**
 * Whether the player is being held on the roster: signed in, their side short of
 * {@link TEAM_SIZE}, and holding the cards to finish it.
 *
 * A fight is fielded by three, and every other thing this game offers is downstream of
 * being able to have one — so an account that *can* field a side and has not is asked to,
 * before anything else. This is the roster's version of the rule that keeps a player in an
 * open fight: the page will not be closed while it is true (see `/roster`'s
 * `closeDisabled`), and every other page hands them back to it (see `TeamGate`).
 *
 * The third condition is the one that keeps it from being a trap. A player is held only
 * where finishing is a move they can make: a new account with no cards, or one holding
 * fewer than three, or three in colours that cannot stand together, is *not* held — cards
 * come from the boxes drawn on towns, so holding such a player on the roster would be
 * shutting them out of the only place that could ever fix it. It reads off the cards
 * actually loaded, so a player whose roster has not been read yet is not held either: the
 * question simply has no answer until it does, and the answer it would give meanwhile is
 * the same as an empty roster's.
 */
export const teamUnfinished: Readable<boolean> = derived(
	[authService.status, teamService.complete, spawnService.spawns],
	([status, complete, spawns]) =>
		status === AuthStatus.SignedIn &&
		!complete &&
		canFieldFullTeam(
			spawns.map((spawn) => spawn.color as unknown as CombatColor),
			TEAM_SIZE
		)
);

/**
 * Hand the player back to their cards if their side is unfinished, unless that is where
 * they already are.
 *
 * The one move `TeamGate` makes, out here because the gate is not the only thing that has
 * cause to make it: the welcome box calls it as it is closed, that being the moment a brand
 * new account first holds cards to field (see WelcomeBoosterModal). The gate looks when a
 * player arrives somewhere and when their cards first land, and neither of those is the end
 * of an opening the player has been standing in front of all along.
 *
 * `path` is where the caller believes the player is standing. It is asked for rather than
 * read off the document because a caller in the middle of a navigation knows better than
 * the address bar does; the document is the fallback for the callers that are not.
 */
export function holdIfUnfinished(path: string = currentPath()): void {
	if (path.startsWith(ROSTER_ROUTE)) return;
	if (!get(teamUnfinished)) return;
	// Replacing rather than pushing: the page being left is one the player is not allowed to
	// be on, so a step in the history for it would be a Back that bounces forward again.
	void openRoster({ replaceState: true });
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

/** The path alone, for the one question that is about which page this is rather than about
 * where a player should be sent back to. */
function currentPath(): string {
	return typeof window === 'undefined' ? MAP_ROUTE : window.location.pathname;
}
