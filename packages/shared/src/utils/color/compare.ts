/**
 * The colour relation the game is built on. Pure functions — no side effects.
 *
 * Three primaries (red, yellow, blue) mix into three compounds (orange, purple,
 * green), and two colours are *related* when one contains the other: a compound is
 * related to each primary it mixes, and a primary to each compound that mixes it.
 *
 * That single relation does two jobs. It decides what a card's colour makes it good
 * at in combat — see {@link file://./traits.ts}, where a compound simply inherits the
 * traits of the two primaries it is made of — and it is what a *seeded* side is drawn
 * to ({@link teammateColors}: a town's garrison shares a colour with its lead, see
 * utils/spawn/municipality-team.ts). It binds nothing a player builds: a side of theirs
 * is any three of their own cards, in any colours.
 */
import {
	COMPOUND_COLORS,
	COMPOUND_COMPONENTS,
	type CombatColor,
	type PrimaryColor
} from '../../types/character-definition.type';

const PRIMARIES: PrimaryColor[] = ['red', 'blue', 'yellow'];

export function isPrimaryColor(color: CombatColor): color is PrimaryColor {
	return PRIMARIES.includes(color as PrimaryColor);
}

/**
 * The colours related to `color`. A compound yields itself plus its two component
 * primaries (in display order); a primary yields itself plus every compound that
 * mixes it (in display order) — the reciprocal of the compound case.
 */
export function relatedColors(color: CombatColor): CombatColor[] {
	if (!isPrimaryColor(color)) return [color, ...COMPOUND_COMPONENTS[color]];
	const compounds = COMPOUND_COLORS.filter((compound) =>
		COMPOUND_COMPONENTS[compound].includes(color)
	);
	return [color, ...compounds];
}

/**
 * The colours a teammate may carry given the team leader's `lead` colour: the
 * lead's own colour, plus — for a primary lead — every compound that contains it,
 * or — for a compound lead — the two primaries that make it. Just
 * {@link relatedColors} under the name the seeded line-ups use it by.
 */
export function teammateColors(lead: CombatColor): CombatColor[] {
	return relatedColors(lead);
}

/** Whether `color` may stand behind a seeded lead of `lead` (see {@link teammateColors}). */
export function isTeammateColor(lead: CombatColor, color: CombatColor): boolean {
	return teammateColors(lead).includes(color);
}
