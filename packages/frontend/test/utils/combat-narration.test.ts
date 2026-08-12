import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	NARRATION_EVENTS,
	NARRATION_LINE_MAX_LENGTH,
	fillNarration,
	isNarrationEvent,
	narrationPlaceholders,
	narrationSegments,
	narrationTokens,
	pickNarrationLine,
	pickNarrationSegments,
	unknownNarrationTokens,
	type CombatNarrationCollection
} from '$types/combat-narration.type';

/**
 * The contract between a fight and the words said over it: the fight names an event and
 * the fighters it happened to, and the sentence is looked up against authored lines.
 *
 * The failure worth a test is a line with a hole in it — a `{target}` in an event that
 * never carries one, reaching the screen mid-fight — so both ends are held: the check
 * that catches it where the line is written, and the checked-in collection itself.
 */

// The collection the admin /narration screen writes and the app serves at
// /data/combat-narration.json.
const NARRATION_JSON = join(__dirname, '../../../data/public/combat-narration.json');

const collection = JSON.parse(readFileSync(NARRATION_JSON, 'utf-8')) as CombatNarrationCollection;

describe('narration lines', () => {
	it('writes the names it is handed into the sentence', () => {
		expect(
			fillNarration('{attacker} va a per {target}.', { attacker: 'Goku', target: 'Bulma' })
		).toBe('Goku va a per Bulma.');
	});

	it('leaves a token nothing was handed for standing, rather than blanking it', () => {
		// An empty gap reads as a bug in the game; `{target}` on screen reads as a bug in the
		// line — which is the one of the two somebody can go and fix.
		expect(fillNarration('{attacker} va a per {target}.', { attacker: 'Goku' })).toBe(
			'Goku va a per {target}.'
		);
	});

	it('reads every distinct token a line asks for', () => {
		expect(narrationTokens('{winner} i {winner} contra {loser}')).toEqual(['winner', 'loser']);
	});

	it('names the tokens an event cannot fill', () => {
		expect(unknownNarrationTokens('hit', '{attacker} tomba {target}.')).toEqual([]);
		expect(unknownNarrationTokens('hit', 'Torn {turn}: {attacker} tomba {target}.')).toEqual([
			'turn'
		]);
	});

	it('knows which encounters the fight can announce', () => {
		expect(isNarrationEvent('hit')).toBe(true);
		// The beats *within* a row are not announced — a row is one event, so the one
		// sentence about it is said when the blow settles it.
		expect(isNarrationEvent('advance')).toBe(false);
		expect(isNarrationEvent('ground')).toBe(false);
		expect(isNarrationEvent('nothing-like-this')).toBe(false);
		// Two names, because an encounter is two fighters.
		expect(narrationPlaceholders('hit')).toEqual(['attacker', 'target']);
		expect(narrationPlaceholders('nothing-like-this')).toEqual([]);
	});
});

describe('cutting a line into its runs', () => {
	it('marks the names, and carries the colour each fighter fights in', () => {
		expect(
			narrationSegments(
				'{attacker} va a per {target}.',
				{ attacker: 'Goku', target: 'Bulma' },
				{ attacker: 'orange', target: 'blue' }
			)
		).toEqual([
			{ text: 'Goku', name: 'attacker', color: 'orange' },
			{ text: ' va a per ' },
			{ text: 'Bulma', name: 'target', color: 'blue' },
			{ text: '.' }
		]);
	});

	it('carries the order each fighter made, for the mark drawn beside its name', () => {
		// The words say how the row went; the marks say what the two of them did to make it go
		// that way, which a line about a blow turned aside never states.
		expect(
			narrationSegments(
				'{attacker} no passa de {target}.',
				{ attacker: 'Goku', target: 'Bulma' },
				{},
				{ attacker: 'shoot', target: 'defend' }
			)
		).toEqual([
			{ text: 'Goku', name: 'attacker', color: undefined, move: 'shoot' },
			{ text: ' no passa de ' },
			{ text: 'Bulma', name: 'target', color: undefined, move: 'defend' },
			{ text: '.' }
		]);
	});

	it('is the filled sentence, read run by run', () => {
		// Everything that only wants the words goes on using `fillNarration`, so the two must
		// never be able to say different things about one line.
		const values = { attacker: 'Goku', target: 'Bulma' };
		for (const line of ['{attacker} tomba {target}', 'Res: {attacker}{target}!', 'sense noms']) {
			expect(
				narrationSegments(line, values)
					.map((segment) => segment.text)
					.join('')
			).toBe(fillNarration(line, values));
		}
	});

	it('leaves a token nothing was handed for standing, and does not dress it as a name', () => {
		// It is a bug in the line, and a `{target}` lettered in somebody's colour would read
		// as a fighter called that.
		expect(narrationSegments('{attacker} va a per {target}.', { attacker: 'Goku' })).toEqual([
			{ text: 'Goku', name: 'attacker', color: undefined },
			{ text: ' va a per {target}.' }
		]);
	});

	it('deals the same words to a cue whether they are asked for whole or in runs', () => {
		const cue = {
			event: 'hit',
			values: { attacker: 'Goku', target: 'Bulma' },
			colors: { attacker: 'green' },
			moves: { attacker: 'shoot' },
			seq: 2,
			fight: 'p0|r0'
		} as const;
		const collection: CombatNarrationCollection = {
			lines: { hit: ['{attacker} tomba {target}', '{target} cau davant {attacker}'] }
		};
		const segments = pickNarrationSegments(collection, cue);
		expect(segments?.map((segment) => segment.text).join('')).toBe(
			pickNarrationLine(collection, cue)
		);
		expect(segments?.find((segment) => segment.name === 'attacker')?.color).toBe('green');
		expect(segments?.find((segment) => segment.name === 'attacker')?.move).toBe('shoot');
		// And it stays quiet in exactly the same places.
		expect(pickNarrationSegments({ lines: {} }, cue)).toBeNull();
		expect(pickNarrationSegments(collection, null)).toBeNull();
	});
});

