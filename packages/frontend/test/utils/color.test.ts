import { describe, it, expect } from 'vitest';
import {
	canFieldFullTeam,
	isPrimaryColor,
	isTeammateColor,
	relatedColors,
	teammateColors
} from '$utils/color/compare';
import { colorPassives, traitIcons, ORDER_ICONS } from '$utils/color/traits';
import type { CombatColor } from '$types/character-definition.type';

const ALL: CombatColor[] = ['red', 'yellow', 'blue', 'purple', 'orange', 'green'];

describe('colour relation', () => {
	it('relatedColors yields a compound first, then its two components', () => {
		expect(relatedColors('purple')).toEqual(['purple', 'red', 'blue']);
		expect(relatedColors('orange')).toEqual(['orange', 'red', 'yellow']);
		expect(relatedColors('green')).toEqual(['green', 'blue', 'yellow']);
	});

	it('relatedColors of a primary yields it plus every compound that mixes it', () => {
		expect(relatedColors('red')).toEqual(['red', 'purple', 'orange']);
		expect(relatedColors('blue')).toEqual(['blue', 'purple', 'green']);
		expect(relatedColors('yellow')).toEqual(['yellow', 'orange', 'green']);
	});

	it('is reciprocal — relation never points only one way', () => {
		for (const a of ALL) {
			for (const b of relatedColors(a)) {
				expect(relatedColors(b)).toContain(a);
			}
		}
	});

	it('isPrimaryColor splits the six colors into their families', () => {
		expect(isPrimaryColor('red')).toBe(true);
		expect(isPrimaryColor('blue')).toBe(true);
		expect(isPrimaryColor('yellow')).toBe(true);
		expect(isPrimaryColor('purple')).toBe(false);
		expect(isPrimaryColor('orange')).toBe(false);
		expect(isPrimaryColor('green')).toBe(false);
	});

	it('teammateColors: a primary lead allows itself plus every compound containing it', () => {
		expect(teammateColors('red')).toEqual(['red', 'purple', 'orange']);
		expect(teammateColors('blue')).toEqual(['blue', 'purple', 'green']);
		expect(teammateColors('yellow')).toEqual(['yellow', 'orange', 'green']);
	});

	it('teammateColors: a compound lead allows itself plus its two component primaries', () => {
		expect(teammateColors('purple')).toEqual(['purple', 'red', 'blue']);
		expect(teammateColors('orange')).toEqual(['orange', 'red', 'yellow']);
		expect(teammateColors('green')).toEqual(['green', 'blue', 'yellow']);
	});

	it('isTeammateColor allows the shared-colour cases and rejects the rest', () => {
		// A blue lead: blue itself, plus purple and green (the compounds with blue).
		expect(isTeammateColor('blue', 'blue')).toBe(true);
		expect(isTeammateColor('blue', 'purple')).toBe(true);
		expect(isTeammateColor('blue', 'green')).toBe(true);
		expect(isTeammateColor('blue', 'red')).toBe(false);
		expect(isTeammateColor('blue', 'orange')).toBe(false);

		// An orange lead: orange itself, plus its makers red and yellow.
		expect(isTeammateColor('orange', 'orange')).toBe(true);
		expect(isTeammateColor('orange', 'red')).toBe(true);
		expect(isTeammateColor('orange', 'yellow')).toBe(true);
		expect(isTeammateColor('orange', 'blue')).toBe(false);
		expect(isTeammateColor('orange', 'green')).toBe(false);
	});
});

