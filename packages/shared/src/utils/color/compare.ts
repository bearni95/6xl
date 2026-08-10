/**
 * The colour relation the game is built on. Pure functions — no side effects.
 *
 * Three primaries (red, yellow, blue) mix into three compounds (orange, purple,
 * green), and two colours are *related* when one contains the other: a compound is
 * related to each primary it mixes, and a primary to each compound that mixes it.
 *
 * That single relation does two jobs. It decides who may stand beside whom on a
 * team ({@link teammateColors}: every member shares a colour with the lead), and it
 * decides what a card's colour makes it good at in combat — see
 * {@link file://./traits.ts}, where a compound simply inherits the traits of the two
 * primaries it is made of.
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
 * {@link relatedColors} under the name the roster uses it by.
 */
export function teammateColors(lead: CombatColor): CombatColor[] {
	return relatedColors(lead);
}

/** Whether `color` is allowed on a team led by `lead` (see {@link teammateColors}). */
export function isTeammateColor(lead: CombatColor, color: CombatColor): boolean {
	return teammateColors(lead).includes(color);
}

/**
 * Whether a full side of `size` could be fielded from cards carrying `colors` — asked of
 * the whole of what a player holds, whoever is leading at the moment.
 *
 * Holding `size` cards is not the same as being able to field them: every member shares a
 * colour with the lead, so three cards in three unrelated colours are three cards and no
 * team. The question is therefore asked lead-first — is there a colour among these that
 * enough of the rest could stand behind? — and a lead's own colour counts among them, since
 * {@link teammateColors} includes it.
 *
 * It says nothing about the line-up *currently* fielded: a player led by a colour the rest
 * of their cards cannot follow still answers true here, because taking that lead off is a
 * move they can make. What this answers is whether finishing the team is up to the player
 * at all, which is what anything holding them to it has to know first.
 */
export function canFieldFullTeam(colors: CombatColor[], size: number): boolean {
	if (size <= 0) return true;
	if (colors.length < size) return false;
	const held = new Map<CombatColor, number>();
	for (const color of colors) held.set(color, (held.get(color) ?? 0) + 1);
	for (const lead of held.keys()) {
		const allowed = teammateColors(lead);
		let behind = 0;
		for (const [color, count] of held) if (allowed.includes(color)) behind += count;
		if (behind >= size) return true;
	}
	return false;
}
