import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	NARRATION_LINES_PER_EVENT,
	NARRATION_LINE_MAX_LENGTH,
	type CombatNarrationCollection
} from '$types/combat-narration.type';
import { narrationFromCsv, narrationToCsv } from '$utils/csv/narration-csv';
import { parseCsv } from '$utils/csv/csv';

/**
 * The narration as a table, out and back. What is worth holding is the round trip: the
 * checked-in collection is Catalan prose full of commas, apostrophes, em dashes and a
 * middle dot, and every one of them has to come back the character it went out as — a
 * sentence quietly cut at its first comma would reach a player mid-fight.
 *
 * The other half is the refusal. An import replaces the whole collection, so a file with
 * one bad row has to stage nothing at all rather than most of it.
 */

const NARRATION_JSON = join(__dirname, '../../../data/public/combat-narration.json');
const authored = JSON.parse(readFileSync(NARRATION_JSON, 'utf-8')) as CombatNarrationCollection;

describe('narration csv', () => {
	it('writes a header and one row per line', () => {
		const rows = parseCsv(
			narrationToCsv({ lines: { hit: ['{attacker} guanya.', 'Cau {target}.'] } })
		);
		expect(rows).toEqual([
			['event', 'line'],
			['hit', '{attacker} guanya.'],
			['hit', 'Cau {target}.']
		]);
	});

	it('names the event on every row, so the grouping survives an ungrouped file', () => {
		const rows = parseCsv(narrationToCsv(authored)).slice(1);
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.every((row) => row[0] !== '' && row[1] !== '')).toBe(true);
	});

	it('round-trips the checked-in collection unchanged', () => {
		const read = narrationFromCsv(narrationToCsv(authored));
		expect(read.problems).toEqual([]);
		expect(read.collection).toEqual(authored);
	});

	it('carries a comma, a quote and a newline through a line', () => {
		const collection: CombatNarrationCollection = {
			lines: { hit: ['{attacker} diu "prou", i {target} cau.', 'dues\nratlles'] }
		};
		expect(narrationFromCsv(narrationToCsv(collection)).collection).toEqual(collection);
	});

	it('reads a file with no header at all as data', () => {
		const read = narrationFromCsv('hit,{attacker} guanya.\r\n');
		expect(read.collection).toEqual({ lines: { hit: ['{attacker} guanya.'] } });
	});

	it('follows the header when the columns are the other way round', () => {
		const read = narrationFromCsv('line,event\r\n"{attacker} guanya.",hit\r\n');
		expect(read.collection).toEqual({ lines: { hit: ['{attacker} guanya.'] } });
	});

	it('ignores a column somebody added to make notes in', () => {
		const read = narrationFromCsv('event,line,note\r\nhit,"{attacker} guanya.",revisar\r\n');
		expect(read.collection).toEqual({ lines: { hit: ['{attacker} guanya.'] } });
	});

	it('skips the blank record a spreadsheet leaves at the foot of a file', () => {
		const read = narrationFromCsv('event,line\r\nhit,{attacker} guanya.\r\n\r\n');
		expect(read.problems).toEqual([]);
		expect(read.lines).toBe(1);
	});

	it('empties an event the file does not name, an import being a replacement', () => {
		const read = narrationFromCsv('event,line\r\nhit,{attacker} guanya.\r\n');
		expect(read.collection?.lines.blocked).toBeUndefined();
	});

	it('stages nothing when one row is wrong, naming the row it was', () => {
		const read = narrationFromCsv(
			'event,line\r\nhit,{attacker} guanya.\r\nbelieved,{attacker} guanya.\r\n'
		);
		expect(read.collection).toBeNull();
		expect(read.problems).toEqual([{ row: 3, message: 'Unknown event "believed"' }]);
	});

	it('refuses a line naming something its event cannot fill', () => {
		const read = narrationFromCsv('event,line\r\nbothLoad,{attacker} carrega.\r\n');
		expect(read.collection).toBeNull();
		expect(read.problems[0].message).toContain('{attacker}');
	});

	it('refuses a line too long to read in the middle of a turn', () => {
		const long = 'a'.repeat(NARRATION_LINE_MAX_LENGTH + 1);
		const read = narrationFromCsv(`event,line\r\nhit,${long}\r\n`);
		expect(read.collection).toBeNull();
		expect(read.problems[0].message).toBe(`${long.length}/${NARRATION_LINE_MAX_LENGTH} characters`);
	});

	it('refuses more ways of saying one thing than may be authored', () => {
		const rows = Array.from(
			{ length: NARRATION_LINES_PER_EVENT + 1 },
			(_, index) => `hit,{attacker} guanya ${index}.`
		).join('\r\n');
		const read = narrationFromCsv(`event,line\r\n${rows}\r\n`);
		expect(read.collection).toBeNull();
		expect(read.problems[0].row).toBe(NARRATION_LINES_PER_EVENT + 2);
	});

	it('refuses a row that names an event and no line', () => {
		const read = narrationFromCsv('event,line\r\nhit,\r\n');
		expect(read.collection).toBeNull();
		expect(read.problems[0].row).toBe(2);
	});
});