describe('dealing the line for a cue', () => {
	const lines: CombatNarrationCollection = { lines: { hit: ['un: {target}', 'dos: {target}'] } };
	const five: CombatNarrationCollection = {
		lines: { hit: ['un', 'dos', 'tres', 'quatre', 'cinc'] }
	};

	/** What a fight says about `count` consecutive cues of the same event. */
	const run = (
		collection: CombatNarrationCollection,
		fight: string,
		count: number
	): (string | null)[] =>
		Array.from({ length: count }, (_, index) =>
			pickNarrationLine(collection, { event: 'hit', values: {}, seq: index + 1, fight })
		);

	it('says the same thing for the same cue, however often it is asked', () => {
		// The words hold still for as long as the cue does: a line re-rolled on every render
		// would flicker through the variants while the blow was still being thrown.
		const cue = {
			event: 'hit',
			values: { attacker: 'Goku', target: 'Bulma' },
			seq: 4,
			fight: 'p0|r0'
		} as const;
		const first = pickNarrationLine(lines, cue);
		expect(first).toBe(pickNarrationLine(lines, cue));
		expect(first).toContain('Bulma');
	});

	it('says every authored line once before it says any of them twice', () => {
		// The point of the whole thing: a fight with five ways to describe a blow uses all
		// five before the first is heard again, rather than rolling one at random each time.
		const round = run(five, 'p0|r0', 5);
		expect(new Set(round).size).toBe(5);
		// And the round after it is the same five, in some other order.
		const next = run(five, 'p0|r0', 10).slice(5);
		expect(new Set(next).size).toBe(5);
	});

	it('never says the same thing twice running, not even across the shuffle', () => {
		for (const collection of [lines, five]) {
			const said = run(collection, 'p0|r0', 24);
			for (let index = 1; index < said.length; index++) {
				expect(said[index]).not.toBe(said[index - 1]);
			}
		}
	});

	it('deals a different order to a different fight', () => {
		// Otherwise every battle in the game would open on the same sentence.
		expect(run(five, 'p0|r0', 5)).not.toEqual(run(five, 'p1|r7', 5));
	});

	it('stays quiet rather than guessing when nothing is authored', () => {
		const cue = { event: 'hit', values: {}, seq: 1, fight: 'p0|r0' } as const;
		expect(pickNarrationLine({ lines: {} }, cue)).toBeNull();
		expect(pickNarrationLine(null, cue)).toBeNull();
		expect(pickNarrationLine(lines, null)).toBeNull();
	});
});

describe('the checked-in collection', () => {
	it('only speaks of events the fight actually announces', () => {
		const known = NARRATION_EVENTS.map((event) => event.id);
		for (const event of Object.keys(collection.lines)) {
			expect(known).toContain(event);
		}
	});

	it('has something to say about every one of them', () => {
		// Not a rule of the format — an event may be authored silent — but a shipped
		// collection with an encounter it says nothing about is worth knowing: that row
		// would play out under whatever the last one left on screen.
		for (const event of NARRATION_EVENTS) {
			expect(collection.lines[event.id]?.length ?? 0).toBeGreaterThan(0);
		}
	});

	it('never names something the moment it describes cannot fill', () => {
		for (const [event, lines] of Object.entries(collection.lines)) {
			for (const line of lines ?? []) {
				expect({ event, line, unknown: unknownNarrationTokens(event, line) }).toEqual({
					event,
					line,
					unknown: []
				});
				expect(line.length).toBeLessThanOrEqual(NARRATION_LINE_MAX_LENGTH);
			}
		}
	});
});
