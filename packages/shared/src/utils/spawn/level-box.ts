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
 * The `location_id` a level *claim* is filed under — the same place-shaped hole the
 * welcome box's sentinel is, and named by `claimPlaceName` rather than falling
 * through to Ultramar. One id for every level, because which level a claim spends is
 * its `year` and the claim key is what that id is for.
 *
 * A **card** out of one of these is filed under the level's own id instead
 * ({@link levelBoxLocationId}) — see there for why the two differ.
 */
export const LEVEL_BOX_ID = 'nivell';

/**
 * The `location_id` a level box's *cards* are filed under: the sentinel with the
 * level after it, `nivell:7`.
 *
 * A card says where it came from, and the level boxes are the one kind whose place
 * was not written on the card at all — every one of them said `Nivell`, so a card
 * pulled at level 2 and one pulled at level 13 gave the same answer to the one
 * question a card's second row asks. The level went on the box's head and stopped
 * there, which was fine while the box was open and useless the moment it closed: the
 * roster, the album, another player's profile and the map's own statues all letter
 * that row off the card, long after any box is on screen.
 *
 * It is on the card and not in a column of its own because `location_id` already *is*
 * the question — where this card is from — and a level box is a place-shaped hole
 * like the other two. The claim keeps the bare sentinel ({@link LEVEL_BOX_ID}): the
 * claim key is (town, year, stock) and the level is already the year, so putting it
 * in the town as well would file one box under two names.
 */
export function levelBoxLocationId(level: number): string {
	return `${LEVEL_BOX_ID}:${level}`;
}

/**
 * What a level box says across its head, where a town is said on every other one —
 * followed by the level itself ({@link levelBoxCaption}), which stands exactly where
 * a festa's year stands. So the caption is the same two-part statement a town's box
 * makes, about a thing that is not a town.
 *
 * The cards say the whole of it too, and not just this word: a card out of a level
 * box names the level it came from, exactly as a town's card names its town. On its
 * own it is what a card filed under the bare sentinel falls back to — one dealt
 * before the level was written onto the card at all.
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

/**
 * Whether a spawn's/claim's location is a level box's rather than a town. Both forms
 * count: the bare sentinel a claim is filed under (and every card dealt before the
 * level was written onto one), and the `nivell:<level>` a card carries now.
 */
export function isLevelLocation(id: string | null | undefined): boolean {
	return id === LEVEL_BOX_ID || (!!id && id.startsWith(`${LEVEL_BOX_ID}:`));
}

/**
 * Which level a card came from, or **null** where the id does not say — the bare
 * sentinel, anything that is not a level box's id at all, and a suffix that is not a
 * level in the table's range. Null is not an error: it is a card that came from
 * levelling up and cannot say which time, which is every card dealt before the level
 * was written onto one, and it is lettered with the bare caption.
 */
export function levelFromLocation(id: string | null | undefined): number | null {
	if (!id || !id.startsWith(`${LEVEL_BOX_ID}:`)) return null;
	const level = Number(id.slice(LEVEL_BOX_ID.length + 1));
	if (!Number.isInteger(level) || level < MIN_LEVEL || level > MAX_LEVEL) return null;
	return level;
}

/**
 * What a card out of a level box says where a town would be: the box's own caption,
 * level and all, and the bare word for one that cannot say which level it was.
 */
export function levelPlaceName(id: string | null | undefined): string {
	const level = levelFromLocation(id);
	return level === null ? LEVEL_BOX_CAPTION : levelBoxCaption(level);
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
