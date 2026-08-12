/**
 * The whole authored narration as one CSV document, and back.
 *
 * The collection on disk is grouped — an event, and under it the ways of saying it — which
 * is the right shape for a program reading it and the wrong one for anybody editing the
 * lot at once. So the table is **normalized**: one row per line, and the grouping said in a
 * column of its own rather than by where the row sits. Every line of the game is then one
 * row of one table, sortable, filterable and diffable, and a translator or a proofreader
 * can be handed the file without being handed the JSON.
 *
 * It is a round trip and not a report, so the two directions are held to each other:
 * whatever {@link narrationToCsv} writes, {@link narrationFromCsv} reads back into the same
 * collection — commas, quotes and apostrophes included, which the CSV layer carries and
 * this one never has to think about.
 *
 * An import is a **replacement of the totality**, which is the other half of exporting the
 * totality: an event with no rows in the file is an event with no lines, not an event left
 * as it was. That is only safe if nothing is applied halfway, so a file with anything wrong
 * in it yields its problems and no collection — the same three refusals the API makes, made
 * here where the row number can be named.
 */

import {
	NARRATION_EVENTS,
	NARRATION_LINES_PER_EVENT,
	NARRATION_LINE_MAX_LENGTH,
	isNarrationEvent,
	unknownNarrationTokens,
	type CombatNarrationCollection,
	type CombatNarrationEvent
} from '../../types/combat-narration.type';
import { parseCsv, toCsv } from './csv';

/** The columns, in the order they are written. The event first, because that is what the
 * table is read down. */
export const NARRATION_CSV_HEADER = ['event', 'line'] as const;

/** What the export is offered to the author as. */
export const NARRATION_CSV_FILENAME = 'combat-narration.csv';

/** Something wrong with one row, named by where it is so it can be gone and fixed. */
export interface NarrationCsvProblem {
	/**
	 * Which record it was, counting the header as row 1 — a *record*, not a file line,
	 * since a quoted field may hold newlines of its own and the two stop agreeing the
	 * moment one does.
	 */
	row: number;
	message: string;
}

/** What a CSV was read as: the collection it describes, or the reasons it describes none. */
export interface NarrationCsvRead {
	/** Null when anything at all was wrong — an import is all or nothing. */
	collection: CombatNarrationCollection | null;
	problems: NarrationCsvProblem[];
	/** How many lines were read, whether or not the read stands. */
	lines: number;
	/** How many events those lines are spread over. */
	events: number;
}

/**
 * The collection as a table: header, then one row per line, the events in the catalogue's
 * own order and each event's lines in the order they were authored.
 *
 * The catalogue's order rather than the file's, for the same reason the API writes the JSON
 * that way — the events are listed in the order a turn reaches them, and a document people
 * read should not be in the order it happened to be edited in.
 */
export function narrationToCsv(collection: CombatNarrationCollection): string {
	const rows: string[][] = [[...NARRATION_CSV_HEADER]];
	for (const event of NARRATION_EVENTS) {
		for (const line of collection.lines[event.id] ?? []) rows.push([event.id, line]);
	}
	return toCsv(rows);
}

/**
 * Where the two columns are, from a header row — or null when the first record is not a
 * header at all, in which case it is data and the columns are where they are written.
 *
 * A header is matched by name rather than by position so a file that came back from a
 * spreadsheet with its columns swapped, or with a third column somebody added to make notes
 * in, still reads. An extra column is ignored rather than refused: it costs nothing here and
 * a note beside a line is a reasonable thing for an author to want.
 */
function headerColumns(record: readonly string[]): { event: number; line: number } | null {
	const names = record.map((field) => field.trim().toLowerCase());
	const event = names.indexOf('event');
	const line = names.indexOf('line');
	return event === -1 || line === -1 ? null : { event, line };
}

/**
 * A CSV document read back into a collection.
 *
 * Every refusal the API would make is made here first, so an import cannot be half-applied
 * by a server that took the first six events and threw out the seventh. They are the same
 * three: an event the fight never announces, a `{placeholder}` that event cannot fill, and
 * a line too long to read in the middle of a turn — plus the cap on how many ways of saying
 * one thing may be authored, which a file can reach where a screen cannot.
 */
export function narrationFromCsv(text: string): NarrationCsvRead {
	const records = parseCsv(text);
	const problems: NarrationCsvProblem[] = [];
	const lines: Partial<Record<CombatNarrationEvent, string[]>> = {};
	let count = 0;

	// The header, when there is one. Without it the first record is data, read as the
	// columns this writes.
	const columns = records.length > 0 ? headerColumns(records[0]) : null;
	const body = columns ? records.slice(1) : records;
	const offset = columns ? 2 : 1;
	const at = columns ?? { event: 0, line: 1 };

	body.forEach((record, index) => {
		const row = index + offset;
		const event = (record[at.event] ?? '').trim();
		const line = (record[at.line] ?? '').trim();

		// A wholly empty record is the blank line between blocks, or the one a spreadsheet
		// leaves at the foot of a file. Nothing was meant by it.
		if (!event && !line) return;

		if (!isNarrationEvent(event)) {
			problems.push({ row, message: `Unknown event "${event || '(blank)'}"` });
			return;
		}
		if (!line) {
			problems.push({ row, message: `"${event}" has no line — remove the row or write one` });
			return;
		}
		if (line.length > NARRATION_LINE_MAX_LENGTH) {
			problems.push({
				row,
				message: `${line.length}/${NARRATION_LINE_MAX_LENGTH} characters`
			});
			return;
		}
		const unknown = unknownNarrationTokens(event, line);
		if (unknown.length > 0) {
			problems.push({
				row,
				message: `"${event}" cannot fill ${unknown.map((token) => `{${token}}`).join(', ')}`
			});
			return;
		}
		const authored = lines[event] ?? (lines[event] = []);
		if (authored.length >= NARRATION_LINES_PER_EVENT) {
			problems.push({
				row,
				message: `"${event}" already holds ${NARRATION_LINES_PER_EVENT} lines, which is the most it may`
			});
			return;
		}
		authored.push(line);
		count++;
	});

	return {
		collection: problems.length > 0 ? null : { lines },
		problems,
		lines: count,
		events: Object.keys(lines).length
	};
}
