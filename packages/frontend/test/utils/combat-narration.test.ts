import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	NARRATION_EVENTS,
	NARRATION_LINE_MAX_LENGTH,
	fillNarration,
	isNarrationEvent,
	narrationPlaceholders,
	narrationTokens,
	pickNarrationLine,
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

const collection = JSON.parse(
	readFileSync(NARRATION_JSON, 'utf-8')
) as CombatNarrationCollection;

describe('narration lines', () => {
	it('writes the names it is handed into the sentence', () => {
		expect(fillNarration('{attacker} va a per {target}.', { attacker: 'Goku', target: 'Bulma' })).toBe(
			'Goku va a per Bulma.'
		);
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
		expect(unknownNarrationTokens('orders', 'Torn {turn}.')).toEqual([]);
		expect(unknownNarrationTokens('orders', 'Torn {turn}, {attacker} obre.')).toEqual(['attacker']);
	});

	it('knows which events the fight can announce', () => {
		expect(isNarrationEvent('hit')).toBe(true);
		expect(isNarrationEvent('nothing-like-this')).toBe(false);
		expect(narrationPlaceholders('ground')).toEqual(['winner', 'loser']);
		expect(narrationPlaceholders('nothing-like-this')).toEqual([]);
	});
});

describe('picking the line for a cue', () => {
	const lines: CombatNarrationCollection = { lines: { hit: ['un: {target}', 'dos: {target}'] } };

	it('says the same thing for the same cue, however often it is asked', () => {
		// The words hold still for as long as the cue does: a line re-rolled on every render
		// would flicker through the variants while the blow was still being thrown.
		const cue = { event: 'hit', values: { attacker: 'Goku', target: 'Bulma' }, seq: 4 } as const;
		const first = pickNarrationLine(lines, cue);
		expect(first).toBe(pickNarrationLine(lines, cue));
		expect(first).toContain('Bulma');
	});

	it('does not say the same thing for every cue', () => {
		const said = new Set(
			Array.from({ length: 20 }, (_, seq) =>
				pickNarrationLine(lines, { event: 'hit', values: { target: 'Bulma' }, seq })
			)
		);
		expect(said.size).toBeGreaterThan(1);
	});

	it('stays quiet rather than guessing when nothing is authored', () => {
		expect(pickNarrationLine({ lines: {} }, { event: 'hit', values: {}, seq: 1 })).toBeNull();
		expect(pickNarrationLine(null, { event: 'hit', values: {}, seq: 1 })).toBeNull();
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
		// collection that had gone quiet about a whole beat of the fight is worth knowing.
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
