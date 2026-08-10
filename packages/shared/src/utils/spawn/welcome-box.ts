import { SpawnBox } from '../../types/character-spawn.type';
import { claimedBoxKey } from './claimed-box';

/**
 * The welcome box: a booster box that belongs to no town and to no year.
 *
 * Every other box in this game is a town's — it is printed for a festa major, it
 * carries that town's name and the year of that celebration across its head, and
 * which of the two stocks it is printed on is read off the calendar. This one is
 * printed for the player arriving, so where a place and a year go it says one
 * arbitrary word instead ({@link WELCOME_BOX_CAPTION}, the box's `caption` — see
 * BoosterBox.svelte and BoosterBoxSprite, which take a caption *in place of* the
 * town and the year rather than beside them).
 *
 * It is still a `booster_claims` row like any other, and that is deliberate: the
 * whole of "one to a player and no more" is already the unique index on
 * (player, town, year, stock), so the welcome box needs no rule of its own — only
 * a town, a year and a stock that no festa can ever produce. Hence the three
 * constants below, which the `claim_welcome_booster` RPC spells for itself
 * (see packages/backend/supabase/booster_claims.sql). Keep them in step.
 */

/**
 * The `location_id` a welcome claim and its cards are filed under. Not a geojson
 * feature id and never will be — like the Ultramar sentinel, it is a place-shaped
 * hole where a place would go, and {@link claimPlaceName} names it rather than
 * letting it fall through to Ultramar.
 */
export const WELCOME_BOX_ID = 'benvinguda';

/**
 * What the box says across its head, where a town and a year are said on every
 * other one. It is also what the cards it dealt say as their place, since the
 * caption stands exactly where the place would: a card out of this box comes from
 * the welcome and not from anywhere.
 */
export const WELCOME_BOX_CAPTION = 'Benvinguda';

/**
 * The year the claim is filed under. Zero rather than the year it was opened in,
 * because the box is one per *player* and not one per player per year — a year
 * that moved would deal a second one every January.
 */
export const WELCOME_BOX_YEAR = 0;

/**
 * The stock it is printed on: white, which holds the secondaries
 * (purple/green/orange). The rare one of the two, for the one box a player is
 * given rather than has to go and find.
 */
export const WELCOME_BOX_STOCK = SpawnBox.White;

/** The claim key this box is spent under — the one row that says it has been taken. */
export const WELCOME_BOX_CLAIM_KEY = claimedBoxKey(
	WELCOME_BOX_ID,
	WELCOME_BOX_YEAR,
	WELCOME_BOX_STOCK
);

/** Whether a spawn's/claim's location is the welcome box's rather than a town. */
export function isWelcomeLocation(id: string | null | undefined): boolean {
	return id === WELCOME_BOX_ID;
}
