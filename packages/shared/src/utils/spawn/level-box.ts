import { SpawnBox } from '../../types/character-spawn.type';
import { claimedBoxKey } from './claimed-box';
import { MAX_LEVEL, MIN_LEVEL } from '../progression/level';

/**
 * The level boxes: one booster box for every level a player has reached.
 *
 * A town's box is printed for a festa major and is reached by being somewhere on a
 * day; the welcome box is printed for a player arriving and is dealt once
 * ({@link WELCOME_BOX_ID}). This is the third and last kind: a box printed for a
 * *level*, one per level from the first, each opened on its own and each on a show
 * of the player's own choosing. Reaching level 4 with none of them taken is four
 * boxes standing there, not one — which is what "each can be claimed individually"
 * means, and why the level is part of the claim key rather than a running total
 * somebody could spend twice.
 *
 * It is not a rule of its own, exactly as the welcome box is not: "one box per
 * level" is already the unique index on (player, town, year, stock) — all it needs
 * is a town no festa can produce and a *year* that is really the level. The claim
 * key is therefore ('nivell', <level>, 'black'), and the whole of the enforcement is
 * that index plus the one thing the server has to check for itself, which is that
 * the player has actually reached the level they are asking for (see
 * `claim_level_booster` in packages/backend/supabase/booster_claims.sql). Keep the
 * constants below in step with it.
 */

/**
 * The `location_id` a level claim and its cards are filed under — the same
 * place-shaped hole the welcome box's sentinel is, and named by `claimPlaceName`
 * rather than falling through to Ultramar. One id for every level: which level a box
 * was is the claim's `year`, not its town, so a card pulled at level 9 and one
 * pulled at level 2 both come from the same nowhere.
 */
export const LEVEL_BOX_ID = 'nivell';

/**
 * What a level box says across its head, where a town is said on every other one —
 * followed by the level itself ({@link levelBoxCaption}), which stands exactly where
 * a festa's year stands. So the caption is the same two-part statement a town's box
 * makes, about a thing that is not a town.
 *
 * On its own it is also the place a card out of one of these names, since the cards
 * carry no level: what they have in common is that they came from levelling up.
 */
export const LEVEL_BOX_CAPTION = 'Nivell';

/**
 * The stock a level box is printed on: black, which holds the primaries
 * (red/blue/yellow). The everyday one of the two — white is the rare stock, printed
 * for the day of a festa and for the one welcome a player is ever given, and a box
 * that comes again at every level is not that.
 */
export const LEVEL_BOX_STOCK: SpawnBox = SpawnBox.Black;

/** What the box for `level` says across its head, in place of a town and a year. */
export function levelBoxCaption(level: number): string {
	return `${LEVEL_BOX_CAPTION} ${level}`;
}

/** The claim key one level's box is spent under — the row that says it has been taken. */
export function levelBoxClaimKey(level: number): string {
	return claimedBoxKey(LEVEL_BOX_ID, level, LEVEL_BOX_STOCK);
}

/** Whether a spawn's/claim's location is a level box's rather than a town. */
export function isLevelLocation(id: string | null | undefined): boolean {
	return id === LEVEL_BOX_ID;
}

/**
 * The levels this player has a box waiting for: every level from the first through
 * the one they have reached that is not already in `claimed`, in ascending order —
 * so the oldest unopened box is the first of them, which is the one the sheet deals.
 *
 * Levels above the player's own are not boxes yet, and levels below one they have
 * already taken are not boxes any more; a level outside the table's range
 * ({@link MIN_LEVEL}..{@link MAX_LEVEL}) is not a level at all. The count of these is
 * what the map's button says, and an empty list is what greys it out.
 */
export function pendingLevelBoxes(
	level: number,
	claimed: ReadonlySet<number> | null | undefined
): number[] {
	if (!Number.isFinite(level)) return [];
	const reached = Math.min(Math.trunc(level), MAX_LEVEL);
	const pending: number[] = [];
	for (let n = MIN_LEVEL; n <= reached; n++) {
		if (!claimed?.has(n)) pending.push(n);
	}
	return pending;
}