describe('whether a full side can be fielded at all', () => {
	// What holds a player on the roster asks this of everything they own (see
	// $services/roster's teamUnfinished), so the cases that matter are the ones where
	// holding enough cards is not the same as being able to field them.
	it('says no while there are simply not enough cards', () => {
		expect(canFieldFullTeam([], 3)).toBe(false);
		expect(canFieldFullTeam(['red'], 3)).toBe(false);
		expect(canFieldFullTeam(['red', 'red'], 3)).toBe(false);
	});

	it('says yes to three of one colour, a lead being one of its own teammates', () => {
		expect(canFieldFullTeam(['red', 'red', 'red'], 3)).toBe(true);
	});

	it('says no to three cards in colours that cannot stand together', () => {
		// The three primaries: none of them is a teammate of either other, so whichever
		// leads stands alone. Three cards, and no team.
		expect(canFieldFullTeam(['red', 'blue', 'yellow'], 3)).toBe(false);
		// Same for the three compounds.
		expect(canFieldFullTeam(['purple', 'orange', 'green'], 3)).toBe(false);
	});

	it('finds the lead that works even where another would not', () => {
		// Nothing follows green here — but purple leads red and blue, so this is a side.
		expect(canFieldFullTeam(['green', 'purple', 'red', 'blue'], 3)).toBe(true);
		// A red lead takes purple and orange; the green is simply left out.
		expect(canFieldFullTeam(['red', 'purple', 'orange', 'green'], 3)).toBe(true);
	});

	it('counts the lead itself once and no more', () => {
		// One purple and one red: two cards a purple lead admits, which is a side of two.
		expect(canFieldFullTeam(['purple', 'red'], 3)).toBe(false);
		expect(canFieldFullTeam(['purple', 'red'], 2)).toBe(true);
	});

	it('is untroubled by a side of none', () => {
		expect(canFieldFullTeam([], 0)).toBe(true);
	});
});

describe('the free orders a colour grants', () => {
	it('gives each primary exactly the one order it stands for', () => {
		expect(colorPassives('red')).toEqual(['shoot']);
		expect(colorPassives('yellow')).toEqual(['charge']);
		expect(colorPassives('blue')).toEqual(['defend']);
	});

	it('gives a compound both of the primaries it mixes, and only those', () => {
		// purple = red + blue: the free shot and the free guard, but no free charge.
		expect(colorPassives('purple')).toEqual(['shoot', 'defend']);
		// orange = red + yellow.
		expect(colorPassives('orange')).toEqual(['shoot', 'charge']);
		// green = blue + yellow.
		expect(colorPassives('green')).toEqual(['defend', 'charge']);
	});

	it('never grants all three — every colour gives something up', () => {
		for (const color of ALL) {
			const passives = colorPassives(color);
			expect(passives).toHaveLength(isPrimaryColor(color) ? 1 : 2);
			// And never the same gift twice: two of one order would be one gift.
			expect(new Set(passives).size).toBe(passives.length);
		}
	});

	it('makes a compound the exact union of its two components', () => {
		const union = (a: CombatColor, b: CombatColor) =>
			[...colorPassives(a), ...colorPassives(b)];
		expect(colorPassives('purple')).toEqual(union('red', 'blue'));
		expect(colorPassives('orange')).toEqual(union('red', 'yellow'));
		expect(colorPassives('green')).toEqual(union('blue', 'yellow'));
	});
});

describe('trait icons', () => {
	it('gives each primary the glyph of the order it is granted', () => {
		expect(traitIcons('red')).toEqual([ORDER_ICONS.shoot]);
		expect(traitIcons('yellow')).toEqual([ORDER_ICONS.charge]);
		expect(traitIcons('blue')).toEqual([ORDER_ICONS.defend]);
	});

	it('gives a compound both of its components, in component order', () => {
		// The very same list as colorPassives, told as pictures.
		expect(traitIcons('green')).toEqual(
			colorPassives('green').map((order) => ORDER_ICONS[order])
		);
		expect(traitIcons('purple')).toEqual([ORDER_ICONS.shoot, ORDER_ICONS.defend]);
		expect(traitIcons('orange')).toEqual([ORDER_ICONS.shoot, ORDER_ICONS.charge]);
		expect(traitIcons('green')).toEqual([ORDER_ICONS.defend, ORDER_ICONS.charge]);
	});

	it('draws one glyph for a primary and two for a compound, never the same twice', () => {
		for (const color of ALL) {
			const icons = traitIcons(color);
			expect(icons).toHaveLength(isPrimaryColor(color) ? 1 : 2);
			expect(new Set(icons).size).toBe(icons.length);
		}
	});
});
