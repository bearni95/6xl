/**
 * What a fighter's colour hands it for free in the stand-off. Pure functions — no
 * side effects.
 *
 * Combat is the schoolyard charge/defend/shoot game (see the frontend's combat
 * controller), and its three orders are the same for everybody. A card's **colour**
 * is therefore the whole of its character, and what a colour grants is one of those
 * very orders, taken **for nothing**: not a turn spent on it, just an extra thing
 * that happens.
 *
 *   · red    → a free **shot**.
 *   · yellow → a free **charge**.
 *   · blue   → a free **defend**.
 *
 * Four rules hold it down, and they are the whole of it:
 *
 *   1. **Once, on the opening turn.** A free order is a single gift, not an allowance —
 *      and it is what the fighter opens the fight with, not something it holds back for
 *      the turn that would pay best. Whatever it has not done by the end of the first
 *      turn lapses exactly as if it had been taken.
 *   2. **Never the order it was already given.** A passive is a *second* thing the
 *      fighter does, so it only comes on a turn spent on something else: a fighter
 *      that picks Shoot gets no free shot out of red, and one that picks Defend gets
 *      no free guard out of blue. Passive means it happens beside what you chose,
 *      which means it cannot *be* what you chose — so ordering the very thing your
 *      colour owes you is how a fighter throws its gift away.
 *   3. **Spent only when it does something.** A free charge on a fighter already full
 *      up, a free guard on a turn nobody fires, a free shot with nothing banked to
 *      fire it with — none of these are the gift being taken. It is not used up by
 *      them; it simply runs out with the turn (rule 1), which from the outside is the
 *      same thing.
 *   4. **The charge goes first.** Whichever of the two is a charge — the order or the
 *      gift — is resolved before anything else in the turn, because a charge is the one
 *      order another order *needs*. So the two things a fighter does on a turn happen in
 *      sequence and can feed each other: red told to load fires its free shot out of the
 *      charge it just banked. (The sequence itself belongs to the fight, not to this
 *      file — see the frontend's combat controller.)
 *
 * A compound colour carries both of the primaries it mixes, and **both come at once**:
 * orange (red + yellow) that picks Defend banks its free charge, fires its free shot out
 * of it, and covers — all in the one turn, which is the only turn either of them was ever
 * going to come on. So a compound is not twice the fighter — it is one opening, twice as
 * good, and then it is a plain card.
 */
import {
	COMPOUND_COMPONENTS,
	type CombatColor,
	type PrimaryColor
} from '../../types/character-definition.type';
import { isPrimaryColor } from './compare';

/**
 * The glyph each of the three orders is drawn with, from the game-icons.net set in
 * @3xl/assets: gathering energy to charge, a shield to defend, a sword to shoot. The
 * board puts these beside a fighter, the cards carry them in their corners and every
 * fighter wears the ones its colour grants it — so they are named once, here, beside
 * the colours that grant them.
 *
 * They go into a canvas (a Pixi texture), so they are named by URL rather than by the
 * `<folder>/<slug>` an inlined icon goes by — see the icon note in CLAUDE.md.
 */
export const ORDER_ICONS = {
	charge: '/assets/icons/lorc/rolling-energy.svg',
	defend: '/assets/icons/lorc/bordered-shield.svg',
	shoot: '/assets/icons/lorc/broadsword.svg'
} as const;

/**
 * One of the three orders, named as a colour's gift. The same three strings the
 * controller's `CombatAction` uses — a passive is not some fourth kind of thing, it is
 * one of the orders had for free.
 */
export type PassiveOrder = keyof typeof ORDER_ICONS;

/**
 * The same three marks, named the way a mark drawn **into the document** is named —
 * `<folder>/<slug>`, which is what an inlined glyph is asked for by (see the icon note in
 * CLAUDE.md). The narration over a fight puts one beside each fighter's name, and that is
 * lettering rather than canvas.
 *
 * Derived off {@link ORDER_ICONS} rather than written out again, so the picture the board
 * tints and the picture the sentence letters can never come apart. Null for anything that
 * is not one of the three, which is how a cue carrying an order this doesn't know stays a
 * sentence with no mark rather than a broken fetch.
 */
export function orderGlyph(order: string): string | null {
	const url = ORDER_ICONS[order as PassiveOrder];
	return url ? url.replace(/^\/assets\/icons\//, '').replace(/\.svg$/, '') : null;
}

/** Which order each primary hands over. A compound hands over its components'. */
const PRIMARY_PASSIVE: Record<PrimaryColor, PassiveOrder> = {
	red: 'shoot',
	yellow: 'charge',
	blue: 'defend'
};

/**
 * The free orders a fighter of `color` carries into the battle: one for a primary,
 * two — in component order — for a compound. Each is worth one use, on a turn the
 * fighter was given something else to do.
 */
export function colorPassives(color: CombatColor): PassiveOrder[] {
	const primaries: PrimaryColor[] = isPrimaryColor(color) ? [color] : COMPOUND_COMPONENTS[color];
	return primaries.map((primary) => PRIMARY_PASSIVE[primary]);
}

/**
 * The glyphs standing for what a fighter of `color` is given for free — exactly
 * {@link colorPassives}, told as pictures, in the same order.
 */
export function traitIcons(color: CombatColor): string[] {
	return colorPassives(color).map((order) => ORDER_ICONS[order]);
}
